import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TWO FAULTS THAT ONLY EXIST AT SOME SCREEN WIDTHS.
 *
 * Both were found on the live Progress screen within minutes of shipping, and
 * neither was visible at phone width in review — which is exactly why they need
 * to be a build failure rather than a thing somebody remembers.
 *
 *  1. The viewBox is 340 units wide and every font-size inside it is in viewBox
 *     units, so `width: 100%` in a 1,250px trainer-desktop column scaled the
 *     axis labels to roughly 40px.
 *
 *  2. x0 was taken straight off goal.startDate, so a weigh-in recorded BEFORE
 *     the goal was set mapped to a negative x. The svg is overflow:visible (it
 *     has to be, for the right-edge labels), so the line drew out of the card
 *     and across the page.
 *
 *  3. The goal label and the "where this rate lands" label share an x. When the
 *     projection is near the target they printed on top of each other — the two
 *     numbers the client opened the card to read.
 */

const ROOT = process.cwd();
const CARD = readFileSync(join(ROOT, "src/components/GoalCard.tsx"), "utf8");
/** Comments describe the fault; only the code counts as the fix. */
const CODE = CARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the chart is width-capped", () => {
  assert.match(
    CODE,
    /maxWidth:\s*4\d\d/,
    "the plot container lost its maxWidth — on a desktop column the axis labels scale to ~40px",
  );
});

test("the x domain covers every point the chart draws", () => {
  assert.match(
    CODE,
    /const x0 = Math\.min\(/,
    "x0 no longer widens to the earliest reading — pre-goal weigh-ins will draw at negative x and overflow the card",
  );
});

test("the leftmost dot is labelled with its own value, not the goal's start", () => {
  // Once the domain widened to cover pre-goal weigh-ins, a.start and the first
  // plotted point stopped being the same number — and the chart labelled a
  // 198 lb dot "212".
  assert.match(CODE, /\{pts\[0\]\.r\.value\}/);
  assert.ok(
    !/y=\{Math\.max\(9, pts\[0\]\.y - 10\)\}[^>]*>\{a\.start\}/.test(CODE),
    "the first point is labelled with the goal's start value again",
  );
});

test("the right-hand date label is anchored at its end", () => {
  // Centred, it spilled past the plot area and printed through "this rate".
  assert.match(CODE, /x=\{L \+ pw\} y=\{H - 5\} textAnchor="end"/);
});

test("the two right-edge labels cannot print on top of each other", () => {
  assert.match(CODE, /projTextY/, "the projection label no longer de-collides with the goal label");
  assert.ok(
    !/y=\{Y\(a\.projected\) \+ 3\}/.test(CODE),
    "the projection label is anchored to the raw projected y again, which collides with the goal label",
  );
});

/**
 * The domain rule as maths, so it is checked rather than merely present.
 * Mirrors the line in GoalCard: x0 = min(goalStart, firstReading).
 */
test("a reading before the goal start still lands inside the plot", () => {
  const L = 32, R = 56, W = 340;
  const pw = W - L - R;
  const ms = (d: string) => new Date(`${d}T12:00:00`).getTime();

  const goalStart = ms("2026-06-01");
  const firstReading = ms("2026-05-04"); // Dustin's cut started before the goal existed
  const x1 = ms("2026-09-30");

  const x0 = Math.min(goalStart, firstReading);
  const X = (t: number) => L + ((t - x0) / (x1 - x0)) * pw;

  assert.ok(X(firstReading) >= L, "the earliest reading draws left of the plot area");
  assert.ok(X(x1) <= L + pw + 0.001, "the target date draws past the right edge of the plot area");
});
