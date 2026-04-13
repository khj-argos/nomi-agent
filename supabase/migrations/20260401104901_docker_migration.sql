-- ECS → Docker migration
-- ecs_task_arn     → container_id   (Docker container ID)
-- ecs_task_def_arn → dropped        (not needed for local Docker)
-- efs_path         → data_path      (host bind mount path)

ALTER TABLE instances
  RENAME COLUMN ecs_task_arn TO container_id;

ALTER TABLE instances
  RENAME COLUMN efs_path TO data_path;

ALTER TABLE instances
  DROP COLUMN IF EXISTS ecs_task_def_arn;

COMMENT ON COLUMN instances.container_id IS 'Running Docker container ID. NULL when stopped.';
COMMENT ON COLUMN instances.data_path IS 'Host bind mount path for user data (/data/nanoclaw-instances/{userId}).';

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
  i.created_at,
  i.updated_at
FROM instances i
WHERE i.deleted_at IS NULL;
