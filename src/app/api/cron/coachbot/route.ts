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
import { isCronRequest } from "@/lib/cron-auth";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import { Db } from "@/lib/ai/scope";
import { COACH_FIRST_NAME } from "@/lib/trainer";

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
/** A coach and the room they run. */
export interface Room { trainerId: string; authUserId: string; firstName: string }

/**
 * Coach Bot, in ONE room.
 *
 * Every trainer has a group room and a challenge of their own, so every trainer
 * gets this. It used to run once, for the owner, because that was the only room
 * there was; the caller now loops.
 */
export async function runCoachBotForRoom(
  db: Db,
  room: Room,
  opts: { force?: boolean; dry?: boolean } = {},
): Promise<{ posted: boolean; reason: string; message?: string }> {
  if (!opts.force) {
    const { data: flag } = await db.from("app_flags").select("enabled").eq("key", "coachbot_live").maybeSingle();
    if ((flag as { enabled: boolean } | null)?.enabled !== true) return { posted: false, reason: "coachbot_live is off" };
  }

  // AND this coach's own switch, not the owner's. It is their room.
  if (!(await trainerFeatureOn(db, room.trainerId, "coachbot"))) {
    return { posted: false, reason: `${room.firstName} has Coach Bot switched off` };
  }

  // THIS ROOM'S challenge. `v_active_challenge` no longer stops at one row —
  // it is security_invoker, and this is the service role, so without the
  // trainer filter it would hand back whichever room sorted first and tease
  // another gym's challenge in this one.
  const { data: chs } = await db
    .from("v_active_challenge")
    .select("*")
    .eq("trainer_id", room.trainerId)
    .order("starts_on", { ascending: false })
    .limit(1);
  const challenge = ((chs as { id: string; title: string; metric: string; ends_on: string; days_left: number | null }[]) || [])[0] || null;
  if (!challenge) return { posted: false, reason: `no live challenge in ${room.firstName}'s room` };

  // challenge_leaderboard() is already scoped to the challenge's own room
  // (20260823c), so what comes back is this coach's clients and nobody else's.
  // The ranks are left exactly as it computed them.
  const { data: board } = await db.rpc("challenge_leaderboard", { p_challenge_id: challenge.id });
  const rows = ((board as Row[]) || []).map((r) => ({ ...r, score: Number(r.score) }));
  if (!rows.length) return { posted: false, reason: `nobody is on ${room.firstName}'s board` };

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

  // THIS room's coach. The bot speaks as whoever runs the room it is posting in.
  const ownerName = room.firstName || COACH_FIRST_NAME;

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

  // group_trainer_id EXPLICITLY, and THIS room by name.
  //
  // The stamp_group_message trigger fills this from my_group_trainer_id(),
  // which reads auth.uid() — and this runs on the SERVICE ROLE, where
  // auth.uid() is null. The trigger therefore stamps NULL, and RLS
  // (read_own_group_messages) requires it to be NOT NULL, so the post lands in
  // the table and is invisible to every client. Verified against the live
  // database rather than reasoned about.
  const { error } = await db.from("messages").insert({
    from_id: room.authUserId,
    to_id: room.authUserId,
    client_id: null,
    body,
    is_group: true,
    is_broadcast: false,
    sender_kind: "coachbot",
    group_trainer_id: room.trainerId,
  });
  if (error) return { posted: false, reason: `insert failed: ${error.message}` };

  return { posted: true, reason: "posted", message: body };
}

interface TrainerRow { id: string; auth_user_id: string | null; name: string | null; first_name: string | null; active: boolean }

async function handle(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const dry = sp.get("dry") === "1";
  // Set when a signed-in trainer fires it: their auth id, so the sweep below
  // runs their room only.
  let onlyTrainer: string | null = null;
  // Scheduler, or a trainer firing it by hand to see what it would say.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
    // A trainer firing this by hand runs it in THEIR OWN room. The owner-only
    // gate that used to be here was a symptom of the bot only knowing one room;
    // it now knows every room, so there is nothing to refuse.
    onlyTrainer = scoped.scope.userId;
  }
  const db = createAdminClient() as unknown as Db;
  // Kill switch. Unattended jobs were the ONE place it did not apply, which is
  // the worst possible exemption: they run on a schedule with nobody watching,
  // so an overspend is discovered on the invoice. No per-client cap — there is
  // no single client to charge for a sweep across the whole roster.
  const paused = await enforceMeter(null, "coachbot_post");
  if (paused) return paused;
  try {
    // EVERY ROOM. The scheduler sweeps them all; a trainer tapping it by hand
    // gets their own and nobody else's.
    const { data: trainerRows } = await db
      .from("trainers")
      .select("id, auth_user_id, name, first_name, active")
      .eq("active", true)
      .not("auth_user_id", "is", null);
    let rooms = ((trainerRows as TrainerRow[]) || []).map((t) => ({
      trainerId: t.id,
      authUserId: t.auth_user_id as string,
      firstName: (t.first_name || String(t.name || "").split(/\s+/)[0] || COACH_FIRST_NAME),
    }));
    if (onlyTrainer) rooms = rooms.filter((r) => r.authUserId === onlyTrainer);
    if (!rooms.length) return NextResponse.json({ posted: false, reason: "no room to post in" });

    const force = sp.get("force") === "1";
    const results: { room: string; posted: boolean; reason: string; message?: string }[] = [];
    for (const room of rooms) {
      // Sequential, not Promise.all: each pass is a model call, and the meter
      // above is a spend ceiling that a burst would sail straight past.
      const out = await runCoachBotForRoom(db, room, { force, dry });
      results.push({ room: room.firstName, ...out });
    }
    // Kept shaped like the single-room reply it used to be so existing callers
    // and the /dry preview still read the same, with the per-room detail added.
    const posted = results.filter((r) => r.posted);
    return NextResponse.json({
      posted: posted.length > 0,
      reason: posted.length
        ? `posted in ${posted.map((r) => r.room).join(", ")}`
        : results.map((r) => `${r.room}: ${r.reason}`).join(" | ") || "nothing to say",
      message: results.find((r) => r.message)?.message,
      rooms: results,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
