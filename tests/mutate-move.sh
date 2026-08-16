#!/usr/bin/env bash
# Mutation harness for tests/unit/moveRecordsWhereItCameFrom.test.ts.
#
# Same discipline as tests/mutate-detector.sh: break each rule on purpose and
# insist the suite goes red. A guard that passes on broken code reads as
# coverage while providing none.
#
# Not part of the test run. Invoked by hand: bash tests/mutate-move.sh
set -uo pipefail
cd "$(dirname "$0")/.."

MV=src/lib/moveWorkout.ts
BOARD=src/components/ScheduleBoard.tsx
PROG="src/app/(app)/clients/[clientId]/program/page.tsx"
TEST=tests/unit/moveRecordsWhereItCameFrom.test.ts

FILES=("$MV" "$BOARD" "$PROG")
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
echo "moveWorkout.ts:"
mutate "stops recording the old date"   "$MV" "re.sub(r'fromDate \? \{ scheduled_date: toDate, moved_from_date: fromDate \} : ', '', s)"
mutate "blanks it when unreadable"      "$MV" "s.replace('fromDate ? { scheduled_date: toDate, moved_from_date: fromDate } : { scheduled_date: toDate }', '{ scheduled_date: toDate, moved_from_date: fromDate }')"
mutate "reads the row after the update" "$MV" "s.replace('.select(\"scheduled_date, workout_log_id\")', '.select(\"workout_log_id\")')"
mutate "leaves the log behind"          "$MV" "re.sub(r'if \(logId\) \{', 'if (false) {', s)"
mutate "ignores the caller's log id"    "$MV" "s.replace('if (w.workoutLogId === undefined) {', 'if (true) {')"
mutate "swallows a collision"           "$MV" "s.replace('if (error) return scheduleWriteError(error, \"move\");', 'if (error) return null;')"

echo
echo "the sweep over every move path:"
mutate "board swap forgets one side"    "$BOARD" "s.replace('.update({ scheduled_date: aDate, moved_from_date: bDate }).eq(\"id\", b.id)', '.update({ scheduled_date: aDate }).eq(\"id\", b.id)')"
mutate "board swap forgets both"        "$BOARD" "s.replace('scheduled_date: bDate, moved_from_date: aDate', 'scheduled_date: bDate').replace('scheduled_date: aDate, moved_from_date: bDate', 'scheduled_date: aDate')"
mutate "program page forgets"           "$PROG" "s.replace('.update({ scheduled_date: newDate, moved_from_date: workout.scheduled_date })', '.update({ scheduled_date: newDate })')"
mutate "allowlist hides a real move"    "$BOARD" "s.replace('      flash(\"Swapped ✓\");', '      await supabase.from(\"scheduled_workouts\").update({ scheduled_date: bDate }).eq(\"id\", a.id);\n      flash(\"Swapped ✓\");')"

echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
