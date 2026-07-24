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
