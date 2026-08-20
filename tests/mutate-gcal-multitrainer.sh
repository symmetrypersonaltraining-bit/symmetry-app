#!/usr/bin/env bash
# Mutation harness for tests/unit/gcalMultiTrainer.test.ts.
#
# A structural test that passes on correct code proves nothing on its own — the
# question is whether it FAILS on the bug it claims to pin. Each mutation below
# reintroduces one of the single-tenant faults; the test must go red for it.
#
# Every mutation asserts the file actually changed. A sed that silently matches
# nothing is a mutation that never happened, and a "test caught it" that is
# really "test passed on untouched code".
set -uo pipefail
cd "$(dirname "$0")/.."

ROUTE=src/app/api/gcal-sync/route.ts
GCAL=src/lib/gcal.ts
DISC=src/app/api/auth/google/disconnect/route.ts
SCHED='src/app/(app)/schedule/scheduleActions.ts'
TEST=tests/unit/gcalMultiTrainer.test.ts

pass=0; fail=0
run() { npx tsx --test "$TEST" >/dev/null 2>&1; }

mutate() { # name file python-expr
  local name="$1" file="$2" expr="$3"
  cp "$file" "$file.bak"
  python3 - "$file" "$expr" <<'PY'
import sys
p, expr = sys.argv[1], sys.argv[2]
s = open(p).read()
out = eval(expr, {"s": s, "re": __import__("re")})
assert out != s, "MUTATION WAS A NO-OP: " + expr
open(p, "w").write(out)
PY
  if [ $? -ne 0 ]; then
    echo "SETUP FAIL  $name (mutation did not apply)"; fail=$((fail+1))
    mv "$file.bak" "$file"; return
  fi
  if run; then
    echo "NOT CAUGHT  $name"; fail=$((fail+1))
  else
    echo "caught      $name"; pass=$((pass+1))
  fi
  mv "$file.bak" "$file"
}

# --- the token names a trainer -------------------------------------------
mutate "getValidAccessToken loses its parameter" "$GCAL" \
  's.replace("getValidAccessToken(userId?: string)", "getValidAccessToken()")'
mutate "userId accepted but not passed to the RPC" "$GCAL" \
  's.replace("p_user_id: userId ?? null", "p_user_id: null")'
mutate "per-trainer sync takes a bare token" "$ROUTE" \
  's.replace("getValidAccessToken(trainer.user_id)", "getValidAccessToken()")'

# --- clients scoped ------------------------------------------------------
mutate "gcal_get_clients unscoped" "$ROUTE" \
  '''s.replace("""rpc('"'"'gcal_get_clients'"'"', {\n    p_trainer_id: trainer.trainer_id,\n  })""", "rpc('"'"'gcal_get_clients'"'"')")'''
mutate "empty roster is fatal again" "$ROUTE" \
  '''s.replace("if (!clients?.length) return emptyResult(who, '"'"'no clients assigned'"'"');", "if (!clients?.length) throw new Error('"'"'No clients found'"'"');")'''

# --- reconcile scoped (the data-destroying one) --------------------------
mutate "appointment reconcile unscoped" "$ROUTE" \
  '''re.sub(r"p_time_max: timeMax,\n      p_trainer_id: trainer.trainer_id,\n    \}\);\n    if \(rcErr\)", "p_time_max: timeMax,\n    });\n    if (rcErr)", s, count=1)'''
mutate "payment reconcile unscoped" "$ROUTE" \
  '''re.sub(r"p_time_max: timeMax,\n      p_trainer_id: trainer.trainer_id,\n    \}\);\n    if \(rcpErr\)", "p_time_max: timeMax,\n    });\n    if (rcpErr)", s, count=1)'''

# --- reset placement -----------------------------------------------------
mutate "whole-table reset moved into the per-trainer body" "$ROUTE" \
  '''s.replace("""    if (resetFirst) {\n      await supabase.rpc('"'"'gcal_clear_appointments'"'"');\n    }\n""", "").replace("  const appointmentBatch: any[] = [];", "  if (opts.resetHappened) await supabase.rpc('"'"'gcal_clear_appointments'"'"');\n  const appointmentBatch: any[] = [];")'''

# --- the loop ------------------------------------------------------------
mutate "trainers no longer enumerated" "$ROUTE" \
  '''s.replace("rpc('"'"'gcal_list_connected_trainers'"'"')", "rpc('"'"'gcal_get_tokens'"'"')")'''
mutate "calendars synced in parallel" "$ROUTE" \
  '''s.replace("for (const t of trainers) {", "await Promise.all(trainers.map(async (t) => { if (false) syncOneCalendar(supabase, t, { narrow, resetHappened: resetFirst });")'''
mutate "one dead credential aborts the run" "$ROUTE" \
  '''s.replace("""      try {\n        results.push(await syncOneCalendar(supabase, t, { narrow, resetHappened: resetFirst }));\n      } catch (e: any) {""", """      {\n        results.push(await syncOneCalendar(supabase, t, { narrow, resetHappened: resetFirst }));\n      }\n      if (false) { const e: any = null;""")'''

# --- roster-wide recalcs -------------------------------------------------
mutate "billing recalc moved inside the loop" "$ROUTE" \
  '''s.replace("      const { data: rr, error: rrErr } = await supabase.rpc('"'"'recalc_pending_payment_reminders'"'"');", "      const { data: rr, error: rrErr } = await supabase.rpc('"'"'noop_recalc'"'"');").replace("  const dollarEvents = allEvents.filter", "  await supabase.rpc('"'"'recalc_pending_payment_reminders'"'"');\n  const dollarEvents = allEvents.filter")'''

# --- response contract ---------------------------------------------------
mutate "synced total dropped from the response" "$ROUTE" \
  '''s.replace("      synced: sum(r => r.synced),", "      synced_total: sum(r => r.synced),")'''

# --- disconnect ----------------------------------------------------------
mutate "Disconnect revokes an arbitrary trainer's grant" "$DISC" \
  '''s.replace("rpc('"'"'gcal_get_tokens'"'"', { p_user_id: user.id })", "rpc('"'"'gcal_get_tokens'"'"')")'''

# --- schedule actions ----------------------------------------------------
mutate "a schedule action edits the wrong calendar" "$SCHED" \
  '''s.replace("getValidAccessToken(await viewerCalendarUserId(supabase))", "getValidAccessToken()", 1)'''

echo
echo "caught $pass / $((pass+fail))"
[ "$fail" -eq 0 ]
