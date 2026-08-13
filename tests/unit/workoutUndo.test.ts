import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Dustin's first requirement of the trainer agent, 2026-08-12: "Anything you
// can do in the app, with undo on all of it."
//
// Programming was the hole in "all of it". adjust_workout logged a null undo
// payload and said so in the reply: "workout edits cannot be auto-undone —
// re-adjust to change them back." It also DELETES prescribed_exercises rows on
// a `remove` op, which is a destructive write with no backup; his standing rule
// is a bak_* table before any of those.
//
// And it was written twice. The route and the agent each carried a
// byte-identical copy of applyProposal, so the audit trail existed on one path
// and not the other depending on which one you happened to use.

const ROOT = process.cwd();
const LIB = fs.readFileSync(path.join(ROOT, "src/lib/ai/workoutAdjust.ts"), "utf8");
const ROUTE = fs.readFileSync(path.join(ROOT, "src/app/api/workout-assist/route.ts"), "utf8");
const TOOLS = fs.readFileSync(path.join(ROOT, "src/lib/ai/agent-tools.ts"), "utf8");

test("applyProposal exists once, and the route uses that one", () => {
  assert.match(LIB, /export async function applyProposal\(/, "applyProposal has left the shared lib");
  assert.doesNotMatch(
    ROUTE,
    /function applyProposal\(/,
    "the route has grown its own copy of applyProposal again — the two WILL drift, and the last time they did, " +
      "one path recorded an undo payload and the other did not"
  );
  assert.match(ROUTE, /from "@\/lib\/ai\/workoutAdjust"/);
});

test("a deleted prescribed exercise is captured in full before it is deleted", () => {
  // The log row IS the backup. If the read moves after the delete, or narrows
  // to a column list, the row cannot be put back.
  const removeBranch = LIB.slice(LIB.indexOf('ch.op === "remove"'), LIB.indexOf('ch.op === "modify"'));
  const readAt = removeBranch.indexOf('.select("*")');
  const deleteAt = removeBranch.indexOf(".delete()");
  assert.ok(readAt > -1, "the row is no longer read whole before deletion — it cannot be restored from a partial copy");
  assert.ok(deleteAt > -1, "the remove branch no longer deletes anything; this test is looking at the wrong code");
  assert.ok(readAt < deleteAt, "the backup read happens AFTER the delete, so it reads nothing");
  assert.match(removeBranch, /op: "reinsert"/, "a deleted exercise records no way back");
});

test("cloning a day is reversed by repointing and dropping the copy, not row by row", () => {
  // When applyProposal clones, every edit lands on fresh rows in a fresh day.
  // Undoing those one at a time would leave the sessions pointing at the copy.
  assert.match(LIB, /op: "repoint"/, "the clone path records no way back to the original day");
  assert.match(LIB, /op: "delete", table: "days"/, "the cloned day is left behind on undo");
});

test("both callers record the action, so undo does not depend on which one ran", () => {
  assert.match(ROUTE, /ai_action_log/, "an apply from the AI drawer leaves no audit row and cannot be undone");
  const adjust = TOOLS.slice(TOOLS.indexOf('name === "adjust_workout"'), TOOLS.indexOf('name === "set_macro_targets"'));
  assert.match(
    adjust,
    /logAction\(db, "adjust_workout", clientId, [^,]+, res\.undo\)/,
    "the agent is logging a null undo payload again"
  );
  assert.doesNotMatch(adjust, /cannot be auto-undone/, "the reply still tells him workout edits are irreversible");
});

test("the undo executor replays the steps newest-first and survives a dead row", () => {
  const branch = TOOLS.slice(TOOLS.indexOf('u.kind === "workout_adjust"'), TOOLS.indexOf('u.kind === "gcal_delete"'));
  assert.match(
    branch,
    /for \(let i = steps\.length - 1; i >= 0; i--\)/,
    "steps are replayed forwards; a later change can depend on an earlier one, so reversal must run backwards"
  );
  assert.match(branch, /catch/, "one dead row aborts the whole reversal and leaves the workout half-undone");
});
