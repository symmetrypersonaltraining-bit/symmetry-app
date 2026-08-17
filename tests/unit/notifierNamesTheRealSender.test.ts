// Guard: a notification names whoever actually sent it.
//
// ── WHAT DUSTIN SAW, 17 AUG ────────────────────────────────────────────────
//
// A red banner in his own TRAINER app:
//
//     Dustin messaged you — Claudine Ocon — tap to read
//
// Claudine had messaged HIM. The app told him he had messaged himself, and
// printed the real sender's name in the position reserved for the destination.
//
// ── WHY ────────────────────────────────────────────────────────────────────
//
// The banner hard-coded `COACH_FIRST_NAME`:
//
//     `${COACH_FIRST_NAME} messaged you — ${i.title}`
//
// which is correct for the only reader it was written for. A client's thread
// only ever contains messages from Dustin, so naming him is right and it is
// what makes somebody stop scrolling. The trainer reads the same component with
// the direction reversed, and the copy had no way to express that.
//
// The row now carries `fromName`, set from the reader's point of view: the
// client's name when the trainer is reading, the coach's when a client is. The
// group thread deliberately carries NO name — anyone in it can post and the
// unread query does not resolve names, so neutral copy is used. A confidently
// wrong name is the bug; no name is merely quiet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aggregateNotifications, type RawUnread } from "../../src/lib/notifications";

const ME = "trainer-user-id";
const CLIENT_USER = "claudine-user-id";
const CLIENT_ID = "claudine-client-id";

const msg = (over: Partial<RawUnread> = {}): RawUnread => ({
  id: "m1",
  from_id: CLIENT_USER,
  to_id: ME,
  client_id: CLIENT_ID,
  body: "hey",
  created_at: "2026-08-17T12:00:00Z",
  read_at: null,
  deleted_at: null,
  is_group: false,
  is_broadcast: false,
  image_url: null,
  sender_kind: null,
  ...over,
});

test("trainer reading: the CLIENT is named as the sender", () => {
  const [row] = aggregateNotifications([msg()], {
    isTrainer: true,
    myUserId: ME,
    clientNames: { [CLIENT_ID]: "Claudine Ocon" },
    coachFirstName: "Dustin",
  });
  assert.equal(row.fromName, "Claudine Ocon", "the trainer is told the wrong person sent this");
  assert.notEqual(row.fromName, "Dustin", "the coach is named as the sender of a message sent TO him");
});

test("client reading: the COACH is named as the sender", () => {
  const [row] = aggregateNotifications(
    [msg({ from_id: "trainer-user-id-2", to_id: CLIENT_USER })],
    { isTrainer: false, myUserId: CLIENT_USER, coachFirstName: "Dustin" },
  );
  assert.equal(row.fromName, "Dustin");
});

test("an unresolved client name is left blank, not called 'Client'", () => {
  // "Client messaged you" is not better than "New message" — it is the same
  // absence of information, dressed up as a name.
  const [row] = aggregateNotifications([msg()], {
    isTrainer: true, myUserId: ME, clientNames: {}, coachFirstName: "Dustin",
  });
  assert.equal(row.fromName, undefined);
  assert.equal(row.title, "Client");
});

test("the group thread names nobody", () => {
  const [row] = aggregateNotifications([msg({ is_group: true, client_id: null })], {
    isTrainer: true, myUserId: ME, clientNames: { [CLIENT_ID]: "Claudine Ocon" }, coachFirstName: "Dustin",
  });
  assert.equal(row.kind, "group");
  assert.equal(row.fromName, undefined, "a name is being guessed for a thread anyone can post in");
});

// ── The banner copy itself ─────────────────────────────────────────────────

const NOTIFIER = readFileSync(join(process.cwd(), "src/components/MessageNotifier.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("the banner reads the sender off the row and never assumes the coach", () => {
  assert.doesNotMatch(
    NOTIFIER,
    /COACH_FIRST_NAME/,
    "the banner still hard-codes the coach's name — this is the bug, verbatim",
  );
  assert.match(NOTIFIER, /i\.fromPerson && i\.fromName/, "the banner does not read the sender from the row");
  assert.match(NOTIFIER, /\$\{i\.fromName\} messaged you/);
});

test("with no sender name the banner stays neutral rather than guessing", () => {
  assert.match(NOTIFIER, /New message — \$\{i\.title\}/);
  assert.match(NOTIFIER, /\$\{i\.count\} new in \$\{i\.title\}/);
});

test("the destination is no longer printed as though it were the sender", () => {
  // The old copy put `i.title` — the client's name, for a trainer — after the
  // sender, which is what produced "Dustin messaged you — Claudine Ocon".
  assert.doesNotMatch(NOTIFIER, /messaged you — \$\{i\.title\}/);
});

test("a person's message is still announced louder than an automated one", () => {
  // fromPerson drives the red treatment and the buzz. Fixing the name must not
  // flatten the distinction between Dustin typing and a nightly nudge.
  assert.match(NOTIFIER, /fromPerson: i\.fromPerson === true/);
  assert.match(NOTIFIER, /banner\.fromPerson \? 12000 : 6000/);
});
