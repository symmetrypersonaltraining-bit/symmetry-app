# Handoff — session 2, 14/15 Aug 2026

**Read `docs/HANDOFF-2026-08-14.md` first.** That one carries the three rules,
the seven dead writes, and the method. This one is the delta: everything built
after commit `0e3352f`, plus the open items, plus one root cause that is still
unfixed.

State at handoff:

- `origin/main` = **`42c67c8`**, tree clean
- **1,014 tests passing**
- `food_catalog` ≈ **1.43M rows**, micros ≈ **89k**
- Crons `off-bulk-import` and `off-micros-backfill` running **every minute at
  full speed** (Dustin's explicit instruction — do not throttle without asking)
- `usda-generic-import` **complete** (12,844 foods) and unscheduled

---

## ⛔ THE RULES. THESE ARE NOT SUGGESTIONS.

1. **Client updates go in the GROUP CHAT.** One row: `messages` with
   `is_group = true`, `is_broadcast = false`, `client_id = null`,
   `from_id = to_id =` Dustin's auth id. The `is_broadcast = true` path writes
   one row PER CLIENT and renders as a full-screen takeover. It exists, it
   works, it is **not for updates**. Verbatim: *"Do not send this as a broadcast
   message to every client individually. We've talked about this. Updates go in
   the group message that goes to everybody. All updates always go to the group
   chat."*
2. **Nothing goes to a client without Dustin's explicit go-ahead.** Draft it,
   show it, wait.
3. **Both workout loggers are OFF LIMITS without asking, per item.**
4. **Charts, graphs and Goals were built as ADDITIVE cards** so no existing
   chart could regress. Do not break that containment.
5. **Gerard's and Sharon's workouts** — contraindications are enforced
   server-side for medical reasons and must stay that way.
6. **Never delete a programme without asking. Back up to a `bak_` table before
   any destructive DB change.**
7. **This session cannot push to GitHub.** It is a Cowork cloud sandbox. A 403
   is expected and permanent. **Never re-diagnose it. Never ask Dustin to
   rotate the PAT.** Ship through the bridge (below).
8. **API keys and tokens never pass through chat.** Dustin pastes them into his
   own Supabase SQL editor.

---

## THE SHIP BRIDGE — how code actually reaches GitHub

The sandbox commits locally, then hands a bundle to the laptop, which pushes.

1. Commit in the sandbox.
2. `git bundle create /tmp/ship.bundle <origin-sha>..main`
   — **`..main`, never `..HEAD`.** `..HEAD` produces "couldn't find remote ref
   refs/heads/main" on the laptop side.
3. `SendUserFile` the bundle.
4. `device_commit_files` it to
   `C:\Users\dusti\Claude\Projects\Trainer App\outbox\origin-main.bundle`.
5. Write the new SHA into `outbox\SHIP-NOW` — **no file extension.**
   `ship-watcher.sh` polls for `$OUTBOX/SHIP-NOW`. `SHIP-NOW.txt` does nothing
   and I have lost time to exactly that.
6. Read `outbox\SHIP-RESULT.txt` for the verdict. `outbox\ship-log.txt` has the
   detail. `outbox\watcher-alive.txt` proves the watcher is running — check its
   mtime before blaming anything else.
7. `git fetch origin main` afterwards.

**The stop hook lies.** It will say "N unpushed commits" because the laptop did
the push and the sandbox's `origin/main` ref is stale. `git fetch origin main`
clears it. **`SHIP-RESULT.txt` is the truth, not the hook.**

---

## 🔴 UNFIXED ROOT CAUSE — CLAUDINE, AND POSSIBLY EVERY OTHER CLIENT

Claudine texted that she had **six workouts** on her programme beyond her
cardio. She should have workouts **Tuesday, Thursday, Saturday only**; the rest
of her days are cardio.

What was found:

- She had **two active `program_assignments`**, not one.
- The extra `Personal Workouts` days (positions **54–56**, titled `Solo — …`)
  have **`day_of_week = NULL`**, so the renderer lands them on whatever day it
  likes.
- The rogue rows were written **`2026-07-16 14:19:21`** with **`source='claude'`**.

What was done: extras soft-deleted, backed up to **`bak_claudine_solo_20260814`**.

**What was NOT done — do this first:**

```sql
-- 1. Who else has more than one active assignment?
select c.name, count(*)
from program_assignments pa
join clients c on c.id = pa.client_id
where pa.active
group by c.name
having count(*) > 1;

-- 2. Where else are programme days missing a day_of_week?
select client_id, count(*)
from <programme day table>
where day_of_week is null
group by client_id;
```

Then answer two questions:

- **Why did `ensurePhaseId()` create a second active assignment** when its own
  comment says it only runs when there is none to displace? Read it, then prove
  the behaviour by running it — do not conclude from the comment.
- **What ran at `2026-07-16 14:19:21` with `source='claude'`?** Something wrote
  those rows. Find it or it writes them again.

Fixing Claudine's symptom without this is worthless.

---

## WHAT SHIPPED AFTER `0e3352f` (the 8 commits `HANDOFF-2026-08-14.md` predates)

| sha | what |
|---|---|
| `15596ed` | Log a meal from a photo you already took |
| `6c916e8` | Recipes: tell it what you have, get one that hits your macros |
| `9f88697` | The recipe has to actually hit the macros |
| `cf76f3b` | Tell it WHICH macro is off and which way |
| `42c67c8` | The recipe builder people can actually reach |

(plus `3cd45f8`, `b5d9c0d`, `7a192ae`, `3d5bd36`, `d74dac2` which the 14 Aug doc
covers.)

### Megan's recipe builder — `POST /api/recipes/ai` with `mode: 'create'`

`src/app/api/recipes/ai/route.ts`. Two system prompts, `CREATE_SYSTEM` and
`FIX_SYSTEM`. The mechanism that matters:

- **Totals are computed in the route from the ingredient rows. The model's own
  claimed totals are never trusted and never rendered.** First live call: asked
  for 45P/55C/18F, it wrote 49/71.3/22.8 and the notes said *"protein 46 g,
  carbs 54 g, fat 17 g… lands almost exactly on target."* It lies confidently.
  Do not remove the arithmetic.
- Miss tolerance: `max(6 g, 12%)` per macro **that was actually asked for**.
- On a miss: one correction round (2 max), told **which** macro is off and in
  **which direction**. The correction is accepted **only if `dist()` is
  strictly smaller**. A retry that makes it worse is worse than no retry.
- Response carries `perServing`, `target`, `onTarget`, `corrected`.

UI: `src/app/(app)/recipes/RecipesClient.tsx`, the "BUILD ME ONE THAT HITS MY
MACROS" panel, `buildForMacros()`. It **REPLACES** the ingredient list, never
appends. Green "Lands on your target" / amber "Close, but not quite" comes
straight off `onTarget`.

Verified end-to-end live: asked 45/55/18, got **48P/53C/18F**. Lands ~2 in 3;
misses are usually short on protein and it says so.

Megan's message is drafted at `/tmp/megan-message.txt` in the old sandbox —
**re-draft it if that sandbox is gone; it was written but NOT confirmed sent.**

### Photo picker — camera OR library

Android was forcing the camera because inputs carried `capture=`.

- `NutritionV3Client.tsx` — added a capture-free `libRef` input plus a "Pick a
  photo you already took" row.
- `MealPlanClient.tsx` — dropped `capture="environment"` from `photoRef` and
  `cameraRef`.
- Guard: `tests/unit/photoPickerHasBothPaths.test.ts`. **Note:** the first
  version of this test did not bite under mutation. It now names the surfaces
  explicitly. If you add a photo surface, add it to the test.

---

## THE TEST SUITE IS THE SAFETY NET — AND IT MUST BE MUTATION-TESTED

**Three guard tests written this session only started biting after I mutated
the code they guard and watched them pass.** A guard test you have not tried to
break is decoration. Before trusting a new test: break the thing on purpose,
confirm it fails, put it back.

Guards that exist now:

- `tests/unit/everyAiInputHasAMic.test.ts` — every AI input has a mic; exactly
  ONE speech implementation; dictation **appends**, never replaces; recogniser
  **stops on unmount** (Android allows one at a time); a recording mic
  **MOVES**; `MicButton` is the **only** thing in the app that draws a
  microphone — **no exemptions list**; failure copy lives in one place.
- `tests/unit/dictationPicksTheRightEngine.test.ts` — actually RUNS
  `startDictation` against a fabricated `window`. Native shell → plugin, not the
  browser API; browser → Web Speech; no engine → reports, does not throw;
  denied → `not-allowed`; a pause (`no-speech`) is NOT reported as an error;
  `stop()` releases the native recogniser.
- `tests/unit/dbCheckConstraintValues.test.ts` + `tests/fixtures/db-check-values.json`
  — 39 tables, 55 columns. Add a value to a CHECK constraint, update the fixture.
- `tests/unit/dbInsertsSupplyRequiredColumns.test.ts` + `tests/fixtures/db-required-columns.json`
  — 23 tables.
- `tests/unit/clientWriteFeedback.test.ts` — Todd's save confirmation, movement
  notes, `OffPlanToday`, and both free-text paths routing through
  `/api/workout-manual`.
- `tests/unit/photoPickerHasBothPaths.test.ts`

Known blind spots already hit once: the first CHECK scanner missed
`log_my_weight` because it built `const patch = {…}` — it now follows bare
identifiers. The first NOT NULL scanner produced 19 findings, all noise (ES6
shorthand `body,` and `.insert(rows)`).

---

## COMPONENTS YOU WILL TOUCH

- **`src/components/MicButton.tsx`** — the only microphone in the app. Props:
  `onText`, `size`, `disabled`, `style`, `onNotice`, `onListeningChange`. It
  appends, stops on unmount, routes every failure through `dictationMessage`,
  and renders the `mic-live` halo + `mic-wave` bars while recording. **Never
  hand-roll another mic.**
- **`src/lib/dictation.ts`** — `startDictation` and `dictationMessage(why)`.
  The copy distinguishes `no-engine` / `not-allowed` / `network` / `native-*`.
  It was promoted out of `WorkoutLogger` because it was the best failure copy in
  the app. All failure text lives here.
- **`src/app/globals.css`** — `@keyframes mic-halo`, `@keyframes mic-bar`,
  `.mic-live`, `.mic-wave`, and a `prefers-reduced-motion` block.
- **`src/components/OffPlanToday.tsx`** — additive Home card, self-fetching,
  `if (!rows.length) return null`. Renders `r.details || r.description`
  (description is truncated to 80 chars at write time).
- **`src/app/api/workout-manual/route.ts`** — the single door for adding a
  workout. Accepts `note`; allows zero exercises when `markDone` is true
  (`if (!exercises.length && !(body.markDone && note))`); writes `note` onto
  `workout_logs`. `AddWorkoutButton.addCustom()` and `OffPlanBanner.saveOffPlan()`
  both POST here now — they used to insert straight into `offplan_workout_logs`,
  which is why added workouts never appeared on the schedule.
- **`src/app/api/workout-ai/route.ts`** — `buildContext` also reads
  `exercise_notes` scoped `.eq("author","client")` and renders them as a
  **separate labelled block** ("The CLIENT's own notes on movements…"). Client
  movement notes are notes, not questions: the logger label is now
  `[Training note · ${exName}]`.
- **`src/lib/ai/meter.ts` / `meter-core.ts`** — `$95` monthly cap,
  `WARN_COST_USD = 60`, `warnThresholdCrossed()`, `projectedMonthEndUsd()`,
  `notifyTrainerApproaching()` (fires once per MONTH, durable marker
  `budget_warning_notice`, marker written BEFORE the send, whole thing
  `.catch()`'d so metering can never break a request).

---

## DB OBJECTS CREATED THIS SESSION

`off_nut()`, `off_micros()`, `backfill_off_micros()`, `usda_unit_convert()`,
`usda_nutrient_map` (has **both** `usda_id` and `usda_number`), `usda_micros()`,
`usda_amount()`, `import_usda_generic()`, `food_catalog.micros_source`,
`bak_claudine_solo_20260814`.

**USDA speaks two dialects.** `/food/{id}` returns `nutrient.id`; `/foods/list`
returns the legacy `number`. Mapping only one of them is why an import once
reported "fetched 50, inserted 0". The same bug then reappeared in the macro
path — hence `usda_amount()`. If an import runs clean and inserts nothing,
check the dialect first.

**Watch the indexes.** I created `ix_food_catalog_name_trgm`, byte-identical to
the existing `food_catalog_name_trgm_idx` (107 MB), plus an unused
`ix_food_catalog_micros_missing`. Both dropped, ~145 MB reclaimed. Check
`pg_indexes` before adding one.

**Disk IO warning email** came from three per-minute cron writers. They were
throttled, then restored at Dustin's explicit instruction. If another warning
arrives, tell him — do not silently throttle.

---

## OPEN ITEMS

**Urgent**

- Claudine root cause (above) — the multi-assignment sweep and the
  `source='claude'` writer.

**Queued**

- **Branded micros estimator.** Approved shape: *"estimate from the generic
  match, clearly labelled."* Plumbing exists (`micros_source` column, trigram
  index); **the matcher is not written.** Non-negotiable: **estimates must not
  render without the badge.**
- **Last 51 exercise videos.** 45 of them sit at **61 seconds** against the
  60-second ceiling (`video-candidates/verify/route.ts`, `MAX_SECONDS`, raised
  30→60 this session). **Do NOT just raise it again** — search for shorter
  clips.
- **Client photos** — 30 of 35 clients have none.
- **Wearables (#45)** — blocked on Dustin registering OAuth apps.
- **Recipe photo generation** — Megan's second idea. Not started.
- **Rename "My Meals" → "My Foods"**, or put a Save button directly on the
  parse screen. Robert Burns could not find the save; it exists as
  "⭐ Save to My Meals" in the per-meal ⋯ menu (`NutritionV3Client.tsx:2064`,
  verified live in the DOM and by screenshot). He looked for "My Foods", and it
  only appears on the meal row *after* logging, not on the parse screen. ~20
  minutes.
- **`docs/BACKLOG.md`** — still the running list; this doc is the front door.

**Sent / drafted**

- Group message about the update — **sent**, one row, group chat.
- Megan's message (`/tmp/megan-message.txt`) — **drafted, not confirmed sent.**
- Robert Burns's reply — **drafted, not confirmed sent.**

---

## HOW TO WORK THIS WEEK

Dustin reports bugs **from his phone**. The laptop stays on all week, so the
bridge stays up. For each report:

1. Reproduce against live data with a rolled-back `DO` block. Impersonate the
   client for RLS and **verify the impersonation** (`select count(*) from
   clients` must return 1, not 35) before believing any result.
2. Find the root cause, not the symptom. This codebase's signature failure is a
   swallowed error that becomes confident documentation — readers tolerate
   values their own writers cannot produce (`TrainerCalendar` tests
   `status === "cancelled"` in five places; `source` accepts `client` on five
   tables but not `scheduled_workouts`).
3. Write the guard test. **Mutate the code to prove it bites.**
4. Ship through the bridge. Confirm via `SHIP-RESULT.txt`.
5. Tell him what changed in one line. Nothing goes to a client without his
   go-ahead.
