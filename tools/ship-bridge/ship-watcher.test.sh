#!/usr/bin/env bash
# Exercise ship-watcher.sh against throwaway repos before it is trusted with
# the real ones. Every case below is a way the bridge could ship to the wrong
# place or refuse a legitimate ship.
set -u
W=/home/claude/ship-watcher.sh
export PROJECTS=/tmp/wt/projects
export OUTBOX=/tmp/wt/outbox
export GH_BASE=/tmp/wt/remote
export POLL=1

# ── Rebuild the world from scratch ──────────────────────────────────────────
# A harness that only passes on a clean tree is not a harness: the first run
# after it seeds v2 leaves v2 no longer unrelated to live, and every later run
# quietly "passes" a case it is no longer testing. Found exactly that way.
setup_world() {
  rm -rf /tmp/wt/remote /tmp/wt/projects /tmp/wt/outbox /tmp/wt/seedlive /tmp/wt/seedv2 /tmp/wt/rogue
  mkdir -p /tmp/wt/remote /tmp/wt/projects /tmp/wt/outbox
  git init -q --bare /tmp/wt/remote/symmetry-app.git
  git init -q --bare /tmp/wt/remote/symmetry-app-v2.git
  git -C /tmp/wt/remote/symmetry-app.git    symbolic-ref HEAD refs/heads/main
  git -C /tmp/wt/remote/symmetry-app-v2.git symbolic-ref HEAD refs/heads/main
  git init -q /tmp/wt/seedlive
  ( cd /tmp/wt/seedlive
    git config user.email t@t; git config user.name T
    echo a >a.txt; git add .; git commit -qm one; git branch -M main
    git remote add origin /tmp/wt/remote/symmetry-app.git; git push -q origin main )
  git init -q /tmp/wt/seedv2
  ( cd /tmp/wt/seedv2
    git config user.email t@t; git config user.name T
    echo placeholder >README.md; git add .; git commit -qm placeholder; git branch -M main
    git remote add origin /tmp/wt/remote/symmetry-app-v2.git; git push -q origin main )
  git clone -q /tmp/wt/remote/symmetry-app.git /tmp/wt/projects/symmetry-app
  git -C /tmp/wt/projects/symmetry-app config user.email t@t
  git -C /tmp/wt/projects/symmetry-app config user.name T
}
setup_world

pass=0; fail=0
ok()   { printf '  PASS  %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  FAIL  %s\n     -> %s\n' "$1" "$2"; fail=$((fail+1)); }

reset_outbox() { rm -f "$OUTBOX"/SHIP-NOW "$OUTBOX"/SHIP-REPO "$OUTBOX"/SHIP-FORCE "$OUTBOX"/ship.bundle "$OUTBOX"/SHIP-RESULT.txt; }
res() { cat "$OUTBOX/SHIP-RESULT.txt" 2>/dev/null; }

# A bundle of whatever main currently is in the live clone.
bundle_live() { git -C "$PROJECTS/symmetry-app" bundle create "$OUTBOX/ship.bundle" main >/dev/null 2>&1; }
live_tip()    { git -C "$PROJECTS/symmetry-app" rev-parse main; }

ship() { # $1=repo(optional) $2=force(optional)
  [ -n "${1:-}" ] && printf '%s\n' "$1" >"$OUTBOX/SHIP-REPO"
  [ -n "${2:-}" ] && printf '%s\n' "$2" >"$OUTBOX/SHIP-FORCE"
  printf '%s\n' "$(live_tip)" >"$OUTBOX/SHIP-NOW"
  bash "$W" once >/dev/null 2>&1
}

echo "=== 1. no SHIP-REPO still ships to LIVE, as it always did ==="
reset_outbox
cd "$PROJECTS/symmetry-app" && echo b >b.txt && git add . && git commit -qm two && cd /
bundle_live; ship
r="$(res)"
case "$r" in
  OK*symmetry-app]*) ok "default target is live" ;;
  *) bad "default target is live" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app.git rev-parse main)" = "$(live_tip)" ]; then
  ok "live actually moved"
else bad "live actually moved" "remote did not advance"; fi

echo "=== 3. v2 with no local clone gets cloned, and a non-FF is REFUSED ==="
reset_outbox; rm -rf "$PROJECTS/symmetry-app-v2"
bundle_live; ship symmetry-app-v2
r="$(res)"
if [ -d "$PROJECTS/symmetry-app-v2/.git" ]; then ok "v2 auto-cloned on first use"; else bad "v2 auto-cloned on first use" "no clone"; fi
case "$r" in
  FAIL*not\ a\ fast-forward*) ok "unrelated history refused without SHIP-FORCE" ;;
  *) bad "unrelated history refused without SHIP-FORCE" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app-v2.git log --oneline -1 --format=%s)" = "placeholder" ]; then
  ok "v2 untouched by the refused push"
else bad "v2 untouched by the refused push" "v2 moved anyway"; fi

echo "=== 4. SHIP-FORCE naming v2 seeds it ==="
reset_outbox; bundle_live; ship symmetry-app-v2 symmetry-app-v2
r="$(res)"
case "$r" in
  OK*symmetry-app-v2]*FORCED*) ok "forced seed reported as forced" ;;
  *) bad "forced seed reported as forced" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app-v2.git rev-parse main)" = "$(live_tip)" ]; then
  ok "v2 now matches live exactly"
else bad "v2 now matches live exactly" "sha mismatch"; fi

echo "=== 5. LIVE can never be force-pushed, whatever the files say ==="
reset_outbox
# Build a bundle whose history is NOT live's, the only case force would matter.
rm -rf /tmp/wt/rogue && git init -q /tmp/wt/rogue && cd /tmp/wt/rogue
git config user.email t@t && git config user.name T
echo rogue >r.txt && git add . && git commit -qm rogue && git branch -M main
git bundle create "$OUTBOX/ship.bundle" main >/dev/null 2>&1
rogue_tip="$(git rev-parse main)"; cd /
before_live="$(git -C /tmp/wt/remote/symmetry-app.git rev-parse main)"
printf 'symmetry-app\n' >"$OUTBOX/SHIP-REPO"
printf 'symmetry-app\n' >"$OUTBOX/SHIP-FORCE"
printf '%s\n' "$rogue_tip" >"$OUTBOX/SHIP-NOW"
bash "$W" once >/dev/null 2>&1
r="$(res)"
case "$r" in
  FAIL*refusing\ to\ force-push*) ok "force against live refused by name" ;;
  *) bad "force against live refused by name" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app.git rev-parse main)" = "$before_live" ]; then
  ok "live main byte-identical after the attempt"
else bad "live main byte-identical after the attempt" "LIVE WAS REWRITTEN"; fi

echo "=== 6. a force file that names a DIFFERENT repo is refused ==="
reset_outbox; bundle_live
printf 'symmetry-app-v2\n' >"$OUTBOX/SHIP-REPO"
printf 'symmetry-app\n'    >"$OUTBOX/SHIP-FORCE"
printf '%s\n' "$(live_tip)" >"$OUTBOX/SHIP-NOW"
bash "$W" once >/dev/null 2>&1
r="$(res)"
case "$r" in
  FAIL*SHIP-FORCE\ says*) ok "mismatched force/target refused" ;;
  *) bad "mismatched force/target refused" "$r" ;;
esac

echo "=== 7. an unknown repo name is refused before anything runs ==="
reset_outbox; bundle_live; ship some-other-repo
r="$(res)"
case "$r" in
  FAIL*unknown\ repo*) ok "unknown repo refused" ;;
  *) bad "unknown repo refused" "$r" ;;
esac
if [ -d "$PROJECTS/some-other-repo" ]; then bad "unknown repo not cloned" "it cloned it"; else ok "unknown repo not cloned"; fi

echo "=== 8. ordinary fast-forward to v2 needs no force at all ==="
reset_outbox
cd "$PROJECTS/symmetry-app" && echo c >c.txt && git add . && git commit -qm three && cd /
bundle_live; ship symmetry-app-v2
r="$(res)"
case "$r" in
  OK*symmetry-app-v2]*) if printf '%s' "$r" | grep -q FORCED; then bad "normal v2 ship is a plain fast-forward" "it forced"; else ok "normal v2 ship is a plain fast-forward"; fi ;;
  *) bad "normal v2 ship is a plain fast-forward" "$r" ;;
esac

echo "=== 9. stale routing files cannot misdirect the NEXT ship ==="
# The first version of this case ran straight after a DEFAULT ship, which never
# writes SHIP-REPO or SHIP-FORCE at all — so "they were cleaned up" was true for
# the wrong reason and the case passed with cleanup deleted entirely. It has to
# follow a request that actually wrote both files.
reset_outbox; rm -rf "$PROJECTS/symmetry-app-v2"
bundle_live; ship symmetry-app-v2 symmetry-app-v2   # writes SHIP-REPO + SHIP-FORCE
for f in SHIP-REPO SHIP-FORCE ship.bundle SHIP-NOW; do
  if [ -e "$OUTBOX/$f" ]; then bad "$f cleaned up after a routed request" "still present"; else ok "$f cleaned up after a routed request"; fi
done
# And the consequence that actually matters: the NEXT ship, which names no repo,
# must go to live rather than inheriting the previous request's target.
cd "$PROJECTS/symmetry-app" && echo d >d.txt && git add . && git commit -qm four && cd /
before_v2="$(git -C /tmp/wt/remote/symmetry-app-v2.git rev-parse main)"
bundle_live
printf '%s\n' "$(live_tip)" >"$OUTBOX/SHIP-NOW"
bash "$W" once >/dev/null 2>&1
r="$(res)"
case "$r" in
  OK*symmetry-app]*) ok "an unrouted ship after a routed one still goes to live" ;;
  *) bad "an unrouted ship after a routed one still goes to live" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app-v2.git rev-parse main)" = "$before_v2" ]; then
  ok "v2 did not receive the unrouted ship"
else bad "v2 did not receive the unrouted ship" "v2 moved"; fi


echo "=== 10. a bundle that is not the SHA I verified is refused ==="
# This is the check that makes the whole bridge trustworthy: the cloud verifies
# a specific commit, then asks for that commit BY NAME. Without it a stale or
# truncated bundle paired with a fresh SHIP-NOW pushes something nobody tested.
# Every other case writes a matching SHA, so this path went unexercised and a
# mutation that deleted the check passed 19/19.
reset_outbox
cd "$PROJECTS/symmetry-app" && echo e >e.txt && git add . && git commit -qm five && cd /
bundle_live
before="$(git -C /tmp/wt/remote/symmetry-app.git rev-parse main)"
printf '%s\n' "0000000000000000000000000000000000000000" >"$OUTBOX/SHIP-NOW"
bash "$W" once >/dev/null 2>&1
r="$(res)"
case "$r" in
  FAIL*does\ not\ match\ requested*) ok "bundle tip must match the requested SHA" ;;
  *) bad "bundle tip must match the requested SHA" "$r" ;;
esac
if [ "$(git -C /tmp/wt/remote/symmetry-app.git rev-parse main)" = "$before" ]; then
  ok "nothing pushed when the SHA disagrees"
else bad "nothing pushed when the SHA disagrees" "IT PUSHED ANYWAY"; fi

echo
echo "passed $pass, failed $fail"
[ "$fail" -eq 0 ]
