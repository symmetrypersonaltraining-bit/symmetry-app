import test from "node:test";
import assert from "node:assert/strict";
import { unitHeUses, unitKey, knownFoods } from "../../src/lib/nutrition/foodUnitDefaults.ts";

/**
 * THREE OF HIS FOODS WERE IN THE MAP UNDER KEYS THE MAP COULD NEVER LOOK UP.
 *
 * `foodUnitDefaults.ts` is generated from `meal_items`, and `unitKey` is what
 * turns a food name into a key at runtime. The two disagreed about accents.
 *
 * He programmes "Jocko Mölk Whey" (scoop, 4 times), "Núrri chocolate protein
 * shake" (can, 4 times) and "Núrri shake" (shake). Whoever generated the file
 * folded the accent to its plain letter — the keys read `jocko molk whey` and
 * `nurri shake`. `unitKey` does not fold: it strips anything outside
 * [a-z0-9 ], so "Mölk" arrives as "m lk" and "Núrri" as "n rri". The lookup
 * asked for a key the file does not contain, and three foods he had written
 * down himself came back as foods he had never programmed.
 *
 * Folding is also the better of the two ways to agree. Stripping breaks one
 * word into two fragments, and both are shorter than the three letters the
 * family matcher requires, so the word is gone entirely — "Mölk" stops being
 * a word the map can recognise anywhere in a longer name. Folding keeps it.
 *
 * These three rows carry their own serving today ("1 scoop", "1 can"), so the
 * sheet still opens on the right measure and no screen is visibly wrong. What
 * was wrong is the record: `knownFoods()` is what the catalogue audit trusts
 * to say which foods he programmes, and it listed three under names that no
 * live food resolves to.
 */

test("his foods spelled with accents — the map answers for the name he actually typed", () => {
  assert.equal(unitHeUses("Jocko Mölk Whey"), "scoop");
  assert.equal(unitHeUses("Núrri chocolate protein shake"), "can");
  assert.equal(unitHeUses("Núrri shake"), "shake");
});

test("his foods spelled with accents — an accent does not change what the food is", () => {
  // The same food written both ways is the same key. A catalogue row that
  // drops the accent, and his own row that keeps it, must not disagree.
  assert.equal(unitKey("Jocko Mölk Whey"), unitKey("Jocko Molk Whey"));
  assert.equal(unitKey("Núrri shake"), unitKey("Nurri shake"));
  assert.equal(unitKey("Café Latte"), "cafe latte");
});

test("his foods spelled with accents — the accented names reach their own keys in the map", () => {
  // This is the drift guard, and it has to run from the NAMES rather than from
  // the keys. Asserting `unitKey(key) === key` looks like an invariant and is
  // not one: every key in the file is already plain ASCII, so it compares each
  // key to itself and can never fail. These are the three names in
  // `meal_items` that carry an accent — the lookup must land on a key the file
  // actually holds, for each of them.
  const hisAccentedFoods = ["Jocko Mölk Whey", "Núrri chocolate protein shake", "Núrri shake"];
  const keys = new Set(knownFoods());
  const missed = hisAccentedFoods.filter((name) => !keys.has(unitKey(name)));
  assert.deepEqual(missed, []);
});

test("his foods spelled with accents — folding leaves plain names exactly as they were", () => {
  // The fold must be invisible to everything already working. Butter is still
  // the whole point of this map.
  assert.equal(unitKey("Thomas' Cinnamon Swirl Bagel"), "thomas cinnamon swirl bagel");
  assert.equal(unitKey("93/7 Ground Beef"), "93 7 ground beef");
  assert.equal(unitHeUses("Kerrygold Salted Irish Butter"), "tbsp");
  assert.equal(unitHeUses("Sweet Potato (cooked)"), "g");
});
