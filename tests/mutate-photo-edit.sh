#!/usr/bin/env bash
# Mutation harness for tests/unit/photoLogIsEditable.test.ts.
# By hand: bash tests/mutate-photo-edit.sh
set -uo pipefail
cd "$(dirname "$0")/.."
SRC="src/app/(app)/nutrition/v3/NutritionV3Client.tsx"
TEST=tests/unit/photoLogIsEditable.test.ts
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
echo "the items get dropped again — Megan's bug:"
mutate "back to keepOv(row)"          "re.sub(r'item_overrides: keepOv\(\n              row,\n              est\.items[\s\S]*?\n            \),', 'item_overrides: keepOv(row),', s)"
mutate "stores something else"        "s.replace('items: est.items,', 'items: [],')"
mutate "empty list still written"     "s.replace('est.items && est.items.length', 'true')"
mutate "loses the planned meal link"  "s.replace('sourceMealId: row.kind === \"plan\" ? row.chosen?.id ?? null : null,', 'sourceMealId: null,')"
echo
echo "the totals she was shown start to drift:"
mutate "est_kcal no longer from the analysis" "s.replace('est_kcal: est.pending ? null : r(est.k),', 'est_kcal: null,')"
echo
echo "the editor becomes unreachable:"
mutate "custom rows lose the editor"  "s.replace('if (row.kind === \"custom\" && row.meta) {', 'if (false) {')"
mutate "__custom stops making a custom row" "s.replace('        const meta = log?.item_overrides?.__custom;\n        if (meta) {', '        const meta = undefined as any;\n        if (meta) {')"
mutate "custom plan row loses options" "s.replace('kind: \"custom\", position: pos, meta, log, options,', 'kind: \"custom\", position: pos, meta, log,')"
mutate "edits stop recomputing macros" "s.replace('    const m = customMealMacros(meta);\n    const logged = !meta.unlogged;', '    const m = { kcal: 0, protein: 0, carbs: 0, fats: 0 };\n    const logged = !meta.unlogged;')"

echo
echo "the estimate stops being editable before it saves:"
mutate "items read-only again"        "re.sub(r'\{est\.items\?\.map\(\(it, i\) => \{[\s\S]*?\n            \}\)\}', '{est.items?.map((it, i) => (<p key={i} className=\"text-xs mt-1\">{it.n}</p>))}', s)"
mutate "cannot take a portion down"   "s.replace('fac: Math.max(0.25, Math.round((((x.fac ?? 1) - 0.25)) * 100) / 100)', 'fac: x.fac ?? 1')"
mutate "portion can hit zero"         "s.replace('Math.max(0.25,', 'Math.max(0,')"
mutate "portion unbounded upward"     "s.replace('Math.min(4,', 'Math.min(4000,')"
mutate "cannot remove an item"        "s.replace('est.items!.filter((_, j) => j !== i)', 'est.items!')"
mutate "edit does not re-price"       "s.replace('const m = customMealMacros({ name: prev.desc, items });', 'const m = { kcal: prev.k, protein: prev.p, carbs: prev.c, fats: prev.f };')"
mutate "est_* not updated"            "s.replace('k: r(m.kcal), p: r(m.protein), c: r(m.carbs), f: r(m.fats),', '')"
mutate "opm left on old numbers"      "s.replace('          ? { ...prev.opm, kcal: r(m.kcal), protein: r(m.protein), carbs: r(m.carbs), fats: r(m.fats), edited_by_client: true }', '          ? { ...prev.opm }')"
mutate "edit not recorded"            "s.replace(', edited_by_client: true }', ' }')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
