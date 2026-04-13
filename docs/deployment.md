# Deployment Guide

EC2 인스턴스에 Docker Compose로 세 개의 이미지를 운영합니다.

## Docker 이미지 구성

| 이미지 | 역할 | 크기 |
|--------|------|------|
| `nanoclaw-agent` | 유저별 AI 에이전트 컨테이너 (Orchestrator가 동적 실행) | ~2.4GB |
| `nanoclaw-orchestrator` | NestJS — 컨테이너 라이프사이클 관리 | ~350MB |
| `nanoclaw-platform` | Next.js — 웹 대시보드 + Control Plane API | ~270MB |

```
nanoclaw-platform  :3000 (외부)
       │ http://orchestrator:4001 (내부 네트워크)
nanoclaw-orchestrator
       │ /var/run/docker.sock
       └ /data/nanoclaw-instances/{userId}  →  nanoclaw-agent 컨테이너에 bind mount
```

> `nanoclaw-agent`는 compose 서비스가 아닙니다. Orchestrator가 유저 요청 시 Docker API로 직접 실행합니다.

---

## EC2 최초 세팅

### 1. Docker 설치

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### 2. 레포 클론

```bash
git clone --recurse-submodules https://github.com/your-org/nanoclaw-tamagotchi-service.git
cd nanoclaw-tamagotchi-service
```

### 3. 데이터 디렉토리 생성

Orchestrator가 agent 컨테이너를 띄울 때 유저별 데이터를 호스트 경로에 bind mount합니다.
named volume 대신 호스트 경로를 직접 사용해야 sibling 컨테이너 간 마운트가 정상 동작합니다.

```bash
sudo mkdir -p /data/nanoclaw-instances
sudo chown $USER:$USER /data/nanoclaw-instances
```

### 4. 환경변수 설정

```bash
cp .env.example .env
vi .env
```

`.env` 항목은 [환경변수 레퍼런스](#환경변수-레퍼런스)를 참고하세요.

### 5. 이미지 빌드

```bash
# agent 이미지 (한 번만 빌드, 변경 시 재빌드)
docker build -t nanoclaw-agent:latest -f packages/engine/container/Dockerfile packages/engine/container/

# platform + orchestrator
docker compose build
```

### 6. DB 마이그레이션

```bash
supabase db push
```

### 7. 서비스 실행

```bash
docker compose up -d
docker compose logs -f
```

---

## 운영 명령어

```bash
# 상태 확인
docker compose ps

# 로그
docker compose logs -f platform
docker compose logs -f orchestrator

# 재시작
docker compose restart

# 이미지 재빌드 후 반영
docker compose build platform && docker compose up -d platform

# 실행 중인 agent 컨테이너 목록
docker ps --filter "label=nanoclaw.managed=true"

# 전체 중단
docker compose down
```

---

## 이미지 업데이트

### platform / orchestrator 업데이트

```bash
git pull
docker compose build platform orchestrator
docker compose up -d
```

### agent 이미지 업데이트

```bash
docker build -t nanoclaw-agent:latest -f packages/engine/container/Dockerfile packages/engine/container/
# 실행 중인 agent 컨테이너는 다음 기동 시 새 이미지 사용
```

---

## 환경변수 레퍼런스

`.env` 파일 하나로 platform과 orchestrator 두 서비스가 공유합니다.

### Platform (Next.js)

| 변수 | 설명 | 생성 방법 |
|------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Supabase Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | 동일 위치 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | 동일 위치 |
| `ENCRYPTION_KEY` | 유저 API 키 암호화 (AES-256-GCM) | `openssl rand -base64 32` |
| `ORCHESTRATOR_SECRET` | platform → orchestrator 내부 인증 토큰 | `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | 서비스 퍼블릭 URL | `https://your-domain.com` |
| `LEMON_SQUEEZY_API_KEY` | LemonSqueezy API 키 | LemonSqueezy Dashboard |
| `LEMON_SQUEEZY_STORE_ID` | 스토어 ID | 동일 위치 |
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | 웹훅 서명 시크릿 | 동일 위치 |
| `LEMON_SQUEEZY_MONTHLY_VARIANT_ID` | 월간 플랜 variant ID | 동일 위치 |
| `LEMON_SQUEEZY_YEARLY_VARIANT_ID` | 연간 플랜 variant ID | 동일 위치 |

### Orchestrator (NestJS)

| 변수 | 설명 | 생성 방법 |
|------|------|-----------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | Supabase Dashboard → Project Settings → API |
| `SUPABASE_JWT_SECRET` | JWT 검증 시크릿 | Supabase Dashboard → Project Settings → API → JWT Secret |
| `AES_SECRET_KEY` | DB에 저장된 API 키 복호화 | `openssl rand -hex 32` |
| `WEBHOOK_BASE_URL` | Telegram webhook 콜백 기본 URL | `https://your-domain.com` |
| `ALLOWED_ORIGINS` | CORS 허용 출처 | platform URL과 동일 |
| `SLACK_APP_TOKEN` | Slack Socket Mode 앱 토큰 | Slack App 설정 (선택) |
| `SLACK_BOT_TOKEN` | Slack Bot 토큰 | Slack App 설정 (선택) |
| `CONTAINER_IDLE_TIMEOUT_MS` | 유휴 컨테이너 자동 종료 시간 (ms) | 기본값: `3600000` (1시간) |
| `CONTAINER_STARTUP_TIMEOUT_MS` | 컨테이너 기동 대기 시간 (ms) | 기본값: `30000` (30초) |

> `SUPABASE_SERVICE_ROLE_KEY`는 platform과 orchestrator가 같은 값을 공유합니다.
> `ENCRYPTION_KEY`(base64)와 `AES_SECRET_KEY`(hex)는 서로 다른 포맷으로 생성하세요.

---

## 트러블슈팅

### agent 컨테이너가 데이터를 못 읽는 경우

```bash
# 호스트 경로 존재 여부 확인
ls /data/nanoclaw-instances/

# orchestrator 컨테이너 내부 경로 확인
docker compose exec orchestrator ls /data/nanoclaw-instances/
```

### orchestrator health check 실패

```bash
docker compose logs orchestrator
# /api/v1/health 엔드포인트 응답 확인
curl http://localhost:4001/api/v1/health
```

### agent 이미지 없음 오류

```bash
docker images | grep nanoclaw-agent
# 없으면 재빌드
docker build -t nanoclaw-agent:latest -f packages/engine/container/Dockerfile packages/engine/container/
```
