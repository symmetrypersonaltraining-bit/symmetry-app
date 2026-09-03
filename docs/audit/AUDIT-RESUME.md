# START HERE — the app audit, resuming

**This file is the state of the walkthrough. Read it, then continue. Do not ask
Dustin what we are doing or how it works — it is all here.**

Last updated: 3 Sep 2026.

---

## What we are doing

Walking every screen in the app with Dustin, one control at a time, and writing
down what each one is FOR and what it should do — in his words, not the code's.
Fixing what is wrong as we find it.

Two outputs, both in this repo:

- `docs/audit/SCREEN-WALKTHROUGH.md` — the record. What each screen is for, every
  control on it, expected vs actual, decisions settled.
- `docs/audit/FEATURE-AUDIT.md` — the feature-level checklist that started it.

The walkthrough doubles as the **client tutorial script**. "What happens when you
tap this" is all a tutorial ever says, so writing it once here means not writing
it again later. The trainer tutorial lives in `src/lib/tutorial/script.ts` and is
covered by a CI gate; see `CLAUDE.md` rule 1.

## How each screen goes

1. **Inventory the controls from the CODE first**, never from memory. Grep the
   page and its components for `onClick`, `href`, `router.push`. Put them in a
   table in SCREEN-WALKTHROUGH.md before asking him anything.
2. **Ask him three things:** what is this screen for, what on it do you never
   look at, what is missing.
3. **Have him tap every control** and say what happened. One batch at a time,
   grouped so he can work through it on a phone.
4. **Record every result**, including the ones that turn out to be correct
   behaviour. "Not a bug, renders conditionally" is a finding worth keeping.
5. **Fix what belongs to that screen** before moving on. Anything whose logic is
   shared with a screen not yet walked gets captured and built when we reach it,
   so both halves change in one commit.
6. **Never edit a screen that has not been walked.**
7. Commit, ship through the bridge, verify `unpushed: 0`, then next screen.

## The rules that govern the work

`CLAUDE.md` at the repo root. Read it. Gates before every push, no `any`, prove
a fix was needed by watching the test fail first, never leave main red, and the
tutorial stays true or CI fails the push.

`claude/STANDING-RULE-INVARIANTS.md` in the project has the list of things that
are NOT bugs and must stop being re-reported.

---

## PROGRESS — 39 screens

### Done

| # | screen | notes |
|---|---|---|
| 1 | **Client home** | ✅ closed. Adherence now counts only days due; This Week moved under the streak; second "This week" card renamed Weekly Focus; Add Workout removed; AI Insights placeholder deleted; header is a banner; payments sit above This Week; milestone Share now carries the message. |
| 2 | **Workout tab** | ◐ partly. Week bar removed. Library search reads descriptions + difficulty and every library workout is now described. Full library access granted to clients. Start/View split NOT built. Move-when-logged NOT built. |

### Next — screen 2 finish, then 3 onward

**Screen 2 has two agreed changes still to build:**

- **Start vs View.** Everywhere a workout can be started, two buttons: **View**
  opens the current overview screen, **Start** goes straight into logging.
  `/workout/[dayId]` renders WorkoutLogger, which opens on an overview and waits
  for a tap (`sessionMode`). Start needs to carry a flag that enters the session
  immediately. Applies on the workout tab, today's sessions higher up that page,
  AND today's sessions on home. **Dustin has approved this.**
- **Moving a logged workout.** Unlogged moves. Logged always leaves the log where
  it happened and copies the workout to the new date, with a line saying so.
  No dialog — you cannot move history, and deleting the log is never right.
  **Agreed 3 Sep.**

### Not yet walked

CLIENT: `workout/[dayId]` (the logger — off limits without per-item permission) ·
nutrition · recipes · progress · schedule · messages · log · log-bodyfat ·
profile · settings · onboarding · welcome · tutorial · assessment · movement

TRAINER: clients · clients/[clientId] · clients/[clientId]/program ·
clients/[clientId]/day/[dayId] · clients/notes · library · library/exercises ·
library/programs · library/videos · library/workouts · payments · schedule ·
schedule/proposals · progress · settings/ai-health · settings/data-health ·
movement/results · movement/testers

PREVIEW: client-preview and its four sub-screens

---

## Carried decisions not yet built

- **Nutrition %** — he is unhappy with how it calculates. Rule to be captured and
  built at the Nutrition tab so both places change together.
- **Group auto-posting** — nothing posts to the group chat automatically. PRs,
  finished workouts and the rest-day slip all become client-initiated. The
  milestone Share button is done; the rest lands at Messages.
- **Client tutorial** — does not exist. The trainer tutorial is 60+ steps; there
  is no client equivalent. The walkthrough rows are written to convert into one.

## Open questions for Dustin

- Fat Mass / Workouts / Streak tiles on **/progress** would not expand. Carried
  to that screen.
- **Library descriptions are DONE.** 676 of 711 library days described, covering
  every distinct workout that has movements in it. Written from the actual
  exercises in each session, with a difficulty (beginner / intermediate /
  advanced) as a first pass expected to be corrected by hand — that is his
  judgement, not the data's. Search reads description + difficulty and splits
  the query into words, so "chest strength balance" and "beginner" both work.

  **The 35 left are all EMPTY — nine labels with sections but no exercises at
  all:** Day 1 (11 copies), Day 2 (11), Day 3 (7), Day 4, Day 5, Back & Biceps
  (Week 1-A), Chest & Triceps (Week 2-A), Legs Anterior (Week 2-B), Legs
  Posterior (Week 1-B). They cannot be described because there is nothing in
  them. They look like programme skeletons that were created and never filled.
  **Decision needed: fill them or delete them.** One of them, "Day 3", has been
  scheduled once.
- Two days belonging to another client are visible to Jenn through the
  pre-existing `client_own_days` policy. Flagged, not changed.

## Also fixed 3 Sep, after the walkthrough started

- **A workout rewritten mid session no longer locks the client out.** Dustin
  replaced Jennifer's day through a Claude project while she was logging it;
  every prescribed exercise was deleted and recreated, and her phone kept
  writing the dead ids. Two faults: the raw Postgres error was shown to her, and
  draft hydration handed the dead ids straight back so reloading did not help.
  Both fixed. It reloads rather than remapping — if the workout was replaced,
  those sets may not belong to what replaced them.
  See `docs/audit/INCIDENT-2026-09-03-LOGGER-FK.md`.
- **Swap versus skip.** Every path that wrote `skipped` was actually a replace,
  so a swap could never be told from a miss. Renamed to `replaced`; a genuine
  skip needs no button, because a past session nobody logged already counts
  against.

## Live state, 3 Sep

`origin/main` — everything shipped, `unpushed: 0`. tsc 0 errors in src/,
2,661 unit + 43 nutrition tests passing, build compiles.
