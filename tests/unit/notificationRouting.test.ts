// Guard: a notification lands on the message that raised it — and a message
// Dustin typed himself is impossible to miss.
//
// Dustin, 16 Aug, twice:
//
//   "make sure messages get routed properly from notifications. it needs to go
//    exactly where the notification came from. this got set up wrong a few
//    times so test it!"
//
//   "the in app notifications for messages I personally send I want more
//    aggressive and obvious... Just the ones personally from me in group or to
//    them need to get their attention."
//
// The routing has been wrong more than once, and the reason it kept coming back
// is that it only ever failed when you were ALREADY on /messages: both hard-
// navigation fallbacks compared the PATHNAME only, so a tap that changed just
// ?client= or ?m= looked like a successful navigation and nothing moved. The
// scroll-to-message effect had the mirror of the same bug — it depended on
// [thread], so a new ?m= within a thread you were already reading never re-ran
// it. Told to read a specific message, you landed wherever you happened to be.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { aggregateNotifications, type RawUnread } from "../../src/lib/notifications";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));

const ME = "me-uuid";
const row = (o: Partial<RawUnread> & { id: string }): RawUnread => ({
  from_id: "coach", to_id: ME, client_id: null, body: "hi", created_at: "2026-08-16T10:00:00Z",
  read_at: null, deleted_at: null, ...o,
});

// ── Routing ────────────────────────────────────────────────────────────────

test("every row carries the message the tap should land on", () => {
  const rows = aggregateNotifications(
    [row({ id: "a", created_at: "2026-08-16T09:00:00Z" }), row({ id: "b", created_at: "2026-08-16T11:00:00Z" })],
    { isTrainer: false, myUserId: ME },
  );
  assert.equal(rows.length, 1);
  // OLDEST unread: reading starts where you stopped, not at the newest thing.
  assert.match(rows[0].href, /[?&]m=a\b/);
});

test("an announcement outranks whatever arrived after it", () => {
  // Being buried under client chatter is the exact failure the anchor exists to
  // prevent, so it must beat the plain oldest-unread rule.
  const rows = aggregateNotifications(
    [
      row({ id: "old", is_group: true, created_at: "2026-08-16T08:00:00Z" }),
      row({ id: "ann", is_group: true, is_broadcast: true, created_at: "2026-08-16T09:00:00Z" }),
      row({ id: "chat", is_group: true, created_at: "2026-08-16T10:00:00Z" }),
    ],
    { isTrainer: false, myUserId: ME },
  );
  assert.match(rows[0].href, /client=group/);
  assert.match(rows[0].href, /[?&]m=ann\b/);
});

test("a trainer's row points at THAT client's thread, with the message", () => {
  const rows = aggregateNotifications(
    [row({ id: "x", client_id: "client-7", from_id: "someone" })],
    { isTrainer: true, myUserId: ME, clientNames: { "client-7": "Steph" } },
  );
  assert.equal(rows[0].title, "Steph");
  assert.match(rows[0].href, /client=client-7/);
  assert.match(rows[0].href, /[?&]m=x\b/);
});

test("client mode keeps the ?as=client marker AND the anchor", () => {
  // Losing as=client drops Dustin into the trainer inbox from his own client app.
  const rows = aggregateNotifications(
    [row({ id: "g1", is_group: true })],
    { isTrainer: false, myUserId: ME, clientMode: true },
  );
  assert.match(rows[0].href, /as=client/);
  assert.match(rows[0].href, /[?&]m=g1\b/);
});

test("the trainer thread href is a valid query even with no ? already on it", () => {
  // base is "/messages" here, so the anchor has to open the query rather than
  // append a second &. A malformed URL routes nowhere.
  const rows = aggregateNotifications([row({ id: "t1" })], { isTrainer: false, myUserId: ME });
  const href = rows[0].href;
  assert.doesNotMatch(href, /\/messages&/, "an & before any ? is a broken URL");
  assert.match(href, /\/messages\?m=t1/);
});

test("both hard-navigation fallbacks compare the QUERY, not just the path", () => {
  // The whole reason this kept coming back: same path meant "we got there",
  // even when the thread or the anchor was different.
  for (const f of ["src/components/MessageNotifier.tsx", "src/components/NotificationCenter.tsx"]) {
    const s = src(f);
    assert.match(s, /sameClient/, `${f}: does not compare the thread`);
    assert.match(s, /sameMsg/, `${f}: does not compare the anchored message`);
    assert.match(s, /!samePath \|\| !sameClient \|\| !sameMsg/, `${f}: fallback gate is incomplete`);
  }
});

test("the scroll-to-message reacts to the query, not only to the thread", () => {
  const s = src("src/app/(app)/messages/MessagesClient.tsx");
  assert.match(s, /useSearchParams\(\)/);
  assert.match(s, /const targetParam = searchParams\.get\("m"\)/);
  assert.match(s, /\}, \[thread, targetParam\]\)/, "a changed ?m= must re-run the scroll");
});

// ── Loud for a person, quiet for the app ───────────────────────────────────

test("a human-written message is marked, an app-written one is not", () => {
  const human = aggregateNotifications([row({ id: "h", sender_kind: null })], { isTrainer: false, myUserId: ME });
  assert.equal(human[0].fromPerson, true);

  const bot = aggregateNotifications([row({ id: "b", sender_kind: "coachbot" })], { isTrainer: false, myUserId: ME });
  assert.equal(bot[0].fromPerson, false);
});

test("one nudge in the thread does not demote a message Dustin typed", () => {
  // `some`, not `every`. An overnight CoachBot post landing in the group must
  // not quietly turn his announcement into ordinary furniture.
  const rows = aggregateNotifications(
    [
      row({ id: "bot", is_group: true, sender_kind: "coachbot" }),
      row({ id: "dustin", is_group: true, sender_kind: null }),
    ],
    { isTrainer: false, myUserId: ME },
  );
  assert.equal(rows[0].fromPerson, true);
});

test("a person's banner is louder, and longer, and named", () => {
  const s = src("src/components/MessageNotifier.tsx");
  assert.match(s, /banner\.fromPerson \? 12000 : 6000/, "six seconds is not long enough to act on");
  // Was `COACH_FIRST_NAME`. Naming a person is still what makes somebody stop —
  // but naming the COACH specifically was only ever right for a client reading
  // their own thread. In the trainer app it produced "Dustin messaged you —
  // Claudine Ocon" for a message Claudine sent HIM (17 Aug). The name now comes
  // off the row, so it is whoever actually sent it.
  // See tests/unit/notifierNamesTheRealSender.test.ts.
  assert.match(s, /\$\{i\.fromName\} messaged you/, "naming the sender is what makes somebody stop");
  assert.doesNotMatch(s, /COACH_FIRST_NAME/, "the sender must not be assumed to be the coach");
  assert.match(s, /banner\.fromPerson \? "#E53935"/, "brand blue is what every nudge already looks like");
  assert.match(s, /cw-alert 1\.6s/, "it should keep pulsing the whole time it is up");
});

test("only a person's message buzzes the phone", () => {
  // A phone that vibrates every night for an automated nudge gets its
  // notifications switched off entirely, and that takes payment reminders down
  // with it.
  const s = src("src/components/MessageNotifier.tsx");
  const i = s.indexOf("navigator.vibrate");
  assert.ok(i > 0, "no vibration at all");
  const before = s.slice(Math.max(0, i - 400), i);
  assert.match(before, /if \(!banner\?\.fromPerson\) return;/, "it must not buzz for automated messages");
});

test("the feed actually asks the database for sender_kind", () => {
  // Without the column every message reads as human and the loud treatment is
  // spent on the nightly nudges — which is how the loud treatment stops working.
  assert.match(src("src/lib/useNotificationFeed.tsx"), /sender_kind/);
  assert.match(src("src/lib/groupUnread.ts"), /sender_kind/);
});
