// "Custom meal" is a shrug, not a description.
//
// The composer fell back to that literal string whenever the name box was left
// empty, and that string is what lands in `off_plan_details` — the one column
// whose job is to record WHAT was eaten. Measured 31 Aug: 47 off-plan rows in
// 60 days say "Custom meal" and nothing else.
//
// Nobody types a name for a plate of leftovers, and they shouldn't have to. The
// items are right there.

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeItems } from "../../src/lib/nutrition/dailyTotals.ts";

test("the meal describes itself", () => {
  assert.equal(
    describeItems([{ n: "Sirloin" }, { n: "White potato" }, { n: "White rice" }]),
    "Sirloin, White potato, White rice",
  );
});

test("a long plate is summarised, not truncated mid-thought", () => {
  assert.equal(
    describeItems([{ n: "Sirloin" }, { n: "Potato" }, { n: "Rice" }, { n: "Carrots" }, { n: "Butter" }]),
    "Sirloin, Potato, Rice +2 more",
  );
});

test("one item is enough", () => {
  assert.equal(describeItems([{ n: "Bagel" }]), "Bagel");
});

test("blank names are not counted as items", () => {
  assert.equal(describeItems([{ n: "  " }, { n: "Eggs" }, { n: "" }]), "Eggs");
});

test("with genuinely nothing to go on, it says so plainly", () => {
  // The only case where the old string is still the right answer.
  assert.equal(describeItems([]), "Custom meal");
  assert.equal(describeItems([{ n: "" }]), "Custom meal");
});
