import { createServerSideClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ completed: false });
    }

    const { data } = await supabase
      .from("onboarding_progress")
      .select("completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ completed: !!data?.completed_at });
  } catch {
    return NextResponse.json({ completed: false });
  }
}
