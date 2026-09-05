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

0. **WALK EVERY AI COMPONENT ON THE SCREEN — AGAINST docs/audit/AI-CONTRACT.md.**
   That file is the ten rules every AI surface in the app has to meet, set by
   Dustin on 5 Sep ("I want all ai functions in the entire app to be extremely
   accurate and advanced... I want it to feel like they're talking to me w my
   knowledge"). Each screen's pass records which rules its AI fails. Added 4 Sep, at Dustin's
   instruction: "we need to go through the logic and thinking for each ai
   component on every screen... i want to make sure each ai function is doing
   exactly what i want it to do." So for each screen, before anything else:
   list every AI-driven element on it, and for each one write down what it
   reads, what it decides, what it writes, when it runs, and what Dustin wants
   it to do — then reconcile the two. An AI component that is merely working is
   not the bar; it has to be doing the thing he actually wants.
   **HOME IS OUTSTANDING.** Screen 1 was closed before this rule existed, so its
   AI components have not been through it. Home is re-opened for an AI pass
   before the Workout audit continues.
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
| 1 | **Client home** | ✅ closed, ◐ AI pass 5 Sep: both AI elements rebuilt (Coach's tool model, weekly writer). Two small items remain — the View button and the assistant framing. Original close: Adherence now counts only days due; This Week moved under the streak; second "This week" card renamed Weekly Focus; Add Workout removed; AI Insights placeholder deleted; header is a banner; payments sit above This Week; milestone Share now carries the message. |
| 2 | **Workout tab** | ◐ REBUILT 4 Sep, not yet walked. New tile format, Start/View split, move-a-logged-workout copies forward, Add workout on the title row. Everything on it now needs testing button by button — including the AI components, which have never been reviewed. |

### Next — in this order

1. **Give the client AI the assessment.** THE BIGGEST OPEN GAP IN THE APP.
   Dustin ruled on 5 Sep that when a client says a movement hurts, the AI does
   **full corrective reasoning** — his method, from that client's own
   assessment. It cannot: `assessments` is invisible to every client-facing AI
   surface. Everything else on this list is smaller than this.
2. **Home, AI pass.** Elements 1 and 2 are DONE and shipped (see
   docs/audit/AI-COMPONENTS.md). What remains on home:
   - today's workout tile needs the **View** button, to match the Workout tab's
     Start / View split. Dustin, 4 Sep. Last place a workout opens only one way.
   - the "Dustin's assistant" framing on the coach entry points (his 5 Sep
     disclosure ruling) — copy only, not built.
3. **Workout, full walk.** The screen was rebuilt on 4 Sep and NOTHING on it has
   been tapped since. Every button, every path: add, edit, move, replace,
   remove, start, view, drag, past strip — manually and through Claude. Plus its
   AI components against docs/audit/AI-CONTRACT.md.
4. Screen 3 onward.

### The AI programme — from docs/audit/AI-CONTRACT.md

Ten rules, four rulings, set 5 Sep. Built so far: the tools model, the weekly
writer's context and thinking order, the schedule guard, the food stance, the
general tips, the coach's read on screen, and sessions-with-him protected.

**Not built, in the order they are worth doing:**

| | what | why it matters |
|---|---|---|
| A | **Assessment access for the client AI** | Ruling 1. Without it "full corrective reasoning" is impossible and the moat does not exist. |
| B | **A corrections table + the self-correction sweep** | Rule 4. Detect the app's own errors against the database before the client does; when they correct it, MUTATE THE RECORD, not just the reply. Self-correction is worth ~0.6 SD of trust versus being caught. |
| C | **Clarify-gate on pain / substitution / load** | Rule 5. Missing history-taking is the top documented LLM health failure and the thing a 21-year CES does that a chatbot does not. Two questions max. |
| D | **Red-flag referral list as a TABLE** | Rule 6. NASM's refer-out list, matched deterministically, short-circuiting the model, offering to route to him. |
| E | **Movement library access for the client coach** | So "why does my knee hurt on lunges" reaches a movement, not a nutrition coach. |
| F | **Length cap + ban-the-obvious enforcement** | Rule 7. The modal complaint about AI coaching everywhere is walls of obvious text. |
| G | **Bounded client adjustment on AI proposals** | Rule 8. Best-evidenced adoption lever there is, and cheap. |
| H | **"Dustin's assistant" framing** | Ruling 4. Copy across the coach entry points. |

### Still unanswered by Dustin

- **Can a client swap the CONTENT of a session he is supervising?** He ruled on
  moving those (his). Swapping what they do in a session he is personally
  running is the same class of question and was not asked. Deliberately not
  guessed.
- **What must the AI never do**, beyond peptides, schedules-with-him and the
  standing guardrails.
- **`clients.ai_focus` is now shown** — but the fourth thing the weekly model
  writes is still worth reviewing once he has read a few live ones.

**Both 3-Sep changes are now built and shipped:**

- **Start vs View** — `?start=1` enters `sessionMode` on mount, after draft
  hydration and after the completion flag has actually been seeded. Reading the
  flag at mount would have been a check that could never fail.
- **Moving a logged workout** — a trained session stays where it was, with its
  log, and a copy lands on the target date carrying `moved_from_date`.
  `workout_log_id`, `supervised` and `appointment_id` are deliberately not
  copied, so `sync_supervised_workouts_to_appointments()` cannot drag the copy
  back.

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

## The app's container shape — settled 4 Sep

Every screen is moving to one object, taken from the **Weekly Focus card on the
client home screen**. Full spec in `SCREEN-WALKTHROUGH.md` under screen 2. It is
scoped to a `.sym-page` wrapper so a screen opts in only when it is walked —
rule 6 still holds. Each screen gets a mockup Dustin approves before it changes.

**No "programme" language anywhere client-facing.** Most clients are not on a
programme; each is programmed personally, day by day, in 6-week blocks, from the
library. This applies to every screen and most of them have not been walked yet.

## Waiting for the Nutrition screen

- **The numbers are wrong.** Dustin, 4 Sep, from the Coach sheet on the
  Nutrition page: "numbers are way off." The screenshot has Coach saying M6 as
  written is 766 kcal (44P/61C/39F) and that the day lands at **4,573 kcal**
  against a **4,462** target. Both the day total and the target need checking
  against the meal plan and the logged rows before anything else on that screen
  is touched — a coaching line built on a wrong total is worse than no line.
  This is BOTH a Nutrition-screen item and an AI-component item, so it belongs
  in step 0 of that screen's walk as well.
- **Nutrition %** — he is unhappy with how it calculates. Rule to be captured at
  that screen so both places change together.

## Carried decisions not yet built

- **A light/dark toggle per colour scheme.** Requested 4 Sep. Today `AutoDark`
  measures `--brand-bg` luminance and darkens genuinely light themes only, with
  no way for a person to choose. Wants to be a setting: Auto / Light / Dark,
  persisted the same way the theme is. Its own commit.
- **The "modified from original" marker** on the workout/schedule screen. The
  link field exists but only 6 of 73 forks carry it — the fork routes do not set
  it.

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

## WORKOUT NAMING & MODIFICATION — the rules, and what enforces them (4 Sep)

His words, now also in the programming project's own instructions:

> "public workouts should never get named by client names or initials"
> "when i modify current workouts in the library, that's a 1 time thing, i do
> not want those saved as near duplicates to the library ... just mark them in
> calendar as modified from original"

**RENAMED.** 160 day labels and 6 programme names carried a person: 28
client-code prefixes (GG2, SG2, HK5/6, JD6, KR2, LK6, LS6, LSP6, MC6, MM2, RB6,
RM6, SD6, SP/SP6, SR6, SW6, TS6, TY6, CH2, CL/CL2, CO2, GL2, GW2, AF) and four
programmes ending "— Sara", "— Jennifer", "— Claudine", "— Tyler". Worse than
the initials were the parentheses, which carried the REASON — "(back is talking
today)", "(left leg or foot bothering him)", "(Dizzy Day (lightheaded,
everything seated))". Conditions were kept, impersonally; the person was
removed. Backed up to `bak_day_labels_initials_20260904` and
`bak_program_names_20260904`.

**ENFORCED.** Two triggers on `days`, both replayed against live data before
being turned on:

- `trg_library_name_is_not_a_person` — refuses a LIBRARY workout whose name
  carries a client code (`^[A-Z]{2,4}[0-9] `, digit required so BW/DB/KB/SL/GHD
  cannot trip it) or a client's first name (4+ letters, only after a dash, after
  a paren, or possessive — the floor and the position are what stop "Day", as in
  Jennifer Day, flagging the whole library). Client-owned workouts are not
  policed. The error says what to do instead.
- `trg_a_one_off_edit_stays_a_one_off` — refuses clearing `client_owner_id` on a
  day stamped `library_fork`, `forked_for_swap`, `ai_adjust` or `ai_replace`. A
  mid-block edit cannot become a library entry by any route.

**STILL TO BUILD, at the workout/schedule screen** (deferred, one page at a
time, and he had a parallel session in those files on 4 Sep):

- The **"modified from original"** marker on the calendar. `days.swapped_from_day_id`
  is the link and it exists, but only 6 of 63 fork rows carry it — the routes
  that create a fork do not set it consistently. Fix the write, then surface it.

## THE LIBRARY, AFTER 4 SEP — closed

He said: *"go ahead and take care of it here. i do not want any of the modified
librrary workouts to be saved in library, if they are, get rid of them leave the
originals."* Then, immediately: *"leave them in scheduled sessoins for
clients!!!"* Both halves were honoured — a modified copy comes out of the
LIBRARY, never out of a calendar.

**Published: 414 of 419.** Everything he built that was stuck as private is now
library content. `client_owner_id` had come to mean "a client-owned COPY", set
by four different routes, rather than "a client made this".

**Five refused, and every refusal was a guard working:**

- Four hit `uq_days_no_identical_twin`. After the rename stripped "GG2 " and
  "SG2 ", Gerard's and Sharon's backup days became identical twins and the
  library already held one of each. Left client-owned; none is scheduled.
- One hit the naming guard — "Cardio — 20 Min Walk (Todd)", a name in
  parentheses the prefix rename did not reach. Renamed, then published.

**Eleven modified copies were already in the library** — all his own, forked or
AI-replaced from his client account, swept in by 20260904d's owner rule. That
rule is now corrected: the exemption is the ORIGIN, not the person. A fork is a
fork whoever made it. Nine of the eleven were on his calendar and were re-owned
to the client who has them scheduled (out of the library, session and history
intact); two were never scheduled and never logged and were deleted. Zero
orphaned sessions, zero orphaned logs — checked.

**Where it landed: 1,096 workouts in the library, 99 client-owned** — 73
modified copies, 22 genuinely client-made, 4 duplicate twins.

## The coach's read goes stale — fixed 5 Sep

Dustin, looking at his own home screen: *"its reading weight from the wrong
place. im at 205."*

It was not. `clients.current_weight` said 205 and his latest weigh-in said 205 —
both right. The paragraph said 207 because it had been **written on 29 August**,
when 207.2 (17 Aug) was the most recent weigh-in that existed. Seven days later
it was still on screen beside live tiles it now contradicted:

| paragraph (29 Aug) | tile (live) |
|---|---|
| "5 of 8 done" | 4/8 |
| "consistency jumped to 100%" | 61% |
| "flat at 207 lb" | 205 |

Every figure was true for the week it was written in and wrong for the week it
was being read in. `currentWeekRead` deliberately admits a read written on the
eve of the week, because that is when the Saturday sweep writes it — so a read
is a week old by design and only stays true if something keeps it true.

**Four options were put to him; he chose "rewrite on a new weigh-in."**

`/api/cron/weekly-ai?mode=refresh`, daily at 12:00 UTC. It rewrites the READ and
only the read, for the clients whose last weigh-in is later than their
`ai_focus_date`. Five clients qualified the day it was built (him, Hassan,
Jennifer, Robby, Tyler).

Deliberately NOT touched by a refresh: `weekly_focus`, `ai_food_focus` and the
fortnightly programming question. Those are the week's copy, chosen once —
rewriting them because someone stepped on a scale would move the target a client
is working towards, three days in. A refresh also uses the `"now"` windows and
`weekStartOf(today)`, not the Saturday `"nextWeek"` shift, so it describes the
week it is written in.

**Then he took the fourth option too** — *"reframe it last week as well since
thats what it's reading"* — and it is the other half of the same bug. The read
reviews the week that FINISHED; it sat under the CURRENT week's date range with
current-week tiles above it, so it read as a comment on this week and lost every
argument with the tiles.

Two halves shipped together:

- The block on the home card now carries **"LAST WEEK · <range>"**, from
  `s.lastWkStart`/`s.lastWkEnd`. Deliberately on the read only, not the whole
  panel — the focus line above it IS about the week ahead, and labelling that
  "last week" would mislabel the one instruction the client acts on.
- The writer may no longer narrate the week in progress at all. The prompt says
  so, and `CLAIMS_THIS_WEEK` — which has guarded the programming question since
  1 Sep for this exact reason and was never applied to the read — now runs on
  the read. It returns null from `validateWeekly` rather than editing the
  sentence, so the model gets `callClaudeJson`'s retry; if it fails twice
  nothing is written and the previous read stands.

Body weight is the deliberate exception and stays present tense — it is the
number as it stands now, which is the whole point of refreshing on a weigh-in.

The one option not taken, if this still proves not enough: rewrite daily (~7x
the calls).

## Also fixed 4 Sep

- **The portion sweep** — every path that turned a food into a number was
  defaulting to 100 g. See the "Interlude — the portion sweep" section of
  `SCREEN-WALKTHROUGH.md` and the 4 Sep entry in `docs/BACKLOG.md`.
- **A hand-set invoice survives the recalc.** `payment_reminders.manual_amount`;
  `recalc_pending_payment_reminders()` skips those rows. Hassan's $385
  back-charge had been silently replaced with $1,155 by the recalc while the
  note still described a back-charge.
- **Erin Arit set up for billing.** She had no `billing_type` at all, which is
  why her invoice read $0 — the DB held $700 and the screen recomputed it as
  0 sessions x no rate. Now monthly, 2x/week, $700, $87.50/session (700 ÷ 8), 8
  sessions, anchor day 8. Her due date was on the 2nd; her calendar holds 24
  monthly $700 events on the **8th** and nothing on the 2nd, so it was moved to
  match. `calendar_payments.cadence` was NULL for all 24 — **the sync does not
  derive cadence or anchor day from a repeating payment series, and it should**.
- **33 empty skeleton days deleted** (backed up). Not 35: a "Day 3" and a
  "Day 4" in Female Aesthetics had each been scheduled once and were kept, per
  his condition. The wider "empty day" list was left alone — pickleball, hot
  yoga, Daily Reset Walk (scheduled 162 times) and the rest are off-plan
  activity logs with no exercises BY DESIGN.
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
