// POST /api/nutrition-ai/parse
// Body: { text: string, clientId?: string }
// "8 oz chicken, 1 cup jasmine rice, 1 tbsp olive oil"
//   → { items: [{ name, amount, unit, kcal, p, c, f }], totals: { kcal, p, c, f } }
// Auth-checked, client-scoped, metered (feature 'parse', default 15/day),
// Haiku, strict JSON with one retry on a malformed reply.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateParseResult } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

const SYSTEM_PROMPT = `You are a nutrition parsing engine for a physique coach's app. The user gives a free-text description of foods with amounts (e.g. "8 oz chicken, 1 cup jasmine rice, 1 tbsp olive oil"). Split it into individual items and estimate macros for the stated amount of each item using USDA / nutrition-label knowledge (assume cooked weights unless stated raw; assume plain preparation unless stated otherwise).

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"items":[{"name":string,"amount":number|null,"unit":string|null,"kcal":number,"p":number,"c":number,"f":number}],"totals":{"kcal":number,"p":number,"c":number,"f":number}}

Rules:
- p/c/f are grams of protein/carbs/fat for that item at that amount; kcal is calories for that amount.
- amount is the numeric quantity the user stated (null if none given); unit is its unit ("oz","cup","tbsp","g","slice",...) or null.
- Include EVERY food mentioned as its own item. Never invent foods that were not mentioned.
- Be realistic, not inflated. totals must be the sum of the items.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Nothing to parse — describe what you ate." }, { status: 400 });
    if (text.length > 1500) return NextResponse.json({ error: "That description is too long — keep it under 1500 characters." }, { status: 400 });

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { clientId } = scoped.scope;

    const metered = await enforceMeter(clientId, "parse");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const result = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      maxTokens: 900,
      messages: [{ role: "user", content: text }],
      validate: validateParseResult,
    });

    await logUsage(clientId, "parse", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      return NextResponse.json(
        { error: "Couldn't parse that into foods — try rephrasing (e.g. \"6 oz chicken, 1 cup rice\") or enter macros manually." },
        { status: 502 }
      );
    }
    return NextResponse.json(result.value);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/parse failed:", msg);
    return NextResponse.json({ error: `Parse failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
