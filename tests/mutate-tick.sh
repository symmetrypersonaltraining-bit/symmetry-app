#!/usr/bin/env bash
# Mutation harness for tests/unit/loggerTickCost.test.ts.
# By hand: bash tests/mutate-tick.sh
set -uo pipefail
cd "$(dirname "$0")/.."
SRC="src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"
TEST=tests/unit/loggerTickCost.test.ts
TMP=$(mktemp -d); cp "$SRC" "$TMP/s"
restore() { cp "$TMP/s" "$SRC"; }
trap restore EXIT
pass=0; fail=0
mutate() {
  local name="$1" expr="$2"
  restore
  python3 - "$SRC" "$expr" <<'PY'
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
echo "the tick gets expensive again:"
mutate "back to 250ms"              "s.replace('setInterval(tick, 1000)', 'setInterval(tick, 250)')"
mutate "re-renders every tick"      "s.replace('setTimerNow(prev => (Math.floor(prev / 1000) === Math.floor(now / 1000) ? prev : now));', 'setTimerNow(now);')"
mutate "new timer object each tick" "s.replace('return changed ? next : prev;', 'return next;')"
echo
echo "it runs while the screen is away again:"
mutate "no visibility listener"     "s.replace('      document.addEventListener(\"visibilitychange\", onVis);\n', '')"
mutate "hidden does not stop it"    "s.replace('      if (document.visibilityState === \"hidden\") { stop(); return; }', '      if (false) { stop(); return; }')"
mutate "starts even when hidden"    "s.replace('if (document.visibilityState === \"hidden\") stop(); else start();', 'start();')"
mutate "no catch-up on return"      "s.replace('      tick();\n      start();', '      start();')"
echo
echo "leaks:"
mutate "interval leaks"             "s.replace('    return () => {\n      stop();', '    return () => {\n      ;')"
mutate "listener leaks"             "s.replace('      if (typeof document !== \"undefined\") document.removeEventListener(\"visibilitychange\", onVis);\n', '')"
echo
echo "the clock stops being wall time:"
# Anchored to `const tick`: `const now = Date.now()` appears three times in this
# file and an unanchored replace hit a different one, so the mutation was a
# no-op and scored as "could not apply" rather than proving anything.
mutate "clock stops reading the wall" "s.replace('const tick = () => {\n      const now = Date.now();', 'const tick = () => {\n      const now = 0;')"
restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
