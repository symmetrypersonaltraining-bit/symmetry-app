// Guard: the payments screen never shows a change that did not land.
//
// Every action in paymentActions.ts was `Promise<void>` with the write
// unchecked, and every caller in PaymentsClient.tsx applies its optimistic
// state update on the very next line, unconditionally. So an RLS refusal, a
// dropped connection or a missing column produced exactly what success produces:
// the row moves, the amount changes, the reminder disappears — until the next
// refresh silently puts it all back.
//
// On a money screen that is the worst place for it, because by then the trainer
// has moved on believing it took. This is the same fault as the workout
// adjuster counting failed writes as completed sets (c7d06c6) and the trainer
// calendar's drag snapping back with no explanation (2c6776b), on the surface
// where being wrong costs the most.
//
// There is precedent for the failure mode in this very file's history: the
// comment above the insert in markClientPaid records that it once failed with
// PGRST204, unchecked, immediately after the current reminder had been deleted —
// so marking a client paid quietly wiped their billing schedule.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTIONS = strip(readFileSync(join(process.cwd(), "src/app/(app)/payments/paymentActions.ts"), "utf8"));
const CLIENT = strip(readFileSync(join(process.cwd(), "src/app/(app)/payments/PaymentsClient.tsx"), "utf8"));

const ACTION_NAMES = ["markClientPaid", "setPaymentStatus", "updateAmountDue"];

for (const name of ACTION_NAMES) {
  test(`${name} can report failure at all`, () => {
    // Promise<void> makes it impossible for a caller to know. The type is the
    // fix; everything else follows from it.
    const i = ACTIONS.indexOf(`export async function ${name}`);
    assert.ok(i > 0, `${name} not found`);
    const sig = ACTIONS.slice(i, ACTIONS.indexOf("{", i));
    assert.match(sig, /Promise<string \| null>/, `${name} still returns void — a caller cannot tell`);
  });
}

test("every write in the payment actions is checked", () => {
  // Counts destructured results against write calls rather than naming each
  // one, so a NEW unchecked write added later fails this too.
  const writes = (ACTIONS.match(/\.(insert|update|delete|upsert)\(/g) || []).length;
  const checked = (ACTIONS.match(/const \{ error(?::\s*\w+)? \} = await/g) || []).length;
  assert.ok(writes > 0, "expected write calls");
  assert.equal(checked, writes, `${writes} writes but only ${checked} checked results`);
});

test("the delete in markClientPaid is checked too", () => {
  // It runs AFTER the insert that creates next cycle. Unchecked, the client is
  // left holding both reminders while the screen says paid.
  const i = ACTIONS.indexOf("export async function markClientPaid");
  const body = ACTIONS.slice(i, ACTIONS.indexOf("export async function setPaymentStatus"));
  const d = body.indexOf(".delete()");
  assert.ok(d > 0, "the delete must still be there");
  assert.match(body.slice(Math.max(0, d - 200), d), /const \{ error: delErr \} = await/);
});

for (const caller of [
  "markClientPaid(c.reminderId)",
  "setPaymentStatus(c.reminderId, next)",
  "updateAmountDue(c.reminderId, newAmt)",
]) {
  test(`the caller of ${caller.split("(")[0]} checks before it updates the screen`, () => {
    const i = CLIENT.indexOf(caller);
    assert.ok(i > 0, `caller not found: ${caller}`);
    const before = CLIENT.slice(Math.max(0, i - 60), i);
    assert.match(before, /const err = await/, "the result must be captured");
    const after = CLIENT.slice(i, i + 220);
    const guard = after.indexOf("if (err)");
    const optimistic = after.indexOf("setLocalClients");
    assert.ok(guard > 0, "no failure branch");
    assert.ok(
      optimistic === -1 || guard < optimistic,
      "the optimistic update runs before the error is checked — the screen lies on failure",
    );
  });
}

test("a failed save does not close the inline amount editor", () => {
  // Closing the editor is itself a success signal. Leaving it open, with the
  // typed value still in it, is what tells the trainer nothing was saved.
  const i = CLIENT.indexOf("updateAmountDue(c.reminderId, newAmt)");
  const after = CLIENT.slice(i, i + 300);
  const guard = after.indexOf("if (err)");
  const close = after.indexOf("setEditingAmountId(null)");
  assert.ok(guard > 0 && (close === -1 || guard < close));
});

// ── The same fault, on the schedule ────────────────────────────────────────
//
// schedule/actions.ts already threw on a missing user, so its callers were
// built to handle a throw — but its three writes were unchecked. The file's own
// comment records what that cost: `status: "completed"` was rejected with 23514
// on every single call, unchecked, so marking an unscheduled session done
// logged nothing at all while the button said Saving… and then closed. All 964
// rows in the table say 'Done as planned'.
//
// The VALUE was fixed when that was found. The unchecked result was not, which
// is the half that let it run wrong for so long — checking it is what would
// have surfaced the constraint violation the first time anyone pressed it.

const SCHED_ACTIONS = strip(readFileSync(join(process.cwd(), "src/app/(app)/schedule/actions.ts"), "utf8"));
const SCHED_CLIENT = strip(readFileSync(join(process.cwd(), "src/app/(app)/schedule/ScheduleClient.tsx"), "utf8"));

test("every write in the schedule actions is checked", () => {
  const writes = (SCHED_ACTIONS.match(/\.(insert|update|delete|upsert)\(/g) || []).length;
  const checked = (SCHED_ACTIONS.match(/const \{ error(?::\s*\w+)? \} = await/g) || []).length;
  assert.ok(writes > 0);
  assert.equal(checked, writes, `${writes} writes, ${checked} checked`);
});

test("a failed schedule write throws rather than returning quietly", () => {
  const throws = (SCHED_ACTIONS.match(/if \(error\) throw new Error\(/g) || []).length;
  assert.ok(throws >= 3, `only ${throws} throw sites — a write can still fail in silence`);
});

for (const fn of ["logCardioSession", "logStrengthSession"]) {
  test(`the ${fn} button tells the person when it failed`, () => {
    // Without a catch the rejection is unhandled: the sheet stays open, which
    // is an honest-ish signal, but nothing says why and nothing says it failed.
    const i = SCHED_CLIENT.indexOf(`await ${fn}(`);
    assert.ok(i > 0, `${fn} caller not found`);
    const after = SCHED_CLIENT.slice(i, i + 400);
    assert.match(after, /catch \(e\)/, `${fn} has no catch`);
    assert.match(after, /window\.alert\(/, `${fn} fails silently`);
  });
}

// ── Messages: the push is the reason this one matters ──────────────────────
//
// The inserts in sendMessage / sendClientMessage / sendGroupMessage were
// unchecked and the push fired regardless. A refused write therefore notified
// the recipient "New message from your coach" about a message that did not
// exist — they open the app and find nothing — while MessagesClient cleared the
// input box on the success path, so the sender's typed text was gone too and
// nothing said why.
//
// sendBroadcastMessage returned rows.length: the number it INTENDED to send,
// reported identically whether the insert landed or was refused outright. A
// broadcast that reached nobody said "sent to 22".
//
// deleteMessage and deleteThread in the same file were given this treatment on
// 15 Aug for exactly this reason. The send paths were missed.

const MSG_ACTIONS = strip(readFileSync(join(process.cwd(), "src/app/(app)/home/messageActions.ts"), "utf8"));
const MSG_CLIENT = strip(readFileSync(join(process.cwd(), "src/app/(app)/messages/MessagesClient.tsx"), "utf8"));

for (const fn of ["sendMessage", "sendClientMessage", "sendGroupMessage"]) {
  test(`${fn} can report failure`, () => {
    const i = MSG_ACTIONS.indexOf(`export async function ${fn}(`);
    assert.ok(i > 0, `${fn} not found`);
    const sig = MSG_ACTIONS.slice(i, MSG_ACTIONS.indexOf("{", i));
    assert.match(sig, /Promise<string \| null>/, `${fn} still returns void`);
  });

  test(`${fn} does not notify anyone about a message it failed to write`, () => {
    const i = MSG_ACTIONS.indexOf(`export async function ${fn}(`);
    const body = MSG_ACTIONS.slice(i, i + 2600);
    const guard = body.search(/if \(error\) return `Message not (sent|posted)/);
    const push = body.indexOf("sendPushToUser");
    assert.ok(guard > 0, `${fn} has no failure return`);
    assert.ok(push === -1 || guard < push, `${fn} pushes before it knows the write landed`);
  });
}

test("a broadcast reports what LANDED, not what it attempted", () => {
  const i = MSG_ACTIONS.indexOf("export async function sendBroadcastMessage");
  const body = MSG_ACTIONS.slice(i, i + 2600);
  assert.doesNotMatch(body, /return rows\.length;/, "rows.length is the intended count, not the sent count");
  assert.match(body, /\.insert\(rows\)\.select\('id'\)/, "the count must come from what the database returned");
  assert.match(body, /return sent;/);
});

test("a failed send leaves the person's typed message where it was", () => {
  // Clearing the box is a success signal. Losing what they wrote, with no
  // explanation, is the part that made this expensive rather than annoying.
  const i = MSG_CLIENT.indexOf("let sendErr: string | null = null;");
  assert.ok(i > 0, "the send path no longer captures an error");
  const after = MSG_CLIENT.slice(i, i + 1400);
  const guard = after.indexOf("if (sendErr)");
  const clear = after.indexOf('setBody("")');
  assert.ok(guard > 0, "no failure branch");
  assert.ok(clear === -1 || guard < clear, "the input is cleared before the error is checked");
  assert.match(after.slice(guard, guard + 220), /alert\(sendErr\)/);
  assert.match(after.slice(guard, guard + 220), /return;/);
});

// ── The reminder editor: the same fault, on the same money ─────────────────
//
// paymentActions.ts was fixed on 16 Aug. ReminderEditor.tsx — the screen where
// a reminder is actually approved and a client is actually marked paid — was
// not, and it is the worse of the two.
//
// `save(r, publish=true)` updated the reminder unchecked and then emailed the
// client. On a refused update the notice it shows reads "Reminder approved and
// the in-app banner is showing, but the email didn't send" — two lies in one
// sentence, followed by an email to the client about a reminder that was never
// approved.
//
// `confirmPaid` made three writes, none checked, in an order that matters: mark
// paid → thank the client → roll the cycle forward. A refused first write still
// thanked them for a payment the books did not record.
//
// The precedent is in paymentActions.ts's own history, quoted at the top of
// this file: markClientPaid once inserted with a column that did not exist,
// unchecked, immediately after deleting the current reminder, and quietly wiped
// a client's billing schedule.

const EDITOR = strip(readFileSync(join(process.cwd(), "src/components/ReminderEditor.tsx"), "utf8"));

test("every write in the reminder editor captures its result", () => {
  // Writes only — the loader legitimately reads `? await sup.from(…)` out of a
  // ternary, and a select whose error is ignored is a weaker complaint than a
  // write whose error is ignored.
  const W = /await\s+sup\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g;
  const BARE = /(?<!=\s)await\s+sup\s*\n?\s*\.from\([^)]*\)\s*\n?\s*\.(insert|update|delete|upsert)\(/g;
  const writes = (EDITOR.match(W) || []).length;
  const bare = EDITOR.match(BARE) || [];
  assert.ok(writes > 0, "expected write calls");
  assert.equal(bare.length, 0, `${bare.length} of ${writes} writes still discard their result`);
});

test("a reminder that was not approved does not email the client", () => {
  const i = EDITOR.indexOf("const save = async");
  const body = EDITOR.slice(i, EDITOR.indexOf("const confirmPaid"));
  const guard = body.indexOf("if (saveErr)");
  const email = body.indexOf("/api/reminders/send");
  assert.ok(guard > 0, "the update is unchecked again");
  assert.ok(guard < email, "the client is emailed before the approval is known to have landed");
  assert.match(body.slice(guard, guard + 400), /return;/);
});

test("nothing downstream of 'paid' runs until paid is true", () => {
  const i = EDITOR.indexOf("const confirmPaid");
  const body = EDITOR.slice(i, EDITOR.indexOf("const deleteReminder"));
  const guard = body.indexOf("if (paidErr)");
  const notify = body.indexOf("payment_received");
  const roll = body.indexOf("nextDueDate(");
  assert.ok(guard > 0, "the paid write is unchecked again");
  assert.ok(guard < notify, "the client is thanked before the payment is recorded");
  assert.ok(guard < roll, "the cycle rolls forward before the payment is recorded");
});

test("a missing next cycle is named, because nothing on the screen shows its absence", () => {
  const i = EDITOR.indexOf("const confirmPaid");
  const body = EDITOR.slice(i, EDITOR.indexOf("const deleteReminder"));
  assert.match(body, /const \{ error: rollErr \}/);
  assert.match(body, /next cycle was NOT created/);
});

test("a refused delete says so rather than looking like a dead button", () => {
  const i = EDITOR.indexOf("const deleteReminder");
  const body = EDITOR.slice(i, i + 700);
  assert.match(body, /const \{ error \} = await sup/);
  assert.match(body, /alert\(/);
});
