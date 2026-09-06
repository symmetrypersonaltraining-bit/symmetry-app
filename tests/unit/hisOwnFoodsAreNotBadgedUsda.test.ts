// HIS OWN FOODS ARE HIS, NOT USDA'S.
//
// The catalogue now carries a `trainer` tier: 155 foods built from Dustin's own
// meal plans — his macros, in the unit he programmes them in. "Butter" resolves
// to HIS butter at 1 tbsp / 104 cal, ahead of USDA's 717-per-100 g, because for
// a food he programmes his numbers are the answer.
//
// They are marked verified, which is true — but the verified badge says "USDA",
// and these numbers did not come from USDA. Saying so would misattribute his
// own work and hide where a figure can be questioned.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const SHEET = code(read("src/app/(app)/nutrition/v3/FoodSearchSheet.tsx"));

test("a trainer-tier row is badged Symmetry, not USDA", () => {
  assert.match(SHEET, /f\.source === "trainer"/);
  assert.match(SHEET, /SYMMETRY/);
});

test("the trainer check comes before the verified check", () => {
  // Both are true for his rows. Whichever is tested first wins, so the order is
  // the whole fix — reversed, every one of his foods claims to be USDA.
  const trainerAt = SHEET.indexOf('f.source === "trainer"');
  const verifiedAt = SHEET.indexOf("if (f.verified)");
  assert.ok(trainerAt > 0 && verifiedAt > 0, "both badge branches must exist");
  assert.ok(trainerAt < verifiedAt, "the trainer badge must be checked before the USDA one");
});

test("a client's own food still wins over both", () => {
  // Unchanged, and it must stay that way: a food the client typed themselves is
  // theirs before it is anybody's library row.
  const mine = SHEET.indexOf('f.source === "client"');
  assert.ok(mine > 0 && mine < SHEET.indexOf('f.source === "trainer"'));
});
