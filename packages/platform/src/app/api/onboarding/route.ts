import { createServerSideClient } from "@/lib/supabase-server";
import { orchestrator } from "@/lib/orchestrator";
import { NextResponse } from "next/server";

interface OnboardingPayload {
  assistantName: string;
  agentConfig: string;
  anthropicApiKey?: string;
  telegramBotToken?: string;
  telegramBotUsername?: string;
  slackBotToken?: string;
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as OnboardingPayload;

    let instance: { id: string };
    try {
      instance = await orchestrator.post<{ id: string }>("/instances", {
        assistantName: body.assistantName,
        agentConfig: body.agentConfig,
        anthropicApiKey: body.anthropicApiKey,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.toLowerCase().includes("already exists") || msg.includes("409") || msg.includes("Conflict")) {
        const existing = await orchestrator.get<{ id: string }>("/instances/me").catch(() => ({ id: "existing" }));
        instance = existing;
      } else {
        throw err;
      }
    }

    if (body.telegramBotToken && body.telegramBotUsername) {
      await orchestrator.post("/channels/telegram", {
        botToken: body.telegramBotToken,
        botUsername: body.telegramBotUsername,
      }).catch(() => {});
    }

    if (body.slackBotToken) {
      await orchestrator.post("/channels/slack", {
        botToken: body.slackBotToken,
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
