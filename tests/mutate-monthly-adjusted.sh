#!/usr/bin/env bash
# Mutation harness for the 20 Aug billing rule in tests/unit/reminderCalc.test.ts.
#
#   amount = monthly rate - (orange-cancelled x session rate) - (half-price x rate/2)
#
# What makes this worth guarding: the failure is silent money. The previous rule
# was also arithmetically self-consistent and produced amounts that reconciled
# perfectly against the app's own data - and was wrong on 16 of 20 clients.
#
# By hand: bash tests/mutate-monthly-adjusted.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/reminder-calc.ts
TEST=tests/unit/reminderCalc.test.ts

TMP=$(mktemp -d); cp "$LIB" "$TMP/lib"
restore() { cp "$TMP/lib" "$LIB"; }
trap restore EXIT
pass=0; fail=0

mutate() {
  local name="$1" expr="$2"
  restore
  python3 - "$LIB" "$expr" <<'PY'
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
echo "the rule itself:"
mutate "cancellations stop deducting"   "s.replace('    cancelDeduction = round2(cancelled * rate);', '    cancelDeduction = 0;')"
mutate "back to sessions trained"       "s.replace('    expected = round2(Math.max(0, (i.fee ?? 0) - cancelDeduction - halfPriceDeduction));', '    expected = round2(sessionsTrained * (i.sessionRate ?? 0));')"
mutate "deducts trained instead"        "s.replace('    cancelDeduction = round2(cancelled * rate);', '    cancelDeduction = round2(sessionsTrained * rate);')"
mutate "rate ignored, fee always billed" "s.replace('- cancelDeduction - halfPriceDeduction));', '));')"
mutate "negative bills allowed"         "s.replace('    expected = round2(Math.max(0, (i.fee ?? 0) - cancelDeduction - halfPriceDeduction));', '    expected = round2((i.fee ?? 0) - cancelDeduction - halfPriceDeduction);')"
mutate "monthly_adjusted falls to flat" "s.replace('  } else if (billingType == \"monthly_adjusted\") {', '  } else if (false) {').replace('  } else if (billingType === \"monthly_adjusted\") {', '  } else if (false) {')"

echo
echo "half price while he is away:"
mutate "half price not deducted"        "s.replace('    halfPriceDeduction = round2(halfPrice * (rate / 2));', '    halfPriceDeduction = 0;')"
mutate "half price charged in full"     "s.replace('    halfPriceDeduction = round2(halfPrice * (rate / 2));', '    halfPriceDeduction = round2(halfPrice * rate);')"
mutate "half price applied on its own"  "s.replace('  const halfPrice = Math.max(0, Number(i.halfPriceSessions) || 0);', '  const halfPrice = Math.max(0, Number(i.halfPriceSessions) || 0) + 1;')"

echo
echo "flat clients must be untouched by the calendar:"
mutate "flat deducts cancellations"     "s.replace('    expected = round2(Math.max(0, i.fee ?? 0));', '    expected = round2(Math.max(0, (i.fee ?? 0) - cancelled * (i.sessionRate ?? 0)));')"
mutate "flat stops warning about them"  "s.replace('      warnings.push(\n        \"Flat rate: \"', '      if (false) warnings.push(\n        \"Flat rate: \"')"

echo
echo "the guards that catch a bad setup:"
mutate "missing session rate allowed"   "s.replace('      blocking.push(\"Monthly rate billing but no session rate on file - the cancellation deduction cannot be worked out\");', '')"
mutate "missing monthly rate allowed"   "s.replace('      blocking.push(\"Monthly rate billing but no monthly rate on file - set the client'\"'\"'s rate first\");', '')"
mutate "rate/sessions mismatch silent"  "s.replace('      if (Math.abs(implied - i.expectedSessions) > 0.01) {', '      if (false) {')"
mutate "paid_by_other gets billed"      "s.replace('  if (billingType === \"none\" || billingType === \"paid_by_other\") {', '  if (billingType === \"none\") {')"
mutate "override stops downgrading"     "s.replace('    if (i.override) warnings.push(msg + \" - OVERRIDDEN by trainer\");\n    else blocking.push(msg);', '    blocking.push(msg);')"
mutate "mismatch message loses the rule" "s.replace('          ? \"\$\" + (i.fee ?? 0) + \" less \" + cancelled + \" cancelled x \$\" + (i.sessionRate ?? 0)', '          ? \"monthly\"')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
