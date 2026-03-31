import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

type LemonSqueezySubscriptionAttributes = {
  status: string;
  customer_id: number;
  variant_id: number;
  order_id: number;
  renews_at: string | null;
  ends_at: string | null;
  cancelled: boolean;
};

type LemonSqueezyEvent = {
  meta: {
    event_name: string;
    custom_data?: {
      user_id?: string;
    };
  };
  data: {
    id: string;
    attributes: LemonSqueezySubscriptionAttributes;
  };
};

function verifySignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
  if (!secret) throw new Error("LEMON_SQUEEZY_WEBHOOK_SECRET is not set");
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

async function upsertSubscription(
  userId: string,
  subscriptionId: string,
  attrs: LemonSqueezySubscriptionAttributes
) {
  const supabase = createServiceClient();
  const periodEnd = attrs.renews_at ?? attrs.ends_at;

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      ls_subscription_id: subscriptionId,
      ls_customer_id: String(attrs.customer_id),
      ls_variant_id: String(attrs.variant_id),
      ls_order_id: String(attrs.order_id),
      status: attrs.status,
      current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

async function updateStatus(userId: string, status: string) {
  const supabase = createServiceClient();
  await supabase
    .from("subscriptions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature");

  let isValid: boolean;
  try {
    isValid = verifySignature(rawBody, signature);
  } catch (err) {
    console.error("[Webhook] Signature verification error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }

  if (!isValid) {
    console.warn("[Webhook] Invalid signature");
    return new Response("Unauthorized", { status: 401 });
  }

  let event: LemonSqueezyEvent;
  try {
    event = JSON.parse(rawBody) as LemonSqueezyEvent;
  } catch {
    return new Response("Bad Request: invalid JSON", { status: 400 });
  }

  const { event_name: eventName } = event.meta;
  const userId = event.meta.custom_data?.user_id;
  const subscriptionId = event.data.id;
  const attrs = event.data.attributes;

  if (!userId) {
    console.warn(`[Webhook] ${eventName}: no user_id in custom_data`);
    return new Response("OK");
  }

  console.log(`[Webhook] ${eventName} for user ${userId}`);

  switch (eventName) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
    case "subscription_payment_success":
    case "subscription_payment_recovered":
      await upsertSubscription(userId, subscriptionId, attrs);
      break;

    case "subscription_cancelled":
      await upsertSubscription(userId, subscriptionId, attrs);
      await updateStatus(userId, "cancelled");
      break;

    case "subscription_expired":
      await updateStatus(userId, "expired");
      break;

    case "subscription_payment_failed":
      await updateStatus(userId, "past_due");
      break;

    default:
      console.log(`[Webhook] Unhandled event: ${eventName}`);
  }

  return new Response("OK", { status: 200 });
}
