// GENERATED — do not hand-edit. Regenerate with scripts/food-unit-defaults.sql.
//
// THE UNIT A FOOD DEFAULTS TO IS NOT A GUESS.
//
// Butter measures in tablespoons. That was reported three times, and each fix
// tried to derive it: read the catalogue row (only "100 g" and "1 oz"), borrow
// a measure from a similarly-named row (gave a cookie a "bar"), rank candidates
// by name overlap. Every one of those is the app inventing an answer from a
// 574,000-row import that is mostly junk.
//
// It never had to. Dustin has written the unit down once per food, every time
// he programmed a meal: meal_items.unit. "butter" -> "tbsp", eight times.
// "olive oil" -> "tsp", fifty-two times. This map is that record, and it is
// consulted BEFORE anything is derived from the catalogue.
//
// A food he has never programmed is not in here and falls through to the
// catalogue as before. That is the honest answer: the app knows his foods
// because he told it, and does not pretend to know the rest.
//
// 251 foods, from 253 distinct (food, unit) pairs.

const HIS_UNIT = new Map<string, string>([
  ["2 milk", "oz"], // 2
  ["93 7 ground beef", "g"], // 1
  ["93 7 ground beef cooked", "g"], // 1
  ["93 7 lean ground beef burger patty", "oz"], // 2
  ["almond butter", "tbsp"], // 8
  ["almond butter level measured", "tbsp"], // 1
  ["almond milk unsweetened", "cup"], // 4
  ["almonds", "each"], // 33
  ["animal isolate loaded whey", "scoop"], // 4
  ["animal isolate loaded whey creamy vanilla", "scoop"], // 1
  ["apple", "medium"], // 21
  ["apple or orange", "medium"], // 6
  ["asparagus", "oz"], // 5
  ["avocado", "oz"], // 9
  ["avocado oil", "tbsp"], // 10
  ["avocado oil for cooking", "tbsp"], // 1
  ["avocados", "oz"], // 1
  ["baby spinach", "g"], // 6
  ["bacon egg bites", "serving"], // 1
  ["bagel", "whole"], // 2
  ["baked or broiled fish", "oz"], // 2
  ["banana", "medium"], // 1
  ["banana medium", "each"], // 2
  ["banana small", "medium"], // 7
  ["basmati rice", "g"], // 2
  ["beef gravy", "cup"], // 3
  ["beef or pork", "oz"], // 1
  ["beef stick", "stick"], // 1
  ["beef stir fry noodles", "g"], // 2
  ["bell peppers onion garlic", "serving"], // 6
  ["bell peppers onion garlic unlimited", "serving"], // 6
  ["bell peppers onion unlimited", "serving"], // 4
  ["bell peppers onion zucchini unlimited", "serving"], // 6
  ["blueberries", "cup"], // 14
  ["blueberries fresh", "g"], // 2
  ["blueberries optional blended", "cup"], // 2
  ["bob evans liquid egg whites", "fl oz"], // 2
  ["boiled egg whole", "each"], // 12
  ["boiled eggs whole", "each"], // 26
  ["broccoli", "cup"], // 2
  ["broccoli asparagus green beans", "cup"], // 2
  ["broccoli asparagus or green beans", "cup"], // 16
  ["broccoli steamed", "g"], // 2
  ["built puff protein bar", "bar"], // 2
  ["bulgur cooked", "oz"], // 1
  ["butter", "tbsp"], // 8
  ["butternut squash cooked", "cup"], // 6
  ["canned tuna in water", "oz"], // 12
  ["carrots cooked", "g"], // 8
  ["celery sticks", "serving"], // 14
  ["celery sticks unlimited", "serving"], // 6
  ["cherry tomatoes", "g"], // 6
  ["chia seeds", "tbsp"], // 1
  ["chicken breast", "oz"], // 7
  ["chicken breast cold sliced", "oz"], // 1
  ["chicken breast cooked", "oz"], // 15
  ["chicken or white fish", "g"], // 2
  ["chicken thigh", "oz"], // 1
  ["chicken thigh boneless skinless cooked", "oz"], // 4
  ["chicken thigh cooked", "oz"], // 6
  ["chicken thigh pulled", "oz"], // 1
  ["chicken thigh pulled cooked", "oz"], // 18
  ["chicken thighs drumsticks", "oz"], // 1
  ["chili crisp", "tsp"], // 4
  ["chuck roast cooked", "g"], // 4
  ["coffee", "cup"], // 2
  ["cold salmon or tuna", "oz"], // 13
  ["cooking oil or butter", "tbsp"], // 1
  ["corn", "cup"], // 1
  ["cream of rice", "g"], // 2
  ["cream of rice dry", "cup"], // 1
  ["cream of rice dry weight", "g"], // 2
  ["cream of rice or rolled oats", "g"], // 2
  ["cream of wheat dry", "g"], // 7
  ["cucumber tomato salad", "cup"], // 6
  ["dannon oikos triple zero strawberry", "container"], // 1
  ["dave s killer bread plain bagel", "bagel"], // 2
  ["egg white", "large"], // 5
  ["egg whites", "g"], // 7
  ["egg whites carton", "fl oz"], // 12
  ["egg whites liquid", "cup"], // 2
  ["egg whole", "large"], // 5
  ["eggs large", "whole"], // 2
  ["fage 2 greek yogurt", "g"], // 4
  ["fiber one soft baked bars cinnamon coffee cake", "bar"], // 1
  ["filipino beef mechado", "g"], // 1
  ["free veggies", "serving"], // 12
  ["fried eggs", "large"], // 6
  ["frozen blueberries", "cup"], // 1
  ["frozen mixed berries", "cup"], // 1
  ["fruit", "g"], // 2
  ["fuji apple", "g"], // 4
  ["ghirardelli 60 cacao dark chocolate chips", "g"], // 2
  ["goya coconut water", "oz"], // 6
  ["granola", "cup"], // 1
  ["grapes", "cup"], // 20
  ["greek yogurt nonfat", "cup"], // 1
  ["greek yogurt nonfat plain", "cup"], // 1
  ["green beans", "g"], // 1
  ["green bell pepper", "g"], // 1
  ["green lentils cooked", "cup"], // 7
  ["green string beans", "oz"], // 2
  ["ground beef 85 15 cooked", "g"], // 1
  ["ground beef 90 10", "oz cooked"], // 1
  ["ground beef 90 lean 10 fat", "oz"], // 2
  ["ground beef 93 7 cooked", "oz"], // 1
  ["ground venison 93 7", "oz"], // 1
  ["halo top caramel cookie crunch ice cream", "g"], // 4
  ["ham whole cured", "oz"], // 1
  ["hard boiled eggs", "large"], // 30
  ["hillshire farms turkey breast", "g"], // 2
  ["homemade sourdough", "g"], // 16
  ["honey", "g"], // 1
  ["infinis cream of rice", "scoop"], // 9
  ["jasmine rice cooked", "g"], // 2
  ["jif peanut butter", "tbsp"], // 2
  ["jocko molk whey", "scoop"], // 4
  ["kerrygold butter", "tsp"], // 1
  ["kerrygold irish butter", "g"], // 2
  ["kirkland thin sliced chicken breast", "g"], // 4
  ["kirkland ultra filtered milk", "cup"], // 2
  ["kirkland wild blueberries frozen", "g"], // 4
  ["lean beef 93 7", "g"], // 4
  ["lean ground beef 90 10", "oz"], // 1
  ["lean ground beef 93 7", "oz"], // 3
  ["lean ground beef 93 7 cooked", "oz"], // 31
  ["lean turkey breakfast sausage", "oz"], // 2
  ["light greens", "serving"], // 1
  ["light mixed greens", "serving"], // 1
  ["light mixed greens unlimited", "serving"], // 6
  ["light vinaigrette", "tbsp"], // 2
  ["liquid egg whites", "oz"], // 7
  ["love crunch dark chocolate blueberry granola", "g"], // 6
  ["low fat cottage cheese", "cup"], // 7
  ["low fat greek yogurt", "cup"], // 13
  ["lumpia", "piece"], // 1
  ["matcha powder", "g"], // 2
  ["meijer ground bison", "oz"], // 1
  ["metagenics protein", "serving"], // 2
  ["mini bagel", "mini bagel"], // 1
  ["minute rice cooked", "cup"], // 2
  ["mission spinach tortilla wrap", "tortilla"], // 4
  ["mixed berries", "cup"], // 98
  ["nature s own brioche hamburger bun", "bun"], // 2
  ["nonfat greek yogurt", "cup"], // 1
  ["now sports carbo gain", "cup"], // 2
  ["nurri chocolate protein shake", "can"], // 4
  ["nurri shake", "shake"], // 1
  ["oats dry", "g"], // 1
  ["oats dry weight", "g"], // 4
  ["oikos triple zero", "cup"], // 3
  ["oikos triple zero greek yogurt", "cup"], // 1
  ["oikos triple zero greek yogurt plain", "g"], // 2
  ["oikos triple zero vanilla yogurt", "g"], // 4
  ["olive oil", "tsp"], // 52
  ["olive oil for frying", "tsp"], // 1
  ["onions", "oz"], // 2
  ["organised nutrition pouch", "g"], // 2
  ["pasta", "cup"], // 2
  ["pasta cooked", "cup"], // 12
  ["pasta sauce", "cup"], // 1
  ["pe science protein powder", "g"], // 2
  ["peanut butter", "tbsp"], // 1
  ["peas", "cup"], // 1
  ["philadelphia cream cheese spread", "g"], // 6
  ["plant protein", "scoop"], // 1
  ["pork tenderloin", "oz"], // 3
  ["pork tenderloin cooked", "oz"], // 30
  ["power crunch protein energy bar", "bar"], // 2
  ["premier protein shake", "bottle"], // 1
  ["pro jym whey protein", "scoop"], // 1
  ["protein pasta", "oz dry"], // 1
  ["protein powder", "scoop"], // 1
  ["protein powder vanilla unflavored", "scoop"], // 1
  ["pulled chicken thigh cold", "oz"], // 1
  ["quaker chocolate rice cake", "cake"], // 2
  ["quaker chocolate rice cakes", "each"], // 1
  ["quaker white cheddar rice cakes", "cake"], // 1
  ["quest protein chips loaded taco", "bag"], // 2
  ["red kidney beans with salt cooked boiled", "oz"], // 3
  ["rice cake", "cake"], // 1
  ["rice cakes", "cakes"], // 1
  ["rice cakes plain", "cakes"], // 1
  ["rice cooked", "cup"], // 1
  ["roasted asparagus or zucchini unlimited", "serving"], // 6
  ["roasted beets", "cup"], // 7
  ["roasted carrots and celery", "serving"], // 6
  ["roasted carrots and green beans", "serving"], // 6
  ["roasted carrots green beans unlimited", "serving"], // 12
  ["roasted carrots zucchini unlimited", "serving"], // 12
  ["roasted green beans carrots unlimited", "serving"], // 4
  ["roasted veggies", "serving"], // 1
  ["rolled oats dry", "g"], // 14
  ["sabra roasted pepper hummus", "g"], // 4
  ["salmon", "oz"], // 5
  ["salmon cooked", "oz"], // 39
  ["sardines in water canned", "cans"], // 6
  ["sargento ultra thin sharp cheddar", "slice"], // 2
  ["sf greek yogurt", "cup"], // 34
  ["sfh whey", "scoop"], // 2
  ["shrimp", "oz"], // 1
  ["shrimp cooked", "oz"], // 6
  ["side salad", "serving"], // 1
  ["side salad unlimited", "serving"], // 6
  ["sirloin steak cooked", "g"], // 1
  ["sliced carrots", "serving"], // 1
  ["sliced carrots unlimited", "serving"], // 6
  ["sliced cucumber", "serving"], // 7
  ["sliced cucumber side", "serving"], // 12
  ["sliced cucumber unlimited", "serving"], // 6
  ["sourdough bread", "g"], // 2
  ["spinach", "cup"], // 2
  ["steamed asparagus or broccoli", "serving"], // 6
  ["steamed asparagus or broccoli unlimited", "serving"], // 6
  ["steamed broccoli or asparagus", "serving"], // 6
  ["steamed broccoli or asparagus unlimited", "serving"], // 6
  ["steel cut oats dry", "cup"], // 2
  ["strawberries", "oz"], // 3
  ["sweet potato", "oz"], // 4
  ["sweet potato cooked", "g"], // 38
  ["sweet potato diced cooked", "g"], // 6
  ["thai cucumber salad", "g"], // 2
  ["thomas cinnamon swirl bagel", "bagel"], // 8
  ["tilapia cooked", "oz cooked"], // 1
  ["tomatoes", "oz"], // 2
  ["top sirloin trimmed cooked", "oz"], // 4
  ["turkey bacon", "slices"], // 7
  ["unsweetened almond milk", "oz"], // 7
  ["vegetables unlimited", "serving"], // 35
  ["veggie", "cup"], // 1
  ["walnuts", "halves"], // 14
  ["water", "oz"], // 2
  ["whey protein", "scoop"], // 12
  ["whey protein shake", "scoop"], // 2
  ["white fish tilapia cooked", "g"], // 1
  ["white mushroom", "g"], // 1
  ["white onion", "g"], // 1
  ["white potato", "g"], // 2
  ["white potato cooked", "g"], // 13
  ["white potato roasted", "g"], // 28
  ["white rice", "cup"], // 15
  ["white rice cooked", "cup"], // 82
  ["white rice long grain cooked", "oz"], // 5
  ["whole eggs", "large"], // 28
  ["whole eggs fried", "large"], // 6
  ["whole eggs hard boiled", "whole"], // 1
  ["whole wheat crackers", "crackers"], // 7
  ["wilde smoked gouda protein crackers", "g"], // 6
  ["yasso bar", "bar"], // 1
  ["yasso greek yogurt bar", "bar"], // 2
  ["zucchini", "oz"], // 2
]);

/** Normalises a food name to the key shape used above. */
export function unitKey(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The unit Dustin programmes this food in, or null if he never has.
 *
 * Three matches, in order, each narrower than a plain substring search:
 *
 *  1. The whole name. "sweet potato (cooked)" is its own entry and is grams,
 *     while plain "sweet potato" is ounces, so the fuller name wins first.
 *  2. The name up to its first comma or bracket. USDA writes a food head-first
 *     as "<food>, <qualifier>", so "Butter, salted" reduces to "butter".
 *  3. The LAST significant word of that head segment. English food names are
 *     head-final, so a brand's "Kerrygold Pure Irish Butter" is butter. This is
 *     the case that made the first version useless in practice: the catalogue
 *     almost never calls a food by its bare name, and matching only the front
 *     of the string found none of his real foods.
 *
 * A word-PREFIX rule was tried before this and was wrong in the other
 * direction: "Butter Pecan Ice Cream" starts with "butter" and is not eaten by
 * the tablespoon. Head-final is what gets both right — that name ends in
 * "cream", which he has never programmed, so it correctly answers nothing.
 */
export function unitHeUses(name: string): string | null {
  const whole = unitKey(name);
  if (!whole) return null;
  const exact = HIS_UNIT.get(whole);
  if (exact) return exact;
  const head = unitKey((name || "").split(/[,(\[]/)[0]);
  if (!head) return null;
  const byHead = HIS_UNIT.get(head);
  if (byHead) return byHead;
  // Longest matching SUFFIX. One word is not enough: "Extra Virgin Olive Oil"
  // ends in "oil", but the food he programmes is "olive oil" (teaspoons), and
  // plain oil is not in his record at all. Longest wins, so the most specific
  // food he actually uses is the one that answers.
  const words = head.split(" ").filter((w) => w.length >= 3);
  for (let i = 0; i < words.length; i++) {
    const suffix = words.slice(i).join(" ");
    const hit = HIS_UNIT.get(suffix);
    if (hit) return hit;
  }
  return null;
}

/** Every food he programmes, for tests and for the catalogue audit. */
export function knownFoods(): string[] {
  return [...HIS_UNIT.keys()];
}
