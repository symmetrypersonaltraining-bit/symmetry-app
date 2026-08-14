import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planRollForward, MAX_ROLL_DAYS, MIN_ROLL_DAYS } from "../../src/lib/goalRollForward";
import type { Goal, Reading } from "../../src/lib/goals";

/**
 * A DATE THAT PASSES IS NOT A FAILURE.
 *
 * Dustin: "rolls forward at the pace actually achieved; the old attempt stays
 * visible. Nothing framed as a failure, nothing hidden."
 *
 * The trap is the stalled client. Extrapolating from a rate of zero gives a
 * target date of never, and printing "arriving ~2031" to somebody who has had a
 * hard month is worse than saying nothing at all. So these tests care most
 * about what happens when there is NO honest pace to roll on.
 */

const ROOT = process.cwd();

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "g", metric: "weight", targetValue: 180, targetDate: "2026-08-01",
  startValue: 200, startDate: "2026-04-01", setBy: "client", status: "active", ...over,
});

/** Steady loss, still short on the target date. */
const STEADY: Reading[] = [
  { date: "2026-04-01", value: 200 },
  { date: "2026-05-01", value: 195 },
  { date: "2026-06-01", value: 191 },
  { date: "2026-07-01", value: 188 },
  { date: "2026-07-28", value: 186 },
];

test("a passed date rolls to a new one computed from the real pace", () => {
  const p = planRollForward(goal(), STEADY, "2026-08-14");
  assert.ok(p, "a goal past its date and not reached was left alone");
  assert.equal(p!.fromPace, true);
  assert.ok(p!.targetDate > "2026-08-14", "the new date is not in the future");
  assert.equal(p!.startValue, 186, "the new goal starts from where they actually are");
  assert.equal(p!.startDate, "2026-08-14");
  assert.ok(!/fail|missed/i.test(p!.note), `the copy calls it a failure: "${p!.note}"`);
});

test("a stalled client does not get a date extrapolated from zero", () => {
  const flat: Reading[] = [
    { date: "2026-04-01", value: 200 },
    { date: "2026-05-01", value: 195 },
    { date: "2026-06-01", value: 191 },
    { date: "2026-07-05", value: 190 },
    { date: "2026-07-28", value: 190 },
  ];
  const p = planRollForward(goal(), flat, "2026-08-14")!;
  assert.equal(p.fromPace, false, "a flat month was treated as a pace worth projecting");
  assert.ok(p.targetDate <= "2027-02-11", "the fallback reached further than the cap allows");
  assert.match(p.note, /fresh run/i);
});

test("a thin history gets the fallback, not a two-point guess", () => {
  const thin: Reading[] = [
    { date: "2026-07-20", value: 199 },
    { date: "2026-07-28", value: 197 },
  ];
  const p = planRollForward(goal(), thin, "2026-08-14")!;
  assert.equal(p.fromPace, false, "two readings eight days apart were used to project a date");
});

test("the new date is bounded at both ends", () => {
  // Nearly there at a fast pace would otherwise roll to tomorrow, which reads
  // as the app moving the goalposts under them.
  const nearly: Reading[] = [
    { date: "2026-04-01", value: 200 },
    { date: "2026-05-01", value: 193 },
    { date: "2026-06-01", value: 187 },
    { date: "2026-07-01", value: 182 },
    { date: "2026-07-28", value: 180.2 },
  ];
  const p = planRollForward(goal(), nearly, "2026-08-14")!;
  const days = (Date.parse(p.targetDate) - Date.parse("2026-08-14")) / 86_400_000;
  assert.ok(days >= MIN_ROLL_DAYS - 1, `rolled only ${days} days ahead`);
  assert.ok(days <= MAX_ROLL_DAYS + 1, `rolled ${days} days ahead`);
});

test("a goal that was reached is not rolled — that is a celebration", () => {
  const there = [...STEADY, { date: "2026-07-30", value: 179 }];
  assert.equal(planRollForward(goal(), there, "2026-08-14"), null);
});

test("a goal whose date has not arrived is left alone", () => {
  assert.equal(planRollForward(goal({ targetDate: "2026-12-01" }), STEADY, "2026-08-14"), null);
});

test("only active goals roll", () => {
  for (const status of ["proposed", "declined", "rolled", "hit", "closed"] as const) {
    assert.equal(planRollForward(goal({ status }), STEADY, "2026-08-14"), null, `a ${status} goal rolled`);
  }
});

test("a gaining goal rolls the same way a losing one does", () => {
  // Lean mass goes UP. None of the arithmetic may care which direction.
  const lean: Reading[] = [
    { date: "2026-04-01", value: 140 },
    { date: "2026-05-01", value: 142 },
    { date: "2026-06-01", value: 144 },
    { date: "2026-07-01", value: 146 },
    { date: "2026-07-28", value: 147 },
  ];
  const p = planRollForward(
    goal({ metric: "lean_mass", targetValue: 155, startValue: 140 }),
    lean, "2026-08-14",
  );
  assert.ok(p, "a lean-mass goal past its date did not roll");
  assert.equal(p!.fromPace, true);
  assert.equal(p!.startValue, 147);
});

test("the cron retires the old goal before inserting its replacement", () => {
  // Order matters: the partial unique index allows one running goal per metric,
  // so inserting first would collide with the row it is replacing.
  const src = readFileSync(join(ROOT, "src/app/api/cron/goals/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const retire = src.indexOf('status: "rolled"');
  const insert = src.indexOf('.from("client_goals").insert(');
  assert.ok(retire > -1 && insert > -1);
  assert.ok(retire < insert, "the successor is inserted before the old goal is retired — that hits the unique index");
  // And the retire is guarded on still being active, so two overlapping runs
  // cannot both roll the same goal.
  assert.match(src, /\.eq\("id", goal\.id\)\.eq\("status", "active"\)/);
});

test("a rolled goal is not re-proposed", () => {
  const src = readFileSync(join(ROOT, "src/app/api/cron/goals/route.ts"), "utf8");
  assert.match(
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
    /status: "active",\s*\n\s*accepted_at: new Date\(\)\.toISOString\(\),\s*\n\s*rolled_from_id/,
    "a rolled goal now needs accepting again — they already agreed to this number",
  );
});
