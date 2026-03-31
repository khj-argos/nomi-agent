"use client";

import { useEffect, useState } from "react";
import { Bot, CheckCircle, MessageCircle, Plus, Settings, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";

type InstanceStatus = "running" | "stopped" | "starting";

interface Instance {
  id: string;
  status: InstanceStatus;
  lastActive: string;
  agentName: string;
  channels: {
    telegram: boolean;
  };
}

export default function DashboardPage() {
  const [instance, setInstance] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  async function fetchInstance() {
    try {
      const res = await fetch("/api/instances");
      if (!res.ok) throw new Error("인스턴스 정보를 불러오는데 실패했습니다.");
      const data = await res.json() as { instance: Instance | null };
      setInstance(data.instance);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInstance(); }, []);

  async function handleRestart() {
    setRestarting(true);
    try {
      const res = await fetch("/api/instances/restart", { method: "POST" });
      if (!res.ok) throw new Error("재시작 요청에 실패했습니다.");
      await fetchInstance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "재시작 중 오류가 발생했습니다.");
    } finally {
      setRestarting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-zinc-200 rounded-lg"></div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="h-48 bg-zinc-200 rounded-2xl"></div>
          <div className="h-48 bg-zinc-200 rounded-2xl"></div>
          <div className="h-48 bg-zinc-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-100">
        <h3 className="font-semibold mb-2">오류 발생</h3>
        <p>{error}</p>
      </div>
    );
  }

  const statusConfig = {
    running: {
      color: "bg-emerald-500",
      text: "온라인",
      icon: Wifi,
    },
    stopped: {
      color: "bg-zinc-400",
      text: "오프라인",
      icon: WifiOff,
    },
    starting: {
      color: "bg-blue-500 animate-pulse",
      text: "시작 중...",
      icon: Wifi,
    },
  };

  const currentStatus = instance ? statusConfig[instance.status] : statusConfig.stopped;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">대시보드</h1>
        <p className="text-zinc-500 mt-2">나만의 AI 에이전트 상태를 확인하고 관리하세요.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Bot className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">내 AI 상태</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-4 h-4">
                  {instance?.status === "running" && (
                    <span className="absolute w-full h-full rounded-full bg-emerald-400 opacity-20 animate-ping"></span>
                  )}
                  <span className={`w-2.5 h-2.5 rounded-full ${currentStatus.color}`}></span>
                </div>
                <span className="font-medium text-zinc-900">{currentStatus.text}</span>
              </div>
              <span className="text-sm text-zinc-500">
                마지막 활동: {instance?.lastActive || "기록 없음"}
              </span>
            </div>

            <div className="flex gap-3 pt-4 border-t border-zinc-100">
              <button
                onClick={handleRestart}
                disabled={restarting}
                className="flex-1 gradient-bg text-white font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {restarting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                재시작
              </button>
              <Link
                href="/dashboard/settings"
                className="flex-1 bg-zinc-100 text-zinc-900 font-medium py-2.5 rounded-xl hover:bg-zinc-200 transition-colors text-center"
              >
                설정 변경
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">연결된 채널</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">TG</span>
                </div>
                <span className="font-medium text-zinc-900">Telegram</span>
              </div>
              {instance?.channels.telegram ? (
                <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  연결됨
                </div>
              ) : (
                <span className="text-sm text-zinc-500">미연결 상태</span>
              )}
            </div>

            <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-zinc-300 text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-400 transition-all">
              <Plus className="w-4 h-4" />
              <span className="font-medium">채널 추가</span>
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm md:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Settings className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-900">에이전트 정보</h2>
            </div>
            <Link
              href="/dashboard/settings"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              설정 편집
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-zinc-500 mb-1">이름</p>
              <p className="font-medium text-zinc-900 text-lg">{instance?.agentName || "이름 없음"}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500 mb-1">인스턴스 ID</p>
              <p className="font-mono text-sm text-zinc-700 bg-zinc-100 px-3 py-1.5 rounded-lg inline-block">
                {instance?.id || "발급 대기 중"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
