#!/usr/bin/env bash
# Mutation harness for tests/unit/detectorAbsenceIsNotASignal.test.ts.
#
# A guard that passes when the code is broken is worse than no guard: it reads
# as coverage. Each case below breaks the migration in one specific way and the
# harness insists the suite FAILS. Any case that still passes is a test that
# proves nothing, and gets tightened before it ships.
#
# Not part of the test run. Invoked by hand: bash tests/mutate-detector.sh
set -uo pipefail
cd "$(dirname "$0")/.."

DET=supabase/migrations/20260816_one_move_proposal_per_session.sql
RES=supabase/migrations/20260816_resolve_moves_the_one_session.sql
BAKD=supabase/migrations/20260816_bak_detect_schedule_changes.sql
BAKR=supabase/migrations/20260816_bak_resolve_schedule_proposal.sql
SUP=supabase/migrations/20260816_supersede_false_positive_proposals.sql
TEST=tests/unit/detectorAbsenceIsNotASignal.test.ts

FILES=("$DET" "$RES" "$BAKD" "$BAKR" "$SUP")
TMP=$(mktemp -d)
for f in "${FILES[@]}"; do cp "$f" "$TMP/$(basename "$f")"; done
restore() { for f in "${FILES[@]}"; do cp "$TMP/$(basename "$f")" "$f"; done; }
trap restore EXIT

pass=0; fail=0

# mutate <name> <file> <python-expression-on-s>
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
echo "detect_schedule_changes:"
mutate "re-emits 'orphaned'"            "$DET" "s.replace(\"'moved', 'one_off',\", \"'orphaned', 'one_off',\")"
mutate "drops one eligibility join"     "$DET" "s.replace('  join _scd_eligible e on e.client_id = a.client_id\n', '', 1)"
mutate "drops all eligibility gating"   "$DET" "re.sub(r'  join _scd_eligible[^\n]*\n', '', s)"
mutate "stops computing orphans"        "$DET" "s.replace('create temporary table _scd_orphan', 'create temporary table _scd_orphan_unused')"
mutate "inserts orphans directly"       "$DET" "s.replace('from _scd_pair p\n  where not exists', 'from _scd_orphan p\n  where not exists')"
mutate "one session, many dates"        "$DET" "s.replace('select distinct on (sw_id) * from cand', 'select * from cand')"
mutate "many sessions, one appointment" "$DET" "s.replace('select distinct on (appt_id) * from best_for_session', 'select * from best_for_session')"
mutate "pairs by sort order not gap"    "$DET" "s.replace('abs(u.to_date - o.from_date) as gap', '0 as gap')"
mutate "double-reports paired appt"     "$DET" "s.replace('  where not exists (select 1 from _scd_pair p where p.appt_id = u.appt_id)\n', '')"
mutate "keeps the stale move pending"   "$DET" "re.sub(r'  update schedule_change_proposals p\n     set status = .superseded., resolved_at = now\(\)\n   from _scd_pair pr\n(?:[^\n]*\n)*?     and p\.to_date is distinct from pr\.to_date;\n', '', s)"
mutate "raises a duplicate move"        "$DET" "re.sub(r'  where not exists \(select 1 from schedule_change_proposals x\n                    where x\.status = .pending. and x\.reason = .moved.\n                      and x\.scheduled_workout_id = p\.sw_id\)\n', '', s)"
mutate "deletes schedule rows"          "$DET" "s.replace('  select count(*) into n from schedule_change_proposals', '  delete from scheduled_workouts where false;\n  select count(*) into n from schedule_change_proposals')"
mutate "deletes proposals"              "$DET" "s.replace('  select count(*) into n from schedule_change_proposals', '  delete from schedule_change_proposals where false;\n  select count(*) into n from schedule_change_proposals')"
mutate "detector applies its own moves" "$DET" "s.replace('  select count(*) into n from schedule_change_proposals', '  perform resolve_schedule_proposal(null, null);\n  select count(*) into n from schedule_change_proposals')"

echo
echo "resolve_schedule_proposal:"
mutate "matches by date not session"    "$RES" "s.replace('       where sw.id = v_p.scheduled_workout_id', '       where sw.client_id = v_p.client_id')"
mutate "drops the staleness guard"      "$RES" "re.sub(r'\n *and sw\.scheduled_date = v_p\.from_date[^\n]*', '', s)"
mutate "homework blocks the move again" "$RES" "re.sub(r'\n *and x\.supervised[^\n]*', '', s)"
mutate "the moving row blocks itself"   "$RES" "s.replace('                            and x.id <> sw.id)', ')')"
mutate "moves a logged session"         "$RES" "re.sub(r'\n *and sw\.workout_log_id is null[^\n]*', '', s)"
mutate "guesses when sw_id is null"     "$RES" "re.sub(r' *if v_p\.scheduled_workout_id is null then\n(?:[^\n]*\n)*? *end if;\n', '', s, count=1)"
mutate "delete-and-reinsert"            "$RES" "s.replace('    with moved as (', '    delete from scheduled_workouts where false;\n    with moved as (')"
mutate "acknowledging edits schedule"   "$RES" "s.replace(\"    v_outcome := 'acknowledged';\", \"    update scheduled_workouts set updated_at = now() where false;\n    v_outcome := 'acknowledged';\")"
mutate "loses the trainer gate"         "$RES" "s.replace('resolve_schedule_proposal is trainer-only', 'nope')"
mutate "acts on a proposal twice"       "$RES" "s.replace('refusing to act twice', 'again')"

echo
echo "backups and the retired rows:"
mutate "detector backup captures nothing" "$BAKD" "s.replace('pg_get_functiondef(p.oid)', \"'stub'\")"
mutate "resolve backup captures nothing"  "$BAKR" "s.replace('pg_get_functiondef(p.oid)', \"'stub'\")"
mutate "retired rows never recorded"      "$SUP" "re.sub(r'insert into public\.bak_scp_superseded_20260816\n(?:[^;]*);', 'select 1;', s)"
mutate "retired rows deleted not superseded" "$SUP" "s.replace('update public.schedule_change_proposals p\n   set status = ', 'delete from public.schedule_change_proposals p\n where false; update public.schedule_change_proposals p\n   set status = ')"

echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
