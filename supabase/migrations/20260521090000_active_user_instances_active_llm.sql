DROP VIEW IF EXISTS active_user_instances;

CREATE VIEW active_user_instances AS
SELECT
  i.id           AS instance_id,
  i.user_id,
  i.status,
  i.assistant_name,
  i.agent_config,
  i.container_id,
  i.data_path,
  i.restart_count,
  i.error_message,
  i.last_activity,
  i.active_llm,
  i.created_at,
  i.updated_at
FROM instances i;
