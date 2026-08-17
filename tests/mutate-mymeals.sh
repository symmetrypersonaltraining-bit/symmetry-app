#!/usr/bin/env bash
# Mutation harness for tests/unit/myMealsLibrarySplit.test.ts.
#
# The mutation that matters most is the destructive one: Dustin deleting a
# shared library meal from his own list takes it away from all 30 clients.
#
# Not part of the test run. By hand: bash tests/mutate-mymeals.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SRC="src/app/(app)/nutrition/v3/NutritionV3Client.tsx"
TEST=tests/unit/myMealsLibrarySplit.test.ts

TMP=$(mktemp -d); cp "$SRC" "$TMP/src"
restore() { cp "$TMP/src" "$SRC"; }
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

echo "baseline (unmutated) must pass:"
restore
if npx tsx --test "$TEST" >/dev/null 2>&1; then echo "  ok    baseline"; else echo "  FAIL  baseline is red"; exit 1; fi

echo
echo "the flag gets dropped again:"
mutate "library field off the state type" "s.replace('items: CustomItem[]; library?: boolean }[]>([])', 'items: CustomItem[] }[]>([])')"
mutate "stops computing which are shared" "s.replace('library: m.client_id == null,', '')"

echo
echo "the split:"
mutate "tab does not choose the list"     "s.replace('const shownMeals = mealTab === \"mine\" ? mineMeals : libraryMeals;', 'const shownMeals = myMeals;')"
# Escaped: bash expands ${...} inside double quotes, so the unescaped form was a
# "bad substitution" that skipped the mutation entirely rather than failing it.
mutate "counts from the unsplit list"     "s.replace('Mine (\${mineMeals.length})', 'Mine (\${myMeals.length})')"
mutate "renders the unsplit list"         "s.replace('{shownMeals.map((mm2) => {', '{myMeals.map((mm2) => {')"

echo
echo "THE DESTRUCTIVE ONE:"
mutate "delete button back on library"    "re.sub(r'\{!mm2\.library && \(\n                <button onClick=\{\(\) => deleteMyMeal\(mm2\)\}', '{true && (\n                <button onClick={() => deleteMyMeal(mm2)}', s)"
mutate "deleteMyMeal drops its guard"     "s.replace('if (m.library) { toast(\"That one is from the shared library — it stays put.\"); return; }', '')"
mutate "guard after the optimistic wipe"  "(lambda g: s.replace(g, '').replace('    const snapshot = { name: m.name', '    const snapshot = { name: m.name').replace('    const { error } = await supabase.from(\"my_meals\").delete().eq(\"id\", m.id);', '    ' + g.strip() + '\n    const { error } = await supabase.from(\"my_meals\").delete().eq(\"id\", m.id);'))(re.search(r'    if \(m\.library\) \{[^\n]*\n', s).group(0))"

echo
echo "the swap list:"
mutate "unordered again"                  "s.replace('[...myMeals.filter((m) => !m.library), ...myMeals.filter((m) => m.library)].map(', 'myMeals.map(')"
mutate "shared rows unlabelled"           "re.sub(r'\{mm2\.library && <span[^\n]*\n', '', s)"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
