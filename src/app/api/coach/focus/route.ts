// POST /api/coach/focus
// Body: { clientId?: string, force?: boolean }
// The home-screen "Coach's Read" — an AI coaching focus about the NON-nutrition
// side of the client's week: workout adherence, streak, weigh-in cadence and
// body-composition trend. It speaks personally (name, goal), congratulates real
// wins, encourages, lands light humor, and ends with ONE simple question whose
// answer the client can route back to Dustin's inbox.
//
// Cost control: the coaching MESSAGE regenerates at most once per client per day
// and is cached on the clients row (ai_focus / ai_focus_date). Repeat loads that
// day return the cached copy without an AI call. Pass force:true to regenerate.
//
// The QUESTION is posed only ONCE PER WEEK (not daily): a fresh question is
// surfaced only when 7+ days have passed since the last one was posed. Answering
// it clears it (POST { markAnswered:true }) so it won't reappear until the next
// weekly cycle. The daily message is unaffected.
//
// Returns { message, question|null, date, cached }. question is null on days
// when no weekly question is open.

import { NextRequest, NextResponse } from "next/server";
import { CT_TODAY, assembleTrainingContext } from "@/lib/ai/coach-context";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { COACH_FIRST_NAME } from "@/lib/trainer";

const FOCUS_SYSTEM_PROMPT = `You are the personal coach inside the Symmetry Personal Training app (trainer: ${COACH_FIRST_NAME}), writing the client's home-screen "Coach's Read" for today. This is the TRAINING side — workouts, consistency, weigh-ins, body composition — NOT a nutrition breakdown (a separate nutrition coach handles food). You know THIS client by name and goal, and you've watched their week. Sound like a sharp human coach in their corner, not a status report.

Do this every time there's data for it:
- Speak to them by first name. Ground every claim in the context numbers; never invent data. Use the provided trajectory/direction lines exactly — do NOT recompute up/down.
- Find the ONE thing that matters most right now (a streak worth protecting, a slipped week worth naming gently, a weigh-in that's overdue, a body-comp trend worth celebrating) and be specific about it.
- CONGRATULATE real wins by name ("four sessions in a row — that's the most consistent you've been"). ENCOURAGE when it's been a grind. Be honest about slips without scolding.
- Land light humor here and there — a quick warm one-liner, never forced, never at their expense, never in a genuinely tough moment.
- End with ONE simple question you'd want answered to coach them better — something the data can't tell you (how a joint feels, energy, motivation, why a stretch went quiet, what's getting in the way). It must be answerable in a sentence. This answer will be sent to ${COACH_FIRST_NAME}, so ask what ${COACH_FIRST_NAME} would actually want to know.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"question":string}

Rules:
- "message": 2-4 sentences, plain text, warm and specific — never generic, never a wall of text. Do not include the question inside message.
- "question": ONE sentence, ends with a question mark. Simple enough to answer in a few words.`;

interface FocusReply { message: string; question: string; }
function validateFocus(raw: unknown): FocusReply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message.trim() : "";
  const question = typeof o.question === "string" ? o.question.trim() : "";
  if (!message || !question) return null;
  return { message: message.slice(0, 900), question: question.slice(0, 300) };
}

const DAY_MS = 86400000;
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / DAY_MS);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const markAnswered = body?.markAnswered === true;

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;
    if (!clientId) {
      return NextResponse.json({ error: "Pick a client first." }, { status: 400 });
    }

    const today = CT_TODAY();

    // The client answered this week's question — clear it so it won't reappear
    // until the next weekly cycle (keep the posed-date so the 7-day gate holds).
    if (markAnswered) {
      await supabase.from("clients").update({ ai_focus_question: null }).eq("id", clientId);
      return NextResponse.json({ ok: true });
    }

    const { data: cached } = await supabase
      .from("clients")
      .select("ai_focus, ai_focus_date, ai_focus_question, ai_focus_question_date")
      .eq("id", clientId)
      .maybeSingle();
    const c = (cached as {
      ai_focus: string | null; ai_focus_date: string | null;
      ai_focus_question: string | null; ai_focus_question_date: string | null;
    } | null) || { ai_focus: null, ai_focus_date: null, ai_focus_question: null, ai_focus_question_date: null };

    // A question is "open" only within 7 days of being posed and while unanswered.
    const qAgeDays = c.ai_focus_question_date ? daysBetween(today, c.ai_focus_question_date) : Infinity;
    const openQuestion = c.ai_focus_question && qAgeDays < 7 ? c.ai_focus_question : null;

    // Today's message already cached → no AI call. Surface the open weekly question (if any).
    if (!force && c.ai_focus_date === today && c.ai_focus) {
      return NextResponse.json({ message: c.ai_focus, question: openQuestion, date: today, cached: true });
    }

    const metered = await enforceMeter(clientId, "chat");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const context = await assembleTrainingContext(supabase, clientId);
    const result = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: FOCUS_SYSTEM_PROMPT,
      maxTokens: 500,
      messages: [{
        role: "user",
        content: `CONTEXT (server-assembled, trusted):\n${context}\n\nWrite today's Coach's Read for this client per your instructions.`,
      }],
      validate: validateFocus,
    });

    await logUsage(clientId, "chat", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      return NextResponse.json({ error: "Coach's Read couldn't generate right now — try again shortly." }, { status: 502 });
    }

    // Message refreshes daily. Question is posed only once per week: keep the open
    // one if it's still current, otherwise post a fresh one when 7+ days have
    // elapsed (or none was ever posed). The model always returns a candidate; we
    // only adopt it when it's time for a new weekly question.
    const update: Record<string, string | null> = { ai_focus: result.value.message, ai_focus_date: today };
    let surfacedQuestion = openQuestion;
    if (!openQuestion && qAgeDays >= 7) {
      update.ai_focus_question = result.value.question;
      update.ai_focus_question_date = today;
      surfacedQuestion = result.value.question;
    }
    await supabase.from("clients").update(update).eq("id", clientId);

    return NextResponse.json({ message: result.value.message, question: surfacedQuestion, date: today, cached: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("coach/focus failed:", msg);
    return NextResponse.json({ error: `Coach's Read failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
