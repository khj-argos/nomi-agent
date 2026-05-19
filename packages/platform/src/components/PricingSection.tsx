"use client";

import { Check, ArrowRight } from "lucide-react";

interface FreePlan {
  type: "free";
  name: string;
  desc: string;
  badge: string;
  features: string[];
  cta: string;
}

interface PaidPlan {
  type: "paid";
  name: string;
  desc: string;
  monthlyPrice: number;
  badge?: string;
  features: string[];
  cta: string;
  highlighted: boolean;
}

type Plan = FreePlan | PaidPlan;

const PLANS: Plan[] = [
  {
    type: "free",
    name: "Free",
    desc: "Gemma 4 무료로 바로 시작",
    badge: "신용카드 불필요",
    features: [
      "독립 AI 에이전트 인스턴스",
      "Gemma 4 (Hosted) · 일일 토큰 한도",
      "Telegram 채널 연결",
      "자동 학습 & 진화",
      "기본 온보딩 지원",
    ],
    cta: "무료로 시작하기",
  },
  {
    type: "paid",
    name: "Starter",
    desc: "Claude도 함께 쓰고 싶을 때",
    monthlyPrice: 35,
    features: [
      "독립 AI 에이전트 인스턴스",
      "Gemma 4 (Hosted) · 일일 한도 상향",
      "Claude (Your API Key) 사용 가능",
      "Slack + Telegram 채널 연결",
      "자동 학습 & 진화",
      "능동적 알림",
    ],
    cta: "Starter로 시작하기",
    highlighted: false,
  },
  {
    type: "paid",
    name: "Pro",
    desc: "고성능 AI + 우선 지원",
    monthlyPrice: 90,
    badge: "인기",
    features: [
      "독립 AI 에이전트 인스턴스",
      "Gemma 4 (Hosted) · 한도 없음",
      "Claude (Your API Key) 사용 가능",
      "Slack + Telegram 외 다수 추가 채널",
      "자동 학습 & 진화",
      "능동적 알림 (무제한)",
      "우선 기술 지원 + 전담 온보딩",
      "CLAUDE.md 직접 편집",
    ],
    cta: "Pro로 시작하기",
    highlighted: true,
  },
];

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 px-6 border-t border-white/[0.06] relative z-10">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h2 className="font-serif text-4xl md:text-5xl font-bold headline-gradient">
            투명한 요금제
          </h2>
          <p className="text-xl text-[#8A8F98]">신용카드 없이 14일 무료. 언제든 취소 가능.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const isFree = plan.type === "free";
            const price = !isFree ? plan.monthlyPrice : 0;
            const isHighlighted = !isFree && plan.highlighted;

            return (
              <div
                key={plan.name}
                className={`relative rounded-3xl p-8 border transition-all duration-300 ease-out ${
                  isHighlighted
                    ? "border-[#5E6AD2]/50 bg-gradient-to-b from-white/[0.08] to-white/[0.02] shadow-[0_0_40px_rgba(94,106,210,0.15),inset_0_0_20px_rgba(94,106,210,0.05)]"
                    : isFree
                    ? "border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.05] to-transparent hover:border-emerald-500/50"
                    : "border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-transparent hover:border-white/[0.1]"
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className={`text-white text-xs font-bold px-4 py-1.5 rounded-full ${
                      isFree
                        ? "bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                        : "bg-[#5E6AD2] shadow-[0_0_20px_rgba(94,106,210,0.4)]"
                    }`}>
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-[#EDEDEF]">{plan.name}</h3>
                    <p className="text-sm text-[#8A8F98] mt-1">{plan.desc}</p>
                  </div>

                  {isFree ? (
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-bold text-emerald-400">$0</span>
                      <span className="text-[#8A8F98] mb-2">/ 14일</span>
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <span className="text-5xl font-bold text-[#EDEDEF]">${price}</span>
                      <span className="text-[#8A8F98] mb-2">/월</span>
                    </div>
                  )}

                  <a
                    href="/auth/signup"
                    className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ease-out active:scale-[0.98] ${
                      isHighlighted
                        ? "bg-[#5E6AD2] text-white hover:opacity-90 shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_4px_12px_rgba(94,106,210,0.3),inset_0_1px_0_0_rgba(255,255,255,0.2)]"
                        : isFree
                        ? "bg-emerald-500 text-white hover:opacity-90 shadow-[0_0_0_1px_rgba(16,185,129,0.5),0_4px_12px_rgba(16,185,129,0.3)]"
                        : "bg-white/[0.05] text-[#EDEDEF] hover:bg-white/[0.08] border border-white/[0.06]"
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="w-4 h-4" />
                  </a>

                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-[#8A8F98]">
                        <Check
                          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                            isHighlighted ? "text-[#5E6AD2]" : isFree ? "text-emerald-400" : "text-[#8A8F98]"
                          }`}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-[#8A8F98]">
          Free 14일 체험 후 자동 종료 · 신용카드 불필요 · 언제든 업그레이드 가능
        </p>
      </div>
    </section>
  );
}
