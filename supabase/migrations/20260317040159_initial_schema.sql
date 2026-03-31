-- =============================================================================
-- NanoClaw SaaS Platform — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- Supabase Auth(auth.users)와 1:1 연결. 사용자 기본 정보.
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS '사용자 프로필 — Supabase Auth와 1:1 연결';

-- 새 사용자 가입 시 profiles 자동 생성
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- instances
-- 사용자당 1개의 NanoClaw 컨테이너 인스턴스.
-- ---------------------------------------------------------------------------
CREATE TABLE instances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'creating', 'running', 'stopping', 'stopped', 'error')),
  ecs_task_arn     TEXT,                          -- 현재 실행 중인 ECS Task ARN
  ecs_task_def_arn TEXT,                          -- 등록된 Task Definition ARN
  assistant_name   TEXT NOT NULL DEFAULT 'Andy',  -- 에이전트 이름
  agent_config     TEXT,                          -- CLAUDE.md 내용 (최신 스냅샷)
  efs_path         TEXT,                          -- EFS 마운트 경로 (/users/{userId})
  last_activity    TIMESTAMPTZ,
  error_message    TEXT,                          -- 마지막 에러 메시지
  restart_count    INT NOT NULL DEFAULT 0,        -- 자동 재시작 횟수
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT instances_user_id_unique UNIQUE (user_id)  -- 1인 1인스턴스
);

COMMENT ON TABLE instances IS 'per-user NanoClaw 컨테이너 인스턴스 상태 관리';
COMMENT ON COLUMN instances.ecs_task_arn IS '실행 중일 때만 값 존재. 중지 시 NULL.';
COMMENT ON COLUMN instances.agent_config IS 'CLAUDE.md 최신 내용. Web UI 편집 시 여기 저장 후 컨테이너에 반영.';

CREATE INDEX idx_instances_user_id ON instances(user_id);
CREATE INDEX idx_instances_status ON instances(status);
CREATE INDEX idx_instances_last_activity ON instances(last_activity);

CREATE TRIGGER set_instances_updated_at
  BEFORE UPDATE ON instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions
-- Lemon Squeezy 구독 정보.
-- ---------------------------------------------------------------------------
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ls_customer_id      TEXT NOT NULL UNIQUE,        -- Lemon Squeezy Customer ID
  ls_subscription_id  TEXT NOT NULL UNIQUE,        -- Lemon Squeezy Subscription ID
  ls_variant_id       TEXT NOT NULL,               -- 어떤 Variant (Starter/Pro × 월/연)
  plan                TEXT NOT NULL
                      CHECK (plan IN ('starter', 'pro')),
  billing_cycle       TEXT NOT NULL
                      CHECK (billing_cycle IN ('monthly', 'annual')),
  status              TEXT NOT NULL DEFAULT 'on_trial'
                      CHECK (status IN ('on_trial', 'active', 'cancelled', 'past_due', 'paused', 'expired')),
  trial_ends_at       TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  pause_starts_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscriptions IS 'Lemon Squeezy 구독 정보. 웹훅으로 상태 동기화.';

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_ls_subscription_id ON subscriptions(ls_subscription_id);

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- payments
-- 결제 이력 (Lemon Squeezy order_created 이벤트).
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ls_order_id  TEXT NOT NULL UNIQUE,   -- Lemon Squeezy Order ID
  amount_krw   INT NOT NULL,           -- 원화 금액 (₩)
  amount_usd   NUMERIC(10,2),          -- 달러 금액 (선택)
  currency     TEXT NOT NULL DEFAULT 'KRW',
  status       TEXT NOT NULL
               CHECK (status IN ('paid', 'failed', 'refunded', 'partial_refund')),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payments IS '결제 이력. Lemon Squeezy order 이벤트마다 삽입.';

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

-- ---------------------------------------------------------------------------
-- api_keys
-- 사용자 LLM API 키 (AES-256-GCM 암호화 저장).
-- 복호화는 Control Plane에서만 수행 (컨테이너 시작 시 stdin 주입).
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider       TEXT NOT NULL
                 CHECK (provider IN ('anthropic', 'openai', 'google')),
  key_prefix     TEXT NOT NULL,          -- 키 앞 8자 (표시용, 예: "sk-ant-a")
  key_encrypted  TEXT NOT NULL,          -- AES-256-GCM 암호화된 키 (base64)
  iv             TEXT NOT NULL,          -- 초기화 벡터 (base64)
  auth_tag       TEXT NOT NULL,          -- GCM 인증 태그 (base64)
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_verified  TIMESTAMPTZ,            -- 마지막 유효성 검증 시각
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT api_keys_user_provider_unique UNIQUE (user_id, provider)
);

COMMENT ON TABLE api_keys IS 'LLM API 키. 평문 저장 절대 금지. AES-256-GCM 암호화 필수.';
COMMENT ON COLUMN api_keys.key_encrypted IS 'Control Plane의 AES_SECRET_KEY로 암호화. DB 탈취 시에도 키 노출 없음.';

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_provider ON api_keys(provider);

CREATE TRIGGER set_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- channels
-- 사용자 채널 연결 정보 (Telegram, Slack).
-- ---------------------------------------------------------------------------
CREATE TABLE channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instance_id  UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  type         TEXT NOT NULL
               CHECK (type IN ('telegram', 'slack', 'discord', 'whatsapp')),
  identifier   TEXT NOT NULL,
  metadata_encrypted TEXT,             -- AES-256-GCM 암호화 JSON (bot_token 등)
  metadata_iv        TEXT,
  metadata_auth_tag  TEXT,
  display_name TEXT,                   -- Telegram: @bot_username | Slack: workspace name
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE channels IS '사용자 채널 연결. bot_token 등 민감 정보는 암호화 저장.';

CREATE INDEX idx_channels_user_id ON channels(user_id);
CREATE INDEX idx_channels_instance_id ON channels(instance_id);
CREATE INDEX idx_channels_type ON channels(type);
CREATE INDEX idx_channels_identifier ON channels(type, identifier);

CREATE TRIGGER set_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- schedules
-- 능동적 행동 스케줄 (Proactive AI).
-- Control Plane Scheduler Engine이 1분마다 폴링.
-- ---------------------------------------------------------------------------
CREATE TABLE schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  instance_id  UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  action_type  TEXT NOT NULL
               CHECK (action_type IN (
                 'morning_briefing',
                 'reminder',
                 'weekly_summary',
                 'first_week_day1',
                 'first_week_day3',
                 'first_week_day7',
                 'custom'
               )),
  prompt       TEXT NOT NULL,
  cron         TEXT NOT NULL,
  timezone     TEXT NOT NULL DEFAULT 'Asia/Seoul',
  params       JSONB NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  run_once     BOOLEAN NOT NULL DEFAULT FALSE,
  last_run_at  TIMESTAMPTZ,
  next_run_at  TIMESTAMPTZ,
  run_count    INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schedules IS '능동적 행동 스케줄. Control Plane이 next_run_at 기준으로 실행.';
COMMENT ON COLUMN schedules.run_once IS 'TRUE: 1회 실행 후 자동 비활성화 (첫 주 시퀀스에 사용)';

CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_schedules_instance_id ON schedules(instance_id);
CREATE INDEX idx_schedules_next_run_at ON schedules(next_run_at) WHERE is_active = TRUE;

CREATE TRIGGER set_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_run_logs
-- ---------------------------------------------------------------------------
CREATE TABLE schedule_run_logs (
  id           BIGSERIAL PRIMARY KEY,
  schedule_id  UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms  INT,
  status       TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  result       TEXT,
  error        TEXT
);

CREATE INDEX idx_schedule_run_logs_schedule_id ON schedule_run_logs(schedule_id);
CREATE INDEX idx_schedule_run_logs_user_id ON schedule_run_logs(user_id);
CREATE INDEX idx_schedule_run_logs_ran_at ON schedule_run_logs(ran_at);

-- ---------------------------------------------------------------------------
-- usage_logs
-- 사용량 추적. 플랜 제한 체크 + 분석용.
-- ---------------------------------------------------------------------------
CREATE TABLE usage_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT NOT NULL
              CHECK (action IN (
                'message_received',
                'message_sent',
                'proactive_sent',
                'container_started',
                'container_stopped',
                'api_key_used'
              )),
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_action ON usage_logs(action);
CREATE INDEX idx_usage_logs_created_at ON usage_logs(created_at);
CREATE INDEX idx_usage_logs_user_daily ON usage_logs(user_id, action, created_at)
  WHERE action = 'message_received';

-- ---------------------------------------------------------------------------
-- instance_events
-- 인스턴스 생명주기 이벤트 감사 로그.
-- ---------------------------------------------------------------------------
CREATE TABLE instance_events (
  id           BIGSERIAL PRIMARY KEY,
  instance_id  UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL
               CHECK (event_type IN (
                 'created', 'started', 'stopped', 'force_stopped', 'restarted',
                 'crashed', 'config_updated', 'channel_connected',
                 'channel_disconnected', 'subscription_activated', 'subscription_cancelled'
               )),
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instance_events_instance_id ON instance_events(instance_id);
CREATE INDEX idx_instance_events_user_id ON instance_events(user_id);
CREATE INDEX idx_instance_events_created_at ON instance_events(created_at);

-- ---------------------------------------------------------------------------
-- onboarding_progress
-- 온보딩 단계 추적.
-- ---------------------------------------------------------------------------
CREATE TABLE onboarding_progress (
  user_id               UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_step          INT NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 5),
  plan_selected_at      TIMESTAMPTZ,
  llm_configured_at     TIMESTAMPTZ,
  agent_configured_at   TIMESTAMPTZ,
  channel_connected_at  TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  selected_plan         TEXT,
  selected_llm_type     TEXT CHECK (selected_llm_type IN ('byok', 'ollama')),
  selected_template     TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (Row Level Security)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE instances             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys              ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules             ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_run_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_select"    ON profiles          FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_self_update"    ON profiles          FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "instances_self_all"      ON instances         FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_self_select" ON subscriptions   FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "payments_self_select"    ON payments          FOR SELECT USING (auth.uid() = user_id);

-- api_keys: 조회 시 key_encrypted/iv/auth_tag 는 서버 레이어에서 필터링 필수
CREATE POLICY "api_keys_self_all"       ON api_keys          FOR ALL    USING (auth.uid() = user_id);

CREATE POLICY "channels_self_all"       ON channels          FOR ALL    USING (auth.uid() = user_id);

CREATE POLICY "schedules_self_all"      ON schedules         FOR ALL    USING (auth.uid() = user_id);

CREATE POLICY "schedule_run_logs_self"  ON schedule_run_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_logs_self"         ON usage_logs        FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "instance_events_self"    ON instance_events   FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "onboarding_self_all"     ON onboarding_progress FOR ALL  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Control Plane이 인스턴스 관리 시 사용
CREATE OR REPLACE VIEW active_user_instances AS
SELECT
  i.id               AS instance_id,
  i.user_id,
  i.status           AS instance_status,
  i.assistant_name,
  i.last_activity,
  i.ecs_task_arn,
  i.ecs_task_def_arn,
  i.efs_path,
  i.restart_count,
  s.plan,
  s.status           AS subscription_status,
  s.trial_ends_at,
  s.current_period_end,
  p.email,
  p.display_name
FROM instances i
JOIN profiles p ON p.id = i.user_id
LEFT JOIN subscriptions s ON s.user_id = i.user_id;

-- 오늘 메시지 수 (Starter 50회 제한 체크)
CREATE OR REPLACE VIEW daily_message_counts AS
SELECT
  user_id,
  COUNT(*) AS message_count,
  DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Seoul') AS date
FROM usage_logs
WHERE
  action = 'message_received'
  AND created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Seoul')
GROUP BY user_id;
