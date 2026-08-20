#!/usr/bin/env bash
# Mutation harness for tests/unit/trainerInbox.test.ts.
#
# Reintroduces each "there is only one trainer" assumption the routes used to
# carry. Every mutation asserts the file actually changed first — a sed that
# matches nothing is a mutation that never happened, and "the test caught it" is
# then really "the test passed on untouched code".
set -uo pipefail
cd "$(dirname "$0")/.."

RESOLVE=src/lib/trainerResolve.ts
ESC=src/app/api/coach-escalate/route.ts
PF=src/app/api/program-feedback/route.ts
BD=src/app/api/cron/birthdays/route.ts
CB=src/app/api/cron/coachbot/route.ts
AT=src/lib/ai/agent-tools.ts
TEST=tests/unit/trainerInbox.test.ts

pass=0; fail=0
mutate() {
  local name="$1" file="$2" expr="$3"
  cp "$file" "$file.bak"
  if ! python3 - "$file" "$expr" <<'PY'
import sys
p, expr = sys.argv[1], sys.argv[2]
s = open(p).read()
out = eval(expr, {"s": s, "re": __import__("re")})
assert out != s, "MUTATION WAS A NO-OP"
open(p, "w").write(out)
PY
  then
    echo "SETUP FAIL  $name"; fail=$((fail+1)); mv "$file.bak" "$file"; return
  fi
  if npx tsx --test "$TEST" >/dev/null 2>&1; then
    echo "NOT CAUGHT  $name"; fail=$((fail+1))
  else
    echo "caught      $name"; pass=$((pass+1))
  fi
  mv "$file.bak" "$file"
}

mutate "auth account dropped from the trainer record" "$RESOLVE" \
  '''s.replace("    authUserId: (row.auth_user_id as string) ?? null,", "    authUserId: null,")'''
mutate "auth_user_id no longer selected" "$RESOLVE" \
  '''s.replace("\"id, auth_user_id, email", "\"id, email")'''
mutate "owner picked by order instead of role" "$RESOLVE" \
  '''s.replace("from(\"trainers\").select(COLS).eq(\"role\", \"owner\").limit(1)", "from(\"trainers\").select(COLS).limit(1)")'''
mutate "client trainer lookup ignores the client" "$RESOLVE" \
  '''s.replace("  if (!clientId) return null;\n  const { data: cRows } = await q(db).from(\"clients\")", "  const { data: cRows } = await q(db).from(\"clients\")").replace(".eq(\"id\", clientId).limit(1)", ".limit(1)")'''
mutate "no fallback when the client has no trainer" "$RESOLVE" \
  '''s.replace("""    if (t?.authUserId) return t.authUserId;
  } catch {
""", """    return t?.authUserId ?? null;
  } catch {
""").replace("""  }
  return ownerAuthUid(db);
}""", """  }
  return null;
}""")'''
mutate "a throwing database propagates instead of degrading" "$RESOLVE" \
  '''s.replace("""export async function ownerAuthUid(db: AnyDb): Promise<string | null> {
  try {
    const o = await ownerTrainer(db);
    return o?.authUserId ?? null;
  } catch {
    return null;
  }
}""", """export async function ownerAuthUid(db: AnyDb): Promise<string | null> {
  const o = await ownerTrainer(db);
  return o?.authUserId ?? null;
}""")'''

mutate "escalation goes back to an arbitrary trainer_settings row" "$ESC" \
  '''s.replace("const trainerUid = await inboxAuthUidForClient(db, me.id);", "const { data: ts } = await db.from(\"trainer_settings\").select(\"user_id\").limit(1).maybeSingle();\n  const trainerUid = (ts as { user_id: string } | null)?.user_id ?? null;")'''
mutate "programming answer goes to the owner regardless of client" "$PF" \
  '''s.replace("inboxAuthUidForClient(db, cid),", "ownerAuthUid(db),").replace("import { inboxAuthUidForClient }", "import { ownerAuthUid }")'''
mutate "birthday post picks a trainer at random" "$BD" \
  '''s.replace("const trainerUid = await ownerAuthUid(db);", "const { data: ts } = await db.from(\"trainer_settings\").select(\"user_id\").limit(1).maybeSingle();\n  const trainerUid = (ts as { user_id: string } | null)?.user_id;")'''
mutate "coachbot posts as a random trainer" "$CB" \
  '''s.replace("const trainerUid = await ownerAuthUid(db);", "const { data: ts } = await db.from(\"trainer_settings\").select(\"user_id\").limit(1).maybeSingle();\n  const trainerUid = (ts as { user_id: string } | null)?.user_id;")'''
mutate "agent DM sent from the owner instead of the client's coach" "$AT" \
  '''s.replace("else trainerUid = await inboxAuthUidForClient(db, clientId);", "else trainerUid = await ownerAuthUid(db);")'''
mutate "agent group post sent from a client's coach" "$AT" \
  '''s.replace("if (isGroup) trainerUid = await ownerAuthUid(db);", "if (isGroup) trainerUid = await inboxAuthUidForClient(db, clientId);")'''

echo
echo "caught $pass / $((pass+fail))"
[ "$fail" -eq 0 ]
