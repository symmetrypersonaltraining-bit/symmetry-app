import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ADH_PCT, adherencePct } from "../../src/lib/nutrition/dailyTotals";

/**
 * Adherence proration is defined ONCE, in lib/nutrition/dailyTotals.
 *
 * It had drifted into three hand-rolled copies. The worst of them (the home
 * macro ring) was missing the "1/4" case entirely and ended with
 * `default: return 1` — so a quarter-eaten meal, and any adherence value the
 * switch didn't recognise, both counted as a FULL meal. That over-reports
 * calories consumed, which is exactly the "numbers are off here and there"
 * complaint.
 *
 * Two guards below: the weights themselves, and a scan proving no second copy
 * of them has appeared anywhere else in src/.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

// The only place allowed to spell out the numbers.
const CANON = path.join("src", "lib", "nutrition", "dailyTotals.ts");

test("every adherence value the DB allows has a defined weight", () => {
  // Mirrors the meal_adherence_logs CHECK constraint.
  const allowed = ["Full", "3/4", "1/2", "1/4", "Partial", "Skipped", "Off-plan"];
  for (const key of allowed) {
    assert.ok(key in ADH_PCT, `${key} is a legal adherence value with no weight`);
  }
  assert.equal(adherencePct("Full"), 1);
  assert.equal(adherencePct("3/4"), 0.75);
  assert.equal(adherencePct("1/2"), 0.5);
  assert.equal(adherencePct("1/4"), 0.25, "a quarter-eaten meal is 25%, not a full meal");
  assert.equal(adherencePct("Partial"), 0.5);
  assert.equal(adherencePct("Skipped"), 0);
  assert.equal(adherencePct("Off-plan"), null, "Off-plan uses est_* macros, not proration");
});

test("an unrecognised adherence value never counts as a full meal", () => {
  // The old `default: return 1` meant a typo, a new chip, or anything Claude
  // wrote inflated the day's calories to a full meal's worth.
  for (const junk of ["", "  ", "FULL", "full", "three quarters", "0.75", "Ate most", "null"]) {
    assert.notEqual(adherencePct(junk), 1, `"${junk}" must not resolve to a full meal`);
  }
  assert.equal(adherencePct(null), null);
  assert.equal(adherencePct(undefined), null);
});

test("no file outside the nutrition library defines its own adherence weights", () => {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  })(SRC);

  const offenders: string[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    if (rel === CANON) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A weight table or switch arm: the "3/4" key sitting next to a bare
      // 0.75. A QUOTED "0.75" is text-parsing (nutrition-json normalises what
      // Claude writes into the canonical key), not a weight — leave it alone.
      const bare075 = /(^|[^"'\w.])0\.75(?![\w"'])/.test(line);
      if (/["']3\/4["']/.test(line) && bare075) {
        offenders.push(`  ${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    });
  }

  assert.equal(
    offenders.length,
    0,
    "adherence weights duplicated outside src/lib/nutrition/dailyTotals.ts — " +
      "import adherencePct instead so the numbers cannot drift:\n" +
      offenders.join("\n"),
  );
});
