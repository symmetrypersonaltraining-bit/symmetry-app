#!/usr/bin/env bash
# Mutation harness for tests/unit/servingOptions.test.ts.
#
# Break each rule on purpose and insist the suite goes red. A guard that passes
# on broken code reads as coverage while providing none.
#
# The mutations that matter here are the QUIET ones. A unit conversion that is
# wrong by a factor of two produces macros that look entirely reasonable on
# screen — nobody spots that their two tablespoons of peanut butter were logged
# as four. Every arithmetic rule below has a mutation aimed at it.
#
# Not part of the test run. By hand: bash tests/mutate-servings.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/servingOptions.ts
TEST=tests/unit/servingOptions.test.ts

TMP=$(mktemp -d)
cp "$LIB" "$TMP/lib"
restore() { cp "$TMP/lib" "$LIB"; }
trap restore EXIT

pass=0; fail=0

mutate() {
  local name="$1" expr="$2"
  restore
  # ASSERT THE FILE ACTUALLY CHANGED — an earlier harness scored a clean pass on
  # four mutations that were silent no-ops.
  python3 - "$LIB" "$expr" <<'PY'
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
echo "the arithmetic — every one of these is silently wrong on screen:"
mutate "a pair of tbsp weighs what one does"  "s.replace('const per = grams / countIn(desc);', 'const per = grams;')"
mutate "fractions ignored — a cup is 30 g"    "s.replace('if (m[2]) {', 'if (false) {')"
mutate "count defaults to zero, not one"      "s.replace('if (!m) return 1;', 'if (!m) return 0;')"
mutate "multiplier divides the wrong way"     "s.replace('return (amount * hit.gramsPerUnit) / baseGrams;', 'return (amount * baseGrams) / hit.gramsPerUnit;')"
mutate "ignores how many they entered"        "s.replace('return (amount * hit.gramsPerUnit) / baseGrams;', 'return hit.gramsPerUnit / baseGrams;')"

echo
echo "the base weight the macros are stored against:"
mutate "invents a base of 100 g"              "s.replace('if (!baseGrams || !isFinite(baseGrams) || baseGrams <= 0) return null;\n  const hit', 'baseGrams = baseGrams || 100;\n  const hit')"
mutate "defaults the box with no base weight" "s.replace('if (!named.length || !baseGrams || !isFinite(baseGrams) || baseGrams <= 0) return null;', 'if (!named.length) return null;')"

echo
echo "the labels:"
mutate "shows the raw OFF description"        "re.sub(r'.*drop the leading count\n', '', s)"
mutate "keeps the (44 g) gloss in the label"  "s.replace('s = s.replace(/\\\\([^)]*\\\\)/g, \" \");', '')"
mutate "offers grams and oz a second time"    "s.replace('if (PLAIN.has(s)) return null;', '')"
mutate "shows ONZ and OZA to clients"         "s.replace('\"onz\", \"oza\",', '')"
mutate "singularises two-letter units too"    "s.replace('if (s.length > 3 && s.endsWith(\"s\") && !s.endsWith(\"ss\"))', 'if (s.endsWith(\"s\"))')"
mutate "overrides a real portion like 1 bar"  "s.replace('if (!PLAIN.has(base)) return null;', '')"

echo
echo "tolerating the jsonb column:"
mutate "trusts a non-array value"             "s.replace('if (!Array.isArray(raw)) return [];', 'if (raw == null) return [];\n  raw = raw as never[];')"
# Both guards have to go: the first rejects the bad row, the second rejects the
# nonsense it would produce. Removing either alone changes nothing, which makes
# it a bad mutation rather than a coverage gap.
mutate "keeps a zero-weight serving"          "s.replace('if (!desc || !isFinite(grams) || grams <= 0) continue;', 'if (!desc) continue;').replace('if (!isFinite(per) || per <= 0) continue;', '')"
mutate "lists the same unit twice"            "s.replace('if (!label || seen.has(label)) continue;', 'if (!label) continue;')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
