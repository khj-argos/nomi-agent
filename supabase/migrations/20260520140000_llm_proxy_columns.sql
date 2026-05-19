ALTER TABLE instances
  ADD COLUMN active_llm TEXT NOT NULL DEFAULT 'gemma_hosted'
    CHECK (active_llm IN ('gemma_hosted', 'anthropic_byok'));

ALTER TABLE instances
  ADD COLUMN internal_token_jti UUID;

CREATE UNIQUE INDEX idx_instances_internal_token_jti
  ON instances(internal_token_jti)
  WHERE internal_token_jti IS NOT NULL;


ALTER TABLE usage_logs
  ADD COLUMN model TEXT,
  ADD COLUMN input_tokens INTEGER,
  ADD COLUMN output_tokens INTEGER,
  ADD COLUMN backend TEXT;

ALTER TABLE usage_logs DROP CONSTRAINT usage_logs_action_check;
ALTER TABLE usage_logs ADD CONSTRAINT usage_logs_action_check
  CHECK (action IN (
    'message_received',
    'message_sent',
    'proactive_sent',
    'container_started',
    'container_stopped',
    'api_key_used',
    'llm_request'
  ));

CREATE INDEX idx_usage_logs_llm_daily
  ON usage_logs(user_id, created_at)
  WHERE action = 'llm_request';
