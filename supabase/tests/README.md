# Supabase Migration Tests

Plain-SQL integration tests for database migrations. No external test runner needed.

## Running locally

Prerequisites: PostgreSQL 15+ on `localhost:5432` (`brew services start postgresql@15`).

```bash
# Create a clean test DB
psql postgres -c "DROP DATABASE IF EXISTS nanoclaw_migration_test;"
psql postgres -c "CREATE DATABASE nanoclaw_migration_test;"

# Extensions
psql -d nanoclaw_migration_test -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS "pgcrypto";'

# auth.users stub (Supabase normally provides this)
psql -d nanoclaw_migration_test -f supabase/tests/_setup_auth_stub.sql

# Apply migrations in order
psql -d nanoclaw_migration_test -f supabase/migrations/20260317040159_initial_schema.sql
psql -d nanoclaw_migration_test -f supabase/migrations/20260401104901_docker_migration.sql
psql -d nanoclaw_migration_test -f supabase/migrations/20260520120000_user_api_keys_compat_view.sql

# Run tests (exits non-zero on failure)
psql -d nanoclaw_migration_test -f supabase/tests/user_api_keys_compat_view.test.sql

# Cleanup
psql postgres -c "DROP DATABASE nanoclaw_migration_test;"
```

## Test files

| File | Purpose |
|---|---|
| `_setup_auth_stub.sql` | Creates `auth.users` table and `auth.uid()` stub so migrations referencing Supabase auth can run on plain PostgreSQL. |
| `user_api_keys_compat_view.test.sql` | Validates the backward-compatibility view, INSTEAD OF triggers, column mapping, and that orchestrator query patterns continue to work. |
