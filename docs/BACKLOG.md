# Backlog — the single work queue

**This file is the only work queue.** Not Notion, not the loose `*-LIST-*.md`
files in the Trainer App folder, not a chat scrollback. If it is not here, it is
not tracked. Last consolidated 2026-08-07.

Sources folded in: `app_feedback` (open rows), `FEEDBACK-LIST-8-6.md`,
`docs/MULTI-TRAINER-BACKLOG.md`, the Notion Master Build Tracker, and everything
parked in the previous version of this file.

**Re-verified 2026-08-07 evening:** `app_feedback` has exactly 4 rows with
status `new` (`73fcd284`, `8aa820a9`, `2c2df05f`, `95f11695`). All four are
already tracked below as items 1, 3, 4 and 5. Nothing new.

---

## How code ships from a cloud session

A Cowork **cloud** session cannot push to GitHub. Verified 2026-08-07 across
three routes — sandbox `git push`, the sandbox GitHub REST API, and
`device_bash` on the laptop — all refused by the proxy with 403. **This is not
a token problem;** the PAT authenticates fine and the proxy discards it before
GitHub ever sees the request. Do not rotate the token in response to a 403.

The cloud does all the work and all the gates; the laptop performs the push via
the **ship bridge**: Dustin runs `SHIP-WATCHER.bat` from the Trainer App folder,
the session drops a git bundle plus a `SHIP-NOW` trigger in `outbox\`, and the
watcher fast-forwards `origin/main`. It refuses any non-fast-forward, so it
cannot clobber `main`. Full detail in `START-HERE-SESSION-SETUP.md`.

---

## Shipped 2026-08-07 — do not redo

Five commits that had been stuck at the push for two days, plus two new ones.

| SHA | What |
|---|---|
| `74154f1` | Assisted-lift PRs read the right direction (`src/lib/loadDirection.ts`) |
| `010f92b` | Meal plan visible 8 weeks ahead instead of flipped live each morning |
| `2b12aba` | This backlog doc |
| `74a6154` | Logger records against the day you are logging, not the clock |
| `57b5b12` | Logger verifies a resumed workout-log id (the FK crash of 6 Aug) |
| `daeed4a` | Challenge: `leave` action added to `/api/challenge` |
| `9744220` | Challenge: persistent Join/Leave control, coach included |

Also done directly in the database:

- `exercises.load_is_assistance` added + backfilled (Assisted Dip, Machine Assisted Pull Up)
- Madeleine's 6 Aug cardio log moved to 5 Aug; 5 Aug completed, 6 Aug reopened
- Lauren Standefer's 154 lb weigh-in (5 Aug) deleted
- Birthday bot live (`app_flags.birthday_bot_live`), daily 13:00 UTC
- **Dustin's 4 Aug duplicate Arms A resolved.** There were THREE logs, not two.
  Kept the 12:34pm CT session; the 12:11 and 12:16 duplicates are deleted and
  backed up in `bak_dupe_armsA_workout_logs_20260807`,
  `bak_dupe_armsA_set_logs_20260807`, `bak_dupe_armsA_sched_20260807`.
  Their two `scheduled_workouts` rows are soft-deleted (`deleted_at` set,
  status `skipped`).

---

## AI build — night of 2026-08-12/13

Dustin: "i want the ai functions in this app to feel so accurate and personal
that it blows plps minds." What landed, and what is deliberately still open.

### Landed

| SHA | What |
|---|---|
| `7948046`–`f271fa9` | The nine from earlier that night: usage failures logged, one feature name per route (23, was 5), the $95 cap applied to six routes that ignored it, the weekly focus can reach a client, the Monday nudge sweep can actually run, movement screens are kept, the trainer agent stops forgetting, `${COACH_FIRST_NAME}` in two quoted strings |
| `49997f0` | Twenty faces + the mood registry (`src/lib/ai/faces.ts`) |
| `f19a7c2` | **The tap ripple was throwing every floating button off-screen mid-press** — see below |
| `efca005` | Faces re-cut on the grid so nothing is clipped; `CoachFab` |
| `45ea82d` | `GlobalCoach` — one ✦ on every client screen |
| `0a7f138` | Workout edits are undoable; `applyProposal` de-duplicated (it existed twice) |
| `5962d33` | The celebration's AI line wears the matching face |
| `778c98c` | Coaching-voice routes moved to Sonnet, extraction stays on Haiku |
| `3c1f1eb` | `/settings/ai-health` — every surface, what has never run, what is failing, spend vs the cap |

### The ripple bug, because it will be tempting to "simplify" it back

`InteractionFX` added one class, `.cw-ripple-host`, which set BOTH
`overflow: hidden` and `position: relative`. On a `position: fixed` button the
second half drops it into normal document flow the instant a finger lands on
it: the button teleports, pointerup lands elsewhere, the browser fires `click`
on the common ancestor, and the handler never runs. The class is never removed,
so it stays broken. Sixteen positioned buttons were affected including "Start
session and log". Clipping and positioning are now separate classes and the
positioning one is only applied to elements that are already `static`.
`tests/unit/ripplePositioning.test.ts` fails if they are merged again.

### Open — spec'd, not built

1. **Lapse takeover.** "If somebody does not log for three days or more."
   The RULE is built and tested (`lapseMood` in `src/lib/ai/faces.ts`): the
   ladder is relative to each client's own normal, so a client who never logged
   is never nudged, a twice-a-week logger is not treated like a daily one, and
   there are exactly two rungs — concerned, then stern. The loudest face
   (`callout`) is deliberately unreachable from missed logging. What does NOT
   exist is the takeover itself; `ClientTakeovers` has five (birthday,
   challenge, winner, announcement, birthday-ask) and no lapse one. A
   full-screen interruption that fires wrongly hits every client at once, so
   this wants Dustin's eyes on the copy before it ships.
2. **Ten more celebration variants.** The existing ones stay; the AI line and
   its face are already wired, so new variants are copy plus layout.
3. **The Outbox + memory layer.** The coach escalating a question to Dustin's
   inbox with a link back to the conversation. Agreed as one build.
4. **The logger ✦.** Its own commit, hidden when the keyboard is up.
   `GlobalCoach` deliberately excludes `/workout/<id>` today.
5. **Legacy food-photo path.** `MealPlanClient` posts to `/api/analyze-meal-photo`
   with no `clientId`, so a trainer-viewed photo bills the trainer. Every client
   is on `nutrition_v3`, so this is unreachable today — fix it or delete the
   legacy logger.

---

## 0. Logger reported a SAVED workout as a failure — FIXED 2026-08-11

**Shipped `39fc4a8`.** Lauren Standefer, 11 Aug 10:04am, mid-session:
"Couldn't finish the workout: duplicate key value violates unique constraint
`uq_workout_log_one_completed`."

Her workout had completed at 10:03:28. At 10:04:02 the logger inserted a SECOND
`workout_logs` row for the same client/day/date, copied all 24 of her sets into
it, and tried to complete that one. The partial unique index refused —
correctly — and the refusal was shown to her as her workout failing to save.

Root cause: `ensureWorkoutLog` treated "I hold no log id" as "no log exists".
The draft is cleared on completion, so every remount after finishing looks
identical to a fresh start. It now looks up client + day + sessionDate before
inserting, and a COMPLETED log always wins over a newer incomplete one — the
ordering matters, because Lauren's orphan was created 38 seconds AFTER the
completed row. Helper: `src/lib/workoutLogLookup.ts`, 7 tests.

An already-complete session now shows as finished rather than erroring, and
re-runs the schedule-marking block only when no `scheduled_workouts` row points
at the log yet — re-running it unconditionally would find "nothing scheduled
today" and pull a future session forward, which is the Sara Prince bug.

Data: her completed log and its 24 sets are intact and the 11 Aug schedule row
is `completed`. The orphan log and its 24 duplicate sets were removed, backed
up first to `bak_lauren_orphan_log_20260811` and
`bak_lauren_orphan_setlogs_20260811`.

## 0b. Decimals could not be typed into a recipe — FIXED 2026-08-11

Claudine Ocon, 9:08pm, with a photo of her screen: *"Recipe works but cant type
decimals in weight for each ingredient."* She wanted 1.5 lbs of ground beef and
could only ever get "1".

The field was controlled straight off a NUMBER:

```
value={it.amount ?? ""}
onChange={(e) => setIng(i, { amount: Number(e.target.value.replace(...)) })}
```

`Number("1.")` is `1`, so React re-rendered the box as `"1"` — **deleting the
decimal point on the keystroke that typed it**. The second digit then had
nothing to attach to. It is not rejecting decimals; it is erasing the point, so
from the other side of the screen it reads as a broken keyboard rather than a
bug. That is why it took a photo to report.

The P/C/F boxes beside it had the same shape plus `|| 0`, so clearing one to
retype snapped it back to 0.

Fixed with `src/components/NumericInput.tsx` + `src/lib/numericField.ts`: while
someone is typing, the TEXT is the source of truth and the number is derived
from it. A half-typed `"1."` reports nothing rather than committing `1`, so
totals never flicker mid-entry. 10 tests.

**Same fix applied to the meal-plan added-food amount** (`MealPlanClient.tsx`),
which had the same family of fault — `parseFloat("")` is NaN, which snapped the
field to 0 the moment a client cleared it to retype. That one is on a screen
clients use every day.

## 0c. Per-set timer, in the row you log — DECIDED 12 Aug, NOT BUILT  ← BUILD FIRST

Dustin: *"for timer lets have it function from where you set the actual time.
that way we can get rid of the timer button at the top. movements that track
time you set timer or stop watch right there where you log it, hit start, when
time is up it logs as complete but just like everywhere else you can still
manually log or unlog it as well as edit the time."*

**Why it is right.** Today the clock at the top opens a detached stopwatch that
has no idea which set you are on, so you carry the number in your head. A timer
that starts from the row's own time value and logs that set when it finishes
removes the bookkeeping entirely. Prone W Hold 0:20 × 3 becomes three taps.

**DECIDED:**
- **The timer gets its OWN control**, separate from the log button. Dustin,
  12 Aug. So the fast path — log it now, no waiting — is never taken away.
- **The log button no longer looks like a play button.** DONE, shipped: it is a
  hollow circle-check that animates into the drawn tick. That change had to come
  first, because a play triangle next to a countdown is misleading about which
  control starts the timer.
- **Remove the top clock button** once the per-set timer is in. Not before.

**CONFIRMED 13 Aug — placement.** Dustin picked **Option A** from the three
mocked placements: a small timer button in the row, beside the log button.

**CONFIRMED 13 Aug — modes.** *"we need to be able to toggle from timer to
stopwatch starting from zero."* So the behaviour is not inferred from whether
the time box is empty — every set can be flipped either way:

- a programmed time **counts down** from it and logs the set at zero
- **stopwatch** counts up from **zero** and logs what it measured on stop
- a set with no programmed time simply starts as a stopwatch
- stopping a countdown EARLY records the time worked but does **not** log it —
  a hold abandoned at 8 of 30 seconds is information, not a completed set
- a stopwatch face reads 0:00 before it is started, never the programmed target

**STILL TO CONFIRM:** how the toggle is reached. Three ways mocked and sent
13 Aug (`timer-a-remock.html`): (1) one Timer/Stopwatch switch above the sets,
per movement; (2) long-press the timer button, per set; (3) the timer button
opens a strip with the toggle in it, per set.

**BUILT 13 Aug — the engine.** `src/lib/setTimer.ts`, 18 unit tests. Pure, no
React, no UI decision baked in, so it fits whichever toggle wins.

It is **wall-clock derived, not a tick counter**. The obvious build,
`setInterval(() => secs--, 1000)`, is wrong on a phone: background the app
mid-plank or let the screen lock and the timers throttle, so a 60-second hold
comes back reading 41. State holds the epoch millisecond the run started and
every reading derives from `now`; the interval only forces a repaint. A missed
beat, or twenty in one second, cannot change the number on screen. `startOnly`
keeps exactly one clock running — starting a set pauses the others rather than
refusing the tap.

**Care needed.** This is `WorkoutLogger.tsx`, the file with the worst regression
history here — `tests/unit/loggerLayout.test.ts` names five separate shipped
bugs. A running timer is the first thing on this screen that changes state over
time, so it must not resize anything, must survive backgrounding the app, and
must not fight the pinned viewport height.

## 0d. Library tracked-field defaults — DONE 13 Aug

Dustin, 12 Aug: *"make all holds in library default to this"* (weight + time,
from the screenshot), then three overrides: *"suitecase do distance, single arm
overhead do sets and 1 min each side, hamstring curl hold weight and time 5 sec
holds."*

Verified in the database 13 Aug. Every `%Hold%` row carries a sensible pair;
`Single-Arm Dumbbell Overhead Waiter's Hold` is `time + each_side` and
`Hamstring Curl Isometric Hold` is `weight + time`, both as asked.

One was still wrong: **Suitcase Carry** was `duration + weight`. A carry is
programmed by how far you walk, and `distance` only became a field the logger
could render on 12 Aug — so it now reads `weight + distance`. Backed up to
`bak_exercises_tracked_2026_08_13` first.

**Left alone, needs a word from Dustin:** `Suitcase Hold` is a separate library
row and is still `reps + time`. That is right for a stationary hold, but if
"suitcase" meant this row rather than the carry, it wants `weight + distance`
too — or the two rows want merging.

**Cosmetic, not urgent:** some library rows still use the legacy key
`duration` where everything else says `time`. The logger maps `duration` → `time`
on read (`defaultTrackedFields`), so nothing is broken; it is just two names for
one field, which will eventually mislead somebody reading the table.

## 1. Custom workout from the schedule page  ← NEXT

`app_feedback` `73fcd284`, 2026-08-06, client-app, from Dustin.

> "Need full add workout custom from schedule page not just pick from library"

Today the schedule page only offers "pick from library". The full custom builder
exists elsewhere — this is about reaching it from the schedule page. Check
whether the AI "Create / Replace Workout" builder (shipped `900af2b`) can be
mounted here rather than building a second one.

## 2. Duplicate-programme bug — ROOT CAUSE FOUND AND FIXED 2026-08-11

**Shipped `1ca7876`.** Six duplicate (client, day, date) groups existed across
a 60-day window and FOUR of them shared a `created_at` to the microsecond —
one insert batch writing the same session twice. That is the copy-week path:
`loadWorkouts` on the trainer's programme calendar did not filter `deleted_at`,
so soft-deleted sessions were displayed; `copyCurrentWeek` read what was
displayed; `pasteWeekBulk` inserted it blind. A week holding one duplicate
pasted two copies forward and doubled again on every paste. Bobbie Page carried
four of the six groups, which is exactly what that looks like.

All three leaks are closed and the logic is a tested pure helper
(`src/lib/scheduleDedupe.ts`, 8 tests).

**CLOSED 2026-08-11.** Dustin: "yes add the unique index, shouldn't be doing
same session twice." Migration `uq_scheduled_workout_one_per_day` is live:
unique on `(client_id, day_id, scheduled_date) WHERE deleted_at IS NULL`, so a
soft-deleted session never blocks re-adding the same one.

The 6 pre-existing duplicate pairs were resolved first, keeping the row that
carried a `workout_log_id` (never orphan a logged session), then completed over
scheduled, then oldest — deterministic, never UUID-random. In every completed
pair BOTH rows already pointed at the same `workout_log_id`, so no session was
lost. The losers are soft-deleted, not removed, and the whole set is backed up
to `bak_dupe_sched_20260811`.

A constraint only helps if what the user SEES improves too — the lesson from
Lauren's toast the same morning. Every path that writes a scheduled session now
runs its error through `src/lib/scheduleConflict.ts`, which recognises this
index specifically (not any 23505, and not an FK failure wearing the same table
name) and says "that session is already on the calendar for that day" instead
of raw Postgres. Three of those paths — `assignDay`, `saveAndSchedule` and the
programme page's `moveWorkout` — were discarding their error entirely, so a
rejection would have looked like the button doing nothing at all.

### Original note (kept for context)

Three copies of **"Knee Stability & Strength"** exist (one 17 Jun, two 25 Jul;
one has zero scheduled rows). This is almost certainly the same root cause that
produced Dustin's triple-logged Arms A on 4 Aug: **one session scheduled by
three different sources** (`claude`, `trainer`, `client_self_assign` — confirmed
in `scheduled_workouts.source`).

Fixing the duplicate *programmes* without fixing whatever writes duplicate
*schedule rows* leaves the real bug in place. Find the write path first.
**Ask Dustin before deleting any programme.**

## 3. Add box bridge and ball bridge to the library — needs 30 seconds from Dustin

`app_feedback` `8aa820a9`, 2026-08-05.

**Checked 2026-08-11.** Neither exists as asked. The library has *Stability Ball
Bridge March Feet on Floor* — a specific variant, not the plain movement — and
nothing matching "box bridge" at all.

**Deliberately NOT added by guessing the names.** Rule 12 is exact movement
names, and inventing two is how the library ends up with near-duplicates that
do not come up in the swap search — precisely the failure Dustin hit trying to
switch a lying leg curl for a seated one mid-session.

What is needed, and it is quick: the **exact names** he programs them under,
whether each is corrective-tagged, and a video URL if he has one. Modality and
tracked fields can follow the ball-bridge row already in the library
(`bodybuilding`, `["reps"]`).

## 4. Full nutrients in the food logger  ← IN PROGRESS

`app_feedback` `2c2df05f`. **Scoped 2026-08-07: Dustin said FULL micros, and
"for AI get them all working properly."** Not fibre/sugar/sodium only.

### Done and shipped 2026-08-07

| SHA | What |
|---|---|
| `a0320dc` | One calorie formula. 4/4/9 existed NINE times and they were not identical (some rounded, some did not), so it had to be consolidated before adding fields or they would diverge further. Plus the first-ever test suite for `src/lib/ai/nutrition-json.ts`, which gates every AI nutrition reply and had ZERO coverage. |
| `716c58c` | Storage. `micros` jsonb on `meal_items`, `foods`, `food_catalog`, `recipe_ingredients`; `est_micros` on `meal_adherence_logs`; `total_micros` on `recipes`; nullable `kcal` on `meal_items`/`foods`. Canonical registry at `src/lib/nutrition/nutrients.ts` (33 nutrients). Migration `add_micronutrient_storage`, additive only. |
| `da30c87` | The AI half. `parse`, `plan-build`, `verify-food` and `analyze-meal-photo` all request and store micros. Prompt field list is GENERATED from the registry so it cannot drift from what the validator accepts. |

**Design rules — read before continuing this item:**

- Nutrients live in ONE `micros` jsonb per row, keyed by the registry. Not 33
  columns × 6 tables (~180 columns and a migration per nutrient).
- `fiber`, `sugar`, `sodium`, `sat_fat` keep their existing flat columns on
  `food_catalog` and as `est_*` on `meal_adherence_logs`, and stay
  authoritative there. **There is no dual write.** `readNutrients()` merges
  flat + jsonb and is the ONLY thing that should know this.
- NULL/absent = UNKNOWN, never zero. A 0 is a claim the food contains none of
  that nutrient and silently drags the day's total down.
- Adding a partially-known meal contributes what it knows rather than poisoning
  the day's total to unknown.
- `meal_items.kcal` is nullable: stored when known from a label, derived 4/4/9
  otherwise. Every existing row is NULL so nothing changed. This matches what
  `validateParseResult` already did — it trusts a positive model kcal over the
  formula, which is correct for alcohol, fibre and sugar alcohols.

### Still to do on this item

1. ~~**Plan path threading.**~~ **DONE 2026-08-11.** Micros and a label `kcal`
   now survive from the AI draft all the way to `meal_items`. FIVE separate
   layers were dropping them — the client's `PlanDraft` type, the draft→adopt
   mapping, the adopt request body, `AdoptItemInput`, and `plan-edit`'s clone
   `select()` list. Confirmed against real data: plan-build ran successfully
   for the first time ever on 11 Aug and `meal_items` still had zero rows with
   micros. Five tests in `tests/unit/adoptPlan.test.ts`.
2. ~~**Plan-meal nutrient path.**~~ **DONE 2026-08-11 (`173f60b`).**
   `planMealNutrientMap` reads the panel off `meal_items.micros`, honouring
   amount overrides and prorated by adherence. Three things had to change
   together: the calculator, the SELECT lists (`PLAN_SELECT` and
   `PlanRangeView` both omitted `micros`, and an omitted column reads exactly
   like an empty one), and the types (`LogRow.est_micros`, `CustomItem.mi`).
   `DayTotals.nutrientMap` now carries the whole registry and the legacy four
   are a PROJECTION of it, not a second calculation — they used to be computed
   twice down parallel branches, which is how a panel and a chart end up
   disagreeing about the same day.
3. ~~**UI.**~~ **DONE 2026-08-11 (`173f60b`).** The ALL NUTRIENTS panel renders
   the full registry grouped by carbohydrate / fat / mineral / vitamin, with
   % of daily reference where one exists. Nutrients nothing knew are hidden
   rather than shown as a column of dashes — the coverage footnote already
   states the gap.
4. **Backfill `food_catalog.micros`** from the USDA/OFF import (197,826 rows
   already carry the legacy four; the rest of the panel is available upstream
   for many of them).
5. **Two surfaces bypass the canonical calculators entirely** and will not pick
   any of this up: `MealPlanClient.tsx` and `NutritionAverages.tsx` run their
   own DB queries and their own maths. Worth fixing independently of micros.

## 4b. AI coach loop — draft to Dustin, approve/edit, send, LEARN  ← NEW, NOT STARTED

Dustin, 10 Aug (late): the AI should ask clients questions — "was this helpful?
would you like me to help you somewhere else? how can I help keep you on
track?" — learn each client's needs from the answers, and help them toward
their goals with ideas, tips and advice. Crucially: **drafts go to Dustin's
inbox as a special AI message for him to approve or edit before anything
reaches the client**, so the AI learns how he wants each client handled.

Half of this shipped in `429cbda`: the nudge voice now asks one short question
per message and coaches what each client actually uses. The other half — the
approval loop and the memory — is a real feature and was NOT attempted
overnight, deliberately: it needs a new table, a review surface in the inbox,
and send-on-approve plumbing. Half-landing that unsupervised is how main gets
left fragile.

**It should build on what already exists rather than starting fresh:**

- `/api/ai-nudges` already runs preview-first (`send` defaults false, writes to
  `ai_nudge_log` with `sent=false`, and digests to Dustin). That IS the
  approve-before-send skeleton — it currently just lacks a way for him to say
  yes.
- `/api/attention-drafts` is the existing "AI drafts, trainer reviews" pattern
  worth copying rather than reinventing.
- `client_private_profiles.coach_notes` already exists and is trainer-only —
  the natural home for learned per-client preferences, no new table needed for
  v1.

**Sketch:**

1. Nudge/coach drafts land in Dustin's inbox as a distinct AI-draft message
   type, with Approve / Edit / Skip.
2. Approve sends it to the client under his name (the send path already
   exists); Edit sends his version.
3. **What he changed is the training signal.** Store the diff between draft and
   sent, plus any Skip, against the client. Feed the last few into the next
   draft's context so the AI converges on how he talks to that person.
4. Client replies route back to him, and the useful ones get summarised into
   `coach_notes` so the next draft knows what that client actually responds to.

The learning is the point, and the diff between what the AI wrote and what
Dustin actually sent is the highest-signal, lowest-effort version of it.

## 5. Pull from Garmin / Google / Apple

`app_feedback` `95f11695`, 2026-07-29, from Todd Prine. Plan already written:
`docs/HEALTH-SYNC-HANDOFF.md` + `docs/GARMIN-APPLICATION-DRAFT.md`. Phase 0
shipped 2026-08-04. Parked behind the iPhone build, not blocked technically.
This feedback row can be closed against that work.

## 6. ~~Make "trainer" a setting instead of an email address~~ DONE 2026-08-11

All 63 call sites across 62 files now go through `src/lib/trainer.ts`, and
`is_trainer()` reads a `public.trainers` table instead of a string literal.
Same function signature, so all **64 RLS policies** that call it were untouched.

Verified before and after: across all 33 auth users the rewritten function
disagrees with the old literal on **zero** of them. The table was seeded and
matched against a real `auth.users` row BEFORE the function was swapped — doing
it the other way round would have denied all 64 policies at once and locked
Dustin out of every client's data.

Comparisons became `isTrainerEmail()` rather than `=== TRAINER_EMAIL`, which is
the part that actually enables a second trainer; the equality form compiles,
reads fine, and silently supports exactly one.

`tests/unit/trainerIdentity.test.ts` fails the build on a 64th hardcoded copy
of the address, with a capped allowlist for the three genuine business-contact
uses (privacy policy, payment links, the Open Food Facts User-Agent). Without
that scan the literal comes back within a month.

How to add a trainer: `docs/ADDING-A-TRAINER.md`.

**Still NOT done, and worth being clear about:** `is_trainer()` remains binary.
A trainer sees ALL clients. Per-trainer client scoping means changing the 64
policies themselves and is a separate, larger piece of work. This makes a
second trainer possible; it is not yet multi-tenancy.

## 7. iOS TestFlight

~45 minutes of App Store Connect clicks **only Dustin can do**. Steps in
`docs/IOS-RELEASE-CHECKLIST.md`. Build side is pre-flighted.

## 7b. The demo account shows an empty app  ← NOT STARTED, Dustin said "not yet"

Checked 2026-08-11 while confirming the download and login Dylan was given.
Both work: `symmetry.apk` (7.2 MB, 20 Jul) serves from Supabase storage, the
login page renders, and the four auth files touched this session are
behaviour-identical (verified across all 33 accounts).

The account itself is the problem. `test-client@symmetry-test.com`
("Test Client"):

- 8 scheduled workouts, **0 upcoming** — every one is in the past
- **0 meal plans**, 0 workout logs
- `password_is_temporary` still true, so sign-in forces the set-password screen
- last sign-in 3 July

So someone can download it, get in, and land in a blank app. Not caused by any
recent change — it has been this way since early July — but it demos nothing,
and for someone evaluating from a trainer's perspective it undersells the app
badly.

**The fix, when Dustin wants it:** seed that ONE account with a week of real
programming, a meal plan with macros, and a few logged sessions and weigh-ins so
the charts have shape. Test account only, nowhere near a real client.

## 7c. Help & Tutorials — LANDED 2026-08-11 (was never in this repo)

Dustin, 11 Aug: "we set up the tutorials in his app to guide him through
setting up to run app as is. what do we do now?"

The answer was worse than "they're stale". **The Help & Tutorials centre had
never landed in this repo at all.** It existed as two patch files in the
project docs (`help-center-READY-8-07.patch`, commit `fe1e23e`) and applied
only inside Dylan's fork. Retiring that fork — the entire point of this week's
work — would have deleted the tutorials with it.

Now in the shared repo, so both instances get it and it stays current with the
code: `src/components/HelpCenter.tsx`, `src/lib/help/articles.ts`, wired into
Settings, 20 tests.

Three things changed versus the patch:

- **Instance-neutral.** No article names a person; the product name comes from
  `BUSINESS_NAME`. A tutorial telling another trainer's client to contact
  Dustin is worse than no tutorial — it is confidently, specifically wrong. A
  test enforces it.
- **A new "Running Your Own Instance" category**, trainer-only, replacing the
  fork's setup guidance. It describes the app as it is NOW — configured, not
  edited — including the AI-key warning (a shared key spends the other
  instance's cap) and the APK warning (another instance's build opens their
  login screen).
- **Existing articles updated** for what shipped this week: early sessions
  consuming their slot rather than adding one, copy/paste-week not duplicating,
  a finished workout reading as finished, and the full nutrient panel.

**Standing rule, in the file header:** when a feature lands, its article changes
in the same commit.

## 8. Smaller / hygiene

- **Tim Yancey dip data.** His 4 Jul Assisted Dip records `20.00` assist and
  18 Jul has an empty `0.00 x0` set. Both look like mis-entries and will poison
  any all-time-best comparison now that assisted lifts are scored correctly.
- **~358 hardcoded colours** across ~40 files, outside the theme system.
- **64 pending schedule proposals** awaiting review.
- **Coach ranking decision.** The coach can now join a challenge, but joining
  does NOT make him ranked — that is `clients.exclude_from_rankings`, untouched
  on purpose. Dustin should say whether joining should imply ranked.

## 9. Security — mostly CLEARED 2026-08-11

- ~~**Old GitHub PATs in plaintext** inside `COWORK-INSTRUCTIONS.md`.~~
  **Verified clean.** Scanned the whole Trainer App folder for token-shaped
  strings across `.md`, `.txt`, `.sh`, `.ps1` and `.bat`: **zero matches.**
  The only credential present is `.ghtoken` itself, which is the intended store.
- ~~**~8 obsolete `push-sym*` helpers** from the dead Chrome-token era.~~
  **Moved 2026-08-11** into `Trainer App\_to_delete\` — 12 files including
  `push-symmetry-5.ps1/.sh`, `PUSH-NOW.bat`, the PUSH logs, and the stale
  4- and 5-commit patch/diff pairs. `device_bash` cannot delete, so Dustin
  removes that folder when convenient.
- **STILL OPEN:** the stray `.ghtoken` copy on the **Desktop**. Not reachable
  from a session (only the Trainer App and symmetry-app folders are mounted).
  Dustin deletes it manually.
