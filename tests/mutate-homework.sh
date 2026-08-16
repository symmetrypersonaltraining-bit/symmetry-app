#!/usr/bin/env bash
# Mutation harness for tests/unit/homeworkNeverBlocksAMove.test.ts.
#
# Same discipline as the other three harnesses: break each rule on purpose and
# insist the suite goes red.
#
# Not part of the test run. Invoked by hand: bash tests/mutate-homework.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SYNC=supabase/migrations/20260816_homework_never_blocks_a_move.sql
BAK=supabase/migrations/20260816_bak_sync_supervised_workouts.sql
RES=supabase/migrations/20260816_resolve_moves_the_one_session.sql
TEST=tests/unit/homeworkNeverBlocksAMove.test.ts

FILES=("$SYNC" "$BAK" "$RES")
TMP=$(mktemp -d)
i=0; for f in "${FILES[@]}"; do cp "$f" "$TMP/$i"; i=$((i+1)); done
restore() { local j=0; for f in "${FILES[@]}"; do cp "$TMP/$j" "$f"; j=$((j+1)); done; }
trap restore EXIT

pass=0; fail=0

mutate() {
  local name="$1" file="$2" expr="$3"
  restore
  python3 - "$file" "$expr" <<'PY'
import sys
p, expr = sys.argv[1], sys.argv[2]
s = open(p).read()
out = eval(expr, {"s": s, "re": __import__("re")})
assert out != s, "MUTATION WAS A NO-OP: " + expr
open(p, "w").write(out)
PY
  if [ $? -ne 0 ]; then
    echo "  !! could not apply mutation: $name"; fail=$((fail+1)); return
  fi
  if npx tsx --test "$TEST" >/dev/null 2>&1; then
    echo "  FAIL  $name  — the suite still passed with this broken"
    fail=$((fail+1))
  else
    echo "  ok    $name  — caught"
    pass=$((pass+1))
  fi
}

echo "baseline (unmutated) must pass:"
restore
if npx tsx --test "$TEST" >/dev/null 2>&1; then echo "  ok    baseline"; else echo "  FAIL  baseline is red"; exit 1; fi

echo
echo "the guard that was blocking everything:"
mutate "homework blocks again"        "$SYNC" 're.sub(r"\n *and x\.supervised[^\n]*", "", s)'
mutate "the row blocks itself"        "$SYNC" 're.sub(r"\n *and x\.id <> sw\.id[^\n]*", "", s)'
mutate "no occupancy guard at all"    "$SYNC" 're.sub(r"      and not exists \(\n(?:[^\n]*\n)*?      \)\n", "", s)'

echo
echo "the rules that must survive being unblocked:"
mutate "drags homework around"        "$SYNC" 're.sub(r"\n *and sw\.supervised\b[^\n]*", "", s)'
mutate "moves a logged session"       "$SYNC" 're.sub(r"\n *and sw\.workout_log_id is null[^\n]*", "", s)'
mutate "overrides a manual move"      "$SYNC" 're.sub(r"\n *and sw\.moved_from_date is null[^\n]*", "", s)'
mutate "follows a cancelled appt"     "$SYNC" "s.replace(\"and a.status = 'scheduled'\", \"and a.status is not null\")"
mutate "touches archived clients"     "$SYNC" 're.sub(r"\n *and c\.archived_at is null[^\n]*", "", s)'
mutate "unlinked from the appointment" "$SYNC" "s.replace('join appointments a on a.id = sw.appointment_id', 'join appointments a on a.client_id = sw.client_id')"
mutate "rewrites today and the past"  "$SYNC" 're.sub(r"\n *and sw\.scheduled_date >= v_tomorrow[^\n]*", "", s)'
mutate "the dry run writes"           "$SYNC" 're.sub(r"\n *and not p_dry_run", "", s)'
mutate "delete-and-reinsert"          "$SYNC" "s.replace('  moved as (', '  wiped as (delete from scheduled_workouts where false returning id),\n  moved as (')"
mutate "loses provenance"             "$SYNC" "s.replace('moved_from_date = cd.old_date,', '')"

echo
echo "the backup, and the sibling copy of the same bug:"
mutate "backup captures nothing"      "$BAK"  "s.replace('pg_get_functiondef(p.oid)', chr(39) + 'stub' + chr(39))"
mutate "sibling regresses"            "$RES"  're.sub(r"\n *and x\.supervised[^\n]*", "", s)'

echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
