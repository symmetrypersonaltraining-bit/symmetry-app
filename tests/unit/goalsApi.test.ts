import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE RULES THE GOALS ROUTE EXISTS TO ENFORCE.
 *
 * Dustin's decision, from the mock-up round: goals can be set by either side,
 * "and his are visible AS his, and are refusable."
 *
 * That word is the whole feature. A goal the client did not agree to is a
 * number somebody else picked, and the honest thing is for the app to say so
 * rather than start drawing a line as if it were theirs. Which means:
 *
 *   · a trainer-set goal lands PROPOSED and tracks nothing until answered;
 *   · only the client may answer it — if the trainer can click "accepted" then
 *     "they agreed to this" means nothing and the state is decoration;
 *   · 'declined' is kept, not deleted.
 *
 * These are checked at the source because the route needs a live database and a
 * session to exercise end to end, and the rules are worth more than the
 * coverage: every one of them is a thing that would be quietly convenient to
 * relax later.
 */

const ROOT = process.cwd();
const SRC = readFileSync(join(ROOT, "src/app/api/goals/route.ts"), "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a goal set for somebody else is proposed, not active", () => {
  assert.match(CODE, /settingForSomeoneElse = isTrainer && clientId !== ownClientId/);
  assert.match(CODE, /status: settingForSomeoneElse \? "proposed" : "active"/);
});

test("only the client may accept or decline their own goal", () => {
  assert.match(
    CODE,
    /if \(goal\.client_id !== ownClientId\) \{[\s\S]{0,200}Only the client can answer/,
    "the trainer can now answer a proposal on the client's behalf",
  );
});

test("declining keeps the row", () => {
  assert.match(CODE, /status: "declined"/);
  assert.ok(!/\.delete\(\)/.test(CODE), "the route deletes goal rows — a declined goal is worth keeping");
});

test("the client id never comes from the request body for a non-trainer", () => {
  // The body is attacker-controlled; ownClientId is read from the session.
  assert.match(CODE, /const clientId = body\.clientId && isTrainer \? String\(body\.clientId\) : ownClientId/);
  assert.match(CODE, /if \(!isTrainer && body\.clientId && body\.clientId !== ownClientId\)/);
});

test("where they started is stored, not derived", () => {
  // Deriving it re-anchors the goal the moment somebody backfills an old
  // weight, and the progress meter jumps with nothing to explain why.
  assert.match(CODE, /start_value: startValue/);
  assert.match(CODE, /start_date: today/);
});

test("a second running goal for the same metric is refused with a sentence", () => {
  assert.match(CODE, /\.in\("status", \["proposed", "active"\]\)/);
  assert.match(CODE, /already a goal running for that/);
});

test("targets and dates are bounded", () => {
  assert.match(CODE, /LIMITS: Record<GoalMetric, \[number, number\]>/);
  assert.match(CODE, /MAX_HORIZON_DAYS/);
  assert.match(CODE, /MIN_HORIZON_DAYS/);
  // The validator is called on both paths, not just the create one.
  assert.ok((CODE.match(/validate\(metric, /g) || []).length >= 2, "adjust skips validation");
});

test("a trainer adjusting a client's goal makes it a proposal again", () => {
  assert.match(CODE, /becomesProposed = isTrainer && goal\.client_id !== ownClientId/);
  assert.match(CODE, /accepted_at: becomesProposed \? null : undefined/);
});

test("the roll-forward cron is scheduled", () => {
  const vercel = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8")) as { crons: { path: string }[] };
  assert.ok(
    vercel.crons.some((c) => c.path.startsWith("/api/cron/goals")),
    "nothing rolls goals forward — a passed date will just sit there",
  );
});

test("the cron is gated on the shared cron check", () => {
  const cron = readFileSync(join(ROOT, "src/app/api/cron/goals/route.ts"), "utf8");
  assert.match(cron, /isCronRequest\(req\)/, "the goals cron is callable by anyone");
});
