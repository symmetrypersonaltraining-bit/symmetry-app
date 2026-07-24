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
