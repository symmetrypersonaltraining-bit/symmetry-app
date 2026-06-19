-- ============================================================
-- MEAL PLANS MIGRATION — Symmetry Personal Training
-- Generated: 2026-06-19
-- Source: Notion Command Centers
-- ============================================================
-- 
-- CLIENTS SCANNED (18 total):
--   Bobbie Page        — NO MEAL PLAN on file
--   Brooke Reynolds    — NO MEAL PLAN on file
--   Celeste Lennon     — NO MEAL PLAN on file
--   Cheyenne Martin    — NO MEAL PLAN on file
--   Grant Weever       — NO MEAL PLAN on file
--   Greg Lennon        — NO MEAL PLAN on file
--   Jada Cook          — NO MEAL PLAN on file
--   Krysta Ruiz-Schnitzler — NO MEAL PLAN on file
--   Laurie Kane        — NO MEAL PLAN on file
--   Lesly Spencer      — NO MEAL PLAN on file
--   Madeleine Coker    — NO MEAL PLAN on file
--   Stacie Weever      — NO MEAL PLAN on file
--   Tania Millan       — NO MEAL PLAN on file
--   Tim Yancey         — NO MEAL PLAN on file
--   Tina Haley         — HAS MEAL PLAN (see below)
--   Todd Prine         — NO MEAL PLAN on file
--   Troy Schnitzler    — NO MEAL PLAN on file
--   Tyler Dorsett      — NO MEAL PLAN on file
--
-- Only 1 of 18 clients has a meal plan in their Command Center.
-- ============================================================


-- ============================================================
-- === TINA HALEY ===
-- client_id: c7636c57-510a-44fa-bde4-28cfe879930e
-- Goal: Fat Loss + General Health
-- Macros: ~1,350 kcal | 122g P / 127g C / 40g F
-- Established: May 18, 2026
-- 
-- Plan has 2-option breakfast (M1A smoothie, M1B cream of rice)
-- modeled as separate meals. M2=snack, M3=lunch, M4=dinner,
-- M5=evening snack.
--
-- MACRO ESTIMATES (per standard nutrition data):
--   M1A Smoothie:
--     Protein powder 1 scoop: 25P, 2C, 1F
--     Almond milk 1 cup: 1P, 1C, 2.5F
--     Spinach 1 cup packed: 1P, 1C, 0F
--     Frozen mixed berries 1/2 cup: 0P, 10C, 0F
--     Banana 1/2 medium: 0P, 13C, 0F
--     M1A total: ~27P, 27C, 3.5F
--
--   M1B Cream of Rice + Egg Whites:
--     Cream of rice 1/3 cup dry: ~2P, 28C, 0F
--     Egg whites 3/4 cup (~6 whites): ~18P, 1C, 0F
--     M1B total: ~20P, 29C, 0F
--
--   M2 Morning Snack:
--     Mini bagel (~1 oz): 3P, 20C, 1F
--     Protein powder 1 scoop: 25P, 2C, 1F
--     M2 total: ~28P, 22C, 2F
--
--   M3 Lunch:
--     Ground beef 90/10 4oz cooked: 28P, 0C, 10F (90/10 slightly fattier than 93/7)
--     White rice 1/2 cup cooked: 2P, 22C, 0F
--     Veggies unlimited: 0P, 0C, 0F (unlimited)
--     Olive oil 1 tsp: 0P, 0C, 5F
--     M3 total: ~30P, 22C, 15F
--
--   M4 Dinner:
--     Chicken thighs/drumsticks 4oz cooked: 28P, 0C, 9F (dark meat)
--     White rice 1/2 cup cooked: 2P, 22C, 0F
--     Veggies unlimited: 0P, 0C, 0F (unlimited)
--     Olive oil 1 tsp: 0P, 0C, 5F
--     M4 total: ~30P, 22C, 14F
--
--   M5 Evening Snack:
--     Egg whites 3/4 cup (~5-6 whites): 18P, 1C, 0F
--     Almond butter 1 tsp: 1.2P, 1.2C, 3F
--     M5 total: ~19P, 2C, 3F
--
-- ============================================================

-- M1A: Breakfast Smoothie
WITH tina_plan AS (
  INSERT INTO meal_plans (id, client_id, version_number, effective_date, status, change_reason)
  VALUES (gen_random_uuid(), 'c7636c57-510a-44fa-bde4-28cfe879930e', 1, '2026-05-18', 'live', 'Initial migration from Notion — Fat Loss + General Health plan established May 18, 2026')
  RETURNING id
),
m1a_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M1A — Breakfast Smoothie', '~6:00 AM (Option A)', 1,
    'Swap with M1B (Cream of Rice + Egg Whites) on any morning'
  FROM tina_plan
  RETURNING id
),
m1a_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m1a_insert.id, 'Protein Powder (vanilla/unflavored)', 1, 'scoop', false, 'per scoop', 25, 2, 1, 1 FROM m1a_insert
  UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Unsweetened Almond Milk', 1, 'cup', false, 'per cup (240ml)', 1, 1, 2.5, 2 FROM m1a_insert
  UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Spinach (fresh or frozen)', 1, 'cup packed', false, 'per cup packed', 1, 1, 0, 3 FROM m1a_insert
  UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Frozen Mixed Berries', 0.5, 'cup', false, 'per 1/2 cup', 0, 10, 0, 4 FROM m1a_insert
  UNION ALL
  SELECT gen_random_uuid(), m1a_insert.id, 'Banana', 0.5, 'medium', false, 'per 1/2 medium', 0, 13, 0, 5 FROM m1a_insert
),

-- M1B: Cream of Rice + Egg Whites (alternate breakfast)
m1b_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M1B — Cream of Rice + Egg Whites', '~6:00 AM (Option B)', 2,
    'Swap with M1A (Smoothie) on any morning'
  FROM tina_plan
  RETURNING id
),
m1b_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m1b_insert.id, 'Cream of Rice (dry)', 0.33, 'cup', false, 'per 1/3 cup dry, cook with water', 2, 28, 0, 1 FROM m1b_insert
  UNION ALL
  SELECT gen_random_uuid(), m1b_insert.id, 'Egg Whites', 0.75, 'cup', false, 'per 3/4 cup (~6 whites), scrambled', 18, 1, 0, 2 FROM m1b_insert
  UNION ALL
  SELECT gen_random_uuid(), m1b_insert.id, 'Cinnamon + Stevia', 0, 'to taste', false, 'to taste', 0, 0, 0, 3 FROM m1b_insert
),

-- M2: Morning Snack
m2_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M2 — Morning Snack', '~9:00 AM', 3, NULL
  FROM tina_plan
  RETURNING id
),
m2_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m2_insert.id, 'Mini Bagel (plain or everything)', 1, 'mini bagel', false, 'per mini bagel (~1oz); or 1/2 regular bagel', 3, 20, 1, 1 FROM m2_insert
  UNION ALL
  SELECT gen_random_uuid(), m2_insert.id, 'Protein Powder', 1, 'scoop', false, 'mixed in 8-10 oz water', 25, 2, 1, 2 FROM m2_insert
),

-- M3: Lunch
m3_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M3 — Lunch', '~12:00 PM', 4, NULL
  FROM tina_plan
  RETURNING id
),
m3_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m3_insert.id, 'Lean Ground Beef 90/10', 4, 'oz cooked', false, 'weighed cooked, drain fat', 28, 0, 10, 1 FROM m3_insert
  UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'White Rice', 0.5, 'cup cooked', false, 'per 1/2 cup cooked', 2, 22, 0, 2 FROM m3_insert
  UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'Broccoli / Asparagus / Green Beans', 0, 'cups', true, 'unlimited (1-2+ cups)', 0, 0, 0, 3 FROM m3_insert
  UNION ALL
  SELECT gen_random_uuid(), m3_insert.id, 'Olive Oil', 1, 'tsp', false, 'measured every time', 0, 0, 5, 4 FROM m3_insert
),

-- M4: Dinner
m4_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M4 — Dinner', '~4:00 PM', 5, NULL
  FROM tina_plan
  RETURNING id
),
m4_items AS (
  INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
  SELECT gen_random_uuid(), m4_insert.id, 'Chicken Thighs/Drumsticks', 4, 'oz cooked', false, 'weighed cooked, bake 400°F 25-30 min', 28, 0, 9, 1 FROM m4_insert
  UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'White Rice', 0.5, 'cup cooked', false, 'per 1/2 cup cooked', 2, 22, 0, 2 FROM m4_insert
  UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'Broccoli / Asparagus / Green Beans', 0, 'cups', true, 'unlimited (1-2+ cups)', 0, 0, 0, 3 FROM m4_insert
  UNION ALL
  SELECT gen_random_uuid(), m4_insert.id, 'Olive Oil', 1, 'tsp', false, 'measured every time', 0, 0, 5, 4 FROM m4_insert
),

-- M5: Evening Snack
m5_insert AS (
  INSERT INTO meals (id, meal_plan_id, name, timing, position, swaps)
  SELECT gen_random_uuid(), tina_plan.id, 'M5 — Evening Snack', '~7:00 PM (30-60 min before bed)', 6, NULL
  FROM tina_plan
  RETURNING id
)
INSERT INTO meal_items (id, meal_id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position)
SELECT gen_random_uuid(), m5_insert.id, 'Egg Whites', 0.75, 'cup', false, 'per 3/4 cup (~5-6 whites)', 18, 1, 0, 1 FROM m5_insert
UNION ALL
SELECT gen_random_uuid(), m5_insert.id, 'Almond Butter', 1, 'tsp', false, 'level, measured every time (5g)', 1.2, 1.2, 3, 2 FROM m5_insert;

-- ============================================================
-- END OF FILE
-- ============================================================
-- 
-- SUMMARY:
--   Clients with meal plans inserted: 1 (Tina Haley)
--   Clients with no meal plan (skipped): 17
--     Bobbie Page, Brooke Reynolds, Celeste Lennon, Cheyenne Martin,
--     Grant Weever, Greg Lennon, Jada Cook, Krysta Ruiz-Schnitzler,
--     Laurie Kane, Lesly Spencer, Madeleine Coker, Stacie Weever,
--     Tania Millan, Tim Yancey, Todd Prine, Troy Schnitzler,
--     Tyler Dorsett
--
-- TINA HALEY meal plan details:
--   Targets: ~1,350 kcal | 122g P / 127g C / 40g F
--   M1A (Smoothie): ~27P / 27C / 3.5F
--   M1B (Cream of Rice + Egg Whites): ~20P / 29C / 0F
--   M2 (Morning Snack): ~28P / 22C / 2F
--   M3 (Lunch): ~30P / 22C / 15F
--   M4 (Dinner): ~30P / 22C / 14F
--   M5 (Evening Snack): ~19P / 2C / 3F
--   Daily total (using M1A): ~134P / 95C / 37.5F
--   Daily total (using M1B): ~127P / 97C / 34F
-- ============================================================
