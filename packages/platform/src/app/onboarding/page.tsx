"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Brain, Key, MessageCircle, ArrowRight, Hash } from "lucide-react";

type AgentTemplate = "developer" | "writer" | "marketer" | "assistant" | "news" | "custom";
type ChannelType = "telegram" | "slack" | null;

interface OnboardingData {
  anthropicApiKey: string;
  skipApiKey: boolean;
  agentTemplate: AgentTemplate;
  customPrompt: string;
  assistantName: string;
  channelType: ChannelType;
  telegramBotToken: string;
  slackBotToken: string;
  skipChannel: boolean;
}

interface StepProps {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
  onNext: () => void;
  onPrev?: () => void;
}

const TOTAL_STEPS = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<OnboardingData>({
    anthropicApiKey: "",
    skipApiKey: true,
    agentTemplate: "developer",
    customPrompt: "",
    assistantName: "Andy",
    channelType: null,
    telegramBotToken: "",
    slackBotToken: "",
    skipChannel: false,
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.completed) router.replace("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) return null;

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
            <span className="text-white font-bold text-sm">N</span>
          </div>
          <span className="font-bold text-xl tracking-tight text-zinc-900">Nomi</span>
        </div>
      </div>

      <div className="flex justify-center gap-2 mb-8">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === step
                ? "w-8 bg-blue-500"
                : i < step
                ? "w-2 bg-blue-500"
                : "w-2 bg-zinc-200"
            }`}
          />
        ))}
      </div>

      <div className="bg-white border border-zinc-100 rounded-3xl shadow-xl shadow-zinc-200/50 p-6 md:p-8 overflow-hidden relative min-h-[400px]">
        {step === 1 && <Step1ApiKey data={data} updateData={updateData} onNext={nextStep} />}
        {step === 2 && <Step2Agent data={data} updateData={updateData} onNext={nextStep} onPrev={prevStep} />}
        {step === 3 && <Step3ChannelSelect data={data} updateData={updateData} onNext={nextStep} onPrev={prevStep} />}
        {step === 4 && <Step4ChannelSetup data={data} updateData={updateData} onNext={nextStep} onPrev={prevStep} />}
        {step === 5 && <Step5Complete data={data} router={router} />}
      </div>
    </div>
  );
}

function Step1ApiKey({ data, updateData, onNext }: StepProps) {
  const [mode, setMode] = useState<"hosted" | "byok">(data.skipApiKey ? "hosted" : "byok");
  const [error, setError] = useState("");

  const handleNext = () => {
    if (mode === "byok") {
      if (!data.anthropicApiKey.startsWith("sk-ant-")) {
        setError("API 키는 'sk-ant-'로 시작해야 합니다.");
        return;
      }
      updateData({ skipApiKey: false });
    } else {
      updateData({ skipApiKey: true, anthropicApiKey: "" });
    }
    setError("");
    onNext();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Key className="w-6 h-6 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">AI 엔진을 선택하세요</h2>
        <p className="text-zinc-500 text-sm">기본은 무료 Gemma 4. Claude를 쓰고 싶다면 API 키를 등록하세요.</p>
      </div>

      <div className="space-y-3">
        <label
          className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
            mode === "hosted" ? "border-blue-500 bg-blue-50/50" : "border-zinc-100 hover:border-zinc-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <input
              type="radio"
              checked={mode === "hosted"}
              onChange={() => setMode("hosted")}
              className="w-4 h-4 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="font-semibold text-zinc-900">Gemma 4 (Hosted) — 무료</div>
              <div className="text-xs text-zinc-500">일일 토큰 한도 안에서 바로 사용할 수 있어요.</div>
            </div>
          </div>
        </label>

        <label
          className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
            mode === "byok" ? "border-blue-500 bg-blue-50/50" : "border-zinc-100 hover:border-zinc-200"
          }`}
        >
          <div className="flex items-center gap-3 mb-3">
            <input
              type="radio"
              checked={mode === "byok"}
              onChange={() => setMode("byok")}
              className="w-4 h-4 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="font-semibold text-zinc-900">Claude (Your API Key)</div>
              <div className="text-xs text-zinc-500">Anthropic 사용량은 직접 청구돼요. 언제든 설정에서 바꿀 수 있어요.</div>
            </div>
          </div>
          {mode === "byok" && (
            <div className="pl-7 space-y-3 animate-in fade-in duration-300">
              <input
                type="password"
                placeholder="sk-ant-..."
                value={data.anthropicApiKey}
                onChange={(e) => { updateData({ anthropicApiKey: e.target.value }); setError(""); }}
                autoComplete="off"
                className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline inline-block">
                API 키 발급하는 법 →
              </a>
            </div>
          )}
        </label>
      </div>

      <button
        onClick={handleNext}
        className="w-full gradient-bg text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
      >
        다음 단계
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

const TEMPLATES = [
  { id: "developer", icon: "🧑‍💻", label: "개발자 도우미" },
  { id: "writer", icon: "✍️", label: "글쓰기 파트너" },
  { id: "marketer", icon: "📈", label: "마케팅 어시스턴트" },
  { id: "assistant", icon: "💼", label: "업무 비서" },
  { id: "news", icon: "📰", label: "뉴스 브리퍼" },
  { id: "custom", icon: "🎯", label: "나만의 설정" },
] as const;

function Step2Agent({ data, updateData, onNext, onPrev }: StepProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Brain className="w-6 h-6 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">어떤 AI가 되길 원하세요?</h2>
        <p className="text-zinc-500 text-sm">나만의 에이전트 페르소나를 설정해주세요.</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => updateData({ agentTemplate: t.id })}
              className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center gap-2 ${
                data.agentTemplate === t.id
                  ? "border-blue-500 bg-blue-50/50 shadow-sm"
                  : "border-zinc-100 hover:border-zinc-200 bg-white"
              }`}
            >
              <span className="text-2xl">{t.icon}</span>
              <span className="text-xs font-medium text-zinc-700">{t.label}</span>
            </button>
          ))}
        </div>

        {data.agentTemplate === "custom" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <textarea
              placeholder="어떤 AI가 되길 원하는지 자유롭게 설명해주세요"
              value={data.customPrompt}
              onChange={(e) => updateData({ customPrompt: e.target.value })}
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px] resize-none"
            />
          </div>
        )}

        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-semibold text-zinc-700 ml-1">에이전트 이름</label>
          <input
            type="text"
            value={data.assistantName}
            onChange={(e) => updateData({ assistantName: e.target.value })}
            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="px-5 py-3 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors">
          이전
        </button>
        <button
          onClick={onNext}
          className="flex-1 gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
        >
          다음 단계
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Step3ChannelSelect({ data, updateData, onNext, onPrev }: StepProps) {
  const handleSelect = (type: ChannelType) => {
    updateData({ channelType: type, skipChannel: type === null });
  };

  const handleNext = () => {
    if (data.channelType === null) {
      updateData({ skipChannel: true });
    }
    onNext();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MessageCircle className="w-6 h-6 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">채널을 선택하세요</h2>
        <p className="text-zinc-500 text-sm">어디서 AI와 대화하고 싶으신가요?</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => handleSelect("telegram")}
          className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
            data.channelType === "telegram"
              ? "border-blue-500 bg-blue-50/50"
              : "border-zinc-100 hover:border-zinc-200 bg-white"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">✈️</span>
          </div>
          <div>
            <div className="font-semibold text-zinc-900">Telegram</div>
            <div className="text-xs text-zinc-500 mt-0.5">봇 토큰으로 바로 연결</div>
          </div>
          {data.channelType === "telegram" && (
            <div className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
          )}
        </button>

        <button
          onClick={() => handleSelect("slack")}
          className={`w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-4 ${
            data.channelType === "slack"
              ? "border-blue-500 bg-blue-50/50"
              : "border-zinc-100 hover:border-zinc-200 bg-white"
          }`}
        >
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Hash className="w-6 h-6 text-purple-500" />
          </div>
          <div>
            <div className="font-semibold text-zinc-900">Slack</div>
            <div className="text-xs text-zinc-500 mt-0.5">워크스페이스에 AI 추가</div>
          </div>
          {data.channelType === "slack" && (
            <div className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs">✓</span>
            </div>
          )}
        </button>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="px-5 py-3 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors">
          이전
        </button>
        <button
          onClick={handleNext}
          disabled={data.channelType === null}
          className="flex-1 gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          다음 단계
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={() => { updateData({ channelType: null, skipChannel: true }); onNext(); }}
        className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
      >
        나중에 연결하기
      </button>
    </div>
  );
}

function Step4ChannelSetup({ data, updateData, onNext, onPrev }: StepProps) {
  useEffect(() => {
    if (!data.channelType) {
      onNext();
    }
  }, []);

  if (data.channelType === "telegram") {
    return <Step4Telegram data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
  }
  if (data.channelType === "slack") {
    return <Step4Slack data={data} updateData={updateData} onNext={onNext} onPrev={onPrev} />;
  }
  return null;
}

function Step4Telegram({ data, updateData, onNext, onPrev }: StepProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (data.telegramBotToken) {
      const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
      if (!tokenRegex.test(data.telegramBotToken)) {
        setError("올바른 봇 토큰 형식이 아닙니다.");
        return;
      }
      updateData({ skipChannel: false });
    } else {
      updateData({ skipChannel: true });
    }
    setError("");
    onNext();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✈️</span>
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Telegram에서 AI를 만나보세요</h2>
        <p className="text-zinc-500 text-sm">봇 토큰을 입력하면 Telegram에서 바로 대화할 수 있어요.</p>
      </div>

      <div className="space-y-4">
        <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <span>봇 토큰 발급 가이드</span>
            <span className={`transition-transform ${isGuideOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          {isGuideOpen && (
            <div className="px-4 pb-4 text-sm text-zinc-600 space-y-2 animate-in fade-in slide-in-from-top-2">
              <p>1. Telegram에서 <strong>@BotFather</strong> 검색</p>
              <p>2. <strong>/newbot</strong> 명령어 입력</p>
              <p>3. 봇 이름과 username 설정</p>
              <p>4. 발급된 토큰을 아래에 입력</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 ml-1">봇 토큰</label>
          <input
            type="text"
            placeholder="1234567890:ABCdefGHIjklmNOPqrstuvWXYZ"
            value={data.telegramBotToken}
            onChange={(e) => { updateData({ telegramBotToken: e.target.value }); setError(""); }}
            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="px-5 py-3 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors">
          이전
        </button>
        <button
          onClick={handleNext}
          className="flex-1 gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
        >
          연결하기
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={() => { updateData({ skipChannel: true, telegramBotToken: "" }); onNext(); }}
        className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
      >
        나중에 연결하기
      </button>
    </div>
  );
}

function Step4Slack({ data, updateData, onNext, onPrev }: StepProps) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [error, setError] = useState("");

  const handleNext = () => {
    if (data.slackBotToken) {
      if (!data.slackBotToken.startsWith("xoxb-")) {
        setError("Bot Token은 'xoxb-'로 시작해야 합니다.");
        return;
      }
      updateData({ skipChannel: false });
    } else {
      updateData({ skipChannel: true });
    }
    setError("");
    onNext();
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="space-y-2 text-center">
        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Hash className="w-6 h-6 text-purple-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900">Slack에서 AI를 만나보세요</h2>
        <p className="text-zinc-500 text-sm">Bot Token을 입력하면 워크스페이스에서 바로 대화할 수 있어요.</p>
      </div>

      <div className="space-y-4">
        <div className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50">
          <button
            onClick={() => setIsGuideOpen(!isGuideOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <span>Bot Token 발급 가이드</span>
            <span className={`transition-transform ${isGuideOpen ? "rotate-180" : ""}`}>▼</span>
          </button>
          {isGuideOpen && (
            <div className="px-4 pb-4 text-sm text-zinc-600 space-y-2 animate-in fade-in slide-in-from-top-2">
              <p>1. <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">api.slack.com/apps</a> 에서 앱 생성</p>
              <p>2. <strong>OAuth & Permissions</strong> → Bot Token Scopes 추가</p>
              <p>3. 워크스페이스에 앱 설치</p>
              <p>4. <strong>Bot User OAuth Token</strong> 복사</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-zinc-700 ml-1">Bot Token</label>
          <input
            type="text"
            placeholder="xoxb-..."
            value={data.slackBotToken}
            onChange={(e) => { updateData({ slackBotToken: e.target.value }); setError(""); }}
            className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onPrev} className="px-5 py-3 rounded-xl font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 transition-colors">
          이전
        </button>
        <button
          onClick={handleNext}
          className="flex-1 gradient-bg text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
        >
          연결하기
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={() => { updateData({ skipChannel: true, slackBotToken: "" }); onNext(); }}
        className="w-full text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-1"
      >
        나중에 연결하기
      </button>
    </div>
  );
}

interface Step5Props {
  data: OnboardingData;
  router: ReturnType<typeof useRouter>;
}

function Step5Complete({ data, router }: Step5Props) {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const completeOnboarding = async () => {
      try {
        const res = await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assistantName: data.assistantName,
            agentConfig: data.agentTemplate === "custom" ? data.customPrompt : data.agentTemplate,
            telegramBotToken: data.channelType === "telegram" && !data.skipChannel ? data.telegramBotToken : undefined,
            slackBotToken: data.channelType === "slack" && !data.skipChannel ? data.slackBotToken : undefined,
            anthropicApiKey: data.skipApiKey ? undefined : data.anthropicApiKey,
          }),
        });

        if (!res.ok) {
          throw new Error("설정 중 오류가 발생했습니다.");
        }

        setStatus("success");
      } catch (err: unknown) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      }
    };

    completeOnboarding();
  }, [data]);

  if (status === "loading") {
    return (
      <div className="py-12 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
        <div className="relative">
          <div className="w-20 h-20 rounded-full border-4 border-zinc-100 border-t-blue-500 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Bot className="w-8 h-8 text-blue-500 animate-pulse" />
          </div>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-zinc-900">인스턴스 생성 중...</h2>
          <p className="text-sm text-zinc-500">잠깐만 기다려주세요. AI 환경을 설정하는 중이에요.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="py-8 flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
          <span className="text-2xl">⚠️</span>
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-zinc-900">오류가 발생했습니다</h2>
          <p className="text-sm text-red-500">{errorMessage}</p>
        </div>
        <button
          onClick={() => setStatus("loading")}
          className="px-6 py-2 bg-zinc-100 text-zinc-700 rounded-xl font-medium hover:bg-zinc-200 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const channelLabel = data.channelType === "telegram" ? "Telegram" : data.channelType === "slack" ? "Slack" : null;

  return (
    <div className="py-8 flex flex-col items-center justify-center space-y-8 animate-in zoom-in-95 duration-500">
      <div className="relative">
        <div className="text-6xl animate-bounce">🎉</div>
        <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-full -z-10" />
      </div>

      <div className="text-center space-y-3">
        <h2 className="text-2xl font-bold text-zinc-900">
          <span className="gradient-text">{data.assistantName}</span>님의 AI가 준비됐어요!
        </h2>
        <p className="text-zinc-500 text-sm max-w-[260px] mx-auto leading-relaxed">
          {data.skipChannel || !channelLabel
            ? "대시보드에서 채널을 연결하고 대화를 시작해보세요."
            : `${channelLabel}에서 메시지를 보내보세요!`}
        </p>
      </div>

      {!data.skipChannel && channelLabel && (
        <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 w-full max-w-xs">
          <p className="text-xs text-zinc-500 mb-2 font-medium">첫 메시지 예시:</p>
          <div className="bg-white border border-zinc-200 rounded-xl px-4 py-3 shadow-sm flex items-center gap-3">
            <div className="w-6 h-6 rounded-full gradient-bg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">Me</span>
            </div>
            <p className="text-sm text-zinc-700">@{data.assistantName} 안녕!</p>
          </div>
        </div>
      )}

      <button
        onClick={() => router.push("/dashboard")}
        className="w-full gradient-bg text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-blue-500/25"
      >
        대시보드로 가기
      </button>
    </div>
  );
}
