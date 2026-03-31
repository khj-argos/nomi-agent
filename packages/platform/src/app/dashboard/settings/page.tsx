"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [formData, setFormData] = useState({
    agentName: "",
    claudeMd: "",
    anthropicApiKey: "",
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/instances/config")
      .then((r) => r.json())
      .then((data: { assistantName?: string; agentConfig?: string }) => {
        setFormData((prev) => ({
          ...prev,
          agentName: data.assistantName ?? "",
          claudeMd: data.agentConfig ?? "",
        }));
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/instances/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantName: formData.agentName,
          agentConfig: formData.claudeMd,
        }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "저장에 실패했습니다.");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
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
        <p className="text-zinc-500 mt-2">에이전트의 이름, 성격, API 키를 관리하세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl p-6 border border-zinc-100 shadow-sm space-y-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-500" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-900">기본 설정</h2>
          </div>

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

            <div>
              <label htmlFor="anthropicApiKey" className="block text-sm font-medium text-zinc-700 mb-1.5">
                Anthropic API 키
              </label>
              <input
                type="password"
                id="anthropicApiKey"
                name="anthropicApiKey"
                value={formData.anthropicApiKey}
                onChange={handleChange}
                className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                placeholder="sk-ant-..."
              />
              <p className="text-xs text-zinc-500 mt-2">
                API 키는 암호화되어 안전하게 저장되며, 오직 당신의 인스턴스에서만 사용됩니다.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm">
            ✓ 설정이 저장됐어요.
          </div>
        )}
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
