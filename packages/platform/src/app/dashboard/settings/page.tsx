"use client";

import { useEffect, useState } from "react";
import { Cpu, KeyRound, Loader2, Save, Settings, Sparkles, Trash2 } from "lucide-react";

type ActiveLlm = "gemma_hosted" | "anthropic_byok";

interface ConfigResponse {
  assistantName?: string;
  agentConfig?: string;
  hasApiKey?: boolean;
  activeLlm?: ActiveLlm;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({
    agentName: "",
    claudeMd: "",
  });
  const [activeLlm, setActiveLlm] = useState<ActiveLlm>("gemma_hosted");
  const [hasApiKey, setHasApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setFetching(true);
    try {
      const res = await fetch("/api/instances/config");
      if (!res.ok) throw new Error("설정을 불러올 수 없습니다.");
      const data = (await res.json()) as ConfigResponse;
      setFormData({
        agentName: data.assistantName ?? "",
        claudeMd: data.agentConfig ?? "",
      });
      setActiveLlm(data.activeLlm ?? "gemma_hosted");
      setHasApiKey(!!data.hasApiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "설정 로드 중 오류가 발생했습니다.");
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  const flash = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  async function submitConfig(body: Record<string, unknown>): Promise<void> {
    const res = await fetch("/api/instances/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "요청에 실패했습니다.");
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await submitConfig({
        assistantName: formData.agentName,
        agentConfig: formData.claudeMd,
      });
      flash("프로필이 저장됐어요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchLlm = async (target: ActiveLlm) => {
    if (target === activeLlm) return;
    if (target === "anthropic_byok" && !hasApiKey) {
      setError("Claude를 사용하려면 먼저 API 키를 등록해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await submitConfig({ activeLlm: target });
      setActiveLlm(target);
      flash(target === "gemma_hosted" ? "Gemma 4로 전환됐어요." : "Claude로 전환됐어요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "전환 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.startsWith("sk-ant-")) {
      setError("Anthropic API 키는 sk-ant- 로 시작해야 합니다.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await submitConfig({ anthropicApiKey: newApiKey });
      setHasApiKey(true);
      setActiveLlm("anthropic_byok");
      setNewApiKey("");
      setShowKeyInput(false);
      flash("API 키가 등록됐어요. Claude를 사용합니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "API 키 저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!confirm("등록된 API 키를 삭제하고 Gemma 4(무료)로 복귀합니다. 계속할까요?")) return;
    setLoading(true);
    setError(null);
    try {
      await submitConfig({ removeAnthropicKey: true });
      setHasApiKey(false);
      setActiveLlm("gemma_hosted");
      flash("API 키를 삭제했어요. Gemma 4로 복귀했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">설정</h1>
        <p className="text-zinc-500 mt-2">에이전트의 이름, 성격, LLM 백엔드를 관리하세요.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
          ✓ {success}
        </div>
      )}

      <section className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm space-y-5">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">LLM 백엔드</h2>
            <p className="text-sm text-zinc-500">에이전트가 사용할 LLM을 선택하세요. 전환은 즉시 적용됩니다.</p>
          </div>
        </header>

        <div className="space-y-3">
          <LlmOption
            value="gemma_hosted"
            active={activeLlm === "gemma_hosted"}
            disabled={loading}
            onClick={() => handleSwitchLlm("gemma_hosted")}
            icon={<Sparkles className="w-4 h-4" />}
            title="Gemma 4 (Hosted)"
            subtitle="무료 · 일일 토큰 한도 적용"
            badge="기본"
          />
          <LlmOption
            value="anthropic_byok"
            active={activeLlm === "anthropic_byok"}
            disabled={loading || !hasApiKey}
            onClick={() => handleSwitchLlm("anthropic_byok")}
            icon={<KeyRound className="w-4 h-4" />}
            title="Claude (Your API Key)"
            subtitle={hasApiKey ? "등록된 키로 호출합니다." : "API 키를 먼저 등록하세요."}
            badge={hasApiKey ? "준비됨" : "키 필요"}
          />
        </div>

        <div className="pt-3 border-t border-zinc-100">
          {hasApiKey ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-zinc-600">
                Anthropic API 키가 등록되어 있어요. 새 키를 등록하면 기존 키를 대체합니다.
              </p>
              <button
                type="button"
                onClick={handleRemoveApiKey}
                disabled={loading}
                className="text-sm font-medium text-red-600 hover:text-red-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                키 삭제
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowKeyInput((v) => !v)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {showKeyInput ? "닫기" : "+ Anthropic API 키 등록하기"}
            </button>
          )}

          {(showKeyInput || hasApiKey) && (
            <form onSubmit={handleSaveApiKey} className="mt-4 space-y-2">
              <label htmlFor="anthropicApiKey" className="block text-sm font-medium text-zinc-700">
                {hasApiKey ? "새 API 키" : "Anthropic API 키"}
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  id="anthropicApiKey"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={loading || !newApiKey}
                  className="gradient-bg text-white font-medium px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  저장
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                키는 암호화되어 저장되며, 에이전트 컨테이너에는 절대 노출되지 않습니다.{" "}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  키 발급받기 →
                </a>
              </p>
            </form>
          )}
        </div>
      </section>

      <form onSubmit={handleSaveProfile} className="space-y-6">
        <section className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm space-y-6">
          <header className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">에이전트 프로필</h2>
          </header>

          <div className="space-y-4">
            <div>
              <label htmlFor="agentName" className="block text-sm font-medium text-zinc-700 mb-1.5">
                에이전트 이름
              </label>
              <input
                type="text"
                id="agentName"
                name="agentName"
                value={formData.agentName}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                placeholder="예: Andy"
                required
              />
            </div>

            <div>
              <label htmlFor="claudeMd" className="block text-sm font-medium text-zinc-700 mb-1.5">
                CLAUDE.md (에이전트 성격 및 지침)
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                마크다운 형식으로 에이전트가 어떻게 행동해야 할지 작성해주세요.
              </p>
              <textarea
                id="claudeMd"
                name="claudeMd"
                value={formData.claudeMd}
                onChange={handleChange}
                rows={8}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all font-mono text-sm resize-y"
                placeholder="# 지침 작성..."
                required
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="gradient-bg text-white font-medium px-6 py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            저장하기
          </button>
        </div>
      </form>
    </div>
  );
}

interface LlmOptionProps {
  value: ActiveLlm;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge: string;
}

function LlmOption({ active, disabled, onClick, icon, title, subtitle, badge }: LlmOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center gap-4
        ${active ? "border-blue-500 bg-blue-50/40" : "border-zinc-200 bg-white hover:border-zinc-300"}
        ${disabled && !active ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center
          ${active ? "bg-blue-500 text-white" : "bg-zinc-100 text-zinc-500"}`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-900">{title}</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium
              ${active ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"}`}
          >
            {badge}
          </span>
        </div>
        <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
      </div>
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
          ${active ? "border-blue-500" : "border-zinc-300"}`}
      >
        {active && <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
      </div>
    </button>
  );
}
