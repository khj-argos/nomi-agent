# Nomi Agent (nanoclaw-tamagotchi) 시스템 아키텍처

> 작성일: 2026-05-28
> 분석 기준: 현재 main 브랜치 + 실제 구동 중인 Docker 컨테이너

## 1. 서비스 개요

**Nomi Agent**는 멀티테넌트 SaaS 플랫폼으로, 사용자마다 격리된 AI agent 컨테이너를 동적으로 띄워 Slack/Telegram/Discord 등 메시징 채널에 연결시킨다.

- 사용자별 nanoclaw agent 인스턴스 (격리된 Docker 컨테이너)
- 무료 티어(Ollama Gemma) + BYOK(Claude) 듀얼 LLM 백엔드
- 웹 대시보드에서 CLAUDE.md 프롬프트 편집, 채널 관리, 사용량 모니터링

---

## 2. 모노레포 구조

```
nanoclaw-tamagotchi-service/
├── packages/
│   ├── platform/          # Next.js 16 — 웹 UI + Control Plane API
│   │   ├── src/app/
│   │   │   ├── auth/              # 로그인/회원가입
│   │   │   ├── onboarding/        # 4단계 온보딩
│   │   │   ├── dashboard/         # 사용자 대시보드
│   │   │   └── api/               # Control Plane API routes
│   │   └── src/lib/               # Supabase, crypto, LemonSqueezy 클라이언트
│   │
│   ├── orchestrator/      # NestJS — 컨테이너 라이프사이클 + LLM 프록시
│   │   └── src/
│   │       ├── instances/         # 인스턴스 CRUD
│   │       ├── containers/        # Docker 라이프사이클 관리
│   │       ├── channels/          # Slack/Telegram 봇 등록
│   │       ├── billing/           # 구독 동기화
│   │       ├── llm-proxy/         # LLM 요청 프록시 (BYOK 보호)
│   │       ├── monitor/           # 헬스체크
│   │       └── scheduler/         # 주기 작업
│   │
│   └── engine/            # nanoclaw (git submodule, AI agent 실체)
│
├── supabase/              # DB 스키마 마이그레이션
├── docs/                  # TRD, 개발 계획, 아키텍처 문서
├── data/nanoclaw-instances/{userId}/  # 사용자별 영구 데이터
├── docker-compose.yml
├── .env                                # 공통 환경변수
└── infra/                              # 인프라 (AWS 등)
```

---

## 3. 런타임 컴포넌트 다이어그램

```
┌──────────────────────────────────────────┐
│  사용자 (Slack / Telegram / Web Dashboard)│
└────────┬─────────────────────────────────┘
         │ ① 메시지 / 웹 요청
         ▼
┌──────────────────────────────────────────┐    ┌──────────────┐
│  🌐 nanoclaw-platform                    │    │   Supabase   │
│     Next.js 16 · 포트 3000               │◄──►│  Auth + DB   │
│     - 로그인/온보딩/대시보드             │    │ (외부 서비스) │
│     - Control Plane API                  │    └──────────────┘
└────────┬─────────────────────────────────┘
         │ ② Internal HTTP (ORCHESTRATOR_SECRET)
         ▼
┌──────────────────────────────────────────┐
│  ⚙️  nanoclaw-orchestrator               │
│     NestJS · 내부 포트 4001 (healthy)    │    Slack Socket Mode ✅
│     ├─ ContainerManagerService           │       (외부 연결)
│     ├─ SchedulerService (주기 작업)      │
│     ├─ LlmProxyService                   │
│     ├─ SlackSocketService                │
│     └─ HealthController                  │
└────────┬─────────────────────────────────┘
         │ ③ Docker socket으로 사용자 컨테이너 생성
         ▼
┌──────────────────────────────────────────┐
│  🤖 nanoclaw-user-{userId}  (per user)   │
│     image: nanoclaw-agent:latest         │
│     마운트: ./data/nanoclaw-instances/   │
│             {userId}  →  /workspace      │
│     ├─ /workspace/input.json (메시지)    │
│     └─ /workspace/data/                  │
│        ├─ groups/main/CLAUDE.md          │
│        ├─ store/messages.db (SQLite)     │
│        └─ ipc/ (입출력 파이프)           │
└────────┬─────────────────────────────────┘
         │ ④ LLM 호출 (Anthropic 호환 API)
         ▼
┌──────────────────────────────────────────┐
│  🧠 LLM Proxy (orchestrator 내부)        │
│     POST /llm/v1/messages                │
│     - ANTHROPIC_AUTH_TOKEN 검증          │
│     - active_llm에 따라 분기:             │
│       · anthropic_byok → Anthropic API   │
│       · gemma_hosted   → Ollama          │
│     - 일일 토큰 한도 체크 (무료 티어)    │
└──────────────────────────────────────────┘
```

---

## 4. Docker 컨테이너 매핑

| 컨테이너 | 이미지 | 외부 포트 | 역할 | 라이프사이클 |
|---------|--------|----------|------|-------------|
| `nanoclaw-platform-1` | `nanoclaw-platform:latest` | 3000 | 웹 UI + Control Plane | compose로 영구 |
| `nanoclaw-orchestrator-1` | `nanoclaw-orchestrator:latest` | 내부 4001 | 컨테이너 관리 + LLM Proxy | compose로 영구 |
| `nanoclaw-user-{uuid}` | `nanoclaw-agent:latest` | 없음 (내부) | 사용자별 AI agent | **동적 생성/제거** |
| `redis` | `redis:alpine` | 6379 | 캐싱/큐 | 외부 컨테이너 |

### docker-compose.yml 핵심 설정

```yaml
platform:
  ports: ["3000:3000"]
  env_file:
    - .env
    - packages/platform/.env.local    # NEXT_PUBLIC_*, ORCHESTRATOR_SECRET
  environment:
    - PORT=3000                        # .env의 PORT=4001 오버라이드
    - ORCHESTRATOR_URL=http://orchestrator:4001

orchestrator:
  env_file:
    - .env
    - packages/orchestrator/.env       # SLACK_*, AWS_*, LEMON_SQUEEZY_*
  environment:
    - PORT=4001
    - ENGINE_IMAGE_URI=nanoclaw-agent:latest
    - DATA_ROOT=${DATA_ROOT:-/data/nanoclaw-instances}
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock   # Docker socket 마운트
    - ${DATA_ROOT}:${DATA_ROOT}                   # 사용자 데이터 마운트
```

---

## 5. Agent 컨테이너 생성 경로

`ContainerManagerService`에 **2가지 시작 함수**가 있다:

### 5-1. `startContainerWithMessage(userId, prompt, chatJid)` — 정상 경로
- Slack/Telegram 메시지 수신 시 호출
- `hostDataPath/input.json` **생성** → entrypoint가 읽음
- 환경변수에 `RUNNER_TYPE=claude` 또는 `ollama` 설정
- 마운트: `${hostDataPath}:/workspace`

### 5-2. `startContainer(userId)` — 스케줄러 경로 ⚠️
- SchedulerService의 due 작업으로 호출
- **input.json을 만들지 않음** → entrypoint.sh가 실패하여 컨테이너 재시작 루프
- **버그 후보**: 수정 필요

### entrypoint.sh
```bash
#!/bin/bash
set -e
if [ "${RUNNER_TYPE}" = "ollama" ]; then
  node /app/dist/ollama-runner.js < /workspace/input.json
else
  node /app/dist/index.js < /workspace/input.json
fi
```

---

## 6. 환경변수 파일 구조

### 6-1. 분리 원칙

| 파일 | 적용 대상 | 주요 키 |
|------|----------|--------|
| `.env` (루트) | 공통 + compose 변수 보간 | `PORT`, `DATA_ROOT`, `SUPABASE_URL`, `OLLAMA_*`, `ANTHROPIC_API_URL` |
| `packages/orchestrator/.env` | orchestrator 전용 시크릿 | `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `AWS_*`, `ECS_*`, `LEMON_SQUEEZY_*`, `AES_SECRET_KEY` |
| `packages/platform/.env.local` | platform 전용 | `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_APP_URL`, `ORCHESTRATOR_SECRET`, `ENCRYPTION_KEY` |

### 6-2. 주요 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `ENGINE_IMAGE_URI` | agent 컨테이너로 띄울 이미지 | `nanoclaw-agent:latest` |
| `DATA_ROOT` | 호스트의 사용자 데이터 디렉토리 | `./data/nanoclaw-instances` |
| `ANTHROPIC_BASE_URL` | agent → LLM Proxy 엔드포인트 (자동 주입) | `http://orchestrator:4001/llm/v1` |
| `ANTHROPIC_AUTH_TOKEN` | LLM Proxy 인증용 internal token (자동 발급) | (런타임 생성) |
| `LLM_PROXY_INTERNAL_SECRET` | internal token 서명 키 | (시크릿) |
| `AGENT_DOCKER_NETWORK` | agent 컨테이너가 붙을 Docker 네트워크 | `nanoclaw` |

---

## 7. 메시지 처리 데이터 흐름 (예: 사용자가 Slack에 메시지 전송)

```
1. 사용자 "@bot 안녕" Slack에 입력
        ↓
2. Slack Socket Mode → orchestrator SlackSocketService 수신
        ↓
3. orchestrator → Supabase DB에서 user/instance/active_llm 조회
        ↓
4. orchestrator → ./data/nanoclaw-instances/{uuid}/input.json 작성
   { "prompt": "안녕", "chatJid": "...", "groupFolder": "slack_main", ... }
        ↓
5. orchestrator → Docker socket으로 nanoclaw-user-{uuid} 컨테이너 생성
   - 마운트: ./data/nanoclaw-instances/{uuid} → /workspace
   - env: ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN (internal token)
        ↓
6. agent entrypoint.sh → node dist/index.js < /workspace/input.json
        ↓
7. agent → http://orchestrator:4001/llm/v1/messages 호출
        ↓
8. LLM Proxy → ANTHROPIC_AUTH_TOKEN 검증 → routing
   - anthropic_byok: 사용자 BYOK 키로 Anthropic 호출
   - gemma_hosted:   Ollama로 라우팅
        ↓
9. agent → /workspace/ipc/messages 폴더에 응답 작성
        ↓
10. orchestrator → ipc 폴더 watcher → Slack에 답글 전송
```

---

## 8. 외부 의존성

| 서비스 | 역할 | 설정 위치 |
|--------|------|----------|
| **Supabase** | Auth, PostgreSQL (instances/users/schedules 메타데이터) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **LemonSqueezy** | 구독 결제, 웹훅 | `LEMON_SQUEEZY_*` |
| **Anthropic API** | Claude 호출 (BYOK 사용자) | `ANTHROPIC_API_URL` |
| **Ollama** | Gemma 4 (무료 티어 기본) | `OLLAMA_BASE_URL`, `OLLAMA_DEFAULT_MODEL` |
| **Slack API** | Socket Mode, 메시지 수신/송신 | `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN` |
| **Telegram API** | 봇 토큰 등록 | (사용자별 토큰, DB 저장) |
| **Redis** | (확인 필요 — 캐시/세션/큐) | `redis:6379` |
| **AWS (선택)** | ECS/EFS (프로덕션 배포) | `AWS_*`, `ECS_*` |

---

## 9. 보안 모델

1. **BYOK 키 보호**: 사용자 Anthropic API 키는 AES-256-GCM으로 DB에 암호화 저장 (`AES_SECRET_KEY`)
2. **컨테이너 격리**: agent는 사용자 API 키 미노출, LLM Proxy의 internal token만 받음
3. **Internal Token**: 짧은 TTL의 JWT (orchestrator 발급, LLM Proxy 검증)
4. **Platform → Orchestrator**: `ORCHESTRATOR_SECRET` 헤더 기반 내부 인증
5. **Socket 마운트**: orchestrator가 `/var/run/docker.sock`에 접근하므로 호스트 권한 동등 — **프로덕션에서는 dockerd 분리/원격 socket 사용 권장**

---

## 10. 현재 알려진 이슈 / 개선 포인트

| 항목 | 현상 | 영향도 |
|------|------|-------|
| `startContainer()`가 input.json 미생성 | 스케줄러 트리거 시 agent 컨테이너 재시작 루프 | 중 |
| 루트 `.env`에 PORT=4001 (orchestrator용) | platform이 같은 env_file 사용 시 포트 충돌 → 명시적 PORT=3000 오버라이드로 해결됨 | 해결됨 |
| `.env` 분리(packages별) ↔ compose 로딩 | compose에서 다중 `env_file` 지정 필요 → 해결됨 | 해결됨 |
| open-webui가 포트 3000 점유 + 자동 재기동 | platform 시작 실패 → open-webui 중지 후 platform 기동 | 운영 주의 |
| `DATA_ROOT` 기본값 `/data/nanoclaw-instances` 비존재 | 실제는 프로젝트 내 `./data/nanoclaw-instances` 사용 | 주의 |

---

## 11. 로컬 개발 가이드 (간단)

```bash
# 1. 의존성 설치 (모노레포 워크스페이스)
npm install

# 2. 환경변수 설정 (각 패키지 .env.example 참고)
cp .env.example .env
cp packages/orchestrator/.env.example packages/orchestrator/.env
cp packages/platform/.env.local.example packages/platform/.env.local

# 3. 이미지 빌드
docker compose build

# 4. agent 이미지 별도 빌드 (engine 서브모듈)
cd packages/engine
docker build -t nanoclaw-agent:latest .
cd ../..

# 5. 스택 기동
docker compose up -d

# 6. 확인
curl http://localhost:3000           # Platform
docker logs -f nanoclaw-tamagotchi-service-orchestrator-1
```

---

## 12. 참고 문서

- [`docs/trd.md`](./trd.md) — 기술 요구사항 정의서
- [`docs/dev-plan.md`](./dev-plan.md) — 개발 계획
- [`docs/deployment.md`](./deployment.md) — 배포 가이드
- [`docs/llm-dev-setup.md`](./llm-dev-setup.md) — LLM 개발 환경 셋업
- [`README.md`](../README.md) — 프로젝트 개요
