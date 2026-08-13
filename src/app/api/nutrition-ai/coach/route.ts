// POST /api/nutrition-ai/coach
// Body: { question?: string, context?: "auto", clientId?: string }
// The server assembles the client's full coaching context (profile + goal,
// weight/body-fat trajectory, current macro targets, live meal plan, and the
// last 14 days of daily totals from meal_adherence_logs) and answers either the
// client's question or — with no question — produces a proactive insight for the
// coach card.
// Returns { message, suggestions?: [{ label, delta: { p, c, f, kcal } }] }.
// Auth-checked, client-scoped, metered (feature 'chat', default 15/day), Haiku.
//
// Context + system prompt come from the shared @/lib/ai/coach-context module —
// the same assembly /api/nutrition-ai/act uses, so both surfaces are identical.

import { NextRequest, NextResponse } from "next/server";
import { COACH_SYSTEM_PROMPT, assembleCoachContext } from "@/lib/ai/coach-context";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateCoachReply } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (question.length > 1500) {
      return NextResponse.json({ error: "That question is too long — keep it under 1500 characters." }, { status: 400 });
    }

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;
    if (!clientId) {
      return NextResponse.json({ error: "Pick a client first — the coach needs a client's data." }, { status: 400 });
    }

    const metered = await enforceMeter(clientId, "coach_card");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const context = await assembleCoachContext(supabase, clientId);
    const userText = question
      ? `CONTEXT (server-assembled, trusted):\n${context}\n\nCLIENT QUESTION:\n${question}`
      : `CONTEXT (server-assembled, trusted):\n${context}\n\nNo question was asked. Produce ONE proactive insight for the client's coach card: the single most useful observation from the data right now (trend, gap vs targets, consistency win worth reinforcing), spoken to them by name, with suggestions only if clearly warranted.`;

    const result = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: COACH_SYSTEM_PROMPT,
      maxTokens: 900,
      messages: [{ role: "user", content: userText }],
      validate: validateCoachReply,
    });

    await logUsage(clientId, "coach_card", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      // Salvage: a plain-text reply is still useful for a chat surface.
      const fallback = result.rawText.replace(/```(?:json)?|```/g, "").trim();
      if (fallback) return NextResponse.json({ message: fallback.slice(0, 1200) });
      return NextResponse.json({ error: "The coach couldn't answer right now — try again in a moment." }, { status: 502 });
    }
    return NextResponse.json(result.value);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/coach failed:", msg);
    return NextResponse.json({ error: `Coach failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
