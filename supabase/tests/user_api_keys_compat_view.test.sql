\set ON_ERROR_STOP on
\timing off
\set QUIET on

BEGIN;

CREATE TEMP TABLE test_results (
  test_name TEXT PRIMARY KEY,
  passed BOOLEAN NOT NULL,
  detail TEXT
);

CREATE OR REPLACE FUNCTION assert_eq(
  p_name TEXT,
  p_actual ANYELEMENT,
  p_expected ANYELEMENT
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT DISTINCT FROM p_expected THEN
    INSERT INTO test_results VALUES (p_name, TRUE, NULL);
  ELSE
    INSERT INTO test_results VALUES (
      p_name,
      FALSE,
      format('expected %L got %L', p_expected, p_actual)
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION assert_not_null(
  p_name TEXT,
  p_actual ANYELEMENT
) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_actual IS NOT NULL THEN
    INSERT INTO test_results VALUES (p_name, TRUE, NULL);
  ELSE
    INSERT INTO test_results VALUES (p_name, FALSE, 'value was NULL');
  END IF;
END;
$$;


INSERT INTO auth.users (id, email)
VALUES ('11111111-1111-1111-1111-111111111111', 'alice@test.example')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES ('22222222-2222-2222-2222-222222222222', 'bob@test.example')
ON CONFLICT (id) DO NOTHING;


SELECT assert_eq(
  'view exists',
  (SELECT count(*)::int FROM information_schema.views
   WHERE table_schema = 'public' AND table_name = 'user_api_keys'),
  1
);

SELECT assert_eq(
  'view exposes legacy columns',
  (SELECT string_agg(column_name, ',' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'user_api_keys'),
  'anthropic_key,created_at,is_verified,key_iv,key_tag,last_verified_at,updated_at,user_id'
);


INSERT INTO user_api_keys (user_id, anthropic_key, key_iv, key_tag, is_verified)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'CIPHERTEXT_AAAA',
  'IV_AAAA',
  'TAG_AAAA',
  FALSE
);

SELECT assert_eq(
  'INSERT through view creates one api_keys row',
  (SELECT count(*)::int FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  1
);

SELECT assert_eq(
  'INSERT forces provider=anthropic',
  (SELECT provider FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'anthropic'::TEXT
);

SELECT assert_eq(
  'anthropic_key column maps to key_encrypted',
  (SELECT key_encrypted FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'CIPHERTEXT_AAAA'::TEXT
);

SELECT assert_eq(
  'key_iv column maps to iv',
  (SELECT iv FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'IV_AAAA'::TEXT
);

SELECT assert_eq(
  'key_tag column maps to auth_tag',
  (SELECT auth_tag FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'TAG_AAAA'::TEXT
);

SELECT assert_eq(
  'is_verified maps to is_active',
  (SELECT is_active FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  FALSE
);

SELECT assert_not_null(
  'key_prefix is auto-populated',
  (SELECT key_prefix FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111')
);


INSERT INTO user_api_keys (user_id, anthropic_key, key_iv, key_tag, is_verified)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'CIPHERTEXT_BBBB',
  'IV_BBBB',
  'TAG_BBBB',
  TRUE
);

SELECT assert_eq(
  'second INSERT upserts (no duplicate)',
  (SELECT count(*)::int FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  1
);

SELECT assert_eq(
  'upsert replaced ciphertext',
  (SELECT key_encrypted FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'CIPHERTEXT_BBBB'::TEXT
);

SELECT assert_eq(
  'upsert replaced is_verified flag',
  (SELECT is_active FROM api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  TRUE
);


SELECT assert_eq(
  'SELECT through view returns latest ciphertext',
  (SELECT anthropic_key FROM user_api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  'CIPHERTEXT_BBBB'::TEXT
);


INSERT INTO api_keys (user_id, provider, key_prefix, key_encrypted, iv, auth_tag)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'openai',
  'CIPHER_O_',
  'CIPHERTEXT_OPENAI',
  'IV_OPENAI',
  'TAG_OPENAI'
);

SELECT assert_eq(
  'view hides non-anthropic rows',
  (SELECT count(*)::int FROM user_api_keys WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  0
);


DELETE FROM user_api_keys WHERE user_id = '11111111-1111-1111-1111-111111111111';

SELECT assert_eq(
  'DELETE through view removes anthropic row',
  (SELECT count(*)::int FROM api_keys
   WHERE user_id = '11111111-1111-1111-1111-111111111111' AND provider = 'anthropic'),
  0
);

SELECT assert_eq(
  'DELETE leaves other providers untouched',
  (SELECT count(*)::int FROM api_keys
   WHERE user_id = '22222222-2222-2222-2222-222222222222' AND provider = 'openai'),
  1
);


\unset QUIET
\echo ''
\echo '=== Test Results ==='
SELECT
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  test_name,
  COALESCE(detail, '') AS detail
FROM test_results
ORDER BY passed, test_name;

\echo ''
SELECT format(
  '%s/%s passed',
  count(*) FILTER (WHERE passed),
  count(*)
) AS summary
FROM test_results;

DO $$
DECLARE
  failed_count INT;
BEGIN
  SELECT count(*) INTO failed_count FROM test_results WHERE NOT passed;
  IF failed_count > 0 THEN
    RAISE EXCEPTION 'TESTS FAILED: % assertions did not pass', failed_count;
  END IF;
END;
$$;

ROLLBACK;
