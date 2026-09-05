// ADDING TO A MEAL IS NOT SWAPPING IT.
//
// Dustin, 5 Sep: *"in nutrition, I used the ai coach to replace my normal m4 w
// 2 bagels w cream cheese n egg whites 8 oz. that worked, i logged it. then I
// told ai to add the jam to that meal n now cant see or edit the rest of the
// meal."*
//
// There was no intent for adding to a meal. The action extractor's list ran
// swap_meal / move_meal / copy_meal / delete_meal / add_snack / log_meal /
// unlog_meal / none — so "add the jam to that meal" came back as a SWAP, which
// replaces a meal's whole contents. The model, trying not to lose the meal it
// was replacing, invented one line to stand in for all of it:
//
//     Post-Workout (original) — 1 serving   640 cal  44P/94C/12F   est
//     Muscadine jam           — 1 tbsp       48 cal   0P/12C/0F    est
//
// Three separate failures in one write:
//   * the bagels, the cream cheese and the egg whites vanished from the card
//     AND from the edit sheet — he could not see or correct them;
//   * their numbers were collapsed into a single recalled figure, so a meal
//     built from three known items became one estimate;
//   * the swap lands unlogged by design, so a meal he had already eaten came
//     back unlogged with its macros stripped off the day.
//
// The totals happened to survive (688 / 44 / 106 / 12, which is what the card
// showed). That is what makes this the dangerous shape of bug: the number at
// the bottom looked right while the meal underneath it was gone.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateActReply, type ActReply } from "../../src/lib/ai/nutrition-json.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const ROUTE = read("src/app/api/nutrition-ai/act/route.ts");
const CLIENT = read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx");
const SHEET = read("src/app/(app)/nutrition/v3/CoachChatSheet.tsx");

const reply = (over: Record<string, unknown>): unknown => ({
  intent: "add_to_meal",
  params: { position: 4, items: [{ name: "Muscadine jam", amount: 1, unit: "tbsp", p: 0, c: 12, f: 0, kcal: 48 }] },
  confirmation: "Add muscadine jam to M4?",
  reply: "Adding it now.",
  ...over,
});

// ── the intent exists at all ────────────────────────────────────────────────

test("add_to_meal is a real intent, not a swap in disguise", () => {
  const a = validateActReply(reply({})) as ActReply | null;
  assert.ok(a, "the extractor still cannot express adding to a meal");
  assert.equal(a.intent, "add_to_meal");
  assert.equal(a.params.meal?.position, 4);
  assert.equal(a.params.items?.length, 1);
});

test("it carries ONLY the new food", () => {
  // If `items` ever carried the meal's existing contents too, the executor
  // below would append them a second time and double the meal.
  const a = validateActReply(reply({})) as ActReply;
  assert.equal(a.params.items?.[0].name, "Muscadine jam");
  assert.equal(a.params.name, undefined, "a new meal name would mean this is a swap");
});

test("it is refused without a target meal or without food", () => {
  assert.equal(validateActReply(reply({ params: { items: [{ name: "jam", p: 0, c: 12, f: 0, kcal: 48 }] } })), null);
  assert.equal(validateActReply(reply({ params: { position: 4, items: [] } })), null);
});

// ── the model is told which one to pick ─────────────────────────────────────

test("the prompt draws the add-versus-swap line, and says what swap costs", () => {
  assert.match(ROUTE, /- add_to_meal — the client wants to ADD something to a meal that already exists/);
  assert.match(ROUTE, /"items" is ONLY the new food/);
  assert.match(ROUTE, /ADD VERSUS SWAP, and this one matters/);
  assert.match(ROUTE, /the rest of their meal disappears from the screen and from the edit sheet/);
});

test("the placeholder that caused this is forbidden by name", () => {
  // "Post-Workout (original)" is the exact line that erased his meal.
  assert.match(ROUTE, /NEVER invent an item that stands in for a meal's existing contents/);
  assert.match(ROUTE, /no "\(original\)", no "rest of meal", no "previous items"/);
});

// ── the executor keeps the meal ─────────────────────────────────────────────

test("it appends to what is actually there, rather than replacing it", () => {
  assert.match(code(CLIENT), /addToMealCustom: async \(position, items\) => \{/);
  assert.match(code(CLIENT), /const base = rowItemsForCopy\(row\);/,
    "it must seed from the real contents — custom items, or the plan meal WITH today's edits");
  assert.match(code(CLIENT), /items: \[\.\.\.base, \.\.\.added\]/);
});

test("a meal that was logged stays logged", () => {
  // The swap path lands unlogged on purpose — you tap the circle when you eat
  // it. Adding a spoonful of jam to a meal already eaten must not undo that.
  assert.match(code(CLIENT), /const wasLogged = row\.kind === "custom" \? !row\.meta\?\.unlogged : isLogged\(row\);/);
  assert.equal((code(CLIENT).match(/unlogged: !wasLogged/g) || []).length, 2,
    "both branches — already-custom and plan meal — must preserve the logged state");
});

test("the sheet routes the intent, and never falls back to a swap", () => {
  // A fallback to swapMealCustom where the action is missing would reintroduce
  // the exact bug on the screens that mount the coach without nutrition actions.
  assert.match(code(SHEET), /case "add_to_meal":/);
  assert.match(code(SHEET), /if \(!actions\.addToMealCustom\) throw new Error/);
  const branch = code(SHEET).slice(code(SHEET).indexOf('case "add_to_meal":'), code(SHEET).indexOf('case "move_meal":'));
  assert.ok(!/swapMealCustom/.test(branch), "adding falls back to a swap when the action is absent");
});

test("the action is optional, so the workout screen needs no change", () => {
  // WorkoutLogger and GlobalCoach both declare a no-op CoachActions. Making
  // this required would have meant editing the workout logger, which is off
  // limits without per-item permission.
  assert.match(SHEET, /addToMealCustom\?: \(position: number, items: CoachActionItem\[\]\) => Promise<void>;/);
});
