import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { createAnonClient } from "@/lib/supabase";
import { initLemonSqueezy } from "@/lib/lemonsqueezy";

initLemonSqueezy();

export async function POST(req: Request) {
  const supabase = createAnonClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { variantId?: string };
  const variantId = body.variantId ?? process.env.LEMON_SQUEEZY_MONTHLY_VARIANT_ID;

  if (!variantId) {
    return Response.json({ error: "variantId is required" }, { status: 400 });
  }

  const storeId = process.env.LEMON_SQUEEZY_STORE_ID!;

  const checkout = await createCheckout(storeId, variantId, {
    checkoutOptions: { embed: false },
    checkoutData: {
      email: user.email,
      custom: { user_id: user.id },
    },
    productOptions: {
      redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });

  const url = checkout.data?.data.attributes.url;
  if (!url) {
    return Response.json({ error: "Failed to create checkout" }, { status: 500 });
  }

  return Response.json({ checkoutUrl: url });
}
