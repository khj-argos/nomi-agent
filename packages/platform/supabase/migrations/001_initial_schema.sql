-- ============================================================
-- Nomi SaaS — Initial Schema
-- ============================================================
-- Supabase Auth의 auth.users 테이블을 기반으로 동작
-- 모든 테이블은 RLS(Row Level Security) 활성화

-- ============================================================
-- 1. INSTANCES — 사용자별 Nomi 인스턴스
-- ============================================================
CREATE TABLE instances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'creating'
                      CHECK (status IN ('creating', 'stopped', 'starting', 'running', 'stopping', 'error', 'pending')),
  assistant_name    TEXT NOT NULL DEFAULT 'Andy',
  agent_config      TEXT,                          -- CLAUDE.md 내용
  efs_path          TEXT,                          -- /users/{user_id}
  ecs_task_arn      TEXT,                          -- 실행 중인 ECS 태스크 ARN
  ecs_task_def_arn  TEXT,                          -- 등록된 태스크 정의 ARN
  last_activity     TIMESTAMPTZ,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 사용자당 인스턴스 1개 제한
CREATE UNIQUE INDEX instances_user_id_unique ON instances(user_id);

-- ============================================================
-- 2. ACTIVE_USER_INSTANCES — 활성 인스턴스 뷰
-- ============================================================
CREATE VIEW active_user_instances AS
  SELECT
    i.id               AS instance_id,
    i.user_id,
    i.status,
    i.assistant_name,
    i.agent_config,
    i.efs_path,
    i.ecs_task_arn,
    i.ecs_task_def_arn,
    i.last_activity,
    i.error_message,
    i.created_at,
    i.updated_at
  FROM instances i
  WHERE i.status != 'error';

-- ============================================================
-- 3. INSTANCE_EVENTS — 인스턴스 이벤트 로그
-- ============================================================
CREATE TABLE instance_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id  UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,   -- created, config_updated, channel_connected, restarted, ...
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX instance_events_instance_id_idx ON instance_events(instance_id);
CREATE INDEX instance_events_user_id_idx ON instance_events(user_id);

-- ============================================================
-- 4. ONBOARDING_PROGRESS — 온보딩 진행 상태
-- ============================================================
CREATE TABLE onboarding_progress (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_step  INT NOT NULL DEFAULT 0,  -- 0: 시작, 1: API키, 2: 에이전트, 3: 채널, 4: 완료
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 5. CHANNELS — 연결된 메시징 채널
-- ============================================================
CREATE TABLE channels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id         UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('telegram', 'slack', 'discord', 'whatsapp', 'gmail')),
  identifier          TEXT NOT NULL,       -- team_id, chat_id, phone_number, email
  display_name        TEXT,
  metadata_encrypted  TEXT,               -- 암호화된 bot token 등 민감 정보
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at        TIMESTAMPTZ,
  last_message_at     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX channels_user_id_idx ON channels(user_id);
CREATE INDEX channels_type_active_idx ON channels(type, is_active);
-- 사용자당 채널 타입별 1개 제한
CREATE UNIQUE INDEX channels_user_type_unique ON channels(user_id, type);

-- ============================================================
-- 6. SCHEDULES — 능동적 행동 스케줄
-- ============================================================
CREATE TABLE schedules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id  UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  action_type  TEXT NOT NULL,   -- morning_briefing, reminder, first_week_day1, ...
  prompt       TEXT NOT NULL,   -- 에이전트에게 전달할 프롬프트
  cron         TEXT NOT NULL,   -- cron 표현식
  next_run_at  TIMESTAMPTZ,
  last_run_at  TIMESTAMPTZ,
  run_count    INT NOT NULL DEFAULT 0,
  run_once     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX schedules_user_id_idx ON schedules(user_id);
CREATE INDEX schedules_next_run_active_idx ON schedules(next_run_at, is_active);

-- ============================================================
-- 7. SCHEDULE_RUN_LOGS — 스케줄 실행 이력
-- ============================================================
CREATE TABLE schedule_run_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  error        TEXT,
  ran_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX schedule_run_logs_schedule_id_idx ON schedule_run_logs(schedule_id);

-- ============================================================
-- 8. SUBSCRIPTIONS — 구독 정보 (Lemon Squeezy)
-- ============================================================
CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ls_customer_id      TEXT UNIQUE,
  ls_subscription_id  TEXT UNIQUE,
  ls_variant_id       TEXT,
  plan                TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro')),
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  status              TEXT NOT NULL DEFAULT 'on_trial'
                        CHECK (status IN ('on_trial', 'active', 'cancelled', 'past_due', 'paused', 'expired')),
  trial_ends_at       TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX subscriptions_user_id_unique ON subscriptions(user_id);

-- ============================================================
-- 9. PAYMENTS — 결제 이력
-- ============================================================
CREATE TABLE payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ls_order_id  TEXT UNIQUE,
  amount_krw   INT,
  status       TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded')),
  paid_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payments_user_id_idx ON payments(user_id);

-- ============================================================
-- 10. USAGE_LOGS — 사용량 로그
-- ============================================================
CREATE TABLE usage_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     TEXT NOT NULL,   -- message_received, proactive_sent, container_stopped, ...
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX usage_logs_user_id_idx ON usage_logs(user_id);
CREATE INDEX usage_logs_created_at_idx ON usage_logs(created_at);

-- ============================================================
-- 11. USER_API_KEYS — 암호화된 API 키 저장
-- ============================================================
CREATE TABLE user_api_keys (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  anthropic_key    TEXT,    -- AES-256-GCM 암호화
  key_iv           TEXT,    -- 초기화 벡터
  key_tag          TEXT,    -- 인증 태그
  is_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  last_verified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 12. updated_at 자동 갱신 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER instances_updated_at
  BEFORE UPDATE ON instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 13. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- 활성화
ALTER TABLE instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE instance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_run_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- instances: 본인 것만
CREATE POLICY "instances_self" ON instances
  FOR ALL USING (auth.uid() = user_id);

-- instance_events: 본인 것만
CREATE POLICY "instance_events_self" ON instance_events
  FOR ALL USING (auth.uid() = user_id);

-- onboarding_progress: 본인 것만
CREATE POLICY "onboarding_progress_self" ON onboarding_progress
  FOR ALL USING (auth.uid() = user_id);

-- channels: 본인 것만
CREATE POLICY "channels_self" ON channels
  FOR ALL USING (auth.uid() = user_id);

-- schedules: 본인 것만
CREATE POLICY "schedules_self" ON schedules
  FOR ALL USING (auth.uid() = user_id);

-- schedule_run_logs: 본인 것만
CREATE POLICY "schedule_run_logs_self" ON schedule_run_logs
  FOR ALL USING (auth.uid() = user_id);

-- subscriptions: 본인 것만
CREATE POLICY "subscriptions_self" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- payments: 본인 것만
CREATE POLICY "payments_self" ON payments
  FOR ALL USING (auth.uid() = user_id);

-- usage_logs: 본인 것만
CREATE POLICY "usage_logs_self" ON usage_logs
  FOR ALL USING (auth.uid() = user_id);

-- user_api_keys: 본인 것만 (읽기/쓰기), service_role은 전체 접근
CREATE POLICY "user_api_keys_self" ON user_api_keys
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- Orchestrator (service_role)는 RLS 우회 — 별도 정책 불필요
-- service_role key로 연결 시 자동으로 RLS 우회됨
-- ============================================================
