# NanoClaw SaaS Platform — Technical Requirements Document

> 작성일: 2026-03-09  
> 상태: 초안  
> 범위: nanoclaw 엔진 제외한 플랫폼 전체 (Control Plane, Orchestrator, Web UI)

---

## 0. 전제 조건

### 0.1 nanoclaw 엔진이란

`nanoclaw`는 독립 오픈소스 프로젝트 (github.com/qwibitai/nanoclaw)로, 이 플랫폼의 **변경 불가 코어 엔진**이다. 플랫폼은 nanoclaw를 수정하지 않고, 그 위에 올라타는 방식으로 동작한다.

nanoclaw 한 인스턴스의 동작 원리:
- 단일 Node.js 프로세스
- `.env` 파일에서 `ANTHROPIC_API_KEY` 또는 `CLAUDE_CODE_OAUTH_TOKEN` 읽음
- 메시지 수신 → SQLite 저장 → Docker 컨테이너(Claude 에이전트) 스폰 → 응답 전송
- 상태: `store/messages.db` (SQLite), `groups/` (per-group CLAUDE.md), `data/` (세션, IPC)
- 주요 환경변수: `ASSISTANT_NAME`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `CREDENTIAL_PROXY_PORT`, `CONTAINER_IMAGE`

### 0.2 플랫폼이 하는 일

nanoclaw 인스턴스를 **사용자마다 하나씩** 생성·관리하는 인프라 레이어를 만든다.

```
사용자 A  ──→  [플랫폼 오케스트레이터]  ──→  nanoclaw 인스턴스 A (Docker 컨테이너)
사용자 B  ──→  [플랫폼 오케스트레이터]  ──→  nanoclaw 인스턴스 B (Docker 컨테이너)
사용자 C  ──→  [플랫폼 오케스트레이터]  ──→  nanoclaw 인스턴스 C (Docker 컨테이너)
```

---

## 1. 시스템 구성 요소

```
┌─────────────────────────────────────────────────────────────┐
│  플랫폼 (신규 개발)                                           │
│                                                               │
│  ┌─────────────────────────┐   ┌───────────────────────────┐ │
│  │   Web UI (Next.js)      │   │   Control Plane API       │ │
│  │   - 온보딩 플로우        │   │   (Next.js API Routes)    │ │
│  │   - 대시보드             │◄──│   - 인증/가입             │ │
│  │   - 설정 관리            │   │   - 인스턴스 CRUD         │ │
│  └─────────────────────────┘   │   - 결제 연동             │ │
│                                 │   - API 키 암호화 저장    │ │
│                                 └──────────┬──────────────┘ │
│                                            │ HTTP           │
│                                 ┌──────────▼──────────────┐ │
│                                 │   Instance Orchestrator  │ │
│                                 │   (독립 Node.js 프로세스) │ │
│                                 │   - 컨테이너 생성/삭제   │ │
│                                 │   - 설정 업데이트        │ │
│                                 │   - 헬스체크             │ │
│                                 └──────────┬──────────────┘ │
│                                 └──────────┬──────────────┘ │
└────────────────────────────────────────────┼────────────────┘
                                             │ Docker API
          ┌──────────────────────────────────▼───────────────┐
          │  nanoclaw 인스턴스들 (Docker 컨테이너)             │
          │  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
          │  │ user-abc  │  │ user-def  │  │ user-ghi  │    │
          │  │ nanoclaw  │  │ nanoclaw  │  │ nanoclaw  │    │
          │  │ process   │  │ process   │  │ process   │    │
          │  └───────────┘  └───────────┘  └───────────┘    │
          └──────────────────────────────────────────────────┘
```

### 구성 요소별 책임

| 컴포넌트 | 기술 | 역할 |
|---------|------|------|
| **Web UI** | Next.js 15 (App Router) | 온보딩, 대시보드, 설정 UI |
| **Control Plane API** | Next.js API Routes | 사용자 관리, 인스턴스 CRUD, 결제 |
| **Instance Orchestrator** | 독립 Node.js 서비스 | docker-compose 기반 인스턴스 생성/삭제/설정 관리 |
| **Platform DB** | PostgreSQL (Supabase) | 사용자, 인스턴스 메타데이터, 구독 |
| **nanoclaw 인스턴스** | Docker 컨테이너 | 에이전트 실행 (기존 코드 그대로) |

---

## 2. 레포 구조

```
nanoclaw-tamagotchi-service/          ← 메인 레포 (git)
│
├── packages/
│   ├── engine/                       ← nanoclaw (git submodule)
│   │   └── [nanoclaw 원본 코드]
│   │
│   ├── platform/                     ← Next.js 앱
│   │   ├── app/
│   │   │   ├── (auth)/               ← 로그인/가입 페이지
│   │   │   ├── onboarding/           ← 온보딩 플로우 (5 steps)
│   │   │   ├── dashboard/            ← 메인 대시보드
│   │   │   └── api/                  ← Control Plane API Routes
│   │   │       ├── auth/
│   │   │       ├── instances/
│   │   │       └── billing/
│   │   ├── components/
│   │   └── package.json
│   │
│   └── orchestrator/                 ← 독립 Node.js 서비스
│       ├── src/
│       └── package.json
│
├── docs/
│   └── trd.md                        ← 이 파일
│
├── package.json                      ← npm workspaces 루트
└── docker-compose.yml                ← 로컬 개발 환경
```

---

## 3. Instance Orchestrator (핵심)

### 3.1 역할

Control Plane API로부터 명령을 받아 nanoclaw Docker 컨테이너의 라이프사이클을 관리한다.

nanoclaw 프로세스를 Docker 컨테이너로 감싸는 이유:
- nanoclaw 자체가 내부적으로 Claude 에이전트 컨테이너를 스폰한다 (Docker-in-Docker 구조)
- 사용자 간 파일시스템/프로세스 완전 격리

### 3.2 인스턴스 라이프사이클

```
[생성 요청]
    │
    ▼
사용자 데이터 디렉토리 프로비저닝
  {DATA_ROOT}/{userId}/
    ├── store/          ← SQLite (messages.db)
    ├── groups/         ← per-group CLAUDE.md
    └── data/           ← sessions, IPC
    │
    ▼
docker-compose.yml에 서비스 추가
  nanoclaw-{userId}:
    image: nanoclaw:latest
    restart: unless-stopped    ← 항상 켜둠
    volumes:
      - {DATA_ROOT}/{userId}/store:/app/store
      - {DATA_ROOT}/{userId}/groups:/app/groups
      - {DATA_ROOT}/{userId}/data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock  ← DinD용
    environment:
      - ANTHROPIC_API_KEY={decryptedKey}
      - ASSISTANT_NAME={userConfig.name}
    │
    ▼
docker compose up -d nanoclaw-{userId}
    │
    ▼
[실행 중 — 항상]
    │
    ▼
[삭제 요청 시]
    → docker compose rm -sf nanoclaw-{userId}
    → 서비스 항목 제거
    → {DATA_ROOT}/{userId}/ 삭제 (선택: 백업 후 삭제)
```

### 3.3 Orchestrator API 스펙

Control Plane에서 HTTP로 호출. 내부 네트워크만 접근 가능 (외부 노출 없음).

```
POST   /instances                         인스턴스 생성 (디렉토리 프로비저닝 + compose 서비스 추가 + up)
DELETE /instances/:userId                 인스턴스 삭제 (컨테이너 중지 + 데이터 삭제)
GET    /instances/:userId/status          상태 조회 (running/error)
GET    /instances/:userId/logs            최근 로그 조회
POST   /instances/:userId/restart         컨테이너 재시작
PUT    /instances/:userId/config          CLAUDE.md 업데이트 후 재시작
POST   /instances/:userId/register-chat   Telegram chat_id → nanoclaw SQLite registered_groups에 등록
```

### 3.4 데이터 격리

```
/data/nanoclaw-instances/
    {userId-1}/
        store/messages.db        ← 메시지 이력
        groups/main/CLAUDE.md    ← 에이전트 메모리
        groups/main/logs/
        data/sessions/           ← Claude 세션
        data/ipc/                ← 컨테이너 IPC
    {userId-2}/
        ...
```

각 userId 디렉토리는 해당 컨테이너에만 마운트. 다른 컨테이너 접근 불가.

---

## 4. Control Plane API

### 4.1 인증

- **Provider**: Supabase Auth (Google, GitHub, Email)
- **Session**: JWT (Supabase 관리)
- **API 인증**: `Authorization: Bearer {supabase_jwt}`

### 4.2 엔드포인트

```
# 사용자/인스턴스
POST   /api/instances                사용자 최초 인스턴스 생성 (온보딩 완료 시)
GET    /api/instances/me             내 인스턴스 상태 조회
DELETE /api/instances/me             인스턴스 삭제 (계정 탈퇴)

# LLM 설정
PUT    /api/instances/me/llm         API 키 저장 (암호화) 또는 플랜 선택
GET    /api/instances/me/llm         현재 LLM 설정 조회 (키는 마스킹)

# 에이전트 설정
GET    /api/instances/me/config      현재 CLAUDE.md 조회
PUT    /api/instances/me/config      CLAUDE.md 업데이트
POST   /api/instances/me/config/generate  자연어 → CLAUDE.md 변환 (LLM 호출)

# 채널 연결
GET    /api/instances/me/channels    연결된 채널 목록
POST   /api/instances/me/channels    채널 추가
DELETE /api/instances/me/channels/:channel  채널 제거

# 관리
POST   /api/instances/me/restart     인스턴스 재시작
GET    /api/instances/me/logs        최근 로그

# 결제 (LemonSqueezy)
GET    /api/billing/checkout          Checkout URL 생성 → LemonSqueezy 결제 페이지로 리디렉션
GET    /api/billing/portal            Customer Portal URL 생성 → 구독 관리 페이지로 리디렉션
POST   /api/billing/webhook           LemonSqueezy 웹훅 수신 (subscription_created / updated / cancelled 등)
GET    /api/billing/subscription      현재 구독 상태 조회 (status, current_period_end)

### 4.3 API 키 보안

```
사용자 입력 API 키
    │
    ▼ AES-256-GCM 암호화
    │ 암호화 키: 환경변수 ENCRYPTION_KEY (플랫폼 비밀)
    ▼
PostgreSQL 저장 (encrypted_api_key 컬럼)
    │
    ▼ 인스턴스 시작 시만
복호화 → 컨테이너 환경변수로 주입 → nanoclaw credential proxy가 처리
    │
    ▼ 주입 직후
메모리에서 즉시 해제 (변수 overwrite)
```

**저장 절대 금지 위치**: 로그, 응답 바디, 환경변수 (컨테이너 외부)

---

## 5. Web UI (Next.js)

### 5.1 페이지 구성

```
/ (랜딩)
/login
/signup
/onboarding
    /onboarding/start              Step 0: 사용자 유형 선택 (Beginner / Advanced)

    ── Advanced 경로 ──
    /onboarding/llm-setup          Step 1A: API 키 직접 입력
    /onboarding/agent-setup        Step 2A: 에이전트 설정 (템플릿 or Monaco Editor)
    /onboarding/channel-connect    Step 3: Telegram 연결 (공통)
    /onboarding/complete           Step 4: 완료 (공통)

    ── Beginner 경로 ──
    /onboarding/name-setup         Step 1B: 에이전트 이름 짓기
    /onboarding/persona-select     Step 2B: 성격/역할 템플릿 선택 (비개발자 언어)
    /onboarding/channel-connect    Step 3: Telegram 연결 (공통, 가이드 강화)
    /onboarding/complete           Step 4: 완료 (공통)

/dashboard                         메인 대시보드
/settings
    /settings/agent                에이전트 설정 변경
    /settings/channels             채널 관리
    /settings/llm                  LLM 설정 변경 (Advanced: API 키 교체, Beginner: 플랜 업그레이드)
    /settings/billing              구독/결제
    /settings/account              계정 설정
```

### 5.2 온보딩 플로우 상세

**원칙: 가치 먼저, 입력 나중.** 사용자가 뭘 얻는지 먼저 느끼게 하고, 그 다음에 정보를 요청한다.

```
Step 0: 사용자 유형 선택 (/onboarding/start)
    ┌──────────────────────────┐   ┌──────────────────────────┐
    │  🚀 빠르게 시작하기       │   │  ⚙️  직접 설정하기         │
    │  (Beginner)              │   │  (Advanced)              │
    │  이름만 정하면 바로 시작  │   │  내 Anthropic API 키 사용 │
    └──────────────────────────┘   └──────────────────────────┘
              ↓                               ↓
       [Beginner 경로]               [Advanced 경로]

━━━ Beginner 경로 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1B: 에이전트 이름 짓기 (/onboarding/name-setup)
    - "당신의 AI에게 이름을 지어주세요"
    - 텍스트 입력 (기본값: Andy)
    - 짧은 프리뷰: "안녕하세요, 저는 {이름}이에요. 뭘 도와드릴까요?"

Step 2B: 성격/역할 선택 (/onboarding/persona-select)
    - 비개발자 언어로 템플릿 카드 그리드:
        ✍️ 글 잘 쓰는 친구   → 글쓰기, 교정, 아이디어
        💼 꼼꼼한 업무 비서   → 일정, 요약, 정리
        🔍 리서치 전문가      → 조사, 분석, 요약
        🎨 크리에이티브 파트너 → 아이디어, 브레인스토밍
        📚 학습 도우미        → 설명, 질문, 복습
        🙋 나만의 설정        → 직접 입력 (간단한 자연어)
    - 선택 → CLAUDE.md 자동 생성 (서버에서 LLM 호출)
    - API 키는 서버 내부 키 사용 (Beginner는 BYOK 불필요, Phase 2에서 유료 플랜으로 전환)

━━━ Advanced 경로 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1A: API 키 입력 (/onboarding/llm-setup)
    - Anthropic API 키 입력
    - 실시간 형식 검증 (sk-ant-... 패턴)
    - "검증하기" → POST /api/validate-key (Anthropic /v1/models 호출)
    - 성공 → OnboardingContext에 저장 (메모리만, sessionStorage 금지)

Step 2A: 에이전트 설정 (/onboarding/agent-setup)
    - 계층 1: 원클릭 템플릿 (Beginner 카드와 동일하나 기술적 설명 추가)
    - 계층 3: Monaco Editor 직접 편집 (CLAUDE.md 전체 제어)

━━━ 공통 경로 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 3: Telegram 연결 (/onboarding/channel-connect)
    ── Beginner 모드 (단계별 가이드 강화) ──
    ① [Telegram 앱 열기] 버튼
    ② [@BotFather 바로가기] 버튼
    ③ /newbot 명령어 → [클립보드 복사] 버튼
    ④ 봇 이름 / 유저네임 설정 안내
    ⑤ 발급된 토큰 붙여넣기 → 실시간 검증
    (각 단계에 스크린샷/GIF, 진행률 표시)

    ── Advanced 모드 ──
    - 봇 토큰 입력 + [검증하기]
    - 성공 시 봇 이름(@username) 표시

    공통: POST /api/validate-telegram → api.telegram.org/bot{token}/getMe

Step 4: 완료 (/onboarding/complete)
    → POST /api/onboarding/complete 호출
    → 서버: (Advanced) API 키 암호화 저장 / (Beginner) 서버 키 사용 플래그 저장
    → Orchestrator 인스턴스 생성 호출
    → 로딩 (~5초)
    → 완료 화면:
        Beginner: "🎉 {이름}가 Telegram에서 기다리고 있어요! 지금 바로 인사해보세요."
                  → [Telegram에서 /start 보내기] 버튼 (링크)
        Advanced: "✅ 설정 완료! 대시보드에서 확인하세요."
    → /dashboard 이동

⚠️  Telegram chat_id 등록은 2단계 프로세스:
    [온보딩 Step 3]  봇 토큰 검증 → 컨테이너에 TELEGRAM_BOT_TOKEN 주입
    [대시보드 배너]  사용자가 봇에게 /start 전송
                    → Orchestrator getUpdates 폴링 → chat_id 감지
                    → registered_groups 등록 + instance_channels.status 'connected'
                    → 배너 "✅ 연결 완료!" 로 전환 (5초 폴링)
```

### 5.3 대시보드

```
┌─────────────────────────────────────────┐
│ 내 AI 상태                               │
│ ● 온라인  |  마지막 활동: 2시간 전        │
│ 연결 채널: WhatsApp ✅  Telegram ✅       │
├─────────────────────────────────────────┤
│ 빠른 설정                                │
│ [에이전트 설정]  [채널 관리]  [재시작]   │
├─────────────────────────────────────────┤
│ 구독 정보                                │
│ Starter 플랜  |  다음 결제: 2026-04-01   │
└─────────────────────────────────────────┘
```

---

## 6. 데이터 모델 (Platform DB — PostgreSQL)

```sql
-- 사용자
users (
    id            UUID PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    created_at    TIMESTAMPTZ,
    -- Supabase Auth와 동기화
)

-- 인스턴스 (사용자당 1개)
instances (
    id               UUID PRIMARY KEY,
    user_id          UUID REFERENCES users(id),
    status           TEXT,  -- 'provisioning' | 'running' | 'stopped' | 'error' | 'deleted'
    assistant_name   TEXT DEFAULT 'Andy',
    encrypted_api_key TEXT,        -- AES-256-GCM
    api_key_provider  TEXT,        -- 'anthropic' | 'openai' | 'our_llm'
    data_path        TEXT,         -- 호스트 볼륨 경로
    created_at       TIMESTAMPTZ,
    last_active_at   TIMESTAMPTZ,
    container_id     TEXT          -- Docker container ID (실행 중일 때)
)

-- 채널 연결
instance_channels (
    id           UUID PRIMARY KEY,
    instance_id  UUID REFERENCES instances(id),
    channel_type TEXT,  -- 'whatsapp' | 'telegram' | 'slack' | 'discord'
    status       TEXT,  -- 'connected' | 'disconnected' | 'error'
    config       JSONB, -- 채널별 설정 (토큰 등, 암호화)
    connected_at TIMESTAMPTZ
)

-- 구독 (LemonSqueezy)
subscriptions (
    id                  UUID PRIMARY KEY,
    user_id             UUID REFERENCES users(id),
    ls_subscription_id  TEXT,  -- LemonSqueezy subscription ID
    ls_customer_id      TEXT,
    ls_variant_id       TEXT,
    ls_order_id         TEXT,
    status              TEXT,  -- 'active' | 'past_due' | 'cancelled' | 'expired'
    current_period_end  TIMESTAMPTZ
)
```

---

## 7. 요금 정책 (Pricing)

### 7.1 요금 구조 개요

```
Phase 1 (MVP)  — 단일 플랜, BYOK only
Phase 2+       — Ollama 포함 플랜 추가 (인프라 설계 후 결정)
```

### 7.2 Phase 1 — Starter 플랜

| 항목 | 내용 |
|------|------|
| **플랜명** | Starter |
| **가격** | $15 / 월 |
| **결제 수단** | LemonSqueezy (신용카드, PayPal 등 MoR 처리) |
| **LLM** | BYOK — 사용자 본인 Anthropic API 키 필수 |
| **인스턴스** | 1인당 1 nanoclaw 인스턴스 |
| **채널** | Telegram (MVP), WhatsApp (Phase 2+) |
| **지원** | 이메일 지원 |

**포함 내용:**
- 독립 nanoclaw 컨테이너 (격리 실행, `restart: unless-stopped`)
- 독립 SQLite DB + CLAUDE.md 저장소
- 웹 대시보드 (상태 조회, 설정 변경, 재시작)
- Telegram 채널 연결
- API 키 AES-256-GCM 암호화 저장

**포함되지 않는 내용:**
- LLM 비용 (사용자 Anthropic 계정에 직접 청구)
- WhatsApp, Slack, Discord 채널 (Phase 2+)

### 7.3 Phase 2 — 플랜 구조 (TBD)

```
Ollama 인프라 설계 완료 후 결정.
예상 방향:
  - Starter: Ollama LLM 기본 포함 (API 키 불필요, 진입 장벽 낮춤)
  - Pro:     BYOK(Anthropic/OpenAI), 다중 채널, 우선 지원
가격: Ollama VM 운영 비용 확정 후 산정.
```

### 7.4 LemonSqueezy 연동 방식

```
사용자 결제 흐름:
  1. /settings/billing → GET /api/billing/checkout
  2. LemonSqueezy Checkout 페이지 리디렉션
  3. 결제 완료 → LemonSqueezy → POST /api/billing/webhook 호출
  4. 웹훅에서 subscriptions 테이블 업데이트 (service_role key 사용)
  5. 구독 상태 'active' → 서비스 이용 가능

구독 상태 가드:
  - 미구독 사용자: 온보딩 완료 후 /settings/billing 리디렉션
  - 구독 만료(past_due/cancelled): 대시보드 접근 차단 + 결제 유도 배너
  - 웹훅 이벤트: subscription_created, subscription_updated, subscription_cancelled
```

### 7.5 마진 구조

| 항목 | 내용 |
|------|------|
| 수익 | $15/월 × 구독자 수 |
| 비용 | Hetzner VM + LemonSqueezy 수수료(5% + 50¢) |
| LLM 비용 | 사용자 직접 부담 → 우리 마진 리스크 없음 |
| 손익분기 | VM €8~18/월 기준, 2~3명 구독자면 커버 |

---

## 8. 보안 요구사항

### 7.1 테넌트 격리 체크리스트

- [ ] 사용자 인스턴스 디렉토리는 해당 컨테이너에만 마운트
- [ ] 컨테이너 간 직접 네트워크 통신 불가 (Docker network isolation)
- [ ] API 키는 컨테이너 시작 시만 복호화, 즉시 해제
- [ ] Control Plane → Orchestrator 통신은 내부 네트워크만
- [ ] Orchestrator API는 외부 인터넷 노출 없음

### 7.2 API 키 관리

- 저장: AES-256-GCM, 암호화 키는 환경변수에만 존재
- 전달: 컨테이너 환경변수로 주입 → nanoclaw credential proxy가 수신
- 로깅: API 키 포함 가능한 모든 필드 로그 제외 처리
- 접근 감사: 키 복호화 이벤트 로깅 (키 값 제외)

### 7.3 인증/인가

- 모든 API 엔드포인트: Supabase JWT 필수
- 인스턴스 접근: `instances.user_id === auth.uid` 검증
- Orchestrator API: 플랫폼 내부 서비스 토큰으로만 접근

---

## 9. 인프라 구성 (MVP)

```
[클라우드 VM — Hetzner CX32, €8/월]
│
├── Docker Engine
│   ├── nanoclaw-platform (Next.js 컨테이너)
│   ├── nanoclaw-orchestrator (Orchestrator 컨테이너)
│   └── nanoclaw-{userId}... (사용자 인스턴스들)
│
├── /data/nanoclaw-instances/  ← 영구 볼륨
│
└── Caddy (리버스 프록시, TLS 자동)

[외부 서비스]
├── Supabase        ← Auth + PostgreSQL (무료 티어로 시작)
└── LemonSqueezy  ← 결제/구독 관리 (MoR)
```

### 비용 추정 (인스턴스 수별)

`restart: unless-stopped`로 컨테이너를 항상 켜두므로 사용자 수 = 상시 실행 컨테이너 수.
nanoclaw 1인스턴스 메모리: 약 150~200MB.

| 사용자 수 | VM 사양 | 월 비용 | 비고 |
|-----------|---------|---------|------|
| ~10명 | Hetzner CX22 (2vCPU/4GB) | €4/월 | 메모리 여유 있음 |
| ~30명 | Hetzner CX32 (4vCPU/8GB) | €8/월 | 메모리 ~6GB 사용 |
| ~100명 | Hetzner CX42 (8vCPU/16GB) | €18/월 | VM 스케일업 또는 멀티 VM 전환 시점 |

---

## 10. 개발 단계별 범위

### Phase 1 — MVP

**목표**: 사용자가 가입 → API 키 입력 → 에이전트 설정 → Telegram 연결 → AI 동작 + 결제까지 5분 내 완료

**포함 범위:**
- [ ] 사용자 가입/로깅 (Supabase Auth)
- [ ] API 키 입력 및 암호화 저장 (BYOK만)
- [ ] 에이전트 설정 (계층 1 템플릿 + 계층 3 직접 편집)
- [ ] 채널 연결 (Telegram 우선, WhatsApp 추후)
- [ ] Instance Orchestrator (생성/삭제/재시작, docker-compose 기반)
- [ ] 기본 대시보드 (상태 조회, 재시작)
- [ ] **LemonSqueezy 결제 연동 — Starter 플랜 $15/월** (BYOK 구독 가드)
- [ ] 사용자 가입/로그인 (Supabase Auth)
- [ ] API 키 입력 및 암호화 저장 (BYOK만)
- [ ] 에이전트 설정 (계층 1 템플릿 + 계층 3 직접 편집)
- [ ] 채널 연결 (Telegram 우선, WhatsApp 추후)
- [ ] Instance Orchestrator (생성/삭제/재시작, docker-compose 기반)
- [ ] 기본 대시보드 (상태 조회, 재시작)

**제외 범위 (Phase 2+):**
- 자연어 → CLAUDE.md 변환 (계층 2)
- **Ollama (자체 LLM 플랜)** — MVP는 Anthropic API 키 필수 (BYOK only). Ollama는 이미지에 포함 불가 (모델 크기 12GB~70GB+), VM 별도 서비스로 분리 설계 필요 → Phase 2에서 별도 인프라 설계
- WhatsApp 채널 연결
- MCP 마켓플레이스
- CLAUDE.md 자동 진화
- LemonSqueezy 결제 + 유료 플랜
- 자연어 → CLAUDE.md 변환 (계층 2)
- **Ollama (자체 LLM 플랜)** — MVP는 Anthropic API 키 필수 (BYOK only). Ollama는 이미지에 포함 불가 (모델 크기 12GB~70GB+), VM 별도 서비스로 분리 설계 필요 → Phase 2에서 별도 인프라 설계
- WhatsApp 채널 연결
- MCP 마켓플레이스
- CLAUDE.md 자동 진화
### Phase 2

- LemonSqueezy 결제 + 유료 플랜
- 자연어 에이전트 설정 (계층 2)
- WhatsApp 채널 연결
- Slack, Discord 채널 추가
- **Ollama 자체 LLM 플랜** (별도 인프라 설계 필요)
  - Ollama를 VM에 독립 서비스로 실행, nanoclaw 컨테이너들이 공유 호출
  - 20b 모델: CPU 전용 VM 가능하나 응답 속도 느림
  - 120b 모델: GPU VM 필수 (Hetzner GPU 서버, 월 수백 유로)
  - 동시 사용자 병목 문제 별도 설계 필요

### Phase 3

- CLAUDE.md 자동 진화 (대화 패턴 학습)
- 첫 주 시퀀스 (Day 0~7 온보딩 경험)
- MCP 마켓플레이스
- 팀 플랜

---

## 11. 미결 사항

| 번호 | 질문 | 현재 생각 | 결정 필요 시점 |
|------|------|-----------|---------------|
| Q1 | Docker-in-Docker — nanoclaw가 에이전트 컨테이너를 스폰할 때 Docker socket 마운트 방식 보안 검토 필요 | `/var/run/docker.sock` 마운트로 MVP 시작, 추후 Rootless Docker 또는 별도 DinD 컨테이너 전환 고려 | Phase 1 인프라 설계 시 |
| Q2 | 사용자 인스턴스 볼륨을 로컬 파일시스템으로 할지 외부 스토리지로 할지 | 로컬 파일시스템으로 MVP 시작 | 스케일 시점 |
| Q3 | CLAUDE.md 자동 진화를 어떤 방식으로 구현할지 | TBD | Phase 3 설계 시 |
