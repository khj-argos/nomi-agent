"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Hash, Loader2, MessageCircle, Trash2, X } from "lucide-react";

interface Channel {
  id: string;
  type: "telegram" | "slack";
  display_name: string;
  is_active: boolean;
  connected_at: string;
  last_message_at: string | null;
}

type ModalType = "telegram" | "slack" | null;

const CHANNEL_META = {
  telegram: {
    label: "Telegram",
    badge: "TG",
    color: "bg-sky-500",
    bgLight: "bg-sky-50",
    textColor: "text-sky-600",
    tokenLabel: "봇 토큰",
    tokenPlaceholder: "1234567890:ABCdefGHIjklmNOPqrstuvWXYZ",
    guide: [
      "Telegram에서 @BotFather 검색",
      "/newbot 명령어 입력",
      "봇 이름과 username 설정",
      "발급된 토큰을 아래에 입력",
    ],
  },
  slack: {
    label: "Slack",
    badge: "#",
    color: "bg-purple-500",
    bgLight: "bg-purple-50",
    textColor: "text-purple-600",
    tokenLabel: "Bot Token",
    tokenPlaceholder: "xoxb-...",
    guide: [
      "api.slack.com/apps 에서 앱 생성",
      "OAuth & Permissions → Bot Token Scopes 추가",
      "워크스페이스에 앱 설치",
      "Bot User OAuth Token 복사",
    ],
  },
} as const;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  async function fetchChannels() {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json() as { channels: Channel[] };
      setChannels(data.channels ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchChannels(); }, []);

  function openModal(type: ModalType) {
    setModal(type);
    setToken("");
    setError("");
    setGuideOpen(false);
  }

  function closeModal() {
    setModal(null);
    setToken("");
    setError("");
  }

  async function handleConnect() {
    if (!modal || !token.trim()) return;
    setConnecting(true);
    setError("");

    try {
      const res = await fetch(`/api/channels/${modal}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim() }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "연결에 실패했습니다.");
      }

      closeModal();
      await fetchChannels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "연결 중 오류가 발생했습니다.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect(channelId: string) {
    setDisconnecting(channelId);
    try {
      await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
      await fetchChannels();
    } catch {
    } finally {
      setDisconnecting(null);
    }
  }

  const connectedTypes = new Set(channels.map((c) => c.type));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">채널 관리</h1>
        <p className="text-zinc-500 mt-2">AI 에이전트와 대화할 채널을 연결하세요.</p>
      </div>

      <div className="space-y-4">
        {(["telegram", "slack"] as const).map((type) => {
          const meta = CHANNEL_META[type];
          const connected = channels.find((c) => c.type === type);

          return (
            <div key={type} className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${meta.bgLight} flex items-center justify-center`}>
                    {type === "telegram"
                      ? <MessageCircle className={`w-6 h-6 ${meta.textColor}`} />
                      : <Hash className={`w-6 h-6 ${meta.textColor}`} />
                    }
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900">{meta.label}</h3>
                    {connected ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs text-emerald-600 font-medium">
                          {connected.display_name || "연결됨"}
                        </span>
                        {connected.last_message_at && (
                          <span className="text-xs text-zinc-400">
                            · 마지막 메시지 {formatDate(connected.last_message_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 mt-1">미연결</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(connected.id)}
                      disabled={disconnecting === connected.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {disconnecting === connected.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />
                      }
                      연결 해제
                    </button>
                  ) : (
                    <button
                      onClick={() => openModal(type)}
                      className="gradient-bg text-white text-sm font-medium px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
                    >
                      연결하기
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${CHANNEL_META[modal].bgLight} flex items-center justify-center`}>
                  {modal === "telegram"
                    ? <MessageCircle className={`w-5 h-5 ${CHANNEL_META[modal].textColor}`} />
                    : <Hash className={`w-5 h-5 ${CHANNEL_META[modal].textColor}`} />
                  }
                </div>
                <h2 className="text-lg font-semibold text-zinc-900">{CHANNEL_META[modal].label} 연결</h2>
              </div>
              <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
                <button
                  onClick={() => setGuideOpen(!guideOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <span>토큰 발급 가이드</span>
                  <span className={`transition-transform ${guideOpen ? "rotate-180" : ""}`}>▼</span>
                </button>
                {guideOpen && (
                  <div className="px-4 pb-4 text-sm text-zinc-600 space-y-2">
                    {CHANNEL_META[modal].guide.map((step, i) => (
                      <p key={i}>{i + 1}. {step}</p>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">{CHANNEL_META[modal].tokenLabel}</label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => { setToken(e.target.value); setError(""); }}
                  placeholder={CHANNEL_META[modal].tokenPlaceholder}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  autoFocus
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={closeModal} className="px-4 py-2.5 rounded-xl text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors font-medium text-sm">
                취소
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !token.trim()}
                className="flex-1 gradient-bg text-white font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {connecting && <Loader2 className="w-4 h-4 animate-spin" />}
                연결하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}
