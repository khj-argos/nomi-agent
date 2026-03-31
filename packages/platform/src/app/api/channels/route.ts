import { createServerSideClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: channels } = await supabase
      .from("channels")
      .select("id, type, display_name, is_active, connected_at, last_message_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ channels: channels ?? [] });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
