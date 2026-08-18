#!/usr/bin/env bash
# Mutation harness for tests/unit/addAheadAndRemoveGuard.test.ts.
# By hand: bash tests/mutate-add-remove.sh
set -uo pipefail
cd "$(dirname "$0")/.."
LIB=src/lib/removeGuard.ts
ADD=src/components/AddWorkoutButton.tsx
BOARD=src/components/ScheduleBoard.tsx
TEST=tests/unit/addAheadAndRemoveGuard.test.ts
TMP=$(mktemp -d); cp "$LIB" "$TMP/l"; cp "$ADD" "$TMP/a"; cp "$BOARD" "$TMP/b"
restore() { cp "$TMP/l" "$LIB"; cp "$TMP/a" "$ADD"; cp "$TMP/b" "$BOARD"; }
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
  if [ $? -ne 0 ]; then echo "  !! could not apply: $name"; fail=$((fail+1)); return; fi
  if npx tsx --test "$TEST" >/dev/null 2>&1; then
    echo "  FAIL  $name  — the suite still passed with this broken"; fail=$((fail+1))
  else
    echo "  ok    $name  — caught"; pass=$((pass+1))
  fi
}
echo "baseline:"; restore
npx tsx --test "$TEST" >/dev/null 2>&1 && echo "  ok    baseline" || { echo "  FAIL baseline"; exit 1; }
echo
echo "A - tomorrow becomes today again:"
mutate "max back to today"        "$ADD" "s.replace('max={maxDate}', 'max={ctToday()}')"
mutate "forward bound removed"    "$ADD" "s.replace('const maxDate = daysAheadCT(35);', 'const maxDate = ctToday();')"
mutate "backdating lost"          "$ADD" "s.replace('const minDate = daysAgoCT(90);', 'const minDate = ctToday();')"
mutate "future still says backdated" "$ADD" "s.replace('{pickedDate > ctToday() ? \"scheduled ahead\" : \"backdated\"}', 'backdated')"
echo
echo "B - a finished session comes off on one tap:"
mutate "completed no longer warns" "$LIB" "s.replace('const done = w.status === \"completed\" || !!w.workoutLogId;', 'const done = false;')"
mutate "a log no longer counts"    "$LIB" "s.replace(\"w.status === 'completed' || !!w.workoutLogId\", 'false').replace('w.status === \"completed\" || !!w.workoutLogId', 'w.status === \"completed\"')"
mutate "warning stops naming it"   "$LIB" "s.replace('const name = w.label || \"That session\";', 'const name = \"That session\";')"
mutate "every delete asks twice"   "$LIB" "s.replace('if (!done) return null;', '')"
mutate "board skips the confirm"   "$BOARD" "s.replace('if (extra && typeof window !== \"undefined\" && !window.confirm(extra)) return;', '')"
echo
echo "B - the delete stops proving it hit the right row:"
mutate "zero rows reads as success" "$LIB" "s.replace('  if (changedIds.length === 0) {', '  if (false) {')"
mutate "wrong row reads as success" "$LIB" "s.replace('if (!changedIds.includes(expectedId)) {', 'if (false) {')"
mutate "board drops select(id)"    "$BOARD" "s.replace('        .eq(\"id\", w.id)\n        .select(\"id\");', '        .eq(\"id\", w.id);')"
mutate "board ignores the verdict" "$BOARD" "s.replace('      if (verdict) {', '      if (false) {')"
mutate "failed delete keeps it hidden" "$BOARD" "s.replace('        setWorkouts((prev) => [...prev, w]);\n        if (typeof window !== \"undefined\") window.alert(verdict);', '        if (typeof window !== \"undefined\") window.alert(verdict);')"
restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
