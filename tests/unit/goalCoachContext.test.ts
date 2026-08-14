import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { goalContextBlock } from "../../src/lib/ai/goalContext";
import { analyseGoal, type Goal, type Reading } from "../../src/lib/goals";

/**
 * THE COACH MUST NOT DO ITS OWN ARITHMETIC.
 *
 * Dustin: "make sure the AI bot in the progress tab is able to understand and
 * read all of this as well."
 *
 * The failure this guards is subtle and bad: the card says "behind — flat 16
 * days", the client asks the ✦ how they're doing, and the model — handed a list
 * of weigh-ins — works out a six-week slope, gets a different answer, and says
 * "you're on track". Both are on screen at once. The client cannot tell which
 * to believe, so they believe neither, including all the parts that were right.
 *
 * So the coach is handed the OUTPUT of analyseGoal, not the inputs, and these
 * tests check that end of the contract with real client shapes.
 */

const ROOT = process.cwd();

/** A minimal stub of the two tables goalContextBlock reads. */
function db(goals: Record<string, unknown>[], metrics: Record<string, unknown>[]) {
  const chain = (rows: Record<string, unknown>[]) => {
    const self: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "order", "limit", "gte", "lte"]) {
      self[k] = () => self;
    }
    self.then = (res: (v: { data: Record<string, unknown>[] }) => unknown) => res({ data: rows });
    return self;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (t: string) => chain(t === "client_goals" ? goals : metrics) } as any;
}

/** Lauren Standefer's real rows — the case that inverts by window size. */
const LAUREN: Reading[] = [
  { date: "2026-05-04", value: 158 },
  { date: "2026-06-01", value: 153 },
  { date: "2026-06-22", value: 150.2 },
  { date: "2026-07-20", value: 146.2 },
  { date: "2026-08-05", value: 146.2 },
];

const laurenGoalRow = {
  id: "g1", metric: "weight", target_value: 140, target_date: "2026-10-31",
  start_value: 158, start_date: "2026-05-04", set_by: "trainer", status: "active", note: null,
};
const laurenMetricRows = LAUREN.map((r) => ({ metric_date: r.date, weight: r.value, body_fat_pct: null, lean_mass: null }));

test("a stalled client's block says BOTH true things, not the flattering one", async () => {
  const block = await goalContextBlock(db([laurenGoalRow], laurenMetricRows), "c1", "2026-08-14");
  assert.ok(block, "no goal block produced for a client with an active goal");
  assert.match(block!, /STALLED/);
  // The six-week trend is kept, not overwritten — it is half the honest answer.
  assert.match(block!, /trend would land them at/);
  assert.match(block!, /BOTH must be said/);
  assert.match(block!, /do not lead with the flattering one/i);
});

test("every number in the block is one analyseGoal produced", async () => {
  const goal: Goal = {
    id: "g1", metric: "weight", targetValue: 140, targetDate: "2026-10-31",
    startValue: 158, startDate: "2026-05-04", setBy: "trainer", status: "active",
  };
  const a = analyseGoal(goal, LAUREN, "2026-08-14")!;
  const block = (await goalContextBlock(db([laurenGoalRow], laurenMetricRows), "c1", "2026-08-14"))!;

  // The four the client is most likely to quote back at the screen.
  assert.ok(block.includes(`${a.now} lb`), "current value differs from the card's");
  assert.ok(block.includes(`${a.start} lb`), "start value differs from the card's");
  assert.ok(block.includes(`${a.percent}%`), "percent differs from the card's");
  assert.ok(block.includes(`${a.trendProjected} lb`), "the trend projection differs from the card's");
});

test("a thin history gets no projection and an explicit ban on inventing one", async () => {
  // Robert Miller: four readings over seven weeks, 266 → 267 → 266.2 → 263.
  const rows = [
    { metric_date: "2026-06-02", weight: 266, body_fat_pct: null, lean_mass: null },
    { metric_date: "2026-06-20", weight: 267, body_fat_pct: null, lean_mass: null },
    { metric_date: "2026-07-08", weight: 266.2, body_fat_pct: null, lean_mass: null },
    { metric_date: "2026-07-22", weight: 263, body_fat_pct: null, lean_mass: null },
  ];
  const goalRow = { ...laurenGoalRow, target_value: 240, start_value: 266, start_date: "2026-06-02" };
  const block = (await goalContextBlock(db([goalRow], rows), "c1", "2026-08-14"))!;

  assert.match(block, /NOT ENOUGH DATA TO PROJECT/);
  assert.match(block, /Do NOT state or imply a finish date/);
  assert.ok(!/At the current rate they land at/.test(block), "a projection leaked into a thin block");
});

test("a proposed goal is described as refusable, not as a fact", async () => {
  const block = (await goalContextBlock(
    db([{ ...laurenGoalRow, status: "proposed", note: "Let's aim here by Halloween" }], laurenMetricRows),
    "c1",
    "2026-08-14",
  ))!;
  assert.match(block, /AWAITING THEIR ANSWER/);
  assert.match(block, /allowed to say no/);
  // Never a pace verdict on something they have not agreed to.
  assert.ok(!/STALLED|At the current rate/.test(block), "a proposed goal was judged for pace");
});

test("no goal means no block at all, rather than a line saying there is none", async () => {
  assert.equal(await goalContextBlock(db([], laurenMetricRows), "c1", "2026-08-14"), null);
});

test("a broken query returns null instead of taking the coach card down", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const boom = { from: () => { throw new Error("relation does not exist"); } } as any;
  assert.equal(await goalContextBlock(boom, "c1", "2026-08-14"), null);
});

test("the coach context actually mounts the block", () => {
  const src = readFileSync(join(ROOT, "src/lib/ai/coach-context.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(src, /goalContextBlock\(db, clientId, today\)/);
  // Both assemblies: the nutrition/global coach AND the training one behind the
  // Progress and workout surfaces. Wiring one and not the other is how the coach
  // ends up knowing about a goal on one screen and not the next.
  assert.equal(
    (src.match(/goalContextBlock\(db, clientId, today\)/g) || []).length,
    2,
    "the goal block is wired into only one of the two context assemblies",
  );
  assert.equal((src.match(/if \(goalBlock\) lines\.push\(goalBlock\);/g) || []).length, 2);
});

test("the model is told in as many words not to recompute", () => {
  const src = readFileSync(join(ROOT, "src/lib/ai/goalContext.ts"), "utf8");
  assert.match(src, /Do NOT recalculate a rate, a projection or a finish date/);
});
