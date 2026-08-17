#!/usr/bin/env bash
# Mutation harness for tests/unit/recipeLibraryPublishes.test.ts.
#
# This guard has two jobs pulling in opposite directions: the library must be
# publishable, and a client must still never publish their own recipe. A
# mutation in either direction has to go red.
#
# Not part of the test run. By hand: bash tests/mutate-recipe-publish.sh
set -uo pipefail
cd "$(dirname "$0")/.."

MIG=supabase/migrations/20260817_library_recipes_can_actually_publish.sql
TEST=tests/unit/recipeLibraryPublishes.test.ts

TMP=$(mktemp -d)
cp "$MIG" "$TMP/mig"
restore() { cp "$TMP/mig" "$MIG"; }
trap restore EXIT

pass=0; fail=0

mutate() {
  local name="$1" expr="$2"
  restore
  python3 - "$MIG" "$expr" <<'PY'
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
echo "the library goes dark again:"
mutate "removes the library exemption"    "re.sub(r'  if new\.client_id is null then\n    new\.updated_at := now\(\);\n    return new;\n  end if;\n\n', '', s)"
mutate "exemption after the demotion"     "(lambda blk: s.replace(blk, '').replace(\"  if tg_op = 'INSERT' then\\n    if new.visibility = 'public' and not is_trainer() then\\n      new.visibility := 'private';\\n    end if;\\n    return new;\\n  end if;\\n\", \"  if tg_op = 'INSERT' then\\n    if new.visibility = 'public' and not is_trainer() then\\n      new.visibility := 'private';\\n    end if;\\n    return new;\\n  end if;\\n\" + blk))(re.search(r'  if new\.client_id is null then\n    new\.updated_at := now\(\);\n    return new;\n  end if;\n', s).group(0))"

echo
echo "the hole it must not open — a client publishing their own:"
mutate "INSERT demotion removed"          "s.replace(\"      new.visibility := 'private';\", '      null;')"
mutate "UPDATE revert removed"            "s.replace('    new.visibility := old.visibility;', '    null;')"
mutate "INSERT stops checking is_trainer" "s.replace(\"if new.visibility = 'public' and not is_trainer() then\", \"if false then\")"
mutate "UPDATE stops checking is_trainer" "s.replace('     and not is_trainer() then', '     and false then')"
mutate "exempts by visibility, not owner" "s.replace('  if new.client_id is null then', \"  if new.visibility = 'public' then\")"

echo
echo "reversibility:"
mutate "no backup of the old definition"  "re.sub(r'create table if not exists public\.bak_enforce_recipe_publish_20260817 as[\s\S]*?proname = .enforce_recipe_publish.;\n', '', s)"
mutate "the data UPDATE moves in here"    "s + \"\\nupdate public.recipes set visibility = 'public' where client_id is null;\\n\""

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
