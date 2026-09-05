import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Dustin, 5 Sep 2026, setting the bar for every AI surface in this app:
//
//   "any ai needs a very detailed way of thinking to make sure its accurate to
//    each client and relevant to them."
//
// The weekly sweep failed it in a specific, checkable way. Its prompt told the
// model to ground the fortnightly programming question in specifics — "if they
// skipped legs twice, ask about that" — while the context handed over held a
// single line reading "Training: 3 of 4 scheduled sessions completed". A count.
// Not which sessions, not which body parts. An instruction to be specific about
// something the context does not contain is an instruction to invent, and an
// invented question reads exactly as confident as a real one.
//
// These pin the fix, which has two halves that only work together: the model is
// GIVEN the session-by-session detail, and it is ALLOWED to write no question
// when that detail holds nothing worth pointing at. Restore either half alone
// and the failure comes back.

const ROOT = process.cwd();
const SWEEP = path.join(ROOT, "src/app/api/cron/weekly-ai/route.ts");
const PICTURE = path.join(ROOT, "src/lib/ai/weekly-picture.ts");

const sweep = fs.readFileSync(SWEEP, "utf8");
// Prompt text is wrapped to fit the file, so a sentence spans lines. Match
// against a flattened copy rather than writing regexes that encode where the
// wrapping happens to fall today.
const sweepFlat = sweep.replace(/\s+/g, " ");
const picture = fs.readFileSync(PICTURE, "utf8");

test("the weekly sweep hands the model the client's sessions one by one", () => {
  // The half that makes the instruction satisfiable.
  assert.ok(
    /weeklyClientPicture/.test(sweep),
    "the weekly sweep no longer builds the client picture — the model is back to a name and a goal",
  );
  assert.ok(
    /scheduled_workouts[\s\S]{0,400}days\(label, region, focus_tags\)/.test(picture),
    "the picture no longer reads the session labels and facets, so 'they skipped legs twice' is unknowable again",
  );
});

test("an unclassified session is named as unknown rather than left silent", () => {
  // A silence in a prompt is filled by the model. This one has to be spoken.
  assert.ok(
    /not classified/.test(picture),
    "an unclassified day must SAY it is unclassified — a blank invites a guess about what it worked",
  );
});

test("the writer is given the client's injuries", () => {
  assert.ok(
    /injuries_limitations/.test(picture),
    "the weekly writer cannot see injuries again — Stacie's repaired rotator cuff and a competitive lifter get the same week",
  );
});

test("the writer is given what the client told the coach, and last week's focus", () => {
  assert.ok(
    /ai_client_memory/.test(picture),
    "no memory: the week can contradict something the client told the coach three days ago",
  );
  assert.ok(
    /weekly_focus_week/.test(picture) && /Do NOT hand them this same focus again/.test(picture),
    "no previous focus: the sweep cannot tell whether its own advice landed, and will repeat itself",
  );
});

test("no question is an allowed answer when there is nothing to point at", () => {
  // The half everything else depends on. Without this the model, told to be
  // specific and handed nothing specific, invents — which is the original bug
  // with better context attached.
  assert.ok(
    /EMPTY STRING/.test(sweep) && /Do not stretch to fill this field/.test(sweep),
    "the prompt no longer permits an empty programming question, so a model with nothing to point at will make one up",
  );
});

test("the writer is made to think in a fixed order before it writes", () => {
  for (const step of [
    /WHO IS THIS/,
    /WHAT ACTUALLY CHANGED/,
    /WHAT THEY WERE ACTUALLY PROGRAMMED/,
    /WHAT THEY HAVE SAID/,
    /WHAT YOU TOLD THEM LAST TIME/,
    /NOW CHECK YOURSELF/,
  ]) {
    assert.ok(step.test(sweep), `the required thinking step ${step} is gone from the weekly prompt`);
  }
  assert.ok(
    /could every sentence you are about to write have been written about a different client/i.test(sweepFlat),
    "the self-check that enforces Dustin's bar is gone",
  );
});
