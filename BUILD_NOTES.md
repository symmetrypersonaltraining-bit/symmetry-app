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
- ALTERNATING MEALS: engine reads the existing item convention "Chicken (even days) OR Ground Beef (odd days)" and counts REAL calendar-date parity across the prep window; un-annotated "A OR B" splits evenly. For richer rotations (Mon/Wed/Fri, week A/B) we need structured metadata — proposal: meals.rotation jsonb ({type:'daily_parity'|'weekday', map:{...}}). Plug-in point: groceryEngine.altDayCounts().
- Trainer: /nutrition?clientId=… shows the shared AveragesStrip for v3 clients (old NutritionAverages over-counts v3 'Skipped' placeholder rows, so it stays only for flag-off clients).
