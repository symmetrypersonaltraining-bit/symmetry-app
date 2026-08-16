#!/usr/bin/env bash
# Mutation harness for tests/unit/pushTellsTheTruth.test.ts.
#
# Same discipline as tests/mutate-detector.sh and tests/mutate-move.sh: put each
# lie back on purpose and insist the suite goes red.
#
# Not part of the test run. Invoked by hand: bash tests/mutate-push.sh
set -uo pipefail
cd "$(dirname "$0")/.."

WP=src/lib/webPush.ts
PU=src/lib/push.ts
TEST=tests/unit/pushTellsTheTruth.test.ts

FILES=("$WP" "$PU")
TMP=$(mktemp -d)
i=0; for f in "${FILES[@]}"; do cp "$f" "$TMP/$i"; i=$((i+1)); done
restore() { local j=0; for f in "${FILES[@]}"; do cp "$TMP/$j" "$f"; j=$((j+1)); done; }
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
echo "webPush.ts — the read:"
mutate "read error becomes 'no subs'"  "$WP" "re.sub(r'    if \(error\) \{\n(?:[^\n]*\n)*?    \}\n    if \(!subs \|\| subs\.length === 0\) \{', '    if (error || !subs || subs.length === 0) {', s)"
mutate "read error goes unlogged"      "$WP" "re.sub(r'      console\.error\(\"sendWebPush: could not read push_subscriptions[^\n]*\n', '', s)"
mutate "drops the new result type"     "$WP" "s.replace('\"no_vapid_keys\" | \"no_subscriptions\" | \"lookup_failed\"', '\"no_vapid_keys\" | \"no_subscriptions\"').replace('skipped: \"lookup_failed\"', 'skipped: \"no_subscriptions\"')"

echo
echo "webPush.ts — the writes:"
mutate "mark-dead unchecked"           "$WP" "re.sub(r'const \{ error: markErr \} = await admin', 'await admin', s).replace(re.search(r'\n *if \(markErr\) \{\n[^\n]*\n *\}', s).group(0), '')"
mutate "error-note unchecked"          "$WP" "re.sub(r'const \{ error: noteErr \} = await admin', 'await admin', s).replace(re.search(r'\n *if \(noteErr\) \{\n[^\n]*\n *\}', s).group(0), '')"
mutate "deletes dead subscriptions"    "$WP" 're.sub(r"\.update\(\{ failed_at: new Date\(\)\.toISOString\(\)[^\n]*\}\)", ".delete()", s)'
mutate "transient marks it dead"       "$WP" "s.replace('.update({ last_error: String((e as Error)?.message || e).slice(0, 300) })', '.update({ failed_at: new Date().toISOString(), last_error: String((e as Error)?.message || e).slice(0, 300) })')"

echo
echo "push.ts:"
mutate "pruned reports the attempt"    "$PU" "s.replace('pruned = !delErr;', 'pruned = true;')"
mutate "delete back in a dead catch"   "$PU" "re.sub(r'            const \{ error: delErr \} = await admin\.from\(\"device_tokens\"\)\.delete\(\)\.eq\(\"token\", token\);', '            try { await admin.from(\"device_tokens\").delete().eq(\"token\", token); } catch { }', s)"
mutate "hides the prune failure"       "$PU" 're.sub(r"if \(delErr\) pruneErr = [^\n]*", "if (delErr) pruneErr = String();", s)'
mutate "push can break its caller"     "$PU" "s.replace('  } catch { /* push must never break the caller */ }', '  } finally { void 0; }')"
mutate "web push gates fcm"            "$PU" "s.replace('await Promise.all([', 'await Promise.resolve([')"

echo
echo "caught $pass, missed $fail"
[ "$fail" -eq 0 ]
