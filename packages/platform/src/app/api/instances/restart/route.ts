import { createServerSideClient } from "@/lib/supabase-server";
import { orchestrator } from "@/lib/orchestrator";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await orchestrator.post("/instances/me/restart");
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "재시작 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
