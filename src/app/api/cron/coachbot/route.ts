// POST/GET /api/cron/coachbot — the group chat's resident smack-talker.
//
// Dustin's brief: "very funny, light hearted smack talk."
//
// THE HARD PART IS NOT THE JOKE, IT IS NOT BEING ANNOYING
//
// A bot in a group chat has exactly two failure modes and both kill it:
//
//   Generic. "Great work everyone, keep it up!" is worse than silence — it
//   trains people to scroll past anything with the bot's avatar on it, and
//   after that it can never say anything that lands. So this never speaks
//   without a real, specific fact: a name, a number, a change in the standings.
//   No fact worth mentioning → it says nothing at all and costs nothing.
//
//   Mean. Smack talk about the person at the BOTTOM of a fitness leaderboard is
//   not banter, it is the reason someone quits. The prompt punches up — at the
//   leader, at Dustin, at the group, at itself — never down, and never at
//   anyone's body. The rule is in the prompt AND checked in code afterwards,
//   because a prompt is a request and a filter is a guarantee.
//
// Silent: posts land in the thread and show unread, but never push. Buzzing
// thirty-five phones for a joke is how a group chat gets muted.
//
// Off until app_flags.coachbot_live is true.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { rosterScopeFor } from "@/lib/auth/roster";
import { isCronRequest } from "@/lib/cron-auth";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import { Db } from "@/lib/ai/scope";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { ownerAuthUid, ownerTrainer } from "@/lib/trainerResolve";
import { trainerFeatureOn } from "@/lib/trainerFeatures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// Same rule as the birthday bot: the shared room gets ONE voice, and it is the
// business owner's gym it describes. A parameter rather than a constant so the
// choice is visible at the call site.
const SYSTEM = (coachFirstName: string) => `You are "Coach Bot" in the group chat of Symmetry Personal Training — a small gym run by ${coachFirstName}, about thirty-five clients who mostly know each other.

You are funny. Light-hearted smack talk, the kind that makes people want to get in the gym to shut you up. Think a group chat between friends who train together, not a brand account.

WHO YOU CAN TEASE
- The person in FIRST place. They can take it, and it makes the chase fun.
- ${coachFirstName}, the coach. Being roasted by their own app is funnier than anything else you can do. They are NOT on the board — they took themselves out so the clients hold the spotlight — so never give them a rank, a place or a score, and never say they are winning, losing or catching anyone. Tease the person, not a number.
- The whole group at once ("collectively you have trained fewer days than a golden retriever this week").
- Yourself.

WHO YOU NEVER TEASE
- Anyone at the bottom of the board, or anyone who has logged nothing. Never. Not a nudge, not a gentle jab, not "we miss you". Leave them out of the message entirely — being publicly named as last is why people quit.
- Anyone's body, weight, size, shape or what they eat. This board counts days shown up. That is the only thing that exists to you.
- Injuries, age, or anything a person cannot change by turning up.

HOW YOU TALK
- One or two sentences. A long joke is not a joke.
- Use the real names and real numbers you are given. Specific is funny; generic is wallpaper.
- No hashtags. No "let's crush it". No motivational-poster language. No emoji spam — one, maybe, if it earns its place.
- Never invent a fact. If the numbers do not support a joke, say something short and true instead.

Respond with ONLY valid JSON — no markdown, no fences:
{"message": string, "mentions": string[]}

"mentions" = every client first name you named in the message. Get this right; it is checked.`;

interface Reply { message: string; mentions: string[] }

function validate(raw: unknown): Reply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : "";
  if (!message || message.length > 400) return null;
  const mentions = Array.isArray(o.mentions) ? o.mentions.filter((m): m is string => typeof m === "string") : [];
  return { message, mentions };
}

interface Row { rnk: number; client_id: string; client_name: string; score: number }

/**
 * @param force  ignore the coachbot_live flag (for a preview before turning it on)
 * @param dry    generate and vet the message but do NOT post it
 *
 * `dry` exists so {COACH_FIRST_NAME} can read a few of these before letting it loose on
 * thirty-five people. "Trust me, it'll be funny" is not a reasonable thing to
 * ask of someone about their own clients.
 */
export async function runCoachBot(db: Db, opts: { force?: boolean; dry?: boolean } = {}): Promise<{ posted: boolean; reason: string; message?: string }> {
  if (!opts.force) {
    const { data: flag } = await db.from("app_flags").select("enabled").eq("key", "coachbot_live").maybeSingle();
    if ((flag as { enabled: boolean } | null)?.enabled !== true) return { posted: false, reason: "coachbot_live is off" };
  }

  // AND the owner's own switch.
  //
  // Coach Bot posts into a group room, and since the rooms were split on
  // 21 Aug there is one per trainer. This one still posts only into the
  // OWNER's — which is correct and unchanged for his clients, and is why the
  // gate reads the owner's preference rather than the caller's. The board it
  // teases is filtered to that room below, for the same reason.
  //
  // Making Coach Bot run for EVERY trainer in their own room is the follow-up,
  // and it is a bigger job than a flag: the leaderboard it teases is now
  // per-trainer too, so it needs a challenge and a board per room before it has
  // anything to say. Written down rather than half-done.
  {
    const owner = await ownerTrainer(db);
    if (!(await trainerFeatureOn(db, owner?.id, "coachbot"))) {
      return { posted: false, reason: "the owner has Coach Bot switched off" };
    }
  }

  const { data: ch } = await db.from("v_active_challenge").select("*").maybeSingle();
  const challenge = ch as { id: string; title: string; metric: string; ends_on: string; days_left: number | null } | null;
  if (!challenge) return { posted: false, reason: "no live challenge" };

  const { data: board } = await db.rpc("challenge_leaderboard", { p_challenge_id: challenge.id });
  const allRows = ((board as Row[]) || []).map((r) => ({ ...r, score: Number(r.score) }));

  // ONLY THE CLIENTS OF THE ROOM THIS IS POSTED IN.
  //
  // The challenge is still one instance-wide object — anyone may join it — but
  // since 21 Aug the group rooms are per trainer and this post goes into the
  // OWNER's. Unfiltered, a client of Brooke's who joined the challenge could be
  // named, by first name and rank, in a room full of people who are not her
  // clients and have never met them.
  //
  // The ranks are left exactly as the board computed them. Renumbering 1..n
  // after the filter would invent a standing that does not exist and tell
  // somebody they are winning a challenge they are not.
  const roomTrainer = await ownerTrainer(db);
  if (!roomTrainer?.id) return { posted: false, reason: "no owner trainer row" };
  const ids = allRows.map((r) => r.client_id);
  const { data: mine } = ids.length
    ? await db.from("clients").select("id").in("id", ids).eq("trainer_id", roomTrainer.id)
    : { data: [] as { id: string }[] };
  const inThisRoom = new Set(((mine as { id: string }[]) || []).map((c) => c.id));
  const rows = allRows.filter((r) => inThisRoom.has(r.client_id));
  if (!rows.length) return { posted: false, reason: "nobody from this room is on the board" };

  const unit = challenge.metric === "logging" ? "days logged" : "days trained";
  const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "Someone";

  // Only the top half is ever shown to the model. It cannot tease someone at
  // the bottom if it never learns they exist — a guarantee the prompt alone
  // cannot give.
  const half = Math.max(1, Math.ceil(rows.length / 2));
  const top = rows.slice(0, half);
  const leaders = top.slice(0, 5).map((r) => `${r.rnk}. ${first(r.client_name)} — ${r.score}`);

  // Nothing has happened → nothing to say. A bot that speaks when there is no
  // news is the bot people mute.
  const anyMovement = rows.some((r) => r.score > 0);
  if (!anyMovement) return { posted: false, reason: "nobody has logged anything yet" };

  const tied = top.filter((r) => r.rnk === 1);
  const facts = {
    challenge: challenge.title,
    unit,
    days_left: challenge.days_left,
    leaderboard_top: leaders,
    leaders_tied: tied.length > 1 ? tied.map((r) => first(r.client_name)) : null,
    gap_first_to_second:
      top[0] && top[1] ? Number(top[0].score) - Number(top[1].score) : null,
    group_total: rows.reduce((n, r) => n + r.score, 0),
    people_who_have_logged: rows.filter((r) => r.score > 0).length,
    // {COACH_FIRST_NAME}'s rank used to be a fact here. He is off the board now (2026-08-03,
    // clients.exclude_from_rankings) so there is no rank to give — and a bot
    // that says "{COACH_FIRST_NAME}'s 4th" about someone who isn't ranked is inventing a
    // fact, which is the one thing this prompt must never do.
    coach_is_not_ranked: true,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { posted: false, reason: "no api key" };

  // The OWNER's name, because this bot posts in the OWNER's room and is the one
  // voice in it. Resolved rather than read off a constant so the choice stays
  // visible at the call site — and so it follows when the bot runs per room.
  const ownerName = (await ownerTrainer(db))?.firstName || COACH_FIRST_NAME;

  const { value, tokensIn, tokensOut } = await callClaudeJson<Reply>({
    meter: { clientId: null, feature: "coachbot_post" },
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM(ownerName),
    maxTokens: 300,
    messages: [{ role: "user", content: `TODAY: ${CT_TODAY()}\n\nFACTS (all true, use only these):\n${JSON.stringify(facts, null, 2)}\n\nWrite one Coach Bot message.` }],
    validate,
  });
  await logUsage(null, "coachbot_post", tokensIn, tokensOut, HAIKU_MODEL);
  if (!value) return { posted: false, reason: "model returned nothing usable" };

  // ── The guarantee ────────────────────────────────────────────────────────
  // The prompt says don't name anyone outside the top half. This checks it.
  // A prompt is a request; a filter is a promise, and the promise here is that
  // nobody gets publicly named as last in a fitness group chat.
  const allowed = new Set(top.map((r) => first(r.client_name).toLowerCase()));
  const bottomNames = rows.slice(half).map((r) => first(r.client_name).toLowerCase());
  const body = value.message;
  const named = bottomNames.filter((n) => n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(body));
  if (named.length) {
    return { posted: false, reason: `refused: named someone outside the top half (${named.join(", ")})` };
  }
  // The coach may always be named — the bot is speaking on their behalf in
  // their own group. Written out as the literal "dustin" until now, which on
  // any other coach's instance refuses a perfectly ordinary mention of them and
  // permits a stranger's.
  const coachHandle = ownerName.trim().toLowerCase();
  for (const m of value.mentions) {
    if (m && !allowed.has(m.trim().toLowerCase()) && m.trim().toLowerCase() !== coachHandle) {
      return { posted: false, reason: `refused: mentioned ${m}, who is not on the visible list` };
    }
  }

  if (opts.dry) return { posted: false, reason: "dry run — nothing posted", message: body };

  // The OWNER's account, explicitly. This was
  // `trainer_settings.select("user_id").limit(1)` — unambiguous while that
  // table held one row, arbitrary the moment Stephanie connects her Google
  // Calendar and it holds two. The rooms were split per trainer on 21 Aug and
  // this bot posts in exactly one of them, the owner's, so his is the account
  // that speaks. Running it per room is the follow-up; the board and the
  // roster below are already filtered to this room so it says nothing about
  // people who are not in it.
  const trainerUid = await ownerAuthUid(db);
  if (!trainerUid) return { posted: false, reason: "no trainer account" };

  // group_trainer_id EXPLICITLY, and the OWNER's room by name.
  //
  // The stamp_group_message trigger fills this from my_group_trainer_id(),
  // which reads auth.uid() — and this runs on the SERVICE ROLE, where
  // auth.uid() is null. The trigger therefore stamps NULL, and RLS
  // (read_own_group_messages) requires it to be NOT NULL. So since the rooms
  // were split on 21 Aug this post has been landing in the table and being
  // invisible to every client: no error, no bounce, nothing on screen.
  // Verified against the live database rather than reasoned about.
  const ownerTrainerRow = await ownerTrainer(db);
  if (!ownerTrainerRow?.id) return { posted: false, reason: "no owner trainer row" };
  const { error } = await db.from("messages").insert({
    from_id: trainerUid,
    to_id: trainerUid,
    client_id: null,
    body,
    is_group: true,
    is_broadcast: false,
    sender_kind: "coachbot",
    group_trainer_id: ownerTrainerRow.id,
  });
  if (error) return { posted: false, reason: `insert failed: ${error.message}` };

  return { posted: true, reason: "posted", message: body };
}

async function handle(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  // Scheduler, or a trainer firing it by hand to see what it would say.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
    // A REAL POST GOES INTO THE OWNER'S ROOM, SO IT IS THE OWNER'S TO FIRE.
    //
    // The rooms were split per trainer on 21 Aug. This bot has not caught up —
    // it still posts into exactly one room, the owner's — so a second trainer
    // firing it put a message signed by Dustin into Dustin's room on her tap,
    // and her own clients still saw nothing. Preview stays open to every
    // trainer; posting does not, until the bot runs per room.
    if (!dry) {
      const me = await rosterScopeFor(
        createAdminClient() as never,
        { id: scoped.scope.userId, email: scoped.scope.email },
      );
      if (!me.isOwner) {
        return NextResponse.json(
          { posted: false, reason: "Coach Bot posts as the owner in the shared group. Add ?dry=1 to preview it." },
          { status: 403 },
        );
      }
    }
  }
  const db = createAdminClient() as unknown as Db;
  // Kill switch. Unattended jobs were the ONE place it did not apply, which is
  // the worst possible exemption: they run on a schedule with nobody watching,
  // so an overspend is discovered on the invoice. No per-client cap — there is
  // no single client to charge for a sweep across the whole roster.
  const paused = await enforceMeter(null, "coachbot_post");
  if (paused) return paused;
  try {
    const out = await runCoachBot(db, { force: sp.get("force") === "1", dry });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
