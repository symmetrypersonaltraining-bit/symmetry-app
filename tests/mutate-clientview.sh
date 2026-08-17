#!/usr/bin/env bash
# Mutation harness for tests/unit/clientViewMirrorsTheClientApp.test.ts.
# Not part of the test run. Invoked by hand: bash tests/mutate-clientview.sh
set -uo pipefail
cd /root/symmetry-app
P="src/app/(app)/client-preview/progress/page.tsx"
C="src/app/(app)/progress/page.tsx"
T=tests/unit/clientViewMirrorsTheClientApp.test.ts
TMP=$(mktemp -d); cp "$P" "$TMP/p"; cp "$C" "$TMP/c"
restore() { cp "$TMP/p" "$P"; cp "$TMP/c" "$C"; }
trap restore EXIT
pass=0; fail=0
run() {
  local name="$1"
  if npx tsx --test "$T" >/dev/null 2>&1; then echo "  FAIL  $name"; fail=$((fail+1)); else echo "  ok    $name — caught"; pass=$((pass+1)); fi
  restore
}
restore
npx tsx --test "$T" >/dev/null 2>&1 && echo "  ok    baseline" || { echo "  FAIL baseline"; exit 1; }

python3 - "$P" <<'PY'
import sys,re; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'\n *<GoalsSection[^\n]*\n','\n',s); open(p,'w').write(s)
PY
run "the original bug: Client View drops goals"

python3 - "$P" <<'PY'
import sys,re; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'\n *<PersonalBests[^\n]*\n','\n',s); open(p,'w').write(s)
PY
run "Client View drops some other card"

python3 - "$P" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('viewerIsThisClient={false}','viewerIsThisClient={true}'); open(p,'w').write(s)
PY
run "trainer can accept a goal for the client"

python3 - "$C" <<'PY'
import sys,re; p=sys.argv[1]; s=open(p).read()
s=re.sub(r'\n *<GoalsSection[^\n]*\n','\n',s); open(p,'w').write(s)
PY
run "the real client screen drops goals"

python3 - "$P" <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
s=s.replace('import GoalsSection from "@/components/GoalsSection";\n','')
s=s.replace('<GoalsSection clientId={clientId} viewerIsThisClient={false} />','')
open(p,'w').write(s)
PY
run "import and mount both removed"

echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
