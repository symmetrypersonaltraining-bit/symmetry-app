# Overnight queue — the night of 15/16 Aug

**This file is the work order for the scheduled sessions.** They fire at 1am,
3am and 5am Central. Each one starts fresh with no memory, reads this, picks the
top unfinished item, ships it through the bridge, ticks it off here, and stops.

---

## RULES FOR THE OVERNIGHT SESSIONS — READ BEFORE ANY WORK

1. **The ship bridge must be up.** Check `outbox/watcher-alive.txt` is fresh via
   `device_list_dir`. If it is stale, do NOT start — write a note and stop. A
   commit that never ships dies with the container.
2. **Gates before every ship, no exceptions:** `npx tsc --noEmit` (0 errors in
   `src/`), `npm run test:unit` (0 failed), `npx next build` ("Compiled
   successfully"). The `/login` prerender error is expected in the sandbox.
3. **Mutation-test every guard you write.** Break the code on purpose, watch the
   test fail, restore. Twice on 15 Aug a test passed against the exact bug it
   existed to catch. Reading the test is not enough.
4. **Verify against the database, not against a success response.** On 15 Aug a
   route returned `200` with entirely correct numbers over a completely broken
   library. Query the rows.
5. **Any schema change ships as a file in `supabase/migrations/`** in the same
   commit. Dylan's instance receives schema only through those files. This was
   nearly missed on 15 Aug and would have silently broken his app.
6. **OFF LIMITS without Dustin's per-item permission:** both workout loggers.
   Do not delete a programme. Back up to a `bak_*` table before any destructive
   DB change.
7. **Do not message any client.** Nothing goes to a client without Dustin.
8. **One logical change per commit**, and ship each one before starting the next.
9. **If a task turns out to be already done** — check first, that has happened
   twice — tick it off and move to the next rather than rebuilding it.
10. **Leave the summary updated.** Append to `docs/SATURDAY-NIGHT-2026-08-15.md`
    under a clear heading so Dustin reads one document, not five.

---

## THE QUEUE — in order. Take the top unfinished item.

### [~] 1. Micronutrients have no UI at all — PANEL BUILT, NOT YET MOUNTED

**Done 15 Aug, 20:15 CT:** `src/components/NutrientPanel.tsx` exists, with 10
tests and all 6 mutations biting. It renders the 33-nutrient registry grouped,
with units and reference percentages, and — the load-bearing part — shows a DASH
for unknown, never a zero.

**Confirmed while building it:** `planMealNutrientMap` and
`logConsumedNutrientMap` in `lib/nutrition/dailyTotals.ts` compute the whole
panel for a meal and for a log row, are tested, and are **called from nowhere**.
That is the entire reason "full nutrients" was missing — the data side was
finished and no screen ever asked for it.

**WHAT IS LEFT — mount it:**
- nutrition screen: a day-total panel, summing `logConsumedNutrientMap` over the
  day's logs with `sumNutrients`
- the food/meal detail sheet: per-meal, from `planMealNutrientMap`
- put it behind a collapsed row ("Nutrients") rather than always-open — 33 lines
  under the macros would bury the numbers people actually check daily

Read `NutrientPanel.tsx`'s header before wiring; the null-is-not-zero rule is
the thing to preserve.

### [ ] 1b. (was 1) Mount the panel

**Feedback (Dustin, 4 Aug): "Need to track full nutrients on everywhere in food
logger."** Still open, and narrower than it reads.

Micros are already captured, carried through the AI, and stored on `meal_items`
and inside `item_overrides.__custom`. The pipeline is complete. **Nothing in the
app renders a single micronutrient to a client.**

Build the display:
- per-item micros in the food detail / composer sheet
- a daily totals panel on the nutrition screen alongside the macro row
- units follow `food_catalog` exactly — sodium in mg, the rest in g
- **null means "the source did not publish it", NOT zero.** Rendering a missing
  value as 0 tells a client they ate no sodium. Show a dash.

Do NOT block on the micros backfill — it is at ~9% and 180 hours from done. The
display should degrade honestly when a food has no micros, which is most of
them today.

### [ ] 2. Prove the AI plan builder actually uses the library

Shipped `6887ce7` — the 50 meals and 20 recipes are in the plan-builder system
prompt. **Never executed against the real model.** Call
`/api/nutrition-ai/plan-build` with real targets, read the draft, and check
whether library meal names come back verbatim.

If it ignores the library, the prompt needs work and that is the finding. If it
uses a name that is NOT in the library verbatim, that is a worse finding —
nothing downstream would resolve it.

### [ ] 3. The 92 unchecked writes — triage the rest

`c7d06c6` fixed the workout adjuster, which was the one reporting failures as
successes. A sweep found 92 candidate sites. Most are legitimately
fire-and-forget (push, telemetry). **Go through them and classify.** Fix any
where a discarded error is reported to a human as a completed action. Leave the
genuine fire-and-forget alone and say which they are.

Regenerate the list with the scan in `/tmp/sweep.py` (recreate it — the
container is gone; it walks `src/` for `await …from(x).insert|update|delete`
whose result is not destructured).

### [ ] 4. Client-facing surfaces have no automated accuracy check

**The recommendation from the AI audit, and the most valuable item here.** Both
accuracy faults found on 15 Aug — the workout adjuster counting failed writes,
and the coach inventing a history for Bobbie Page — surfaced from real incidents
rather than from monitoring. There is no automated check that what the AI states
matches the database.

Design and build the smallest useful version: a scheduled job that takes a
handful of recent AI outputs carrying factual claims (weights, dates, session
names) and verifies each against the rows. Report mismatches to
`app_feedback` or the AI health page. Start narrow — training-history claims
only — rather than trying to verify prose.

### [ ] 5. Exercise videos — 101 unsearched

Needs a fresh WebSearch budget, which a new session has. See
`docs/EXERCISE-VIDEOS-THE-REAL-NUMBERS.md` for the corrected figures. Six have
no candidate at all; the worst is 1,098 seconds.

### [ ] 6. `coach_read` is orphaned code

`CoachFocusCard` is mounted nowhere and `/api/coach/focus` is called by nothing.
Flagged dormant on 15 Aug so the health page stops crying wolf. Deleting the
component and the route is the tidy-up — safe, but only worth doing with the
tests green and nothing else in flight.

---

## DO NOT ATTEMPT — these need Dustin, not more time

- **v2 Phase 0 push.** No `add_repo` in this session's tools; `ship-watcher.sh`
  hardcodes the live repo. Needs his hands or a bridge change he has approved.
- **Dylan's Vercel git source.** Not visible from here.
- **Jerry Bourgeois's programme.** His call.
- **Images for meals/recipes.** No image generation or fetch from this sandbox.
- **The Supabase instance decision.** Needs the dashboard.
- **Anything to a client.** Ever.

---

## STATE AS OF 15 Aug 20:05 CT

- `origin/main` = `ea6c4f1`, tree clean, **1,177 tests / 0 failures**
- App healthy — `/api/health` green, auth ~200ms, db ~530ms
- Meal library LIVE and verified as a real client: 50 meals, 20 recipes, 116
  ingredients readable; 0 rows writable
- Imports running clean: catalog **44.5%**, micros **9.1%**, no errors
- `app_feedback`: 100 resolved, 2 open (micros UI, Garmin import)
