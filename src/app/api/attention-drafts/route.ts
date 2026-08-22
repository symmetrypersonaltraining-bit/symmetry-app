// ⚠ UNREACHABLE AS OF 2026-08-21. Nothing in the app calls this.
//
// Its only caller was <AttentionFeed/>, the "Who needs you today" panel, which
// TrainerHome records as "removed entirely". The component was left in src/
// unmounted for weeks, which reads as a bug rather than a retirement, so it has
// now been deleted — and that leaves this route with no way in.
//
// Kept rather than deleted because the feature was wanted and may come back:
// Dustin built it, and the one-tap drafts underneath it are genuinely good. If
// it does come back, note that the draft prompt was made per-trainer on
// 2026-08-21 and no longer writes as the owner regardless of who is signed in.
//
// If it is still unreachable in a month, delete it.

// POST /api/attention-drafts
// Body: { clientId: string, tag?: string }
//
// Five ready-to-send message drafts for one row of the trainer attention feed,
// written in Dustin's voice from that client's ACTUAL numbers.
//
// The five angles are fixed: warm check-in, practical, straight up, and two
// funny ones. The humour is bounded by explicit rules in the prompt — jokes aim
// at the situation, the gym or Dustin himself, never at the person. On the
// escalate and onboard segments both funny drafts are held gentle, because
// nobody knows yet WHY someone went quiet and a joke that assumes laziness
// would be brutal if the answer is illness or a death in the family.
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
//     five written drafts for that situation instead. The button must never
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
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { coachFirstNameForClient } from "@/lib/trainerResolve";

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

// A function of the coach's name. As a module constant it was built at import
// time from one build-time environment variable, so every client of every
// trainer got a line written as the owner.
const SYSTEM = (coachFirstName: string = COACH_FIRST_NAME) => `You draft short messages that ${coachFirstName}, a personal trainer, sends to one client in their own app. You are writing AS ${coachFirstName}, first person.

Respond with ONLY valid JSON, no markdown, no fences:
{"drafts": [string, string, string, string, string]}

Hard rules:
- Exactly 5 drafts. Each is 1-2 sentences, under 220 characters.
- The five take DIFFERENT angles, in this exact order:
    1. Warm check-in — no ask at all, just noticing them as a person.
    2. Practical — one specific, small, concrete next step or a logistics offer.
    3. Straight up — honest accountability, still kind. The one he sends when he knows they can take it.
    4. Funny — light, warm humour that gets the same point across sideways.
    5. Funnier — a bolder joke. Still kind, still lands the point.
- Ground them in the FACTS given. NEVER invent a number, a date, a lift or an event.
- Use their first name at most once, and only where it sounds natural.
- NEVER mention body weight, body fat, size or appearance. Behaviour only.
- NEVER guilt-trip, shame, or imply they let him down. No "disappointed", no "you promised".
- No motivational-poster language. No "crush it", no "no excuses", no "beast mode".
- At most two emoji across all five drafts, and only where they genuinely earn it.
- If the client is a rehab or injury case, be gentler everywhere and never push intensity.

HUMOUR RULES — the funny two have to be safe to send to a paying client:
- Joke about the SITUATION, the gym, the calendar, ${coachFirstName} themselves. Never about the person's
  body, discipline, character or worth.
- Playful exaggeration is good. Sarcasm aimed at them is not.
- Mock-formal, mock-dramatic and deadpan all work. "Missing person report", "the dumbbells
  asked about you", "I checked the parking lot" — that register.
- It must still be obvious he is glad to hear from them. Warmth first, joke second.
- If the situation is ESCALATE (gone quiet 10+ days) or ONBOARD (never started), keep BOTH
  funny ones gentle and low-stakes. He does not know why they went quiet — it could be
  illness, money, a death in the family. A joke that assumes laziness would be brutal if so.
  Aim the humour at himself or at the silence, never at their reason.
- For a rehab or injury client, humour stays soft and never references pushing harder.

DUSTIN'S VOICE — match this, it is the whole point.
These are real lines a coach here has written to their clients. Study the rhythm, not the words:
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

CASUAL AND DIRECT — lean further this way than you think:
- Text-message casual. Fragments are fine. "Where you been?" beats "I noticed you have been absent."
- Contractions always. "you've", "let's", "I'm", "gonna" is fine occasionally.
- Say the thing in the first six words. No throat-clearing, no wind-up.
- Casual does NOT mean vague. He is still telling them exactly what to do.
- Fewer words is always better. If a draft can lose three words, lose them.

PERSONAL — use what you actually know about them:
- Reach for the specific detail over the generic one. Their last workout by name, the weight
  they hit, how long they have been training with him, the exact number of days.
- One concrete detail beats three vague compliments. "Your last one was Push Day, 6 sets" is
  worth more than "you've been doing great".
- Only use details present in the FACTS. If a detail is null or missing, do not reach for it
  and do not invent a substitute.

Write these as if ${coachFirstName} typed them on their phone between sessions.`;

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
  // Personal detail. One real specific beats three vague compliments, so these
  // give the model something true to actually reach for. Null when unknown —
  // the prompt forbids inventing a substitute.
  lastWorkoutName: string | null;
  lastWorkoutSets: number | null;
  heaviestRecentLift: { name: string; weight: number } | null;
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

// Written fallbacks — same voice and same five angles as the prompt above, so
// a client can never tell whether a message was AI-drafted or came from this
// list. Good enough to send as-is. Slots 4 and 5 are the funny ones; for the
// escalate and onboard situations they stay deliberately gentle, because
// nobody knows yet why that person went quiet.
const FALLBACK: Record<Tag, (n: string) => string[]> = {
  escalate: (n) => [
    `${n}, been a minute — how are you doing?`,
    `Let's just reset, ${n}. Tell me what days actually work right now and I'll rebuild the week around them.`,
    `${n}, you've been off the app a while and I'd rather hear from you than guess. What's going on?`,
    `${n}, checking you're alive over there. No pressure — just say hey.`,
    `Filing a missing person report on you, ${n}. Reply and I'll call it off.`,
  ],
  onboard: (n) => [
    `${n}, how are you finding the app so far?`,
    `${n}, let's walk through your first workout together — I'll pull it up and show you how logging works. Five minutes, tops.`,
    `${n}, I don't see a session logged yet — is something not working, or has life just been busy? Either way I can help.`,
    `${n}, your first workout's just sitting there getting lonely. Want me to walk you through it?`,
    `${n}, I built you a whole program and it's currently undefeated. Let's give it a fight.`,
  ],
  rest: (n) => [
    `${n}, you've been in there every single day. How's the body feeling?`,
    `Take a rest day this week, ${n} — a real one. Recovery is when the work actually lands.`,
    `${n}, the effort is there but you're training too often to recover from it. Take a day off — that's the assignment.`,
    `${n}, this is me officially prescribing you a couch. Doctor's orders.`,
    `${n}, if you show up tomorrow I'm hiding the dumbbells. Take the day.`,
  ],
  quiet: (n) => [
    `${n}, how's the week treating you?`,
    `${n}, want me to move this week's sessions to days that fit better? Easy to shuffle.`,
    `${n}, you've been quiet a few days — let's get one in before the week gets away from us.`,
    `${n}, the gym asked about you. I told it you're busy.`,
    `${n}, few days off the grid. Everything good, or did the couch win?`,
  ],
  slipping: (n) => [
    `${n}, how's everything going?`,
    `Let's get one more session in this week than last, ${n} — pick the day and I'll have it ready for you.`,
    `${n}, you've dropped off your normal pace a bit. Nothing dramatic — I just want to catch it before it turns into a habit.`,
    `${n}, your usual pace called. It misses you.`,
    `${n}, you've slowed down a step. Let's fix that before it becomes a personality trait.`,
  ],
  nutrition: (n) => [
    `${n}, the training has been solid lately — nice work.`,
    `${n}, log just your meals for the next three days. Not perfect, just honest — it tells me a lot.`,
    `${n}, you're putting in the work in the gym but the food logging stopped. That's the piece holding your results back right now.`,
    `${n}, training's on point, food log's a ghost town. Let's get it populated.`,
    `${n}, I can see every set you've done and zero of your meals. I have questions.`,
  ],
};

function validate(raw: unknown): { drafts: string[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = (raw as { drafts?: unknown }).drafts;
  if (!Array.isArray(d)) return null;
  const out = d
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x.trim().slice(0, 320));
  if (out.length < 5) return null;
  return { drafts: out.slice(0, 5) };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await viewerIsTrainer(supabase, user))) {
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
    const [cRes, wRes, mRes, lastRes] = await Promise.all([
      admin.from("clients").select("name, primary_goal, created_at").eq("id", clientId).maybeSingle(),
      admin.from("workout_logs").select("log_date").eq("client_id", clientId).eq("completed", true),
      admin.from("meal_adherence_logs").select("log_date").eq("client_id", clientId).not("adherence", "is", null),
      // The most recent completed session, by name — the single most personal
      // detail available, and the one that makes a message sound like it came
      // from someone who was actually paying attention.
      admin
        .from("workout_logs")
        .select("id, log_date, days(label)")
        .eq("client_id", clientId)
        .eq("completed", true)
        .order("log_date", { ascending: false })
        .limit(1),
    ]);

    const c = cRes.data as { name: string | null; primary_goal: string | null; created_at: string | null } | null;
    firstName = (c?.name || "").split(" ")[0] || "there";

    const w = ((wRes.data as { log_date: string }[]) || []).map((r) => r.log_date).filter(Boolean);
    const m = ((mRes.data as { log_date: string }[]) || []).map((r) => r.log_date).filter(Boolean);
    const lastW = w.length ? w.slice().sort().at(-1)! : null;
    const lastM = m.length ? m.slice().sort().at(-1)! : null;
    const goal = c?.primary_goal || null;
    const joined = c?.created_at ? String(c.created_at).slice(0, 10) : null;

    // Name + shape of their last session. Best-effort: if the set rows can't be
    // read we still send the workout name, and if that's missing too the prompt
    // simply has one fewer detail to work with.
    const lastRow = ((lastRes.data as { id: string; days?: { label?: string } | null }[]) || [])[0] || null;
    let lastWorkoutName: string | null = lastRow?.days?.label || null;
    let lastWorkoutSets: number | null = null;
    let heaviestRecentLift: { name: string; weight: number } | null = null;
    if (lastRow?.id) {
      try {
        const { data: sl } = await admin
          .from("set_logs")
          .select("weight_lbs, exercises(name)")
          .eq("workout_log_id", lastRow.id)
          .eq("completed", true);
        const rows = (sl as Record<string, unknown>[]) || [];
        lastWorkoutSets = rows.length || null;
        for (const r of rows) {
          const wt = Number(r.weight_lbs) || 0;
          const nm = ((r.exercises as { name?: string } | null)?.name) || "";
          if (nm && wt > 0 && (!heaviestRecentLift || wt > heaviestRecentLift.weight)) {
            heaviestRecentLift = { name: nm, weight: wt };
          }
        }
      } catch {
        lastWorkoutName = lastWorkoutName || null;
      }
    }

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
      lastWorkoutName,
      lastWorkoutSets,
      heaviestRecentLift,
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

  const gate = await enforceMeter(trainerClientId, "outbox_draft");
  if (gate) {
    // Over cap or globally paused: still useful, just not AI-written.
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName, metered: true });
  }

  try {
    const { value, tokensIn, tokensOut } = await callClaudeJson<{ drafts: string[] }>({
      meter: { clientId: trainerClientId, feature: "outbox_draft" },
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: HAIKU_MODEL,
      // These drafts are SENT TO A CLIENT AS THEIR TRAINER, first person. Written
      // as the owner they put his voice and his name in Stephanie's outbox.
      system: SYSTEM(await coachFirstNameForClient(admin, clientId, COACH_FIRST_NAME)),
      maxTokens: 900,
      messages: [
        {
          role: "user",
          content: `FACTS:\n${JSON.stringify(facts)}\n\nWrite the five drafts as strict JSON.`,
        },
      ],
      validate,
    });

    try {
      await logUsage(trainerClientId, "outbox_draft", tokensIn, tokensOut, HAIKU_MODEL);
    } catch {
      /* metering must never break the feature */
    }

    const drafts = value?.drafts;
    if (!drafts || drafts.length < 5) {
      return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
    }
    return NextResponse.json({ drafts, ai: true, tag, name: firstName });
  } catch {
    return NextResponse.json({ drafts: FALLBACK[tag](firstName), ai: false, tag, name: firstName });
  }
}
