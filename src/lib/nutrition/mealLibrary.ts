/**
 * The shared meal library — 50 built meals anyone can drop into a plan.
 *
 * Dustin, 15 Aug: "build 50 new meals in the library that people can choose
 * from with full detailed macros and portions measured to create meal plans
 * with. these should be accessable to clients to custom build and the ai to use
 * if they want to have ai build it… macros and portions and servings set for
 * everything where needed for easy plan building."
 *
 * ── How the numbers are kept honest ───────────────────────────────────────
 *
 * Every item carries P/C/F and a MEASURED portion. Nothing here carries a
 * hand-written calorie count: kcal is derived, everywhere, from 4/4/9 by
 * `kcalOf`. A typo in a total is therefore impossible — the only numbers a
 * human wrote are the three macros per ingredient, and mealLibrary.test.ts
 * checks each of those against its portion for plausibility.
 *
 * Per-ingredient values follow standard references (USDA where it exists,
 * label values for packaged items), scaled to the portion written in `a`.
 * They are rounded to one decimal, because a client weighing chicken to 0.01 g
 * is not a client we are trying to create.
 *
 * ── Why `client_id IS NULL` means "library" ───────────────────────────────
 *
 * These live in `my_meals` alongside a client's own saved meals, with a null
 * client_id. That way every screen that already reads My Meals gets the library
 * for free, one row shape, one composer, one "add to plan" path. A client can
 * copy one into their own list and edit it; they cannot edit the shared row,
 * because RLS still requires client_id = my_client_id() to write.
 */

import { kcalOf } from "./dailyTotals";

export interface LibraryItem {
  /** Food name as a client would recognise it on a label or a menu. */
  n: string;
  /** The measured portion. Never vague — "6 oz cooked", not "a chicken breast". */
  a: string;
  p: number;
  c: number;
  f: number;
}

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface LibraryMeal {
  name: string;
  slot: MealSlot;
  /** Free-text tags the picker filters on: "high-protein", "no-cook", … */
  tags: string[];
  items: LibraryItem[];
}

/** kcal/P/C/F for a set of items. Derived, never stored by hand. */
export function mealTotals(items: LibraryItem[]): {
  kcal: number; protein: number; carbs: number; fats: number;
} {
  const protein = items.reduce((s, i) => s + i.p, 0);
  const carbs = items.reduce((s, i) => s + i.c, 0);
  const fats = items.reduce((s, i) => s + i.f, 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    kcal: Math.round(kcalOf(protein, carbs, fats)),
    protein: r1(protein),
    carbs: r1(carbs),
    fats: r1(fats),
  };
}

// ─── BREAKFAST ─────────────────────────────────────────────────────────────

const BREAKFAST: LibraryMeal[] = [
  {
    name: "Greek Yogurt, Berries & Almonds",
    slot: "breakfast",
    tags: ["high-protein", "no-cook", "5-minutes"],
    items: [
      { n: "Nonfat Greek yogurt", a: "1 cup (227 g)", p: 22.6, c: 8.0, f: 0.9 },
      { n: "Blueberries", a: "3/4 cup (110 g)", p: 0.8, c: 15.9, f: 0.3 },
      { n: "Almonds, raw", a: "1 oz (28 g)", p: 6.0, c: 6.1, f: 14.2 },
      { n: "Honey", a: "1 tsp (7 g)", p: 0.0, c: 5.8, f: 0.0 },
    ],
  },
  {
    name: "Three-Egg Scramble with Turkey Sausage",
    slot: "breakfast",
    tags: ["high-protein", "low-carb"],
    items: [
      { n: "Whole eggs", a: "3 large (150 g)", p: 18.9, c: 1.1, f: 15.9 },
      { n: "Turkey breakfast sausage", a: "2 links (56 g)", p: 9.0, c: 1.0, f: 6.0 },
      { n: "Spinach", a: "1 cup raw (30 g)", p: 0.9, c: 1.1, f: 0.1 },
      { n: "Olive oil (pan)", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Egg White & Veggie Omelette with Toast",
    slot: "breakfast",
    tags: ["high-protein", "lower-fat"],
    items: [
      { n: "Egg whites", a: "1 cup (243 g)", p: 26.0, c: 3.6, f: 0.4 },
      { n: "Whole egg", a: "1 large (50 g)", p: 6.3, c: 0.4, f: 5.3 },
      { n: "Bell pepper & onion, diced", a: "1 cup (110 g)", p: 1.2, c: 7.0, f: 0.2 },
      { n: "Whole-wheat toast", a: "2 slices (86 g)", p: 8.0, c: 40.0, f: 2.2 },
    ],
  },
  {
    name: "Overnight Oats with Whey & Banana",
    slot: "breakfast",
    tags: ["make-ahead", "no-cook", "high-carb"],
    items: [
      { n: "Rolled oats, dry", a: "1/2 cup (40 g)", p: 5.3, c: 27.0, f: 2.8 },
      { n: "Whey protein isolate", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Unsweetened almond milk", a: "1 cup (240 ml)", p: 1.0, c: 1.0, f: 2.5 },
      { n: "Banana, sliced", a: "1 medium (118 g)", p: 1.3, c: 27.0, f: 0.4 },
    ],
  },
  {
    name: "Cottage Cheese Bowl with Pineapple",
    slot: "breakfast",
    tags: ["high-protein", "no-cook", "5-minutes"],
    items: [
      { n: "2% cottage cheese", a: "1 cup (226 g)", p: 24.0, c: 8.2, f: 5.0 },
      { n: "Pineapple chunks", a: "1 cup (165 g)", p: 0.9, c: 21.6, f: 0.2 },
      { n: "Walnuts, chopped", a: "1/2 oz (14 g)", p: 2.1, c: 1.9, f: 9.2 },
    ],
  },
  {
    name: "Protein Oatmeal with Peanut Butter",
    slot: "breakfast",
    tags: ["high-protein", "high-carb"],
    items: [
      { n: "Rolled oats, dry", a: "1/2 cup (40 g)", p: 5.3, c: 27.0, f: 2.8 },
      { n: "Whey protein, vanilla", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Natural peanut butter", a: "1 tbsp (16 g)", p: 3.9, c: 3.9, f: 8.0 },
      { n: "Cinnamon", a: "1 tsp (2.6 g)", p: 0.1, c: 0.8, f: 0.0 },
    ],
  },
  {
    name: "Breakfast Burrito, Egg & Black Bean",
    slot: "breakfast",
    tags: ["portable", "balanced"],
    items: [
      { n: "Whole eggs", a: "2 large (100 g)", p: 12.6, c: 0.7, f: 10.6 },
      { n: "Black beans, cooked", a: "1/2 cup (86 g)", p: 7.6, c: 20.4, f: 0.5 },
      { n: "Flour tortilla, 8 inch", a: "1 (45 g)", p: 4.0, c: 24.0, f: 3.5 },
      { n: "Reduced-fat cheddar, shredded", a: "1/4 cup (28 g)", p: 7.0, c: 1.0, f: 5.0 },
      { n: "Salsa", a: "2 tbsp (32 g)", p: 0.3, c: 2.0, f: 0.0 },
    ],
  },
  {
    name: "Smoked Salmon & Avocado Toast",
    slot: "breakfast",
    tags: ["no-cook", "omega-3"],
    items: [
      { n: "Whole-grain bread", a: "2 slices (86 g)", p: 8.0, c: 40.0, f: 2.2 },
      { n: "Smoked salmon", a: "3 oz (85 g)", p: 15.5, c: 0.0, f: 3.7 },
      { n: "Avocado", a: "1/2 medium (68 g)", p: 1.4, c: 5.9, f: 9.9 },
      { n: "Lemon juice", a: "1 tbsp (15 g)", p: 0.1, c: 1.3, f: 0.0 },
    ],
  },
  {
    name: "Protein Smoothie, Berry & Spinach",
    slot: "breakfast",
    tags: ["no-cook", "5-minutes", "portable"],
    items: [
      { n: "Whey protein isolate", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Mixed frozen berries", a: "1 cup (140 g)", p: 1.0, c: 17.0, f: 0.5 },
      { n: "Spinach", a: "2 cups raw (60 g)", p: 1.7, c: 2.2, f: 0.2 },
      { n: "Unsweetened almond milk", a: "1 cup (240 ml)", p: 1.0, c: 1.0, f: 2.5 },
      { n: "Chia seeds", a: "1 tbsp (12 g)", p: 2.0, c: 5.1, f: 3.7 },
    ],
  },
  {
    name: "Steak & Eggs",
    slot: "breakfast",
    tags: ["high-protein", "low-carb"],
    items: [
      { n: "Sirloin steak, cooked", a: "4 oz (113 g)", p: 32.8, c: 0.0, f: 6.8 },
      { n: "Whole eggs", a: "2 large (100 g)", p: 12.6, c: 0.7, f: 10.6 },
      { n: "Sautéed mushrooms", a: "1 cup (156 g)", p: 3.4, c: 5.3, f: 0.5 },
      { n: "Olive oil (pan)", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Kodiak Protein Pancakes with Berries",
    slot: "breakfast",
    tags: ["high-carb", "family-friendly"],
    items: [
      { n: "Kodiak Cakes mix, dry", a: "1/2 cup (53 g)", p: 14.0, c: 30.0, f: 2.0 },
      { n: "Egg whites", a: "1/2 cup (122 g)", p: 13.0, c: 1.8, f: 0.2 },
      { n: "Strawberries, sliced", a: "1 cup (152 g)", p: 1.0, c: 11.7, f: 0.5 },
      { n: "Sugar-free syrup", a: "2 tbsp (30 ml)", p: 0.0, c: 4.0, f: 0.0 },
    ],
  },
  {
    name: "Chocolate Peanut Butter Protein Shake",
    slot: "breakfast",
    tags: ["no-cook", "portable", "5-minutes"],
    items: [
      { n: "Whey protein, chocolate", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Natural peanut butter", a: "1 tbsp (16 g)", p: 3.9, c: 3.9, f: 8.0 },
      { n: "Banana", a: "1 medium (118 g)", p: 1.3, c: 27.0, f: 0.4 },
      { n: "Skim milk", a: "1 cup (245 g)", p: 8.3, c: 12.2, f: 0.2 },
    ],
  },
];

// ─── LUNCH ─────────────────────────────────────────────────────────────────

const LUNCH: LibraryMeal[] = [
  {
    name: "Grilled Chicken, Rice & Broccoli",
    slot: "lunch",
    tags: ["meal-prep", "high-protein", "classic"],
    items: [
      { n: "Chicken breast, cooked", a: "6 oz (170 g)", p: 52.7, c: 0.0, f: 6.1 },
      { n: "White rice, cooked", a: "1 cup (158 g)", p: 4.3, c: 44.5, f: 0.4 },
      { n: "Broccoli, steamed", a: "1.5 cups (137 g)", p: 3.8, c: 9.6, f: 0.5 },
      { n: "Olive oil", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Turkey & Avocado Wrap",
    slot: "lunch",
    tags: ["no-cook", "portable", "10-minutes"],
    items: [
      { n: "Deli turkey breast", a: "5 oz (142 g)", p: 25.0, c: 3.0, f: 2.0 },
      { n: "Low-carb tortilla, 8 inch", a: "1 (42 g)", p: 5.0, c: 16.0, f: 4.5 },
      { n: "Avocado", a: "1/2 medium (68 g)", p: 1.4, c: 5.9, f: 9.9 },
      { n: "Romaine, tomato, red onion", a: "1 cup (85 g)", p: 0.9, c: 3.4, f: 0.1 },
      { n: "Dijon mustard", a: "1 tbsp (15 g)", p: 0.5, c: 0.9, f: 0.5 },
    ],
  },
  {
    name: "Tuna Salad over Greens",
    slot: "lunch",
    tags: ["no-cook", "high-protein", "low-carb", "5-minutes"],
    items: [
      { n: "Tuna in water, drained", a: "1 can (142 g)", p: 33.0, c: 0.0, f: 1.4 },
      { n: "Light mayonnaise", a: "1 tbsp (15 g)", p: 0.1, c: 1.0, f: 3.5 },
      { n: "Celery & red onion, diced", a: "1/2 cup (60 g)", p: 0.5, c: 3.0, f: 0.1 },
      { n: "Mixed greens", a: "3 cups (90 g)", p: 2.0, c: 3.2, f: 0.3 },
      { n: "Olive oil & vinegar", a: "1 tsp oil (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Chicken Burrito Bowl",
    slot: "lunch",
    tags: ["meal-prep", "balanced"],
    items: [
      { n: "Chicken breast, cooked", a: "5 oz (142 g)", p: 44.0, c: 0.0, f: 5.1 },
      { n: "Brown rice, cooked", a: "3/4 cup (146 g)", p: 3.8, c: 34.0, f: 1.3 },
      { n: "Black beans, cooked", a: "1/2 cup (86 g)", p: 7.6, c: 20.4, f: 0.5 },
      { n: "Pico de gallo", a: "1/4 cup (60 g)", p: 0.6, c: 3.0, f: 0.1 },
      { n: "Avocado", a: "1/4 medium (34 g)", p: 0.7, c: 3.0, f: 5.0 },
    ],
  },
  {
    name: "Turkey Chili",
    slot: "lunch",
    tags: ["meal-prep", "batch-cook", "high-fibre"],
    items: [
      { n: "Ground turkey 93/7, cooked", a: "5 oz (142 g)", p: 38.3, c: 0.0, f: 14.2 },
      { n: "Kidney beans, cooked", a: "1/2 cup (89 g)", p: 7.7, c: 20.0, f: 0.4 },
      { n: "Crushed tomatoes", a: "1 cup (245 g)", p: 2.0, c: 12.0, f: 0.5 },
      { n: "Onion, bell pepper, garlic", a: "1 cup (150 g)", p: 1.6, c: 9.5, f: 0.2 },
    ],
  },
  {
    name: "Chicken Caesar Salad, Lightened",
    slot: "lunch",
    tags: ["low-carb", "10-minutes"],
    items: [
      { n: "Chicken breast, grilled", a: "5 oz (142 g)", p: 44.0, c: 0.0, f: 5.1 },
      { n: "Romaine lettuce", a: "3 cups (141 g)", p: 1.7, c: 4.6, f: 0.4 },
      { n: "Light Caesar dressing", a: "2 tbsp (30 g)", p: 0.5, c: 3.0, f: 5.0 },
      { n: "Parmesan, grated", a: "2 tbsp (10 g)", p: 3.8, c: 0.4, f: 2.8 },
    ],
  },
  {
    name: "Shrimp & Quinoa Bowl",
    slot: "lunch",
    tags: ["lower-fat", "high-protein"],
    items: [
      { n: "Shrimp, cooked", a: "6 oz (170 g)", p: 40.8, c: 0.5, f: 0.5 },
      { n: "Quinoa, cooked", a: "1 cup (185 g)", p: 8.1, c: 39.4, f: 3.6 },
      { n: "Cucumber, tomato, red onion", a: "1.5 cups (150 g)", p: 1.5, c: 7.0, f: 0.2 },
      { n: "Lemon & olive oil", a: "1 tsp oil (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Roast Beef & Swiss Sandwich",
    slot: "lunch",
    tags: ["no-cook", "portable"],
    items: [
      { n: "Deli roast beef", a: "4 oz (113 g)", p: 24.0, c: 2.0, f: 4.0 },
      { n: "Whole-grain bread", a: "2 slices (86 g)", p: 8.0, c: 40.0, f: 2.2 },
      { n: "Swiss cheese", a: "1 slice (28 g)", p: 7.6, c: 1.5, f: 7.8 },
      { n: "Lettuce, tomato, mustard", a: "1 serving (60 g)", p: 0.7, c: 3.0, f: 0.3 },
    ],
  },
  {
    name: "Chicken & Sweet Potato Meal Prep",
    slot: "lunch",
    tags: ["meal-prep", "batch-cook", "classic"],
    items: [
      { n: "Chicken thigh, boneless skinless, cooked", a: "5 oz (142 g)", p: 36.9, c: 0.0, f: 15.0 },
      { n: "Sweet potato, roasted", a: "1 medium (130 g)", p: 2.0, c: 26.2, f: 0.1 },
      { n: "Green beans", a: "1.5 cups (150 g)", p: 2.7, c: 10.5, f: 0.2 },
      { n: "Olive oil", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Cottage Cheese & Tomato Plate",
    slot: "lunch",
    tags: ["no-cook", "5-minutes", "low-carb"],
    items: [
      { n: "2% cottage cheese", a: "1.5 cups (339 g)", p: 36.0, c: 12.3, f: 7.5 },
      { n: "Tomato, sliced", a: "1 large (182 g)", p: 1.6, c: 7.1, f: 0.4 },
      { n: "Cucumber", a: "1 cup (119 g)", p: 0.8, c: 3.8, f: 0.2 },
      { n: "Everything seasoning & olive oil", a: "1 tsp oil (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Chicken Pita with Tzatziki",
    slot: "lunch",
    tags: ["portable", "balanced"],
    items: [
      { n: "Chicken breast, grilled", a: "5 oz (142 g)", p: 44.0, c: 0.0, f: 5.1 },
      { n: "Whole-wheat pita", a: "1 large (64 g)", p: 6.3, c: 35.2, f: 1.7 },
      { n: "Tzatziki", a: "2 tbsp (30 g)", p: 1.0, c: 1.5, f: 2.0 },
      { n: "Cucumber, tomato, red onion", a: "1 cup (100 g)", p: 1.0, c: 4.5, f: 0.2 },
    ],
  },
  {
    name: "Lentil & Chicken Soup",
    slot: "lunch",
    tags: ["batch-cook", "high-fibre"],
    items: [
      { n: "Chicken breast, shredded", a: "4 oz (113 g)", p: 35.0, c: 0.0, f: 4.1 },
      { n: "Lentils, cooked", a: "3/4 cup (149 g)", p: 13.5, c: 30.0, f: 0.6 },
      { n: "Carrot, celery, onion", a: "1 cup (128 g)", p: 1.3, c: 9.0, f: 0.2 },
      { n: "Chicken broth, low sodium", a: "1.5 cups (360 ml)", p: 1.5, c: 1.5, f: 0.5 },
    ],
  },
  {
    name: "Salmon Salad with Quinoa",
    slot: "lunch",
    tags: ["omega-3", "meal-prep"],
    items: [
      { n: "Salmon, baked", a: "5 oz (142 g)", p: 35.5, c: 0.0, f: 18.5 },
      { n: "Quinoa, cooked", a: "1/2 cup (93 g)", p: 4.1, c: 19.7, f: 1.8 },
      { n: "Arugula & spinach", a: "2 cups (60 g)", p: 1.7, c: 2.2, f: 0.2 },
      { n: "Balsamic vinaigrette", a: "1 tbsp (15 g)", p: 0.0, c: 1.5, f: 4.5 },
    ],
  },
];

// ─── DINNER ────────────────────────────────────────────────────────────────

const DINNER: LibraryMeal[] = [
  {
    name: "Baked Salmon, Sweet Potato & Asparagus",
    slot: "dinner",
    tags: ["omega-3", "classic", "30-minutes"],
    items: [
      { n: "Salmon fillet, baked", a: "6 oz (170 g)", p: 42.5, c: 0.0, f: 22.1 },
      { n: "Sweet potato, roasted", a: "1 medium (130 g)", p: 2.0, c: 26.2, f: 0.1 },
      { n: "Asparagus, roasted", a: "1 cup (134 g)", p: 3.0, c: 5.2, f: 0.2 },
      { n: "Olive oil", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Sirloin, Baked Potato & Green Beans",
    slot: "dinner",
    tags: ["high-protein", "classic"],
    items: [
      { n: "Sirloin steak, grilled", a: "6 oz (170 g)", p: 49.3, c: 0.0, f: 10.2 },
      { n: "Baked potato", a: "1 medium (173 g)", p: 4.3, c: 37.0, f: 0.2 },
      { n: "Green beans", a: "1.5 cups (150 g)", p: 2.7, c: 10.5, f: 0.2 },
      { n: "Light sour cream", a: "2 tbsp (30 g)", p: 1.2, c: 2.0, f: 3.0 },
    ],
  },
  {
    name: "Chicken Stir Fry with Jasmine Rice",
    slot: "dinner",
    tags: ["30-minutes", "balanced"],
    items: [
      { n: "Chicken breast, sliced & cooked", a: "6 oz (170 g)", p: 52.7, c: 0.0, f: 6.1 },
      { n: "Jasmine rice, cooked", a: "1 cup (158 g)", p: 4.3, c: 44.5, f: 0.4 },
      { n: "Stir-fry vegetables", a: "2 cups (180 g)", p: 3.6, c: 14.0, f: 0.4 },
      { n: "Low-sodium soy sauce & sesame oil", a: "1 tsp oil (4.5 g)", p: 0.5, c: 1.0, f: 4.5 },
    ],
  },
  {
    name: "Turkey Meatballs & Marinara over Zucchini",
    slot: "dinner",
    tags: ["low-carb", "high-protein"],
    items: [
      { n: "Ground turkey 93/7 meatballs, cooked", a: "6 oz (170 g)", p: 45.9, c: 3.0, f: 17.0 },
      { n: "Marinara sauce", a: "1/2 cup (125 g)", p: 2.0, c: 10.0, f: 2.0 },
      { n: "Zucchini noodles, sautéed", a: "2 cups (248 g)", p: 3.0, c: 7.4, f: 0.8 },
      { n: "Parmesan, grated", a: "2 tbsp (10 g)", p: 3.8, c: 0.4, f: 2.8 },
    ],
  },
  {
    name: "Sheet-Pan Chicken Fajitas",
    slot: "dinner",
    tags: ["one-pan", "family-friendly", "30-minutes"],
    items: [
      { n: "Chicken breast, sliced & roasted", a: "6 oz (170 g)", p: 52.7, c: 0.0, f: 6.1 },
      { n: "Bell peppers & onion, roasted", a: "2 cups (220 g)", p: 2.4, c: 14.0, f: 0.4 },
      { n: "Corn tortillas", a: "2 (48 g)", p: 2.6, c: 21.0, f: 1.3 },
      { n: "Avocado", a: "1/4 medium (34 g)", p: 0.7, c: 3.0, f: 5.0 },
      { n: "Olive oil", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
  {
    name: "Cod with Rice Pilaf & Broccoli",
    slot: "dinner",
    tags: ["lower-fat", "high-protein"],
    items: [
      { n: "Cod fillet, baked", a: "7 oz (198 g)", p: 43.6, c: 0.0, f: 1.8 },
      { n: "Rice pilaf, cooked", a: "1 cup (158 g)", p: 4.5, c: 45.0, f: 3.0 },
      { n: "Broccoli, steamed", a: "1.5 cups (137 g)", p: 3.8, c: 9.6, f: 0.5 },
      { n: "Butter", a: "1 tsp (4.7 g)", p: 0.0, c: 0.0, f: 3.8 },
    ],
  },
  {
    name: "Beef & Broccoli Bowl",
    slot: "dinner",
    tags: ["30-minutes", "high-protein"],
    items: [
      { n: "Flank steak, sliced & cooked", a: "6 oz (170 g)", p: 47.6, c: 0.0, f: 12.9 },
      { n: "Broccoli, steamed", a: "2 cups (182 g)", p: 5.1, c: 12.8, f: 0.6 },
      { n: "White rice, cooked", a: "3/4 cup (119 g)", p: 3.2, c: 33.5, f: 0.3 },
      { n: "Soy-ginger sauce", a: "2 tbsp (30 g)", p: 1.0, c: 4.0, f: 1.5 },
    ],
  },
  {
    name: "Chicken Parmesan, Lightened",
    slot: "dinner",
    tags: ["family-friendly", "comfort"],
    items: [
      { n: "Chicken breast, baked & breaded", a: "6 oz (170 g)", p: 54.0, c: 12.0, f: 9.0 },
      { n: "Marinara sauce", a: "1/2 cup (125 g)", p: 2.0, c: 10.0, f: 2.0 },
      { n: "Part-skim mozzarella", a: "1 oz (28 g)", p: 7.0, c: 0.8, f: 4.5 },
      { n: "Side salad with vinaigrette", a: "2 cups (100 g)", p: 1.2, c: 4.0, f: 4.7 },
    ],
  },
  {
    name: "Pork Tenderloin, Roasted Potatoes & Brussels",
    slot: "dinner",
    tags: ["one-pan", "classic"],
    items: [
      { n: "Pork tenderloin, roasted", a: "6 oz (170 g)", p: 45.9, c: 0.0, f: 6.8 },
      { n: "Baby potatoes, roasted", a: "5 oz (142 g)", p: 3.0, c: 27.0, f: 0.2 },
      { n: "Brussels sprouts, roasted", a: "1 cup (156 g)", p: 5.6, c: 11.1, f: 0.5 },
      { n: "Olive oil", a: "2 tsp (9 g)", p: 0.0, c: 0.0, f: 9.0 },
    ],
  },
  {
    name: "Shrimp Scampi with Whole-Wheat Pasta",
    slot: "dinner",
    tags: ["30-minutes", "high-carb"],
    items: [
      { n: "Shrimp, sautéed", a: "6 oz (170 g)", p: 40.8, c: 0.5, f: 0.5 },
      { n: "Whole-wheat spaghetti, cooked", a: "1.5 cups (210 g)", p: 11.0, c: 55.0, f: 1.4 },
      { n: "Butter & garlic", a: "2 tsp butter (9.4 g)", p: 0.1, c: 0.3, f: 7.6 },
      { n: "Lemon, parsley, chili flake", a: "1 serving (20 g)", p: 0.2, c: 1.5, f: 0.1 },
    ],
  },
  {
    name: "Chicken Thigh Curry with Basmati",
    slot: "dinner",
    tags: ["batch-cook", "comfort"],
    items: [
      { n: "Chicken thigh, boneless skinless, cooked", a: "5 oz (142 g)", p: 36.9, c: 0.0, f: 15.0 },
      { n: "Light coconut milk", a: "1/2 cup (120 ml)", p: 1.0, c: 3.0, f: 7.0 },
      { n: "Basmati rice, cooked", a: "3/4 cup (119 g)", p: 3.2, c: 33.5, f: 0.3 },
      { n: "Spinach & tomato", a: "1.5 cups (150 g)", p: 2.5, c: 6.0, f: 0.3 },
    ],
  },
  {
    name: "Bison Burger, No Bun, with Sweet Potato Fries",
    slot: "dinner",
    tags: ["gluten-free", "high-protein"],
    items: [
      { n: "Ground bison, cooked", a: "6 oz (170 g)", p: 47.6, c: 0.0, f: 12.8 },
      { n: "Sweet potato fries, baked", a: "4 oz (113 g)", p: 1.8, c: 26.0, f: 4.5 },
      { n: "Lettuce, tomato, onion, pickle", a: "1 serving (100 g)", p: 1.0, c: 4.5, f: 0.2 },
      { n: "Reduced-fat cheddar", a: "1 slice (21 g)", p: 5.3, c: 0.8, f: 3.8 },
    ],
  },
  {
    name: "Baked Tilapia, Couscous & Zucchini",
    slot: "dinner",
    tags: ["lower-fat", "30-minutes"],
    items: [
      { n: "Tilapia fillet, baked", a: "7 oz (198 g)", p: 51.0, c: 0.0, f: 4.2 },
      { n: "Whole-wheat couscous, cooked", a: "3/4 cup (131 g)", p: 4.6, c: 30.0, f: 0.3 },
      { n: "Zucchini & squash, sautéed", a: "1.5 cups (186 g)", p: 2.2, c: 5.6, f: 0.6 },
      { n: "Olive oil", a: "1 tsp (4.5 g)", p: 0.0, c: 0.0, f: 4.5 },
    ],
  },
];

// ─── SNACKS ────────────────────────────────────────────────────────────────

const SNACK: LibraryMeal[] = [
  {
    name: "Apple & Peanut Butter",
    slot: "snack",
    tags: ["no-cook", "portable", "2-minutes"],
    items: [
      { n: "Apple", a: "1 medium (182 g)", p: 0.5, c: 25.1, f: 0.3 },
      { n: "Natural peanut butter", a: "1 tbsp (16 g)", p: 3.9, c: 3.9, f: 8.0 },
    ],
  },
  {
    name: "Greek Yogurt & Honey",
    slot: "snack",
    tags: ["high-protein", "no-cook", "2-minutes"],
    items: [
      { n: "Nonfat Greek yogurt", a: "3/4 cup (170 g)", p: 17.0, c: 6.0, f: 0.7 },
      { n: "Honey", a: "2 tsp (14 g)", p: 0.0, c: 11.6, f: 0.0 },
    ],
  },
  {
    name: "Beef Jerky & Almonds",
    slot: "snack",
    tags: ["portable", "no-fridge", "low-carb"],
    items: [
      { n: "Beef jerky", a: "1 oz (28 g)", p: 9.0, c: 6.0, f: 1.0 },
      { n: "Almonds, raw", a: "1 oz (28 g)", p: 6.0, c: 6.1, f: 14.2 },
    ],
  },
  {
    name: "Protein Shake, Water Only",
    slot: "snack",
    tags: ["high-protein", "portable", "lower-fat"],
    items: [
      { n: "Whey protein isolate", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Water", a: "10 oz (300 ml)", p: 0.0, c: 0.0, f: 0.0 },
    ],
  },
  {
    name: "Rice Cakes with Cottage Cheese",
    slot: "snack",
    tags: ["pre-workout", "lower-fat"],
    items: [
      { n: "Rice cakes", a: "2 (18 g)", p: 1.4, c: 14.6, f: 0.6 },
      { n: "2% cottage cheese", a: "1/2 cup (113 g)", p: 12.0, c: 4.1, f: 2.5 },
    ],
  },
  {
    name: "Hard-Boiled Eggs & Cherry Tomatoes",
    slot: "snack",
    tags: ["low-carb", "make-ahead", "portable"],
    items: [
      { n: "Hard-boiled eggs", a: "2 large (100 g)", p: 12.6, c: 1.1, f: 10.6 },
      { n: "Cherry tomatoes", a: "1 cup (149 g)", p: 1.3, c: 5.8, f: 0.3 },
    ],
  },
  {
    name: "Turkey & Cheese Roll-Ups",
    slot: "snack",
    tags: ["low-carb", "no-cook", "2-minutes"],
    items: [
      { n: "Deli turkey breast", a: "3 oz (85 g)", p: 15.0, c: 1.8, f: 1.2 },
      { n: "Reduced-fat cheddar", a: "1 oz (28 g)", p: 7.0, c: 1.0, f: 5.0 },
    ],
  },
  {
    name: "Protein Bar & Black Coffee",
    slot: "snack",
    tags: ["portable", "no-fridge", "2-minutes"],
    items: [
      { n: "Protein bar, 20 g protein", a: "1 bar (60 g)", p: 20.0, c: 22.0, f: 8.0 },
      { n: "Black coffee", a: "12 oz (355 ml)", p: 0.3, c: 0.0, f: 0.0 },
    ],
  },
  {
    name: "Banana & Whey, Post-Workout",
    slot: "snack",
    tags: ["post-workout", "high-carb", "lower-fat"],
    items: [
      { n: "Whey protein isolate", a: "1 scoop (31 g)", p: 24.0, c: 3.0, f: 1.0 },
      { n: "Banana", a: "1 large (136 g)", p: 1.5, c: 31.1, f: 0.4 },
    ],
  },
  {
    name: "Edamame, Sea Salt",
    slot: "snack",
    tags: ["vegetarian", "high-fibre"],
    items: [
      { n: "Edamame, shelled, steamed", a: "1 cup (155 g)", p: 18.5, c: 13.8, f: 8.1 },
    ],
  },
  {
    name: "Cheese Stick & Grapes",
    slot: "snack",
    tags: ["portable", "2-minutes", "family-friendly"],
    items: [
      { n: "Part-skim mozzarella stick", a: "1 (28 g)", p: 7.0, c: 0.8, f: 4.5 },
      { n: "Red grapes", a: "1 cup (151 g)", p: 1.1, c: 27.3, f: 0.3 },
    ],
  },
  {
    name: "Chocolate Protein Pudding",
    slot: "snack",
    tags: ["high-protein", "no-cook", "evening"],
    items: [
      { n: "Nonfat Greek yogurt", a: "3/4 cup (170 g)", p: 17.0, c: 6.0, f: 0.7 },
      { n: "Whey protein, chocolate", a: "1/2 scoop (16 g)", p: 12.0, c: 1.5, f: 0.5 },
      { n: "Unsweetened cocoa powder", a: "1 tsp (2 g)", p: 0.4, c: 1.1, f: 0.2 },
    ],
  },
];

/** Every library meal, in the order the picker shows them. */
export const MEAL_LIBRARY: LibraryMeal[] = [...BREAKFAST, ...LUNCH, ...DINNER, ...SNACK];
