// THE GROUP ROOMS WERE SPLIT PER TRAINER ON 21 AUG. THREE PLACES DID NOT FOLLOW.
//
// Dustin, 23 Aug: "the group was split for per trainer. group chat is for
// trainer n their clients only not shared."
//
// The database side is complete and correct: `messages.group_trainer_id`, a
// BEFORE INSERT trigger `stamp_group_message()` that fills it from
// `my_group_trainer_id()`, and an RLS policy `read_own_group_messages` that
// requires `group_trainer_id IS NOT NULL AND = my_group_trainer_id()`. Reading
// a group thread has been correctly scoped the whole time.
//
// WRITING was not, in three separate ways:
//
//   1. `my_group_trainer_id()` resolves through `auth.uid()`. Every bot and the
//      trainer agent insert on the SERVICE ROLE, where auth.uid() is NULL — so
//      the trigger stamped NULL, and the policy requires NOT NULL. Verified
//      against the live database with a probe insert: it came back NULL. Those
//      posts land in the table and are invisible to every client. No error, no
//      bounce, nothing on screen.
//   2. The trainer agent's group branch posted as ownerAuthUid() — so Brooke
//      asking her agent to post to her group signed it as Dustin and filed it
//      in his room.
//   3. Coach Bot's leaderboard, the birthday sweep and the push fan-out all
//      read the WHOLE instance while posting into ONE room: another trainer's
//      client named by first name in a room of strangers, and every client in
//      the business buzzed with the opening words of a message RLS will then
//      refuse to show them.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Every object literal passed to a messages insert in this file. */
function groupInserts(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('from("messages")');
  while (i >= 0) {
    const ins = src.indexOf(".insert(", i);
    if (ins > 0 && ins - i < 200) {
      const chunk = src.slice(ins, ins + 700);
      if (/is_group:\s*true/.test(chunk)) out.push(chunk);
    }
    i = src.indexOf('from("messages")', i + 1);
  }
  return out;
}

for (const f of [
  "src/app/api/cron/coachbot/route.ts",
  "src/app/api/cron/birthdays/route.ts",
  "src/lib/ai/agent-tools.ts",
]) {
  test(`${f}: a service-role group post names its room`, () => {
    const inserts = groupInserts(read(f));
    assert.ok(inserts.length > 0, "no group insert found — has it moved?");
    for (const chunk of inserts) {
      assert.match(
        chunk,
        /group_trainer_id:/,
        `this insert relies on the trigger, which stamps NULL on the service role — the post would be invisible to everyone:\n${chunk.slice(0, 300)}`,
      );
    }
  });
}

test("the agent posts to the CALLER's room, as the caller", () => {
  const src = read("src/lib/ai/agent-tools.ts");
  assert.match(src, /if \(isGroup\) trainerUid = caller\.authUserId;/,
    "a trainer's group post is still signed with the owner's account");
  assert.match(src, /group_trainer_id: caller\.trainerId/,
    "a trainer's group post is still filed in the owner's room");
  assert.match(src, /if \(!caller\.trainerId\) return "Error: only a trainer has a group to post in\."/);
});

test("Coach Bot only names people who are in the room it posts to", () => {
  const src = read("src/app/api/cron/coachbot/route.ts");
  assert.match(src, /const roomTrainer = await ownerTrainer\(db\);/);
  assert.match(src, /\.eq\("trainer_id", roomTrainer\.id\)/,
    "the leaderboard is still instance-wide while the post goes to one room");
  assert.match(src, /const rows = allRows\.filter\(\(r\) => inThisRoom\.has\(r\.client_id\)\)/);
  // Ranks must NOT be renumbered after the filter — that invents a standing.
  assert.ok(
    !/rnk:\s*i\s*\+\s*1|rnk:\s*idx/.test(src),
    "ranks are being recomputed after filtering, which tells someone they are winning a challenge they are not",
  );
});

test("the birthday GROUP post is narrowed but the private heads-up is not", () => {
  const src = read("src/app/api/cron/birthdays/route.ts");
  assert.match(src, /whoseBirthday\(db, today, roomTrainer\.id\)/, "the group post still names every trainer's clients");
  assert.match(src, /const tomorrowPeople = await whoseBirthday\(db, tomorrowIso\);/,
    "the heads-up was narrowed too — it is routed to each client's OWN coach and is correct roster-wide");
  assert.match(src, /if \(onlyTrainer\) q = q\.eq\("trainer_id", onlyTrainer\);/);
});

test("a group push reaches the room, not the whole business", () => {
  const src = read("src/app/(app)/home/messageActions.ts");
  assert.match(src, /const roomTrainerId =/, "the fan-out never asks which room the message landed in");
  assert.match(src, /roomTrainerId \? memberQ\.eq\('trainer_id', roomTrainerId\) : memberQ/);
  assert.match(src, /roomTrainerId \? coachQ\.eq\('id', roomTrainerId\) : coachQ/);
  // The insert has to return the row for any of that to be knowable.
  assert.match(src, /\.select\("group_trainer_id"\)/);
});

test("no comment still claims the group is shared", () => {
  // These said "the group chat is shared by decision" and were quoted as the
  // reason for owner-wide behaviour. They are now the opposite of true, and a
  // stale reason is worse than none — the next person reads it and rebuilds the
  // thing it justifies.
  const stale: string[] = [];
  for (const f of [
    "src/app/api/cron/coachbot/route.ts",
    "src/app/api/cron/birthdays/route.ts",
    "src/lib/ai/agent-tools.ts",
    "src/app/(app)/home/messageActions.ts",
    "src/lib/birthdays.ts",
    "src/components/AiBadge.tsx",
  ]) {
    for (const line of read(f).split("\n")) {
      if (/group (chat )?(is|itself is) shared/i.test(line)) stale.push(`${f}: ${line.trim()}`);
    }
  }
  assert.deepEqual(stale, [], `these still say the group is shared:\n${stale.join("\n")}`);
});
