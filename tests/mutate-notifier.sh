#!/usr/bin/env bash
# Mutation harness for tests/unit/notifierNamesTheRealSender.test.ts.
# Not part of the test run. Invoked by hand: bash tests/mutate-notifier.sh
set -uo pipefail
cd /root/symmetry-app
N=src/components/MessageNotifier.tsx
A=src/lib/notifications.ts
T=tests/unit/notifierNamesTheRealSender.test.ts
TMP=$(mktemp -d); cp "$N" "$TMP/n"; cp "$A" "$TMP/a"
restore() { cp "$TMP/n" "$N"; cp "$TMP/a" "$A"; }
trap restore EXIT
pass=0; fail=0
run() { local name="$1"
  if npx tsx --test "$T" >/dev/null 2>&1; then echo "  FAIL  $name"; fail=$((fail+1)); else echo "  ok    $name — caught"; pass=$((pass+1)); fi
  restore; }
restore
npx tsx --test "$T" >/dev/null 2>&1 && echo "  ok    baseline" || { echo "  FAIL baseline"; exit 1; }

python3 - "$N" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('${i.fromName} messaged you','${COACH_FIRST_NAME} messaged you')
s=s.replace('import { type Banner } from "@/lib/messageBanners";','import { type Banner } from "@/lib/messageBanners";\nimport { COACH_FIRST_NAME } from "@/lib/trainer";')
open(p,'w').write(s)
PY
run "the original bug restored verbatim"

python3 - "$N" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('`${i.fromName} messaged you`','`${i.fromName} messaged you — ${i.title}`'); open(p,'w').write(s)
PY
run "prints the destination as if it were the sender"

python3 - "$A" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('const fromName = (opts.clientNames && opts.clientNames[clientId]) || undefined;','const fromName = opts.coachFirstName;'); open(p,'w').write(s)
PY
run "trainer told the coach sent it"

python3 - "$A" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('const fromName = (opts.clientNames && opts.clientNames[clientId]) || undefined;','const fromName = (opts.clientNames && opts.clientNames[clientId]) || "Client";'); open(p,'w').write(s)
PY
run "unresolved name dressed up as 'Client'"

python3 - "$A" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('out.push({ key, kind: "group", title: "Group Chat", snippet, count: g.rows.length, time: g.latest, fromPerson,','out.push({ key, kind: "group", title: "Group Chat", snippet, count: g.rows.length, time: g.latest, fromPerson, fromName: opts.coachFirstName,'); open(p,'w').write(s)
PY
run "guesses a sender for the group thread"

python3 - "$A" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('fromName: opts.coachFirstName, href: base','href: base'); open(p,'w').write(s)
PY
run "client never told who messaged them"

python3 - "$N" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('fromPerson: i.fromPerson === true,','fromPerson: false,'); open(p,'w').write(s)
PY
run "a person's message loses its emphasis"

echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
