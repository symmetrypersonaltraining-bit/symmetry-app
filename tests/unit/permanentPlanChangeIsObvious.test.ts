import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A CHANGE THAT LASTS FOREVER MUST SAY SO BEFORE IT HAPPENS.
 *
 * Claudine, 13 Aug: "Omfg i replaced one of the meals for a recipe i made and
 * the clanker changed ALL the meals not only for today but days before."
 *
 * Dustin's read of it, which was the right one: "I don't think she was trying
 * to change the meal plan moving forward."
 *
 * She wasn't. She was trying to eat her own recipe that night. The control she
 * used said "Put it in my plan as…" and "📌 Add" — both of which describe
 * adding a thing to a list. What it did was REPLACE that meal's contents in her
 * plan, from that day forward, every day, with no confirm and no way back.
 *
 * There have always been two things a person can mean, and the app now has to
 * keep them visibly apart everywhere:
 *
 *   JUST TODAY   writes item_overrides on that day's log. Nothing else moves.
 *   EVERY DAY    clones the plan, archives the old version, and changes the
 *                menu from today forward.
 *
 * The one-day path is the default and the easy one, because it is what people
 * mean nine times in ten. The permanent one has to name the meal, say "every
 * day", ask once, and be undoable.
 */

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const RECIPES = strip(readFileSync(join(ROOT, "src/app/(app)/recipes/RecipesClient.tsx"), "utf8"));
const LOGGER = strip(readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8"));

test("the recipe screen no longer calls a permanent replacement 'Add'", () => {
  assert.ok(
    !/Put it in my plan as/.test(RECIPES),
    "the vague label is back — it describes adding, and the action replaces",
  );
  assert.ok(!/📌 Add</.test(RECIPES), "the button is called Add again");
  assert.match(RECIPES, /Replace it in my plan — every day/);
  assert.match(RECIPES, /Choose the meal it replaces/);
});

test("the permanent change asks once, and says what it will do", () => {
  assert.match(RECIPES, /confirming/, "the confirm step is gone — one tap changes the plan again");
  assert.match(RECIPES, /from today on — not just today/);
  // And says the thing she most needed to hear: history is safe.
  assert.match(RECIPES, /Days you&rsquo;ve already logged stay exactly as they were/);
});

test("both surfaces offer the one-day option first", () => {
  // The logger already got this right and is the reference: two buttons, the
  // one-day one primary. This locks that in rather than assuming it stays.
  assert.match(LOGGER, /Save for today — totals update/);
  assert.match(LOGGER, /Save to my plan — every day/);
  assert.match(RECIPES, /Log this to today/);
  // On the recipe screen the one-day button must come FIRST in the markup.
  assert.ok(
    RECIPES.indexOf("Log this to today") < RECIPES.indexOf("Replace it in my plan"),
    "the permanent option is above the one-day one",
  );
});

test("an archived version can actually be restored", () => {
  // "restorable anytime" has been in the version sheet's copy since it was
  // built, with no button and no route behind it. That gap is what turned a
  // mis-tap into something only a developer could undo.
  assert.match(LOGGER, /Make this my plan again/);
  assert.match(LOGGER, /\/api\/nutrition\/plan-restore/);
  const route = readFileSync(join(ROOT, "src/app/api/nutrition/plan-restore/route.ts"), "utf8");
  assert.match(route, /status: "live"/);
  // Restoring must archive what it displaces, never delete it — so restore is
  // itself undoable.
  assert.ok(!/\.delete\(\)/.test(strip(route)), "plan-restore deletes a plan version");
  assert.match(strip(route), /status: "archived"/);
  // And must not take a day-group sibling down with it.
  assert.match(strip(route), /sameDayGroup/);
});

test("restore is refused for someone else's plan", () => {
  const route = strip(readFileSync(join(ROOT, "src/app/api/nutrition/plan-restore/route.ts"), "utf8"));
  assert.match(route, /if \(!isTrainer && plan\.client_id !== ownClientId\)/);
});
