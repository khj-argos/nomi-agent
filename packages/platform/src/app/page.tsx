import { PricingSection } from "@/components/PricingSection";
import { ClientNavbar } from "./_components/ClientNavbar";
import { SpotlightCard } from "./_components/SpotlightCard";
import {
  Bot,
  Brain,
  Lock,
  MessageCircle,
  Sparkles,
  Zap,
  ArrowRight,
  Check,
} from "lucide-react";

function ChatMockup() {
  const messages = [
    { text: "오늘 주식 많이 빠졌네. 확인해봤어? 📊", delay: "0s" },
    { text: "3일째 운동 기록이 없어. 괜찮아? 💪", delay: "0.3s" },
    { text: "이번 주 마감 내일인데 진행 상황 어때? ⏰", delay: "0.6s" },
  ];

  return (
      <div className="relative w-full max-w-md animate-blob">
      <div className="bg-[#0a0a0c] rounded-3xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5),0_0_80px_rgba(94,106,210,0.1)] border border-white/[0.06] overflow-hidden">
        <div className="bg-white/[0.03] px-4 py-2 flex items-center justify-between border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#5E6AD2] flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#EDEDEF]">Andy</p>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot inline-block" />
                <span className="text-[10px] text-[#8A8F98]">온라인</span>
              </div>
            </div>
          </div>
          <span className="text-[10px] text-[#8A8F98]">Telegram</span>
        </div>

        <div className="p-4 space-y-3 bg-transparent min-h-[160px]">
          {messages.map((msg, i) => (
            <div
              key={i}
              className="flex gap-2 items-start animate-slide-up"
              style={{ animationDelay: msg.delay, opacity: 0 }}
            >
              <div className="w-6 h-6 rounded-full bg-[#5E6AD2] flex-shrink-0 flex items-center justify-center mt-0.5">
                <span className="text-white text-[8px] font-bold">A</span>
              </div>
              <div className="bg-white/[0.06] rounded-2xl rounded-tl-none px-3 py-2 max-w-[220px]">
                <p className="text-xs text-[#EDEDEF] leading-relaxed">{msg.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 bg-white/[0.03] border-t border-white/[0.06]">
          <div className="bg-white/[0.06] rounded-full px-4 py-2 flex items-center gap-2 border border-white/[0.06]">
            <span className="text-xs text-[#8A8F98] flex-1">메시지...</span>
            <div className="w-6 h-6 rounded-full bg-[#5E6AD2] flex items-center justify-center">
              <ArrowRight className="w-3 h-3 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div
        className="absolute -top-10 -right-3 glass-dark rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg animate-blob-2"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
        <span className="text-xs font-medium text-[#EDEDEF]">먼저 말 걸어옴</span>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <>
      <section className="h-screen px-6 flex flex-col items-center justify-center relative z-10 text-center">
        <div className="max-w-5xl mx-auto w-full space-y-7">
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 glass-dark border border-[#5E6AD2]/30 rounded-full px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-[#5E6AD2] animate-pulse-dot" />
              <span className="text-sm text-[#5E6AD2] font-medium">나만의 독립 AI 에이전트</span>
            </div>
          </div>

          <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold leading-[1.05] tracking-[-0.03em] headline-gradient">
            쓸수록
            <br />
            <span className="gradient-text-dark">나를 닮아가는</span>
            <br />
            나만의 AI
          </h1>

          <p className="text-lg md:text-xl text-[#8A8F98] leading-relaxed max-w-xl mx-auto">
            하루에 한 번, 내가 열지 않아도{" "}
            <strong className="text-[#EDEDEF]">먼저 찾아오는</strong> AI.
            Telegram으로 5분 만에 나만의 에이전트를 키워보세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/auth/signup"
              className="bg-[#5E6AD2] text-white font-semibold px-10 py-4 rounded-full text-base transition-all duration-200 ease-out hover:-translate-y-1 active:scale-[0.98] shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)] flex items-center justify-center gap-2"
            >
              14일 무료로 시작하기
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="#how"
              className="bg-white/[0.05] text-[#EDEDEF] font-semibold px-10 py-4 rounded-full text-base hover:bg-white/[0.08] transition-all duration-200 ease-out hover:-translate-y-1 active:scale-[0.98] flex items-center justify-center glass-dark"
            >
              작동 방식 보기
            </a>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-[#8A8F98]">
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>신용카드 불필요</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>14일 무료 체험</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>5분 셋업</span>
            </div>
          </div>
        </div>
      </section>

      <div className="pb-24 px-6 flex justify-center relative z-10">
        <ChatMockup />
      </div>
    </>
  );
}

function ProblemSection() {
  return (
    <section className="py-24 px-6 border-t border-white/[0.06] relative z-10">
      <div className="max-w-5xl mx-auto text-center space-y-16">
        <div className="space-y-4">
          <h2 className="font-serif text-4xl md:text-5xl font-bold headline-gradient leading-tight">
            기존 AI는 <span className="text-[#8A8F98]">망각형</span>이에요
          </h2>
          <p className="text-[#8A8F98] text-xl max-w-2xl mx-auto">
            당신이 앱을 열어야만 존재하고, 닫으면 사라지는 AI.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="bg-gradient-to-b from-white/[0.04] to-transparent rounded-2xl p-6 border border-white/[0.06]">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-[#8A8F98]" />
              <span className="text-[#8A8F98] text-sm font-medium">ChatGPT / Claude</span>
            </div>
            <div className="space-y-3">
              {[
                "당신이 열어야만 존재함",
                "매 대화마다 처음부터 설명",
                "주도적으로 알림 불가",
                "나를 모르는 채로 항상 리셋",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-[#8A8F98] text-sm">
                  <span className="text-[#8A8F98] mt-0.5">✕</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-b from-[#5E6AD2]/10 to-transparent rounded-2xl p-6 border border-[#5E6AD2]/30 relative overflow-hidden shadow-[0_0_40px_rgba(94,106,210,0.1)]">
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-[#5E6AD2] animate-pulse-dot" />
                <span className="text-[#5E6AD2] text-sm font-medium">Nomi</span>
              </div>
              <div className="space-y-3">
                {[
                  "내가 열지 않아도 먼저 찾아옴",
                  "대화할수록 나를 더 잘 이해함",
                  "Telegram으로 능동적 알림",
                  "쓸수록 나를 닮아가는 나만의 AI",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-[#EDEDEF] text-sm">
                    <Check className="w-4 h-4 text-[#5E6AD2] flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const features = [
    {
      icon: <Bot className="w-6 h-6 text-[#5E6AD2]" />,
      title: "나만의 독립 인스턴스",
      desc: "사용자마다 완전히 격리된 AI 컨테이너. 내 데이터가 다른 사람과 절대 섞이지 않아요.",
      className: "md:col-span-4 md:row-span-2",
    },
    {
      icon: <Brain className="w-6 h-6 text-[#5E6AD2]" />,
      title: "쓸수록 진화하는 AI",
      desc: "대화 패턴, 관심사, 말투를 AI가 스스로 파악해 점점 나를 닮아가요. Day 30엔 말 안 해도 알아서.",
      className: "md:col-span-2",
    },
    {
      icon: <MessageCircle className="w-6 h-6 text-[#5E6AD2]" />,
      title: "능동적으로 먼저 찾아옴",
      desc: "마감 알림, 뉴스 브리핑, 운동 체크... AI가 판단해서 Telegram으로 먼저 말 걸어요.",
      className: "md:col-span-2",
    },
    {
      icon: <Lock className="w-6 h-6 text-[#5E6AD2]" />,
      title: "기본은 무료, 원하면 BYOK",
      desc: "Gemma 4가 무료로 동작해요. Claude API 키를 등록하면 즉시 전환 — 자가호스팅 모델과 Claude 사이를 클릭 한 번으로.",
      className: "md:col-span-2",
    },
    {
      icon: <Zap className="w-6 h-6 text-[#5E6AD2]" />,
      title: "즉시 시작, 5분 셋업",
      desc: "가입 → 에이전트 설정 → Telegram 연결. 키 등록 없이도 바로 시작할 수 있어요.",
      className: "md:col-span-2",
    },
    {
      icon: <Sparkles className="w-6 h-6 text-[#5E6AD2]" />,
      title: "자연어로 AI 커스터마이징",
      desc: '"매일 아침 뉴스 브리핑 해줘" 한 마디면 AI 설정 완료. 개발자 아니어도 완전히 내 것으로.',
      className: "md:col-span-2",
    },
  ];

  return (
    <section id="features" className="py-24 px-6 relative z-10">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="font-serif text-4xl md:text-5xl font-bold headline-gradient leading-tight">
            살아있는 AI
          </h2>
          <p className="text-xl text-[#8A8F98] max-w-2xl mx-auto">
            단순한 챗봇이 아닙니다. 시간이 지날수록 진짜 나의 AI 파트너가 돼요.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6">
          {features.map((f, i) => (
            <SpotlightCard key={i} className={`p-6 ${f.className}`}>
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-[#EDEDEF] mb-2 text-lg">{f.title}</h3>
              <p className="text-sm text-[#8A8F98] leading-relaxed">{f.desc}</p>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      num: "01",
      title: "가입하고 바로 시작",
      desc: "이메일로 30초 가입. 기본은 Gemma 4 (무료) — Claude를 쓰고 싶다면 나중에 API 키만 등록하세요.",
    },
    {
      num: "02",
      title: "나만의 AI 설정",
      desc: "템플릿 선택 또는 자연어로 원하는 AI를 묘사하면, CLAUDE.md가 자동 생성돼요.",
    },
    {
      num: "03",
      title: "Telegram에서 시작",
      desc: "봇 토큰 입력 후 연결 완료. 이제 AI가 알아서 먼저 말 걸어올 거예요.",
    },
  ];

  return (
    <section id="how" className="py-24 px-6 border-t border-white/[0.06] relative z-10">
      <div className="max-w-5xl mx-auto space-y-16">
        <div className="text-center space-y-4">
          <h2 className="font-serif text-4xl md:text-5xl font-bold headline-gradient">
            5분이면 충분해요
          </h2>
          <p className="text-xl text-[#8A8F98]">복잡한 설정 없이, 바로 나만의 AI와 대화 시작.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div key={i} className="relative">
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-full h-px bg-gradient-to-r from-[#5E6AD2]/30 via-[#5E6AD2]/10 to-transparent z-0" />
              )}
              <div className="relative z-10 space-y-4">
                <div className="w-20 h-20 rounded-2xl bg-white/[0.04] border border-[#5E6AD2]/30 flex items-center justify-center shadow-[0_0_20px_rgba(94,106,210,0.2)]">
                  <span className="text-[#5E6AD2] font-bold text-xl font-mono">{step.num}</span>
                </div>
                <h3 className="text-xl font-bold text-[#EDEDEF]">{step.title}</h3>
                <p className="text-[#8A8F98] leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTASection() {
  return (
    <section className="py-24 px-6 border-t border-white/[0.06] relative z-10 overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#5E6AD2]/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="max-w-3xl mx-auto text-center space-y-8 relative z-10">
        <div className="inline-flex items-center gap-2 glass-dark border border-[#5E6AD2]/30 rounded-full px-4 py-2">
          <span className="w-2 h-2 rounded-full bg-[#5E6AD2] animate-pulse-dot" />
          <span className="text-[#5E6AD2] text-sm font-medium">지금 얼리어답터 혜택 중</span>
        </div>

        <h2 className="font-serif text-5xl md:text-6xl font-bold headline-gradient leading-tight">
          나만의 AI를{" "}
          <span className="gradient-text-dark">지금 키워보세요</span>
        </h2>

        <p className="text-xl text-[#8A8F98] max-w-xl mx-auto leading-relaxed">
          더 이상 AI에게 먼저 물어볼 필요 없어요.
          AI가 알아서 당신을 찾아올 거예요.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="/auth/signup"
            className="bg-emerald-500 text-white font-semibold px-10 py-4 rounded-full text-lg transition-all duration-200 ease-out hover:-translate-y-1 active:scale-[0.98] shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_4px_12px_rgba(16,185,129,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2),0_0_40px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2"
          >
            14일 무료로 시작하기
            <ArrowRight className="w-5 h-5" />
          </a>
          <a
            href="#pricing"
            className="bg-white/[0.05] text-[#EDEDEF] font-semibold px-10 py-4 rounded-full text-lg hover:bg-white/[0.08] transition-all duration-200 ease-out hover:-translate-y-1 active:scale-[0.98] flex items-center justify-center glass-dark"
          >
            요금제 보기
          </a>
        </div>

        <p className="text-[#8A8F98] text-sm">신용카드 불필요 · 14일 후 자동 종료 · 언제든 업그레이드</p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#020203] border-t border-white/[0.06] py-12 px-6 relative z-10">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#5E6AD2] flex items-center justify-center">
            <span className="text-white font-bold text-xs">N</span>
          </div>
          <span className="text-[#8A8F98] font-medium">Nomi</span>
        </div>
        <p className="text-[#8A8F98] text-sm">
          © 2026 Nomi. 나만의 AI 에이전트 플랫폼.
        </p>
        <div className="flex gap-6 text-sm text-[#8A8F98]">
          <a href="/privacy" className="hover:text-[#EDEDEF] transition-colors duration-200 ease-out">개인정보처리방침</a>
          <a href="/terms" className="hover:text-[#EDEDEF] transition-colors duration-200 ease-out">이용약관</a>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
      <div className="relative min-h-screen bg-[#050506] overflow-hidden">
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[900px] h-[900px] bg-[#5E6AD2]/25 rounded-full blur-[150px] animate-blob" />
        <div className="absolute top-[20%] right-[-5%] w-[700px] h-[700px] bg-purple-500/15 rounded-full blur-[120px] animate-blob-2" />
        <div className="absolute bottom-[-10%] left-[20%] w-[500px] h-[500px] bg-indigo-500/12 rounded-full blur-[100px] animate-blob" style={{ animationDelay: "2s" }} />
      </div>

      <ClientNavbar />
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <FinalCTASection />
      <Footer />
    </div>
  );
}
