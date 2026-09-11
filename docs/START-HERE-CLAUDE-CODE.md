# Moving this project to Claude Code

**Read this once, when you switch surfaces. Then never again — after the move,
`docs/SESSION-HANDOFF.md` is the file every session opens with.**

Written **10 Sep 2026, night Central**. (The entries dated "11 Sep" alongside
this one were stamped from UTC by a session working the same evening; they are
the same night's work, not a later day. Central time, never UTC — `CLAUDE.md`
§3.)

---

## 1. What actually changes

Almost nothing about the work. Three things about the plumbing.

| | Cowork cloud session | **Claude Code** |
|---|---|---|
| Shipping | commit → thin bundle → `outbox\` → SHIP-WATCHER on the laptop | **`git push`.** That is the whole procedure. |
| The repo | cloned fresh into a sandbox that is deleted at the end of the session | on disk, persistent, with credentials |
| His laptop's files | `device_bash`, `device_list_dir` | the working directory *is* his laptop |
| Database | Supabase MCP already connected | needs the MCP connected, or `SUPABASE_SERVICE_ROLE_KEY` in the environment |
| These project docs | readable | **not readable — see §3** |

**The ship bridge retires.** `SHIP-WATCHER.bat`, `ship-watcher.sh` and `outbox\`
stay on the laptop because Cowork sessions still exist for database work, but a
Claude Code session must not go near them. Building a bundle in Claude Code is
twenty minutes spent reinventing `git push`.

**The "always run in the cloud" rule is dead.** It existed because local
sessions were invisible on his phone. He runs Claude Code from the Claude mobile
app now, so it is just as visible and it ships without the bridge. This already
retired on 8 Sep; it is repeated here because it is the single most likely thing
for a new session to get wrong.

---

## 2. Setup on the laptop — once

The repo is already cloned and already signed in through Git Credential Manager:

    C:\Users\dusti\Claude\Projects\symmetry-app

That is where a Claude Code session should open. Before any work:

1. `git fetch origin main` — **another session pushes to this repo while you
   work.** It is not a mistake and it is not to be reverted. Your first push may
   be refused as a non-fast-forward: rebase, re-run the gates, resend. Never
   force.
2. `git push --dry-run` — proves auth. A clone proving nothing is a trap that
   already cost two days: the repo is public, so a clone succeeds without any
   credential at all.
3. `npm ci`.
4. Gates, before every push, no exceptions:

       npx tsc --noEmit      # 0 errors in src/
       npm run test:unit     # 0 failed
       npx next build        # "Compiled successfully"

   The `/login` prerender error about Supabase env vars is expected without
   them. Ignore it.

**Database work needs one of two things** and has neither by default: the
Supabase MCP connected to project `mkfiginpiesospsnktea`, or
`SUPABASE_SERVICE_ROLE_KEY` in the environment. If a session has neither, it
says so rather than reasoning about data it cannot read.

**Git Bash, never PowerShell.** PowerShell resolves `git` to a same-named
function before the executable, and binds `-c` / `-B` / `--hard` as its own
parameters.

---

## 3. The docs that do not travel, and what was done about it

The Cowork project carries ~156 knowledge docs under `claude/`. **Claude Code
cannot see any of them.** Most are already history — roughly 60 are the
`*-PASS*` series from a scheduled task that ran six times a day against a brief
that had gone stale, and another 30 source dumps were archived off on 8 Sep.

Three were still load-bearing, and `CLAUDE.md` pointed at two of them by path,
which meant the rules file was pointing at something a Claude Code session could
not open. They now live in the repo:

| now at | was | why it matters |
|---|---|---|
| `docs/STANDING-RULE-INVARIANTS.md` | `claude/STANDING-RULE-INVARIANTS.md` | `CLAUDE.md` §6 requires reading its "STOP RE-REPORTING THESE" section before raising any roster or coverage concern. Four separate rules files reference it. |
| `docs/WORKOUT-ISOLATION.md` | `claude/WORKOUT-ISOLATION-2026-09-01.md` | why the duplicate workouts are the protection and must not be collapsed |
| `docs/DB-READ-GUIDE.md` | `claude/SYMMETRY-DB-READ-GUIDE-JARVIS.md` | the schema as it actually behaves — soft deletes, the tables that lie, the four canonical queries, all verified against the live database |

**Everything else under `claude/` is history.** Do not go looking for it, and do
not write new docs there. The repo is the record.

---

## 4. The reading order for a new Claude Code session

1. `docs/SESSION-HANDOFF.md` — the living state. Undated, never archived, one of
   it. Current state, what just shipped, what is open, the gotchas that have
   already cost time.
2. `CLAUDE.md` — the standing rules.
3. `docs/BACKLOG.md` — the only work queue.
4. `docs/audit/AUDIT-RESUME.md` — **only if the work is the screen-by-screen
   audit.** That thread owns its own state and has its own reading order:
   itself, then `docs/audit/AI-CONTRACT.md`, then `docs/audit/APP-FORMAT.md`.

`docs/HANDOFF-*.md` with dates in the name are history. Do not read them for
current state and do not create another one.

**Every session ends by updating `docs/SESSION-HANDOFF.md`.** The bar Dustin
set: a brand-new session reading only that file, `CLAUDE.md`, `docs/BACKLOG.md`
and `docs/audit/AUDIT-RESUME.md` picks up with nothing lost, and without asking
him a single question he has already answered.

---

## 5. The opening prompt

Paste this into a fresh Claude Code session in
`C:\Users\dusti\Claude\Projects\symmetry-app`:

```
This is the Symmetry trainer/client app. Read docs/SESSION-HANDOFF.md first —
it is the living state and tells you what else to read and in what order. Then
CLAUDE.md and docs/BACKLOG.md.

You are in Claude Code, so you ship with git push. There is no ship bridge here
and no bundle to build. Run git fetch origin main before you start: another
session of mine pushes to this repo while you work.

Gates before every push: npx tsc --noEmit, npm run test:unit, npx next build.
A confirmed fix gets pushed AND merged in the same breath — not left on a
branch.

Don't walk me through the process and don't re-litigate anything already
settled in those files. Tell me what you're picking up, then pick it up.
```

For the audit specifically, swap the last paragraph for:

```
The work is the screen-by-screen audit. docs/audit/AUDIT-RESUME.md owns that
thread's state and tells you what to read. Pick up at the top of its
"Next — in this order" list.
```

---

## 6. What is still only in a sandbox, and is therefore at risk

The **movement-screen research rig** — the Blender/OpenSim validation harness
that produced the forward-lean and knee-cave thresholds — has only ever existed
in Cowork sandboxes and in a Google Drive archive
(`Symmetry Engine Archive` → `modules/`). It is **not in this repo**. The
shipped analyser (`src/lib/movement/*`) is; the rig that validated it is not.

That is a real gap but not an urgent one — the app does not need the rig to run.
It needs it to change a threshold and be able to defend the new number. Getting
the Python core (~small; the 200MB is rendered video and models) into a
`research/` directory is a one-commit job whenever it is wanted.

---

## 7. Before this repo is shown to anyone

⚠️ **This repo is PUBLIC and it names real clients.** 121 tracked files mention
one or more of them by name. It includes at least one client's weight and body
fat percentage in a table, several clients' fee amounts, and two clients'
personal email addresses. None of that was a decision anyone made; it
accumulated because the docs are written the way the work is discussed.

The one-click fix is **Settings → General → Change visibility → Private** on
GitHub. Vercel deploys from private repos without any change, and the only thing
that breaks is that a Cowork sandbox can no longer clone without the PAT — which
it already has. Making it private does not remove the names from history, but it
stops the bleeding immediately and costs nothing.

`docs/SHARING-THE-PROJECT.md` has the full picture and the options for showing
the work to someone outside it.
