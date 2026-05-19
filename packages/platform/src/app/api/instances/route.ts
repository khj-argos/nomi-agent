import { createServerSideClient } from "@/lib/supabase-server";
import { orchestrator } from "@/lib/orchestrator";
import { NextResponse } from "next/server";

interface UsageSnapshot {
  used: number;
  limit: number;
  remaining: number;
  withinBudget: boolean;
}

export async function GET() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: instance } = await supabase
      .from("active_user_instances")
      .select("instance_id, status, assistant_name, last_activity, container_id, active_llm")
      .eq("user_id", user.id)
      .single();

    if (!instance) {
      return NextResponse.json({ instance: null });
    }

    const { data: channels } = await supabase
      .from("channels")
      .select("type, is_active, display_name")
      .eq("user_id", user.id)
      .eq("is_active", true);

    const lastActive = instance.last_activity
      ? formatRelativeTime(new Date(instance.last_activity))
      : "기록 없음";

    const usage = await orchestrator
      .get<UsageSnapshot>("/instances/me/usage")
      .catch(() => null);

    return NextResponse.json({
      instance: {
        id: instance.instance_id,
        status: instance.status as "running" | "stopped" | "starting",
        lastActive,
        agentName: instance.assistant_name,
        activeLlm: (instance.active_llm as "gemma_hosted" | "anthropic_byok" | null) ?? "gemma_hosted",
        usage,
        channels: {
          telegram: channels?.some((c) => c.type === "telegram") ?? false,
          slack: channels?.some((c) => c.type === "slack") ?? false,
        },
      },
    });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  return `${Math.floor(diffHr / 24)}일 전`;
}
