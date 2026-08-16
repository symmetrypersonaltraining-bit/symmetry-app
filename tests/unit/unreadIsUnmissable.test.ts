// Guard: unread is loud, and tapping it lands where the unread actually is.
//
// Dustin, 16 Aug: "lets make mine flash the notification bell more aggressively
// and flash message tab and ensure both rou[te] to group messages when thats
// where the notification comes from."
//
// Context for why this was worth doing rather than fiddling: the bell used
// cw-pulse, which is `scale(1.05)` — a 5% size change on a 34px button. It had
// not mattered much, because until the same night 27 of 29 clients could not be
// notified at all, so almost nobody had ever seen it fire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const src = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"));
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

test("the loud animations exist and move more than 5%", () => {
  assert.match(CSS, /@keyframes cw-alert\b/);
  assert.match(CSS, /@keyframes cw-alert-badge\b/);
  // The specific failing of cw-pulse was that it was almost invisible.
  const alert = CSS.slice(CSS.indexOf("@keyframes cw-alert "), CSS.indexOf("@keyframes cw-alert-badge"));
  const scales = [...alert.matchAll(/scale\(([\d.]+)\)/g)].map((m) => Number(m[1]));
  assert.ok(Math.max(...scales) >= 1.12, `biggest scale is ${Math.max(...scales)} — no louder than the pulse it replaced`);
  assert.match(alert, /box-shadow/, "a glow ring is what makes it read as an alert rather than decoration");
});

test("it does not flash fast enough to look broken", () => {
  // Past about 1Hz a pulse stops reading as urgent and starts reading as a
  // rendering fault, and a UI that looks broken gets ignored just as thoroughly
  // as one that is too quiet.
  for (const f of [
    "src/components/NotificationCenter.tsx",
    "src/components/AppBottomNav.tsx",
    "src/components/MessagesBell.tsx",
  ]) {
    const s = src(f);
    for (const m of s.matchAll(/cw-alert(?:-badge)?\s+([\d.]+)s/g)) {
      assert.ok(Number(m[1]) >= 0.85, `${f}: ${m[1]}s cycle is too fast to read as an alert`);
    }
  }
});

test("the bell and its badge use the loud animation", () => {
  const s = src("src/components/NotificationCenter.tsx");
  assert.match(s, /animation: total > 0 \? "cw-alert /, "the bell itself");
  assert.match(s, /cw-alert-badge/, "the count badge");
  assert.doesNotMatch(s, /cw-pulse/, "the near-invisible pulse must be gone from the bell");
});

test("the messages tab flashes too — icon, label and badge", () => {
  const s = src("src/components/AppBottomNav.tsx");
  assert.match(s, /cw-alert-badge/);
  assert.match(s, /cw-blink/, "opacity change stays; the movement is added to it, not swapped in");
});

test("the messages tab opens the thread the badge is about", () => {
  // The bell always did this — its rows carry their own href and the group row
  // points at /messages?client=group. The tab was a static link, so a badge lit
  // by group activity dropped you on the thread list with the group one tap
  // further away.
  const nav = src("src/components/AppBottomNav.tsx");
  assert.match(nav, /useUnreadTarget/);
  assert.match(nav, /href=\{href\}/, "the Link must use the computed href");
  const hook = src("src/lib/useUnreadCount.ts");
  assert.match(hook, /export function useUnreadTarget/);
});

test("it only ever redirects the messages tab, and only when something is unread", () => {
  // Sending somebody to a thread they did not ask for is worse than the list.
  const nav = src("src/components/AppBottomNav.tsx");
  const i = nav.indexOf("const href =");
  const expr = nav.slice(i, i + 300);
  assert.match(expr, /showBadge/, "no unread, no redirect");
  assert.match(expr, /item\.href\.endsWith\("\/messages"\)/, "other tabs must be untouched");
});

test("the client-preview nav is not thrown onto the real messages route", () => {
  // That nav's items are /client-preview/messages. Replacing the href outright
  // would bounce a trainer previewing a client into their own inbox.
  const nav = src("src/components/AppBottomNav.tsx");
  const i = nav.indexOf("const href =");
  assert.match(nav.slice(i, i + 300), /item\.href\.replace\(/, "the section prefix must be preserved");
});

test("the group notification row still carries the group thread", () => {
  const feed = src("src/lib/useNotificationFeed.tsx");
  assert.match(feed, /"\/messages\?client=group"/);
  assert.match(feed, /group\.anchorId \? "&m=" \+ group\.anchorId/, "and the message to scroll to");
});
