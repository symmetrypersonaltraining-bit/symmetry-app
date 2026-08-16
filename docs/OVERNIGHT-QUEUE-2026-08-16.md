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

### [x] 1. Micronutrients — ALREADY BUILT. I was wrong, twice, and shipped a duplicate.

**Do not build this. It exists.** The nutrition screen has an "ALL NUTRIENTS"
collapsible under the macro card: the full registry, grouped, with
`pctOfDaily`, rows hidden when unknown rather than shown as dashes, and a
coverage footnote that says outright when a total is "a floor, not the day's
total". It is better than what I built to replace it.

**How I got it wrong.** I grepped for `logConsumedNutrientMap` across the repo
with `grep -v dailyTotals.ts` — and it is called from `computeDayTotals`, at
line 552 of `dailyTotals.ts`, the one file I excluded. I concluded "called from
nowhere" and built `NutrientPanel.tsx` as the missing end of the pipeline.

It was a duplicate: a second `formatNutrient`, a second percent-of-reference, a
second grouped renderer, all shadowing `groupedNutrients` and `pctOfDaily` which
the registry already exports and the UI already uses. Shipped as `eb8c7ce` and
reverted immediately on finding the original. **That is precisely the
second-source-of-truth drift this codebase keeps being bitten by, and I wrote
three tests against that exact pattern earlier the same night.**

**What IS still open — verified by reading the renders, not by grepping names:**

| Level | Nutrients shown? |
|---|---|
| Day total (nutrition screen) | **YES** — "ALL NUTRIENTS", full registry, grouped |
| Picking a food (`FoodSearchSheet`) | **NO** — it carries fiber/sugar/sodium/satFat on its type, scales them correctly, and takes real care that "0.4 of an unknown sodium is still unknown"… then renders none of them |
| Building a meal (`ComposerSheet`) | **NO** — no nutrient handling at all |

So Dustin's "everywhere in food logger" is satisfied at the day level and not
below it. The smallest honest fix is showing the four legacy nutrients on a food
row in the search sheet, where the data is already in hand and already scaled.

**Use `groupedNutrients` and `pctOfDaily` from `@/lib/nutrition/nutrients`.**
Do not write new formatters — that is exactly what produced the duplicate above.

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

## STATE AS OF 15 Aug 20:45 CT — the handover point

- `origin/main` = `106e1c3`, tree clean, **1,177 tests / 0 failures**
- App healthy — `/api/health` green, auth ~200ms, db ~530ms
- Meal library LIVE and verified as a real client: 50 meals, 20 recipes, 116
  ingredients readable; 0 rows writable
- Imports running clean: catalog **45.3%**, micros **9.7%**, no errors
- `app_feedback`: 100 resolved, 2 open (micros UI, Garmin import)
