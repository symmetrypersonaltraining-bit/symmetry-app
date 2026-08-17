#!/usr/bin/env bash
# Mutation harness for tests/unit/completionTarget.test.ts.
#
# The failure this guards against is the quietest kind: the workout IS logged,
# the sets ARE saved, and the credit lands on a different date. Dustin found it
# only because his home screen said 0% on a day he had trained.
#
# By hand: bash tests/mutate-completion.sh
set -uo pipefail
cd "$(dirname "$0")/.."

LIB=src/lib/completionTarget.ts
LOG="src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"
TEST=tests/unit/completionTarget.test.ts

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
echo "the credit goes to the wrong session — Dustin's actual bug:"
mutate "opened row no longer preferred"  "$LIB" "s.replace('  if (live(openedRow)) {', '  if (false) {')"
mutate "chooser ignores the opened row"  "$LIB" "s.replace('export function chooseCompletionTargets(\n  openedRow: CompletionCandidate | null | undefined,', 'export function chooseCompletionTargets(\n  _openedRow: CompletionCandidate | null | undefined,').replace('  if (live(openedRow)) {', '  const openedRow = null; if (live(openedRow)) {')"
mutate "logger stops passing the id"     "$LOG" "s.replace('const __opened = ((__openedRows as CompletionCandidate[] | null) ?? [])[0] ?? null;', 'const __opened = null;')"
mutate "logger back to day_id targeting" "$LOG" "s.replace('let __swIds: string[] = __choice.ids;', 'let __swIds: string[] = ((__todayRows as { id: string }[] | null) ?? []).map((r) => r.id);')"

echo
echo "rows that must not be touched:"
mutate "completes a deleted opened row"  "$LIB" "s.replace('    !!r && !r.deleted_at && r.status !== \"completed\";', '    !!r;')"
mutate "re-completes a finished session" "$LIB" "s.replace(\"&& r.status !== 'completed'\", '').replace('&& r.status !== \"completed\"', '')"
mutate "sweeps in another date"          "$LIB" "s.replace('todayRows.filter((r) => !r.deleted_at && r.scheduled_date === sessionDate)', 'todayRows.filter((r) => !r.deleted_at)')"
mutate "completes only the first twin"   "$LIB" "s.replace('return { ids: today.map((r) => r.id), source: \"today\", crossesDate: false };', 'return { ids: [today[0].id], source: \"today\", crossesDate: false };')"

echo
echo "a make-up stops being flagged:"
mutate "crossesDate always false"        "$LIB" "s.replace('crossesDate: !!r.scheduled_date && r.scheduled_date !== sessionDate,', 'crossesDate: false,')"

echo
echo "the write stops proving it landed:"
mutate "verdict never fires"             "$LIB" "s.replace('  if (expectedIds.length === 0) return null;', '  return null;')"
mutate "counts instead of identifying"   "$LIB" "s.replace('const missed = expectedIds.filter((id) => !got.has(id));', 'const missed = changedIds.length >= expectedIds.length ? [] : expectedIds;')"
mutate "partial completion passes"       "$LIB" "s.replace('if (missed.length === 0) return null;', 'if (missed.length < expectedIds.length) return null;')"
mutate "logger drops select(id)"         "$LOG" "s.replace('            .in(\"id\", __swIds)\n            .select(\"id\");', '            .in(\"id\", __swIds);')"

restore
echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
