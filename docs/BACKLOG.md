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

## 1. Custom workout from the schedule page  ← NEXT

`app_feedback` `73fcd284`, 2026-08-06, client-app, from Dustin.

> "Need full add workout custom from schedule page not just pick from library"

Today the schedule page only offers "pick from library". The full custom builder
exists elsewhere — this is about reaching it from the schedule page. Check
whether the AI "Create / Replace Workout" builder (shipped `900af2b`) can be
mounted here rather than building a second one.

## 2. Duplicate-programme bug — INVESTIGATE, DELETE NOTHING

Three copies of **"Knee Stability & Strength"** exist (one 17 Jun, two 25 Jul;
one has zero scheduled rows). This is almost certainly the same root cause that
produced Dustin's triple-logged Arms A on 4 Aug: **one session scheduled by
three different sources** (`claude`, `trainer`, `client_self_assign` — confirmed
in `scheduled_workouts.source`).

Fixing the duplicate *programmes* without fixing whatever writes duplicate
*schedule rows* leaves the real bug in place. Find the write path first.
**Ask Dustin before deleting any programme.**

## 3. Add box bridge and ball bridge to the library

`app_feedback` `8aa820a9`, 2026-08-05. Needs name, modality, video URL, default
tracked fields.

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

1. **Plan path threading.** `plan-edit/route.ts` and `adopt-plan/route.ts`
   build `meal_items` payloads by hand and do not yet carry `micros`/`kcal`.
   Note `plan-edit`'s clone path selects an explicit column list
   (`select("food, amount, unit, basis, protein, carbs, fats, ...")`) — it will
   silently DROP micros until that list is updated. AI-authored plans already
   produce micros; nothing persists them yet.
2. **`dailyTotals.planMealMacros`/`computeDayTotals`** have no nutrient path for
   plan meals (the comment says plan meals have "NO nutrient source" — that is
   now out of date). Needs a `planMealNutrients` mirroring the existing
   `customMealNutrients`, then the day panel reflects planned micros too.
3. **UI.** `NutritionV3Client.tsx` has an "ALL NUTRIENTS" panel showing the four
   legacy nutrients. `groupedNutrients()` / `formatNutrient()` / `pctOfDaily()`
   exist to render the full 33 grouped by carb/fat/mineral/vitamin — the panel
   just needs pointing at them.
4. **Backfill `food_catalog.micros`** from the USDA/OFF import (197,826 rows
   already carry the legacy four; the rest of the panel is available upstream
   for many of them).
5. **Two surfaces bypass the canonical calculators entirely** and will not pick
   any of this up: `MealPlanClient.tsx` and `NutritionAverages.tsx` run their
   own DB queries and their own maths. Worth fixing independently of micros.

## 5. Pull from Garmin / Google / Apple

`app_feedback` `95f11695`, 2026-07-29, from Todd Prine. Plan already written:
`docs/HEALTH-SYNC-HANDOFF.md` + `docs/GARMIN-APPLICATION-DRAFT.md`. Phase 0
shipped 2026-08-04. Parked behind the iPhone build, not blocked technically.
This feedback row can be closed against that work.

## 6. Make "trainer" a setting instead of an email address

`docs/MULTI-TRAINER-BACKLOG.md`. 63 call sites across 62 files plus the
`is_trainer()` SQL function. ~a day. Do it before scaling, not after — it is
what stands between Dustin and a second trainer, and why Dylan's instance is a
fork rather than a configuration.

## 7. iOS TestFlight

~45 minutes of App Store Connect clicks **only Dustin can do**. Steps in
`docs/IOS-RELEASE-CHECKLIST.md`. Build side is pre-flighted.

## 8. Smaller / hygiene

- **Tim Yancey dip data.** His 4 Jul Assisted Dip records `20.00` assist and
  18 Jul has an empty `0.00 x0` set. Both look like mis-entries and will poison
  any all-time-best comparison now that assisted lifts are scored correctly.
- **~358 hardcoded colours** across ~40 files, outside the theme system.
- **64 pending schedule proposals** awaiting review.
- **Coach ranking decision.** The coach can now join a challenge, but joining
  does NOT make him ranked — that is `clients.exclude_from_rankings`, untouched
  on purpose. Dustin should say whether joining should imply ranked.

## 9. Security — outstanding

- **Old GitHub PATs still in plaintext** inside `COWORK-INSTRUCTIONS.md`. The
  live token was rotated 2026-08-07; these older ones were not removed.
- A stray `.ghtoken` copy sits on the **Desktop** alongside ~8 obsolete
  `push-sym*` helper files from the dead Chrome-token era. Delete them.
