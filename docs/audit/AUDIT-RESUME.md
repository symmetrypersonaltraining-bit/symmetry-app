# START HERE — the app audit, resuming

**This file is the state of the walkthrough. Read it, then continue. Do not ask
Dustin what we are doing or how it works — it is all here.**

Last updated: 4 Sep 2026.

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

## BILLING — the model, in his words (LOCKED 4 Sep)

Recorded here because it was wrong in the code and it is money.

> "technically they pay a month in advance and then their next invoice gets
> adjusted according to what we actually train that cycle."

1. **An invoice is paid UP FRONT and covers the cycle it opens.** A new client's
   first invoice is the FULL amount, not $0. The next invoice is where the cycle
   just finished gets reconciled.
2. **The monthly rate is a CAP, not a floor-and-extras.** His words: *"if their
   rate is 1540 for 5 x a week and 20 sessions but we train 23 sessions that
   month bc of the calendar, we cap it at 1540."* So sessions above plan are
   COUNTED and NOT CHARGED — the existing behaviour is correct and must not be
   "fixed". Cancellations below plan still credit.
3. **Session rate = monthly rate ÷ expected sessions.** Always. Erin: 700 ÷ 8 =
   87.50.
4. **Expected sessions = training frequency × 4.** True of every client on file.
5. **The billing date and cadence live in his Google Calendar** as a repeating
   payment event, and the app is expected to pick the pattern up. Erin's 24
   monthly $700 events on the 8th were synced with `cadence` NULL and no anchor
   day derived — that is a gap in the sync, not something to ask him for.

### Mid-cycle rate change — the piece that does not exist yet

Rare, but real, and Hassan is the live case:

> "he changed rates in the middle of the billing cycle. we need logic to be able
> to pick up on that when it happens occasionally. its rare but it happens."

Hassan, cycle 15 Aug – 15 Sep:
- First two weeks at the OLD 3x/week rate — already paid, $495 on 22 Aug.
- From Mon 31 Aug, 5x/week at the new numbers: $1,540/month, $77/session, 20
  sessions.
- So the 22 Aug invoice should have been *the payment he made PLUS $385* — the 5
  extra Mon/Thu sessions (31 Aug, 3 / 7 / 10 / 14 Sep) at $77.
- **The 22 Sep invoice needs a one-time adjustment**: it reconciles a cycle that
  ran on two different rate structures, so any session he missed comes off at
  the rate in force when it was missed.
- From 22 Oct he is a standard 5x/week client and the normal rule applies.

What the app needs: a rate change with an EFFECTIVE DATE, so a cycle spanning
one can be split and priced in two parts, and so the reconciliation on the
following invoice knows which rate each missed session was under.

## Open questions for Dustin

**ONE PAGE AT A TIME.** 4 Sep, on being offered fixes from screens not yet
walked: *"lets stay on one page at a time"* / *"save it for when we get there one
page at a time until it's fully closed."* Anything below that names a screen is
NOT to be built until that screen is walked. Capture it, do not fix it.

- Fat Mass / Workouts / Streak tiles on **/progress** would not expand.
  **DEFERRED to /progress by him, 4 Sep.** Do not touch before that screen.
- **Coach chat "add a snack" / "swap this meal"** (`/api/nutrition-ai/act`) is
  the one food path still taking macros from the model rather than a
  `food_catalog` row. It is MARKED — every item renders as ESTIMATED — so it is
  not the silent-wrong-number failure the 4 Sep sweep closed.
  **DEFERRED to the Nutrition screen by him, 4 Sep:** *"there are tons of
  screwed up details in the nutrition page we need to deal with."* Do not touch
  before that screen.
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
  **ANSWERED 4 Sep: DELETE** — *"delete if it doesnt affect any clietns or the
  library itself."* One of them, "Day 3", has been scheduled once, so that
  condition has to be checked per day before deleting, not assumed.
- ~~Two days belonging to another client visible to Jenn.~~ **ANSWERED 4 Sep —
  see the library visibility rule below.**

## LIBRARY VISIBILITY — the rule (LOCKED 4 Sep)

> "i want all workouts from my library visible for all clients. for workouts
> created and saved by a client it should only be visible to that client in
> their personal library."

- Every workout in **Dustin's library** is readable by **every client**. No
  exceptions, no per-client gating.
- A workout **a client creates and saves** is readable by **that client only**,
  and it lives in their personal library.
- The 2 days of another client's that Jenn could see were the second rule
  leaking through `client_own_days`. That is the fault to close — not by
  narrowing the first rule.

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

## Also fixed 4 Sep

- **The portion sweep** — every path that turned a food into a number was
  defaulting to 100 g. See the "Interlude — the portion sweep" section of
  `SCREEN-WALKTHROUGH.md` and the 4 Sep entry in `docs/BACKLOG.md`.
- **A hand-set invoice survives the recalc.** `payment_reminders.manual_amount`;
  `recalc_pending_payment_reminders()` skips those rows. Hassan's $385
  back-charge had been silently replaced with $1,155 by the recalc while the
  note still described a back-charge.
- **Hassan** — `expected_sessions_per_cycle` 12 → 20 (1540 ÷ 77), and a
  duplicate 31 Aug appointment removed (same timestamp, both from gcal sync,
  inserted a day apart, no `google_event_id` to dedupe on). Backed up to
  `bak_*_20260904`.

## NOT BUGS — do not re-report

Read alongside the "STOP RE-REPORTING THESE" section of
`claude/STANDING-RULE-INVARIANTS.md`.

- **Sharon Rambo's $0 invoice is CORRECT.** She was out of town for that whole
  cycle and resumes on the Saturday. It is on his calendar, so the app can see
  it. Confirmed by him 4 Sep.
- **Sessions above the monthly plan are not charged.** That is the rule, not a
  missing feature. The monthly rate caps the month.

## Live state, 4 Sep

`origin/main` — everything shipped, `unpushed: 0`. tsc 0 errors in src/,
2,693 unit tests passing, build compiles.

**Dustin is running a PARALLEL session on the workout screen (4 Sep).** Do not
edit workout-screen files from here without checking with him — two sessions in
the same files is how a fix gets lost.
