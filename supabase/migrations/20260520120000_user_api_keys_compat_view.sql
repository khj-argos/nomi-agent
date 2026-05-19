CREATE OR REPLACE VIEW user_api_keys
WITH (security_invoker = on) AS
SELECT
  user_id,
  key_encrypted AS anthropic_key,
  iv            AS key_iv,
  auth_tag      AS key_tag,
  is_active     AS is_verified,
  last_verified AS last_verified_at,
  created_at,
  updated_at
FROM api_keys
WHERE provider = 'anthropic';

COMMENT ON VIEW user_api_keys IS
  'Backward-compatibility surface over api_keys WHERE provider=''anthropic''. '
  'Writable via INSTEAD OF triggers. Drop once callers migrate to api_keys directly.';


CREATE OR REPLACE FUNCTION user_api_keys_insert_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO api_keys (
    user_id,
    provider,
    key_prefix,
    key_encrypted,
    iv,
    auth_tag,
    is_active,
    last_verified
  ) VALUES (
    NEW.user_id,
    'anthropic',
    LEFT(COALESCE(NEW.anthropic_key, ''), 8),
    NEW.anthropic_key,
    NEW.key_iv,
    NEW.key_tag,
    COALESCE(NEW.is_verified, FALSE),
    NEW.last_verified_at
  )
  ON CONFLICT (user_id, provider) DO UPDATE
    SET key_prefix    = EXCLUDED.key_prefix,
        key_encrypted = EXCLUDED.key_encrypted,
        iv            = EXCLUDED.iv,
        auth_tag      = EXCLUDED.auth_tag,
        is_active     = EXCLUDED.is_active,
        last_verified = EXCLUDED.last_verified,
        updated_at    = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_api_keys_insert_trg ON user_api_keys;
CREATE TRIGGER user_api_keys_insert_trg
  INSTEAD OF INSERT ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION user_api_keys_insert_fn();


CREATE OR REPLACE FUNCTION user_api_keys_update_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE api_keys
  SET key_encrypted = NEW.anthropic_key,
      iv            = NEW.key_iv,
      auth_tag      = NEW.key_tag,
      is_active     = COALESCE(NEW.is_verified, is_active),
      last_verified = NEW.last_verified_at,
      key_prefix    = LEFT(COALESCE(NEW.anthropic_key, key_encrypted), 8),
      updated_at    = NOW()
  WHERE user_id = OLD.user_id
    AND provider = 'anthropic';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_api_keys_update_trg ON user_api_keys;
CREATE TRIGGER user_api_keys_update_trg
  INSTEAD OF UPDATE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION user_api_keys_update_fn();


CREATE OR REPLACE FUNCTION user_api_keys_delete_fn()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM api_keys
  WHERE user_id = OLD.user_id
    AND provider = 'anthropic';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_api_keys_delete_trg ON user_api_keys;
CREATE TRIGGER user_api_keys_delete_trg
  INSTEAD OF DELETE ON user_api_keys
  FOR EACH ROW EXECUTE FUNCTION user_api_keys_delete_fn();
