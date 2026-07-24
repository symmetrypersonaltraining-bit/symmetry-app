-- NutritionV3: structured rotation/alternation metadata (additive; column only —
-- existing meals grants/RLS untouched and apply to the new column automatically).
--
-- meals.rotation jsonb, NULL for non-rotating meals. Two shapes (see BUILD_NOTES):
--   • {"type":"day_parity","even":{"food":"Chicken Breast","amount":6,"unit":"oz"},
--                          "odd":{"food":"Ground Beef 96/4","amount":6,"unit":"oz"}}
--     Meal-level: the meal's alternating item resolves to `even` on even
--     day-of-month dates, `odd` on odd dates. The grocery/prep engine
--     (src/lib/nutrition/groceryEngine.ts) COMPUTES with this — exact per-item
--     amounts per parity; "X (even days) OR Y (odd days)" string parsing stays
--     as fallback for meals without metadata.
--   • {"type":"weekly","note":"Week 2 of 3"} — informational only; weekly
--     rotation is handled by plan versions + the auto-flip job.
alter table public.meals add column if not exists rotation jsonb;

comment on column public.meals.rotation is
  'Structured rotation metadata: {"type":"day_parity","even":{food,amount,unit},"odd":{...}} (engine computes grocery/prep splits) or {"type":"weekly","note":...} (informational). NULL = no rotation.';
