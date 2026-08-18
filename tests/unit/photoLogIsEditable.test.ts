// A photo logged onto a planned meal has to be editable afterwards.
//
// Megan Gautreaux, 17 Aug: "I tried that way and when I click on edit it pulls
// up the list of original meal plan, not the meal I logged with the picture.
// Which is how we are having to do it this week since he is off shore."
//
// She was right, and the answer she had been given was wrong. The photo screen
// lists every item it found; the write kept only the TOTALS — est_* plus an
// off_plan_macros lump with no items. So the row stayed kind "plan", and
// "Edit items" opened the plan editor seeded from the meal plan's own food.
// There was no way to correct a photo once it was on a planned meal.
//
// Both sibling branches on the same screen already persisted __custom.items,
// and dailyTotals.ts documents off-plan rows as carrying it. This branch never
// did.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"),
  "utf8",
);
const TOTALS = readFileSync(join(process.cwd(), "src/lib/nutrition/dailyTotals.ts"), "utf8");

// Comments must not satisfy a structural assertion — this file's own comments
// quote the code being asserted on. Fourth time today.
function code(src: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === "\\") { out += src[++i] ?? ""; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && src[i + 1] === "*") { i += 2; while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++; i++; continue; }
    out += c;
  }
  return out;
}
const CODE = code(SRC);

test("the comment stripper strips, or the guards below are theatre", () => {
  assert.equal(code('a // __custom: { items }\nb').includes("__custom: { items }"), false);
  assert.ok(code('x.__custom; // note').includes("x.__custom"));
});

// ─── the fix ────────────────────────────────────────────────────────────────

function offPlanCommitBody(): string {
  const i = CODE.indexOf('adherence: "Off-plan",\n            off_plan_details: est.desc');
  assert.ok(i > 0, "the off-plan commit for a planned meal has moved or gone");
  const end = CODE.indexOf("});", i);
  assert.ok(end > i, "could not bound the write");
  return CODE.slice(i, end);
}

test("a photo logged onto a planned meal keeps its item list", () => {
  const body = offPlanCommitBody();
  assert.match(body, /__custom:/,
    "the items are dropped again — Edit items will show the meal plan's food, not what she ate");
  assert.match(body, /items: est\.items/,
    "something other than the AI's own item list is being stored");
});

test("the item list is only stored when there IS one", () => {
  // A pending log ("save it, macros tonight") and a bare description have no
  // items. Writing an empty __custom would turn the row custom with nothing in
  // it, which reads on screen as the meal having been emptied.
  const body = offPlanCommitBody();
  assert.match(body, /est\.items && est\.items\.length/,
    "an empty item list is written as a custom meal, blanking the row");
});

test("the planned meal it replaced is remembered", () => {
  const body = offPlanCommitBody();
  assert.match(body, /sourceMealId: row\.kind === "plan" \? row\.chosen\?\.id \?\? null : null/,
    "the link back to the planned meal is lost, so nothing can tell what was swapped out");
});

test("the AI's own totals still win — this must not move tonight's numbers", () => {
  const body = offPlanCommitBody();
  assert.match(body, /est_kcal: est\.pending \? null : r\(est\.k\)/,
    "est_* no longer comes from the analysis, so the totals can now drift from what she was shown");
});

// ─── the editor it unlocks ──────────────────────────────────────────────────

test("a row with items routes to the per-item editor, not the plan editor", () => {
  assert.match(CODE, /if \(row\.kind === "custom" && row\.meta\) \{[\s\S]{0,200}?<CustomEditSheet/,
    "Edit items no longer opens the per-item editor for a custom row");
  assert.match(CODE, /const meta = log\?\.item_overrides\?\.__custom;[\s\S]{0,200}?kind: "custom"/,
    "a log carrying __custom no longer produces a custom row, so the editor is unreachable");
});

test("editing recomputes the macros from what she leaves behind", () => {
  assert.match(CODE, /async function patchCustom\(row: Row, meta: CustomMeta[\s\S]{0,200}?customMealMacros\(meta\)/,
    "saving an edit no longer recalculates the macros, so corrections change nothing");
});

test("she can still switch back to the planned meal afterwards", () => {
  // The row keeps its `options`, which is what the plan/actual toggle reads.
  assert.match(CODE, /kind: "custom", position: pos, meta, log, options,/,
    "a custom plan-slot row lost its options — the planned meal becomes unreachable");
});

// ─── the shape this relies on ───────────────────────────────────────────────

test("off-plan rows are documented as carrying the itemisation", () => {
  assert.match(TOTALS, /est_\* fields \(\+ item_overrides\.__custom for itemization\)/,
    "dailyTotals no longer expects off-plan rows to itemise — re-check that totals still read est_*");
});

// ─── the other half: editing BEFORE it saves ────────────────────────────────
//
// Megan's original question was "is there a way to edit if it sees something
// wrong?" — asked about the moment the estimate appears. That screen listed
// every item and offered one button, "Log it".

function estimateBlock(): string {
  const i = CODE.indexOf("{est.items?.map(");
  assert.ok(i > 0, "the estimate's item list has gone");
  const end = CODE.indexOf("commit(false)", i);
  assert.ok(end > i, "could not bound the estimate block");
  return CODE.slice(i, end);
}

test("the estimate is editable before anything is logged", () => {
  const block = estimateBlock();
  assert.match(block, /reprice\(/,
    "the items on the estimate screen are read-only again — the only way out is Log it");
  assert.match(block, /fac: Math\.max\(0\.25,/, "a portion cannot be taken down");
  assert.match(block, /fac: Math\.min\(4,/, "a portion cannot be taken up");
  assert.match(block, /est\.items!\.filter\(\(_, j\) => j !== i\)/,
    "an item the AI invented cannot be removed");
});

test("the portion controls are bounded", () => {
  // 0 would log a phantom item at no calories; unbounded growth is a typo away
  // from a 40,000 calorie day.
  const block = estimateBlock();
  assert.match(block, /Math\.max\(0\.25/, "a portion can be driven to zero or negative");
  assert.match(block, /Math\.min\(4/, "a portion is unbounded upward");
});

test("editing re-prices the whole estimate, not just the line", () => {
  assert.match(CODE, /function reprice\(items: CustomItem\[\]\)[\s\S]{0,400}?customMealMacros\(\{ name: prev\.desc, items \}\)/,
    "the totals are not recalculated from the items she left, so the number logged is the AI's original");
  assert.match(CODE, /k: r\(m\.kcal\), p: r\(m\.protein\), c: r\(m\.carbs\), f: r\(m\.fats\)/,
    "est_* is not updated from the re-priced meal");
});

test("the stored analysis is re-priced with it, or the two disagree", () => {
  // The write that consumes this says est_* and off_plan_macros "always land
  // together ... so the two can never disagree". An edit has to move both.
  assert.match(CODE, /opm: prev\.opm\s*\?\s*\{ \.\.\.prev\.opm, kcal: r\(m\.kcal\), protein: r\(m\.protein\), carbs: r\(m\.carbs\), fats: r\(m\.fats\)/,
    "off_plan_macros keeps the AI's original numbers while est_* moves — the day's totals and the stored analysis drift apart");
});

test("an edited estimate is marked as edited", () => {
  assert.match(CODE, /edited_by_client: true/,
    "nothing records that the client corrected the AI, so a bad model cannot be told from a bad photo later");
});
