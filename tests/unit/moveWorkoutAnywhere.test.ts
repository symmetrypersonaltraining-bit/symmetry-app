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
  //
  // This assertion was briefly narrowed on 5 Sep to "ANY workout OF THEIRS",
  // when a supervised session was read as one a client could not move. Dustin
  // reversed that the same night: "They can still move supervised sessions
  // because sometimes if I'm not here, they have to do that workout on their
  // own." So the original claim stands exactly as it was, and the supervised
  // case is now a WORDING rule on the way out rather than a limit on the way
  // in — asserted below.
  assert.match(CLIENT_ACTIONS, /ANY workout can be moved to ANY date/);
  assert.match(CLIENT_ACTIONS, /invent one or tell them to ask their coach instead/);
  assert.match(AGENT_TOOLS, /ANY workout can go to ANY date/);
  assert.match(AGENT_TOOLS, /There are NO restrictions/);
});

test("a supervised session is named as movable, not as an exception", () => {
  // Left implicit, the model works out for itself that a session with the
  // trainer is special and starts declining to move it — which is the exact
  // reflex the description exists to suppress.
  assert.match(CLIENT_ACTIONS, /INCLUDING a supervised session/);
  assert.match(CLIENT_ACTIONS, /the trainer is away and they will do it on their own/);
  // And the only thing that IS constrained is what the AI says afterwards.
  assert.match(CLIENT_ACTIONS, /ONE WORDING RULE/);
  assert.doesNotMatch(CLIENT_ACTIONS, /EXCEPTION is a session WITH the trainer/);
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

// ── The MANUAL path ────────────────────────────────────────────────────────
//
// Bobbie said two things and only one of them was about the AI: "Tried manually
// and it won't work. Tried ai and i got frustrated." The drag-and-drop on the
// trainer calendar carried the same completed-status restriction the AI did,
// and its write was unchecked, so a refused move looked identical to a
// successful one — the card snapped back on refresh with no explanation.

const CALENDAR = readFileSync(join(process.cwd(), "src/app/(app)/home/TrainerCalendar.tsx"), "utf8");

test("a completed workout can be DRAGGED, not just moved by the AI", () => {
  const src = code(CALENDAR);
  assert.doesNotMatch(
    src,
    /draggable=\{workout\.status !== "completed"\}/,
    "the drag handle must not be withheld from a finished session"
  );
  assert.doesNotMatch(
    src,
    /cursor: workout\.status !== "completed"/,
    "and it must not still LOOK undraggable"
  );
  assert.match(src, /<a\s+draggable\s/, "the card is unconditionally draggable");
});

test("a drag that fails says so instead of silently snapping back", () => {
  // The write was `await supabase...update(...)` with no error check. Same
  // silent-write fault fixed across messages and payments on 15 Aug, and worse
  // here because the person is watching the card move as they do it.
  const src = code(CALENDAR);
  const fn = src.slice(src.indexOf("async function handleRescheduleWorkout"));
  const body = fn.slice(0, fn.indexOf("async function handleRescheduleAppt"));
  assert.match(body, /const \{ error \} = await supabase/, "the update must be checked");
  assert.match(body, /if \(error\)/);
  assert.match(body, /window\.alert\("Couldn't move that workout: "/);
  assert.match(body, /return;/, "and must not pretend it worked");
});

test("a dragged move records where it came from, like every other move path", () => {
  const src = code(CALENDAR);
  const fn = src.slice(src.indexOf("async function handleRescheduleWorkout"));
  const body = fn.slice(0, fn.indexOf("async function handleRescheduleAppt"));
  assert.match(body, /moved_from_date: from/, "otherwise a drag is the one unauditable move");
});

test("a drag lands in a FREE slot — the unique key refuses anything else", () => {
  // uq_scheduled_workout_one_per_slot is (client_id, day_id, scheduled_date,
  // position). Dropping a session onto a date that already holds the same day
  // at the same position raises 23505, and the move is refused — which on a
  // "move anywhere to anywhere" instruction is the app saying no to something
  // Dustin explicitly said yes to.
  //
  // Both AI paths already computed a free position. The drag set only the date.
  // Found by trying to move a real completed workout inside a rolled-back
  // transaction and watching the constraint fire.
  const src = code(CALENDAR);
  const fn = src.slice(src.indexOf("async function handleRescheduleWorkout"));
  const body = fn.slice(0, fn.indexOf("async function handleRescheduleAppt"));
  assert.match(body, /\.eq\("scheduled_date", newDate\)/, "it must look at the DESTINATION date");
  assert.match(body, /\.neq\("id", workoutId\)/, "…and not count the row being moved");
  assert.match(body, /position = taken\.position \+ 1/, "…and land after what is already there");
  assert.match(body, /moved_from_date: from, position,/, "the position must be written with the move");
});

test("all three move paths compute a destination position", () => {
  // Client AI, trainer AI and the drag. If one of them forgets, that path alone
  // fails on exactly the days a client is most likely to be rearranging.
  assert.match(code(CLIENT_ACTIONS), /nextFreePosition\(db, clientId/, "client AI");
  const trainer = handler(code(AGENT_TOOLS), "move_workout");
  assert.match(trainer, /\.eq\("scheduled_date", date\)/, "trainer AI reads the destination day");
  assert.match(trainer, /position: pos/, "trainer AI writes a position");
});
