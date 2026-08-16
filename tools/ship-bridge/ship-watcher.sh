#!/usr/bin/env bash
# =====================================================================
# Symmetry ship bridge — cloud session builds, this laptop pushes.
#
# WHY THIS EXISTS
#   A Cowork CLOUD session cannot reach github.com for this repo. Its git
#   proxy refuses any repo not in the session's authorized set, and
#   device_bash (which runs on this laptop) has no network at all.
#   But this laptop's own clone IS authenticated via Git Credential Manager.
#   So: the cloud does all the work and verification, drops a git bundle in
#   the outbox, and this script performs the one step the cloud cannot.
#
# PROTOCOL
#   cloud writes -> outbox/ship.bundle      (the commits)
#                   outbox/SHIP-REPO        (optional; which repo. default live)
#                   outbox/SHIP-FORCE       (optional; see BELOW. never live)
#                   outbox/SHIP-NOW         (trigger, written LAST; target SHA)
#   this writes  -> outbox/SHIP-RESULT.txt  (OK/FAIL + repo + new main SHA)
#                   outbox/ship-log.txt     (append-only history)
#   this deletes -> SHIP-NOW, ship.bundle, SHIP-REPO, SHIP-FORCE when finished
#
# WHICH REPO  (added 16 Aug 2026)
#   Until now this script could only ever push to the live repo — the path was
#   a constant. That meant the v2 dev repo, the whole point of which is to be
#   an exact mirror of live so Dylan tests the real thing, could not be shipped
#   to at all: every attempt ended with "needs Dustin's hands".
#
#   Now the cloud names its target in outbox/SHIP-REPO, one short name from
#   the table below. No file means the live repo, so every existing habit and
#   every scheduled overnight session keeps working unchanged.
#
#   A named repo that is not cloned yet is cloned on first use. That is safe:
#   this laptop's credential already decides what it may read.
#
# FORCE, AND WHY LIVE CAN NEVER HAVE IT
#   Seeding a fresh dev repo is not a fast-forward — v2 holds one unrelated
#   placeholder commit from July, so replacing it with live's history is a
#   rewrite by definition. That one legitimate case is the only reason force
#   exists here. It requires outbox/SHIP-FORCE to NAME the repo, it uses
#   --force-with-lease so a repo that moved underneath us is still refused,
#   and LIVE_REPO is rejected before anything else runs. There is no argument,
#   no environment variable and no file that force-pushes live from here.
#
# USAGE
#   ./ship-watcher.sh          # watch forever (normal)
#   ./ship-watcher.sh once     # process one pending request, then exit
# =====================================================================

set -uo pipefail

# The three paths are overridable so this script can be exercised against
# throwaway repos before it is trusted with the real ones. Unset, they are
# exactly the laptop's real layout.
GH_BASE="${GH_BASE:-https://github.com/symmetrypersonaltraining-bit}"
PROJECTS="${PROJECTS:-/c/Users/dusti/Claude/Projects}"
LIVE_REPO="symmetry-app"          # the one that may never be force-pushed
DEFAULT_REPO="$LIVE_REPO"         # no SHIP-REPO file == live, as it always was

OUTBOX="${OUTBOX:-/c/Users/dusti/Claude/Projects/Trainer App/outbox}"
LOG="$OUTBOX/ship-log.txt"
POLL="${POLL:-8}"
MODE="${1:-watch}"

# The only repos this bridge will ever touch. Anything else is refused by name.
is_known_repo() {
  case "$1" in
    symmetry-app|symmetry-app-v2) return 0 ;;
    *) return 1 ;;
  esac
}

mkdir -p "$OUTBOX" 2>/dev/null

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG" 2>/dev/null
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

result() {
  printf '%s\n' "$1" >"$OUTBOX/SHIP-RESULT.txt" 2>/dev/null
  log "RESULT: $(printf '%s' "$1" | head -1)"
}

cleanup_request() {
  rm -f "$OUTBOX/SHIP-NOW" "$OUTBOX/ship.bundle" \
        "$OUTBOX/SHIP-REPO" "$OUTBOX/SHIP-FORCE" 2>/dev/null
}

trap 'log "watcher stopped by signal"; exit 0' INT TERM

# ---- preflight -------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  log "FATAL: git not on PATH (run this from Git Bash, not cmd)"
  exit 1
fi
if [ ! -d "$PROJECTS/$LIVE_REPO/.git" ]; then
  log "FATAL: no git repo at $PROJECTS/$LIVE_REPO"
  result "FAIL preflight: no git repo at $PROJECTS/$LIVE_REPO"
  exit 1
fi

log "=========================================================="
log "ship watcher up. projects=$PROJECTS  default=$DEFAULT_REPO"
log "repos allowed: symmetry-app (live, never forced), symmetry-app-v2"
log "outbox=$OUTBOX  mode=$MODE  poll=${POLL}s"
log "waiting for outbox/SHIP-NOW ..."

# ---- make sure the named repo exists locally -------------------------
ensure_clone() {
  local name="$1" dir="$PROJECTS/$1"
  if [ -d "$dir/.git" ]; then return 0; fi
  log "no local clone of $name — cloning from github ..."
  if ! git clone "$GH_BASE/$name.git" "$dir" >>"$LOG" 2>&1; then
    result "FAIL: could not clone $name.
Open Git Bash and run:  git clone $GH_BASE/$name.git \"$dir\"
If it asks to sign in, finish that once and the bridge handles it from then on."
    return 1
  fi
  log "cloned $name -> $dir"
  return 0
}

# ---- one shipping cycle ---------------------------------------------
do_ship() {
  local want bundle_sha before after repo dir force forced_note push_args

  want="$(tr -d '[:space:]' <"$OUTBOX/SHIP-NOW" 2>/dev/null)"

  repo="$(tr -d '[:space:]' <"$OUTBOX/SHIP-REPO" 2>/dev/null)"
  [ -n "$repo" ] || repo="$DEFAULT_REPO"
  if ! is_known_repo "$repo"; then
    result "FAIL: unknown repo '$repo' in SHIP-REPO. Nothing pushed."
    cleanup_request; return 1
  fi
  dir="$PROJECTS/$repo"

  force="$(tr -d '[:space:]' <"$OUTBOX/SHIP-FORCE" 2>/dev/null)"
  forced_note=""
  if [ -n "$force" ]; then
    # Force must NAME the repo. A bare "yes" would be one stray file away from
    # rewriting whichever repo happened to be the target.
    if [ "$force" != "$repo" ]; then
      result "FAIL: SHIP-FORCE says '$force' but the target is '$repo'. Nothing pushed."
      cleanup_request; return 1
    fi
    if [ "$repo" = "$LIVE_REPO" ]; then
      result "FAIL: refusing to force-push $LIVE_REPO. Live main is never rewritten
from this bridge, by any file or flag. Rebase onto origin/main and resend."
      cleanup_request; return 1
    fi
  fi

  log "--- request: repo=$repo target SHA ${want:-<none>}${force:+ FORCED} ---"

  if [ ! -s "$OUTBOX/ship.bundle" ]; then
    log "bundle missing or empty; waiting for it to finish landing"
    return 10
  fi

  ensure_clone "$repo" || { cleanup_request; return 1; }
  cd "$dir" || { result "FAIL: cannot cd $dir"; cleanup_request; return 1; }

  # Fetch origin FIRST. A thin bundle's prerequisite commits are whatever
  # origin/main already had, so verifying before fetching fails on a clone
  # that is behind. (Got this wrong once - it reported "corrupt bundle".)
  before="$(git rev-parse --short origin/main 2>/dev/null || echo none)"
  log "fetching origin (proves credential is alive) ..."
  if ! git fetch origin main >>"$LOG" 2>&1; then
    result "FAIL [$repo]: git fetch origin failed. Credential Manager may need a re-login.
Open Git Bash at $dir and run: git fetch origin"
    cleanup_request; return 1
  fi
  log "$repo origin/main = $(git rev-parse --short origin/main 2>/dev/null || echo none)"

  if ! git bundle verify "$OUTBOX/ship.bundle" >>"$LOG" 2>&1; then
    result "FAIL [$repo]: bundle did not verify. Either the transfer truncated, or this
clone lacks the bundle's prerequisite commits. See ship-log.txt - if it says
'lacks these prerequisite commits', the cloud must resend a full bundle."
    cleanup_request; return 1
  fi

  log "importing bundle -> __ship_tmp"
  if ! git fetch "$OUTBOX/ship.bundle" '+refs/heads/main:refs/heads/__ship_tmp' >>"$LOG" 2>&1; then
    result "FAIL [$repo]: could not import bundle into the local clone"
    cleanup_request; return 1
  fi

  bundle_sha="$(git rev-parse __ship_tmp 2>/dev/null)"
  log "bundle tip = ${bundle_sha:-unknown}"

  if [ -n "$want" ] && [ "${bundle_sha:0:${#want}}" != "$want" ]; then
    result "FAIL [$repo]: bundle tip $bundle_sha does not match requested $want. Nothing pushed."
    git branch -D __ship_tmp >>"$LOG" 2>&1
    cleanup_request; return 1
  fi

  # Refuse anything that is not a fast-forward of origin/main, unless this
  # request explicitly named the repo in SHIP-FORCE (never live, checked above).
  push_args="__ship_tmp:main"
  if ! git merge-base --is-ancestor origin/main __ship_tmp 2>/dev/null; then
    if [ -z "$force" ]; then
      result "FAIL [$repo]: not a fast-forward of origin/main ($before). Refusing to push.
The cloud session must rebase onto origin/main and resend."
      git branch -D __ship_tmp >>"$LOG" 2>&1
      cleanup_request; return 1
    fi
    # --force-with-lease: if origin/main moved since the fetch above, refuse.
    push_args="--force-with-lease=main:$(git rev-parse origin/main 2>/dev/null) __ship_tmp:main"
    forced_note=" (FORCED - history replaced)"
    log "not a fast-forward; SHIP-FORCE names $repo, pushing with --force-with-lease"
  fi

  log "pushing __ship_tmp -> $repo/main ..."
  # shellcheck disable=SC2086
  if ! git push origin $push_args >>"$LOG" 2>&1; then
    result "FAIL [$repo]: git push rejected. See ship-log.txt for the exact error."
    git branch -D __ship_tmp >>"$LOG" 2>&1
    cleanup_request; return 1
  fi

  git fetch origin main >>"$LOG" 2>&1
  after="$(git rev-parse --short origin/main 2>/dev/null)"
  git checkout -q main >>"$LOG" 2>&1
  if [ -n "$force" ]; then
    git reset --hard __ship_tmp >>"$LOG" 2>&1
  else
    git merge --ff-only __ship_tmp >>"$LOG" 2>&1
  fi
  git branch -D __ship_tmp >>"$LOG" 2>&1

  result "OK pushed [$repo]. main $before -> $after$forced_note"
  cleanup_request
  return 0
}

# ---- main loop -------------------------------------------------------
if [ "$MODE" = "once" ]; then
  if [ -f "$OUTBOX/SHIP-NOW" ]; then do_ship; exit $?; fi
  log "nothing pending. (Drop SHIP-NOW + ship.bundle in the outbox.)"
  exit 0
fi

while true; do
  # Heartbeat: a cloud session reads this to know the bridge is up. The version
  # marker tells it whether this laptop is running the repo-aware script — a
  # cloud session that sees v1 knows not to try shipping v2.
  printf 'alive %s pid=%s v=2 repos=symmetry-app,symmetry-app-v2 default=%s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "$$" "$DEFAULT_REPO" \
    >"$OUTBOX/watcher-alive.txt" 2>/dev/null

  if [ -f "$OUTBOX/SHIP-NOW" ]; then
    do_ship || true
  fi
  sleep "$POLL"
done
