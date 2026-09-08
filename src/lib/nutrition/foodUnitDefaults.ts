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

/**
 * Words that describe a food without changing what it is. Only these may
 * follow the food name and still let it match - see unitHeUses.
 */
const QUALIFIER = new Set([
  "salted","unsalted","organic","natural","pure","original","plain","light","lite",
  "fresh","raw","cooked","uncooked","whole","half","sliced","shredded","chopped","diced",
  "ground","roasted","smoked","grilled","baked","fried","boiled","steamed","dried","frozen",
  "canned","sweet","sweetened","unsweetened","salt","free","low","reduced","fat","lean",
  "extra","virgin","premium","classic","style","traditional","homemade","imported",
  "mini","small","medium","large","jumbo","regular","thick","thin","creamy","crunchy",
  "smooth","soft","hard","mild","sharp","aged","cold","hot","warm","new","old","real",
  "brand","value","select","choice","grade","pack","size","each","spread","bulk",
  "pressed","unfiltered","filtered","cured","brewed","toasted","seasoned","flavored",
  "flavoured","sea","country","farm","pasture","grass","fed","best","fine","good",
]);

/** A unit he programmed, and how many times he programmed it that way. */
interface HisUnit { unit: string; uses: number; }

const HIS_UNIT = new Map<string, HisUnit>([
  ["2 milk", { unit: "oz", uses: 2 }],
  ["93 7 ground beef", { unit: "g", uses: 1 }],
  ["93 7 ground beef cooked", { unit: "g", uses: 1 }],
  ["93 7 lean ground beef burger patty", { unit: "oz", uses: 2 }],
  ["almond butter", { unit: "tbsp", uses: 8 }],
  ["almond butter level measured", { unit: "tbsp", uses: 1 }],
  ["almond milk unsweetened", { unit: "cup", uses: 4 }],
  ["almonds", { unit: "each", uses: 33 }],
  ["animal isolate loaded whey", { unit: "scoop", uses: 4 }],
  ["animal isolate loaded whey creamy vanilla", { unit: "scoop", uses: 1 }],
  ["apple", { unit: "medium", uses: 21 }],
  ["apple or orange", { unit: "medium", uses: 6 }],
  ["asparagus", { unit: "oz", uses: 5 }],
  ["avocado", { unit: "oz", uses: 9 }],
  ["avocado oil", { unit: "tbsp", uses: 10 }],
  ["avocado oil for cooking", { unit: "tbsp", uses: 1 }],
  ["avocados", { unit: "oz", uses: 1 }],
  ["baby spinach", { unit: "g", uses: 6 }],
  ["bacon egg bites", { unit: "serving", uses: 1 }],
  ["bagel", { unit: "whole", uses: 2 }],
  ["baked or broiled fish", { unit: "oz", uses: 2 }],
  ["banana", { unit: "medium", uses: 1 }],
  ["banana medium", { unit: "each", uses: 2 }],
  ["banana small", { unit: "medium", uses: 7 }],
  ["basmati rice", { unit: "g", uses: 2 }],
  ["beef gravy", { unit: "cup", uses: 3 }],
  ["beef or pork", { unit: "oz", uses: 1 }],
  ["beef stick", { unit: "stick", uses: 1 }],
  ["beef stir fry noodles", { unit: "g", uses: 2 }],
  ["bell peppers onion garlic", { unit: "serving", uses: 6 }],
  ["bell peppers onion garlic unlimited", { unit: "serving", uses: 6 }],
  ["bell peppers onion unlimited", { unit: "serving", uses: 4 }],
  ["bell peppers onion zucchini unlimited", { unit: "serving", uses: 6 }],
  ["blueberries", { unit: "cup", uses: 14 }],
  ["blueberries fresh", { unit: "g", uses: 2 }],
  ["blueberries optional blended", { unit: "cup", uses: 2 }],
  ["bob evans liquid egg whites", { unit: "fl oz", uses: 2 }],
  ["boiled egg whole", { unit: "each", uses: 12 }],
  ["boiled eggs whole", { unit: "each", uses: 26 }],
  ["broccoli", { unit: "cup", uses: 2 }],
  ["broccoli asparagus green beans", { unit: "cup", uses: 2 }],
  ["broccoli asparagus or green beans", { unit: "cup", uses: 16 }],
  ["broccoli steamed", { unit: "g", uses: 2 }],
  ["built puff protein bar", { unit: "bar", uses: 2 }],
  ["bulgur cooked", { unit: "oz", uses: 1 }],
  ["butter", { unit: "tbsp", uses: 8 }],
  ["butternut squash cooked", { unit: "cup", uses: 6 }],
  ["canned tuna in water", { unit: "oz", uses: 12 }],
  ["carrots cooked", { unit: "g", uses: 8 }],
  ["celery sticks", { unit: "serving", uses: 14 }],
  ["celery sticks unlimited", { unit: "serving", uses: 6 }],
  ["cherry tomatoes", { unit: "g", uses: 6 }],
  ["chia seeds", { unit: "tbsp", uses: 1 }],
  ["chicken breast", { unit: "oz", uses: 7 }],
  ["chicken breast cold sliced", { unit: "oz", uses: 1 }],
  ["chicken breast cooked", { unit: "oz", uses: 15 }],
  ["chicken or white fish", { unit: "g", uses: 2 }],
  ["chicken thigh", { unit: "oz", uses: 1 }],
  ["chicken thigh boneless skinless cooked", { unit: "oz", uses: 4 }],
  ["chicken thigh cooked", { unit: "oz", uses: 6 }],
  ["chicken thigh pulled", { unit: "oz", uses: 1 }],
  ["chicken thigh pulled cooked", { unit: "oz", uses: 18 }],
  ["chicken thighs drumsticks", { unit: "oz", uses: 1 }],
  ["chili crisp", { unit: "tsp", uses: 4 }],
  ["chuck roast cooked", { unit: "g", uses: 4 }],
  ["coffee", { unit: "cup", uses: 2 }],
  ["cold salmon or tuna", { unit: "oz", uses: 13 }],
  ["cooking oil or butter", { unit: "tbsp", uses: 1 }],
  ["corn", { unit: "cup", uses: 1 }],
  ["cream of rice", { unit: "g", uses: 2 }],
  ["cream of rice dry", { unit: "cup", uses: 1 }],
  ["cream of rice dry weight", { unit: "g", uses: 2 }],
  ["cream of rice or rolled oats", { unit: "g", uses: 2 }],
  ["cream of wheat dry", { unit: "g", uses: 7 }],
  ["cucumber tomato salad", { unit: "cup", uses: 6 }],
  ["dannon oikos triple zero strawberry", { unit: "container", uses: 1 }],
  ["dave s killer bread plain bagel", { unit: "bagel", uses: 2 }],
  ["egg white", { unit: "large", uses: 5 }],
  ["egg whites", { unit: "g", uses: 7 }],
  ["egg whites carton", { unit: "fl oz", uses: 12 }],
  ["egg whites liquid", { unit: "cup", uses: 2 }],
  ["egg whole", { unit: "large", uses: 5 }],
  ["eggs large", { unit: "whole", uses: 2 }],
  ["fage 2 greek yogurt", { unit: "g", uses: 4 }],
  ["fiber one soft baked bars cinnamon coffee cake", { unit: "bar", uses: 1 }],
  ["filipino beef mechado", { unit: "g", uses: 1 }],
  ["free veggies", { unit: "serving", uses: 12 }],
  ["fried eggs", { unit: "large", uses: 6 }],
  ["frozen blueberries", { unit: "cup", uses: 1 }],
  ["frozen mixed berries", { unit: "cup", uses: 1 }],
  ["fruit", { unit: "g", uses: 2 }],
  ["fuji apple", { unit: "g", uses: 4 }],
  ["ghirardelli 60 cacao dark chocolate chips", { unit: "g", uses: 2 }],
  ["goya coconut water", { unit: "oz", uses: 6 }],
  ["granola", { unit: "cup", uses: 1 }],
  ["grapes", { unit: "cup", uses: 20 }],
  ["greek yogurt nonfat", { unit: "cup", uses: 1 }],
  ["greek yogurt nonfat plain", { unit: "cup", uses: 1 }],
  ["green beans", { unit: "g", uses: 1 }],
  ["green bell pepper", { unit: "g", uses: 1 }],
  ["green lentils cooked", { unit: "cup", uses: 7 }],
  ["green string beans", { unit: "oz", uses: 2 }],
  ["ground beef 85 15 cooked", { unit: "g", uses: 1 }],
  ["ground beef 90 10", { unit: "oz cooked", uses: 1 }],
  ["ground beef 90 lean 10 fat", { unit: "oz", uses: 2 }],
  ["ground beef 93 7 cooked", { unit: "oz", uses: 1 }],
  ["ground venison 93 7", { unit: "oz", uses: 1 }],
  ["halo top caramel cookie crunch ice cream", { unit: "g", uses: 4 }],
  ["ham whole cured", { unit: "oz", uses: 1 }],
  ["hard boiled eggs", { unit: "large", uses: 30 }],
  ["hillshire farms turkey breast", { unit: "g", uses: 2 }],
  ["homemade sourdough", { unit: "g", uses: 16 }],
  ["honey", { unit: "g", uses: 1 }],
  ["infinis cream of rice", { unit: "scoop", uses: 9 }],
  ["jasmine rice cooked", { unit: "g", uses: 2 }],
  ["jif peanut butter", { unit: "tbsp", uses: 2 }],
  ["jocko molk whey", { unit: "scoop", uses: 4 }],
  ["kerrygold butter", { unit: "tsp", uses: 1 }],
  ["kerrygold irish butter", { unit: "g", uses: 2 }],
  ["kirkland thin sliced chicken breast", { unit: "g", uses: 4 }],
  ["kirkland ultra filtered milk", { unit: "cup", uses: 2 }],
  ["kirkland wild blueberries frozen", { unit: "g", uses: 4 }],
  ["lean beef 93 7", { unit: "g", uses: 4 }],
  ["lean ground beef 90 10", { unit: "oz", uses: 1 }],
  ["lean ground beef 93 7", { unit: "oz", uses: 3 }],
  ["lean ground beef 93 7 cooked", { unit: "oz", uses: 31 }],
  ["lean turkey breakfast sausage", { unit: "oz", uses: 2 }],
  ["light greens", { unit: "serving", uses: 1 }],
  ["light mixed greens", { unit: "serving", uses: 1 }],
  ["light mixed greens unlimited", { unit: "serving", uses: 6 }],
  ["light vinaigrette", { unit: "tbsp", uses: 2 }],
  ["liquid egg whites", { unit: "oz", uses: 7 }],
  ["love crunch dark chocolate blueberry granola", { unit: "g", uses: 6 }],
  ["low fat cottage cheese", { unit: "cup", uses: 7 }],
  ["low fat greek yogurt", { unit: "cup", uses: 13 }],
  ["lumpia", { unit: "piece", uses: 1 }],
  ["matcha powder", { unit: "g", uses: 2 }],
  ["meijer ground bison", { unit: "oz", uses: 1 }],
  ["metagenics protein", { unit: "serving", uses: 2 }],
  ["mini bagel", { unit: "mini bagel", uses: 1 }],
  ["minute rice cooked", { unit: "cup", uses: 2 }],
  ["mission spinach tortilla wrap", { unit: "tortilla", uses: 4 }],
  ["mixed berries", { unit: "cup", uses: 98 }],
  ["nature s own brioche hamburger bun", { unit: "bun", uses: 2 }],
  ["nonfat greek yogurt", { unit: "cup", uses: 1 }],
  ["now sports carbo gain", { unit: "cup", uses: 2 }],
  ["nurri chocolate protein shake", { unit: "can", uses: 4 }],
  ["nurri shake", { unit: "shake", uses: 1 }],
  ["oats dry", { unit: "g", uses: 1 }],
  ["oats dry weight", { unit: "g", uses: 4 }],
  ["oikos triple zero", { unit: "cup", uses: 3 }],
  ["oikos triple zero greek yogurt", { unit: "cup", uses: 1 }],
  ["oikos triple zero greek yogurt plain", { unit: "g", uses: 2 }],
  ["oikos triple zero vanilla yogurt", { unit: "g", uses: 4 }],
  ["olive oil", { unit: "tsp", uses: 52 }],
  ["olive oil for frying", { unit: "tsp", uses: 1 }],
  ["onions", { unit: "oz", uses: 2 }],
  ["organised nutrition pouch", { unit: "g", uses: 2 }],
  ["pasta", { unit: "cup", uses: 2 }],
  ["pasta cooked", { unit: "cup", uses: 12 }],
  ["pasta sauce", { unit: "cup", uses: 1 }],
  ["pe science protein powder", { unit: "g", uses: 2 }],
  ["peanut butter", { unit: "tbsp", uses: 1 }],
  ["peas", { unit: "cup", uses: 1 }],
  ["philadelphia cream cheese spread", { unit: "g", uses: 6 }],
  ["plant protein", { unit: "scoop", uses: 1 }],
  ["pork tenderloin", { unit: "oz", uses: 3 }],
  ["pork tenderloin cooked", { unit: "oz", uses: 30 }],
  ["power crunch protein energy bar", { unit: "bar", uses: 2 }],
  ["premier protein shake", { unit: "bottle", uses: 1 }],
  ["pro jym whey protein", { unit: "scoop", uses: 1 }],
  ["protein pasta", { unit: "oz dry", uses: 1 }],
  ["protein powder", { unit: "scoop", uses: 1 }],
  ["protein powder vanilla unflavored", { unit: "scoop", uses: 1 }],
  ["pulled chicken thigh cold", { unit: "oz", uses: 1 }],
  ["quaker chocolate rice cake", { unit: "cake", uses: 2 }],
  ["quaker chocolate rice cakes", { unit: "each", uses: 1 }],
  ["quaker white cheddar rice cakes", { unit: "cake", uses: 1 }],
  ["quest protein chips loaded taco", { unit: "bag", uses: 2 }],
  ["red kidney beans with salt cooked boiled", { unit: "oz", uses: 3 }],
  ["rice cake", { unit: "cake", uses: 1 }],
  ["rice cakes", { unit: "cakes", uses: 1 }],
  ["rice cakes plain", { unit: "cakes", uses: 1 }],
  ["rice cooked", { unit: "cup", uses: 1 }],
  ["roasted asparagus or zucchini unlimited", { unit: "serving", uses: 6 }],
  ["roasted beets", { unit: "cup", uses: 7 }],
  ["roasted carrots and celery", { unit: "serving", uses: 6 }],
  ["roasted carrots and green beans", { unit: "serving", uses: 6 }],
  ["roasted carrots green beans unlimited", { unit: "serving", uses: 12 }],
  ["roasted carrots zucchini unlimited", { unit: "serving", uses: 12 }],
  ["roasted green beans carrots unlimited", { unit: "serving", uses: 4 }],
  ["roasted veggies", { unit: "serving", uses: 1 }],
  ["rolled oats dry", { unit: "g", uses: 14 }],
  ["sabra roasted pepper hummus", { unit: "g", uses: 4 }],
  ["salmon", { unit: "oz", uses: 5 }],
  ["salmon cooked", { unit: "oz", uses: 39 }],
  ["sardines in water canned", { unit: "cans", uses: 6 }],
  ["sargento ultra thin sharp cheddar", { unit: "slice", uses: 2 }],
  ["sf greek yogurt", { unit: "cup", uses: 34 }],
  ["sfh whey", { unit: "scoop", uses: 2 }],
  ["shrimp", { unit: "oz", uses: 1 }],
  ["shrimp cooked", { unit: "oz", uses: 6 }],
  ["side salad", { unit: "serving", uses: 1 }],
  ["side salad unlimited", { unit: "serving", uses: 6 }],
  ["sirloin steak cooked", { unit: "g", uses: 1 }],
  ["sliced carrots", { unit: "serving", uses: 1 }],
  ["sliced carrots unlimited", { unit: "serving", uses: 6 }],
  ["sliced cucumber", { unit: "serving", uses: 7 }],
  ["sliced cucumber side", { unit: "serving", uses: 12 }],
  ["sliced cucumber unlimited", { unit: "serving", uses: 6 }],
  ["sourdough bread", { unit: "g", uses: 2 }],
  ["spinach", { unit: "cup", uses: 2 }],
  ["steamed asparagus or broccoli", { unit: "serving", uses: 6 }],
  ["steamed asparagus or broccoli unlimited", { unit: "serving", uses: 6 }],
  ["steamed broccoli or asparagus", { unit: "serving", uses: 6 }],
  ["steamed broccoli or asparagus unlimited", { unit: "serving", uses: 6 }],
  ["steel cut oats dry", { unit: "cup", uses: 2 }],
  ["strawberries", { unit: "oz", uses: 3 }],
  ["sweet potato", { unit: "oz", uses: 4 }],
  ["sweet potato cooked", { unit: "g", uses: 38 }],
  ["sweet potato diced cooked", { unit: "g", uses: 6 }],
  ["thai cucumber salad", { unit: "g", uses: 2 }],
  ["thomas cinnamon swirl bagel", { unit: "bagel", uses: 8 }],
  ["tilapia cooked", { unit: "oz cooked", uses: 1 }],
  ["tomatoes", { unit: "oz", uses: 2 }],
  ["top sirloin trimmed cooked", { unit: "oz", uses: 4 }],
  ["turkey bacon", { unit: "slices", uses: 7 }],
  ["unsweetened almond milk", { unit: "oz", uses: 7 }],
  ["vegetables unlimited", { unit: "serving", uses: 35 }],
  ["veggie", { unit: "cup", uses: 1 }],
  ["walnuts", { unit: "halves", uses: 14 }],
  ["water", { unit: "oz", uses: 2 }],
  ["whey protein", { unit: "scoop", uses: 12 }],
  ["whey protein shake", { unit: "scoop", uses: 2 }],
  ["white fish tilapia cooked", { unit: "g", uses: 1 }],
  ["white mushroom", { unit: "g", uses: 1 }],
  ["white onion", { unit: "g", uses: 1 }],
  ["white potato", { unit: "g", uses: 2 }],
  ["white potato cooked", { unit: "g", uses: 13 }],
  ["white potato roasted", { unit: "g", uses: 28 }],
  ["white rice", { unit: "cup", uses: 15 }],
  ["white rice cooked", { unit: "cup", uses: 82 }],
  ["white rice long grain cooked", { unit: "oz", uses: 5 }],
  ["whole eggs", { unit: "large", uses: 28 }],
  ["whole eggs fried", { unit: "large", uses: 6 }],
  ["whole eggs hard boiled", { unit: "whole", uses: 1 }],
  ["whole wheat crackers", { unit: "crackers", uses: 7 }],
  ["wilde smoked gouda protein crackers", { unit: "g", uses: 6 }],
  ["yasso bar", { unit: "bar", uses: 1 }],
  ["yasso greek yogurt bar", { unit: "bar", uses: 2 }],
  ["zucchini", { unit: "oz", uses: 2 }],
]);

/**
 * Normalises a food name to the key shape used above.
 *
 * AN ACCENT IS A SPELLING, NOT A DIFFERENT FOOD. The accent is folded to its
 * plain letter BEFORE anything is stripped, because stripping it breaks one
 * word into two: "Mölk" became "m lk", and both halves are shorter than the
 * three letters the family matcher counts as a word, so the word disappeared
 * entirely. Folding keeps "molk" — and it is what the generated map above was
 * already built with, so for "Jocko Mölk Whey" and both Núrri shakes the
 * lookup was asking for keys the file does not contain and getting nothing
 * back for three foods he had written down himself.
 */
export function unitKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
/** g, oz, ml and friends: a weight, not a measure anybody serves with. */
const WEIGHT_ONLY = /^(m?g|kg|grams?|oz|ounces?|lbs?|pounds?|ml|l|litres?|liters?|fl oz|oz cooked|oz dry)$/;

/**
 * The family answer: the same search, with the whole-name entry excluded so a
 * food cannot be its own family, and over BOTH readings of a comma.
 *
 * USDA writes a generic food head-first - "Butter, salted" - so the segment
 * before the comma is the food. A BRANDED row is the other way round:
 * "Kerrygold, Naturally Softer Pure Irish Butter" is a brand, then the food.
 * Reading only the head found "kerrygold" and stopped, which is why a row that
 * plainly says butter came back with no unit at all. Head first, then the whole
 * string, so both spellings land on the food.
 */
function familyUnit(name: string, skipKey: string): HisUnit | null {
  const readings = [unitKey((name || "").split(/[,(\[]/)[0]), unitKey(name)];
  for (const head of readings) {
    if (!head) continue;
    if (head !== skipKey) {
      const byHead = HIS_UNIT.get(head);
      if (byHead) return byHead;
    }
    // The food is rarely the very last word. "PURE IRISH BUTTER SALTED" ends in
    // a qualifier, and a strict suffix rule read "salted" and found nothing -
    // which is exactly how the picker opened his Kerrygold on "1 pat".
    //
    // So: find the longest known food anywhere in the name, latest first, and
    // accept it only when every word AFTER it is a QUALIFIER. That is the line
    // between a qualifier and a different food:
    //   "pure irish butter salted"  -> after "butter" comes "salted"      -> yes
    //   "butter pecan ice cream"    -> after "butter" comes "pecan ice.." -> no
    const words = head.split(" ").filter((w) => w.length >= 3);
    for (let end = words.length; end > 0; end--) {
      if (!words.slice(end).every((w) => QUALIFIER.has(w))) continue;
      for (let start = 0; start < end; start++) {
        const key = words.slice(start, end).join(" ");
        if (key === skipKey) continue;
        const hit = HIS_UNIT.get(key);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function unitHeUses(name: string): string | null {
  const whole = unitKey(name);
  if (!whole) return null;
  const exact = HIS_UNIT.get(whole);
  const family = familyUnit(name, whole);
  if (!exact) return family ? family.unit : null;
  if (!family || family.unit === exact.unit) return exact.unit;

  // THE LONGER NAME IS NOT AUTOMATICALLY THE BETTER ANSWER. HIS OWN COUNT IS.
  //
  // Dustin, 7 Sep, opening Kerrygold in the food sheet and finding grams and no
  // tablespoon anywhere in the picker: *"I still can log my fucking butter!!!!
  // no tbsp."*
  //
  // He typed "Kerrygold Irish butter - 6 g" into a meal plan twice. He has
  // written butter as a TABLESPOON eight times. The whole-name match won purely
  // for being longer, so two entries beat eight and took the tablespoon off the
  // screen entirely - because a weight also sets heWeighsIt in the sheet, which
  // skips the borrow that would have found one.
  //
  // Specific still beats general on equal evidence, and where he really does
  // weigh a variant the count says so and nothing changes: "sweet potato
  // (cooked)" is grams 38 times against "sweet potato" ounces 4 times. What
  // changes is only the case where a household measure is better attested than
  // the weight, and there the household measure is the honest answer.
  const exactIsWeight = WEIGHT_ONLY.test(exact.unit);
  const familyIsWeight = WEIGHT_ONLY.test(family.unit);
  if (exactIsWeight && !familyIsWeight && family.uses > exact.uses) return family.unit;
  return exact.unit;
}

/** Every food he programmes, for tests and for the catalogue audit. */
export function knownFoods(): string[] {
  return [...HIS_UNIT.keys()];
}
