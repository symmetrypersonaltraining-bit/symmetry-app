#!/usr/bin/env bash
# Mutation harness for tests/unit/coachDoesNotTellDustinToMessageDustin.test.ts
# and tests/unit/notifierNamesTheRealSender.test.ts.
# Not part of the test run. Invoked by hand: bash tests/mutate-coachself.sh
set -uo pipefail
cd "$(dirname "$0")/.."
C=src/lib/ai/coach-context.ts
T=tests/unit/coachDoesNotTellDustinToMessageDustin.test.ts
TMP=$(mktemp -d); cp "$C" "$TMP/c"
restore() { cp "$TMP/c" "$C"; }
trap restore EXIT
pass=0; fail=0
run() { local name="$1"
  if npx tsx --test "$T" >/dev/null 2>&1; then echo "  FAIL  $name"; fail=$((fail+1)); else echo "  ok    $name — caught"; pass=$((pass+1)); fi
  restore; }
restore
npx tsx --test "$T" >/dev/null 2>&1 && echo "  ok    baseline" || { echo "  FAIL baseline"; exit 1; }

python3 - "$C" <<'PY'
import sys,re; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'  if \(profile\?\.isCoachThemselves\) \{\n', '  if (true) {\n', s); open(p,'w').write(s)
PY
run "every client told they are the trainer"

python3 - "$C" <<'PY'
import sys,re; p=sys.argv[1]; s=open(p).read()
i=s.index('  if (profile?.isCoachThemselves) {'); j=s.index('  }', s.index('`WHO IS READING THIS'))
s=s[:i]+s[i:j].replace('  if (profile?.isCoachThemselves) {\n','')+s[j+4:]; open(p,'w').write(s)
PY
run "guard removed entirely"

python3 - "$C" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('const isCoachThemselves = isTrainerEmail(c.email);','const isCoachThemselves = false;'); open(p,'w').write(s)
PY
run "his own record never recognised"

python3 - "$C" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('const isCoachThemselves = isTrainerEmail(c.email);','const isCoachThemselves = true;'); open(p,'w').write(s)
PY
run "every client recognised as the coach"

python3 - "$C" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('.select("name, email, primary_goal','.select("name, primary_goal'); open(p,'w').write(s)
PY
run "email dropped from the query"

python3 - "$C" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('NEVER tell him to message, ask, check with, or run anything by','You may mention'); open(p,'w').write(s)
PY
run "the instruction stops forbidding it"

python3 - "$C" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('suggestions for the client to run by ${COACH_FIRST_NAME}','suggestions'); open(p,'w').write(s)
PY
run "shared prompt edited instead of the context"

echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
