// POST /api/attention-drafts
// Body: { clientId: string, tag?: string }
//
// Three ready-to-send message drafts for one row of the trainer attention feed,
// written in Dustin's voice from that client's ACTUAL numbers.
//
// TRAINER ONLY. This never sends anything — it only returns text. The send is a
// separate, explicit tap in the UI using the existing sendMessage action, so
// there is no path where a model's output reaches a client without Dustin
// choosing it.
//
// Two design rules worth keeping:
//
//  1. The FACTS come from the database, not from the request body. The UI passes
//     a tag to steer tone, but every number in the prompt is re-read server-side.
//     A drafted message that quotes a wrong number is worse than no draft.
//
//  2. There is ALWAYS a fallback. If the API key is missing, the meter is
//     tripped, the model errors, or it returns something malformed, this returns
//     three written drafts for that situation instead. The button must never
//     dead-end — a trainer tapping "draft a message" and getting an error is
//     worse than a slightly generic message.
//
// Generated on demand (on tap), never on page load, so an untouched feed costs
// nothing.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { TRAINER_EMAIL, Db, enforceMeter } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

const TAGS = ["escalate", "onboard", "rest", "quiet", "slipping", "nutrition"] as const;
type Tag = (typeof TAGS)[number];

const SYSTEM = `You draft short messages that Dustin, a personal trainer, sends to one client in his own app. You are writing AS Dustin, first person.

Respond with ONLY valid JSON, no markdown, no fences:
{"drafts": [string, string, string]}

Hard rules:
- Exactly 3 drafts. Each is 1-2 sentences, under 220 characters.
- The three must take DIFFERENT angles. Use these three, in this order:
    1. Warm check-in — no ask, just noticing them as a person.
    2. Practical — a specific, small, concrete next step or a logistics offer.
    3. Direct — honest accountability, still kind. This is the one he sends when he knows they can take it.
- Ground them in the FACTS given. NEVER invent a number, a date, a lift or an event.
- Use their first name at most once, and only where it sounds natural.
- NEVER mention body weight, body fat, size or appearance. Behaviour only.
- NEVER guilt-trip, shame, or imply they let him down. No "disappointed", no "you promised".
- No motivational-poster language. No "crush it", no "no excuses", no "beast mode".
- At most one emoji across all three drafts, and only if it genuinely earns it.
- Write like a text message from a person, not a CRM. Contractions are good.
- If the client is a rehab or injury case, be gentler and never push intensity.

DUSTIN'S VOICE — match this, it is the whole point.
These are real lines Dustin has written to his clients. Study the rhythm, not the words:
  "The more you log, the more I can see, and the faster we get you to your goals. Let's get after it."
  "Let's get you back in the app — open it daily and log a workout so we stay on track."
  "Great start — finish out all 4 sessions this week and log each one."
  "First priority this week: get in and log a session. Consistency is where results come from."
  "Get back to daily check-ins — log each workout as you finish it this week."
  "Strong consistency — keep showing up and logging everything this week."
  "You've logged meals before — get back to it this week so we can fine-tune your nutrition."

What that voice actually is:
- Plain and unfussy. Short words. He says "get in and log a session", not "prioritise your training adherence".
- Says "let's" a lot — he puts himself on their side of the problem, not across from it.
- Names the specific next action, and it is always small: log it, open the app, get one in.
- Explains the WHY in half a sentence, tied to their results, then stops. He does not lecture.
- Warm but not soft. He will say the true thing directly; he just never makes it a character flaw.
- Uses an em dash to pivot from the positive into the ask.
- No corporate softeners: no "just checking in to see if", no "I wanted to reach out", no "circle back".
- Does not sign off, does not open with "Hi [name],". It is a text, mid-conversation.

Write these as if Dustin typed them himself on his phone between sessions.`;

interface Facts {
  firstName: string | null;
  situation: string;
  daysSinceLastSession: number | null;
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  lifetimeSessions: number;
  daysSinceLastFoodLog: number | null;
  everLogsFood: boolean;
  daysSinceSignup: number | null;
  goal: string | null;
  isRehab: boolean;
}

// What each tag actually means, in words, so the model isn't guessing from a slug.
const SITUATION: Record<Tag, string> = {
  escalate: "They have gone quiet for over a week. Automated check-ins have already stopped. This needs a real, personal message — not another nudge.",
  onboard: "They signed up but have never completed a single session. This is an onboarding problem, not a motivation problem — something is probably in the way.",
  rest: "They are training nearly every day. Telling them to take a rest day IS the coaching here.",
  quiet: "They have gone quiet for a few days after training regularly. A light check-in, not an intervention.",
  slipping: "Their training is down against their own recent average. Not gone — just off pace.",
  nutrition: "They are training hard but have stopped logging food, which they used to do. Nutrition, not training, is the gap.",
};

// Written fallbacks — same voice rules as the prompt above, so a client can
// never tell whether a message was AI-drafted or came from this list. Good
// enough to send as-is.
const FALLBACK: Record<Tag, (n: string) => string[]> = {
  escalate: (n) => [
    `${n}, been a minute — how are you doing?`,
    `Let's just reset, ${n}. Tell me what days actually work right now and I'll rebuild the week around them.`,
    `${n}, you've been off the app a while and I'd rather hear from you than guess. What's going on?`,
  ],
  onboard: (n) => [
    `${n}, how are you finding the app so far?`,
    `${n}, let's walk through your first workout together — I'll pull it up and show you how logging works. Five minutes, tops.`,
    `${n}, I don't see a session logged yet — is something not working, or has life just been busy? Either way I can help.`,
  ],
  rest: (n) => [
    `${n}, you've been in there every single day. How's the body feeling?`,
    `Take a rest day this week, ${n} — a real one. Recovery is when the work actually lands.`,
    `${n}, the effort is there but you're training too often to recover from it. Take a day off — that's the assignment.`,
  ],
  quiet: (n) => [
    `${n}, how's the week treating you?`,
    `${n}, want me to move this week's sessions to days that fit better? Easy to shuffle.`,
    `${n}, you've been quiet a few days — let's get one in before the week gets away from us.`,
  ],
  slipping: (n) => [
    `${n}, how's everything going?`,
    `Let's get one more session in this week than last, ${n} — pick the day and I'll have it ready for you.`,
    `${n}, you've dropped off your normal pace a bit. Nothing dramatic — I just want to catch it before it turns into a habit.`,
  ],
  nutrition: (n) => [
    `${n}, the training has been solid lately — nice work.`,
    `${n}, log just your meals for the next three days. Not perfect, just honest — it tells me a lot.`,
    `${n}, you're putting in the work in the gym but the food logging stopped. That's the piece holding your results back right now.`,
  ],
};

function validate(raw: unknown): { drafts: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = (raw as { drafts?: unknown }).drafts;
  if (!Array.isArray(d)) return null;
  const out = d
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x.trim().slice(0, 320));
  if (out.length < 3) return null;
  return { drafts: out.slice(0, 3) };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  let body: { clientId?: string; tag?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const clientId = body.clientId;
  if (!clientId) return NextResponse.json({ error: "Missing clientId" }, { status: 400 });
  const tag: Tag = (TAGS as readonly string[]).includes(body.tag || "") ? (body.tag as Tag) : "quiet";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ drafts: FALLBACK[tag]("there"), ai: false, tag });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const today = CT_TODAY();
  const since30 = shiftDays(today, -29);
  const since7 = shiftDays(today, -6);

  let firstName = "there";
  let facts: Facts | null = null;

  try {
    const [cRes, wRes, mRes] = await Promise.all([
      admin.from("clients").select("name, primary_goal, created_at").eq("id", clientId).maybeSingle(),
      admin.from("workout_logs").select("log_date").eq("client_id", clientId).eq("completed", true),
      admin.from("meal_adherence_logs").select("log_date").eq("client_id", clientId).not("adherence", "is", null),
    ]);

    const c = cRes.data as { name: string | null; primary_goal: string | null; created_at: string | null } | null;
    firstName = (c?.name || "").split(" ")[0] || "there";

    const w = ((wRes.data as { log_date: string }[]) || []).map((r) => r.log_date).filter(Boolean);
    const m = ((mRes.data as { log_date: string }[]) || []).map((r) => r.log_date).filter(Boolean);
    const lastW = w.length ? w.slice().sort().at(-1)! : null;
    const lastM = m.length ? m.slice().sort().at(-1)! : null;
    const goal = c?.primary_goal || null;
    const joined = c?.created_at ? String(c.created_at).slice(0, 10) : null;

    facts = {
      firstName,
      situation: SITUATION[tag],
      daysSinceLastSession: lastW ? daysBetween(lastW, today) : null,
      sessionsLast7Days: new Set(w.filter((d) => d >= since7 && d <= today)).size,
      sessionsLast30Days: new Set(w.filter((d) => d >= since30 && d <= today)).size,
      lifetimeSessions: new Set(w).size,
      daysSinceLastFoodLog: lastM ? daysBetween(lastM, today) : null,
      everLogsFood: m.length > 0,
      daysSinceSignup: joined ? daysBetween(joined, today) : null,
      goal,
      isRehab: /rehab|pain|injur/i.test(goal || ""),
    };
  } catch {
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
  }

  // ── the AI part. Everything below is best-effort; the fallback is the floor. ──
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
  }

  // Metered against the TRAINER's own bucket, not the client's — drafting a
  // message for someone should never eat into that person's own AI allowance.
  // The monthly kill switch still applies through the same helper.
  let trainerClientId: string | null = null;
  try {
    const { data } = await admin.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    trainerClientId = (data as { id: string } | null)?.id || null;
  } catch {
    trainerClientId = null;
  }

  const gate = await enforceMeter(trainerClientId, "chat");
  if (gate) {
    // Over cap or globally paused: still useful, just not AI-written.
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName, metered: true });
  }

  try {
    const { value, tokensIn, tokensOut } = await callClaudeJson<{ drafts: string[] }>({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: HAIKU_MODEL,
      system: SYSTEM,
      maxTokens: 500,
      messages: [
        {
          role: "user",
          content: `FACTS:\n${JSON.stringify(facts)}\n\nWrite the three drafts as strict JSON.`,
        },
      ],
      validate,
    });

    try {
      await logUsage(trainerClientId, "chat", tokensIn, tokensOut, HAIKU_MODEL);
    } catch {
      /* metering must never break the feature */
    }

    const drafts = value?.drafts;
    if (!drafts || drafts.length < 3) {
      return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
    }
    return NextResponse.json({ drafts, ai: true, tag, name: firstName });
  } catch {
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
  }
}
