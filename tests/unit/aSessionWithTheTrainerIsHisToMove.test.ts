import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// TWO DIFFERENT THINGS SHARE ONE WORD.
//
// A "session" in this app is a row in scheduled_workouts. A "session" to a
// client is a time they meet Dustin in a gym, and that lives in HIS calendar,
// which the app does not own.
//
// Dustin, 5 Sep 2026, correcting an earlier reading of his own rule — the first
// version of this file blocked the move outright and he came back the same
// night:
//
//   "They can still move supervised sessions because sometimes if I'm not here,
//    they have to do that workout on their own... I just want to make sure the
//    AI does not word it in a way that sounds like they can move their actual
//    sessions with me. The days they train with me are part of my calendar, not
//    the calendar in the app."
//
// So this is a WORDING rule, not a permission. The move must go through — a
// blocked move here is the "ask your coach" refusal that made Bobbie Page give
// up on 14 Aug ("i got frustrated because it wasnt working and stopped
// trying"), and moving a supervised workout because he is away is the normal,
// intended use. What must never be said is that their appointment moved,
// because it did not, and a client who believes it did turns up alone.
//
// The model cannot work this out for itself: from its side a supervised row and
// an ordinary one look the same. The tool result has to tell it.

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, "src/lib/ai/clientActions.ts"), "utf8");

const start = src.indexOf('if (name === "move_my_workout")');
const handler = src.slice(start, src.indexOf('if (name === "swap_my_workout")'));

test("a supervised workout still moves", () => {
  assert.ok(start > 0 && handler.length > 200, "could not find the move_my_workout handler");
  // Every refusal in the handler, enumerated. Anything beyond these three is a
  // new restriction, which is the thing 15 Aug removed.
  const refusals = handler.split("\n").filter((l) => /return "/.test(l) && /^\s*(if|return)/.test(l));
  for (const line of refusals) {
    assert.ok(
      /isn't on this client's schedule|need the workout id/.test(line),
      `move_my_workout has grown a refusal. Supervised sessions must still move: ${line.trim()}`,
    );
  }
  assert.ok(
    !/if \(row\.supervised \|\| row\.appointment_id\) \{\s*\n\s*return \(\s*\n\s*`Not moved/.test(handler),
    "the supervised REFUSAL is back — Dustin reversed that on 5 Sep; they move these when he is away",
  );
});

test("but the AI is told not to claim their appointment moved", () => {
  assert.ok(
    /select\("id, client_id, status, scheduled_date, deleted_at, day_id, supervised, appointment_id"\)/.test(handler),
    "the handler no longer reads supervised/appointment_id, so it cannot warn the model which kind it just moved",
  );
  assert.ok(
    /WORD THIS CAREFULLY/.test(handler),
    "the wording warning on the success path is gone",
  );
  assert.ok(
    /their appointment with him has NOT moved/.test(handler),
    "the result no longer states the part that did not move — this is the whole point of the rule",
  );
  assert.ok(
    /Never say you have moved, rescheduled or changed their session, their appointment, or their time with him/.test(
      handler.replace(/\s*` \+\s*\n\s*`/g, " ").replace(/\s+/g, " "),
    ),
    "the explicit ban on the false sentence is gone",
  );
  assert.ok(
    /that is fine and normal/.test(handler),
    "the warning no longer says moving it is normal — a warning that reads as disapproval teaches the model to discourage the move",
  );
});

test("the tool description says supervised sessions move too", () => {
  assert.ok(
    /INCLUDING a supervised session/.test(src),
    "the tool no longer tells the model supervised sessions move — it will start refusing them on its own",
  );
  // Matched as two fragments rather than one sentence: the description is
  // string concatenation, so a regex spanning the join encodes where the
  // source happens to wrap today.
  assert.ok(/ANY workout can be moved to ANY date/.test(src), "the move-anywhere line is gone from the client tool");
  assert.ok(/There are no restrictions and you must never/.test(src), "the no-restrictions line is gone from the client tool");
  assert.ok(/invent one or tell them to ask their coach instead/.test(src), "the do-not-refuse line is gone from the client tool");
});
