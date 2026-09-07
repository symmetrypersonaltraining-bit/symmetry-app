import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ASSESSMENT_RULES, CORRECTION_RULES } from "../../src/lib/ai/assessmentContext";

// THE WORST SEQUENCE THIS APP CAN PRODUCE.
//
// It states something false. The client corrects it. It agrees. Nothing
// changes. Being wrong once is a mistake; agreeing you were wrong and leaving
// it wrong tells the person their input does not matter, and they find it still
// wrong the next morning.
//
// Until 5 Sep that was the ONLY thing available. The client-facing AI's seven
// tools were schedule, options, move, swap, add, log weight, training summary —
// not one could mark a session done. So "you're right, sorry about that" was
// the whole of it, by construction.
//
// Dustin, 5 Sep, choosing between believe-them, believe-them-and-flag-me, and
// do-not-let-them: (a). They say they did it, it is marked done.

const ROOT = process.cwd();
const actions = fs.readFileSync(path.join(ROOT, "src/lib/ai/clientActions.ts"), "utf8");

test("the client AI can actually fix it", () => {
  assert.ok(/name: "i_did_do_that"/.test(actions), "the correction tool is gone — the AI is back to apologising and changing nothing");
  assert.ok(
    /if \(name === "i_did_do_that"\)/.test(actions),
    "the tool is offered but not implemented, which is worse than not offering it",
  );
  assert.ok(
    /\.update\(\{ status: now, updated_at/.test(actions),
    "the correction no longer writes to scheduled_workouts — an apology that changes nothing is the bug",
  );
});

test("it is reversible, and a no-op says so", () => {
  assert.ok(/done=false/.test(actions), "there is no way to undo a correction, so a mistaken one is permanent");
  assert.ok(
    /No change needed/.test(actions),
    "the tool claims to have fixed something it did not touch when the app was already right — its own small lie",
  );
});

test("every correction is recorded, and recording it can never cost the fix", () => {
  assert.ok(/ai_corrections/.test(actions), "corrections are no longer recorded");
  const i = actions.indexOf('.update({ status: now, updated_at');
  const j = actions.indexOf('ai_corrections');
  assert.ok(j > i, "the correction is logged BEFORE the fix is written — a logging failure would cost the client their correction");
  assert.ok(
    /the correction itself stands/.test(actions),
    "the log's failure is no longer swallowed, so it can now take the fix down with it",
  );
});

test("the wording rules ship with the context", () => {
  assert.ok(/never say "my records show"/i.test(CORRECTION_RULES), "the ban on arguing with the client is gone");
  assert.ok(/FIX THE RECORD, not just the conversation/.test(CORRECTION_RULES), "the rule that a correction must change the database is gone");
  assert.ok(
    /never "sorry about that" on its own/i.test(CORRECTION_RULES),
    "the rote apology is allowed again, and it is the worst-testing kind there is",
  );
  assert.ok(
    /IF YOU SPOT YOUR OWN ERROR FIRST/.test(CORRECTION_RULES),
    "self-correction is no longer asked for; catching it yourself costs almost nothing and being caught costs a great deal",
  );
  assert.ok(
    /IF THEY ARE MISTAKEN/.test(CORRECTION_RULES),
    "nothing stops it agreeing with something untrue to be pleasant, which gets the record wrong in the other direction",
  );
});

test("the rules reach the client, not just the file", () => {
  const ctx = fs.readFileSync(path.join(ROOT, "src/lib/ai/assessmentContext.ts"), "utf8");
  // Both branches: a client with an assessment and one without. The second is
  // half the roster, and they are no less likely to correct the app.
  const uses = ctx.match(/\$\{CORRECTION_RULES\}/g) || [];
  assert.ok(uses.length >= 2, "the correction rules are missing from one of the two context branches");
  assert.ok(ASSESSMENT_RULES.length > 100, "the assessment rules went missing alongside them");
});
