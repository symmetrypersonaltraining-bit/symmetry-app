// POST /api/nutrition-ai/act
// Body: { message: string, clientId?: string, dayContext?: [{ position, label,
//         name, logged, kcal, p, c, f }] }  (dayContext = today's meals as the
//         v3 logger renders them)
// ONE endpoint for the "do-anything" coach chat:
//   1. Haiku extracts an action intent from the free-text message against the
//      day context (strict tool-style JSON, validated with one retry):
//      {intent, params, confirmation, reply}. Meal references resolve by
//      position OR fuzzy name/label match server-side; anything missing or
//      ambiguous is downgraded to a clarifying question — never a guess.
//   2. intent 'none' + no clarification needed → falls through to the exact
//      existing coach Q&A behavior (14-day context, same system prompt,
//      suggestions chips) so questions and actions share one endpoint.
// NOTHING mutates here — the client renders a confirmation card and executes
// via its own existing write helpers only after an explicit Confirm tap.
// Auth-checked, client-scoped, metered (feature 'chat'), Haiku.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import {
  ActDayMeal, ActReply, finalizeAct, validateActReply, validateCoachReply,
} from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { COACH_SYSTEM_PROMPT, assembleCoachContext } from "@/lib/ai/coach-context";

const ACT_SYSTEM_PROMPT = `You are the action extractor for the nutrition coach chat inside the Symmetry Personal Training app. The client sends a free-text message plus DAY CONTEXT: today's meals as JSON [{position, label, name, logged, kcal, p, c, f}] ("label" is the on-screen name like "M2"; "position" is the stable id you must use in params).

Decide if the message is a REQUEST TO CHANGE TODAY'S LOG or just a question/chat. Respond with ONLY valid JSON — no markdown, no fences — exactly:
{"intent":"swap_meal"|"move_meal"|"copy_meal"|"delete_meal"|"add_snack"|"log_meal"|"unlog_meal"|"none","params":{...},"confirmation":string|null,"reply":string}

Intents and their params:
- swap_meal — replace one meal's contents with different food. params: {"position":number|null,"meal_name":string|null,"new_name":string,"items":[{"name":string,"amount":number|null,"unit":string|null,"p":number,"c":number,"f":number,"kcal":number}]}. Estimate realistic macros per item (grams protein/carbs/fat, kcal).
- move_meal — reorder a meal to another meal's spot. params: {"from_position":number|null,"from_name":string|null,"to_position":number|null,"to_name":string|null}.
- copy_meal — duplicate a meal; the copy lands right after the "to" meal, or at the end of the day when "to" is omitted. params: same keys as move_meal (to_* may be null).
- delete_meal — remove a meal from today only. params: {"position":number|null,"meal_name":string|null}.
- add_snack — the client ate something extra / off-plan. params: {"name":string,"items":[same item shape as swap_meal]}.
- log_meal — mark a meal eaten. params: {"position":number|null,"meal_name":string|null,"adherence":"Full"|"3/4"|"1/2"|"1/4"|"Skipped"} (default "Full"; "I ate most of it" → "3/4", "half" → "1/2", etc.).
- unlog_meal — undo a logged meal. params: {"position":number|null,"meal_name":string|null}.
- none — a question, general chat, or an action you cannot fill in yet. params: {"clarify":boolean}.

Rules:
- Use "position" values EXACTLY as given in DAY CONTEXT. If the client names a meal instead, put their words in the *_name field and leave position null.
- If the message asks for an action but the target meal is ambiguous (several plausible matches) or required details are missing (e.g. "swap a meal" with no food), respond intent "none" with params {"clarify":true} and ONE short clarifying question in "reply". Never guess.
- If the message is a question or general chat, respond intent "none" with params {"clarify":false} and a brief placeholder in "reply" (a fuller coach answer is generated separately).
- "confirmation" (action intents only): ONE human sentence describing exactly what will happen, including estimated kcal and P/C/F where relevant, e.g. "Swap M4 → Salmon + rice (est 520 kcal · 42P/45C/16F)?". For intent "none" use null.
- "reply": a short, friendly coach response (1-2 sentences) to show above the confirmation card.
- Only ever change TODAY's log. Requests about other days, the plan itself, or targets → intent "none" (answer as chat).`;

const MAX_DAY_MEALS = 30;

function sanitizeDayContext(raw: unknown): ActDayMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: ActDayMeal[] = [];
  for (const m of raw.slice(0, MAX_DAY_MEALS)) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    const position = Number(o.position);
    if (!Number.isFinite(position) || position <= 0) continue;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
    out.push({
      position: Math.round(position),
      label: typeof o.label === "string" ? o.label.trim().slice(0, 40) : null,
      name,
      logged: Boolean(o.logged),
      kcal: num(o.kcal), p: num(o.p), c: num(o.c), f: num(o.f),
    });
  }
  return out;
}

/** Flatten resolved params into the wire shape the confirmation card executes. */
function wireParams(act: ActReply): Record<string, unknown> {
  const p = act.params;
  switch (act.intent) {
    case "swap_meal": return { position: p.meal!.position, name: p.name, items: p.items };
    case "move_meal": return { from: p.from!.position, to: p.to!.position };
    case "copy_meal": return { from: p.from!.position, to: p.to ? p.to.position : null };
    case "delete_meal":
    case "unlog_meal": return { position: p.meal!.position };
    case "log_meal": return { position: p.meal!.position, adherence: p.adherence ?? "Full" };
    case "add_snack": return { name: p.name, items: p.items };
    default: return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Say something first — tell me what you ate or what to change." }, { status: 400 });
    }
    if (message.length > 1500) {
      return NextResponse.json({ error: "That message is too long — keep it under 1500 characters." }, { status: 400 });
    }
    const day = sanitizeDayContext(body?.dayContext);

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;
    if (!clientId) {
      return NextResponse.json({ error: "Pick a client first — the coach needs a client's data." }, { status: 400 });
    }

    const metered = await enforceMeter(clientId, "chat");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    // ---- pass 1: intent extraction against the day context -----------------
    const extraction = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: ACT_SYSTEM_PROMPT,
      maxTokens: 800,
      messages: [{
        role: "user",
        content: `DAY CONTEXT (today's meals, trusted):\n${JSON.stringify(day)}\n\nCLIENT MESSAGE:\n${message}`,
      }],
      validate: validateActReply,
    });
    await logUsage(clientId, "chat", extraction.tokensIn, extraction.tokensOut, HAIKU_MODEL);

    // Even a failed extraction should degrade to Q&A, not an error bubble.
    const act: ActReply = extraction.value
      ? finalizeAct(extraction.value, day)
      : { intent: "none", params: { clarify: false }, confirmation: null, reply: "" };

    if (act.intent !== "none") {
      return NextResponse.json({
        intent: act.intent,
        params: wireParams(act),
        confirmation: act.confirmation,
        reply: act.reply,
      });
    }

    // Clarifying question (ambiguous/missing reference) — return it directly.
    if (act.params.clarify && act.reply) {
      return NextResponse.json({ intent: "none", message: act.reply });
    }

    // ---- intent 'none' = a question → the existing coach behavior ----------
    const context = await assembleCoachContext(supabase, clientId);
    const coach = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: COACH_SYSTEM_PROMPT,
      maxTokens: 700,
      messages: [{
        role: "user",
        content: `CONTEXT (server-assembled, trusted):\n${context}\n\nTODAY'S MEALS:\n${JSON.stringify(day)}\n\nCLIENT QUESTION:\n${message}`,
      }],
      validate: validateCoachReply,
    });
    await logUsage(clientId, "chat", coach.tokensIn, coach.tokensOut, HAIKU_MODEL);

    if (coach.value) {
      return NextResponse.json({ intent: "none", message: coach.value.message, suggestions: coach.value.suggestions });
    }
    // Salvage: a plain-text reply (or the extractor's placeholder) still helps.
    const fallback = coach.rawText.replace(/```(?:json)?|```/g, "").trim() || act.reply;
    if (fallback) return NextResponse.json({ intent: "none", message: fallback.slice(0, 1200) });
    return NextResponse.json({ error: "The coach couldn't answer right now — try again in a moment." }, { status: 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/act failed:", msg);
    return NextResponse.json({ error: `Coach failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
