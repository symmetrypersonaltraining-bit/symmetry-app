#!/usr/bin/env bash
# Mutation harness for tests/unit/exerciseTitleSize.test.ts.
#
# Two promises pulling against each other: the full name must always be visible,
# AND the screen Dustin says is finally right must not move. A mutation in
# either direction has to go red.
#
# By hand: bash tests/mutate-exercise-title.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/exerciseTitleSize.ts
LOG="src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"
TEST=tests/unit/exerciseTitleSize.test.ts

TMP=$(mktemp -d); cp "$LIB" "$TMP/lib"; cp "$LOG" "$TMP/log"
restore() { cp "$TMP/lib" "$LIB"; cp "$TMP/log" "$LOG"; }
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

echo "baseline (unmutated) must pass:"
restore
if npx tsx --test "$TEST" >/dev/null 2>&1; then echo "  ok    baseline"; else echo "  FAIL  baseline is red"; exit 1; fi

echo
echo "the name gets cut off again — the actual regression:"
mutate "the 2-line clamp comes back" "$LOG" "s.replace('leading-tight flex-1 min-w-0\`}>', 'leading-tight flex-1 min-w-0\`} style={{ WebkitLineClamp: 2 }}>')"
mutate "truncate back in the ladder" "$LIB" "s.replace('{ max: 22, size: \"text-xl\" }', '{ max: 22, size: \"text-xl truncate\" as TitleSize }')"
mutate "swap picker truncates again" "$LOG" "s.replace('<p className=\"font-semibold text-sm\" style={{ color: \"var(--brand-text)\", overflowWrap: \"anywhere\" }}>{ex.name}</p>', '<p className=\"font-semibold text-sm truncate\" style={{ color: \"var(--brand-text)\" }}>{ex.name}</p>')"

echo
echo "the perfected layout moves:"
mutate "short names shrink too"      "$LIB" "s.replace('{ max: 22, size: \"text-xl\" }', '{ max: 4, size: \"text-xl\" }')"
mutate "heading stops being bold"    "$LOG" "s.replace('font-bold text-white leading-tight flex-1 min-w-0\`}', 'text-white leading-tight flex-1 min-w-0\`}')"
mutate "heading loses leading-tight" "$LOG" "s.replace('font-bold text-white leading-tight flex-1 min-w-0\`}', 'font-bold text-white flex-1 min-w-0\`}')"
mutate "heading stops flexing"       "$LOG" "s.replace('leading-tight flex-1 min-w-0\`}', 'leading-tight\`}')"

echo
echo "the ladder itself:"
mutate "ladder no longer monotonic"  "$LIB" "s.replace('{ max: 34, size: \"text-lg\" }', '{ max: 34, size: \"text-xl\" }').replace('{ max: 46, size: \"text-base\" }', '{ max: 46, size: \"text-lg\" }').replace('{ max: 22, size: \"text-xl\" }', '{ max: 22, size: \"text-base\" }')"
mutate "ladder stops at a finite max" "$LIB" "s.replace('{ max: Infinity, size: \"text-sm\" }', '{ max: 60, size: \"text-sm\" }')"
mutate "empty name renders tiny"     "$LIB" "s.replace('const len = (name ?? \"\").trim().length;', 'const len = name == null ? 999 : name.length;')"
mutate "whitespace counts as length" "$LIB" "s.replace('(name ?? \"\").trim().length', '(name ?? \"\").length')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
