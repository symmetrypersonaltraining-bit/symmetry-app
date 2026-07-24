// ============================================================================
// Fixture data for the local Supabase emulator (supamock) — mirrors the REAL
// dev-project fixtures (giiovjfpbuzmrvpdglhv) seeded for Nutrition v3 tests:
// same UUIDs, same plan, same catalog rows, same passwords. Keeping the two in
// lockstep means the suite behaves identically in mock and real mode.
// ============================================================================

export const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
export const TRAINER_PASSWORD = "DevTrainer!2026";
export const TEST_PASSWORD = "V3test!Passw0rd";

export const PLAN_USER_ID = "eeee0000-0000-4000-8000-000000000001";
export const OPEN_USER_ID = "eeee0000-0000-4000-8000-000000000002";
export const TRAINER_USER_ID = "aaaa0000-0000-4000-8000-000000000001";

export const PLAN_CLIENT_ID = "e2ec0000-0000-4000-8000-000000000001";
export const OPEN_CLIENT_ID = "e2ec0000-0000-4000-8000-000000000002";

export const PLAN_ID = "ee110000-0000-4000-8000-000000000001";
export const MEAL_IDS = {
  breakfast: "ee120000-0000-4000-8000-000000000001",
  lunch: "ee120000-0000-4000-8000-000000000002",
  snack: "ee120000-0000-4000-8000-000000000003",
  dinner: "ee120000-0000-4000-8000-000000000004",
  evening: "ee120000-0000-4000-8000-000000000005",
};

export const AUTH_USERS = [
  { id: PLAN_USER_ID, email: "v3plan@symmetrydev.app", password: TEST_PASSWORD },
  { id: OPEN_USER_ID, email: "v3open@symmetrydev.app", password: TEST_PASSWORD },
  { id: TRAINER_USER_ID, email: TRAINER_EMAIL, password: TRAINER_PASSWORD },
];

const now = new Date().toISOString();

export const CLIENTS = [
  {
    id: PLAN_CLIENT_ID, name: "V3 Plan Tester", slug: "v3-plan-tester",
    email: "v3plan@symmetrydev.app", auth_user_id: PLAN_USER_ID,
    onboarding_complete: true, is_self_coached: false, start_date: "2026-01-01",
    created_at: now, updated_at: now,
  },
  {
    id: OPEN_CLIENT_ID, name: "V3 Open Tester", slug: "v3-open-tester",
    email: "v3open@symmetrydev.app", auth_user_id: OPEN_USER_ID,
    onboarding_complete: true, is_self_coached: false, start_date: "2026-01-01",
    created_at: now, updated_at: now,
  },
];

export const CLIENT_APP_SETTINGS = [
  { client_id: PLAN_CLIENT_ID, nutrition_v3: true },
  { client_id: OPEN_CLIENT_ID, nutrition_v3: true },
];

export const MEAL_PLANS = [
  {
    id: PLAN_ID, client_id: PLAN_CLIENT_ID, version_number: 1,
    effective_date: "2026-07-01", status: "live", change_reason: "E2E fixture plan",
    created_at: now,
  },
];

export const MEALS = [
  { id: MEAL_IDS.breakfast, meal_plan_id: PLAN_ID, name: "Breakfast", timing: "7:30 AM", position: 1, swaps: null, created_at: now },
  { id: MEAL_IDS.lunch, meal_plan_id: PLAN_ID, name: "Lunch", timing: "12:30 PM", position: 2, swaps: null, created_at: now },
  { id: MEAL_IDS.snack, meal_plan_id: PLAN_ID, name: "Snack", timing: "3:30 PM", position: 3, swaps: null, created_at: now },
  { id: MEAL_IDS.dinner, meal_plan_id: PLAN_ID, name: "Dinner", timing: "6:30 PM", position: 4, swaps: null, created_at: now },
  { id: MEAL_IDS.evening, meal_plan_id: PLAN_ID, name: "Evening", timing: "9:00 PM", position: 5, swaps: null, created_at: now },
];

export const MEAL_ITEMS = [
  { id: "ee130000-0000-4000-8000-000000000011", meal_id: MEAL_IDS.breakfast, food: "Egg Whites", amount: 8, unit: "whites", is_unlimited: false, basis: null, protein: 26, carbs: 2, fats: 0, position: 1 },
  { id: "ee130000-0000-4000-8000-000000000012", meal_id: MEAL_IDS.breakfast, food: "Oatmeal", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 5, carbs: 27, fats: 3, position: 2 },
  { id: "ee130000-0000-4000-8000-000000000013", meal_id: MEAL_IDS.breakfast, food: "Liquid Egg Whites", amount: 8, unit: "fl oz", is_unlimited: false, basis: null, protein: 25, carbs: 0, fats: 0, position: 3 },
  { id: "ee130000-0000-4000-8000-000000000021", meal_id: MEAL_IDS.lunch, food: "Chicken Breast", amount: 6, unit: "oz", is_unlimited: false, basis: "cooked", protein: 42, carbs: 0, fats: 5, position: 1 },
  { id: "ee130000-0000-4000-8000-000000000022", meal_id: MEAL_IDS.lunch, food: "White Rice", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 4, carbs: 45, fats: 0, position: 2 },
  { id: "ee130000-0000-4000-8000-000000000023", meal_id: MEAL_IDS.lunch, food: "Broccoli", amount: null, unit: null, is_unlimited: true, basis: null, protein: 0, carbs: 0, fats: 0, position: 3 },
  { id: "ee130000-0000-4000-8000-000000000031", meal_id: MEAL_IDS.snack, food: "Whey Protein", amount: 1, unit: "scoop", is_unlimited: false, basis: null, protein: 25, carbs: 3, fats: 2, position: 1 },
  { id: "ee130000-0000-4000-8000-000000000032", meal_id: MEAL_IDS.snack, food: "Almonds", amount: 1, unit: "oz", is_unlimited: false, basis: null, protein: 6, carbs: 6, fats: 14, position: 2 },
  { id: "ee130000-0000-4000-8000-000000000041", meal_id: MEAL_IDS.dinner, food: "Chicken Breast (even days) OR Ground Beef 93/7 (odd days)", amount: 6, unit: "oz", is_unlimited: false, basis: "cooked", protein: 40, carbs: 0, fats: 8, position: 1 },
  { id: "ee130000-0000-4000-8000-000000000042", meal_id: MEAL_IDS.dinner, food: "Jasmine Rice", amount: 1, unit: "cup", is_unlimited: false, basis: "cooked", protein: 4, carbs: 44, fats: 1, position: 2 },
  { id: "ee130000-0000-4000-8000-000000000051", meal_id: MEAL_IDS.evening, food: "Salmon", amount: 5, unit: "oz", is_unlimited: false, basis: "cooked", protein: 29, carbs: 0, fats: 11, position: 1 },
  { id: "ee130000-0000-4000-8000-000000000052", meal_id: MEAL_IDS.evening, food: "Greek Yogurt", amount: 1, unit: "cup", is_unlimited: false, basis: null, protein: 20, carbs: 9, fats: 0, position: 2 },
];

export const MACRO_TARGETS = [
  {
    id: "ee140000-0000-4000-8000-000000000001", client_id: PLAN_CLIENT_ID,
    effective_date: "2026-01-01", calories: 2400, protein: 190, carbs: 210, fats: 65,
    rationale: "E2E fixture targets", created_at: now,
  },
];

export const FOOD_CATALOG = [
  ["Chicken Breast, cooked", null, "usda", 187, 35, 0, 4, "6 oz cooked"],
  ["Ground Beef 93/7, cooked", null, "usda", 232, 33, 0, 10, "6 oz cooked"],
  ["Jasmine Rice, cooked", null, "usda", 205, 4, 45, 0, "1 cup cooked"],
  ["White Rice, cooked", null, "usda", 205, 4, 45, 0, "1 cup cooked"],
  ["Egg Whites", null, "usda", 68, 14, 1, 0, "4 large whites"],
  ["Oatmeal, cooked", null, "usda", 158, 6, 27, 3, "1 cup cooked"],
  ["Salmon, cooked", null, "usda", 233, 25, 0, 14, "5 oz cooked"],
  ["Greek Yogurt, nonfat plain", null, "usda", 120, 22, 8, 0, "1 cup"],
  ["Whey Protein Isolate", null, "usda", 110, 25, 1, 0, "1 scoop (30g)"],
  ["Almonds", null, "usda", 164, 6, 6, 14, "1 oz (28g)"],
  ["Broccoli, steamed", null, "usda", 55, 4, 11, 0, "1 cup"],
  ["Sweet Potato, baked", null, "usda", 103, 2, 24, 0, "1 medium"],
  ["Banana", null, "usda", 105, 1, 27, 0, "1 medium"],
  ["Apple", null, "usda", 95, 0, 25, 0, "1 medium"],
  ["Peanut Butter", null, "usda", 188, 8, 6, 16, "2 tbsp"],
  ["Olive Oil", null, "usda", 119, 0, 0, 14, "1 tbsp"],
  ["Tilapia, cooked", null, "usda", 218, 44, 0, 4, "6 oz cooked"],
  ["Avocado", null, "usda", 160, 2, 9, 15, "1/2 medium"],
  ["Cottage Cheese 1%", null, "usda", 163, 28, 6, 2, "1 cup"],
  ["Blueberries", null, "usda", 85, 1, 21, 0, "1 cup"],
  ["Oikos Triple Zero Vanilla", "Oikos", "brand", 100, 15, 7, 0, "1 container (150g)"],
].map(([name, brand, source, kcal, protein, carbs, fats, serving_desc], i) => ({
  id: `ee150000-0000-4000-8000-0000000000${String(i + 10)}`,
  name, brand, source, kcal, protein, carbs, fats, serving_desc,
  verified: true, created_by_client_id: null, created_at: now,
}));

export function buildSeedTables(): Record<string, Record<string, unknown>[]> {
  const deep = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    clients: deep(CLIENTS),
    client_app_settings: deep(CLIENT_APP_SETTINGS),
    meal_plans: deep(MEAL_PLANS),
    meals: deep(MEALS),
    meal_items: deep(MEAL_ITEMS),
    macro_targets: deep(MACRO_TARGETS),
    food_catalog: deep(FOOD_CATALOG),
    foods: [],
    my_meals: [],
    meal_adherence_logs: [],
    ai_usage_log: [],
    plan_flip_log: [],
  };
}

// PlanMeal[] shape (as the app queries it) — used by specs to compute expected
// grocery/print math with the production groceryEngine.
export function fixturePlanMeals() {
  return MEALS.map((m) => ({
    id: m.id,
    name: m.name,
    timing: m.timing,
    position: m.position,
    swaps: m.swaps,
    meal_items: MEAL_ITEMS.filter((it) => it.meal_id === m.id).map((it) => ({
      id: it.id, food: it.food, amount: it.amount, unit: it.unit,
      is_unlimited: it.is_unlimited, basis: it.basis,
      protein: it.protein, carbs: it.carbs, fats: it.fats, position: it.position,
    })),
  }));
}
