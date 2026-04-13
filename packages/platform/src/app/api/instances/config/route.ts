import { createServerSideClient } from "@/lib/supabase-server";
import { orchestrator } from "@/lib/orchestrator";
import { NextResponse } from "next/server";

interface ConfigPayload {
  assistantName?: string;
  agentConfig?: string;
  anthropicApiKey?: string;
  hasApiKey?: boolean;
}

export async function GET() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await orchestrator.get<ConfigPayload>("/instances/me/config");
    return NextResponse.json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : "설정을 불러오는 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as ConfigPayload;
    await orchestrator.put("/instances/me/config", body);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "설정 저장 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
