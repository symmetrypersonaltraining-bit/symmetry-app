// Guard: the app can notify somebody who is not holding the Android APK.
//
// ── Measured, 16 Aug, before a line of this was written ─────────────────────
//
// Dustin: "Noone is chatting in the group chat. confirm they are getting
// notification."
//
//   29 active clients with logins.
//   2  rows in device_tokens — his own and one other.
//
// Not "switched off": exactly two preference rows were disabled in the entire
// table. Nobody else COULD be reached. PushRegister returns immediately unless
// Capacitor.isNativePlatform(), so every client on the installed web app got
// nothing, ever — and public/sw.js, the one thing that could have reached them,
// had no push handling in it at all.
//
// A hundred group messages went out in a fortnight and 27 people were never
// told about a single one. The silence was not disinterest, and no amount of
// making the bell flash harder would have touched it.
//
// These tests exist so that cannot quietly become true again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const src = (p: string) => strip(read(p));

test("the service worker handles push at all", () => {
  // The single fact that made every notification preference decorative.
  const sw = src("public/sw.js");
  assert.match(sw, /addEventListener\(\s*["']push["']/, "sw.js cannot receive a push");
  assert.match(sw, /showNotification\(/, "a received push must actually be shown");
});

test("tapping a notification opens the thread it came from", () => {
  // A group push that dumps you on the client list is why people stop tapping.
  const sw = src("public/sw.js");
  assert.match(sw, /addEventListener\(\s*["']notificationclick["']/);
  assert.match(sw, /data\.url/, "the target must come from the payload, not be hardcoded");
  assert.match(sw, /navigate\(/, "an already-open tab must be sent to the thread, not just focused");
});

test("a rotated subscription re-registers instead of going silent", () => {
  // Browsers rotate endpoints. Without this the old endpoint keeps being pushed
  // to, every send 410s, and the person silently stops receiving anything —
  // this exact bug, arriving by a different door.
  const sw = src("public/sw.js");
  assert.match(sw, /addEventListener\(\s*["']pushsubscriptionchange["']/);
  assert.match(sw, /\/api\/push\/subscribe/);
});

test("sendPushToUser tries the route that reaches non-APK users", () => {
  const s = src("src/lib/push.ts");
  assert.match(s, /sendWebPush\(/, "web push is not wired into the one door");
  const i = s.indexOf("export async function sendPushToUser");
  const body = s.slice(i, i + 1400);
  assert.match(body, /sendWebPush\(/);
  assert.match(body, /sendPushDiagnostics\(/, "the APK route must still fire for the people who have it");
});

test("neither delivery route can stop the other", () => {
  // Somebody with the APK and a browser subscription gets two notifications.
  // That is a much better problem than the one being fixed, and it must not be
  // solved by making one route depend on the other succeeding.
  const s = src("src/lib/push.ts");
  const i = s.indexOf("export async function sendPushToUser");
  const body = s.slice(i, i + 1400);
  assert.match(body, /Promise\.all\(/);
  assert.equal((body.match(/\.catch\(\(\) => undefined\)/g) || []).length, 2, "both sends must be individually guarded");
});

test("web push is inert until it is configured, and says so", () => {
  // It ships before the VAPID keys exist. Unconfigured it must do nothing at
  // all — and the settings screen must be able to ASK, so it can say "your
  // coach hasn't finished setting this up" rather than failing silently, which
  // is the failure this whole change exists to end.
  const s = src("src/lib/webPush.ts");
  assert.match(s, /export function configured\(\)/);
  assert.match(s, /skipped: "no_vapid_keys"/);
  const i = s.indexOf("export async function sendWebPush");
  assert.match(s.slice(i, i + 300), /if \(!ensureConfigured\(\)\) return/, "it must bail before touching the database");
});

test("a dead subscription is marked, not deleted", () => {
  // "They had push and it lapsed" and "they never set it up" are different
  // conversations to have with a client, and only one of them is a bug.
  const s = src("src/lib/webPush.ts");
  assert.match(s, /status === 404 \|\| status === 410/);
  assert.match(s, /failed_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(s, /\.delete\(\)/, "a transient failure must never remove somebody's subscription");
});

test("a transient failure does not mark somebody unreachable", () => {
  const s = src("src/lib/webPush.ts");
  const i = s.indexOf("} else {", s.indexOf("status === 404"));
  const branch = s.slice(i, i + 400);
  assert.match(branch, /last_error/);
  assert.doesNotMatch(branch, /failed_at/, "a timeout must not retire the subscription");
});

test("the page-load registrar never fires a permission prompt", () => {
  // A prompt on page load is the fastest way to get Block pressed, and a
  // blocked origin cannot be asked again from inside the app.
  const s = src("src/components/WebPushRegister.tsx");
  assert.doesNotMatch(s, /requestPermission\(/, "it must never ask; it only stores an already-granted subscription");
  assert.match(s, /Notification\.permission !== "granted"/);
});

test("the ASK lives behind a button on the settings screen", () => {
  const s = src("src/components/NotificationSettings.tsx");
  assert.match(s, /Notification\.requestPermission\(\)/);
  assert.match(s, /Turn on notifications/);
});

test("a failed subscribe is shown, not swallowed", () => {
  // "It said it worked and I still get nothing" is precisely the complaint this
  // change answers. Recreating it inside the fix would be the worst outcome.
  const s = src("src/components/NotificationSettings.tsx");
  assert.match(s, /if \(!res\.ok\)/);
  assert.match(s, /setErr\(/);
});

test("both registrars are mounted, for clients and the trainer", () => {
  const s = src("src/app/(app)/layout.tsx");
  assert.equal((s.match(/<WebPushRegister \/>/g) || []).length, 2, "trainer and client branches both need it");
  assert.equal((s.match(/<PushRegister \/>/g) || []).length, 2);
});
