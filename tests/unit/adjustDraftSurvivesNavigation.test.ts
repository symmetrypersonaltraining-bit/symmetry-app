import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * "THOSE REVERT BACK TO WHAT THEY WERE BEFORE."
 *
 * Dustin, 29 Aug 2026, fourth time of asking:
 * *"If I put the butter down to 0 because I didn't eat it, and then I bumped
 * the egg whites up to 8 oz, as soon as I click on the button to add something
 * else, those revert back to what they were before. That needs to hold until
 * I'm done on that page and hit save."*
 *
 * TWO causes, and the second is why it looked deliberate rather than flaky.
 *
 *  1. Opening the food database PUSHES a sheet. Only the top sheet renders, so
 *     PlanAdjustSheet UNMOUNTED. Its `amounts` and `adds` were useState seeded
 *     from `existingOv` — the SAVED overrides — so remounting re-seeded from
 *     the database and discarded everything typed.
 *
 *  2. Worse: the food-search "add" handler for a plan row read
 *     `row.log.item_overrides` (saved) and upsertLog()'d them straight back. So
 *     adding a food did not merely forget the butter and the egg whites, it
 *     RE-COMMITTED the pre-edit values over them.
 *
 * The composer path already had the rule right — "nothing is written to the
 * database here, the draft is not a meal until it is saved". This asserts the
 * adjust path now follows it too.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const V3 = code(read("src/app/(app)/nutrition/v3/NutritionV3Client.tsx"));

test("the in-progress edit lives above the sheet, not inside it", () => {
  // A ref in the parent, which stays mounted for the whole sheet stack.
  assert.match(V3, /const adjustDrafts = useRef</,
    "the draft store is gone — edits will not survive opening another sheet");
  // The sheet seeds from the draft FIRST and only falls back to saved overrides.
  assert.match(V3, /const held = drafts\.current\[draftKey\]\?\.amounts;[\s\S]{0,80}if \(held\) return \{ \.\.\.held \};/,
    "the sheet stopped preferring the in-progress draft over the saved overrides");
  assert.match(V3, /drafts\.current\[draftKey\] = \{ amounts, adds \}/,
    "changes are no longer mirrored up to the draft store");
});

test("adding a food writes to the draft, not to the database", () => {
  // The regression that made it look deliberate: the old branch read the SAVED
  // overrides and upserted them back, re-committing the pre-edit values.
  assert.match(V3, /s\.target === "adjust" && s\.rowKey && adjustDrafts\.current\[s\.rowKey\]/,
    "the adjust path no longer routes an added food into the draft");
  assert.match(V3, /d\.adds = \[\.\.\.d\.adds,/,
    "the added food is not being appended to the draft");
});

test("the draft is cleared when the sheets close, but not on Back", () => {
  // Back is how you get to the food database and return. Clearing there would
  // reintroduce the exact bug.
  assert.match(V3, /function closeAllSheets\(\) \{ adjustDrafts\.current = \{\}; setSheetStack\(\[\]\); \}/,
    "closing the sheets no longer clears the draft");
  assert.match(V3, /function backSheet\(\) \{ setSheetStack\(\(prev\) => prev\.slice\(0, -1\)\); \}/,
    "backSheet must NOT clear the draft — that is how you return from the food database");
});
