// GET/POST /api/cron/weekly-ai — the Sunday sweep.
//
// Dustin: "Ai needs to auto update weeky focus, coaches read weekly and food
// logger weekly, food logger one base numbers on how they did last week and
// what to work on this week. i dont want to have to check on these."
//
// So this runs itself. Every Sunday at 6 AM Central (vercel.json), for every
// active client, it derives last week vs this week from real logs
// (fetchWeeklyComparison — the same summariser the client's own screen uses),
// hands those pre-computed numbers to one Haiku call, and stores three pieces
// of copy:
//   clients.weekly_focus     → the Focus line on the client's week card
//   clients.ai_focus         → seeds the home "Coach's Read" for the new week
//   clients.ai_food_focus    → the weekly read on the food-logger coach card
//
// Two non-negotiables:
//  1. It NEVER clobbers a focus Dustin wrote himself for the current week
//     (weekly_focus_source = 'trainer' + weekly_focus_week = this Sunday).
//  2. The model does no arithmetic. Every number and direction is computed in
//     weekly-numbers.ts and stated to it as fact.
//
// One failing client never stops the sweep — each is caught individually and
// reported in the response so a bad row is visible rather than silent.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { fetchWeeklyComparison } from "@/lib/ai/weekly-context";
import { resolveAiScope } from "@/lib/ai/scope";
import { WEEKLY_WRITER_RULES, weekStartOf } from "@/lib/ai/weekly-numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const WEEKLY_SYSTEM_PROMPT = `You are the coach inside the Symmetry Personal Training app (trainer: Dustin), writing this client's week. You are handed their real numbers for last week and this week so far, already computed.

${WEEKLY_WRITER_RULES}

You write THREE things:
1. "focus" — the one thing this client should aim at this week. It appears as "Focus: ..." on their week card. It must come out of what actually happened last week: if adherence slipped, the focus addresses that; if they logged only two days, the focus is logging; if they crushed it, the focus protects the win and adds one notch. Concrete and doable in a week, not a slogan.
2. "coachRead" — the training-side read for the home screen: consistency, sessions completed, weigh-in cadence, body-composition movement. Warm, specific, honest about slips without scolding, light humor when it fits.
3. "foodFocus" — the nutrition read for their food logger. Start from how they actually ate last week (the given averages, adherence and the signed vs-target deltas), then say what to work on this week. Name real numbers from the context. Never set a new macro target — that is Dustin's call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"focus":string,"coachRead":string,"foodFocus":string}

Rules:
- "focus": ONE sentence, under 120 characters, no leading "Focus:".
- "coachRead": 2-4 sentences, plain text, no question at the end.
- "foodFocus": 2-4 sentences, plain text, grounded in the stated numbers.`;

interface WeeklyReply {
  focus: string;
  coachRead: string;
  foodFocus: string;
}

function validateWeekly(raw: unknown): WeeklyReply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const focus = s("focus").replace(/^focus:\s*/i, "");
  const coachRead = s("coachRead");
  const foodFocus = s("foodFocus");
  if (!focus || !coachRead || !foodFocus) return null;
  return {
    focus: focus.slice(0, 200),
    coachRead: coachRead.slice(0, 900),
    foodFocus: foodFocus.slice(0, 900),
  };
}

interface ClientRow {
  id: string;
  name: string | null;
  primary_goal: string | null;
  weekly_focus: string | null;
  weekly_focus_week: string | null;
  weekly_focus_source: string | null;
}

interface RunResult {
  clientId: string;
  name: string;
  status: "written" | "focus-kept" | "skipped" | "failed";
  detail?: string;
}

async function runSweep(opts: { onlyClientId?: string | null; today?: string }): Promise<{
  week: string;
  today: string;
  results: RunResult[];
}> {
  const today = opts.today || CT_TODAY();
  const week = weekStartOf(today);
  const db = createAdminClient();

  let q = db
    .from("clients")
    .select("id, name, primary_goal, weekly_focus, weekly_focus_week, weekly_focus_source")
    .is("archived_at", null);
  if (opts.onlyClientId) q = q.eq("id", opts.onlyClientId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const clients = (data as ClientRow[]) || [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const results: RunResult[] = [];

  for (const c of clients) {
    const name = c.name || "(unnamed)";
    try {
      if (!apiKey) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "ANTHROPIC_API_KEY not set" });
        continue;
      }

      const cmp = await fetchWeeklyComparison(db, c.id, today);

      // Nothing to write about at all. Leaving last week's copy up would be
      // worse than leaving it blank — it would read as a comment on a week
      // that never happened.
      if (!cmp.last.loggedDays && !cmp.current.loggedDays && !cmp.last.workoutsScheduled && !cmp.current.workoutsScheduled) {
        results.push({ clientId: c.id, name, status: "skipped", detail: "no activity in either week" });
        continue;
      }

      const result = await callClaudeJson({
        apiKey,
        model: HAIKU_MODEL,
        system: WEEKLY_SYSTEM_PROMPT,
        maxTokens: 800,
        messages: [
          {
            role: "user",
            content:
              `CLIENT: ${name}${c.primary_goal ? ` — goal: ${c.primary_goal}` : ""}\n` +
              `TODAY (Central): ${today}\n\n` +
              `${cmp.block}\n\n` +
              `Write this client's focus, coach's read and food focus for the week beginning ${week}, per your instructions.`,
          },
        ],
        validate: validateWeekly,
      });

      await logUsage(c.id, "chat", result.tokensIn, result.tokensOut, HAIKU_MODEL);

      if (!result.value) {
        results.push({ clientId: c.id, name, status: "failed", detail: "model returned no usable JSON" });
        continue;
      }

      // Dustin's own words win. If he set the focus by hand for THIS week, the
      // sweep leaves it alone and still refreshes everything else.
      const trainerOwnsFocus =
        c.weekly_focus_source === "trainer" && c.weekly_focus_week === week && !!c.weekly_focus;

      const update: Record<string, string | null> = {
        ai_focus: result.value.coachRead,
        ai_focus_date: today,
        ai_food_focus: result.value.foodFocus,
        ai_food_focus_week: week,
      };
      if (!trainerOwnsFocus) {
        update.weekly_focus = result.value.focus;
        update.weekly_focus_week = week;
        update.weekly_focus_source = "ai";
      }

      const { error: upErr } = await db.from("clients").update(update).eq("id", c.id);
      if (upErr) throw new Error(upErr.message);

      results.push({ clientId: c.id, name, status: trainerOwnsFocus ? "focus-kept" : "written" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error(`weekly-ai failed for ${name} (${c.id}):`, msg);
      results.push({ clientId: c.id, name, status: "failed", detail: msg.slice(0, 200) });
    }
  }

  return { week, today, results };
}

function authorised(req: NextRequest): boolean {
  // A genuine Vercel cron invocation. Vercel strips client-supplied x-vercel-*
  // headers at the edge, so this header cannot be forged from outside — it is
  // the documented way to recognise the platform's own scheduler.
  //
  // This branch exists because the secret-only version was a foot-gun: when
  // CRON_SECRET is unset, `if (!secret) return false` 401s EVERY caller,
  // including Vercel's scheduler. The weekly sweep would have sat there every
  // Sunday returning 401 to itself, silently, with nothing in the app to show
  // for it. Dustin's whole ask was "i dont want to have to check on these" — a
  // sweep that depends on someone remembering to set an env var fails that.
  if (req.headers.get("x-vercel-cron")) return true;

  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  // Vercel cron also sends the bearer form when the secret IS set; the query
  // form is for a manual curl.
  return new URL(req.url).searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const out = await runSweep({ onlyClientId: new URL(req.url).searchParams.get("clientId") });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("weekly-ai sweep failed:", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}

/**
 * Manual run. Cron auth, OR a signed-in trainer — so Dustin can force a sweep
 * from the app without holding a secret or waiting for Sunday.
 */
export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    const scope = await resolveAiScope(null);
    if (!scope.ok || !scope.scope.isTrainer) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const body = await req.json().catch(() => ({}));
  try {
    const out = await runSweep({
      onlyClientId: typeof body?.clientId === "string" ? body.clientId : null,
      today: typeof body?.today === "string" ? body.today : undefined,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("weekly-ai sweep failed:", msg);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
