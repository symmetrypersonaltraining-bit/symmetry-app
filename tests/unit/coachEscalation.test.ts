import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * NOTHING REACHES DUSTIN'S INBOX THAT A CLIENT DID NOT DELIBERATELY SEND.
 *
 * Dustin, 2026-08-13, asked how escalation should trigger and what should never
 * be escalated. He picked "Client taps 'Send this to Dustin'", and on the
 * exclusions: "only what client apporve to be escalated".
 *
 * This test exists because the OTHER design is the tempting one, and someone
 * (including me, later) will be tempted. The coach already says "go ask Dustin"
 * whenever something needs a real decision; making it actually SEND at that
 * moment is a two-line change, it feels obviously helpful, and it catches the
 * clients who would never press a button.
 *
 * It is still wrong, for a reason that is invisible in the diff: an inbox that
 * fills with whatever an AI felt unsure about stops being read inside a week,
 * and the messages that genuinely needed a human are then buried under the ones
 * that did not. The failure does not look like a bug. It looks like Dustin
 * gradually not answering people.
 *
 * So the rule is pinned here rather than left as a comment. If automatic
 * escalation is ever wanted, it should arrive as Dustin changing his mind and
 * this test being deleted on purpose — not as a helpful addition nobody noticed.
 */

const ROOT = process.cwd();
const ROUTE = readFileSync(join(ROOT, "src/app/api/coach-escalate/route.ts"), "utf8");
const SHEET = readFileSync(join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx"), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE_CODE = strip(ROUTE);
const SHEET_CODE = strip(SHEET);

test("the escalation route is only ever reached by an explicit tap", () => {
  // The single call site, and it is an onClick handler.
  const callers = [...SHEET_CODE.matchAll(/"\/api\/coach-escalate"/g)];
  assert.equal(callers.length, 1, "coach-escalate is called from more than one place in the sheet");
  assert.match(SHEET_CODE, /onClick=\{\(\) => escalate\(mi\)\}/, "the send is no longer wired to a tap");

  // And nothing auto-fires it. `escalate(` may appear as its own definition and
  // in the onClick; anywhere else — a useEffect, the send() path, an action
  // handler — means something is deciding on the client's behalf.
  const calls = [...SHEET_CODE.matchAll(/\bescalate\(/g)].length;
  assert.equal(
    calls,
    2,
    "escalate() is referenced somewhere other than its definition and the tap handler — " +
      "something is escalating without the client approving it",
  );
  assert.ok(
    !/useEffect\([^)]*escalate/.test(SHEET_CODE),
    "an effect is calling escalate() — that is automatic escalation",
  );
});

test("the route itself has no automatic trigger and no way to name someone else", () => {
  // No heuristic in the route deciding to forward. If one of these words shows
  // up here, the route has grown an opinion about what deserves Dustin.
  for (const smell of ["shouldEscalate", "autoEscalate", "detectPain", "urgency", "classif"]) {
    assert.ok(
      !new RegExp(smell, "i").test(ROUTE_CODE),
      `/api/coach-escalate contains "${smell}" — it must forward what it is handed, and decide nothing`,
    );
  }
  // The sender is resolved from the SESSION. A client_id in the body would let
  // one client post into another's thread with Dustin.
  assert.match(ROUTE_CODE, /supabase\.auth\.getUser\(\)/);
  assert.match(ROUTE_CODE, /eq\("auth_user_id", user\.id\)/);
  assert.ok(
    !/body\.(clientId|client_id|from|fromId|to|toId)/.test(ROUTE_CODE),
    "the route takes a sender or recipient from the request body",
  );
});

test("the escalation is addressed to the sender's OWN coach", () => {
  // Two wrong ways to answer "which trainer", and this test has now pinned
  // both — the second one as the correct answer, which is how a test ends up
  // enforcing a bug.
  //
  //   Searching `clients` for the trainer works only because Dustin also trains
  //   himself. Still wrong, still asserted against below.
  //
  //   Taking `trainer_settings.select("user_id").limit(1)` — what this test
  //   REQUIRED until 20 Aug — was right while that table held one row. It holds
  //   one per trainer with a Google Calendar connected, and Stephanie connects
  //   hers on day one. From then on `.limit(1)` with no ORDER BY picks a coach
  //   per request, and the client is told their message was delivered either way.
  //
  // The answer is the client's own trainer, resolved through `trainers`.
  assert.match(ROUTE_CODE, /inboxAuthUidForClient\(db, me\.id\)/,
    "the escalation no longer resolves the sender's own coach");
  assert.ok(
    !/from\("trainer_settings"\)[\s\S]{0,80}limit\(1\)/.test(ROUTE_CODE),
    "back to whichever trainer_settings row sorts first",
  );
  assert.ok(
    !/TRAINER_EMAIL[\s\S]{0,120}from\("clients"\)/.test(ROUTE_CODE),
    "the trainer is being resolved via the clients table",
  );
});

test("what gets forwarded carries BOTH halves of the exchange", () => {
  // Dustin needs to see that the client was already told something, and what.
  // Without the answer he repeats it or contradicts it, and either one reads as
  // the app not talking to him.
  assert.match(ROUTE_CODE, /They asked:/);
  assert.match(ROUTE_CODE, /The app answered:/);
  assert.match(SHEET_CODE, /JSON\.stringify\(\{ question, answer, surface \}\)/);
});

test("the client is told it was sent, and told to stop asking the AI", () => {
  // Silence here is the failure mode Dustin explicitly ruled out: they rephrase
  // the same question at the coach three more times, then decide they were
  // ignored.
  assert.match(SHEET_CODE, /Sent to " \+ COACH_FIRST_NAME \+ " — he'll come back to you in Messages/);
  assert.ok(
    /No need to ask me again/.test(SHEET_CODE),
    "the confirmation no longer tells them the waiting is the right thing to do",
  );
  // And a failure has to say so and give them a route that works. Swallowing it
  // would mean they believe Dustin has their question when he does not.
  assert.match(SHEET_CODE, /I couldn't get that to " \+ COACH_FIRST_NAME/);
  assert.match(SHEET_CODE, /Messages tab/);
});

test("the control is not offered where it makes no sense", () => {
  // mi > 0 — the greeting has no question above it to forward.
  // !msg.action — mid-decision on a change they have not confirmed yet.
  assert.match(
    SHEET_CODE,
    /msg\.role !== "client" && mi > 0 && !msg\.action &&/,
    "the send control now appears on the greeting or on an unconfirmed change",
  );
});

test("the coach's name is never hard-coded in the escalation copy", () => {
  // Same reason as everywhere else: on another trainer's instance this would
  // work perfectly and address the wrong human.
  const around = SHEET_CODE.slice(
    SHEET_CODE.indexOf("async function escalate"),
    SHEET_CODE.indexOf("function cancelAction"),
  );
  assert.ok(!/Dustin/.test(around), "escalation copy hard-codes Dustin instead of COACH_FIRST_NAME");
});
