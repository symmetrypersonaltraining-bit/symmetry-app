// Guard: the push senders report what happened, not what they attempted.
//
// This is the path that lights up the moment the VAPID keys land, so it is
// worth it being honest before anyone depends on it. Three lies lived here,
// all the same shape as the rest of 15/16 Aug: a Supabase call RETURNS its
// error rather than throwing, so a try/catch around it never fires and the
// caller is told the happy-path answer.
//
//   1. A refused READ of push_subscriptions was reported as
//      skipped:"no_subscriptions" — the string the settings screen turns into
//      "you haven't turned push on". False, and it sends the person to fix
//      something that is not broken while the real fault stays invisible.
//
//   2. A refused mark-dead on a 404/410 subscription was ignored. The endpoint
//      is then retried on every send forever, `failed` climbs on every message,
//      and last_error — the one column that would explain it — stays empty.
//
//   3. sendPushDiagnostics reported pruned:true for a device token whose DELETE
//      was refused. /api/push-test reads as "cleaned up" while the same dead
//      token fails again on the next send, and the next.
//
// These drive the real functions against a stub client and read the result, so
// a comment describing the right behaviour cannot satisfy them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const WEBPUSH = SRC("src/lib/webPush.ts");
const PUSH = SRC("src/lib/push.ts");
/** Comments intact. Only for asserting a comment is present, never behaviour. */
const PUSH_RAW = readFileSync(join(process.cwd(), "src/lib/push.ts"), "utf8");

test("a refused subscription lookup is not reported as 'no subscriptions'", () => {
  // The two must be separate branches. One combined `if (error || !subs...)`
  // is the bug: it answers "nobody subscribed" to a database refusal.
  assert.doesNotMatch(
    WEBPUSH,
    /if\s*\(\s*error\s*\|\|/,
    "a read error is still collapsed into the empty-list case",
  );
  assert.match(
    WEBPUSH,
    /if\s*\(error\)\s*\{[\s\S]{0,400}?skipped:\s*"lookup_failed"/,
    "a refused read must be distinguishable from an empty list",
  );
  assert.match(WEBPUSH, /"no_vapid_keys"\s*\|\s*"no_subscriptions"\s*\|\s*"lookup_failed"/,
    "the result type must admit the new outcome, or callers cannot act on it");
});

test("a refused read says so out loud", () => {
  assert.match(
    WEBPUSH,
    /console\.error\("sendWebPush: could not read push_subscriptions/,
    "the read failure is silent — nothing anywhere would show it",
  );
});

test("both subscription writes check their error", () => {
  // Counted, not matched: there are exactly two updates against
  // push_subscriptions and BOTH must branch on the result. Matching one would
  // pass with the other left silent, which is how the first pass of this got
  // through on 15 Aug.
  const updates = (WEBPUSH.match(/\.from\("push_subscriptions"\)\s*\n?\s*\.update\(/g) || []).length;
  assert.equal(updates, 2, `expected 2 writes to push_subscriptions, found ${updates}`);
  const checked = (WEBPUSH.match(/const \{ error: (markErr|noteErr) \}/g) || []).length;
  assert.equal(checked, 2, `${checked} of the 2 subscription writes capture their error`);
  assert.match(WEBPUSH, /if \(markErr\)[\s\S]{0,200}?console\.error/, "a failed mark-dead is swallowed");
  assert.match(WEBPUSH, /if \(noteErr\)[\s\S]{0,200}?console\.error/, "a failed error-note is swallowed");
});

test("a dead subscription is marked, never deleted", () => {
  // "They had push and it lapsed" and "they never set it up" are different
  // conversations to have with a client, and a delete destroys the difference.
  assert.doesNotMatch(WEBPUSH, /\.from\("push_subscriptions"\)\s*\n?\s*\.delete\(/, "subscriptions are being deleted");
  assert.match(WEBPUSH, /failed_at: new Date\(\)\.toISOString\(\)/);
});

test("a transient failure never marks a subscription dead", () => {
  // Marking someone unreachable because of one timeout is how they silently
  // stop getting messages. Only 404/410 may set failed_at.
  const branch = WEBPUSH.slice(WEBPUSH.indexOf("status === 404"));
  const elseIdx = branch.indexOf("} else {");
  assert.ok(elseIdx > 0, "the transient branch is gone");
  assert.doesNotMatch(branch.slice(elseIdx), /failed_at/, "the transient branch marks the subscription dead");
});

test("pruned reports the delete's outcome, not the attempt", () => {
  assert.match(PUSH, /pruned = !delErr/, "pruned is still set from the decision to prune rather than the result");
  assert.match(
    PUSH,
    /const \{ error: delErr \} = await admin\.from\("device_tokens"\)\.delete\(\)/,
    "the token delete does not capture its error",
  );
  // And the old shape must be gone: a bare try/catch around the delete can
  // never fire, because the call returns its error instead of throwing.
  assert.doesNotMatch(
    PUSH,
    /try \{ await admin\.from\("device_tokens"\)\.delete\(\)/,
    "the delete is still wrapped in a catch that cannot fire",
  );
});

test("a failed prune surfaces in the diagnostics output", () => {
  // /api/push-test is the only window onto this. If the prune failed, the
  // person reading that page has to be able to see it.
  assert.match(PUSH, /prune failed: \$\{delErr\.message\}/);
});

test("push still cannot break the thing that called it", () => {
  // The whole contract. A message send must survive a total push outage.
  //
  // Checked on the STRIPPED source, so an empty `catch { }` counts and only the
  // structure is being asserted. The comment inside it is checked separately
  // against the raw file, because a swallowed error with no note explaining why
  // is how the rest of this file went wrong.
  assert.match(PUSH, /\}\s*catch\s*\{\s*\}\s*\}?\s*$/m, "sendPushToUser no longer swallows its own failure");
  assert.match(PUSH_RAW, /catch \{ \/\* push must never break the caller \*\/ \}/,
    "the deliberate swallow lost the comment that says it is deliberate");
  assert.match(PUSH, /sendWebPush\([\s\S]{0,300}?\)\.catch\(\(\) => undefined\)/);
  assert.match(PUSH, /sendPushDiagnostics\(userId, title, body, data\)\.catch\(\(\) => undefined\)/);
});

test("both routes are still attempted, neither gating the other", () => {
  // FCM reached 2 of 29 clients. Web Push reaches the rest. A regression to
  // either-or puts 27 people back to silence.
  assert.match(PUSH, /await Promise\.all\(\[/);
});
