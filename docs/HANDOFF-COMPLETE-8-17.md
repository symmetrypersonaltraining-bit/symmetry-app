# Symmetry Trainer App — complete session handoff

**Written 17 Aug 2026, ~10:15 CT.** Everything a fresh session needs. Read it
top to bottom once; do not skim to the task list, because Part 2 is the reason
half the tasks exist.

---

# PART 0 — FIRST FIVE MINUTES

1. **Check the ship bridge is alive.** `device_list_dir` on
   `C:\Users\dusti\Claude\Projects\Trainer App\outbox` and look at
   `watcher-alive.txt`'s mtime. Fresh (under ~2 min) means it is running.
   - Alive → say "Ship bridge is up" and carry on.
   - Missing or stale → say: *"Double-click SHIP-WATCHER.bat in the Trainer App
     folder and leave the window open. Tell me when it's running."* Then WAIT.
     Do not investigate auth. Do not improvise another route.
2. **Clone and orient.** `git clone https://github.com/symmetrypersonaltraining-bit/symmetry-app`
   then `npm ci`. Public repo, no auth needed to read.
3. **Read `docs/BACKLOG.md`** in the repo. That is the only work queue. Not
   Notion, not the loose `*-LIST-*.md` files, not chat history.
4. **Do not re-verify anything in Part 3.** It was measured today. Re-running
   the whole audit is how a session burns an hour producing what is already
   written down.

**Current state, measured 10:15 CT 17 Aug:**

| | |
|---|---|
| `origin/main` | `1d98d6e` |
| Tree | clean, nothing unshipped |
| Active clients | 30 |
| Scheduled workouts | 4,780 |
| Database size | **364 MB of a 500 MB hard ceiling** |
| Backups | **none** |
| Push subscriptions | 0 (keys ARE installed; nobody has pressed the button) |
| Live goals | 3 |
| Pending schedule proposals | 55, zero `orphaned` |

---

# PART 1 — EVERYTHING YOU CONNECT TO

## The repo

`symmetrypersonaltraining-bit/symmetry-app`, branch `main`, **PUBLIC**.
Next.js 15 App Router, React 19, TypeScript strict, Supabase, deployed on Vercel.

## Supabase — the LIVE database

- Project ref **`mkfiginpiesospsnktea`**, name `symmetry-training`, us-east-1,
  Postgres 17.6.
- Reached through the **Supabase MCP tools**, already connected. No credentials
  to set up.
- **`execute_sql` is READ-ONLY.** Every DDL or write goes through
  `apply_migration`. This trips up every new session once.
- `query_logs` reads the unified log stream (ClickHouse SQL, `logs` table,
  filter by `source`: `edge_logs`, `postgres_logs`, `postgrest_logs`,
  `auth_logs`). It works when direct SQL is timing out, which made it the only
  usable tool during this morning's outage.
- There is a **dev project `giiovjfpbuzmrvpdglhv`**. NEVER write to live for v2
  work.

## Vercel

- Live app: **https://symmetry-app-omega.vercel.app**
- Project **`symmetry-app`**. There is also **`symmetry-app-v2`** — Dylan's copy.
  Confusing the two has burned Dustin before; the live one serves the omega URL.
- Deploys automatically from `main`. **To force a redeploy, push an empty
  commit** — never use the dashboard's Redeploy button. On 15 Aug "the top
  deployment" was an old build and he promoted the wrong thing.

## The user's computer — the device bridge

`mcp__remote-devices__*`. Available while his Claude desktop app is open.

- Trainer App folder: `C:\Users\dusti\Claude\Projects\Trainer App\`
- His local clone: `C:\Users\dusti\Claude\Projects\symmetry-app` (Git Credential
  Manager already signed in)
- `device_list_dir`, `device_stage_files` (his machine → this container),
  `device_commit_files` (this container → his machine)
- `device_bash` runs on HIS machine and has **no network**. It cannot push.
- **It cannot delete.** `rm` fails. To remove something, `mv` it into a
  `_to_delete/` subfolder and tell him.

## Browser

`mcp__claude-in-chrome__*` when his Chrome is connected. Before ANY browser
action you must ask him which browser via AskUserQuestion — this is enforced.

## The project docs

The `Projects` tool holds ~100 docs. Written today and worth reading:

- `claude/DATABASE-DECISION-8-17.md` — the outage diagnosis and the $30/month
  decision. Read before touching anything infrastructure.
- `claude/CALENDAR-DETECTOR-FIX-8-16.md` — yesterday's calendar work in full.
- `claude/RESUME-HERE-8-17.md` — superseded by this document.

In the repo: `docs/BACKLOG.md`, `docs/PUSH-SETUP-FOR-DUSTIN.md`,
`docs/GROUP-MESSAGE-DRAFT-2026-08-16.md`,
`docs/OUTAGE-2026-08-15-AND-RESILIENCE-PLAN.md`,
`docs/DATABASE-DECISION-8-17.md`.

---

# PART 2 — HOW WORK GETS DONE HERE

**This is not ceremony. Every rule below exists because something broke.**

## Shipping — the bridge

A cloud session **cannot push to GitHub**. Verified repeatedly: the sandbox git
proxy rejects it and `device_bash` has no network. **This is not an expired
token. Do not re-diagnose it. Do not ask Dustin to rotate the PAT.**

His laptop does the push via `SHIP-WATCHER.bat`. The protocol, in order:

1. Commit in the sandbox clone. One logical change per commit.
2. `git fetch origin main && git rebase origin/main` — **do this every time.**
   He pushes from his laptop too (the VAPID redeploy commit), so you diverge
   without noticing. The bridge refuses non-fast-forwards, correctly.
3. `git bundle create <path>/ship.bundle main`
4. `SendUserFile` the bundle and a `SHIP-NOW` file containing the full 40-char SHA.
5. `device_commit_files` the **bundle first**, then **SHIP-NOW last**. Separate
   calls — a single call with both can drop the large file.
   (`SHIP-REPO` containing `symmetry-app` is only needed if it is missing.)
6. Wait ~30s, then **`git fetch origin main` and check the SHA yourself.**
   `SHIP-RESULT.txt` says `OK pushed ...` or `FAIL ...` — but verify against
   GitHub, not against the result file.
7. On FAIL: read the reason. "not a fast-forward" means rebase and resend.

**Never end a session with work only in the sandbox.** The container is deleted
when the session ends.

## Gates — before every ship

```
npx tsc --noEmit        → 0 errors in src/
npm run test:unit       → 0 failed
npx next build          → "Compiled successfully"
```

The `/login` prerender error about Supabase env vars is EXPECTED in the sandbox
(missing env vars, not a code fault). Vercel has them. Ignore it.

## Mutation testing — the part that matters most

**Every guard you write gets mutation-tested.** Break the code on purpose,
confirm the test goes red, restore. A guard that passes on broken code is worse
than no guard: it reads as coverage while providing none.

There are five harnesses in `tests/` — `mutate-detector.sh`, `mutate-move.sh`,
`mutate-push.sh`, `mutate-homework.sh`, `mutate-clientview.sh`,
`mutate-coachself.sh`, `mutate-notifier.sh`. Copy the pattern. They are not run
by `npm run test:unit`; you invoke them by hand.

**This caught real holes repeatedly**, including yesterday and today:
- A test matched `_scd_orphan` as a prefix, so renaming the table to
  `_scd_orphan_unused` passed.
- Four mutations were silent no-ops (they targeted lines with trailing
  comments), so the harness scored a clean pass on mutations that never
  happened. Always assert the file actually changed.
- A stub returned the whole row regardless of the column list, so narrowing a
  `select` still passed.

## Database changes

- Ship as `supabase/migrations/*.sql` files **and** apply via `apply_migration`.
- **A `bak_` table first, always.** Snapshot the function definition with
  `pg_get_functiondef` before replacing it, so rollback is `select def` and run it.
- **Verify the deployed body matches the file** — MD5 of the `$function$` body
  with comments stripped and whitespace collapsed, both sides. Catches
  transcription errors.
- **Never put a statement after a `$function$` body in one migration.** It is
  silently dropped. This happened yesterday: `apply_migration` returned success,
  the function was replaced, and the trailing `update` never ran.
- Supersede, never delete. Status changes, rows stay.

## The recurring bug shape — read this twice

**PostgREST returns its error; it does not throw.** So `try { await
supabase.from(...)... } catch {}` can NEVER fire. Dozens of "best-effort, just
log it" lines in this app had never once executed.

Always destructure: `const { error } = await ...` and branch on it. The sweeps
`/tmp/sweep.py` (unchecked writes) and `/tmp/catchsweep2.py` (dead catches) are
gone with the container — rewrite them if you want the counts; they were at
60 and 21.

**Verify against the database, not against a success response.** A route
returned `200` with correct-looking numbers over a completely broken library.
An `update` matching zero rows is not an error.

## Writing

- Commit messages explain **what was measured, what was wrong, and why the fix
  is shaped that way**. Look at any commit from today.
- Code comments name the person and the date when a decision came from them.
- Say what you did NOT do and why, in the commit, not just in chat.

## Talking to Dustin

- He is a personal trainer, not an engineer. Plain English. He will ask you to
  re-explain in plain English if you slip, and he is right to.
- Work autonomously. Batch questions rather than stopping for each one.
- **Set up the permanent, lowest-friction path FIRST.** Never iterate on a
  fragile route — he has said this more times than anyone should have to.
- Claude cannot sign in to anything. Never design a plan whose last step is you
  authenticating; put his interactive step first.
- When you are wrong, say so plainly and correct the record. Today: I diagnosed
  the outage as CPU exhaustion from the 15 Aug pattern; his screenshot showed
  CPU at 10% and the real cause was disk. Retract clearly.

## Scripting on his machine

- **Git Bash, never PowerShell.** PowerShell resolves `git` to a same-named
  function before the executable and binds `-c`/`-B`/`--hard` as its own params.
- He did not know what Git Bash was. Start menu → type "git bash" → Enter.
- Give ABSOLUTE paths and say exactly what a file should contain when he is done.
- No screenshots unless every relevant app is allowlisted — the tool hides
  non-allowlisted windows and once minimised his browser mid-meeting.

## Hard rules — do not break these

- **NEVER message a client.** The group message stays drafted until he okays
  the final text.
- **OFF LIMITS without per-item permission:** `WorkoutLogger.tsx`,
  `NutritionV3Client.tsx`, `MealPlanClient.tsx`.
- Reps come from the programmed target, weights from history. Do not "fix" reps
  to autoload from history.
- Do not delete any programme without asking.
- Central time, never UTC, in anything user-facing.
- Capacitor deps stay OUT of `package.json`.
- `package.json` changes ship with a synced lockfile — CI runs `npm ci`.
- Do not resolve the 30-vs-60 second video ceiling without him.

---

# PART 3 — WHAT IS ALREADY DONE

Do not redo these. 16 commits over 16 and 17 Aug, all on `main`.

**Calendar detector (yesterday).** It was flagging normal programming as
broken — `reason='orphaned'` for any supervised session without a Google
appointment. 10 pending, 8 of them Todd Prine's, all false. Removed. Also found
and fixed: approving a move could never apply (the occupancy guard counted a
client's own unsupervised homework as "date occupied" — supervised rows on the
target date were 0 for all six pending moves), and a move matched by date so it
would have dragged 2–3 unrelated sessions with it. Verified overnight: first
unattended run produced zero false flags.

**Move provenance.** Three of seven app paths that move a workout never set
`moved_from_date`, so pg_cron job 18's "never override a manual move" guard was
unarmed for the schedule board. Fixed with a sweep test that fails if a fourth
unarmed path appears.

**Homework never blocks a move** (his instruction). 413 of 562 occupied dates in
the next 28 days held no supervised session — the guard was refusing 73% of the
calendar. Also fixed the job blocking *itself*: it stamped `moved_from_date` on
its own moves and then skipped them forever, so it could move each session once.
Added `scheduled_workouts.moved_by`; NULL means human, and human moves are left
alone — **this implements his answer that his drag sticks.**

**Push honesty.** A refused read of `push_subscriptions` was reported as
"nobody subscribed"; a refused mark-dead was ignored; `/api/push-test` said
`pruned: true` for tokens still in the table.

**Goals.** Restored to Client View (it was on the real client screen all along —
`/client-preview/progress` never mounted it, and that is the screen he looks
at). "Set a goal" only appeared when you had zero goals, so a second goal was
impossible; body-fat and lean-mass buttons now appear. Progress percent is
signed toward the target — his card said "21% of the way there" while he was
further from the goal than the day it began. "Below maintenance" is now
above/below by direction. Adjusting a goal re-baselines to today. New
`overshooting` status.

**Two "you are someone else" bugs.** The message banner said "Dustin messaged
you — Claudine Ocon" for a message Claudine sent HIM. The AI coach told him to
"Shoot Dustin a message". Both were copy written for a client, shown to the
trainer.

**Swap-the-same-workout-twice.** `fork_day_for_client` cloned unconditionally,
so the second swap to any workout hit `uq_days_no_identical_twin` and showed raw
Postgres text. It now reuses the existing fork.

**Push notifications are configured.** `/api/push/subscribe` returns
`configured:true`. Keys are in Vercel. Nobody has subscribed yet, which is
expected — each person must press the button on their own device.

---

# PART 4 — THE TASK LIST

Ordered. Each says what it is, why, and what "done" looks like.

## 1. 🔴 BACK UP THE DATABASE — today, before any code

**Why:** `LAST BACKUP: No backups`. 364 MB of a **500 MB hard ceiling** — at 500
MB Supabase forces the database read-only and the app stops accepting weigh-ins.
30 clients' training history, nutrition logs, metrics and messages, with no
restore path. This is the single largest risk in the project and it outranks
every feature below.

**Do:** walk Dustin through the three `supabase db dump` commands in
`claude/DATABASE-DECISION-8-17.md` (Git Bash, session pooler port **5432**, not
6543). Files to Google Drive under `symmetrypersonaltraining@gmail.com`.

**Then:** the nightly GitHub Action — **in a NEW PRIVATE repo.** `symmetry-app`
is public and committing `data.sql` there would publish clients'
body-composition data to the internet.

**Done when:** three dump files exist off his machine and he has confirmed it.

## 2. 🔴 The database decision — $30/month

**Why:** this morning's outage was **disk I/O starvation on NANO**, not CPU. His
logs show 96 buffers (~768 KB) taking 10 seconds — about 0.08 MB/s, ~60× slower
than NANO's own throttled floor. CPU read 10% *because* everything was blocked
waiting on disk. Same disease as 15 Aug, different symptom: the instance has no
guaranteed floor. It will happen a third time.

**Recommendation:** Pro + Small, $30/month net. 4× RAM, 4× disk floor, managed
daily backups, 500 MB → 8 GB ceiling. Full reasoning and the comparison table
are in `claude/DATABASE-DECISION-8-17.md`. **His decision, not yours.**

**Free and worth doing regardless:** point Vercel at the **transaction pooler,
port 6543** (prepared statements off). That targets the exact reconnect storm
that triggered today.

## 3. 🟠 The swap does not remove the workout it replaces — DIAGNOSED, NOT FIXED

**What he said:** *"if I replace the workout it should change the entire workout
including the name... swap the workout should literally swap the entire
workout."*

**What his data shows for today, 17 Aug:**

| day | status | source |
|---|---|---|
| Deload — Upper Push + Corrective | scheduled | claude |
| **Deload — Cardio (20 min Walk)** | **still scheduled** | claude |
| **Fat Loss Cardio Phase 3: Stair Master** | scheduled, 14:10 UTC | client_self_assign |

The swap **worked** — the stair master went in as a whole workout with its own
name. The walk was never marked skipped, so he has both. From the app that looks
like nothing was replaced.

**Where to look:** `doSwap` in `src/components/OffPlanBanner.tsx`. After the
insert it runs an update scoped to `.eq("day_id", dayId)` and
`.eq("status","scheduled")`. An update matching zero rows is not an error, so it
fails silently and reports success — the same shape as every other bug this
week.

**Two open questions Dustin has NOT answered yet — ask before fixing:**
1. Which button did he mean by "the replace function" — **"Replace today's
   workout"** (AI, type what you want) or **"Swap for one I pick"** (library
   list)? They are different code paths and the data only shows the swap.
2. May you clear today's walk off his schedule so his day looks right? It is one
   row on his own client record. **Do not do it without him saying yes.**

**Done when:** swapping replaces the whole session — old one skipped, new one
scheduled — with a guard that fails if the skip silently matches nothing.

## 4. 🟠 FEATURE — search the library when picking a swap

**What he said:** *"I should be able to search library to pick what I switch it
with."*

Today `openSwap` loads every `days` row where `swappable = true` and
`client_owner_id is null`, ordered by label, and renders a flat list. No search,
no filter. Fine at ten workouts; not at a real library.

**Where:** `openSwap` and the `mode === "swap"` block in `OffPlanBanner.tsx`.
Not on the off-limits list.

**Done when:** he can type to filter the swap list and pick anything in the
library, not just what fits on screen.

## 5. 🟠 FEATURE — add a food by unit, not just grams

**What he said:** *"when I try to add a food from library I need to be able to
adjust it by unit of measurements. for exp 1 egg, 2 eggs etc."*

His screenshot: "HARD BOILED EGGS · base: 100 g", quantity 100, unit dropdown
showing `g`. He wants "1 egg", "2 eggs".

**Unverified and the first thing to check:** whether the food rows carry
serving-size data at all (something like `serving_name` + `serving_grams`). If
they do not, this needs either a data addition or a per-food serving the user
defines once. **Establish that before designing anything** — the answer changes
the whole shape of the work.

**Where:** the food-database sheet reached from the nutrition screen. Careful:
`NutritionV3Client.tsx` is OFF LIMITS without per-item permission — check
whether the sheet lives inside it before editing, and ask if so.

## 6. 🟡 The group message to clients

Two versions in `docs/GROUP-MESSAGE-DRAFT-2026-08-16.md`. **Version A** includes
the notification ask and is now valid because push is configured. **Version B**
omits it.

**NEVER SEND WITHOUT HIS EXPLICIT OKAY ON THE FINAL TEXT.** He has approved
sending in principle; he has not approved the words.

Worth telling him: nothing reaches anyone until each person presses the button
on their own device, and it is per device. iPhone users must add the app to the
home screen first.

## 7. 🟡 `generate_scheduled_workouts` — the third copy of the occupancy bug

Same unfiltered "is this date occupied?" test that was fixed in two other
functions. It blocks a supervised session from being generated onto a date that
holds only the client's own homework.

**Measured over the next 5 weeks:** 51 supervised pattern-days skipped, but 48
are correctly blocked by a real supervised session. **Only 3 are blocked purely
by homework** — Sharon Rambo Sat 22 Aug (Ankle & Posterior Chain P1 Day 2), Greg
Lennon 7 and 14 Sep.

Generation is not moving, so it was deliberately left alone. **His call.** It is
run by hand, not on cron.

## 8. 🟡 Does the AI coach pick up a goal change?

He said *"ai needs to pick up on calorie goal change"*, but his screenshots were
at 8:12 and the database shows he changed the goal at 8:15 — so that card was
correct when it rendered. **Unconfirmed either way.**

Ask him to open the coach card now. If it still quotes the old goal (185 lb by
30 Sep) rather than the current one (235 lb by 29 Nov), it is a real staleness
bug. `goalContextBlock` reads live, so start by checking for caching between the
context and the rendered card.

## 9. 🟢 The overshoot threshold — offer, do not assume

`overshooting` trips when the projection lands more than **a quarter of the
journey** past the target, floored at one unit. At 10% a real lean-mass fixture
(140 → 155, projecting 156.6) tripped by 0.1 lb, and a status that cries wolf
gets ignored. His case was 60% past.

It is a judgement call that was flagged to him. If he wants it tighter it is one
constant in `src/lib/goals.ts`.

## 10. 🟢 An active goal with no readings renders nothing

`GoalCard` returns `null` when the metric has no readings — no card, no
explanation, no hint the goal exists. Nobody is in that state today, which is
why it is a note rather than a fix. It becomes real the moment someone sets a
lean-mass goal before their first InBody.

---

# PART 5 — THINGS THAT WILL WASTE YOUR TIME IF NOBODY TELLS YOU

- **`WebFetch` caches per URL for 15 minutes.** Always add a unique cache-bust
  param. It once served a 21-hour-old `/api/health` body that read exactly like
  a dead deployment.
- **Supabase reports `ACTIVE_HEALTHY` during an outage.** That check asks whether
  the instance exists, not whether queries return. Trust the dashboard's own
  status and your 503s.
- **A restart can take 20 minutes**, not the usual 1–3, when the disk is
  saturated — because recovery reads and writes on the same throttled volume.
- **Cloudflare 502s from the Supabase MCP** happen. Back off ~60s and retry.
- **`exercises` has no `updated_at`.** `exercise_video_candidates` has
  `reviewed_at` and `applied_at`, not `decided_at`.
- **793 exercises have a video, not 792.** The extra is "Flexbar Reverse Tyler
  Twist", created by Dustin at 11:12 CT 16 Aug already carrying a `video_url`.
  The candidates table has been untouched since 05:10 UTC and the auto-publisher
  is still stopped. **Do not report this as a regression** — a previous session
  nearly did.
- **Measure before reporting a regression.** Twice this week a number looked
  alarming and the timestamps showed it was fine.
- Bash heredocs mangle backticks and `$` — use `git commit -F /tmp/msg.txt`, and
  in mutation scripts prefer single-quoted bash args with double-quoted Python
  strings.

---

*Dustin Gautreaux · Symmetry Personal Training · handoff written 17 Aug 2026*
