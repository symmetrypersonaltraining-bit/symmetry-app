// POST /api/nutrition-ai/parse
// Body: { text: string, clientId?: string }
// "8 oz chicken, 1 cup jasmine rice, 1 tbsp olive oil"
//   → { items: [{ name, amount, unit, kcal, p, c, f, micros }], totals: { kcal, p, c, f, micros } }
// Auth-checked, client-scoped, metered (feature 'parse', default 15/day),
// Haiku, strict JSON with one retry on a malformed reply.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateParsedNames, type ParsedItem } from "@/lib/ai/nutrition-json";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFood } from "@/lib/nutrition/resolveFoodOp";
import { readNutrients, scaleNutrients, addNutrients, roundNutrients } from "@/lib/nutrition/nutrients";
import { kcalOf as kcalFromMacros } from "@/lib/nutrition/dailyTotals";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

const SYSTEM_PROMPT = `You are a nutrition parsing engine for a physique coach's app. The user gives a free-text description of foods with amounts (e.g. "8 oz chicken, 1 cup jasmine rice, 1 tbsp olive oil"). Split it into individual items.

YOU NEVER STATE A NUTRITION FIGURE. No calories, no protein, no carbs, no fat, no micronutrients — not for any food, not even if you are certain. The app reads every number from its own food database. Your job is to say WHAT they ate and HOW MUCH.

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"items":[{"name":string,"amount":number|null,"unit":string|null}]}

Rules:
- amount is the numeric quantity the user stated (null if none given); unit is its unit ("oz","cup","tbsp","g","slice",...) or null. Do NOT convert it — "6 oz" stays 6 and "oz".
- NAME THE FOOD THE WAY A FOOD DATABASE WOULD, and include the preparation they implied: "chicken breast, cooked", "white rice, cooked", "olive oil". Do not put the amount in the name.
- Include EVERY food mentioned as its own item. Never invent foods that were not mentioned.`;

// The 33-micronutrient request is gone entirely: micros now come off the
// catalogue row alongside the macros, which is thirty-three fewer chances per
// food for a model to be confidently wrong. Nothing left to strip, so there is
// no reduced fallback prompt any more.

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Nothing to parse — describe what you ate." }, { status: 400 });
    if (text.length > 1500) return NextResponse.json({ error: "That description is too long — keep it under 1500 characters." }, { status: 400 });

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { clientId } = scoped.scope;

    const metered = await enforceMeter(clientId, "food_parse");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const result = await callClaudeJson({
      meter: { clientId: clientId, feature: "food_parse" },
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      // 4000, not 900: a multi-item meal with micronutrients does not fit in
      // 900 and the reply truncates mid-JSON. That exact mistake took this
      // endpoint down - both attempts hit the ceiling and clients were told
      // "AI estimating isn't reachable right now".
      maxTokens: 4000,
      messages: [{ role: "user", content: text }],
      validate: validateParsedNames,
    });

    await logUsage(clientId, "food_parse", result.tokensIn, result.tokensOut, HAIKU_MODEL, { latencyMs: result.latencyMs, startedAt: result.startedAt });

    if (!result.value) {
      return NextResponse.json(
        { error: "Couldn't parse that into foods — try rephrasing (e.g. \"6 oz chicken, 1 cup rice\") or enter macros manually." },
        { status: 502 }
      );
    }
    // ── EVERY NUMBER COMES FROM A ROW ────────────────────────────────────────
    //
    // The model said what was eaten. The catalogue says what it contains. An
    // item that matches nothing is returned marked `unresolved` and contributes
    // NOTHING to the totals — the person is shown it and can search for it by
    // hand. A fabricated food looks exactly like a real one on the screen that
    // follows, which is the failure being designed out.
    const admin = createAdminClient();
    const deps = { db: admin, apiKey, clientId };
    const items: ParsedItem[] = [];
    const unresolved: string[] = [];

    for (const named of result.value.items) {
      let got = null;
      try {
        got = await resolveFood(deps, named.name, named.amount, named.unit);
      } catch {
        // A lookup that fell over is not licence to invent one.
        got = null;
      }
      if (!got) { unresolved.push(named.name); continue; }
      const scale = got.per_amount > 0 ? got.amount / got.per_amount : 1;
      items.push({
        // The ROW's name, so a wrong choice is visible and correctable. A wrong
        // name you can see beats a wrong number you cannot.
        name: got.name,
        amount: got.amount,
        unit: got.unit,
        p: round1(got.p * scale),
        c: round1(got.c * scale),
        f: round1(got.f * scale),
        kcal: Math.round(kcalFromMacros(got.p * scale, got.c * scale, got.f * scale)),
        ...(got.micros ? { micros: scaleNutrients(readNutrients(got.micros), scale) } : {}),
        food_id: got.food_id,
        verified: got.verified,
      } as ParsedItem);
    }

    if (!items.length) {
      return NextResponse.json(
        {
          error:
            unresolved.length
              ? `Couldn't find ${unresolved.slice(0, 3).join(", ")} in the food database — search for ${unresolved.length > 1 ? "them" : "it"} instead so the macros are right.`
              : "Couldn't parse that into foods — try naming each food and its amount.",
        },
        { status: 422 },
      );
    }

    const totals = items.reduce(
      (t, it) => ({ kcal: t.kcal + it.kcal, p: t.p + it.p, c: t.c + it.c, f: t.f + it.f }),
      { kcal: 0, p: 0, c: 0, f: 0 },
    );
    return NextResponse.json({
      items,
      totals: {
        kcal: Math.round(totals.kcal),
        p: round1(totals.p),
        c: round1(totals.c),
        f: round1(totals.f),
        micros: roundNutrients(
          items.reduce((acc, it) => (it.micros ? addNutrients(acc, it.micros) : acc), {}),
        ),
      },
      ...(unresolved.length ? { unresolved } : {}),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/parse failed:", msg);
    return NextResponse.json({ error: `Parse failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
