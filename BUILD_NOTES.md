# Nutrition Logger v3 — Build Notes (overnight session Jul 24, 2026)

FULL SPEC: Notion "🥗 NUTRITION LOGGER v3 — BUILD SPEC (LIVE)" (page 3a7abf27-a927-818d-a48c-c65ec0815704).
Local copies: /home/claude/nutrition-mockups/SPEC.md (+ V2 addendum) and the approved behavioral spec
/home/claude/nutrition-mockups/mockup-01-one-tap-checklist.html (Option 1 v5 — build EXACTLY this).

## Ground rules
- Prod Supabase: mkfiginpiesospsnktea (LIVE CLIENTS — additive schema only, never destructive, never touch existing rows).
- Dev Supabase for testing: giiovjfpbuzmrvpdglhv.
- EVERY new table: grants to anon+authenticated AND at least one RLS policy (standing rule).
- All "today"/date logic: America/Chicago. Logical date ≠ created_at.
- meal_adherence_logs is THE single write target for all logging. Extras = positions 6/7 (never 101).
- Canonical calc: ONE shared module computes daily totals (plan-prorated + est_* + item_overrides + extras) used by macro bar, charts, averages, AI.
- Build gate: npx tsc --noEmit must not ADD new errors (main has pre-existing ones); npm run build must pass.
- Commit style: small, descriptive, prefix "NutritionV3:". Branch: feature/nutrition-logger-v3.
- Feature flag: new logger lives at /nutrition behind client_app_settings-driven flag `nutrition_v3` (default false) so old UI keeps working until flip.

## Workstream B status (client logger UI — overnight Jul 24)
- Canonical calc: src/lib/nutrition/dailyTotals.ts (ONE function; macro bar, averages strip, trainer strip all use it). The v3 meal_adherence_logs protocol is documented at the top of that file (item_overrides.__custom/__removed/__unlogged/__ord; day-custom meals write adherence 'Off-plan' + est_* so old readers compute identical totals; extras at positions 6/7; inserted day meals at 21–40 — verified no meal_position CHECK in prod).
- Logger: src/app/(app)/nutrition/v3/* behind nutrition_v3. Old MealPlanClient path untouched when flag off.
- Print/PDF: /nutrition/print?clientId=…&kind=plan|grocery|prep&start=YYYY-MM-DD&days=N (server-rendered HTML → print-to-PDF / native share) via src/lib/nutrition/groceryEngine.ts.
- ALTERNATING MEALS: engine reads the existing item convention "Chicken (even days) OR Ground Beef (odd days)" and counts REAL calendar-date parity across the prep window; un-annotated "A OR B" splits evenly. STRUCTURED METADATA now exists (Jul 24): meals.rotation jsonb — see next section.

## meals.rotation — structured rotation metadata (Jul 24 evening)
- Migration `meals_rotation_jsonb` (repo copy supabase/migrations/20260724_meals_rotation.sql): `alter table meals add column rotation jsonb` — column only, nullable, existing grants/RLS untouched. Applied to PROD.
- Schema convention (keep it minimal — exactly two shapes):
  - `{"type":"day_parity","even":{"food":"Chicken Breast","amount":6,"unit":"oz"},"odd":{"food":"Ground Beef 96/4","amount":6,"unit":"oz"}}` — meal-level, for a meal whose ONE alternating item flips by day-of-month parity. The grocery/prep engine COMPUTES with this: exact per-alternative amounts × real calendar parity counts. `unit` is stored verbatim (e.g. "oz cooked" keeps the raw-conversion behavior); missing amount/unit inherit from the underlying meal_item.
  - `{"type":"weekly","note":"Week 2 of 3"}` — informational ONLY (engine ignores it). Weekly rotation is handled by plan versions + the auto-flip job; do NOT encode weekly plans as parity.
- Engine (src/lib/nutrition/groceryEngine.ts): `dayParityRotation()` validates the jsonb, `rotationTarget()` finds the alternating item (the "A OR B" item, else exact food-name match on either alternative — covers later-normalized names). buildGroceryList + buildPrepCards prefer valid day_parity metadata; the "X (even days) OR Y (odd days)" string parser stays as fallback for meals without metadata (and for malformed/weekly rotation). Print route selects meals.rotation.
- PROD data pass (Jul 24, Dustin Gautreaux only — meal_items untouched):
  - LIVE plan v2 0fc5bea1 M2 "M2 — Lunch" (meal 40a7a5f5): day_parity Chicken Breast 6 oz (even) / Ground Beef 96/4 6 oz (odd) — derived verbatim from item 718d48f4.
  - LIVE plan v2 M3 (meal 8f39b161): weekly informational note (Tilapia this week → Salmon/Cod as directed).
  - Peak Week depletion 9c27a739 M2 (meal df6a637f) + fill cde92a98 M2 (meal 69ecdacc): day_parity Chicken Breast / Ground Beef 93/7, 6 "oz cooked" each — items said "Chicken Breast OR Ground Beef 93/7" un-annotated; parity assignment (chicken=even, beef=odd) matches his live-plan convention.
  - NOT touched: Gerard/Jerry (verified: their live v3 plans of 7/20 rotate weekly via plan versions; only free-choice "or" items, no parity alternation). Steph Gautreaux's live plan M2 has the identical "(even days) OR (odd days)" item — string fallback covers her; candidate for metadata whenever her plan is next edited.
- Trainer: /nutrition?clientId=… shows the shared AveragesStrip for v3 clients (old NutritionAverages over-counts v3 'Skipped' placeholder rows, so it stays only for flag-off clients).

## Integration pass (Jul 24, morning)
- /api/nutrition-ai/coach now computes its 14-day context through the canonical dailyTotals module (computeDayTotals; archived-plan meal_items fetched per meal_id, AveragesStrip pattern). Placeholder-only days are dropped instead of being fed to the model as fake 0-kcal days. Response contract unchanged.
- Contract fixes (UI side): plan-build returns { draft, plan } — the v3 sheet now unwraps `plan` (was reading meals at top level, so every draft errored) and sends clientId (metering + consult context were unscoped for trainer use). Photo analyze call now sends clientId (per-client meter) + any typed text as extra context. parse and coach contracts verified clean.
- Photo/off-plan single-write: v3 keeps the approved analyze-BEFORE-commit UX (spec: Analyzing… → EST card → confirm), so the commit itself is the ONE write: est_* + off_plan_macros (the analyze route's structured object verbatim, incl. source/restaurant) + analysis_status='complete' land together in a single upsert. The route's logId persistence path stays for server-driven flows (e.g. future re-analysis of pending rows) — no v3 UI path double-writes anymore (openslot photo_url second update merged into patchCustom).
- Extras verified: writes only positions 6/7 (freeExtraPosition; ≥101 rows are read-only legacy rendering).
- Placeholder rows vs engagement counters: TrainerWeekDigest + ClientWeekSummary now exclude rows with no adherence or __unlogged/__removed/__custom.unlogged (and the digest's "ever logs food" query filters null/Skipped adherence server-side). NOT touched (document-only): SlackerScreen (last-activity date — a placeholder still is app activity), MetricCards nutrition chart + old NutritionAverages (v2 calc, flag-off clients only — replaced by dailyTotals consumers for v3 clients).

## DAY-GROUP MEAL PLANS — menus that vary by weekday (Jul 25, 2026)
Capability so a client can have different menus by day of week (gym-owner plans, e.g. Tyler Dorsett: "Week 23 – Days 1,4,6" / "Days 2,5" / "Days 3,7"). ADDITIVE + SAFE: untagged plans behave EXACTLY as before for every existing client.

### Schema (already applied to prod + dev)
- `meal_plans.day_group smallint[]` — nullable. ISO weekday numbers the menu applies to, **1=Mon .. 7=Sun** (America/Chicago). `NULL` (or empty array) = applies EVERY day = the everyday/legacy plan (default, current behavior). No other schema change; existing grants/RLS untouched.

### Selection logic (code)
- `src/lib/nutrition/weekday.ts` → `isoWeekdayFromDateStr('YYYY-MM-DD'): 1..7`. TZ-SAFE: reads Y-M-D and evaluates via `Date.UTC(...).getUTCDay()` (0→7). Never `new Date('YYYY-MM-DD')`. Unit-tested (tests/unit/weekday.test.ts).
- `src/lib/nutrition/resolvePlan.ts`:
  - `pickPlanForDate(candidates, dateStr)` (pure, unit-tested): first candidate whose `day_group` CONTAINS the date's weekday → else first with NULL/empty `day_group` (everyday) → else null.
  - `fetchLivePlans(supabase, clientId, dateStr, selectExtra?)`: all live plans with `effective_date <= dateStr`, ordered `effective_date desc, created_at desc`, selecting the standard meals/meal_items PLUS `day_group, effective_date`.
  - `resolveLivePlanForDate(...)` = fetch + pick. A client with one null-day_group live plan resolves to it for EVERY weekday → zero behavior change.

### Fetch sites routed through the resolver
- `src/app/(app)/nutrition/page.tsx` (main logger) — fetches the FULL live set, passes today's resolved plan as `mealPlan` + the whole set as `livePlans` to NutritionV3Client.
- `src/app/(app)/client-preview/nutrition/page.tsx` — same (Dustin's Client View).
- `src/components/HomeMacrosCard.tsx` (home "Today's Nutrition" ring) — resolves today's plan.
- `src/app/api/nutrition/pdf/route.ts` and `src/app/(app)/nutrition/print/route.ts` — resolve the menu for the sheet's start date.
- Date-nav correctness: NutritionV3Client is client-side date nav. It holds `livePlans` and derives `activePlan = pickPlanForDate(livePlans, selectedDate)` in a useMemo, so scrubbing dates instantly shows the right weekday's menu with no refetch. `planMeals`, `computeDayTotals`, grocery/prep sheet, plan-menu, versions, build-plan and forward all read `activePlan`. Logs are per-date, so a meal logged on a Tue prorates against the Tue menu.
- Incoming/staged banner unchanged: "incoming" = a plan with `effective_date > today` only. Same-week day-group menus (effective in the past) are NOT mislabeled incoming.
- Plan versions sheet: LIVE = any live plan already in effect (day-group clients have several live plans at once); pending = `effective_date > today`.

### NOT changed this pass (documented follow-ups, normal clients unaffected)
- Grocery/Prep + PDF/print span a multi-day range but currently render the SINGLE menu governing the range's start date. For a day-group client a full-week grocery list ideally unions each day's resolved menu across the range (loop `resolveLivePlanForDate` per date). Follow-up; normal (null) clients are unchanged.
- PlanRangeView "Week ahead" forward projection maps FUTURE plan versions by effective_date (not day-of-week). Day-group weekday variation in the forward view is a follow-up.
- adoptPlan (client builds own plan) archives ALL current live plans and inserts one null-day_group live plan — correct/safe for day-group clients too.

### RECIPE for the other chat — populate Tyler's 3 day-group plans (SQL)
A day-group plan is a NORMAL `meal_plans` row (status 'live', an `effective_date <= today`, a descriptive `title`) PLUS `day_group` set to the ISO weekday array, with its `meals` + `meal_items` inserted exactly as usual. Tyler = 3 live plans collectively covering all 7 weekdays:

1. Insert plan rows (one per day-group). Example shape per row:
   ```sql
   insert into meal_plans (client_id, version_number, status, effective_date, title, day_group)
   values
     ('<tyler_client_id>', 23, 'live', '2026-07-01', 'Week 23 — Days 1,4,6', '{1,4,6}'),
     ('<tyler_client_id>', 23, 'live', '2026-07-01', 'Week 23 — Days 2,5',   '{2,5}'),
     ('<tyler_client_id>', 23, 'live', '2026-07-01', 'Week 23 — Days 3,7',   '{3,7}');
   ```
   - `day_group` is a smallint[] literal `'{1,4,6}'` — ISO Mon..Sun. Together {1,4,6}∪{2,5}∪{3,7} = all 7 days.
   - `effective_date` must be on/before the day it should apply (past date = live now).
2. For EACH plan row, insert its `meals` (name, timing, position, swaps) and each meal's `meal_items` (food, amount, unit, is_unlimited, basis, protein, carbs, fats, position) — identical to a normal plan. The three plans have DIFFERENT meals (that's the point).
3. Optional everyday fallback: a client may ALSO keep one plan with `day_group = NULL` — it applies on any weekday not covered by a day-group plan. Tyler's three cover all 7, so no fallback is needed; a normal client just has the single NULL plan (unchanged).
4. Verify: `select id, title, day_group, effective_date, status from meal_plans where client_id='<tyler_client_id>' and status='live' order by effective_date desc, created_at desc;` — expect the three rows with day_group {1,4,6}/{2,5}/{3,7}. In the app, scrubbing the logger date Mon→Sun shows the matching menu each day.
