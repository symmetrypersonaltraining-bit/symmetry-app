/**
 * The shared recipe library — 20 cook-from-scratch recipes anyone can use.
 *
 * Dustin, 15 Aug: "create 20 recipes in the library as well for people that
 * want to cook and meal plan and giv eaccess to clients and ai as well… i want
 * lots of options with clean foods, easy to prepare and cook meals and recipes
 * full directions."
 *
 * ── The rules these were written to ───────────────────────────────────────
 *
 * · CLEAN. Whole foods. Nothing here needs a speciality shop — every ingredient
 *   is on a normal Texas grocery run.
 * · EASY. Nothing over 45 minutes start to finish, nothing needing equipment
 *   past a sheet pan, a skillet and a pot. Most are one-pan.
 * · FULL DIRECTIONS. Numbered steps with real temperatures, times and doneness
 *   cues — "until it flakes", not "until done". A recipe that assumes you
 *   already know how to cook it is a recipe for somebody who did not need it.
 * · PORTIONED. Every ingredient is weighed or measured, every recipe declares
 *   its `servings`, and the macros stored are PER SERVING, so a recipe drops
 *   into a plan exactly like a meal does.
 *
 * ── Macros ────────────────────────────────────────────────────────────────
 *
 * Same rule as mealLibrary: nobody writes a calorie count. Ingredient macros
 * are for the WHOLE recipe; per-serving totals are derived by dividing by
 * `servings`, and kcal by 4/4/9. recipeLibrary.test.ts checks the arithmetic
 * and the plausibility of every line.
 */

import { kcalOf } from "./dailyTotals";

export interface RecipeIngredient {
  n: string;
  /** Measured amount for the WHOLE recipe, not per serving. */
  a: string;
  /** Macros for the whole recipe's worth of this ingredient. */
  p: number;
  c: number;
  f: number;
}

export interface LibraryRecipe {
  title: string;
  description: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  tags: string[];
  ingredients: RecipeIngredient[];
  /** Numbered steps. Temperatures in °F, times in minutes, doneness cues real. */
  instructions: string[];
}

/** Per-serving macros. Derived — the recipe never stores a hand-written total. */
export function perServing(r: LibraryRecipe): {
  kcal: number; protein: number; carbs: number; fats: number;
} {
  const s = r.servings;
  const p = r.ingredients.reduce((a, i) => a + i.p, 0) / s;
  const c = r.ingredients.reduce((a, i) => a + i.c, 0) / s;
  const f = r.ingredients.reduce((a, i) => a + i.f, 0) / s;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { kcal: Math.round(kcalOf(p, c, f)), protein: r1(p), carbs: r1(c), fats: r1(f) };
}

export const RECIPE_LIBRARY: LibraryRecipe[] = [
  {
    title: "Sheet-Pan Lemon Chicken & Vegetables",
    description:
      "One pan, one temperature, nothing to watch. The bones of a week of lunches — roast it Sunday and it holds four days.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ["one-pan", "meal-prep", "high-protein", "gluten-free"],
    ingredients: [
      { n: "Chicken breast, boneless skinless", a: "24 oz (680 g) raw", p: 158.0, c: 0.0, f: 18.4 },
      { n: "Baby potatoes, halved", a: "16 oz (454 g)", p: 9.5, c: 86.0, f: 0.5 },
      { n: "Broccoli florets", a: "12 oz (340 g)", p: 9.5, c: 23.8, f: 1.2 },
      { n: "Olive oil", a: "2 tbsp (27 g)", p: 0.0, c: 0.0, f: 27.0 },
      { n: "Lemon", a: "1 whole (58 g)", p: 0.4, c: 5.4, f: 0.2 },
      { n: "Garlic, minced", a: "4 cloves (12 g)", p: 0.8, c: 4.0, f: 0.1 },
    ],
    instructions: [
      "Heat the oven to 425°F and put the rack in the middle.",
      "Toss the halved potatoes with 1 tbsp of the oil, salt and pepper. Spread them on a sheet pan and roast 12 minutes on their own — they need the head start.",
      "While they roast, toss the chicken and broccoli with the remaining oil, the minced garlic, the zest of the lemon, salt and pepper.",
      "Pull the pan out, push the potatoes to one side, and add the chicken and broccoli in a single layer. Crowding steams instead of roasting — use two pans if it does not fit.",
      "Roast 18–22 minutes, until the thickest part of the chicken reads 165°F and the broccoli edges are browning.",
      "Squeeze the lemon over everything straight out of the oven. Rest 5 minutes before slicing — cutting it immediately loses the juice onto the board.",
      "Divide into 4 containers. Keeps 4 days refrigerated.",
    ],
  },
  {
    title: "Ground Turkey Taco Skillet",
    description:
      "Everything a taco night is, in one skillet, weighed. Serve it over rice, in tortillas, or on greens.",
    servings: 4,
    prepMinutes: 8,
    cookMinutes: 18,
    tags: ["one-pan", "family-friendly", "meal-prep", "30-minutes"],
    ingredients: [
      { n: "Ground turkey 93/7", a: "20 oz (567 g) raw", p: 128.0, c: 0.0, f: 39.7 },
      { n: "Black beans, drained & rinsed", a: "1 can (425 g)", p: 24.0, c: 66.0, f: 1.5 },
      { n: "Corn kernels", a: "1 cup (154 g)", p: 5.0, c: 31.0, f: 1.8 },
      { n: "Diced tomatoes with green chiles", a: "1 can (283 g)", p: 2.0, c: 12.0, f: 0.5 },
      { n: "Yellow onion, diced", a: "1 medium (110 g)", p: 1.2, c: 10.3, f: 0.1 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
      { n: "Taco seasoning, low sodium", a: "2 tbsp (16 g)", p: 1.0, c: 8.0, f: 0.5 },
    ],
    instructions: [
      "Heat the oil in a large skillet over medium-high until it shimmers.",
      "Add the onion and cook 3–4 minutes, until it turns translucent at the edges.",
      "Add the turkey. Break it up and leave it alone for 2 minutes before stirring — that pause is where the browning comes from. Cook 6–8 minutes total, until no pink remains.",
      "Stir in the seasoning and cook 30 seconds until it smells toasted rather than dusty.",
      "Add the beans, corn and tomatoes with their liquid. Simmer 5–6 minutes until it thickens enough that a spoon leaves a trail.",
      "Taste for salt. Divide into 4 portions.",
    ],
  },
  {
    title: "Baked Salmon with Garlic & Dill",
    description:
      "Twelve minutes in a hot oven. The most forgiving way to cook salmon and the hardest to overdo.",
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 14,
    tags: ["omega-3", "20-minutes", "low-carb", "gluten-free"],
    ingredients: [
      { n: "Salmon fillets, skin on", a: "24 oz (680 g) raw", p: 138.0, c: 0.0, f: 82.0 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
      { n: "Garlic, minced", a: "3 cloves (9 g)", p: 0.6, c: 3.0, f: 0.1 },
      { n: "Fresh dill, chopped", a: "2 tbsp (6 g)", p: 0.2, c: 0.4, f: 0.0 },
      { n: "Lemon", a: "1 whole (58 g)", p: 0.4, c: 5.4, f: 0.2 },
    ],
    instructions: [
      "Heat the oven to 400°F. Line a sheet pan with parchment.",
      "Pat the fillets dry — properly dry. Wet fish steams and never browns.",
      "Rub with the oil, then the garlic, dill, salt and pepper. Lay them skin-side down.",
      "Bake 12–14 minutes. It is done when the thickest part flakes with gentle pressure from a fork and reads 125–130°F for medium. Salmon carries on cooking off the heat, so pull it slightly under.",
      "Squeeze the lemon over and serve. Leftovers are good cold on a salad the next day.",
    ],
  },
  {
    title: "Slow-Cooker Shredded Chicken",
    description:
      "The base ingredient for half this library. Four hours untended, then it is tacos, bowls, salads or soup all week.",
    servings: 6,
    prepMinutes: 5,
    cookMinutes: 240,
    tags: ["batch-cook", "meal-prep", "hands-off", "high-protein"],
    ingredients: [
      { n: "Chicken breast, boneless skinless", a: "3 lb (1361 g) raw", p: 316.0, c: 0.0, f: 36.8 },
      { n: "Chicken broth, low sodium", a: "1 cup (240 ml)", p: 1.0, c: 1.0, f: 0.5 },
      { n: "Garlic powder, onion powder, paprika, cumin", a: "1 tbsp each (24 g)", p: 1.2, c: 12.0, f: 0.6 },
    ],
    instructions: [
      "Put the chicken in the slow cooker in one layer. Season all over with the spice mix and a good pinch of salt.",
      "Pour the broth around the chicken, not over it — you do not want to wash the seasoning off.",
      "Cook on LOW for 4 hours, or HIGH for 2. It is ready at 165°F internal, but it shreds far better around 175°F, so err long rather than short.",
      "Shred with two forks directly in the pot and stir it through the cooking liquid. That liquid is the difference between moist and dry — do not drain it.",
      "Cool, then divide into 6 portions. Keeps 4 days refrigerated, 3 months frozen.",
    ],
  },
  {
    title: "Turkey Chili",
    description:
      "A big pot on Sunday that gets better on Tuesday. Freezes well in single portions.",
    servings: 6,
    prepMinutes: 12,
    cookMinutes: 40,
    tags: ["batch-cook", "high-fibre", "freezer-friendly", "one-pot"],
    ingredients: [
      { n: "Ground turkey 93/7", a: "24 oz (680 g) raw", p: 153.6, c: 0.0, f: 47.6 },
      { n: "Kidney beans, drained", a: "1 can (425 g)", p: 24.0, c: 63.0, f: 1.5 },
      { n: "Black beans, drained", a: "1 can (425 g)", p: 24.0, c: 66.0, f: 1.5 },
      { n: "Crushed tomatoes", a: "1 can (794 g)", p: 6.5, c: 39.0, f: 1.6 },
      { n: "Onion & bell pepper, diced", a: "2 cups (300 g)", p: 3.2, c: 19.0, f: 0.4 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
      { n: "Chili powder, cumin, oregano", a: "3 tbsp total (24 g)", p: 1.2, c: 12.0, f: 1.2 },
    ],
    instructions: [
      "Heat the oil in a heavy pot over medium-high. Cook the onion and pepper 5 minutes until softened.",
      "Add the turkey and brown it, 7–8 minutes, breaking it up as it goes.",
      "Add the spices and stir for a full minute — cooking them in the fat is what stops chili tasting raw and powdery.",
      "Add the tomatoes and both cans of beans. Bring to a simmer.",
      "Drop the heat to low and simmer uncovered 25–30 minutes, stirring occasionally. It is ready when it has thickened and the surface fat has gone glossy.",
      "Salt to taste at the END, not the start — it reduces, and salting early overshoots.",
      "Divide into 6. Better on day two.",
    ],
  },
  {
    title: "Egg Muffin Cups",
    description:
      "Twelve breakfasts in half an hour. Grab two on the way out and they reheat in 45 seconds.",
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 22,
    tags: ["meal-prep", "make-ahead", "low-carb", "portable"],
    ingredients: [
      { n: "Whole eggs", a: "8 large (400 g)", p: 50.4, c: 2.9, f: 42.4 },
      { n: "Egg whites", a: "1 cup (243 g)", p: 26.0, c: 3.6, f: 0.4 },
      { n: "Turkey sausage, cooked & crumbled", a: "6 oz (170 g)", p: 27.0, c: 3.0, f: 18.0 },
      { n: "Spinach, chopped", a: "3 cups raw (90 g)", p: 2.6, c: 3.3, f: 0.3 },
      { n: "Bell pepper, diced", a: "1 cup (150 g)", p: 1.5, c: 9.0, f: 0.3 },
      { n: "Reduced-fat cheddar, shredded", a: "3 oz (85 g)", p: 21.0, c: 3.0, f: 15.0 },
    ],
    instructions: [
      "Heat the oven to 350°F. Grease a 12-cup muffin tin properly, including the top surface — egg welds itself to anything you miss.",
      "Whisk the whole eggs and whites together with salt and pepper until completely uniform in colour.",
      "Divide the sausage, spinach, pepper and cheese between the 12 cups.",
      "Pour the egg over, filling each cup about three-quarters. They rise and then settle.",
      "Bake 20–22 minutes, until the centres are set and a knife comes out clean. They will puff dramatically and deflate as they cool — that is normal.",
      "Cool 5 minutes in the tin, then run a knife around each. Two muffins per serving. Keeps 4 days.",
    ],
  },
  {
    title: "Beef & Broccoli Stir Fry",
    description:
      "Faster than delivery and you control the sugar. The only trick is a properly hot pan.",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 12,
    tags: ["30-minutes", "high-protein", "one-pan"],
    ingredients: [
      { n: "Flank steak, sliced thin against the grain", a: "20 oz (567 g) raw", p: 132.0, c: 0.0, f: 36.0 },
      { n: "Broccoli florets", a: "16 oz (454 g)", p: 12.7, c: 31.8, f: 1.6 },
      { n: "Low-sodium soy sauce", a: "3 tbsp (48 g)", p: 3.0, c: 3.0, f: 0.0 },
      { n: "Sesame oil", a: "1 tbsp (13.6 g)", p: 0.0, c: 0.0, f: 13.6 },
      { n: "Fresh ginger & garlic, minced", a: "2 tbsp total (16 g)", p: 0.4, c: 3.5, f: 0.1 },
      { n: "Cornstarch", a: "1 tbsp (8 g)", p: 0.0, c: 7.0, f: 0.0 },
    ],
    instructions: [
      "Toss the sliced beef with the cornstarch and 1 tbsp of the soy sauce. Leave it 10 minutes — this is velveting, and it is why restaurant beef is tender.",
      "Steam or microwave the broccoli 3 minutes until bright green and barely tender. Set aside.",
      "Get a large skillet or wok properly hot over high heat, then add the sesame oil.",
      "Add the beef in a SINGLE LAYER and do not touch it for 90 seconds. Adding it all at once drops the pan temperature and it will grey rather than sear — cook in two batches if the pan is small.",
      "Stir-fry 2 more minutes, then add the ginger and garlic for 30 seconds, until fragrant.",
      "Return the broccoli, add the remaining soy sauce, and toss 1 minute until everything is coated and glossy.",
      "Serve immediately. This one does not wait.",
    ],
  },
  {
    title: "Overnight Oats, Four Ways",
    description:
      "Five minutes tonight, breakfast solved tomorrow. The base is fixed; the topping is yours.",
    servings: 1,
    prepMinutes: 5,
    cookMinutes: 0,
    tags: ["no-cook", "make-ahead", "5-minutes", "vegetarian"],
    ingredients: [
      { n: "Rolled oats, dry", a: "1/2 cup (40 g)", p: 5.3, c: 27.0, f: 2.8 },
      { n: "Unsweetened almond milk", a: "1/2 cup (120 ml)", p: 0.5, c: 0.5, f: 1.3 },
      { n: "Nonfat Greek yogurt", a: "1/2 cup (113 g)", p: 11.3, c: 4.0, f: 0.4 },
      { n: "Chia seeds", a: "1 tbsp (12 g)", p: 2.0, c: 5.1, f: 3.7 },
      { n: "Blueberries", a: "1/2 cup (74 g)", p: 0.5, c: 10.7, f: 0.2 },
    ],
    instructions: [
      "Put the oats, chia, milk and yogurt in a jar. Stir until there are no dry pockets at the bottom — those never hydrate and you will find them in the morning.",
      "Top with the blueberries. Seal.",
      "Refrigerate at least 6 hours, ideally overnight. It thickens as the chia hydrates.",
      "Eat cold, straight from the jar. If it is too thick, loosen with a splash of milk.",
      "Swaps that keep the macros close: banana and cinnamon; strawberry and a half-scoop of vanilla whey; cocoa powder and a tbsp of peanut butter (adds 8 g fat); grated apple and nutmeg.",
    ],
  },
  {
    title: "Greek Chicken Bowls",
    description:
      "Bright, cold-friendly, and the marinade does the work while you do something else.",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 15,
    tags: ["meal-prep", "high-protein", "mediterranean"],
    ingredients: [
      { n: "Chicken breast, cubed", a: "24 oz (680 g) raw", p: 158.0, c: 0.0, f: 18.4 },
      { n: "Greek yogurt, nonfat (marinade)", a: "1/2 cup (113 g)", p: 11.3, c: 4.0, f: 0.4 },
      { n: "Olive oil", a: "2 tbsp (27 g)", p: 0.0, c: 0.0, f: 27.0 },
      { n: "Lemon juice", a: "3 tbsp (45 g)", p: 0.2, c: 4.0, f: 0.0 },
      { n: "Cucumber & cherry tomato", a: "3 cups (400 g)", p: 3.6, c: 16.0, f: 0.6 },
      { n: "Quinoa, cooked", a: "3 cups (555 g)", p: 24.3, c: 118.2, f: 10.8 },
      { n: "Feta, crumbled", a: "3 oz (85 g)", p: 12.0, c: 3.4, f: 18.0 },
      { n: "Dried oregano & garlic powder", a: "1 tbsp each (12 g)", p: 0.6, c: 6.0, f: 0.3 },
    ],
    instructions: [
      "Whisk the yogurt, 1 tbsp of the oil, lemon juice, oregano, garlic powder, salt and pepper. Add the chicken and turn to coat.",
      "Marinate 30 minutes at room temperature, or up to 8 hours refrigerated. The yogurt's acid tenderises — past 8 hours it goes chalky, so do not leave it overnight twice.",
      "Heat the remaining oil in a skillet over medium-high. Cook the chicken 10–12 minutes, turning, until browned outside and 165°F inside.",
      "Divide the quinoa between 4 bowls. Top with chicken, cucumber, tomato and feta.",
      "Dress with a squeeze of lemon. Assemble cold for the fridge; these are meant to be eaten cold or at room temperature.",
    ],
  },
  {
    title: "Sheet-Pan Shrimp Fajitas",
    description:
      "Twelve minutes of cooking. Shrimp is the fastest protein in the shop and the easiest to ruin — the timer matters here.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 12,
    tags: ["one-pan", "20-minutes", "lower-fat", "gluten-free"],
    ingredients: [
      { n: "Raw shrimp, peeled & deveined", a: "24 oz (680 g)", p: 130.0, c: 3.4, f: 2.0 },
      { n: "Bell peppers, sliced", a: "3 medium (360 g)", p: 3.6, c: 21.6, f: 0.7 },
      { n: "Red onion, sliced", a: "1 large (150 g)", p: 1.7, c: 14.0, f: 0.2 },
      { n: "Olive oil", a: "2 tbsp (27 g)", p: 0.0, c: 0.0, f: 27.0 },
      { n: "Chili powder, cumin, smoked paprika", a: "2 tbsp total (16 g)", p: 0.8, c: 8.0, f: 0.8 },
      { n: "Lime", a: "2 whole (134 g)", p: 0.9, c: 14.1, f: 0.3 },
    ],
    instructions: [
      "Heat the oven to 425°F.",
      "Toss the peppers and onion with 1 tbsp oil and half the spices. Spread on a sheet pan and roast 10 minutes — the vegetables need a head start on the shrimp.",
      "Toss the shrimp with the remaining oil and spices.",
      "Add the shrimp to the pan, spread out, and roast 6–8 minutes. They are done the moment they turn opaque and curl into a loose C. A tight O means overcooked and rubbery.",
      "Squeeze both limes over the pan and toss.",
      "Serve with corn tortillas, over rice, or as-is. Shrimp does not reheat well — if you are prepping ahead, cook the vegetables now and the shrimp fresh.",
    ],
  },
  {
    title: "Baked Chicken Meatballs",
    description:
      "No frying, no splatter. Make a double batch and freeze half.",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 20,
    tags: ["meal-prep", "freezer-friendly", "family-friendly"],
    ingredients: [
      { n: "Ground chicken breast", a: "24 oz (680 g) raw", p: 156.0, c: 0.0, f: 20.0 },
      { n: "Panko breadcrumbs", a: "1/2 cup (30 g)", p: 3.6, c: 21.0, f: 0.6 },
      { n: "Whole egg", a: "1 large (50 g)", p: 6.3, c: 0.4, f: 5.3 },
      { n: "Parmesan, grated", a: "1/4 cup (20 g)", p: 7.6, c: 0.8, f: 5.6 },
      { n: "Garlic & parsley", a: "3 cloves + 1/4 cup (25 g)", p: 0.8, c: 3.5, f: 0.1 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
    ],
    instructions: [
      "Heat the oven to 400°F. Line a sheet pan with parchment and brush it with the oil.",
      "Combine everything in a bowl with your hands. Mix until it JUST comes together — overworking ground meat makes the meatballs bouncy and tight.",
      "Roll into 16 balls, roughly a heaped tablespoon each. Wet hands stop the mix sticking.",
      "Space them on the pan so none are touching. Bake 18–20 minutes until browned and 165°F at the centre.",
      "Four meatballs per serving. Freeze cooked on a tray first, then bag — they will not clump.",
    ],
  },
  {
    title: "Steak Fajita Bowls",
    description:
      "The Sunday version of a Friday meal. Slice against the grain or nothing else you do matters.",
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 15,
    tags: ["high-protein", "meal-prep", "30-minutes"],
    ingredients: [
      { n: "Flank or skirt steak", a: "24 oz (680 g) raw", p: 158.0, c: 0.0, f: 43.0 },
      { n: "Bell peppers & onion, sliced", a: "4 cups (500 g)", p: 5.5, c: 33.0, f: 0.8 },
      { n: "White rice, cooked", a: "3 cups (474 g)", p: 12.9, c: 133.5, f: 1.2 },
      { n: "Olive oil", a: "2 tbsp (27 g)", p: 0.0, c: 0.0, f: 27.0 },
      { n: "Lime & cumin & chili powder", a: "2 limes + 1 tbsp spice (142 g)", p: 1.2, c: 18.0, f: 0.6 },
      { n: "Avocado", a: "1 medium (136 g)", p: 2.7, c: 11.8, f: 19.7 },
    ],
    instructions: [
      "Take the steak out of the fridge 30 minutes before cooking. Cold meat cooks unevenly.",
      "Pat it dry and season heavily with salt, cumin and chili powder.",
      "Heat 1 tbsp oil in a cast-iron skillet until it is just smoking. Sear the steak 4–5 minutes per side for medium-rare, 130–135°F.",
      "Move it to a board and REST 10 MINUTES. Cutting early loses the juice — this is the step people skip and then wonder why it is dry.",
      "While it rests, cook the peppers and onion in the same pan with the remaining oil, 6–7 minutes, until charred at the edges.",
      "Slice the steak thinly ACROSS the grain — look for the direction the fibres run and cut perpendicular to them.",
      "Build the bowls over rice, top with avocado and a squeeze of lime.",
    ],
  },
  {
    title: "Tuna Patties",
    description:
      "Store-cupboard dinner. Nothing needs to be fresh and it is on the table in twenty minutes.",
    servings: 3,
    prepMinutes: 10,
    cookMinutes: 10,
    tags: ["pantry", "20-minutes", "budget", "high-protein"],
    ingredients: [
      { n: "Tuna in water, drained", a: "3 cans (426 g)", p: 99.0, c: 0.0, f: 4.2 },
      { n: "Whole egg", a: "1 large (50 g)", p: 6.3, c: 0.4, f: 5.3 },
      { n: "Panko breadcrumbs", a: "1/2 cup (30 g)", p: 3.6, c: 21.0, f: 0.6 },
      { n: "Red onion & celery, fine dice", a: "1/2 cup (60 g)", p: 0.5, c: 3.5, f: 0.1 },
      { n: "Dijon mustard", a: "1 tbsp (15 g)", p: 0.5, c: 0.9, f: 0.5 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
    ],
    instructions: [
      "Drain the tuna THOROUGHLY — press it against the lid. Wet mix will not hold together and this is the only way these fail.",
      "Combine the tuna, egg, panko, onion, celery, mustard, salt and pepper. Mix until it holds when squeezed.",
      "Form 6 patties about 3/4 inch thick. Chill 10 minutes if you have time; they hold together better.",
      "Heat the oil in a non-stick skillet over medium. Cook 4–5 minutes per side until deeply golden and firm.",
      "Flip once, not repeatedly. Two patties per serving, with a salad or in a bun.",
    ],
  },
  {
    title: "Roasted Sweet Potato & Black Bean Bowls",
    description:
      "The vegetarian entry that still lands 20 g of protein. Good hot, better cold the next day.",
    servings: 4,
    prepMinutes: 12,
    cookMinutes: 30,
    tags: ["vegetarian", "high-fibre", "meal-prep", "budget"],
    ingredients: [
      { n: "Sweet potatoes, cubed", a: "32 oz (907 g)", p: 14.0, c: 182.0, f: 0.6 },
      { n: "Black beans, drained", a: "2 cans (850 g)", p: 48.0, c: 132.0, f: 3.0 },
      { n: "Olive oil", a: "2 tbsp (27 g)", p: 0.0, c: 0.0, f: 27.0 },
      { n: "Cumin, smoked paprika, chili powder", a: "2 tbsp total (16 g)", p: 0.8, c: 8.0, f: 0.8 },
      { n: "Nonfat Greek yogurt (to serve)", a: "1 cup (227 g)", p: 22.6, c: 8.0, f: 0.9 },
      { n: "Lime & cilantro", a: "2 limes + 1/2 cup (150 g)", p: 1.0, c: 15.0, f: 0.3 },
    ],
    instructions: [
      "Heat the oven to 425°F.",
      "Toss the sweet potato cubes with the oil, spices and salt. Spread on a sheet pan in ONE layer — piled up they steam and go soggy.",
      "Roast 25–30 minutes, turning once at the halfway point, until the edges are caramelised and a fork goes through easily.",
      "Warm the beans in a small pan with a splash of water and a pinch of the same spice mix.",
      "Build the bowls: sweet potato, beans, a spoon of yogurt, lime and plenty of cilantro.",
      "The yogurt goes on at serving, not at prep — it splits when reheated.",
    ],
  },
  {
    title: "Chicken & Rice Soup",
    description:
      "One pot, and it uses the shredded chicken from earlier in the library. Freezes in portions.",
    servings: 6,
    prepMinutes: 10,
    cookMinutes: 30,
    tags: ["one-pot", "freezer-friendly", "batch-cook", "comfort"],
    ingredients: [
      { n: "Cooked shredded chicken", a: "20 oz (567 g)", p: 175.0, c: 0.0, f: 20.4 },
      { n: "Long-grain rice, dry", a: "1 cup (185 g)", p: 13.0, c: 148.0, f: 1.1 },
      { n: "Carrot, celery, onion, diced", a: "4 cups (480 g)", p: 5.0, c: 34.0, f: 0.8 },
      { n: "Chicken broth, low sodium", a: "8 cups (1920 ml)", p: 8.0, c: 8.0, f: 2.0 },
      { n: "Olive oil", a: "1 tbsp (13.5 g)", p: 0.0, c: 0.0, f: 13.5 },
      { n: "Bay leaf, thyme, black pepper", a: "1 serving (5 g)", p: 0.2, c: 1.0, f: 0.1 },
    ],
    instructions: [
      "Heat the oil in a large pot over medium. Cook the carrot, celery and onion 6–8 minutes until softened and smelling sweet.",
      "Add the broth, bay leaf and thyme. Bring to a boil.",
      "Stir in the rice, drop to a simmer, and cook 18–20 minutes until the rice is tender.",
      "Add the chicken and heat through, 3–4 minutes. Adding it earlier just makes it stringy.",
      "Fish out the bay leaf. Salt to taste.",
      "If you are freezing it, know that the rice keeps drinking liquid — freeze it slightly soupier than you want it, or cook the rice separately.",
    ],
  },
  {
    title: "Turkey & Veggie Meatloaf Muffins",
    description:
      "Meatloaf that cooks in 25 minutes instead of an hour, and portions itself.",
    servings: 6,
    prepMinutes: 15,
    cookMinutes: 25,
    tags: ["meal-prep", "family-friendly", "freezer-friendly"],
    ingredients: [
      { n: "Ground turkey 93/7", a: "32 oz (907 g) raw", p: 204.8, c: 0.0, f: 63.5 },
      { n: "Rolled oats", a: "3/4 cup (60 g)", p: 8.0, c: 40.5, f: 4.2 },
      { n: "Whole eggs", a: "2 large (100 g)", p: 12.6, c: 0.7, f: 10.6 },
      { n: "Onion, carrot & zucchini, grated", a: "2 cups (250 g)", p: 3.5, c: 18.0, f: 0.5 },
      { n: "Tomato paste", a: "3 tbsp (48 g)", p: 2.0, c: 9.0, f: 0.3 },
      { n: "Worcestershire & garlic powder", a: "1 tbsp + 2 tsp (20 g)", p: 0.3, c: 4.0, f: 0.1 },
    ],
    instructions: [
      "Heat the oven to 375°F. Grease a 12-cup muffin tin.",
      "SQUEEZE the grated zucchini in a clean towel until no more water comes out. Skip this and the mix will be wet and the muffins will steam.",
      "Mix everything together by hand until just combined. Do not knead it.",
      "Divide between the 12 cups, mounding slightly. Brush the tops with a little extra tomato paste if you like a glaze.",
      "Bake 23–25 minutes to 165°F internal. They should pull away from the sides slightly.",
      "Rest 5 minutes in the tin before lifting them out. Two per serving.",
    ],
  },
  {
    title: "Cottage Cheese & Berry Protein Pancakes",
    description:
      "A weekend breakfast that still hits 30 g of protein a serving. The batter is blender-only.",
    servings: 2,
    prepMinutes: 5,
    cookMinutes: 12,
    tags: ["vegetarian", "high-protein", "family-friendly", "20-minutes"],
    ingredients: [
      { n: "2% cottage cheese", a: "1 cup (226 g)", p: 24.0, c: 8.2, f: 5.0 },
      { n: "Rolled oats", a: "1 cup (80 g)", p: 10.6, c: 54.0, f: 5.6 },
      { n: "Whole eggs", a: "3 large (150 g)", p: 18.9, c: 1.1, f: 15.9 },
      { n: "Baking powder & vanilla", a: "1 tsp each (9 g)", p: 0.0, c: 2.0, f: 0.0 },
      { n: "Blueberries", a: "1 cup (148 g)", p: 1.1, c: 21.4, f: 0.4 },
    ],
    instructions: [
      "Blend the cottage cheese, oats, eggs, baking powder and vanilla until completely smooth — about 45 seconds. Any oat texture left will still be there in the pancake.",
      "Let the batter STAND 5 minutes. The oats absorb liquid and it thickens; skipping this gives you thin, spreading pancakes.",
      "Heat a non-stick pan over medium-LOW. These have more protein and less flour than normal pancakes, so they scorch on a hot pan before the middle sets.",
      "Pour 1/4-cup pancakes. Scatter berries on top of each while the surface is still wet.",
      "Cook 2–3 minutes, until bubbles form and the edges look dry, then flip once and cook 1–2 minutes more.",
      "Makes about 8. Four per serving.",
    ],
  },
  {
    title: "Garlic Butter Cod with Green Beans",
    description:
      "One skillet, twelve minutes, and cod is the most forgiving white fish there is.",
    servings: 4,
    prepMinutes: 8,
    cookMinutes: 14,
    tags: ["one-pan", "lower-fat", "20-minutes", "gluten-free"],
    ingredients: [
      { n: "Cod fillets", a: "28 oz (794 g) raw", p: 174.0, c: 0.0, f: 7.2 },
      { n: "Green beans, trimmed", a: "20 oz (567 g)", p: 10.2, c: 39.7, f: 0.6 },
      { n: "Butter", a: "2 tbsp (28 g)", p: 0.2, c: 0.0, f: 23.0 },
      { n: "Garlic, minced", a: "4 cloves (12 g)", p: 0.8, c: 4.0, f: 0.1 },
      { n: "Lemon", a: "1 whole (58 g)", p: 0.4, c: 5.4, f: 0.2 },
    ],
    instructions: [
      "Pat the cod completely dry and season both sides. Cod holds a lot of water and wet fish will not sear.",
      "Melt half the butter in a large skillet over medium-high. Lay the fillets in and do not move them for 4 minutes.",
      "Flip once, cook 3–4 minutes more, until the flesh turns opaque and flakes at the thickest point. Move to a plate.",
      "Add the rest of the butter and the garlic to the pan. Cook 30 seconds — garlic burns in a hot pan faster than you expect, so keep it moving.",
      "Add the green beans and 2 tbsp water. Cover and cook 4–5 minutes until bright green and crisp-tender.",
      "Return the cod to warm through, squeeze the lemon over, and serve straight from the pan.",
    ],
  },
  {
    title: "Protein Energy Bites",
    description:
      "No baking, no pan. Ten minutes of rolling gets you two weeks of snacks.",
    servings: 8,
    prepMinutes: 10,
    cookMinutes: 0,
    tags: ["no-cook", "make-ahead", "portable", "vegetarian"],
    ingredients: [
      { n: "Rolled oats", a: "1.5 cups (120 g)", p: 15.8, c: 81.0, f: 8.4 },
      { n: "Natural peanut butter", a: "1/2 cup (128 g)", p: 31.0, c: 31.0, f: 64.0 },
      { n: "Whey protein, vanilla", a: "2 scoops (62 g)", p: 48.0, c: 6.0, f: 2.0 },
      { n: "Honey", a: "1/3 cup (113 g)", p: 0.1, c: 92.0, f: 0.0 },
      { n: "Mini dark chocolate chips", a: "1/4 cup (43 g)", p: 1.7, c: 25.0, f: 13.0 },
    ],
    instructions: [
      "Stir the oats and protein powder together first, dry. Adding powder to a wet mix leaves lumps you cannot break up later.",
      "Add the peanut butter and honey and mix hard. It will look too dry for a minute — keep going before adding anything.",
      "If it genuinely will not hold, add water 1 tsp at a time. Adding more honey instead is the easy mistake and it costs 60 kcal a spoon.",
      "Fold in the chocolate chips.",
      "Roll into 24 balls. Chill 30 minutes to firm up.",
      "Three bites per serving. Keeps 2 weeks refrigerated, 3 months frozen.",
    ],
  },
  {
    title: "Chicken Fried Rice, Lightened",
    description:
      "Built for leftovers — day-old rice, cooked chicken, whatever vegetables are going soft.",
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 12,
    tags: ["one-pan", "leftovers", "budget", "30-minutes"],
    ingredients: [
      { n: "Cooked chicken breast, diced", a: "16 oz (454 g)", p: 140.0, c: 0.0, f: 16.3 },
      { n: "Cooked white rice, day-old", a: "4 cups (632 g)", p: 17.2, c: 178.0, f: 1.6 },
      { n: "Whole eggs", a: "3 large (150 g)", p: 18.9, c: 1.1, f: 15.9 },
      { n: "Frozen peas & carrots", a: "2 cups (280 g)", p: 8.0, c: 32.0, f: 0.8 },
      { n: "Low-sodium soy sauce", a: "3 tbsp (48 g)", p: 3.0, c: 3.0, f: 0.0 },
      { n: "Sesame oil", a: "1 tbsp (13.6 g)", p: 0.0, c: 0.0, f: 13.6 },
    ],
    instructions: [
      "Use rice that has been refrigerated overnight. Fresh rice is too wet and turns to porridge — this is the single thing that decides whether fried rice works.",
      "Heat a large skillet or wok over high with half the sesame oil.",
      "Scramble the eggs quickly, 60 seconds, then move them to a plate.",
      "Add the rest of the oil, then the peas and carrots. Cook 2 minutes.",
      "Add the rice and press it into the pan. Leave it 2 minutes without stirring to get some crisp on the bottom, then toss.",
      "Return the chicken and egg, add the soy sauce, and toss 2 minutes until everything is hot through.",
      "Taste before adding more soy — the rice carries more salt than it seems.",
    ],
  },
];
