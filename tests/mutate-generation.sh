#!/usr/bin/env bash
# Mutation harness for the generate_scheduled_workouts guards in
# tests/unit/homeworkNeverBlocksAMove.test.ts.
#
# Break each rule on purpose and insist the suite goes red. A guard that passes
# on broken code reads as coverage while providing none.
#
# Not part of the test run. By hand: bash tests/mutate-generation.sh
set -uo pipefail
cd "$(dirname "$0")/.."

MIG=supabase/migrations/20260817_generation_stops_refusing_homework_days.sql
TEST=tests/unit/homeworkNeverBlocksAMove.test.ts

TMP=$(mktemp -d)
cp "$MIG" "$TMP/mig"
restore() { cp "$TMP/mig" "$MIG"; }
trap restore EXIT

pass=0; fail=0

mutate() {
  local name="$1" expr="$2"
  restore
  # ASSERT THE FILE ACTUALLY CHANGED. An earlier harness scored a clean pass on
  # four mutations that were silent no-ops.
  python3 - "$MIG" "$expr" <<'PY'
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
echo "rule 1 — homework is not an occupied day:"
mutate "back to the unfiltered date check"   "s.replace('and (sw.supervised = cd.is_sup or sw.day_id = cd.day_id)\n           ) as slot_already_covered', ') as date_already_covered').replace('r.slot_already_covered', 'r.date_already_covered')"
mutate "drops the supervised comparison"     "s.replace('and (sw.supervised = cd.is_sup or sw.day_id = cd.day_id)', 'and true')"
mutate "compares supervised to a constant"   "s.replace('sw.supervised = cd.is_sup', 'sw.supervised = true')"

echo
echo "the opposite failure — stacking two supervised sessions:"
mutate "nothing is ever already-filled"      "s.replace(\"when r.slot_already_covered      then 'skipped_existing'\", \"when false then 'skipped_existing'\")"

echo
echo "rule 2 — a human's move stands:"
mutate "removes the moved-away check"        "re.sub(r'exists \(\n             select 1 from scheduled_workouts sw\n             where sw.client_id = cd.client_id\n               and sw.day_id = cd.day_id\n               and sw.moved_from_date = cd.sched_date\n               and sw.deleted_at is null\n           \) as moved_off_this_date', 'false as moved_off_this_date', s)"
mutate "computes it then ignores it"         "s.replace(\"when r.moved_off_this_date       then 'skipped_moved_away'\", \"when false then 'skipped_moved_away'\")"
mutate "matches any date, not this one"      "s.replace('and sw.moved_from_date = cd.sched_date', 'and sw.moved_from_date is not null')"

echo
echo "shipping hazards:"
mutate "new action without widening CHECK"   "re.sub(r\", 'skipped_moved_away'::text\", '', s)"
mutate "CHECK widened AFTER the body"        "(lambda blk: s.replace(blk, '') + blk)(re.search(r'alter table public\.schedule_generation_log[\s\S]*?skipped_moved_away.::text\]\)\);\n', s).group(0))"
mutate "no backup of the old definition"     "re.sub(r'create table if not exists public\.bak_generate_scheduled_workouts_20260817 as[\s\S]*?nspname = .public.;\n', '', s)"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
