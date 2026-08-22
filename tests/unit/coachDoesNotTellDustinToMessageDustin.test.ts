// Guard: the AI coach never tells Dustin to contact Dustin.
//
// ── WHAT HE SCREENSHOTTED, 17 AUG ──────────────────────────────────────────
//
// His own Nutrition screen, his own client record, the coach card:
//
//   "…Shoot Dustin a message if something's making it hard to get the food in
//    — he needs to know what's getting in the way so he can adjust."
//
// Telling him to message himself, about himself, in the third person.
//
// ── WHY ────────────────────────────────────────────────────────────────────
//
// Every instruction in COACH_SYSTEM_PROMPT assumes the reader is a client and
// the coach is someone else — "frame them as suggestions for the client to run
// by Dustin", "plan changes are his call", "tell them to send the answer to
// Dustin". Correct for 29 of 30 client records. He trains himself, so his own
// record flows through the identical path and inherits copy written for
// somebody who has a coach to defer to.
//
// The fix is context, not prompt surgery: when a client record IS its own
// trainer, the assembled context carries an explicit block saying so. The
// prompt keeps working unchanged for everybody else, which matters — it is long,
// carefully tuned, and shared by the Coach card and the /act surface.
//
// ── UPDATED 20 AUG, AND THE UPDATE IS THE POINT ────────────────────────────
//
// The detection was `isTrainerEmail(c.email)` — an allowlist. Stephanie's
// address was added to that allowlist the day she became a trainer, and from
// that moment opening HER OWN nutrition card told the model that she was
// Dustin, in the masculine. The guard below was green throughout: it only ever
// asked whether the coach's own record was recognised, never whose record it
// was recognised AS.
//
// It now asks the honest question — is this client row's own account the
// account of the trainer who trains it — and the prompt names whoever that
// turns out to be.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coachingThemselvesLine, fetchClientProfile } from "../../src/lib/ai/coach-context";

const SRC = readFileSync(join(process.cwd(), "src/lib/ai/coach-context.ts"), "utf8");

/** Minimal stub: one clients row, whatever columns were asked for. */
function db(row: Record<string, unknown> | null) {
  let selected = "";
  const api = {
    from() {
      return {
        select(cols: string) {
          selected = cols;
          return { eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) };
        },
      };
    },
    get selected() { return selected; },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return api as any;
}

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

test("a coach's own record is recognised — for EITHER coach", async () => {
  // The account on the client row is the account of the trainer who trains it.
  const dustin = db({
    name: "Dustin Gautreaux", email: TRAINER_EMAIL, primary_goal: "Fat loss",
    auth_user_id: "uid-dustin", trainer_id: "t-dustin", trainers: { auth_user_id: "uid-dustin" },
  });
  assert.equal((await fetchClientProfile(dustin, "any-id"))?.isCoachThemselves, true,
    "his own record reads as an ordinary client");

  const steph = db({
    name: "Steph Gautreaux", email: "steph.rgautreaux@gmail.com", primary_goal: "Strength",
    auth_user_id: "uid-steph", trainer_id: "t-steph", trainers: { auth_user_id: "uid-steph" },
  });
  assert.equal((await fetchClientProfile(steph, "any-id"))?.isCoachThemselves, true,
    "the second trainer's own record does not read as her own");
});

test("a trainer who is somebody ELSE's client is not coaching themselves", async () => {
  // This is the case the email allowlist got wrong, and it is not hypothetical:
  // Stephanie's client row is trained by Dustin. Under the old check she was
  // "the coach" on her own nutrition card and the model was told she was him.
  const d = db({
    name: "Steph Gautreaux", email: "steph.rgautreaux@gmail.com",
    auth_user_id: "uid-steph", trainer_id: "t-dustin", trainers: { auth_user_id: "uid-dustin" },
  });
  assert.equal((await fetchClientProfile(d, "any-id"))?.isCoachThemselves, false,
    "a trainer trained by the other trainer still reads as self-coaching");
});

test("an ordinary client is not", async () => {
  const d = db({
    name: "Claudine Ocon", email: "claudine@example.com", primary_goal: "Fat loss",
    auth_user_id: "uid-claudine", trainer_id: "t-dustin", trainers: { auth_user_id: "uid-dustin" },
  });
  assert.equal((await fetchClientProfile(d, "any-id"))?.isCoachThemselves, false);
});

test("a record with no account is treated as a client, not as the coach", async () => {
  // Fail toward the ordinary case: wrongly telling a real client they are the
  // trainer is far worse than the copy this fixes.
  const d = db({ name: "Robby Burns", email: null, auth_user_id: null, trainer_id: "t-dustin",
                 trainers: { auth_user_id: "uid-dustin" } });
  assert.equal((await fetchClientProfile(d, "any-id"))?.isCoachThemselves, false);
});

test("the profile query asks for the columns the check depends on", async () => {
  // Without these the check silently answers false for everyone and the bug
  // comes back with every test above still green.
  const d = db({ name: "Dustin", auth_user_id: "u", trainer_id: "t", trainers: { auth_user_id: "u" } });
  await fetchClientProfile(d, "any-id");
  for (const col of ["auth_user_id", "trainer_id", "trainers(auth_user_id)"]) {
    assert.ok(d.selected.includes(col), col + " is not selected — isCoachThemselves can never be true");
  }
});

test("the context tells the model, in terms, not to redirect him to himself", () => {
  // The wording moved into coachingThemselvesLine() on 22 Aug so that BOTH
  // context builders share it — assistantContext, which is what free-text
  // questions go through, had been dropping the flag and told him he needed
  // "Dustin's approval". Assert the produced text, not where it is written.
  const block = coachingThemselvesLine(true, "Dustin");
  assert.ok(block, "the coach-reading-their-own-record case is not handled at all");
  assert.match(block!, /NEVER tell them to message, ask, check with, or run anything by/i,
    "the instruction does not actually forbid the thing that went wrong");
  assert.match(block!, /third person/i, "nothing stops it talking about them as though they were absent");
  assert.match(block!, /approval or sign-off/i, "nothing stops it demanding the trainer's own sign-off");
  // Gender-neutral, because there are two coaches now and one of them is not a
  // "him". The old wording said "he/him" six times.
  assert.doesNotMatch(block!, /\bhimself\b|\bhe is\b/i, "the block still assumes the coach is a man");
});

test("the block is conditional — 29 other clients still have a coach to talk to", () => {
  // "Message Dustin" is exactly right for everybody else, and it is how he
  // hears that something is wrong. Making this unconditional would cost him
  // that. The guard is now the function's own first line, which is stronger
  // than a guard at one call site: it cannot be forgotten by a second caller.
  assert.equal(coachingThemselvesLine(false, "Dustin"), null, "an ordinary client would be told they are the trainer");
  assert.equal(coachingThemselvesLine(undefined, "Dustin"), null, "an unknown profile falls open instead of closed");
  assert.equal(
    (SRC.match(/`WHO IS READING THIS/g) || []).length,
    1,
    "the instruction exists in more than one place — they will drift",
  );
});

test("the shared system prompt is untouched", () => {
  // It is long, tuned, and shared by the Coach card and /act. The fix belongs
  // in context precisely so this keeps working for everyone.
  // `${coachFirstName}`, not `${COACH_FIRST_NAME}`: the prompt became a
  // function of the coach's name on 20 Aug, because one build-time constant
  // cannot name two trainers. The SHAPE of the instruction is what this guards
  // — that plan changes are still handed to the coach rather than decided by
  // the model — not which identifier supplies the name.
  assert.match(SRC, /suggestions for the client to run by \$\{coachFirstName\}/,
    "the prompt was edited instead of the context — that changes behaviour for every client");
  assert.match(SRC, /export const COACH_SYSTEM_PROMPT = \(coachFirstName: string/,
    "the prompt is back to a module constant, so it names one trainer for everybody");
});
