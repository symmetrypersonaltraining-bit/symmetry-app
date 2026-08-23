// EVERY TRAINER GETS WHAT DUSTIN HAS.
//
// Dustin, 23 Aug: "if I have a group chat with challenges and ai bots, and
// other trainers do not, thats not exactly like mine is it? ... if I have it on
// my trainer app, build it exactly the same on theirs."
//
// 20260821g split the group ROOMS per trainer and added group_challenges
// .trainer_id. Nothing that reads, scores, closes, announces or creates a
// challenge followed, so a second trainer had a room with nothing in it — and
// four of those were broken rather than merely unfinished:
//
//   * generate_next_challenge() and the /api/challenge create both inserted
//     with no trainer_id, from contexts where auth.uid() is NULL (pg_cron and
//     the service role). The stamping trigger stamped NULL, and
//     read_own_group_challenges requires NOT NULL — so a trainer pressed Start,
//     got {ok:true}, and nobody including them could see the challenge.
//   * Its "never two live at once" guards were global: once ANY trainer had a
//     live challenge, no other trainer ever got an auto-generated one.
//   * announce_challenge_winner() found the coach with
//     `select user_id from trainer_settings limit 1` and posted with no
//     group_trainer_id — the winner announcement was shown to nobody.
//   * challenge_leaderboard() is SECURITY DEFINER over a roster with no trainer
//     column, so a client of Brooke's would have seen Dustin's clients by name.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = "supabase/migrations/20260823c_a_challenge_belongs_to_a_room.sql";
const sql = () => read(MIGRATION);

test("the migration exists", () => {
  assert.ok(existsSync(join(ROOT, MIGRATION)));
});

// ── the engine ─────────────────────────────────────────────────────────────

test("the roster carries the trainer, and both scorers use it", () => {
  const s = sql();
  assert.match(s, /c\.trainer_id as tid/, "v_challenge_roster still has no trainer column");
  assert.match(s, /where r\.ranked and r\.tid = v_trainer/, "challenge_leaderboard ranks the whole gym");
  assert.match(s, /select r\.cid from v_challenge_roster r where r\.tid = v_trainer/,
    "challenge_group_total totals the whole gym");
});

test("a challenge with no room ranks nobody rather than everybody", () => {
  const s = sql();
  assert.match(s, /if v_trainer is null then return; end if;/,
    "a null trainer_id would fall through to an unfiltered roster");
});

test("the auto-generator names its room and guards per room", () => {
  const s = sql();
  assert.match(s, /generate_next_challenge\(p_trainer uuid default null\)/, "still takes no trainer");
  assert.match(s, /if p_trainer is null then return null; end if;/);
  assert.match(s, /status = 'live' and trainer_id = p_trainer/, "the 'never two live' guard is still global");
  assert.match(s, /starts_on = v_start and trainer_id = p_trainer/, "the 'never two this week' guard is still global");
  assert.match(s, /auto_generated, trainer_id\)/, "the insert still omits trainer_id — pg_cron stamps NULL");
});

test("the rotation is per room, so two gyms are not forced onto the same week", () => {
  assert.match(sql(), /where g\.trainer_id = p_trainer\s*\n\s*order by g\.starts_on desc limit 1/);
});

test("the hourly tick runs every room", () => {
  const s = sql();
  assert.match(s, /for t in select id from trainers where active order by created_at loop/,
    "the tick still generates for one gym");
  assert.match(s, /v_new := public\.generate_next_challenge\(t\.id\);/);
});

test("closing scores every due room, not one per hour", () => {
  const s = sql();
  const i = s.indexOf("function public.close_due_challenge");
  assert.ok(i > 0);
  const body = s.slice(i, s.indexOf("$function$;", i));
  assert.match(body, /for r in\s*\n\s*select id from group_challenges/, "still `limit 1`");
  assert.ok(!/order by ends_on\s*\n\s*limit 1;/.test(body), "still takes one challenge per tick");
});

test("the winner is announced in the challenge's own room, by its own coach", () => {
  const s = sql();
  assert.match(s, /select auth_user_id into v_uid from trainers where id = v_ch\.trainer_id and active;/,
    "still picks 'the' trainer from trainer_settings");
  assert.match(s, /insert into messages \(from_id, to_id, body, is_group, is_broadcast, group_trainer_id\)/,
    "the announcement is still stamped NULL and therefore invisible");
});

test("the policies stop one room writing into another", () => {
  const s = sql();
  assert.match(s, /with check \(public\.is_trainer\(\) and trainer_id = public\.my_trainer_id\(\)\)/,
    "any trainer can still insert a challenge into any room");
  assert.match(s, /g\.trainer_id = public\.my_group_trainer_id\(\)/,
    "challenge_participants is still readable by every signed-in user");
});

test("the view can hold one live challenge per room", () => {
  const s = sql();
  const i = s.indexOf("create view public.v_active_challenge");
  assert.ok(i > 0);
  // Just the view statement — the file continues past it.
  const view = s.slice(i, s.indexOf("\n\n", i));
  assert.ok(!/limit 1/.test(view), "LIMIT 1 means only one room in the whole app can have a live challenge");
  assert.match(view, /security_invoker = true/, "without this the view would ignore RLS");
});

// ── the bots ───────────────────────────────────────────────────────────────

for (const [f, fn] of [
  ["src/app/api/cron/coachbot/route.ts", "runCoachBotForRoom"],
  ["src/app/api/cron/birthdays/route.ts", "runBirthdaysForRoom"],
] as const) {
  test(`${fn} takes a room and posts into it`, () => {
    const s = read(f);
    assert.match(s, new RegExp(`export async function ${fn}\\(`), "still runs once for the whole app");
    assert.match(s, /room: Room,/);
    assert.match(s, /group_trainer_id: room\.trainerId/, "the post is not stamped with this room");
    assert.match(s, /from_id: room\.authUserId/, "the post is signed by somebody other than this room's coach");
  });

  test(`${f} sweeps every active trainer`, () => {
    const s = read(f);
    assert.match(s, /\.from\("trainers"\)[\s\S]{0,200}\.eq\("active", true\)/, "the sweep does not enumerate trainers");
    assert.match(s, /if \(onlyTrainer\) rooms = rooms\.filter/,
      "a trainer firing it by hand would run every room");
    assert.ok(
      !/isOwner/.test(s),
      "an owner-only gate is still here — it was a symptom of the bot knowing only one room",
    );
  });
}

test("Coach Bot reads THIS room's challenge and this room's switch", () => {
  const s = read("src/app/api/cron/coachbot/route.ts");
  assert.match(s, /\.from\("v_active_challenge"\)[\s\S]{0,200}\.eq\("trainer_id", room\.trainerId\)/,
    "it would tease whichever room sorted first");
  assert.match(s, /trainerFeatureOn\(db, room\.trainerId, "coachbot"\)/,
    "it still reads the owner's preference for everyone's room");
  assert.match(s, /const ownerName = room\.firstName/, "it still speaks as the owner in every room");
});

test("the birthday heads-up is sent once, not once per room", () => {
  const s = read("src/app/api/cron/birthdays/route.ts");
  assert.match(s, /opts\.headsUpDone \? \[\] : await whoseBirthday\(db, tomorrowIso\)/,
    "each room would send another copy of the same private nudge");
  assert.match(s, /headsUpDone = true;/);
  // And the group half stays narrowed to the room.
  assert.match(s, /whoseBirthday\(db, today, room\.trainerId\)/);
});

// ── the API ────────────────────────────────────────────────────────────────

test("creating a challenge names its room and closes only its own", () => {
  const s = read("src/app/api/challenge/route.ts");
  assert.match(s, /my_group_trainer_id_for/, "the route never asks which room the caller is in");
  assert.match(s, /status: "live", trainer_id: roomId }/,
    "the insert is on the service role and would be stamped NULL — invisible to everyone");
  const i = s.indexOf("Only one challenge runs at a time");
  assert.ok(i > 0);
  assert.match(s.slice(i, i + 900), /\.eq\("trainer_id", roomId\)/,
    "starting a challenge still completes every other trainer's");
});

test("ending a challenge that is not yours is refused, not silently ignored", () => {
  const s = read("src/app/api/challenge/route.ts");
  const i = s.indexOf('if (body.action === "end")');
  assert.ok(i > 0);
  const block = s.slice(i, i + 1200);
  assert.match(block, /\.eq\("trainer_id", roomId\)/);
  assert.match(block, /not in your group/, "a no-op update would report success");
});

test("the board and the group total are this room's", () => {
  const s = read("src/app/api/challenge/route.ts");
  assert.match(s, /\.eq\("trainer_id", roomId\)\s*\n\s*\.lte\("starts_on", today\)/,
    "GET answers with whichever challenge sorted first");
  assert.match(s, /roomIds\.has\(id\) && !unranked\.has\(id\)/, "the named standings are instance-wide");
  assert.match(s, /\.in\("client_id", roster\.length/, "the anonymous total counts the whole business");
});

test("join and leave act on this room's challenge", () => {
  const s = read("src/app/api/challenge/route.ts");
  const i = s.indexOf('.eq("status", "live")');
  assert.ok(i > 0);
  assert.match(s.slice(i, i + 300), /\.eq\("trainer_id", roomId\)/);
});

test("the browser reads do not assume one live challenge in the whole app", () => {
  for (const f of [
    "src/components/ClientTakeovers.tsx",
    "src/components/CommunityPair.tsx",
    "src/components/GroupChallenge.tsx",
  ]) {
    assert.match(read(f), /\.order\("starts_on", \{ ascending: false \}\)\.limit\(1\)\.maybeSingle\(\)/,
      `${f} would throw PGRST116 the moment a second room has a live challenge`);
  }
});
