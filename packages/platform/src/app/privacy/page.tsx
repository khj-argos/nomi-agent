import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 py-20 px-6">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-zinc-100">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          홈으로 돌아가기
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold text-zinc-900 mb-4 tracking-tight">
          개인정보처리방침
        </h1>
        <p className="text-zinc-500 mb-12">시행일자: 2026년 3월 22일</p>

        <div className="space-y-10 text-zinc-700 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">1. 수집하는 개인정보 항목</h2>
            <p>
              Nomi(이하 &quot;회사&quot;)는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 아래와 같은 개인정보를 수집하고 있습니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>필수항목: 이메일 주소, 비밀번호, 이름</li>
              <li>선택항목: Anthropic API 키, Telegram 사용자 ID</li>
              <li>자동수집항목: 서비스 이용기록, 접속 로그, 쿠키, 접속 IP 정보</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">2. 개인정보의 수집 및 이용목적</h2>
            <p>회사는 수집한 개인정보를 다음의 목적을 위해 활용합니다.</p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>서비스 제공에 관한 계약 이행 및 서비스 제공에 따른 요금정산</li>
              <li>회원 관리: 회원제 서비스 이용에 따른 본인확인, 개인 식별, 불량회원의 부정 이용 방지와 비인가 사용 방지</li>
              <li>AI 에이전트 인스턴스 생성 및 관리, 메신저 연동 서비스 제공</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">3. 개인정보의 보유 및 이용기간</h2>
            <p>
              원칙적으로, 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다. 단, 다음의 정보에 대해서는 아래의 이유로 명시한 기간 동안 보존합니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>보존 항목: 결제기록</li>
              <li>보존 근거: 전자상거래 등에서의 소비자보호에 관한 법률</li>
              <li>보존 기간: 5년</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">4. 개인정보의 제3자 제공</h2>
            <p>
              회사는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>이용자들이 사전에 동의한 경우</li>
              <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">5. 이용자 및 법정대리인의 권리와 그 행사방법</h2>
            <p>
              이용자는 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정할 수 있으며 가입해지를 요청할 수도 있습니다.
              개인정보 조회, 수정을 위해서는 &apos;설정&apos;을, 가입해지(동의철회)를 위해서는 &apos;회원탈퇴&apos;를 클릭하여 본인 확인 절차를 거치신 후 직접 열람, 정정 또는 탈퇴가 가능합니다.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">6. 개인정보에 관한 민원서비스</h2>
            <p>
              회사는 고객의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여 아래와 같이 관련 부서 및 개인정보관리책임자를 지정하고 있습니다.
            </p>
            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 mt-4">
              <p className="font-medium text-zinc-900">개인정보관리책임자</p>
              <p className="text-zinc-600 mt-1">이메일: privacy@nomi.ai</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
