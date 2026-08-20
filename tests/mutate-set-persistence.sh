#!/usr/bin/env bash
# Mutation harness for tests/unit/setPersistence.test.ts.
#
# The failure guarded here is silent: the workout IS being done, the tick DOES
# go green, and the sets are simply not in the database. Nobody finds out until
# they reopen the session.
#
# By hand: bash tests/mutate-set-persistence.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LOG="src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"
TEST=tests/unit/setPersistence.test.ts

TMP=$(mktemp -d); cp "$LOG" "$TMP/log"
restore() { cp "$TMP/log" "$LOG"; }
trap restore EXIT
pass=0; fail=0

mutate() {
  local name="$1" expr="$2"
  restore
  python3 - "$LOG" "$expr" <<'PY'
import sys
p, expr = sys.argv[1], sys.argv[2]
s = open(p).read()
out = eval(expr, {"s": s, "re": __import__("re")})
assert out != s, "MUTATION WAS A NO-OP: " + expr
open(p, "w").write(out)
PY
  if [ $? -ne 0 ]; then echo "  !! could not apply: $name"; fail=$((fail+1)); return; fi
  if npx tsx --test "$TEST" >/dev/null 2>&1; then
    echo "  FAIL  $name  — the suite still passed with this broken"; fail=$((fail+1))
  else
    echo "  ok    $name  — caught"; pass=$((pass+1))
  fi
}

echo "baseline (unmutated) must pass:"
restore
if npx tsx --test "$TEST" >/dev/null 2>&1; then echo "  ok    baseline"; else echo "  FAIL  baseline is red"; exit 1; fi

echo
echo "a failed read reads as a deletion again:"
mutate "liveness error discarded"   "s.replace('const { data: alive, error: aliveErr }', 'const { data: alive }').replace('      if (aliveErr) {\n        throw new Error(\n          \"Couldn\'t reach your workout just now — nothing has been lost. \" +\n          \"Check your connection and tap again.\",\n        );\n      }\n', '')"
mutate "draft cleared on failed read" "s.replace('      setWorkoutLogId(null);\n    }\n    // Lauren Standefer', '      setWorkoutLogId(null);\n      __clearDraft();\n    }\n    // Lauren Standefer')"
mutate "lookup error discarded"     "s.replace('const { data: existing, error: existingErr }', 'const { data: existing, error: __unused }')"

echo
echo "the tick goes green on a failed write again:"
mutate "upsert result discarded"    "s.replace('const { data: setRows, error: setErr } = await supabase.from(\"set_logs\").upsert({', 'await supabase.from(\"set_logs\").upsert({')"
mutate "select(id) dropped"         "s.replace('      }, { onConflict: \"workout_log_id,prescribed_exercise_id,set_number\" })\n        .select(\"id\");', '      }, { onConflict: \"workout_log_id,prescribed_exercise_id,set_number\" });')"
mutate "zero-rows check removed"    "s.replace('      if (!setRows || !setRows.length) {', '      if (false) {')"
mutate "error checked after green"  "s.replace('      if (setErr) throw setErr;', '')"
mutate "failure back to console"    "s.replace('      setCompleteError(\n        (e as { message?: string })?.message ||\n        \"That set didn\\'t save — check your connection and tap it again.\",\n      );', '')"
mutate "bulk count check removed"   "s.replace('bulkRows.length !== rows.length', 'false')"

echo
echo "typed values stop being saved:"
mutate "saveTypedSet writes done"   "s.replace('        completed: false,\n      }, { onConflict:', '        completed: true,\n      }, { onConflict:')"
mutate "session blurs reverted"     "s.replace('if (setEntry.done) logSet(currentExercise.id, si); else saveTypedSet(currentExercise.id, si); }}', 'if (setEntry.done) logSet(currentExercise.id, si); }}')"
mutate "overview blurs reverted"    "s.replace('onBlur={() => { if (setEntry.done) logSet(pe.id, si); else saveTypedSet(pe.id, si); }}', 'onBlur={() => { if (setEntry.done) logSet(pe.id, si); }}')"
mutate "one session blur reverted"  "s.replace('if (setEntry.done) logSet(currentExercise.id, si); else saveTypedSet(currentExercise.id, si); }}', 'if (setEntry.done) logSet(currentExercise.id, si); }}', 1)"
mutate "cardio fields unchecked"    "s.replace('          s.distance?.trim() || s.speed?.trim() || s.hr?.trim())) return;', '          s.distance?.trim())) return;')"
mutate "guard on already-done gone" "s.replace('    if (!s || s.done) return;', '    if (!s) return;')"
mutate "background save shouts"     "s.replace('      console.error(\"saveTypedSet\", e);', '      console.error(\"saveTypedSet\", e); setCompleteError(String(e));')"
mutate "restore ignores completed"  "s.replace('done: ex?.completed ?? false', 'done: !!ex')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
