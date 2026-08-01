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
import { resolveAiScope } from "@/lib/ai/scope";
import { Db } from "@/lib/ai/scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const SYSTEM = `You are "Coach Bot" in the group chat of Symmetry Personal Training — a small gym run by Dustin, about thirty-five clients who mostly know each other.

You are funny. Light-hearted smack talk, the kind that makes people want to get in the gym to shut you up. Think a group chat between friends who train together, not a brand account.

WHO YOU CAN TEASE
- The person in FIRST place. They can take it, and it makes the chase fun.
- Dustin. He is on the board like everyone else and being roasted by his own app is funnier than anything else you can do.
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

export async function runCoachBot(db: Db, opts: { force?: boolean } = {}): Promise<{ posted: boolean; reason: string; message?: string }> {
  if (!opts.force) {
    const { data: flag } = await db.from("app_flags").select("enabled").eq("key", "coachbot_live").maybeSingle();
    if ((flag as { enabled: boolean } | null)?.enabled !== true) return { posted: false, reason: "coachbot_live is off" };
  }

  const { data: ch } = await db.from("v_active_challenge").select("*").maybeSingle();
  const challenge = ch as { id: string; title: string; metric: string; ends_on: string; days_left: number | null } | null;
  if (!challenge) return { posted: false, reason: "no live challenge" };

  const { data: board } = await db.rpc("challenge_leaderboard", { p_challenge_id: challenge.id });
  const rows = ((board as Row[]) || []).map((r) => ({ ...r, score: Number(r.score) }));
  if (!rows.length) return { posted: false, reason: "empty board" };

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
    dustin_position: rows.find((r) => first(r.client_name) === "Dustin")?.rnk ?? null,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { posted: false, reason: "no api key" };

  const { value, tokensIn, tokensOut } = await callClaudeJson<Reply>({
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM,
    maxTokens: 300,
    messages: [{ role: "user", content: `TODAY: ${CT_TODAY()}\n\nFACTS (all true, use only these):\n${JSON.stringify(facts, null, 2)}\n\nWrite one Coach Bot message.` }],
    validate,
  });
  await logUsage(null, "chat", tokensIn, tokensOut, HAIKU_MODEL);
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
  for (const m of value.mentions) {
    if (m && !allowed.has(m.trim().toLowerCase()) && m.trim().toLowerCase() !== "dustin") {
      return { posted: false, reason: `refused: mentioned ${m}, who is not on the visible list` };
    }
  }

  const { data: ts } = await db.from("trainer_settings").select("user_id").limit(1).maybeSingle();
  const trainerUid = (ts as { user_id: string } | null)?.user_id;
  if (!trainerUid) return { posted: false, reason: "no trainer account" };

  const { error } = await db.from("messages").insert({
    from_id: trainerUid,
    to_id: trainerUid,
    client_id: null,
    body,
    is_group: true,
    is_broadcast: false,
    sender_kind: "coachbot",
  });
  if (error) return { posted: false, reason: `insert failed: ${error.message}` };

  return { posted: true, reason: "posted", message: body };
}

async function handle(req: NextRequest) {
  // Scheduler, or Dustin firing it by hand to see what it would say.
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    if (!scoped.scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }
  const db = createAdminClient() as unknown as Db;
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const out = await runCoachBot(db, { force });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
