#!/usr/bin/env bash
# Mutation harness for the billed-rate / adjustment guards in
# tests/unit/reminderCalc.test.ts.
#
# The failure being guarded: a rate change silently rewrote the arithmetic on a
# bill that had already been emailed. Nothing errored, nothing logged — the
# screen just started disagreeing with itself, on the view Dustin screenshots
# and sends to clients.
#
# By hand: bash tests/mutate-billed-rate.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/reminder-calc.ts
ED=src/components/ReminderEditor.tsx
TEST=tests/unit/reminderCalc.test.ts

TMP=$(mktemp -d); cp "$LIB" "$TMP/lib"; cp "$ED" "$TMP/ed"
restore() { cp "$TMP/lib" "$LIB"; cp "$TMP/ed" "$ED"; }
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
echo "a sent bill re-prices itself — Lesly's 18 Aug reminder:"
mutate "stored rate ignored"        "$LIB" "s.replace('  return Number.isFinite(n) && n > 0 ? n : clientRate;', '  return clientRate;')"
mutate "zero stored rate wins"      "$LIB" "s.replace('Number.isFinite(n) && n > 0', 'Number.isFinite(n)')"
mutate "string rate not parsed"     "$LIB" "s.replace('    typeof stored === \"string\" ? Number(stored) :\n', '')"
mutate "editor uses client rate"    "$ED"  "s.replace('sessions × \$\" + (r.billedRate ?? \"?\")', 'sessions × \$\" + (r.sessionRate ?? \"?\")')"
mutate "calc fed client rate"       "$ED"  "s.replace('      sessionRate: r.billedRate,', '      sessionRate: r.sessionRate,')"
mutate "freeze condition dropped"   "$ED"  "s.replace('storedIsNewShape && r.notification_status !== \"pending\" ? cd.rate : null,', 'storedIsNewShape ? cd.rate : null,')"

echo
echo "the client stops being shown what they were given:"
mutate "adjustment never computed"  "$LIB" "s.replace('  if (diff === 0) return null;', '  return null;')"
mutate "fractional session claimed" "$LIB" "s.replace('    if (Math.abs(n - Math.round(n)) < 0.005 && Math.round(n) > 0) sessions = Math.round(n);', '    sessions = Math.round(n);')"
mutate "surcharge reads as credit"  "$LIB" "s.replace('direction: diff > 0 ? \"covered\" : \"added\" }', 'direction: \"covered\" }')"
mutate "pennies invent a discount"  "$LIB" "s.replace('  const diff = Math.round((expected - billed) * 100) / 100;', '  const diff = expected - billed;')"
mutate "adjustment line removed"    "$ED"  "s.replace('describeAdjustment(calc.expected, r.amount_due, r.billedRate)', 'null')"
mutate "covered/added collapsed"    "$ED"  "s.replace('(adj.direction === \"covered\" ? \" covered\" : \" added\")', '\" covered\"')"
mutate "sent message hidden again"  "$ED"  "s.replace('{sent && r.sms_message && (', '{false && r.sms_message && (')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
