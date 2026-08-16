// Guard: the agent does not say "Undone" when nothing was undone.
//
// The undo block in agent-tools.ts is written as one big try/catch over
// PostgREST calls. That reads as careful and is the opposite: **a PostgREST
// call RETURNS its error, it does not throw**, so the catch could never fire.
// Every failed reversal fell out of the bottom of the block and answered
// `Undone: <summary>` — the agent telling Dustin, in prose, that a change had
// been rolled back when the row was untouched.
//
// The file already knew. Three branches in, its own comment reads: "the undo
// would silently do nothing and report success — which is worse than not
// offering undo at all." That comment was written about a MISSING branch; the
// same sentence was true of every branch that was present.
//
// The workout_adjust loop is the sharpest case. It collects `failures` and
// throws when EVERY step failed — a genuinely careful design that could not
// work, because the inner try/catch collected nothing either. A reversal in
// which every single step was refused reported a clean undo.
//
// The fix is `must()`: run the write, throw on error, so the surrounding code
// behaves the way it was already written to behave.
//
// Also pinned here: `assign_program` deactivating the client's current
// programme before inserting the new one. Unchecked, the insert ran anyway and
// left TWO active assignments — which is precisely the state `advance_phase`
// records breaking on in its own comment ("she has TWO, PGRST116 was raised").
// The write that prevents it was the one write nobody was checking.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = readFileSync(join(process.cwd(), "src/lib/ai/agent-tools.ts"), "utf8");
/** This file's comments name the bug, so they must not satisfy the test. */
const code = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const undoBlock = (() => {
  const i = code.indexOf('if (name === "undo_action")');
  assert.ok(i > 0, "undo_action tool not found");
  return code.slice(i, code.indexOf("return `Unknown tool", i));
})();

test("must() throws on a returned error, which is what makes the catch real", () => {
  const i = code.indexOf("async function must");
  assert.ok(i > 0, "must() is gone — the try/catch below it is decorative again");
  const body = code.slice(i, i + 320);
  assert.match(body, /if \(r\.error\) throw new Error/);
});

for (const kind of [
  "message",
  "delete_row",
  "sw_restore_date",
  "restore_row",
  "macro_targets",
  "reassign_program",
]) {
  test(`the ${kind} reversal can fail`, () => {
    const i = undoBlock.indexOf(`u.kind === "${kind}"`);
    assert.ok(i > 0, `${kind} branch not found`);
    // Up to the next branch.
    const next = undoBlock.indexOf("} else if (u.kind ===", i + 10);
    const branch = undoBlock.slice(i, next === -1 ? i + 900 : next);
    const writes = (branch.match(/db\s*\n?\s*\.from\(/g) || []).length;
    const guarded = (branch.match(/must\(\s*\n?\s*db/g) || []).length;
    assert.ok(writes > 0, `${kind} makes no writes — the branch moved`);
    assert.equal(guarded, writes, `${kind}: ${writes} writes, ${guarded} of them able to report a failure`);
  });
}

test("reassign_program's undo restores the old programme AND stands down the new one", () => {
  // One without the other leaves the client on no programme, or on two.
  const i = undoBlock.indexOf('u.kind === "reassign_program"');
  const branch = undoBlock.slice(i, undoBlock.indexOf("} else if (u.kind ===", i + 10));
  assert.match(branch, /active: false/);
  assert.match(branch, /active: true/);
});

test("a workout_adjust reversal where every step failed is not reported as done", () => {
  const i = undoBlock.indexOf('u.kind === "workout_adjust"');
  const branch = undoBlock.slice(i, undoBlock.indexOf("} else if (u.kind ===", i + 10));
  for (const op of ["reinsert", "restore", "delete", "repoint"]) {
    assert.match(
      branch,
      new RegExp(`must\\(db\\.from\\([^)]*\\)\\.(insert|update|delete)[^;]*"${op}"\\)`),
      `the ${op} step still cannot register a failure, so failures stays empty`,
    );
  }
  assert.match(branch, /failures\.length === steps\.length/, "the all-failed check is gone");
});

test("an undo that succeeded but could not be marked says so", () => {
  // The change IS reversed, so this cannot fail the undo — but an unmarked row
  // stays undoable, and a second undo applies the reversal twice.
  assert.match(undoBlock, /const \{ error: markErr \} = await db/);
  assert.match(undoBlock, /don't undo it again/);
});

test("the two undo_error notes are unchecked ON PURPOSE and say why", () => {
  // They record a failure that is already being reported to Dustin by the
  // return value. A future sweep should not re-litigate them.
  const notes = RAW.match(/Deliberately unchecked/g) || [];
  assert.equal(notes.length, 2, "an unchecked write in this file lost its justification");
});

// ── assign_program ─────────────────────────────────────────────────────────

test("assign_program does not leave a client on two programmes", () => {
  const i = code.indexOf('if (name === "assign_program")');
  assert.ok(i > 0);
  const body = code.slice(i, code.indexOf('if (name === "advance_phase")', i));
  assert.match(body, /const \{ error: deactErr \} = await db/, "the deactivate is unchecked again");
  const guard = body.indexOf("if (deactErr)");
  const insert = body.indexOf(".insert({ client_id: clientId, program_id: programId");
  assert.ok(guard > 0, "no failure branch");
  assert.ok(guard < insert, "the new assignment is inserted before the old one is known to be closed");
});

// ── the audit row ──────────────────────────────────────────────────────────

test("a failed action log can actually be logged", () => {
  // Wrapping it in try/catch could not work, so the console line that exists to
  // report it has never once fired. No ai_action_log row means undo_action can
  // never reverse that change.
  const i = code.indexOf("async function logAction");
  const body = code.slice(i, i + 700);
  assert.match(body, /const \{ error \} = await db\.from\("ai_action_log"\)\.insert/);
  assert.match(body, /if \(error\) console\.error/);
});
