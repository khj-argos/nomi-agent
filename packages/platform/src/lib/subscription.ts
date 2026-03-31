import { createServiceClient } from "@/lib/supabase";

export async function requireActiveSubscription(userId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .single();

  if (error || !data || data.status !== "active") {
    throw new Error("No active subscription");
  }
  return data;
}

export async function getSubscription(userId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .single();
  return data;
}
