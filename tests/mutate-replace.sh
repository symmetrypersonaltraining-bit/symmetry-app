#!/usr/bin/env bash
# Mutation harness for tests/unit/replaceOnDate.test.ts and the two callers'
# guards in tests/unit/deadCatchWrites.test.ts.
#
# Same discipline as the other harnesses: break each rule on purpose and insist
# the suite goes red. A guard that passes on broken code reads as coverage while
# providing none.
#
# The rule under test is the one that produced Dustin's 17 Aug — an update that
# matched ZERO rows returned no error, so a replacement that never happened was
# reported as done. Every mutation below is a way of arriving back there.
#
# Not part of the test run. Invoked by hand: bash tests/mutate-replace.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/replaceOnDate.ts
BANNER=src/components/OffPlanBanner.tsx
ADD=src/components/AddWorkoutButton.tsx
T_LIB=tests/unit/replaceOnDate.test.ts
T_GUARD=tests/unit/deadCatchWrites.test.ts

FILES=("$LIB" "$BANNER" "$ADD")
TMP=$(mktemp -d)
i=0; for f in "${FILES[@]}"; do cp "$f" "$TMP/$i"; i=$((i+1)); done
restore() { local j=0; for f in "${FILES[@]}"; do cp "$TMP/$j" "$f"; j=$((j+1)); done; }
trap restore EXIT

pass=0; fail=0

mutate() {
  local name="$1" file="$2" test="$3" expr="$4"
  restore
  # ASSERT THE FILE ACTUALLY CHANGED. Four mutations in an earlier harness were
  # silent no-ops — they targeted lines carrying trailing comments — and it
  # scored a clean pass on mutations that never happened.
  python3 - "$file" "$expr" <<'PY'
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
  if npx tsx --test "$test" >/dev/null 2>&1; then
    echo "  FAIL  $name  — the suite still passed with this broken"
    fail=$((fail+1))
  else
    echo "  ok    $name  — caught"
    pass=$((pass+1))
  fi
}

echo "baseline (unmutated) must pass:"
restore
if npx tsx --test "$T_LIB" "$T_GUARD" >/dev/null 2>&1; then echo "  ok    baseline"; else echo "  FAIL  baseline is red"; exit 1; fi

echo
echo "replaceOnDate.ts — what gets replaced:"
mutate "replaces completed sessions too"        "$LIB" "$T_LIB" "s.replace('.filter((o) => o.status === \"scheduled\")', '')"
mutate "replaces soft-deleted rows"             "$LIB" "$T_LIB" "s.replace('.filter((o) => !o.deleted_at)', '')"
mutate "replaces a session with itself"         "$LIB" "$T_LIB" "s.replace('.filter((o) => o.day_id !== newDayId)', '')"

echo
echo "replaceOnDate.ts — the slot:"
mutate "lands at the bottom, not the old slot"  "$LIB" "$T_LIB" "s.replace('Math.min(...slots)', 'Math.max(...slots)')"
mutate "a null position becomes slot zero"      "$LIB" "$T_LIB" "s.replace('slots.length ? Math.min(...slots) : 1', 'Math.min(...replaced.map((r) => r.position ?? 0))')"

echo
echo "replaceOnDate.ts — THE GUARD:"
mutate "zero rows changed reads as success"     "$LIB" "$T_LIB" "s.replace('if (expected.length === 0) return null;', 'if (true) return null;')"
mutate "counts rows instead of identifying them" "$LIB" "$T_LIB" "s.replace('const missed = expected.filter((e) => !got.has(e.id));', 'const missed = skippedIds.length >= expected.length ? [] : expected;')"
mutate "a partial skip passes silently"         "$LIB" "$T_LIB" "s.replace('if (missed.length === 0) return null;', 'if (missed.length < expected.length) return null;')"
mutate "reports failure with no names"          "$LIB" "$T_LIB" "re.sub(r'missed\.map\(name\)\.join\(\" and \"\)', '\"something\"', s)"

echo
echo "OffPlanBanner.tsx — the swap caller:"
mutate "stops asking which rows changed"        "$BANNER" "$T_GUARD" "s.replace('        .select(\"id\");\n', '        ;\n', 1)"
mutate "drops the verdict check"                "$BANNER" "$T_GUARD" "re.sub(r': skipVerdict\(replacing, \(\(\(skipped as \{ id: string \}\[\] \| null\) \|\| \[\]\).map\(\(s\) => s.id\)\)\);', ': null;', s)"
mutate "skips before the insert is known good"  "$BANNER" "$T_GUARD" "s.replace('if (addErr) {', 'if (false) {')"

echo
echo "AddWorkoutButton.tsx — the add/replace caller:"
mutate "stops asking which rows changed"        "$ADD" "$T_GUARD" "s.replace('          .select(\"id\");\n', '          ;\n', 1)"
mutate "drops the verdict check"                "$ADD" "$T_GUARD" "s.replace('          : skipVerdict(replacing, (((skipped as { id: string }[] | null) || []).map((s) => s.id)));', '          : null;')"
mutate "clears the day after a FAILED insert"   "$ADD" "$T_GUARD" "s.replace('if (ins.error) { window.alert(scheduleWriteError(ins.error, \"add\")); return; }', 'if (ins.error) { window.alert(scheduleWriteError(ins.error, \"add\")); }')"
mutate "stops checking what is on the day"      "$ADD" "$T_GUARD" "s.replace('const replacing = sessionsReplacedBy(occupants, d.id);', 'const replacing: DateOccupant[] = [];')"
mutate "always replaces, never asks"            "$ADD" "$T_GUARD" "s.replace('if (replacing.length === 0) { setBusy(false); await addLibrary(d, \"add\"); return; }', 'if (replacing.length >= 0) { setBusy(false); await addLibrary(d, \"replace\", replacing); return; }')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
