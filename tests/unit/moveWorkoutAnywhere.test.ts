// Guard: a workout can be moved from anywhere to anywhere. No exceptions.
//
// Dustin, 15 Aug, having said it before:
//
//   "last time im saying this.. we can all move workouts from anywhere to
//    anywhere period. I don't care if its scheduled, past, future, logged, not
//    logged, mid session. no reason to have any restraint here. we can move
//    workouts where ever we want period."
//
// What it cost before. Bobbie Page, 14 Aug: "It won't let me move my cardio
// from yesterday (friday) to today. Tried manually and it won't work. Tried ai
// and i got frustrated because it wasnt working and stopped trying."
//
// Her Friday cardio was `scheduled` and untouched. The AI could not see it,
// because my_schedule defaulted to TODAY FORWARD — and instead of saying so it
// produced a confident, false explanation: that she had logged it as a separate
// entry. She has no workout log on 14 Aug at all.
//
// So this file guards two different failures, and the second is the worse one:
//   1. restrictions that refuse a legitimate move
//   2. a read window so narrow the model cannot see what it is being asked about

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT_ACTIONS = readFileSync(join(process.cwd(), "src/lib/ai/clientActions.ts"), "utf8");
const AGENT_TOOLS = readFileSync(join(process.cwd(), "src/lib/ai/agent-tools.ts"), "utf8");
/** Strip comments — this file's own explanations name the removed guards. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Just the body of one `if (name === "x") { … }` tool handler. */
function handler(src: string, name: string): string {
  const start = src.indexOf(`if (name === "${name}")`);
  assert.ok(start > 0, `no handler for ${name}`);
  const next = src.indexOf('if (name === "', start + 20);
  return src.slice(start, next === -1 ? src.length : next);
}

test("a completed workout can be moved — this was the explicit refusal", () => {
  const move = handler(code(CLIENT_ACTIONS), "move_my_workout");
  assert.doesNotMatch(
    move,
    /status === "completed"/,
    'the "already logged as done, so it can\'t be moved" guard must stay gone'
  );
  assert.doesNotMatch(move, /can't be moved|cannot be moved/i);
});

test("there is no date window on a move", () => {
  // A 60-day cap meant a client backfilling last quarter, or planning a block
  // further out, was told to go and ask their coach.
  assert.doesNotMatch(code(CLIENT_ACTIONS), /MAX_MOVE_DAYS/, "the window constant must be gone entirely");
  const move = handler(code(CLIENT_ACTIONS), "move_my_workout");
  assert.doesNotMatch(move, /days away/i);
});

test("adding a workout has no date window either", () => {
  const add = handler(code(CLIENT_ACTIONS), "add_my_workout");
  assert.doesNotMatch(add, /days away/i);
  assert.doesNotMatch(add, /MAX_MOVE_DAYS/);
});

test("ownership is still checked — that is not a restraint, it is the wall", () => {
  // "No restrictions" means no restrictions on WHERE a workout goes. It does
  // not mean one client can move another's session.
  const move = handler(code(CLIENT_ACTIONS), "move_my_workout");
  assert.match(move, /row\.client_id !== clientId/, "a client may only move their own");
  assert.match(move, /\.eq\("client_id", clientId\)/, "…enforced on the write as well as the read");
});

test("the client's schedule read looks BACKWARDS — Bobbie's actual bug", () => {
  const sched = handler(code(CLIENT_ACTIONS), "my_schedule");
  assert.match(sched, /shift\(today, -14\)/, "the default range must start before today");
  assert.doesNotMatch(
    sched,
    /: today;/,
    "defaulting `from` to today is what hid Friday's session from the model"
  );
});

test("the trainer's schedule read looks backwards and shows every status", () => {
  const cw = handler(code(AGENT_TOOLS), "client_workouts");
  assert.doesNotMatch(cw, /\.eq\("status", "scheduled"\)/, "a completed session must still be listed");
  assert.doesNotMatch(cw, /\.gte\("scheduled_date", today\)/, "yesterday must be visible");
  assert.match(cw, /14 \* 86400000/, "…by looking two weeks back");
});

test("the trainer can move a workout at all — there was no tool for it", () => {
  // move_session moves a GOOGLE CALENDAR appointment. Nothing moved a workout.
  const src = code(AGENT_TOOLS);
  assert.match(src, /name: "move_workout"/, "the tool must exist");
  const h = handler(src, "move_workout");
  assert.match(h, /scheduled_date: date, moved_from_date: row\.scheduled_date/, "and actually write the move");
  // No status check anywhere in the handler.
  assert.doesNotMatch(h, /status === "completed"/);
  assert.doesNotMatch(h, /days away/i);
});

test("a move is reversible, which is why nothing needs forbidding", () => {
  const h = handler(code(AGENT_TOOLS), "move_workout");
  assert.match(h, /moved_from_date: row\.scheduled_date/, "the origin is recorded on the row");
  assert.match(h, /logAction\(db, "move_workout"/, "and registered for undo");
  assert.match(h, /kind: "sw_restore_date"/);
  // The undo must be WIRED. A logged undo with no branch to execute it reports
  // success and does nothing, which is worse than offering no undo.
  const undo = handler(code(AGENT_TOOLS), "undo_action");
  assert.match(undo, /u\.kind === "sw_restore_date"/, "the undo branch must exist");
  assert.match(undo, /scheduled_date: u\.scheduled_date as string/, "…and put the date back");
});

test("the tool descriptions tell the model there are no limits", () => {
  // The model refusing on its own is indistinguishable, to Bobbie, from the
  // app refusing. Both descriptions say so explicitly.
  assert.match(CLIENT_ACTIONS, /ANY workout can be moved to ANY date/);
  assert.match(CLIENT_ACTIONS, /never invent one/);
  assert.match(AGENT_TOOLS, /ANY workout can go to ANY date/);
  assert.match(AGENT_TOOLS, /There are NO restrictions/);
});

test("the model is told to admit it cannot see something, not to theorise", () => {
  // This is the half of Bobbie's incident that a permissions change alone does
  // not fix: it invented a history for her rather than saying "I can't find it".
  assert.match(CLIENT_ACTIONS, /widen the range with `from` before concluding anything/);
  assert.match(CLIENT_ACTIONS, /say so plainly rather than explaining why it might be missing/);
  assert.match(AGENT_TOOLS, /do not guess why it might be missing/);
});

test("swap is deliberately NOT included, and that is a different operation", () => {
  // Moving changes WHEN. Swapping changes WHICH session it was — on a completed
  // one that rewrites what somebody actually did. Dustin asked for moves. If he
  // wants swaps opened up too it should be because he said so, not because a
  // regex in this commit was too greedy.
  const swap = handler(code(CLIENT_ACTIONS), "swap_my_workout");
  assert.match(swap, /status === "completed"/, "swap keeps its guard until Dustin says otherwise");
});
