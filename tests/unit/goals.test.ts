import test from "node:test";
import assert from "node:assert/strict";
import {
  analyseGoal, recentRate, kcalPerDayFor,
  MIN_READINGS_TO_PROJECT, MIN_SPAN_DAYS_TO_PROJECT,
  type Goal, type Reading,
} from "../../src/lib/goals";

/**
 * GOAL MATHS, TESTED AGAINST THE THREE CLIENTS IT WAS DESIGNED FROM.
 *
 * Every fixture below is real, copied out of public.metrics. That matters more
 * than usual here: two of the three broke the obvious implementation, and
 * invented numbers would have been kind to it.
 *
 *   DUSTIN  212 → 188.6 over three months. Comfortably on track.
 *   LAUREN  158 → 146.2 … then the SAME NUMBER twice, sixteen days apart.
 *   ROBERT  four readings in seven weeks: 266 → 267 → 266.2 → 263.
 *
 * Lauren decides how the rate is computed. Robert decides whether a projection
 * is drawn at all. Neither decision is visible from Dustin's data, which is the
 * one a lazier test would have used.
 */

const goal = (o: Partial<Goal> = {}): Goal => ({
  id: "g1", metric: "weight", targetValue: 140, targetDate: "2026-10-15",
  startValue: null, startDate: null, setBy: "client", status: "active", ...o,
});

const r = (rows: [string, number][]): Reading[] => rows.map(([date, value]) => ({ date, value }));

const DUSTIN = r([
  ["2026-05-04", 212], ["2026-05-11", 208], ["2026-05-18", 207.8], ["2026-05-25", 203.2],
  ["2026-06-07", 196.4], ["2026-06-14", 196.2], ["2026-06-22", 193.2], ["2026-06-28", 195],
  ["2026-07-05", 193.8], ["2026-07-12", 192.8], ["2026-07-20", 197], ["2026-07-26", 191.4],
  ["2026-08-02", 188.6],
]);
const LAUREN = r([
  ["2026-05-04", 158], ["2026-06-23", 153], ["2026-06-30", 150.2], ["2026-07-20", 146.2],
  ["2026-08-05", 146.2],
]);
const ROBERT = r([
  ["2026-06-02", 266], ["2026-07-11", 267], ["2026-07-13", 266.2], ["2026-07-23", 263],
]);

const TODAY = "2026-08-13";

// ── the decision Lauren forced ─────────────────────────────────────────────

test("the answer INVERTS with window size, which is why a stall has to win", () => {
  // The finding that changed the design, caught by this test rather than by
  // reasoning. Lauren's verdict depends entirely on how far back you look:
  //
  //   lifetime      -0.89 lb/wk   lands 138.2   ARRIVES
  //   last 6 weeks  -0.78 lb/wk   lands 139.2   ARRIVES
  //   last 4 weeks   0.00 lb/wk   lands 146.2   MISSES BY 6
  //
  // Neither window is wrong, so picking one silently is misleading whichever
  // one is picked. The mock-up claimed her recent rate was zero — true only for
  // a window shorter than the one the code actually uses.
  assert.equal(Math.round(recentRate(LAUREN, 42)! * 100) / 100, -0.78);
  assert.equal(recentRate(LAUREN, 28), 0);
});

test("a fortnight of no movement overrules a healthy six-week trend", () => {
  // A projection assumes the trend continues. Sixteen days at the identical
  // number is direct evidence that it has stopped, and evidence beats
  // extrapolation — "on track, arriving 8 Oct" would be technically defensible
  // and a practical lie to somebody who has not moved in over two weeks.
  const a = analyseGoal(goal(), LAUREN, TODAY)!;
  assert.equal(a.flatDays, 16, "20 Jul → 5 Aug at the same number");
  assert.equal(a.stalled, true, "the stall did not overrule the trend");
  assert.equal(a.status, "behind");

  // The projection must move WITH the status, or the chart draws a line
  // arriving on time under a chip that says behind — the exact contradiction
  // this module exists to prevent.
  assert.equal(a.projected, a.now, "a stalled projection must be flat, not the six-week slope");
  assert.equal(a.arrivesOn, null);

  // And BOTH true things stay available, so the copy can say the honest
  // sentence rather than either half of it.
  assert.equal(a.trendRate, -0.8);
  assert.ok(a.trendProjected! < 140, "the six-week trend alone would have arrived");
  assert.equal(a.remaining, 6.2);
});

// ── the decision Robert forced ─────────────────────────────────────────────

test("four noisy readings produce NO projection", () => {
  // 266 → 267 → 266.2 → 263 is noise. A dashed line through it is a confident
  // answer to a question the data cannot answer, and the first time it is wrong
  // the client stops believing the screen — including the parts that were right.
  const a = analyseGoal(goal({ targetValue: 245, targetDate: "2026-12-01" }), ROBERT, TODAY)!;
  assert.equal(a.thin, true);
  assert.equal(a.projected, null, "a line was drawn through four noisy points");
  assert.equal(a.arrivesOn, null);
  assert.equal(a.status, "too_thin");
  // But the REQUIRED rate is still honest and still useful — it needs no
  // projection, only arithmetic.
  assert.ok(a.needRate > 0 && Number.isFinite(a.needRate));
});

test("the thresholds are the ones the header argues for", () => {
  assert.equal(MIN_READINGS_TO_PROJECT, 5);
  assert.equal(MIN_SPAN_DAYS_TO_PROJECT, 30);
  // Lauren has exactly 5 over three months — she must project, because her
  // plateau IS the finding. A rule cautious enough to hide it would be
  // protecting her from the one fact that matters.
  assert.equal(analyseGoal(goal(), LAUREN, TODAY)!.thin, false);
});

// ── the happy path ─────────────────────────────────────────────────────────

test("Dustin reads as on track, and arrives before the date", () => {
  const a = analyseGoal(goal({ targetValue: 185, targetDate: "2026-09-30" }), DUSTIN, TODAY)!;
  assert.equal(a.status, "on_track");
  assert.ok(a.rate! < 0, "he is losing");
  assert.ok(a.projected! < 185, "the projection should clear the target");
  assert.ok(a.arrivesOn! < "2026-09-30", `should arrive early, got ${a.arrivesOn}`);
  assert.equal(a.remaining, 3.6);
});

// ── the direction trap ─────────────────────────────────────────────────────

test("a goal that goes UP works too, and is not treated as failing", () => {
  // Lean mass rises. Every "remaining", "on track" and "percent" calculation
  // has to be signed toward the target rather than assuming down-is-good —
  // this is the classic way a composition goal ends up permanently red.
  const gain = r([["2026-05-04", 140], ["2026-06-04", 143], ["2026-07-04", 146], ["2026-08-04", 149], ["2026-08-11", 150]]);
  const a = analyseGoal(
    goal({ metric: "lean_mass", targetValue: 155, targetDate: "2026-10-15", startValue: 140, startDate: "2026-05-04" }),
    gain, TODAY,
  )!;
  assert.equal(a.stalled, false, "a rising lean-mass goal was read as stalled");
  assert.equal(a.remaining, 5);
  assert.ok(a.percent > 60 && a.percent < 80, `percent should reflect 10 of 15 gained, got ${a.percent}`);
  assert.equal(a.status, "on_track");
});

test("already past the target reads as hit, not as overshooting", () => {
  const a = analyseGoal(goal({ targetValue: 195, targetDate: "2026-09-30" }), DUSTIN, TODAY)!;
  assert.equal(a.status, "hit");
  assert.ok(a.remaining <= 0);
});

// ── the stored start ───────────────────────────────────────────────────────

test("the goal's own start is used, not the earliest reading", () => {
  // Deriving the start from history means a backfilled old weigh-in silently
  // re-anchors the goal and the progress meter jumps, with nothing on screen
  // explaining why. Where somebody started is a fact about the day the goal was
  // set, so the goal carries it.
  const withStart = analyseGoal(goal({ startValue: 150, startDate: "2026-06-23" }), LAUREN, TODAY)!;
  const derived = analyseGoal(goal(), LAUREN, TODAY)!;
  assert.notEqual(withStart.percent, derived.percent);
  assert.equal(withStart.start, 150);
  assert.equal(derived.start, 158);
});

test("no readings at all returns null rather than a fabricated analysis", () => {
  assert.equal(analyseGoal(goal(), [], TODAY), null);
});

// ── the fix the coach offers ───────────────────────────────────────────────

test("the calorie estimate is rounded coarsely, because it is a rule of thumb", () => {
  // 3,500 kcal per pound is a rule of thumb, not physiology. Rounding to 25
  // keeps the copy from implying a precision it has not got — "roughly 350 a
  // day" is honest, "347 a day" is not.
  assert.equal(kcalPerDayFor(0.7), 350);
  assert.equal(kcalPerDayFor(1), 500);
  assert.equal(kcalPerDayFor(-1), 500, "direction must not matter");
  assert.equal(kcalPerDayFor(0.7) % 25, 0);
});
