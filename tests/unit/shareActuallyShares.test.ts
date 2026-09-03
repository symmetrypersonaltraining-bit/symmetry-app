import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p: string) => readFileSync(p, "utf8");

test("a Share button hands the group chat something to send", () => {
  const badges = read("src/components/MilestoneBadges.tsx");
  // The old bug: navigate to the group and share nothing.
  assert.ok(
    !/router\.push\("\/messages\?client=group"\)/.test(badges),
    "Share navigates to the group chat with no message — that is the bug it had"
  );
  assert.match(badges, /draft=/, "Share must carry the message it is sharing");

  const msgs = read("src/app/(app)/messages/MessagesClient.tsx");
  assert.match(msgs, /searchParams\.get\("draft"\)/, "the chat must read the draft it is handed");
  assert.match(msgs, /next\.delete\("draft"\)/, "the draft param must be stripped so a refresh does not re-write the box");
});

test("a prefilled draft never eats what someone already typed", () => {
  const msgs = read("src/app/(app)/messages/MessagesClient.tsx");
  assert.match(
    msgs,
    /setBody\(\(current\) => \(current\.trim\(\) \? current : draftParam\)\)/,
    "the draft must only fill an empty composer"
  );
});
