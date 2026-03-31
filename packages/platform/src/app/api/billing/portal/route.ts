import { getSubscription } from "@lemonsqueezy/lemonsqueezy.js";
import { createAnonClient, createServiceClient } from "@/lib/supabase";
import { initLemonSqueezy } from "@/lib/lemonsqueezy";

initLemonSqueezy();

export async function GET(req: Request) {
  void req;

  const anonClient = createAnonClient();
  const {
    data: { user },
  } = await anonClient.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient();
  const { data: subscription } = await serviceClient
    .from("subscriptions")
    .select("ls_subscription_id")
    .eq("user_id", user.id)
    .single();

  if (!subscription?.ls_subscription_id) {
    return Response.json({ error: "No subscription found" }, { status: 404 });
  }

  const result = await getSubscription(subscription.ls_subscription_id);
  const portalUrl = result.data?.data.attributes.urls?.customer_portal;

  if (!portalUrl) {
    return Response.json({ error: "Failed to get portal URL" }, { status: 500 });
  }

  return Response.json({ portalUrl });
}
