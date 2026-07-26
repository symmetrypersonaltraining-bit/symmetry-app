// POST /api/coach/focus-suggestions
// Body: { clientId: string }
// Trainer-only. Returns { options: string[] } — 3 AI-written "weekly focus" lines
// in Dustin's coaching voice, tailored to THIS client's real training week
// (adherence, streak, weigh-in cadence, body-comp trend). Dustin taps one to fill
// the focus editor, tweaks if he likes, and saves — he stays the approver; the AI
// just gives him strong, specific starting points instead of writing from scratch.
//
// On-demand only (fired when Dustin opens a client's focus editor), so it costs
// one AI call per client he actually edits — not per digest load.

import { NextRequest, NextResponse } from "next/server";
import { assembleTrainingContext } from "@/lib/ai/coach-context";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

const SUGGEST_SYSTEM_PROMPT = `You write the client-facing "weekly focus" line for Dustin, the trainer at Symmetry Personal Training. The client reads this on their home screen as a note FROM Dustin for the week. Dustin will pick one of your options and may tweak it, so make each one strong enough to send as-is.

You know THIS client from the context (name, goal, workout adherence, streak, weigh-in cadence, body-comp trend). Write in Dustin's voice: direct, warm, motivating, specific — a real coach who watched their week, not a generic app nudge.

Give exactly 3 DIFFERENT options, each a distinct angle drawn from the data:
- One that names their single biggest lever this week (a slipped streak, an overdue weigh-in, finishing all scheduled sessions, protecting a hot streak).
- One that celebrates/encourages a real win or trend in the data.
- One that's a concrete, simple action for the week.
Rules: each option is 1-2 sentences, plain text, speaks TO the client (second person), grounded in the real numbers (never invent data), no hashtags, no emojis unless natural, no NASM/clinical jargon. A little humor is fine if it fits. Do NOT address them as "client" — use their first name if provided.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"options":[string,string,string]}`;

interface Suggestions { options: string[]; }
function validateSuggestions(raw: unknown): Suggestions | null {
  if (!raw || typeof raw !== "object") return null;
  const arr = (raw as Record<string, unknown>).options;
  if (!Array.isArray(arr)) return null;
  const options = arr
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.slice(0, 300))
    .slice(0, 3);
  if (!options.length) return null;
  return { options };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const requested = typeof body?.clientId === "string" ? body.clientId : null;

    const scoped = await resolveAiScope(requested);
    if (!scoped.ok) return scoped.response;
    const { supabase, isTrainer, clientId } = scoped.scope;
    // Author's tool — trainer only.
    if (!isTrainer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!clientId) return NextResponse.json({ error: "Pick a client first." }, { status: 400 });

    const metered = await enforceMeter(clientId, "chat");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const context = await assembleTrainingContext(supabase, clientId);
    const result = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: SUGGEST_SYSTEM_PROMPT,
      maxTokens: 500,
      messages: [{
        role: "user",
        content: `CONTEXT (server-assembled, trusted):\n${context}\n\nWrite 3 weekly-focus options for Dustin to choose from for this client.`,
      }],
      validate: validateSuggestions,
    });

    await logUsage(clientId, "chat", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      return NextResponse.json({ error: "Couldn't generate focus options right now." }, { status: 502 });
    }
    return NextResponse.json(result.value);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("coach/focus-suggestions failed:", msg);
    return NextResponse.json({ error: `Focus suggestions failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
