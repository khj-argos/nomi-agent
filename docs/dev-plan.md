# NanoClaw SaaS — MVP 개발 계획

> 작성일: 2026-03-09
> 기준: TRD Phase 1 (MVP)

---

## nanoclaw 엔진 분석 핵심 사실

1. **환경변수로 완전히 제어됨** — `ASSISTANT_NAME`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN` 등 → 컨테이너 env로 주입
2. **데이터 경로가 `process.cwd()` 기준** — `/app/store`, `/app/groups`, `/app/data` → 볼륨 마운트 경로 고정
3. **채널은 스킬(skill)로 추가됨** — `/add-telegram` 스킬이 `src/channels/telegram.ts` 코드를 추가하고 재빌드 → SaaS 이미지에 미리 포함 필요
4. **CLAUDE.md 위치** — `groups/main/CLAUDE.md` → 플랫폼에서 직접 파일 작성으로 에이전트 설정
5. **채널 등록** — nanoclaw의 SQLite `registered_groups` 테이블에 JID 등록 필요 (`tg:<chat-id>` 형식)

---

## 전체 의존성 그래프

```
[A] nanoclaw SaaS 이미지 빌드 (Telegram 코드 포함)
    ↓
[B] Supabase 설정 (DB 스키마 + Auth)
    ↓                    ↓
[C] Orchestrator 구현    [D] Platform 공통 기반 (crypto, supabase client, orchestrator client)
    ↓                    ↓
         [E] Control Plane API (Next.js API Routes)
              ↓
         [F] 온보딩 UI (4 steps)
              ↓
         [G] 대시보드 UI
              ↓
         [H] LemonSqueezy 결제 연동
              ↓
         [I] 배포 (Hetzner VM + Docker Compose + Caddy)
```

## Phase A: nanoclaw SaaS 이미지 빌드

### 왜 먼저?
Orchestrator가 `docker run nanoclaw:saas-latest`로 컨테이너를 띄워야 하는데, 이미지가 없으면 아무것도 안 됨.
`/add-telegram` 스킬은 소스코드를 수정 + 재빌드하는 구조라, 이미지 빌드 전에 한 번만 적용해야 함.

### 작업 내용

```
packages/engine/ 디렉토리에서:

1. /add-telegram 스킬 적용
   npx tsx scripts/apply-skill.ts .claude/skills/add-telegram
   → src/channels/telegram.ts 추가됨
   → src/channels/index.ts에 import './telegram.js' 추가됨
   → grammy 패키지 설치됨

2. 빌드 확인
   npm run build

3. Docker 이미지 빌드
   ./container/build.sh
   → 이미지 이름: nanoclaw:saas-latest (또는 nanoclaw:latest)

4. 이미지 동작 확인
   docker run --rm nanoclaw:saas-latest node -e "console.log('ok')"
```

### 이미지에서 env로 제어되는 값들
```
ANTHROPIC_API_KEY    ← 사용자 API 키
TELEGRAM_BOT_TOKEN   ← 사용자 봇 토큰
ASSISTANT_NAME       ← 에이전트 이름 (기본: Andy)
CONTAINER_IMAGE      ← 에이전트 컨테이너 이미지 (nanoclaw-agent:latest)
```

### 완료 기준
- `docker images | grep nanoclaw` 에서 이미지 확인
- Telegram 봇 토큰 env 주입 시 정상 동작

---

## Phase B: Supabase 설정

### B-1. 프로젝트 생성 + Auth 설정
```
- supabase.com에서 프로젝트 생성
- Auth providers: Email (필수)
- Site URL: http://localhost:3000 (개발)
- Redirect URLs 등록: http://localhost:3000/auth/callback
```

### B-2. DB 스키마 (Supabase SQL Editor에서 실행)

```sql
-- users (Supabase auth.users와 동기화)
create table public.users (
  id uuid references auth.users(id) primary key,
  email text not null,
  created_at timestamptz default now()
);

-- 신규 가입 시 자동으로 users 레코드 생성
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- instances (사용자당 1개)
create table public.instances (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) unique not null,
  status text default 'provisioning',
    -- 'provisioning' | 'running' | 'stopped' | 'error' | 'deleted'
  assistant_name text default 'Andy',
  encrypted_api_key text,
  api_key_iv text,        -- AES-GCM IV
  api_key_tag text,       -- AES-GCM auth tag
  api_key_provider text default 'anthropic',
  data_path text,         -- 호스트 볼륨 경로 (/data/nanoclaw-instances/{userId})
  container_name text,    -- nanoclaw-{userId}
  created_at timestamptz default now(),
  last_active_at timestamptz
);

-- instance_channels (채널 연결 정보)
create table public.instance_channels (
  id uuid default gen_random_uuid() primary key,
  instance_id uuid references public.instances(id) on delete cascade,
  channel_type text not null,  -- 'telegram' | 'discord' | 'slack'
  status text default 'pending',
  encrypted_config jsonb,      -- 봇 토큰 등 암호화 저장
  connected_at timestamptz
);

-- subscriptions (LemonSqueezy 구독 정보)
create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.users(id) on delete cascade unique not null,
  ls_subscription_id    text unique not null,   -- LemonSqueezy subscription ID
  ls_customer_id        text not null,
  ls_variant_id         text not null,
  ls_order_id           text not null,
  status                text not null,          -- active | past_due | cancelled | expired
  current_period_end    timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- RLS 정책 (user_id = auth.uid() 강제)
alter table public.users enable row level security;
alter table public.instances enable row level security;
alter table public.instance_channels enable row level security;
alter table public.subscriptions enable row level security;

create policy "users: self only" on public.users
  for all using (auth.uid() = id);

create policy "instances: own only" on public.instances
  for all using (auth.uid() = user_id);

create policy "channels: own instance only" on public.instance_channels
  for all using (
    instance_id in (
      select id from public.instances where user_id = auth.uid()
    )
  );

create policy "subscriptions: self only" on public.subscriptions
  for select using (auth.uid() = user_id);
  -- INSERT/UPDATE/DELETE는 서버사이드(webhook)에서만 → service_role key 사용
```

### B-3. 환경변수
```
# packages/platform/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...          # openssl rand -base64 32
ORCHESTRATOR_URL=http://localhost:4001
ORCHESTRATOR_SECRET=...     # openssl rand -hex 32
```

### 완료 기준
- Supabase Dashboard에서 테이블 확인
- 이메일 가입 → `users` 테이블에 자동 레코드 생성 확인

---

## Phase C: Orchestrator 구현

### 파일 구조
```
packages/orchestrator/src/
├── index.ts                  ← Express 서버 (포트 4001)
├── routes/
│   └── instances.ts          ← /instances 라우트 전체
├── services/
│   ├── compose.ts            ← docker-compose.instances.yml 파일 조작
│   ├── docker.ts             ← docker CLI 실행 (child_process)
│   └── filesystem.ts         ← 사용자 데이터 디렉토리 프로비저닝
├── middleware/
│   └── auth.ts               ← X-Orchestrator-Secret 헤더 검증
└── types.ts                  ← 요청/응답 타입
```

### services/compose.ts — 핵심 로직
```typescript
import { parse, stringify } from 'yaml';  // npm install yaml
import fs from 'fs';

const COMPOSE_FILE = process.env.COMPOSE_FILE
  ?? '/app/docker-compose.instances.yml';

function readCompose() {
  if (!fs.existsSync(COMPOSE_FILE)) return { services: {} };
  return parse(fs.readFileSync(COMPOSE_FILE, 'utf-8'));
}

function writeCompose(data: unknown) {
  fs.writeFileSync(COMPOSE_FILE, stringify(data), 'utf-8');
}

export function addInstance(userId: string, config: {
  dataPath: string;
  apiKey: string;
  assistantName: string;
  telegramToken: string;
}) {
  const compose = readCompose();
  compose.services[`nanoclaw-${userId}`] = {
    image: 'nanoclaw:saas-latest',
    restart: 'unless-stopped',
    volumes: [
      `${config.dataPath}/store:/app/store`,
      `${config.dataPath}/groups:/app/groups`,
      `${config.dataPath}/data:/app/data`,
      '/var/run/docker.sock:/var/run/docker.sock',
    ],
    environment: [
      `ANTHROPIC_API_KEY=${config.apiKey}`,
      `ASSISTANT_NAME=${config.assistantName}`,
      `TELEGRAM_BOT_TOKEN=${config.telegramToken}`,
    ],
  };
  writeCompose(compose);
}

export function removeInstance(userId: string) {
  const compose = readCompose();
  delete compose.services[`nanoclaw-${userId}`];
  writeCompose(compose);
}
```

### services/docker.ts — docker CLI 실행
```typescript
import { execSync } from 'child_process';

const COMPOSE_FILE = process.env.COMPOSE_FILE
  ?? '/app/docker-compose.instances.yml';

export function startInstance(userId: string) {
  execSync(
    `docker compose -f ${COMPOSE_FILE} up -d nanoclaw-${userId}`,
    { stdio: 'pipe' }
  );
}

export function stopAndRemoveInstance(userId: string) {
  execSync(
    `docker compose -f ${COMPOSE_FILE} rm -sf nanoclaw-${userId}`,
    { stdio: 'pipe' }
  );
}

export function getInstanceStatus(userId: string): 'running' | 'stopped' | 'error' {
  try {
    const out = execSync(
      `docker inspect --format='{{.State.Status}}' nanoclaw-${userId}`,
      { stdio: 'pipe' }
    ).toString().trim().replace(/'/g, '');
    return out === 'running' ? 'running' : 'stopped';
  } catch {
    return 'error';
  }
}

export function getInstanceLogs(userId: string, lines = 100): string {
  try {
    return execSync(
      `docker logs --tail=${lines} nanoclaw-${userId} 2>&1`,
      { stdio: 'pipe' }
    ).toString();
  } catch {
    return '';
  }
}

export function restartInstance(userId: string) {
  execSync(`docker restart nanoclaw-${userId}`, { stdio: 'pipe' });
}
```

### services/filesystem.ts — 사용자 데이터 디렉토리
```typescript
import fs from 'fs';
import path from 'path';

const DATA_ROOT = process.env.DATA_ROOT ?? '/data/nanoclaw-instances';

export function provisionUserDir(userId: string): string {
  const userDir = path.join(DATA_ROOT, userId);
  fs.mkdirSync(path.join(userDir, 'store'), { recursive: true });
  fs.mkdirSync(path.join(userDir, 'groups', 'main'), { recursive: true });
  fs.mkdirSync(path.join(userDir, 'data'), { recursive: true });
  return userDir;
}

export function writeClaudeMd(userId: string, content: string) {
  const filePath = path.join(DATA_ROOT, userId, 'groups', 'main', 'CLAUDE.md');
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function readClaudeMd(userId: string): string {
  const filePath = path.join(DATA_ROOT, userId, 'groups', 'main', 'CLAUDE.md');
  return fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8')
    : '';
}

export function deleteUserDir(userId: string) {
  const userDir = path.join(DATA_ROOT, userId);
  fs.rmSync(userDir, { recursive: true, force: true });
}
```

### routes/instances.ts — API 엔드포인트
```typescript
// POST /instances — 생성
router.post('/', async (req, res) => {
  const { userId, apiKey, assistantName, telegramToken, claudeMd } = req.body;

  const dataPath = provisionUserDir(userId);        // 1. 디렉토리 생성
  if (claudeMd) writeClaudeMd(userId, claudeMd);   // 2. CLAUDE.md 작성
  addInstance(userId, {                             // 3. compose에 추가
    dataPath, apiKey, assistantName, telegramToken
  });
  startInstance(userId);                            // 4. 컨테이너 시작

  res.json({ success: true, containerName: `nanoclaw-${userId}` });
});

// DELETE /instances/:userId — 삭제
router.delete('/:userId', (req, res) => {
  const { keepData } = req.query;
  stopAndRemoveInstance(req.params.userId);
  removeInstance(req.params.userId);
  if (keepData !== 'true') deleteUserDir(req.params.userId);
  res.json({ success: true });
});

// GET /instances/:userId/status
router.get('/:userId/status', (req, res) => {
  res.json({ status: getInstanceStatus(req.params.userId) });
});

// GET /instances/:userId/logs
router.get('/:userId/logs', (req, res) => {
  res.json({ logs: getInstanceLogs(req.params.userId) });
});

// POST /instances/:userId/restart
router.post('/:userId/restart', (req, res) => {
  restartInstance(req.params.userId);
  res.json({ success: true });
});

// PUT /instances/:userId/config — CLAUDE.md 업데이트 후 재시작
router.put('/:userId/config', (req, res) => {
  writeClaudeMd(req.params.userId, req.body.claudeMd);
  restartInstance(req.params.userId);
  res.json({ success: true });
});

// POST /instances/:userId/register-chat — Telegram chat_id 등록
// 사용자가 봇에 /start 전송 후 대시보드 폴링으로 호출됨
router.post('/:userId/register-chat', async (req, res) => {
  const { chatId } = req.body;  // 예: "tg:123456789"
  const dbPath = path.join(DATA_ROOT, req.params.userId, 'store', 'messages.db');

  // nanoclaw SQLite registered_groups 테이블에 직접 삽입
  const db = new Database(dbPath);
  db.prepare(
    `INSERT OR IGNORE INTO registered_groups (jid, name) VALUES (?, ?)`
  ).run(`tg:${chatId}`, 'main');
  db.close();

  res.json({ success: true });
});
```

### 완료 기준
- `curl -X POST localhost:4001/instances -H 'X-Orchestrator-Secret: ...' -d '{...}'` 시 실제 컨테이너 뜸
- `docker ps | grep nanoclaw-{userId}` 확인

---

## Phase D: Platform 공통 기반

### 파일 구조
```
packages/platform/src/
├── lib/
│   ├── supabase/
│   │   ├── client.ts         ← 브라우저용 Supabase client (createBrowserClient)
│   │   └── server.ts         ← 서버용 Supabase client (createServerClient, cookies)
│   ├── crypto.ts             ← AES-256-GCM 암호화/복호화
│   └── orchestrator.ts       ← Orchestrator HTTP 클라이언트
└── types/
    └── index.ts              ← 공통 타입 (Instance, Channel 등)
```

### lib/crypto.ts — AES-256-GCM
```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');

export function encrypt(text: string): {
  encrypted: string;
  iv: string;
  tag: string;
} {
  const iv = randomBytes(12);  // GCM 표준 12바이트, 매번 새로 생성
  const cipher = createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(text, 'utf8'),
    cipher.final(),
  ]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decrypt(encrypted: string, iv: string, tag: string): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return (
    decipher.update(encrypted, 'base64', 'utf8') + decipher.final('utf8')
  );
}
```

### lib/orchestrator.ts — 내부 HTTP 클라이언트
```typescript
const BASE = process.env.ORCHESTRATOR_URL!;
const SECRET = process.env.ORCHESTRATOR_SECRET!;

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Orchestrator-Secret': SECRET,
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Orchestrator error: ${res.status}`);
  return res.json();
}

export const orchestrator = {
  createInstance: (data: CreateInstanceData) =>
    call('/instances', { method: 'POST', body: JSON.stringify(data) }),
  deleteInstance: (userId: string, keepData = false) =>
    call(`/instances/${userId}?keepData=${keepData}`, { method: 'DELETE' }),
  getStatus: (userId: string) =>
    call(`/instances/${userId}/status`),
  getLogs: (userId: string) =>
    call(`/instances/${userId}/logs`),
  restart: (userId: string) =>
    call(`/instances/${userId}/restart`, { method: 'POST' }),
  updateConfig: (userId: string, claudeMd: string) =>
    call(`/instances/${userId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ claudeMd }),
    }),
};
```

### 완료 기준
- `encrypt(decrypt(x)) === x` 유닛 테스트 통과
- Orchestrator 클라이언트 타입 에러 없음

---

## Phase E: Control Plane API

### 파일 구조
```
packages/platform/src/app/api/
├── auth/
│   └── callback/route.ts              ← Supabase OAuth 콜백
├── validate-key/route.ts              ← API 키 유효성 검증 (Anthropic 테스트 호출)
├── validate-telegram/route.ts         ← Telegram 봇 토큰 검증
├── onboarding/
│   └── complete/route.ts             ← 온보딩 완료 → 인스턴스 생성 트리거 (핵심)
└── instances/
    └── me/
        ├── route.ts                   ← GET (상태), DELETE (삭제)
        ├── restart/route.ts           ← POST
        ├── logs/route.ts              ← GET
        ├── llm/route.ts               ← GET (마스킹), PUT (키 변경)
        ├── config/route.ts            ← GET/PUT CLAUDE.md
        └── channels/
            ├── route.ts               ← GET (목록), POST (추가)
            └── [channel]/route.ts     ← DELETE (제거)
```

### 핵심: POST /api/onboarding/complete
```typescript
export async function POST(request: Request) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { assistantName, apiKey, telegramToken, claudeMd } = await request.json();

  // 1. API 키 암호화
  const { encrypted, iv, tag } = encrypt(apiKey);

  // 2. instances 레코드 생성 (status: provisioning)
  const { data: instance } = await supabase
    .from('instances')
    .insert({
      user_id: user.id,
      status: 'provisioning',
      assistant_name: assistantName,
      encrypted_api_key: encrypted,
      api_key_iv: iv,
      api_key_tag: tag,
    })
    .select()
    .single();

  // 3. Orchestrator 호출 (복호화 키를 내부망으로 전달)
  await orchestrator.createInstance({
    userId: user.id,
    apiKey,             // 복호화 상태로 전달 (내부 네트워크, HTTPS)
    assistantName,
    telegramToken,
    claudeMd,
  });

  // 4. 상태 업데이트
  await supabase
    .from('instances')
    .update({
      status: 'running',
      container_name: `nanoclaw-${user.id}`,
    })
    .eq('id', instance.id);

  // 5. 채널 레코드 저장 (토큰 암호화)
  if (telegramToken) {
    const encToken = encrypt(telegramToken);
    await supabase.from('instance_channels').insert({
      instance_id: instance.id,
      channel_type: 'telegram',
      status: 'connected',
      encrypted_config: encToken,
    });
  }

  return Response.json({ success: true });
}
```

### GET /api/instances/me/llm — API 키 마스킹 (절대 복호화 반환 금지)
```typescript
return Response.json({
  provider: instance.api_key_provider,
  maskedKey: `sk-ant-...${instance.encrypted_api_key.slice(-4)}`,
  hasKey: !!instance.encrypted_api_key,
});
```

### POST /api/validate-key — Anthropic API 키 유효성 검증

```typescript
// app/api/validate-key/route.ts
export async function POST(req: Request) {
  const { apiKey } = await req.json();

  // 1. 형식 검증 (서버에서도 재확인)
  if (!/^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(apiKey)) {
    return Response.json({ valid: false, error: 'Invalid key format' }, { status: 400 });
  }

  // 2. Anthropic API 실제 호출로 유효성 확인
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (res.status === 401) {
      return Response.json({ valid: false, error: 'Invalid API key' });
    }
    if (!res.ok) {
      return Response.json({ valid: false, error: 'Anthropic API error' });
    }

    return Response.json({ valid: true });
  } catch {
    return Response.json({ valid: false, error: 'Network error' }, { status: 502 });
  }
}
```

### POST /api/validate-telegram — Telegram 봇 토큰 유효성 검증

```typescript
// app/api/validate-telegram/route.ts
export async function POST(req: Request) {
  const { token } = await req.json();

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    if (!data.ok) {
      return Response.json({ valid: false, error: 'Invalid bot token' });
    }

    return Response.json({
      valid: true,
      botName: data.result.first_name,
      botUsername: data.result.username,  // 대시보드 배너에서 @{botUsername} 표시용
    });
  } catch {
    return Response.json({ valid: false, error: 'Network error' }, { status: 502 });
  }
}
```

### 완료 기준
- 전체 엔드포인트 curl 테스트 통과
- API 키가 응답에 절대 노출 안 됨
- 유효하지 않은 Anthropic 키 → 401 응답 정상 처리
- 유효하지 않은 Telegram 토큰 → 에러 응답 정상 처리

---

## Phase F: 온보딩 UI

### 스텝 간 상태 관리 방침

```
onboarding/layout.tsx 에 OnboardingContext 정의
  └── mode: 'beginner' | 'advanced'   ← Step 0에서 결정
  └── apiKey: string                  ← Advanced Step 1A에서 저장
  └── assistantName: string           ← Step 1B(Beginner) / Step 2A(Advanced)에서 저장
  └── claudeMd: string                ← Step 2B / 2A에서 저장
  └── telegramToken: string           ← Step 3에서 저장

⚠️  sessionStorage / localStorage 절대 금지 — XSS로 API 키 탈취 가능
Step 4에서 Context 데이터를 한번에 서버로 전송 → 서버에서 암호화 후 DB 저장
```

```typescript
// onboarding/layout.tsx
'use client';
import { createContext, useContext, useState } from 'react';

type OnboardingState = {
  mode: 'beginner' | 'advanced';  // Step 0에서 결정
  apiKey: string;                  // Advanced만 사용
  assistantName: string;
  claudeMd: string;
  telegramToken: string;
};

const OnboardingContext = createContext<{
  state: OnboardingState;
  setState: (patch: Partial<OnboardingState>) => void;
} | null>(null);

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('OnboardingContext not found');
  return ctx;
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const [state, setStateRaw] = useState<OnboardingState>({
    mode: 'beginner', apiKey: '', assistantName: 'Andy', claudeMd: '', telegramToken: '',
  });
  const setState = (patch: Partial<OnboardingState>) =>
    setStateRaw(prev => ({ ...prev, ...patch }));

  return (
    <OnboardingContext.Provider value={{ state, setState }}>
      {/* 스텝 인디케이터 — mode에 따라 다른 스텝 수 표시 */}
      {children}
    </OnboardingContext.Provider>
  );
}
```

### 파일 구조
```
packages/platform/src/app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx
└── onboarding/
    ├── layout.tsx                ← OnboardingContext 제공 + 스텝 인디케이터
    ├── start/page.tsx            ← Step 0: 사용자 유형 선택 (Beginner / Advanced)
    │
    │   ── Beginner 경로 ──
    ├── name-setup/page.tsx       ← Step 1B: 에이전트 이름 짓기
    ├── persona-select/page.tsx   ← Step 2B: 성격/역할 템플릿 선택
    │
    │   ── Advanced 경로 ──
    ├── llm-setup/page.tsx        ← Step 1A: Anthropic API 키 입력
    ├── agent-setup/page.tsx      ← Step 2A: 에이전트 설정 (템플릿 or Monaco Editor)
    │
    │   ── 공통 경로 ──
    ├── channel-connect/page.tsx  ← Step 3: Telegram 연결 (Beginner 가이드 강화)
    └── complete/page.tsx         ← Step 4: 인스턴스 생성 + 완료 (분기 화면)
```

### Step 0: 사용자 유형 선택 (start/page.tsx)
```
카드 2개를 나란히 표시:

┌──────────────────────────┐   ┌──────────────────────────┐
│  🚀 빠르게 시작하기       │   │  ⚙️  직접 설정하기         │
│  (Beginner)              │   │  (Advanced)              │
│  이름만 정하면 바로 시작  │   │  내 Anthropic API 키 사용 │
└──────────────────────────┘   └──────────────────────────┘

클릭 시:
  - OnboardingContext에 mode 저장
  - Beginner → /onboarding/name-setup
  - Advanced → /onboarding/llm-setup
```

---

### ── Beginner 경로 ──

### Step 1B: 에이전트 이름 짓기 (name-setup/page.tsx)
```
- 헤드라인: "당신의 AI에게 이름을 지어주세요"
- 텍스트 입력 (기본값: Andy)
- 실시간 프리뷰: "안녕하세요, 저는 {이름}이에요. 뭘 도와드릴까요?"
- 다음 → OnboardingContext에 assistantName 저장 → /onboarding/persona-select
```

### Step 2B: 성격/역할 선택 (persona-select/page.tsx)
```
비개발자 언어로 템플릿 카드 그리드 (6개):
  ✍️ 글 잘 쓰는 친구    → 글쓰기, 교정, 아이디어
  💼 꼼꼼한 업무 비서   → 일정, 요약, 정리
  🔍 리서치 전문가      → 조사, 분석, 요약
  🎨 크리에이티브 파트너 → 아이디어, 브레인스토밍
  📚 학습 도우미        → 설명, 질문, 복습
  🙋 나만의 설정        → 자연어 입력 (텍스트 박스 노출)

선택 시:
  - 미리 작성된 CLAUDE.md 템플릿 문자열 상수 로드
  - "나만의 설정" 선택 시 → 텍스트 박스에 자연어 입력
    → [다음] 클릭 시 POST /api/instances/me/config/generate (서버 내부 키 사용)
    → 서버에서 LLM 호출 → CLAUDE.md 생성 반환
  - OnboardingContext에 claudeMd 저장
  → /onboarding/channel-connect

⚠️  Beginner는 BYOK 불필요 — API 키 입력 없음, 서버 내부 키 사용
    (Phase 2에서 유료 플랜 전환 시 BYOK 선택지 추가)
```

---

### ── Advanced 경로 ──

### Step 1A: API 키 입력 (llm-setup/page.tsx)
```
- 텍스트 입력: Anthropic API 키
- 실시간 형식 검증: /^sk-ant-[a-zA-Z0-9_-]{40,}$/
- "검증하기" 버튼 → POST /api/validate-key
  → 서버에서 Anthropic /v1/models 호출로 유효성 확인
- 성공 → OnboardingContext에 apiKey 저장 (컴포넌트 메모리, sessionStorage 금지)
- 실패 → 에러 메시지 표시
→ /onboarding/agent-setup
```

### Step 2A: 에이전트 설정 (agent-setup/page.tsx)
```
계층 1: 원클릭 템플릿 카드 그리드
  - 개발자 어시스턴트  (기술적 설명 포함)
  - 글쓰기 도우미
  - 업무 비서
  - 리서치 전문가
  - 크리에이티브 파트너
  - 나만의 설정 (→ Monaco Editor 노출)

계층 3 ("나만의 설정" 선택 시): Monaco Editor 직접 편집
  - @monaco-editor/react
  - CLAUDE.md 전체 내용 편집
  - 실시간 미리보기

각 템플릿 = 미리 작성된 CLAUDE.md 문자열 상수
선택 후 OnboardingContext에 claudeMd, assistantName 저장
→ /onboarding/channel-connect
```

---

### ── 공통 경로 ──

### Step 3: Telegram 연결 (channel-connect/page.tsx)
```
── Beginner 모드 (단계별 가이드 강화) ──
  ① [Telegram 앱 열기] 버튼
  ② [@BotFather 바로가기] 버튼
  ③ /newbot 명령어 복사 → [클립보드 복사] 버튼
  ④ 봇 이름 / 유저네임 설정 안내 (스크린샷/GIF 포함)
  ⑤ 발급된 토큰 붙여넣기 → 실시간 검증
  (각 단계에 진행률 표시 바)

── Advanced 모드 ──
  - 봇 토큰 입력 필드만 표시
  - "연결 테스트" 버튼

공통:
  → POST /api/validate-telegram
  → 서버에서 api.telegram.org/bot{token}/getMe 호출
  → 성공 시 봇 이름(@username) 표시
  → OnboardingContext에 telegramToken 저장 (컴포넌트 메모리만)
→ /onboarding/complete
```

### Step 4: 완료 (complete/page.tsx)
```
"시작하기" 버튼 클릭:
  → POST /api/onboarding/complete (OnboardingContext 데이터 전송)
  → 서버:
      (Advanced) API 키 AES-256-GCM 암호화 후 instances.encrypted_api_key 저장
      (Beginner) api_key_provider = 'our_llm' 플래그 저장 (키 없음)
  → Orchestrator 인스턴스 생성 호출
  → 로딩 스피너 (~5초, 컨테이너 시작 대기)

완료 화면 (mode에 따라 분기):
  Beginner:
    "🎉 {이름}가 Telegram에서 기다리고 있어요! 지금 바로 인사해보세요."
    → [Telegram에서 /start 보내기] 버튼 (딥링크)
    → /dashboard 이동

  Advanced:
    "✅ 설정 완료! 대시보드에서 확인하세요."
    → /dashboard 바로 이동 (버튼)
```

### 완료 기준
- API 키가 sessionStorage/localStorage에 절대 저장되지 않음
- Beginner 경로: 이름 + 페르소나 선택만으로 온보딩 완료 (API 키 입력 없음)
- Advanced 경로: API 키 검증 → CLAUDE.md 설정 → Telegram 연결 완료
- 신규 유저가 온보딩 전체 완료 후 Telegram에서 AI 응답 받음

---

## Phase G: 대시보드 UI

### Telegram chat_id 등록 플로우 (대시보드 진입 후)

```
온보딩 완료 → 대시보드 진입
    │
    ▼
instance_channels.status === 'pending' 이면 배너 표시:
    "Telegram 봇(@{botUsername})에게 /start 를 보내세요!"
    │
    ▼ 사용자가 봇에 /start 전송
    │
    ▼ nanoclaw가 chat_id 수신 (grammy onMessage)
    │ → nanoclaw 내부적으로 registered_groups에 자동 등록
    │   (또는 Orchestrator가 SQLite에 직접 삽입)
    │
    ▼ 대시보드 폴링 (5초 간격, GET /api/instances/me/channels)
    │ instance_channels.status === 'connected' 감지
    ▼
배너 "✅ Telegram 연결 완료!" 로 전환
```

**구현 방법 — nanoclaw SQLite 직접 삽입 방식 (MVP):**
```
사용자가 /start 전송
    → Orchestrator가 봇 토큰으로 getUpdates 폴링 (30초 간격)
    → chat_id 감지 → POST /instances/{userId}/register-chat
    → nanoclaw SQLite registered_groups 테이블에 직접 삽입
    → instance_channels.status 'pending' → 'connected' 업데이트
```

### 파일 구조
```
packages/platform/src/app/dashboard/
├── page.tsx                    ← 메인 대시보드 (Server Component)
├── _components/
│   ├── StatusCard.tsx          ← 인스턴스 상태 표시
│   ├── TelegramSetupBanner.tsx ← chat_id 등록 대기 배너 (status=pending일 때)
│   ├── ChannelList.tsx         ← 연결된 채널 목록
│   └── QuickActions.tsx        ← 재시작, 설정 바로가기
└── settings/
    ├── agent/page.tsx          ← CLAUDE.md 편집 (Monaco Editor)
    ├── channels/page.tsx       ← 채널 추가/제거
    ├── llm/page.tsx            ← API 키 변경
    └── account/page.tsx        ← 계정 설정
```

### 메인 대시보드 데이터 흐름
```typescript
// Server Component — Supabase + Orchestrator 병렬 호출
export default async function DashboardPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 병렬 fetch
  const [instanceResult, statusResult] = await Promise.all([
    supabase.from('instances').select('*, instance_channels(*)').single(),
    orchestrator.getStatus(user.id).catch(() => ({ status: 'error' })),
  ]);

  return (
    <DashboardView
      instance={instanceResult.data}
      liveStatus={statusResult.status}
    />
  );
}
```

### 완료 기준
- 인스턴스 상태 실시간 조회
- CLAUDE.md 편집 후 저장 → 컨테이너 자동 재시작
- 채널 목록 표시

---

## Phase H: LemonSqueezy 결제 연동

### 왜 LemonSqueezy?

| 항목 | LemonSqueezy | Stripe |
|------|-------------|--------|
| 수수료 | 5% + 50¢ per transaction | 2.9% + 30¢ |
| 세금/VAT 처리 | **자동** (MoR — Merchant of Record) | 직접 처리 필요 |
| 월정액 | 없음 | 없음 |
| 셋업 복잡도 | **낮음** | 높음 |
| 한국 payout | ✅ (bank wire + PayPal) | ✅ |
| 결제 수단 | 21가지 (PayPal 포함) | 다수 |
| 구독 지원 | ✅ weekly/monthly/yearly | ✅ |

**결론**: 수수료는 더 높지만, MoR로 세금/VAT 자동 처리 → 글로벌 판매 즉시 가능.
초기 MVP에서 세금 처리 복잡도를 피하려면 LemonSqueezy가 적합.

### 플랜 정의

| 플랜명 | 가격 | LLM | 내용 |
|------|------|-----|------|
| **Starter** | **$15/월** | BYOK필수 (Anthropic) | 독립 인스턴스, Telegram, 대시보드 |

**LemonSqueezy 설정:**
- Product: "NanoClaw Starter"
- Variant 하나: Monthly $15/월
- `LEMON_SQUEEZY_MONTHLY_VARIANT_ID` 환경변수에 Variant ID 저장

**구독 상태 가드 동작:**
- 미구독 사용자: 온보딩 완료 후 `/settings/billing` 리디렉션 (결제 유도)
- `past_due` / `cancelled` / `expired`: 대시보드 차단 + 결제 유도 배너 표시
- 인스턴스 생성 API: `requireActiveSubscription()` 실패 시 402 응답


### 핵심 개념

```
Store (스토어)
  └── Product (상품)
        └── Variant (요금제)
              └── Subscription (구독)
                    └── Order (결제 내역)
```

- **Variant**: 월간/연간 요금제 각각 하나의 Variant
- **Subscription**: 사용자당 하나, status: `active | past_due | cancelled | expired`
- **Checkout URL**: 서버에서 LemonSqueezy API로 생성 → 사용자를 리디렉션
- **Customer Portal**: LemonSqueezy 호스팅 → 구독 관리 URL 생성해서 사용자 리디렉션

### 환경변수

```env
LEMON_SQUEEZY_API_KEY=          # LemonSqueezy API 키 (서버 전용)
LEMON_SQUEEZY_STORE_ID=         # 스토어 ID
LEMON_SQUEEZY_WEBHOOK_SECRET=   # 웹훅 서명 검증용 시크릿

# Variant IDs (LemonSqueezy 대시보드에서 복사)
LEMON_SQUEEZY_MONTHLY_VARIANT_ID=
LEMON_SQUEEZY_YEARLY_VARIANT_ID=
```

### 작업 내용

#### H-1. SDK 설치 및 초기화

```bash
# packages/platform
npm install @lemonsqueezy/lemonsqueezy.js
```

```typescript
// src/lib/lemonsqueezy.ts
import { lemonSqueezySetup } from '@lemonsqueezy/lemonsqueezy.js';

lemonSqueezySetup({
  apiKey: process.env.LEMON_SQUEEZY_API_KEY!,
  onError: (error) => console.error('LemonSqueezy error:', error),
});
```

#### H-2. API Routes
#### H-3. API Routes

```
app/api/billing/
├── checkout/route.ts     ← Checkout URL 생성
├── portal/route.ts       ← Customer Portal URL 생성
└── webhook/route.ts      ← LemonSqueezy 웹훅 수신
```

**checkout/route.ts**
```typescript
// POST /api/billing/checkout
// body: { variantId: string }
// response: { checkoutUrl: string }

import { createCheckout } from '@lemonsqueezy/lemonsqueezy.js';
import '@/lib/lemonsqueezy';

export async function POST(req: Request) {
  const { variantId } = await req.json();
  const user = await getServerUser(); // Supabase auth

  const checkout = await createCheckout(
    process.env.LEMON_SQUEEZY_STORE_ID!,
    variantId,
    {
      checkoutOptions: { embed: false },
      checkoutData: {
        email: user.email,
        custom: { user_id: user.id },
      },
      productOptions: {
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      },
    }
  );

  return Response.json({ checkoutUrl: checkout.data?.data.attributes.url });
}
```

**webhook/route.ts**
```typescript
// POST /api/billing/webhook
// LemonSqueezy → 이쪽으로 이벤트 전송

import crypto from 'crypto';

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-signature');

  // 서명 검증
  const hmac = crypto.createHmac('sha256', process.env.LEMON_SQUEEZY_WEBHOOK_SECRET!);
  const digest = hmac.update(rawBody).digest('hex');
  if (digest !== signature) return new Response('Unauthorized', { status: 401 });

  const event = JSON.parse(rawBody);
  const eventName = event.meta.event_name;
  const userId = event.meta.custom_data?.user_id;

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
      await upsertSubscription(userId, event.data.attributes);
      break;
    case 'subscription_cancelled':
      await updateSubscriptionStatus(userId, 'cancelled');
      break;
    case 'subscription_expired':
      await updateSubscriptionStatus(userId, 'expired');
      break;
    case 'subscription_payment_failed':
      await handlePaymentFailed(userId, event.data.attributes);
      break;
  }
  return new Response('OK');
}
```

#### H-4. 웹훅 LemonSqueezy 대시보드에 등록

```
URL: https://{domain}/api/billing/webhook
Events:
  ✅ subscription_created
  ✅ subscription_updated
  ✅ subscription_cancelled
  ✅ subscription_resumed
  ✅ subscription_expired
  ✅ subscription_payment_success
  ✅ subscription_payment_failed
  ✅ subscription_payment_recovered
  ✅ order_created
```

**개발 중 로컬 테스트**: ngrok으로 로컬 서버 터널링
```bash
ngrok http 3000
# https://xxxx.ngrok.io/api/billing/webhook 으로 웹훅 등록
```

#### H-5. 구독 상태 가드

```typescript
// src/lib/subscription.ts
export async function requireActiveSubscription(userId: string) {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId)
    .single();

  if (!data || data.status !== 'active') {
    throw new Error('No active subscription');
  }
  return data;
}
```

Control Plane API의 인스턴스 생성 엔드포인트에서 `requireActiveSubscription` 호출.

### 완료 기준

- [ ] Checkout URL 생성 → 사용자가 결제 페이지로 이동
- [ ] 결제 완료 후 `subscriptions` 테이블에 레코드 생성
- [ ] 웹훅 서명 검증 통과
- [ ] 구독 취소/만료 시 상태 업데이트
- [ ] 미구독 사용자 인스턴스 생성 차단
- [ ] Customer Portal URL 생성 (구독 관리 페이지)

---

## 주요 주의사항

| # | 항목 | 내용 |
|---|------|------|
| 1 | **Telegram 내장 이미지** | `/add-telegram` 스킬이 소스 수정 + 재빌드 구조. SaaS 이미지 빌드 전에 반드시 적용 |
| 2 | **AES-GCM IV 재사용 금지** | 암호화할 때마다 `randomBytes(12)`로 새 IV 생성. 재사용 시 보안 파탄 |
| 3 | **API 키 메모리 해제** | Orchestrator에서 컨테이너 env 주입 후 변수 즉시 overwrite |
| 4 | **Orchestrator 외부 노출 금지** | docker-compose에서 ports 없이 내부 네트워크만. platform만 접근 |
| 5 | **CLAUDE.md 경로** | `{DATA_ROOT}/{userId}/groups/main/CLAUDE.md` — nanoclaw가 `groups/` 기준으로 읽음 |
| 6 | **docker socket 권한** | Orchestrator 컨테이너가 `/var/run/docker.sock` 마운트 필요 |
| 7 | **Telegram 채팅 등록** | nanoclaw의 SQLite에 `registered_groups` 레코드 필요. 컨테이너 시작 후 IPC 또는 직접 DB 접근으로 등록 |
| 8 | **LemonSqueezy 웹훅 서명** | `x-signature` 헤더 반드시 검증. Raw body로 HMAC-SHA256 계산 |
| 9 | **Checkout custom_data** | `user_id`를 custom_data에 포함 → 웹훅에서 어떤 유저 구독인지 식별 |

---

## Phase I: 배포

### 인프라 구성 (확정)

```
Hetzner VM (CX22, €4/월 — 초기)
├── Caddy              ← TLS 자동 + 리버스 프록시 (:80/:443)
├── platform           ← Next.js (:3000, 내부)
├── orchestrator       ← Node.js (:4001, 내부 네트워크만 — 외부 노출 없음)
└── nanoclaw-{userId}  ← 사용자 인스턴스들 (orchestrator가 동적 생성)

/data/nanoclaw-instances/  ← 영구 볼륨 (사용자 데이터)

[외부 서비스]
├── Supabase           ← Auth + PostgreSQL
└── LemonSqueezy       ← 결제
```

**트래픽 흐름:**
```
인터넷 → Caddy(:443) → platform(:3000)
                            ↓ 내부 네트워크
                       orchestrator(:4001)
                            ↓ Docker socket
                       nanoclaw-{userId} 컨테이너들
```

**스케일 플랜:**
| 사용자 수 | VM 사양 | 월 비용 |
|-----------|---------|---------|
| ~10명 | CX22 (2vCPU / 4GB) | €4 |
| ~30명 | CX32 (4vCPU / 8GB) | €8 |
| ~100명 | CX42 (8vCPU / 16GB) | €18 → 멀티 VM 전환 검토 |

### 작업 내용

#### I-1. 프로덕션 docker-compose.yml

```yaml
# docker-compose.yml (프로덕션)
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    networks: [internal]

  platform:
    image: ghcr.io/{org}/nanoclaw-platform:latest
    env_file: .env.production
    networks: [internal]
    # ports 없음 — Caddy만 접근

  orchestrator:
    image: ghcr.io/{org}/nanoclaw-orchestrator:latest
    env_file: .env.production
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /data/nanoclaw-instances:/data/nanoclaw-instances
    networks: [internal]
    # ports 없음 — platform만 접근

networks:
  internal:
    driver: bridge

volumes:
  caddy_data:
```

#### I-2. Caddyfile

```
nanoclaw.app {
    reverse_proxy platform:3000
}
```

#### I-3. GitHub Actions CI/CD

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build & push images
        run: |
          docker build -t ghcr.io/{org}/nanoclaw-platform:latest packages/platform
          docker build -t ghcr.io/{org}/nanoclaw-orchestrator:latest packages/orchestrator
          docker push ghcr.io/{org}/nanoclaw-platform:latest
          docker push ghcr.io/{org}/nanoclaw-orchestrator:latest

      - name: Deploy to Hetzner
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: deploy
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: |
            cd /opt/nanoclaw
            docker compose pull
            docker compose up -d --remove-orphans
```

#### I-4. VM 초기 셋업 (최초 1회)

```bash
apt update && apt install -y docker.io docker-compose-plugin
mkdir -p /opt/nanoclaw /data/nanoclaw-instances
useradd -m deploy && usermod -aG docker deploy
# docker-compose.yml, Caddyfile, .env.production 업로드 후
cd /opt/nanoclaw && docker compose up -d
```

### 완료 기준

- [ ] `https://nanoclaw.app` 접속 시 platform UI 응답
- [ ] TLS 인증서 자동 발급 (Caddy)
- [ ] orchestrator 외부 직접 접근 불가 확인
- [ ] main 브랜치 push → 자동 배포 동작
- [ ] `/data/nanoclaw-instances` 컨테이너 재시작 후에도 데이터 유지

---

## 주요 주의사항

| # | 항목 | 내용 |
|---|------|------|
| 1 | **Telegram 내장 이미지** | `/add-telegram` 스킬이 소스 수정 + 재빌드 구조. SaaS 이미지 빌드 전에 반드시 적용 |
| 2 | **AES-GCM IV 재사용 금지** | 암호화할 때마다 `randomBytes(12)`로 새 IV 생성. 재사용 시 보안 파탄 |
| 3 | **API 키 메모리 해제** | Orchestrator에서 컨테이너 env 주입 후 변수 즉시 overwrite |
| 4 | **Orchestrator 외부 노출 금지** | docker-compose에서 ports 없이 내부 네트워크만. platform만 접근 |
| 5 | **CLAUDE.md 경로** | `{DATA_ROOT}/{userId}/groups/main/CLAUDE.md` — nanoclaw가 `groups/` 기준으로 읽음 |
| 6 | **docker socket 권한** | Orchestrator 컨테이너가 `/var/run/docker.sock` 마운트 필요 |
| 7 | **Telegram 채팅 등록** | nanoclaw의 SQLite에 `registered_groups` 레코드 필요. 컨테이너 시작 후 IPC 또는 직접 DB 접근으로 등록 |
| 8 | **LemonSqueezy 웹훅 서명** | `x-signature` 헤더 반드시 검증. Raw body로 HMAC-SHA256 계산 |
| 9 | **Checkout custom_data** | `user_id`를 custom_data에 포함 → 웹훅에서 어떤 유저 구독인지 식별 |
| 10 | **Hetzner 볼륨 백업** | `/data/nanoclaw-instances` 정기 백업 필수 (Hetzner Snapshot 또는 rclone) |

---

## Phase 순서 요약

| Phase | 내용 | 예상 난이도 |
|-------|------|------------|
| A | nanoclaw SaaS 이미지 빌드 (Telegram 포함) | 중 |
| B | Supabase 설정 (DB + Auth) | 하 |
| C | Orchestrator 구현 | 중상 |
| D | Platform 공통 기반 (crypto, clients) | 하 |
| E | Control Plane API | 중 |
| F | 온보딩 UI | 중 |
| G | 대시보드 UI | 중하 |
| H | LemonSqueezy 결제 연동 | 중 |
| I | 배포 (Hetzner + Docker Compose + Caddy) | 하 |
