import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY PUSH GOES THROUGH THE PREFERENCE GATE. THERE IS ONE DOOR.
 *
 * Dustin, 13 Aug: "what they have a choice of and what i say is built in."
 * And 14 Aug, on reactions: "the person that sent the message should be able to
 * set if they want notifications when others react with emojis to it."
 *
 * Before this, `sendPushToUser` took (userId, title, body) and checked nothing.
 * A new caller could bypass preferences entirely by simply not knowing they
 * existed — which is not a hypothetical, it is the default outcome, because
 * nothing in the signature mentioned them.
 *
 * So the event is a REQUIRED parameter and it is a NotificationEvent, not a
 * string. You cannot send a push without naming what kind it is, and naming it
 * is what routes you through the gate. A typo cannot invent a new event and a
 * new event cannot skip the registry, because the registry is the type.
 *
 * The other half of the rule lives in the registry itself: an event is either
 * the client's to switch off or it is `forced`, and that decision sits next to
 * the event rather than being re-made at each send site.
 */

const ROOT = process.cwd();

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

test("sendPushToUser still takes an event, and still consults the gate", () => {
  const push = codeOnly(readFileSync(join(ROOT, "src/lib/push.ts"), "utf8"));

  assert.match(
    push,
    /export async function sendPushToUser\(\s*userId: string,\s*event: NotificationEvent,/,
    "sendPushToUser no longer requires an event — callers can push again without any preference check",
  );
  assert.match(
    push,
    /if \(await isMuted\(userId, event\)\) return;/,
    "the mute check is gone from sendPushToUser; preferences are now decorative",
  );
  assert.match(
    push,
    /if \(event\.forced\) return false;/,
    "forced events no longer bypass the check — or the check no longer exists",
  );
});

test("the gate fails OPEN, so a broken lookup never silences a real message", () => {
  const push = codeOnly(readFileSync(join(ROOT, "src/lib/push.ts"), "utf8"));
  const fn = push.slice(push.indexOf("async function isMuted"), push.indexOf("export async function sendPushToUser"));

  assert.match(
    fn,
    /if \(error\) return false;/,
    "a preference-read error no longer fails open. Silence is indistinguishable from " +
      "'nothing happened', and this is how someone misses a message from their coach",
  );
  assert.match(
    fn,
    /catch\s*\{\s*return false;/,
    "the catch no longer fails open — an exception in the gate would now mute real pushes",
  );
  assert.match(
    fn,
    /enabled\s*===\s*false/,
    "muting is no longer a strict check for false; a missing row must mean ENABLED, not muted",
  );
});

test("no caller anywhere calls sendPushToUser without an event", () => {
  // Every call site, read off disk rather than trusted. tsc would catch a
  // missing argument, but this states the rule in the place someone will read
  // when they add the sixth caller.
  //
  // Reads whole FILES, not grep lines: a call formatted across several lines
  // (as the reaction one is) has its second argument on a different line from
  // its name, and a line-based check silently passes or falsely fails on it.
  const files = execSync(
    `grep -rl "sendPushToUser(" src --include=*.ts --include=*.tsx | grep -v "src/lib/push.ts" || true`,
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  assert.ok(files.length > 0, "no caller files found at all — did the push layer move?");

  let calls = 0;
  for (const file of files) {
    const src = codeOnly(readFileSync(join(ROOT, file), "utf8"));
    const re = /sendPushToUser\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      calls += 1;
      // The second argument, however it is wrapped.
      const after = src.slice(m.index + m[0].length, m.index + m[0].length + 300);
      assert.match(
        after,
        /^[^,]+,\s*NOTIFICATION_EVENTS\./,
        `a call in ${file} does not pass a NOTIFICATION_EVENTS member as its second ` +
          `argument, so it is not declaring what it sends:\n  ${after.slice(0, 120).trim()}`,
      );
    }
  }
  assert.ok(calls >= 4, `expected at least the four message pushes, found ${calls}`);
});

test("a reaction never notifies you about yourself, and coalesces a flurry", () => {
  const actions = codeOnly(
    readFileSync(join(ROOT, "src/app/(app)/home/messageActions.ts"), "utf8"),
  );
  const fn = actions.slice(actions.indexOf("export async function notifyMessageReaction"));
  assert.ok(fn.length > 0, "notifyMessageReaction is gone");

  assert.match(
    fn,
    /if \(m\.from_id === user\.id\) return;/,
    "the self-reaction guard is gone — reacting to your own message would buzz your own phone",
  );
  assert.match(
    fn,
    /if \(\(count \?\? 0\) > 1\) return;/,
    "the coalescing guard is gone — five reactions in a minute would be five separate notifications",
  );
  assert.match(
    fn,
    /NOTIFICATION_EVENTS\.REACTION_ON_MY_MESSAGE/,
    "the reaction push no longer declares its event, so the sender's opt-out would be ignored",
  );
});

test("the registry keeps forced events to a genuine minimum", () => {
  const reg = codeOnly(readFileSync(join(ROOT, "src/lib/notificationEvents.ts"), "utf8"));
  // Count CLIENT-FACING forced events only. The rule's stated reason is that a
  // forced push gives a CLIENT a motive to switch notifications off at the OS
  // level, taking their payment reminders down with it. A trainerOnly event is
  // never on a client's phone and cannot cause that, so it is not what this
  // ratchet is protecting against.
  //
  // Each event object is one `{ ... }` block in the registry; a forced one that
  // also says trainerOnly does not count here.
  const blocks = reg.split(/^\s{2}[A-Z_]+:\s*\{/m).slice(1);
  const forcedClientFacing = blocks.filter(
    (b) => /forced:\s*true/.test(b) && !/trainerOnly:\s*true/.test(b),
  ).length;
  assert.ok(
    forcedClientFacing <= 1,
    `${forcedClientFacing} CLIENT-FACING events are forced. Every one is a reason to switch ` +
      `notifications off at the OS level, and that takes the payment reminders down with it. ` +
      `If a second one is genuinely Dustin's to force, raise this number deliberately.`,
  );
});
