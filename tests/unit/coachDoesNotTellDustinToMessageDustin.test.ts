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
// The fix is context, not prompt surgery: when the client record's email is the
// trainer's, the assembled context carries an explicit block saying so. The
// prompt keeps working unchanged for everybody else, which matters — it is long,
// carefully tuned, and shared by the Coach card and the /act surface.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchClientProfile } from "../../src/lib/ai/coach-context";

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

test("the coach's own record is recognised as the coach", async () => {
  const d = db({ name: "Dustin Gautreaux", email: TRAINER_EMAIL, primary_goal: "Fat loss" });
  const p = await fetchClientProfile(d, "any-id");
  assert.equal(p?.isCoachThemselves, true, "his own record reads as an ordinary client");
});

test("an ordinary client is not", async () => {
  const d = db({ name: "Claudine Ocon", email: "claudine@example.com", primary_goal: "Fat loss" });
  const p = await fetchClientProfile(d, "any-id");
  assert.equal(p?.isCoachThemselves, false);
});

test("a record with no email is treated as a client, not as the coach", async () => {
  // Fail toward the ordinary case: wrongly telling a real client they are the
  // trainer is far worse than the copy this fixes.
  const d = db({ name: "Robby Burns", email: null, primary_goal: "Strength" });
  const p = await fetchClientProfile(d, "any-id");
  assert.equal(p?.isCoachThemselves, false);
});

test("the profile query actually asks for email", async () => {
  // Without the column the check silently answers false for everyone and the
  // bug comes back with every test above still green.
  const d = db({ name: "Dustin", email: TRAINER_EMAIL });
  await fetchClientProfile(d, "any-id");
  assert.match(d.selected, /\bemail\b/, "email is not selected — isCoachThemselves can never be true");
});

test("the context tells the model, in terms, not to redirect him to himself", () => {
  const i = SRC.indexOf("profile?.isCoachThemselves");
  assert.ok(i > 0, "the coach-reading-their-own-record case is not handled at all");
  const block = SRC.slice(i, i + 1400);
  assert.match(block, /NEVER tell him to message, ask, check with, or run anything by/i,
    "the instruction does not actually forbid the thing that went wrong");
  assert.match(block, /third person/i, "nothing stops it talking about him as though he were absent");
});

test("the block is conditional — 29 other clients still have a coach to talk to", () => {
  // "Message Dustin" is exactly right for everybody else, and it is how he
  // hears that something is wrong. Making this unconditional would cost him
  // that.
  const guard = SRC.indexOf("if (profile?.isCoachThemselves) {");
  assert.ok(guard > 0, "the block has no guard at all");
  // The push must sit immediately INSIDE that guard. Matching the two
  // separately would pass for a guarded block followed by an unguarded copy,
  // which is the mistake worth catching.
  const push = SRC.indexOf("`WHO IS READING THIS");
  assert.ok(push > guard, "the block is emitted before the guard that is supposed to gate it");
  assert.ok(
    push - guard < 200,
    "the block is not inside the guard — every client would be told they are the trainer",
  );
  assert.equal(
    (SRC.match(/`WHO IS READING THIS/g) || []).length,
    1,
    "there is more than one copy of the block; one of them is not guarded",
  );
});

test("the shared system prompt is untouched", () => {
  // It is long, tuned, and shared by the Coach card and /act. The fix belongs
  // in context precisely so this keeps working for everyone.
  assert.match(SRC, /suggestions for the client to run by \$\{COACH_FIRST_NAME\}/,
    "the prompt was edited instead of the context — that changes behaviour for all 30 clients");
});
