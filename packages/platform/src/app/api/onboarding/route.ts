import { createServerSideClient } from "@/lib/supabase-server";
import { orchestrator } from "@/lib/orchestrator";
import { NextResponse } from "next/server";

interface OnboardingPayload {
  assistantName: string;
  agentConfig: string;
  anthropicApiKey?: string;
  telegramBotToken?: string;
  telegramBotUsername?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as OnboardingPayload;

    const instance = await orchestrator.post<{ id: string }>("/instances", {
      assistantName: body.assistantName,
      agentConfig: body.agentConfig,
      anthropicApiKey: body.anthropicApiKey,
    });

    if (body.telegramBotToken && body.telegramBotUsername) {
      await orchestrator.post("/channels/telegram", {
        botToken: body.telegramBotToken,
        botUsername: body.telegramBotUsername,
      }).catch(() => {});
    }

    await supabase
      .from("onboarding_progress")
      .upsert({ user_id: user.id, current_step: 4, completed_at: new Date().toISOString() });

    return NextResponse.json({ success: true, instanceId: instance.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "온보딩 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
