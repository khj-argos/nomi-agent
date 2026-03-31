import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
          이용약관
        </h1>
        <p className="text-zinc-500 mb-12">시행일자: 2026년 3월 22일</p>

        <div className="space-y-10 text-zinc-700 leading-relaxed">
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제1조 (목적)</h2>
            <p>
              본 약관은 Nomi(이하 &quot;회사&quot;)가 제공하는 AI 에이전트 서비스(이하 &quot;서비스&quot;)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제2조 (용어의 정의)</h2>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>&quot;서비스&quot;란 회사가 제공하는 AI 에이전트 생성, 관리 및 메신저 연동 플랫폼을 의미합니다.</li>
              <li>&quot;회원&quot;이란 본 약관에 동의하고 서비스에 가입하여 회사가 제공하는 서비스를 이용하는 자를 의미합니다.</li>
              <li>&quot;인스턴스&quot;란 회원이 생성한 개별 AI 에이전트 실행 환경을 의미합니다.</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제3조 (서비스의 제공 및 변경)</h2>
            <p>
              회사는 회원에게 다음과 같은 서비스를 제공합니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>개인화된 AI 에이전트 생성 및 관리 도구</li>
              <li>Telegram 등 외부 메신저 연동 기능</li>
              <li>기타 회사가 추가 개발하거나 다른 회사와의 제휴계약 등을 통해 회원에게 제공하는 일체의 서비스</li>
            </ul>
            <p className="mt-4">
              회사는 서비스의 내용, 이용방법, 이용시간에 대하여 변경이 있는 경우에는 변경사유, 변경될 서비스의 내용 및 제공일자 등을 그 변경 전에 해당 서비스 초기화면에 게시합니다.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제4조 (회원의 의무)</h2>
            <p>
              회원은 다음 행위를 하여서는 안 됩니다.
            </p>
            <ul className="list-disc pl-5 space-y-2 text-zinc-600">
              <li>신청 또는 변경 시 허위내용의 등록</li>
              <li>타인의 정보도용</li>
              <li>회사가 게시한 정보의 변경</li>
              <li>회사가 정한 정보 이외의 정보(컴퓨터 프로그램 등) 등의 송신 또는 게시</li>
              <li>회사와 기타 제3자의 저작권 등 지적재산권에 대한 침해</li>
              <li>회사 및 기타 제3자의 명예를 손상시키거나 업무를 방해하는 행위</li>
              <li>외설 또는 폭력적인 메시지, 화상, 음성, 기타 공서양속에 반하는 정보를 서비스에 공개 또는 게시하는 행위</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제5조 (서비스의 중단)</h2>
            <p>
              회사는 컴퓨터 등 정보통신설비의 보수점검, 교체 및 고장, 통신의 두절 등의 사유가 발생한 경우에는 서비스의 제공을 일시적으로 중단할 수 있습니다.
              이 경우 회사는 제8조에 정한 방법으로 회원에게 통지합니다. 다만, 회사가 사전에 통지할 수 없는 부득이한 사유가 있는 경우 사후에 통지할 수 있습니다.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제6조 (면책조항)</h2>
            <p>
              회사는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.
              회사는 회원의 귀책사유로 인한 서비스 이용의 장애에 대하여 책임을 지지 않습니다.
              회사는 회원이 서비스를 이용하여 기대하는 수익을 상실한 것에 대하여 책임을 지지 않으며, 그 밖의 서비스를 통하여 얻은 자료로 인한 손해에 관하여 책임을 지지 않습니다.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900">제7조 (분쟁의 해결)</h2>
            <p>
              회사와 회원은 서비스와 관련하여 발생한 분쟁을 원만하게 해결하기 위하여 필요한 모든 노력을 하여야 합니다.
              전항의 노력에도 불구하고 소송이 제기될 경우 회사의 본사 소재지를 관할하는 법원을 전속관할법원으로 합니다.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
