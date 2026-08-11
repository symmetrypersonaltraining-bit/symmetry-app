#!/usr/bin/env bash
# Extract the live schema into version control.
#
# WHY THIS EXISTS
# 193 migrations have been applied to the live database. Seven of them existed
# as files in this repo. The other 186 lived ONLY inside Supabase's internal
# schema_migrations table, which means the database could not be rebuilt from
# this repo and a second instance (Dylan's) could not be built from it at all.
#
# Same code + different schema is worse than a fork: the code assumes columns
# the other database does not have, and it fails at runtime rather than at
# build time.
#
# USAGE
#   ./scripts/dump-schema.sh "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
#
# The connection string is in the Supabase dashboard:
#   Project -> Settings -> Database -> Connection string -> URI
#
# NEVER commit the connection string, never echo it, never paste it into a
# chat log. It is passed as an argument and used once.
set -euo pipefail

DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
  echo "usage: $0 <postgres-connection-string>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/supabase/schema"
mkdir -p "$OUT"

# Anything that could carry the password is scrubbed before it reaches a log.
redact() { sed -E 's#postgres(ql)?://[^ ]*#[REDACTED-CONNECTION-STRING]#g'; }

echo "==> roles, schema, and RLS policies"
# --schema-only: structure, no client data. Nothing personal leaves the database.
npx --yes supabase@latest db dump --db-url "$DB_URL" -f "$OUT/schema.sql" 2>&1 | redact

echo "==> the migration history itself"
npx --yes supabase@latest db dump --db-url "$DB_URL" --data-only \
  --schema supabase_migrations -f "$OUT/migration-history.sql" 2>&1 | redact

echo "==> done"
wc -l "$OUT"/*.sql
