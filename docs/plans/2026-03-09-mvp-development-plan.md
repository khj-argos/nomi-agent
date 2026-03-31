# NanoClaw SaaS Platform — MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** nanoclaw 엔진 위에 올라타는 SaaS 플랫폼 MVP — 사용자가 가입→API키→에이전트설정→Telegram연결→AI동작까지 완료하는 엔드-투-엔드 플로우 구현

**Architecture:** Next.js 15 (App Router) + 독립 Node.js Orchestrator + Supabase Auth/DB. Orchestrator는 docker-compose 파일을 직접 조작해 per-user nanoclaw 컨테이너를 관리. Control Plane API (Next.js Route Handlers)가 Orchestrator에 HTTP로 명령 전달.

**Tech Stack:** Next.js 15, TypeScript (strict), Tailwind CSS 4, Supabase (Auth + PostgreSQL), AES-256-GCM 암호화, Docker Compose CLI, Express.js (Orchestrator)

---

## 분석: nanoclaw 엔진 통합 포인트

엔진 코드를 분석한 결과 플랫폼이 알아야 할 핵심 사항:

### 환경변수 (nanoclaw 컨테이너에 주입 필요)
```
ANTHROPIC_API_KEY       ← 복호화한 사용자 API 키
ASSISTANT_NAME          ← 에이전트 이름 (기본: 'Andy')
CREDENTIAL_PROXY_PORT   ← 3001 (컨테이너 내부 credential proxy)
CONTAINER_IMAGE         ← nanoclaw-agent:latest
```

### 볼륨 마운트 (per-user, 격리)
```
{DATA_ROOT}/{userId}/store:/app/store      ← SQLite DB (messages.db)
{DATA_ROOT}/{userId}/groups:/app/groups    ← per-group CLAUDE.md
{DATA_ROOT}/{userId}/data:/app/data        ← sessions, IPC
/var/run/docker.sock:/var/run/docker.sock  ← DinD (에이전트가 Claude 컨테이너 스폰)
```

### 채널 설정 (Telegram / Slack)
nanoclaw engine은 **Telegram과 Slack을 기본 내장 채널로 제공**. 각 채널은 환경변수가 존재하면 자동 활성화, 없으면 조용히 스킵. 플랫폼이 사용자의 채널 선택에 따라 컨테이너 환경변수를 주입하여 활성화를 제어함. 최소 1개 채널이 활성화되어야 인스턴스 정상 동작.

| 채널 | 필요 환경변수 | 비고 |
|------|-------------|------|
| Telegram | `TELEGRAM_BOT_TOKEN` | @BotFather에서 발급 |
| Slack | `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` | Socket Mode 사용, 퍼블릭 URL 불필요 |

### CLAUDE.md 위치
`{DATA_ROOT}/{userId}/groups/main/CLAUDE.md` — 에이전트의 "메모리/설정". `/config` API로 업데이트 후 컨테이너 재시작.

---

## 전체 개발 순서 (의존성 그래프)

```
[Phase 1-A] 인프라/기반
  └─ A1: 개발 환경 설정 (tsconfig, eslint, env validation)
  └─ A2: Supabase 프로젝트 설정 + DB 스키마 마이그레이션
  └─ A3: platform 패키지에 Supabase 클라이언트 + 암호화 유틸 추가

[Phase 1-B] 인증 (Supabase Auth)
  └─ B1: 로그인/회원가입 페이지 (Supabase Auth UI 또는 커스텀)
  └─ B2: 미들웨어 (세션 보호, 리다이렉트)

[Phase 1-C] Orchestrator 구현 ← A2 완료 후
  └─ C1: docker-compose 파일 조작 유틸 (서비스 추가/삭제)
  └─ C2: 디렉토리 프로비저닝 유틸
  └─ C3: Orchestrator Express 라우터 (6개 엔드포인트)
  └─ C4: Orchestrator 인증 미들웨어 (ORCHESTRATOR_SECRET)

[Phase 1-D] Control Plane API ← B2, C3 완료 후
  └─ D1: 인스턴스 API Routes (생성/조회/삭제/재시작)
  └─ D2: LLM 설정 API (API키 암호화 저장/조회)
  └─ D3: 에이전트 설정 API (CLAUDE.md 읽기/쓰기)
  └─ D4: 채널 API (Telegram 연결)

[Phase 1-E] Web UI — 온보딩 ← D1~D4 완료 후
  └─ E1: 온보딩 레이아웃 + 진행 표시기
  └─ E2: Step 1 — LLM 설정 (API 키 입력 + 검증)
  └─ E3: Step 2 — 에이전트 설정 (템플릿 선택 + Monaco Editor)
  └─ E4: Step 3 — Telegram 채널 연결
  └─ E5: Step 4 — 완료 + 인스턴스 생성 트리거

[Phase 1-F] Web UI — 대시보드 ← E5 완료 후
  └─ F1: 대시보드 메인 (상태 조회, 재시작 버튼)
  └─ F2: 설정 페이지 (에이전트, 채널, LLM)
```

---

## Phase 1-A: 인프라/기반 설정

**목표:** 개발 환경을 완전히 갖추고, DB 스키마를 Supabase에 배포하고, 공통 유틸을 구현한다.

---

### Task A1: 개발 환경 설정

**Files:**
- Modify: `packages/platform/package.json`
- Modify: `packages/platform/tsconfig.json`
- Create: `packages/platform/src/lib/env.ts`

**Step 1: platform에 필수 패키지 설치**

```bash
cd packages/platform
npm install @supabase/supabase-js @supabase/ssr
npm install zod
npm install @monaco-editor/react
npm install lucide-react
```

**Step 2: 환경변수 검증 파일 생성**

`packages/platform/src/lib/env.ts`:
```typescript
import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENCRYPTION_KEY: z.string().min(32),
  ORCHESTRATOR_URL: z.string().url().default('http://localhost:4001'),
  ORCHESTRATOR_SECRET: z.string().min(1),
});

// 서버 시작 시 검증 (서버 컴포넌트에서 import)
export const env = envSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  ORCHESTRATOR_URL: process.env.ORCHESTRATOR_URL,
  ORCHESTRATOR_SECRET: process.env.ORCHESTRATOR_SECRET,
});
```

**Step 3: `.env.local` 생성 (gitignore됨)**
```bash
cp .env.example .env.local
# ENCRYPTION_KEY 생성:
openssl rand -base64 32
# ORCHESTRATOR_SECRET 생성:
openssl rand -hex 32
```

**완료 기준:** `npm run typecheck` 에러 없음

---

### Task A2: Supabase 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/20260309_001_initial_schema.sql`

**Step 1: Supabase CLI 설치 및 프로젝트 링크**
```bash
npm install -g supabase
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
```

**Step 2: 마이그레이션 파일 생성**

`supabase/migrations/20260309_001_initial_schema.sql`:
```sql
-- 사용자 프로필 (Supabase Auth의 auth.users와 동기화)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자 가입 시 자동으로 users 레코드 생성 (트리거)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 인스턴스 (사용자당 1개)
CREATE TABLE IF NOT EXISTS public.instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'running', 'stopped', 'error', 'deleted')),
  assistant_name TEXT NOT NULL DEFAULT 'Andy',
  encrypted_api_key TEXT,
  api_key_provider TEXT CHECK (api_key_provider IN ('anthropic', 'openai')),
  data_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  container_id TEXT,
  UNIQUE (user_id)  -- 사용자당 1개 인스턴스
);

-- 채널 연결
CREATE TABLE IF NOT EXISTS public.instance_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('telegram', 'whatsapp', 'slack', 'discord')),
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'disconnected', 'error')),
  config JSONB NOT NULL DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT NOW()
);

-- 구독 (MVP는 무료 플랜만)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'team')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due')),
  stripe_sub_id TEXT,
  current_period_end TIMESTAMPTZ,
  UNIQUE (user_id)
);

-- RLS (Row Level Security) 활성화
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 사용자는 본인 데이터만 접근
CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can view own instance"
  ON public.instances FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own channels"
  ON public.instance_channels FOR SELECT
  USING (
    instance_id IN (
      SELECT id FROM public.instances WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service Role은 모든 데이터 접근 가능 (Control Plane API에서 사용)
-- (service_role은 RLS 우회하므로 별도 정책 불필요)
```

**Step 3: 마이그레이션 적용**
```bash
supabase db push
```

**완료 기준:** Supabase 대시보드에서 4개 테이블 확인됨

---

### Task A3: 공통 유틸 — Supabase 클라이언트 + 암호화

**Files:**
- Create: `packages/platform/src/lib/supabase/server.ts`
- Create: `packages/platform/src/lib/supabase/client.ts`
- Create: `packages/platform/src/lib/crypto.ts`

**Step 1: Supabase 서버 클라이언트 (SSR용)**

`packages/platform/src/lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component에서 set 불가 — 미들웨어가 처리
          }
        },
      },
    },
  );
}

// Service Role 클라이언트 (API Routes에서만 사용 — 서버 전용)
export function createServiceClient() {
  const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
```

**Step 2: Supabase 브라우저 클라이언트**

`packages/platform/src/lib/supabase/client.ts`:
```typescript
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

**Step 3: AES-256-GCM 암호화 유틸**

`packages/platform/src/lib/crypto.ts`:
```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is not set');
  return Buffer.from(key, 'base64');
}

/**
 * API 키를 AES-256-GCM으로 암호화
 * 반환 형식: base64(iv + tag + ciphertext)
 */
export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * 암호화된 API 키 복호화
 */
export function decryptApiKey(ciphertext: string): string {
  const key = getKey();
  const data = Buffer.from(ciphertext, 'base64');
  
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * API 키 마스킹 (응답에 포함할 때 사용)
 * sk-ant-api03-...XXXX 형태
 */
export function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '****';
  return plaintext.slice(0, 12) + '...' + plaintext.slice(-4);
}
```

**완료 기준:** TypeScript 에러 없음, 암호화/복호화 round-trip 테스트 통과

---

## Phase 1-B: 인증 (Supabase Auth)

**목표:** 이메일/패스워드 로그인·가입 완성. 미들웨어로 보호된 라우트 설정.

---

### Task B1: Auth 미들웨어

**Files:**
- Create: `packages/platform/src/middleware.ts`

**Step 1: Next.js 미들웨어 작성**

`packages/platform/src/middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/signup', '/auth/callback'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith('/auth/'));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && (path === '/login' || path === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
```

---

### Task B2: 로그인/가입 페이지

**Files:**
- Create: `packages/platform/src/app/(auth)/login/page.tsx`
- Create: `packages/platform/src/app/(auth)/signup/page.tsx`
- Create: `packages/platform/src/app/(auth)/layout.tsx`
- Create: `packages/platform/src/app/auth/callback/route.ts`
- Create: `packages/platform/src/components/ui/AuthForm.tsx`

**Step 1: Auth 콜백 라우터**

`packages/platform/src/app/auth/callback/route.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url));
}
```

**Step 2: Auth 레이아웃**

`packages/platform/src/app/(auth)/layout.tsx`:
```typescript
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

**Step 3: AuthForm 컴포넌트**

`packages/platform/src/components/ui/AuthForm.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        // 이메일 인증 메시지 표시
        setError('이메일을 확인해주세요. 인증 링크를 보냈습니다.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {mode === 'login' ? '로그인' : '계정 만들기'}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-600">
        {mode === 'login' ? (
          <>계정이 없으신가요? <a href="/signup" className="text-blue-600 hover:underline">가입하기</a></>
        ) : (
          <>이미 계정이 있으신가요? <a href="/login" className="text-blue-600 hover:underline">로그인</a></>
        )}
      </p>
    </div>
  );
}
```

**Step 4: 로그인/가입 페이지**

`packages/platform/src/app/(auth)/login/page.tsx`:
```typescript
import { AuthForm } from '@/components/ui/AuthForm';

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
```

`packages/platform/src/app/(auth)/signup/page.tsx`:
```typescript
import { AuthForm } from '@/components/ui/AuthForm';

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
```

**완료 기준:** 브라우저에서 가입→이메일인증→로그인→dashboard 리다이렉트 동작

---

## Phase 1-C: Instance Orchestrator 구현

**목표:** docker-compose 파일을 조작해 per-user nanoclaw 컨테이너를 관리하는 독립 Node.js 서비스를 완성한다.

> **주의사항:** Orchestrator는 `DATA_ROOT` 환경변수 아래 단일 `docker-compose.instances.yml` 파일을 관리한다. 이 파일에 사용자별 서비스를 동적으로 추가/삭제한다. YAML 파싱에는 `js-yaml` 사용.

---

### Task C1: docker-compose 조작 유틸

**Files:**
- Create: `packages/orchestrator/src/compose.ts`

**Step 1: 패키지 설치**
```bash
cd packages/orchestrator
npm install js-yaml
npm install --save-dev @types/js-yaml
```

**Step 2: compose.ts 구현**

`packages/orchestrator/src/compose.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execSync } from 'child_process';

const DATA_ROOT = process.env.DATA_ROOT ?? '/data/nanoclaw-instances';
const COMPOSE_FILE = path.join(DATA_ROOT, 'docker-compose.instances.yml');

interface ComposeService {
  image: string;
  restart: string;
  volumes: string[];
  environment: string[];
}

interface ComposeFile {
  version?: string;
  services: Record<string, ComposeService>;
}

function readComposeFile(): ComposeFile {
  if (!fs.existsSync(COMPOSE_FILE)) {
    return { version: '3.8', services: {} };
  }
  const content = fs.readFileSync(COMPOSE_FILE, 'utf-8');
  return (yaml.load(content) as ComposeFile) ?? { version: '3.8', services: {} };
}

function writeComposeFile(data: ComposeFile): void {
  fs.mkdirSync(path.dirname(COMPOSE_FILE), { recursive: true });
  fs.writeFileSync(COMPOSE_FILE, yaml.dump(data, { lineWidth: -1 }), 'utf-8');
}

export function getServiceName(userId: string): string {
  // Docker 서비스 이름: 영숫자와 하이픈만 허용
  return `nanoclaw-${userId.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
}

export function addService(
  userId: string,
  config: {
    apiKey: string;         // 복호화된 평문 API 키
    assistantName: string;
    telegramBotToken?: string;  // Telegram 선택 시
    slackBotToken?: string;      // Slack 선택 시 (SLACK_BOT_TOKEN)
    slackAppToken?: string;      // Slack 선택 시 (SLACK_APP_TOKEN)
  }
): void {
  const data = readComposeFile();
  const serviceName = getServiceName(userId);
  const userDataPath = path.join(DATA_ROOT, userId);

  const environment = [
    `ANTHROPIC_API_KEY=${config.apiKey}`,
    `ASSISTANT_NAME=${config.assistantName}`,
    `CREDENTIAL_PROXY_PORT=3001`,
  ];

  // 사용자가 선택한 채널의 환경변수만 주입 (플랫폼이 활성화 제어)
  if (config.telegramBotToken) {
    environment.push(`TELEGRAM_BOT_TOKEN=${config.telegramBotToken}`);
  }
  if (config.slackBotToken && config.slackAppToken) {
    environment.push(`SLACK_BOT_TOKEN=${config.slackBotToken}`);
    environment.push(`SLACK_APP_TOKEN=${config.slackAppToken}`);
  }

  data.services[serviceName] = {
    image: 'nanoclaw:latest',
    restart: 'unless-stopped',
    volumes: [
      `${userDataPath}/store:/app/store`,
      `${userDataPath}/groups:/app/groups`,
      `${userDataPath}/data:/app/data`,
      '/var/run/docker.sock:/var/run/docker.sock',
    ],
    environment,
  };

  writeComposeFile(data);
}

export function removeService(userId: string): void {
  const data = readComposeFile();
  const serviceName = getServiceName(userId);
  delete data.services[serviceName];
  writeComposeFile(data);
}

export function composeUp(userId: string): void {
  const serviceName = getServiceName(userId);
  execSync(
    `docker compose -f "${COMPOSE_FILE}" up -d ${serviceName}`,
    { stdio: 'inherit' }
  );
}

export function composeDown(userId: string): void {
  const serviceName = getServiceName(userId);
  execSync(
    `docker compose -f "${COMPOSE_FILE}" rm -sf ${serviceName}`,
    { stdio: 'inherit' }
  );
}

export function composeRestart(userId: string): void {
  const serviceName = getServiceName(userId);
  execSync(
    `docker compose -f "${COMPOSE_FILE}" restart ${serviceName}`,
    { stdio: 'inherit' }
  );
}

export function getServiceStatus(userId: string): 'running' | 'stopped' | 'error' | 'not_found' {
  const serviceName = getServiceName(userId);
  try {
    const output = execSync(
      `docker compose -f "${COMPOSE_FILE}" ps --format json ${serviceName}`,
      { encoding: 'utf-8' }
    ).trim();

    if (!output) return 'not_found';

    // docker compose ps --format json은 여러 줄의 JSON objects를 반환
    const lines = output.split('\n').filter(Boolean);
    if (lines.length === 0) return 'not_found';

    const container = JSON.parse(lines[0]);
    const state: string = container.State ?? '';

    if (state === 'running') return 'running';
    if (state.startsWith('exit') || state === 'dead') return 'error';
    return 'stopped';
  } catch {
    return 'not_found';
  }
}

export function getServiceLogs(userId: string, lines = 100): string {
  const serviceName = getServiceName(userId);
  try {
    return execSync(
      `docker compose -f "${COMPOSE_FILE}" logs --tail=${lines} ${serviceName}`,
      { encoding: 'utf-8' }
    );
  } catch {
    return '';
  }
}
```

---

### Task C2: 디렉토리 프로비저닝 유틸

**Files:**
- Create: `packages/orchestrator/src/provision.ts`

`packages/orchestrator/src/provision.ts`:
```typescript
import fs from 'fs';
import path from 'path';

const DATA_ROOT = process.env.DATA_ROOT ?? '/data/nanoclaw-instances';

/**
 * 사용자 데이터 디렉토리 생성
 * nanoclaw 엔진이 필요로 하는 경로 구조:
 *   {DATA_ROOT}/{userId}/store/   ← SQLite
 *   {DATA_ROOT}/{userId}/groups/main/  ← CLAUDE.md
 *   {DATA_ROOT}/{userId}/data/    ← IPC, sessions
 */
export function provisionUserDirectory(userId: string): string {
  const userPath = path.join(DATA_ROOT, userId);

  const dirs = [
    path.join(userPath, 'store'),
    path.join(userPath, 'groups', 'main', 'logs'),
    path.join(userPath, 'data', 'sessions'),
    path.join(userPath, 'data', 'ipc'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return userPath;
}

/**
 * CLAUDE.md 파일 업데이트 (에이전트 메모리/설정)
 */
export function writeClaudeMd(userId: string, content: string): void {
  const claudeMdPath = path.join(DATA_ROOT, userId, 'groups', 'main', 'CLAUDE.md');
  fs.writeFileSync(claudeMdPath, content, 'utf-8');
}

/**
 * CLAUDE.md 읽기
 */
export function readClaudeMd(userId: string): string {
  const claudeMdPath = path.join(DATA_ROOT, userId, 'groups', 'main', 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return '';
  return fs.readFileSync(claudeMdPath, 'utf-8');
}

/**
 * 사용자 데이터 디렉토리 삭제 (계정 삭제 시)
 */
export function deprovisionUserDirectory(userId: string): void {
  const userPath = path.join(DATA_ROOT, userId);
  if (fs.existsSync(userPath)) {
    fs.rmSync(userPath, { recursive: true, force: true });
  }
}

/**
 * Telegram 채널 설정을 .env 파일로 저장
 * nanoclaw는 시작 시 .env 파일에서 채널 토큰을 읽음
 * 주의: 실제로는 docker-compose 환경변수로 주입하므로 이 함수는 사용 안 함
 * (compose.ts의 addService에서 environment 배열에 포함)
 */
export function getUserDataPath(userId: string): string {
  return path.join(DATA_ROOT, userId);
}
```

---

### Task C3: Orchestrator 인증 미들웨어

**Files:**
- Create: `packages/orchestrator/src/auth.ts`

`packages/orchestrator/src/auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';

const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET;

if (!ORCHESTRATOR_SECRET) {
  throw new Error('ORCHESTRATOR_SECRET environment variable is required');
}

/**
 * Control Plane에서만 접근 가능하도록 Bearer 토큰 검증
 * 외부 인터넷에 노출되지 않지만 내부 서비스 인증 레이어 추가
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== ORCHESTRATOR_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
```

---

### Task C4: Orchestrator Express 라우터 (6개 엔드포인트)

**Files:**
- Modify: `packages/orchestrator/src/index.ts`
- Create: `packages/orchestrator/src/routes/instances.ts`

**Step 1: instances 라우터**

`packages/orchestrator/src/routes/instances.ts`:
```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  addService,
  removeService,
  composeUp,
  composeDown,
  composeRestart,
  getServiceStatus,
  getServiceLogs,
} from '../compose.js';
import {
  provisionUserDirectory,
  deprovisionUserDirectory,
  writeClaudeMd,
  readClaudeMd,
} from '../provision.js';

export const instancesRouter = Router();

// POST /instances — 인스턴스 생성
const createInstanceSchema = z.object({
  userId: z.string().min(1),
  apiKey: z.string().min(1),          // 복호화된 평문 키 (Control Plane에서 복호화 후 전달)
  assistantName: z.string().default('Andy'),
  claudeMd: z.string().optional(),    // 초기 CLAUDE.md 내용
  telegramBotToken: z.string().optional(),
  slackBotToken: z.string().optional(),
  slackAppToken: z.string().optional(),
});

instancesRouter.post('/', async (req: Request, res: Response) => {
  const parsed = createInstanceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { userId, apiKey, assistantName, claudeMd, telegramBotToken, slackBotToken, slackAppToken } = parsed.data;

  try {
    // 1. 디렉토리 프로비저닝
    provisionUserDirectory(userId);

    // 2. 초기 CLAUDE.md 작성
    if (claudeMd) {
      writeClaudeMd(userId, claudeMd);
    }

    // 3. docker-compose.yml에 서비스 추가
    addService(userId, { apiKey, assistantName, telegramBotToken, slackBotToken, slackAppToken });

    // 4. 컨테이너 시작
    composeUp(userId);

    res.status(201).json({ status: 'running' });
  } catch (err) {
    console.error('Failed to create instance:', err);
    res.status(500).json({ error: 'Failed to create instance' });
  }
});

// DELETE /instances/:userId — 인스턴스 삭제
instancesRouter.delete('/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    composeDown(userId);
    removeService(userId);
    deprovisionUserDirectory(userId);
    res.json({ status: 'deleted' });
  } catch (err) {
    console.error('Failed to delete instance:', err);
    res.status(500).json({ error: 'Failed to delete instance' });
  }
});

// GET /instances/:userId/status — 상태 조회
instancesRouter.get('/:userId/status', (req: Request, res: Response) => {
  const { userId } = req.params;
  const status = getServiceStatus(userId);
  res.json({ status });
});

// GET /instances/:userId/logs — 로그 조회
instancesRouter.get('/:userId/logs', (req: Request, res: Response) => {
  const { userId } = req.params;
  const lines = parseInt(req.query.lines as string ?? '100', 10);
  const logs = getServiceLogs(userId, lines);
  res.json({ logs });
});

// POST /instances/:userId/restart — 재시작
instancesRouter.post('/:userId/restart', async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    composeRestart(userId);
    res.json({ status: 'restarting' });
  } catch (err) {
    console.error('Failed to restart instance:', err);
    res.status(500).json({ error: 'Failed to restart instance' });
  }
});

// PUT /instances/:userId/config — CLAUDE.md 업데이트 후 재시작
const updateConfigSchema = z.object({
  claudeMd: z.string(),
});

instancesRouter.put('/:userId/config', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const parsed = updateConfigSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    writeClaudeMd(userId, parsed.data.claudeMd);
    composeRestart(userId);
    res.json({ status: 'restarting' });
  } catch (err) {
    console.error('Failed to update config:', err);
    res.status(500).json({ error: 'Failed to update config' });
  }
});
```

**Step 2: index.ts 업데이트**

`packages/orchestrator/src/index.ts`:
```typescript
import express from 'express';
import { authMiddleware } from './auth.js';
import { instancesRouter } from './routes/instances.js';

const app = express();
const PORT = process.env.PORT ?? 4001;

app.use(express.json());

// Health check (인증 불필요)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 모든 /instances 라우트는 인증 필요
app.use('/instances', authMiddleware, instancesRouter);

app.listen(PORT, () => {
  console.log(`Orchestrator running on port ${PORT}`);
});
```

**완료 기준:**
```bash
# 로컬 테스트
curl -X POST http://localhost:4001/instances \
  -H "Authorization: Bearer $ORCHESTRATOR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user","apiKey":"sk-ant-...","assistantName":"Andy"}'
# → 201 {"status":"running"}

curl http://localhost:4001/instances/test-user/status \
  -H "Authorization: Bearer $ORCHESTRATOR_SECRET"
# → {"status":"running"}
```

---

## Phase 1-D: Control Plane API

**목표:** Next.js API Routes로 Control Plane을 완성한다. Supabase JWT 검증 후 비즈니스 로직 실행.

> **주의사항:** 모든 API Route는 서버 전용. 클라이언트에서는 직접 API 키나 ORCHESTRATOR_SECRET에 접근 불가.

---

### Task D1: API 공통 유틸 — 인증 헬퍼 + Orchestrator 클라이언트

**Files:**
- Create: `packages/platform/src/lib/auth.ts`
- Create: `packages/platform/src/lib/orchestrator.ts`

**Step 1: 인증 헬퍼 (서버 전용)**

`packages/platform/src/lib/auth.ts`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user, error: null };
}
```

**Step 2: Orchestrator HTTP 클라이언트**

`packages/platform/src/lib/orchestrator.ts`:
```typescript
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:4001';
const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_SECRET;

async function orchestratorFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (!ORCHESTRATOR_SECRET) throw new Error('ORCHESTRATOR_SECRET not configured');

  return fetch(`${ORCHESTRATOR_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ORCHESTRATOR_SECRET}`,
      ...options.headers,
    },
  });
}

export interface CreateInstanceParams {
  userId: string;
  apiKey: string;           // 평문 (이 함수 호출 전에 복호화)
  assistantName: string;
  claudeMd?: string;
  telegramBotToken?: string;
}

export const orchestrator = {
  async createInstance(params: CreateInstanceParams) {
    const res = await orchestratorFetch('/instances', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },

  async deleteInstance(userId: string) {
    const res = await orchestratorFetch(`/instances/${userId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },

  async getStatus(userId: string): Promise<{ status: string }> {
    const res = await orchestratorFetch(`/instances/${userId}/status`);
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },

  async getLogs(userId: string, lines = 100): Promise<{ logs: string }> {
    const res = await orchestratorFetch(`/instances/${userId}/logs?lines=${lines}`);
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },

  async restartInstance(userId: string) {
    const res = await orchestratorFetch(`/instances/${userId}/restart`, { method: 'POST' });
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },

  async updateConfig(userId: string, claudeMd: string) {
    const res = await orchestratorFetch(`/instances/${userId}/config`, {
      method: 'PUT',
      body: JSON.stringify({ claudeMd }),
    });
    if (!res.ok) throw new Error(`Orchestrator error: ${await res.text()}`);
    return res.json();
  },
};
```

---

### Task D2: 인스턴스 생성/조회 API Routes

**Files:**
- Create: `packages/platform/src/app/api/instances/route.ts`
- Create: `packages/platform/src/app/api/instances/me/route.ts`
- Create: `packages/platform/src/app/api/instances/me/restart/route.ts`
- Create: `packages/platform/src/app/api/instances/me/logs/route.ts`

**Step 1: POST /api/instances — 온보딩 완료 시 인스턴스 생성**

`packages/platform/src/app/api/instances/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/crypto';
import { orchestrator } from '@/lib/orchestrator';

export async function POST() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const supabase = createServiceClient();

  // 기존 인스턴스 확인 (중복 생성 방지)
  const { data: existing } = await supabase
    .from('instances')
    .select('id, status')
    .eq('user_id', user.id)
    .single();

  if (existing && existing.status !== 'deleted') {
    return NextResponse.json({ error: 'Instance already exists' }, { status: 409 });
  }

  // DB에서 인스턴스 메타데이터 조회
  const { data: instance } = await supabase
    .from('instances')
    .select('encrypted_api_key, assistant_name')
    .eq('user_id', user.id)
    .single();

  if (!instance?.encrypted_api_key) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 400 });
  }

  // 채널 설정 조회
  const { data: channels } = await supabase
    .from('instance_channels')
    .select('channel_type, config')
    .eq('instance_id', existing?.id ?? '')
    .eq('status', 'connected');

  // 사용자가 연결한 채널별 토큰 추출
  const telegramChannel = channels?.find(c => c.channel_type === 'telegram');
  const telegramBotToken = telegramChannel?.config?.bot_token;
  const slackChannel = channels?.find(c => c.channel_type === 'slack');
  const slackBotToken = slackChannel?.config?.bot_token;
  const slackAppToken = slackChannel?.config?.app_token;

  try {
    // API 키 복호화 (메모리에서만, 로그에 절대 출력 안 함)
    const apiKey = decryptApiKey(instance.encrypted_api_key);

    // Orchestrator에 인스턴스 생성 요청 (선택된 채널 환경변수 함께 주입)
    await orchestrator.createInstance({
      userId: user.id,
      apiKey,
      assistantName: instance.assistant_name ?? 'Andy',
      telegramBotToken,   // undefined면 해당 채널 비활성화
      slackBotToken,      // undefined면 해당 채널 비활셉화
      slackAppToken,
    });

    // DB 상태 업데이트
    await supabase
      .from('instances')
      .update({
        status: 'running',
        data_path: `/data/nanoclaw-instances/${user.id}`,
        last_active_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({ status: 'running' }, { status: 201 });
  } catch (err) {
    console.error('Failed to create instance:', err);

    await supabase
      .from('instances')
      .update({ status: 'error' })
      .eq('user_id', user.id);

    return NextResponse.json({ error: 'Failed to create instance' }, { status: 500 });
  }
}
```

**Step 2: GET /api/instances/me — 내 인스턴스 상태**

`packages/platform/src/app/api/instances/me/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { orchestrator } from '@/lib/orchestrator';

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const supabase = createServiceClient();

  const { data: instance } = await supabase
    .from('instances')
    .select('id, status, assistant_name, api_key_provider, created_at, last_active_at')
    .eq('user_id', user.id)
    .single();

  if (!instance) {
    return NextResponse.json({ instance: null });
  }

  // 실시간 컨테이너 상태 조회
  let containerStatus = instance.status;
  try {
    const { status } = await orchestrator.getStatus(user.id);
    containerStatus = status;

    // DB 상태 동기화
    if (status !== instance.status) {
      await supabase
        .from('instances')
        .update({ status })
        .eq('user_id', user.id);
    }
  } catch {
    // Orchestrator 접근 불가 시 DB 상태 사용
  }

  const { data: channels } = await supabase
    .from('instance_channels')
    .select('channel_type, status')
    .eq('instance_id', instance.id);

  return NextResponse.json({
    instance: {
      ...instance,
      status: containerStatus,
      channels: channels ?? [],
    },
  });
}
```

**Step 3: POST /api/instances/me/restart**

`packages/platform/src/app/api/instances/me/restart/route.ts`:
```typescript
import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { orchestrator } from '@/lib/orchestrator';

export async function POST() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    await orchestrator.restartInstance(user.id);
    return NextResponse.json({ status: 'restarting' });
  } catch (err) {
    console.error('Failed to restart:', err);
    return NextResponse.json({ error: 'Failed to restart' }, { status: 500 });
  }
}
```

---

### Task D3: LLM 설정 API (API 키 저장)

**Files:**
- Create: `packages/platform/src/app/api/instances/me/llm/route.ts`

`packages/platform/src/app/api/instances/me/llm/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { encryptApiKey, maskApiKey } from '@/lib/crypto';

const putSchema = z.object({
  apiKey: z.string().regex(/^sk-ant-/, 'Anthropic API 키는 sk-ant-로 시작해야 합니다'),
  provider: z.enum(['anthropic']).default('anthropic'),
});

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const supabase = createServiceClient();

  // 인스턴스가 없으면 먼저 DB 레코드 생성
  let { data: instance } = await supabase
    .from('instances')
    .select('encrypted_api_key, api_key_provider, assistant_name')
    .eq('user_id', user.id)
    .single();

  if (!instance) {
    // 최초 온보딩: 인스턴스 레코드 생성 (status: provisioning)
    const { data: created } = await supabase
      .from('instances')
      .insert({ user_id: user.id, status: 'provisioning' })
      .select()
      .single();
    instance = created;
  }

  return NextResponse.json({
    hasApiKey: !!instance?.encrypted_api_key,
    provider: instance?.api_key_provider ?? null,
    // 마스킹된 키 (원본 필요 시 복호화 후 마스킹)
  });
}

export async function PUT(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { apiKey, provider } = parsed.data;

  // Anthropic API 키 유효성 검증 (실제 API 호출)
  try {
    const validateRes = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (!validateRes.ok) {
      return NextResponse.json(
        { error: '유효하지 않은 API 키입니다. Anthropic Console에서 확인해주세요.' },
        { status: 422 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'API 키 검증 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }

  const encrypted = encryptApiKey(apiKey);
  const supabase = createServiceClient();

  // upsert: 인스턴스 레코드가 없으면 생성, 있으면 업데이트
  await supabase.from('instances').upsert(
    {
      user_id: user.id,
      encrypted_api_key: encrypted,
      api_key_provider: provider,
      status: 'provisioning',
    },
    { onConflict: 'user_id' }
  );

  return NextResponse.json({ success: true, maskedKey: maskApiKey(apiKey) });
}
```

---

### Task D4: 에이전트 설정 API (CLAUDE.md)

**Files:**
- Create: `packages/platform/src/app/api/instances/me/config/route.ts`

`packages/platform/src/app/api/instances/me/config/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { orchestrator } from '@/lib/orchestrator';

const putSchema = z.object({
  claudeMd: z.string().max(50000),
  assistantName: z.string().min(1).max(50).optional(),
});

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  try {
    // Orchestrator에서 현재 CLAUDE.md 조회
    // 실제로는 Orchestrator의 readClaudeMd를 호출해야 하지만
    // 단순화를 위해 DB에 claudeMd를 캐시하거나 Orchestrator에 GET 엔드포인트 추가 필요
    // MVP: DB에 assistant_name만 저장, CLAUDE.md는 Orchestrator 파일시스템에서 관리
    const supabase = createServiceClient();
    const { data: instance } = await supabase
      .from('instances')
      .select('assistant_name')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({ assistantName: instance?.assistant_name ?? 'Andy' });
  } catch (err) {
    console.error('Failed to get config:', err);
    return NextResponse.json({ error: 'Failed to get config' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const body = await request.json();
  const parsed = putSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { claudeMd, assistantName } = parsed.data;

  try {
    const supabase = createServiceClient();

    // Orchestrator에 CLAUDE.md 업데이트 + 재시작 요청
    await orchestrator.updateConfig(user.id, claudeMd);

    // assistant_name이 변경된 경우 DB 업데이트
    if (assistantName) {
      await supabase
        .from('instances')
        .update({ assistant_name: assistantName })
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Failed to update config:', err);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
```

---

### Task D5: 채널 연결 API (Telegram / Slack)

**Files:**
- Create: `packages/platform/src/app/api/instances/me/channels/route.ts`

`packages/platform/src/app/api/instances/me/channels/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUser } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

const addChannelSchema = z.discriminatedUnion('channelType', [
  z.object({
    channelType: z.literal('telegram'),
    config: z.object({
      bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, '유효한 Telegram 봇 토큰 형식이 아닙니다'),
    }),
  }),
  z.object({
    channelType: z.literal('slack'),
    config: z.object({
      bot_token: z.string().regex(/^xoxb-/, 'Slack Bot Token은 xoxb-로 시작해야 합니다'),
      app_token: z.string().regex(/^xapp-/, 'Slack App Token은 xapp-로 시작해야 합니다'),
    }),
  }),
]);

export async function GET() {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const supabase = createServiceClient();

  const { data: instance } = await supabase
    .from('instances')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!instance) {
    return NextResponse.json({ channels: [] });
  }

  const { data: channels } = await supabase
    .from('instance_channels')
    .select('id, channel_type, status, connected_at')
    .eq('instance_id', instance.id);

  // config는 응답에서 제외 (토큰 노출 방지)
  return NextResponse.json({ channels: channels ?? [] });
}

export async function POST(request: NextRequest) {
  const { user, error } = await getAuthenticatedUser();
  if (error) return error;

  const body = await request.json();
  const parsed = addChannelSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { channelType, config } = parsed.data;

  // 채널별 토큰 유효성 검증
  if (channelType === 'telegram') {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${config.bot_token}/getMe`);
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        return NextResponse.json({ error: '유효하지 않은 Telegram 봇 토큰입니다.' }, { status: 422 });
      }
    } catch {
      return NextResponse.json({ error: 'Telegram API 연결 중 오류가 발생했습니다.' }, { status: 500 });
    }
  } else if (channelType === 'slack') {
    try {
      const slackRes = await fetch('https://slack.com/api/auth.test', {
        headers: { Authorization: `Bearer ${config.bot_token}` },
      });
      const slackData = await slackRes.json();
      if (!slackData.ok) {
        return NextResponse.json({ error: '유효하지 않은 Slack Bot Token입니다.' }, { status: 422 });
      }
    } catch {
      return NextResponse.json({ error: 'Slack API 연결 중 오류가 발생했습니다.' }, { status: 500 });
    }
  }

  const supabase = createServiceClient();

  const { data: instance } = await supabase
    .from('instances')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  // config의 bot_token은 암호화해서 저장해야 하지만
  // MVP 단순화: JSONB로 평문 저장 (추후 암호화 추가)
  // 주의: production에서는 반드시 암호화 필요
  const { data: channel } = await supabase
    .from('instance_channels')
    .upsert(
      {
        instance_id: instance.id,
        channel_type: channelType,
        status: 'connected',
        config: { bot_token: config.bot_token },
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'instance_id, channel_type' }  // 같은 채널 중복 방지
    )
    .select()
    .single();

  return NextResponse.json({ channel: { id: channel?.id, channel_type: channelType, status: 'connected' } });
}
```

---

## Phase 1-E: Web UI — 온보딩

**목표:** 4단계 온보딩 플로우 완성. 사용자가 5분 안에 AI 동작까지 완료.

---

### Task E1: 온보딩 레이아웃 + 진행 표시기

**Files:**
- Create: `packages/platform/src/app/onboarding/layout.tsx`
- Create: `packages/platform/src/components/ui/StepIndicator.tsx`

`packages/platform/src/components/ui/StepIndicator.tsx`:
```typescript
interface Step {
  id: number;
  label: string;
}

const STEPS: Step[] = [
  { id: 1, label: 'LLM 설정' },
  { id: 2, label: '에이전트 설정' },
  { id: 3, label: '채널 연결' },
  { id: 4, label: '완료' },
];

export function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                currentStep > step.id
                  ? 'bg-green-500 text-white'
                  : currentStep === step.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {currentStep > step.id ? '✓' : step.id}
            </div>
            <span className="text-xs text-gray-500 mt-1 whitespace-nowrap">{step.label}</span>
          </div>
          {index < STEPS.length - 1 && (
            <div
              className={`w-16 h-0.5 mx-1 mb-4 transition-colors ${
                currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
```

`packages/platform/src/app/onboarding/layout.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">NanoClaw 설정</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto py-10 px-4">
        {children}
      </main>
    </div>
  );
}
```

---

### Task E2: Step 1 — LLM 설정 (API 키 입력)

**Files:**
- Create: `packages/platform/src/app/onboarding/llm-setup/page.tsx`

`packages/platform/src/app/onboarding/llm-setup/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepIndicator } from '@/components/ui/StepIndicator';

export default function LlmSetupPage() {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 실시간 키 형식 검증
  const isValidFormat = apiKey.startsWith('sk-ant-') && apiKey.length > 20;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidFormat) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/instances/me/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, provider: 'anthropic' }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '저장 중 오류가 발생했습니다.');
        return;
      }

      router.push('/onboarding/agent-setup');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StepIndicator currentStep={1} />

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">LLM 설정</h2>
        <p className="text-gray-500 mb-6">
          Anthropic API 키를 입력해주세요.{' '}
          <a
            href="https://console.anthropic.com/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            API 키 발급하기 →
          </a>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Anthropic API 키
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {apiKey && !isValidFormat && (
              <p className="mt-1 text-xs text-red-500">
                Anthropic API 키는 <code>sk-ant-</code>로 시작해야 합니다.
              </p>
            )}
            {isValidFormat && (
              <p className="mt-1 text-xs text-green-600">✓ 키 형식이 올바릅니다</p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            🔒 API 키는 AES-256 암호화로 안전하게 저장됩니다. 평문은 절대 저장되지 않습니다.
          </div>

          <button
            type="submit"
            disabled={!isValidFormat || loading}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '검증 중...' : '다음 단계로 →'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

### Task E3: Step 2 — 에이전트 설정 (템플릿 + Monaco Editor)

**Files:**
- Create: `packages/platform/src/app/onboarding/agent-setup/page.tsx`
- Create: `packages/platform/src/lib/templates.ts`

**Step 1: 에이전트 템플릿 데이터**

`packages/platform/src/lib/templates.ts`:
```typescript
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  claudeMd: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'developer',
    name: '개발자 보조',
    description: '코드 리뷰, 버그 수정, 기술 질문 답변',
    emoji: '👨‍💻',
    claudeMd: `# 개발자 보조 AI

## 역할
나는 소프트웨어 개발을 도와주는 AI 어시스턴트입니다.

## 주요 역할
- 코드 리뷰 및 개선 제안
- 버그 디버깅 지원
- 기술 문서 작성 보조
- 아키텍처 설계 논의

## 응답 스타일
- 코드는 항상 마크다운 코드 블록으로 표시
- 설명은 간결하고 명확하게
- 한국어로 응답 (코드는 영어)
`,
  },
  {
    id: 'writer',
    name: '글쓰기 도우미',
    description: '블로그, 보고서, 이메일 작성 지원',
    emoji: '✍️',
    claudeMd: `# 글쓰기 도우미

## 역할
나는 다양한 형태의 글쓰기를 도와주는 AI 어시스턴트입니다.

## 주요 역할
- 블로그 포스트 작성 및 편집
- 비즈니스 이메일 초안 작성
- 보고서 구조화 및 작성
- 문서 교정 및 개선

## 응답 스타일
- 명확하고 읽기 쉬운 문체
- 독자의 수준에 맞춘 설명
- 구체적인 예시 포함
`,
  },
  {
    id: 'business',
    name: '업무 비서',
    description: '일정 관리, 할일 정리, 업무 효율화',
    emoji: '📋',
    claudeMd: `# 업무 비서

## 역할
나는 업무 생산성을 높여주는 AI 어시스턴트입니다.

## 주요 역할
- 할일 목록 관리 및 우선순위 정리
- 회의 내용 요약 및 액션 아이템 추출
- 프로젝트 진행 상황 추적
- 업무 템플릿 제공

## 응답 스타일
- 구조화된 목록 형식 선호
- 실행 가능한 다음 단계 제시
- 간결하고 실용적인 조언
`,
  },
  {
    id: 'custom',
    name: '직접 설정',
    description: 'CLAUDE.md를 직접 편집',
    emoji: '⚙️',
    claudeMd: `# 나만의 AI 어시스턴트

## 역할
여기에 AI의 역할을 설명하세요.

## 주요 역할
- 역할 1
- 역할 2

## 응답 스타일
- 스타일 지침 1
- 스타일 지침 2
`,
  },
];
```

**Step 2: 에이전트 설정 페이지**

`packages/platform/src/app/onboarding/agent-setup/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { AGENT_TEMPLATES } from '@/lib/templates';

// Monaco Editor는 클라이언트에서만 렌더링
const Editor = dynamic(
  () => import('@monaco-editor/react').then(mod => mod.Editor),
  { ssr: false, loading: () => <div className="h-64 bg-gray-100 rounded-lg animate-pulse" /> }
);

export default function AgentSetupPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [claudeMd, setClaudeMd] = useState('');
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function selectTemplate(templateId: string) {
    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplate(templateId);
    setClaudeMd(template.claudeMd);

    if (templateId === 'custom') {
      setShowEditor(true);
    }
  }

  async function handleSubmit() {
    if (!claudeMd.trim()) {
      setError('에이전트 설정을 선택하거나 직접 입력해주세요.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/instances/me/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeMd }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? '저장 중 오류가 발생했습니다.');
        return;
      }

      router.push('/onboarding/channel-connect');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StepIndicator currentStep={2} />

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">에이전트 설정</h2>
        <p className="text-gray-500 mb-6">AI 어시스턴트의 역할과 성격을 설정합니다.</p>

        {/* 템플릿 선택 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {AGENT_TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => selectTemplate(template.id)}
              className={`p-4 border-2 rounded-xl text-left transition-colors ${
                selectedTemplate === template.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">{template.emoji}</div>
              <div className="font-semibold text-gray-900 text-sm">{template.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{template.description}</div>
            </button>
          ))}
        </div>

        {/* 편집기 토글 */}
        {selectedTemplate && selectedTemplate !== 'custom' && (
          <button
            onClick={() => setShowEditor(!showEditor)}
            className="text-sm text-blue-600 hover:underline mb-4 block"
          >
            {showEditor ? '▼ 편집기 숨기기' : '▶ CLAUDE.md 직접 편집'}
          </button>
        )}

        {/* Monaco Editor */}
        {showEditor && (
          <div className="mb-4 border border-gray-300 rounded-lg overflow-hidden">
            <Editor
              height="300px"
              language="markdown"
              value={claudeMd}
              onChange={value => setClaudeMd(value ?? '')}
              theme="vs-light"
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                lineNumbers: 'off',
                fontSize: 13,
              }}
            />
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedTemplate || loading}
          className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '저장 중...' : '다음 단계로 →'}
        </button>
      </div>
    </div>
  );
}
```

---

### Task E4: Step 3 — 채널 연결 (Telegram / Slack)

> **디자인 노트:** Telegram과 Slack 두 가지 옵션을 탭(tab) 또는 토글로 제시. **최소 1개 채널을 연결해야 다음 단계로 진행** 가능. 둘 다 연결하면 동시에 활성화됨.
**Files:**
- Create: `packages/platform/src/app/onboarding/channel-connect/page.tsx`

`packages/platform/src/app/onboarding/channel-connect/page.tsx`:
```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepIndicator } from '@/components/ui/StepIndicator';

export default function ChannelConnectPage() {
  // 선택된 채널: 'telegram' | 'slack' | null
  const [activeTab, setActiveTab] = useState<'telegram' | 'slack'>('telegram');
  // Telegram 상태
  const [tgBotToken, setTgBotToken] = useState('');
  const [tgConnected, setTgConnected] = useState(false);
  // Slack 상태
  const [slackBotToken, setSlackBotToken] = useState('');
  const [slackAppToken, setSlackAppToken] = useState('');
  const [slackConnected, setSlackConnected] = useState(false);
  // 공통
  const [botToken, setBotToken] = useState('');  // 레거시 표시용 (실제는 위 상태 사용)
  const [botToken, setBotToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Telegram 봇 토큰 형식: 숫자:영숫자
  const isValidFormat = /^\d+:[A-Za-z0-9_-]{35,}$/.test(botToken);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidFormat) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/instances/me/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelType: 'telegram',
          config: { bot_token: botToken },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? '연결 중 오류가 발생했습니다.');
        return;
      }

      router.push('/onboarding/complete');
    } catch {
      setError('네트워크 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <StepIndicator currentStep={3} />

      <div className="bg-white rounded-2xl border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">채널 연결</h2>
        <p className="text-gray-500 mb-6">AI와 대화할 채널을 연결합니다.</p>

        {/* Telegram 안내 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">📱</span>
            <span className="font-semibold text-blue-900">Telegram 봇 설정 방법</span>
          </div>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Telegram에서 <strong>@BotFather</strong>와 대화 시작</li>
            <li><code className="bg-blue-100 px-1 rounded">/newbot</code> 명령 입력</li>
            <li>봇 이름과 username 설정 (username은 bot으로 끝나야 함)</li>
            <li>발급된 API 토큰을 아래에 입력</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Telegram 봇 토큰
            </label>
            <input
              type="password"
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="1234567890:ABC..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {botToken && !isValidFormat && (
              <p className="mt-1 text-xs text-red-500">
                올바른 Telegram 봇 토큰 형식이 아닙니다.
              </p>
            )}
            {isValidFormat && (
              <p className="mt-1 text-xs text-green-600">✓ 형식이 올바릅니다</p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!isValidFormat || loading}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '연결 확인 중...' : 'AI 시작하기 →'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

### Task E5: Step 4 — 완료 + 인스턴스 생성

**Files:**
- Create: `packages/platform/src/app/onboarding/complete/page.tsx`

`packages/platform/src/app/onboarding/complete/page.tsx`:
```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StepIndicator } from '@/components/ui/StepIndicator';

type SetupStatus = 'creating' | 'running' | 'error';

export default function OnboardingCompletePage() {
  const [status, setStatus] = useState<SetupStatus>('creating');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    createInstance();
  }, []);

  async function createInstance() {
    try {
      // 인스턴스 생성 트리거
      const res = await fetch('/api/instances', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setError(data.error ?? '인스턴스 생성에 실패했습니다.');
        return;
      }

      setStatus('running');

      // 3초 후 대시보드로 이동
      setTimeout(() => {
        router.push('/dashboard');
      }, 3000);
    } catch {
      setStatus('error');
      setError('네트워크 오류가 발생했습니다.');
    }
  }

  return (
    <div>
      <StepIndicator currentStep={4} />

      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        {status === 'creating' && (
          <>
            <div className="text-5xl mb-4 animate-spin">⚙️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">AI 시작 중...</h2>
            <p className="text-gray-500">
              나만의 AI 인스턴스를 생성하고 있습니다. 잠시만 기다려주세요.
            </p>
          </>
        )}

        {status === 'running' && (
          <>
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">설정 완료!</h2>
            <p className="text-gray-500 mb-4">
              AI가 Telegram에서 활성화되었습니다. 봇에게 메시지를 보내보세요!
            </p>
            <p className="text-sm text-gray-400">대시보드로 이동 중...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">오류 발생</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={createInstance}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              다시 시도
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

## Phase 1-F: 대시보드

**목표:** 인스턴스 상태 조회, 재시작, 설정 변경 가능한 기본 대시보드.

---

### Task F1: 대시보드 메인

**Files:**
- Create: `packages/platform/src/app/dashboard/page.tsx`
- Create: `packages/platform/src/app/dashboard/layout.tsx`

`packages/platform/src/app/dashboard/layout.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <a href="/dashboard" className="text-xl font-bold text-gray-900">NanoClaw</a>
          <div className="flex items-center gap-4">
            <a href="/settings" className="text-sm text-gray-600 hover:text-gray-900">설정</a>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
                로그아웃
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto py-8 px-4">
        {children}
      </main>
    </div>
  );
}
```

`packages/platform/src/app/dashboard/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/server';
import { DashboardClient } from './DashboardClient';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const serviceClient = createServiceClient();

  // 인스턴스가 없으면 온보딩으로
  const { data: instance } = await serviceClient
    .from('instances')
    .select('id, status, assistant_name, created_at, last_active_at')
    .eq('user_id', user.id)
    .single();

  if (!instance) redirect('/onboarding/llm-setup');

  const { data: channels } = await serviceClient
    .from('instance_channels')
    .select('channel_type, status')
    .eq('instance_id', instance.id);

  return (
    <DashboardClient
      initialInstance={instance}
      channels={channels ?? []}
    />
  );
}
```

**Files:**
- Create: `packages/platform/src/app/dashboard/DashboardClient.tsx`

`packages/platform/src/app/dashboard/DashboardClient.tsx`:
```typescript
'use client';

import { useState } from 'react';

interface Instance {
  id: string;
  status: string;
  assistant_name: string;
  created_at: string;
  last_active_at: string | null;
}

interface Channel {
  channel_type: string;
  status: string;
}

interface Props {
  initialInstance: Instance;
  channels: Channel[];
}

export function DashboardClient({ initialInstance, channels }: Props) {
  const [instance, setInstance] = useState(initialInstance);
  const [restarting, setRestarting] = useState(false);

  const statusColor = {
    running: 'bg-green-500',
    stopped: 'bg-gray-400',
    error: 'bg-red-500',
    provisioning: 'bg-yellow-400 animate-pulse',
  }[instance.status] ?? 'bg-gray-400';

  const statusLabel = {
    running: '온라인',
    stopped: '중지됨',
    error: '오류',
    provisioning: '시작 중...',
  }[instance.status] ?? instance.status;

  async function handleRestart() {
    setRestarting(true);
    try {
      await fetch('/api/instances/me/restart', { method: 'POST' });
      setInstance(prev => ({ ...prev, status: 'provisioning' }));
      // 10초 후 상태 갱신
      setTimeout(async () => {
        const res = await fetch('/api/instances/me');
        const data = await res.json();
        if (data.instance) setInstance(data.instance);
        setRestarting(false);
      }, 10000);
    } catch {
      setRestarting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 상태 카드 */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">내 AI 상태</h2>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
          </div>
        </div>

        <div className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-gray-700">{instance.assistant_name}</span>
          {instance.last_active_at && (
            <span className="ml-2">
              · 마지막 활동: {new Date(instance.last_active_at).toLocaleString('ko-KR')}
            </span>
          )}
        </div>

        {/* 채널 상태 */}
        <div className="flex gap-2 flex-wrap mb-4">
          {channels.map(ch => (
            <span
              key={ch.channel_type}
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                ch.status === 'connected'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {ch.channel_type === 'telegram' ? '📱 Telegram' : ch.channel_type}
              {ch.status === 'connected' ? ' ✅' : ' ❌'}
            </span>
          ))}
        </div>

        {/* 빠른 액션 */}
        <div className="flex gap-3">
          <a
            href="/settings/agent"
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            에이전트 설정
          </a>
          <a
            href="/settings/channels"
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            채널 관리
          </a>
          <button
            onClick={handleRestart}
            disabled={restarting || instance.status === 'provisioning'}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {restarting ? '재시작 중...' : '재시작'}
          </button>
        </div>
      </div>

      {/* 구독 정보 (MVP: 무료 플랜) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Starter 플랜</h3>
            <p className="text-sm text-gray-500 mt-0.5">무료 • 본인 API 키 사용</p>
          </div>
          <span className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full">무료</span>
        </div>
      </div>
    </div>
  );
}
```

---

### Task F2: 로그아웃 API Route

**Files:**
- Create: `packages/platform/src/app/api/auth/logout/route.ts`

`packages/platform/src/app/api/auth/logout/route.ts`:
```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('supabase.co', 'vercel.app') ?? 'http://localhost:3000'));
}
```

**실제 구현 시 주의:** `NextResponse.redirect`에 올바른 origin 사용.

---

## 통합 포인트 및 주의사항

### 1. Docker-in-Docker 보안 (가장 중요)
- nanoclaw 컨테이너가 `/var/run/docker.sock`을 마운트 받아 Claude 에이전트 컨테이너를 스폰
- MVP에서는 이 방식을 그대로 사용하되, **프로덕션에서는 Rootless Docker 또는 별도 DinD 컨테이너 전환 필수**
- Orchestrator 컨테이너도 Docker socket 마운트 필요 (`docker-compose.yml`에 이미 설정됨)

### 2. API 키 흐름 (보안 경계 명확히)
```
사용자 입력 → PUT /api/instances/me/llm → 암호화 → DB 저장
                                          ↓
                         (절대 응답에 포함 안 됨)

온보딩 완료 → POST /api/instances → DB에서 읽기 → 복호화 → Orchestrator로 전달
                                                           ↓
                                    docker-compose.yml의 environment 항목에 주입
                                    (컨테이너가 뜨고 나서 메모리 해제)
```

### 3. 채널 토큰 보안
- MVP에서 `instance_channels.config`에 Telegram bot_token 평문 저장 — **출시 전 암호화 필수**
- `encryptApiKey`/`decryptApiKey`와 동일한 방식으로 암호화

### 4. docker-compose.instances.yml 관리
- Orchestrator는 `DATA_ROOT` 아래 단일 YAML 파일을 관리
- 파일 동시 쓰기 문제: MVP에서는 단일 프로세스이므로 괜찮지만 스케일 시 락 필요
- 파일 형식 예시:
```yaml
version: '3.8'
services:
  nanoclaw-user-abc:
    image: nanoclaw:latest
    restart: unless-stopped
    volumes:
      - /data/nanoclaw-instances/user-abc/store:/app/store
      ...
  nanoclaw-user-def:
    ...
```

### 5. nanoclaw 이미지 빌드
- `packages/engine/container/build.sh`로 `nanoclaw-agent:latest` 이미지 빌드
- Orchestrator가 `docker compose up`하기 전에 이미지가 반드시 있어야 함
- 배포 스크립트에 이미지 빌드 단계 포함 필요

### 6. Supabase RLS와 Service Role 분리
- 클라이언트(브라우저): anon key + RLS로 본인 데이터만 접근
- API Routes: service_role key로 RLS 우회 (관리 작업)
- 절대 `SUPABASE_SERVICE_ROLE_KEY`를 클라이언트로 노출하면 안 됨

### 7. Next.js 15 / React 19 주의사항
- platform `package.json`에 `next: 16.1.6`, `react: 19.2.3`으로 이미 설정됨
- `cookies()`가 async로 변경됨 → `await cookies()` 사용 필수
- Server Component에서 `cookies().set()`은 미들웨어에서 처리

### 8. 온보딩 순서 강제
- 각 온보딩 페이지에서 이전 단계 완료 여부 확인 필요
- LLM 설정 없이 에이전트 설정 페이지 접근 시 → Step 1으로 리다이렉트
- 채널 없이 완료 페이지 접근 시 → Step 3으로 리다이렉트

---

## 완료 기준 (전체 MVP)

1. **가입 → 로그인** 흐름 동작
2. **온보딩 4단계** 완료 (LLM→에이전트→채널→완료)
3. **Docker 컨테이너 생성** — `docker ps`에 `nanoclaw-{userId}` 컨테이너 표시
4. **Telegram 봇** 응답 — 봇에게 메시지를 보내면 AI 응답 수신
5. **대시보드** — 상태 표시 및 재시작 동작
6. **보안** — API 키가 응답/로그에 노출되지 않음

---

**Plan complete and saved to `docs/plans/2026-03-09-mvp-development-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (this session)** — 태스크별로 fresh subagent 디스패치, 중간 리뷰, 빠른 이터레이션

**2. Parallel Session (separate)** — 새 세션에서 `executing-plans` 스킬로 배치 실행

**Which approach?**
