// POST /api/nutrition-ai/verify-food
// Body: { food_catalog_id: string, clientId?: string }
//
// Audits one food_catalog row against the model's knowledge of labels and USDA
// data, and REPORTS. It does not write.
//
// ── IT USED TO WRITE, AND THAT WAS BACKWARDS ─────────────────────────────────
//
// On a "high" confidence reply it overwrote the row's protein, carbs, fats and
// kcal with the model's numbers and set `verified: true`. Three things wrong
// with that, in increasing order of seriousness:
//
//   1. `verified` is what describeCandidates renders as [USDA] and what
//      PICK_SYSTEM tells the picker to prefer — "those are checked; the rest
//      are crowd-submitted and some are badly wrong". After this route ran, a
//      Haiku recollection was indistinguishable from a lab measurement, to a
//      model that had been told to trust the flag.
//   2. Nothing checked the reply. validateEstimate refuses macros that outweigh
//      the food they are in, precisely because "the per-100 g answer given for a
//      30 g serving is the single most likely way for this to be wrong".
//      validateVerifyResult checks no such thing.
//   3. The basis could move silently. The row was handed to the model complete
//      with serving_desc, serving_grams AND serving_options, and the prompt asked
//      for "your best macros for the stated serving" — but the columns being
//      written mean per `serving_grams`. A barcode-scanned bar with
//      serving_grams 100 and a "1 bar (55 g)" option is exactly the case the
//      prompt calls high confidence, and the label's per-bar numbers would land
//      in the per-100 g columns. Every log of that food afterwards understated
//      by ~45%, with nothing on screen saying the basis had moved.
//
// The whole architecture (see lib/nutrition/foodResolve.ts) rests on one rule:
// a macro figure comes from a food_catalog row, never from a model. A route
// that writes a model's macros INTO the row inverts that rule at its source.
//
// Checked 4 Sep before changing it: zero rows carry ai_verified_at, so nothing
// in the catalogue came from here. No caller exists in src/ either. This makes
// sure neither can change.
//
// What survives is the useful half — telling a person that a row looks wrong.
// Auth-checked, metered (feature 'verify_food'), Haiku.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateVerifyResult } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { nutrientPromptSpec } from "@/lib/nutrition/nutrients";

const SYSTEM_PROMPT = `You are a nutrition data auditor. You are given one food-catalog entry (name, serving info, macros) from a coaching app. Compare it against your knowledge of official nutrition labels and USDA data for that food/brand at that serving size.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"plausible":boolean,"confidence":"high"|"medium"|"low","corrected":{"kcal":number,"protein":number,"carbs":number,"fats":number,"micros":object},"notes":string}

Rules:
- "plausible": whether the stored macros are reasonable for this food at this serving.
- "corrected": your best macros for the stated serving. If the stored values are already right, return them unchanged.
- "confidence": "high" ONLY when you clearly recognize the food/brand and serving and are sure of the label/USDA values; "medium" for well-known generic foods with some serving ambiguity; "low" otherwise.
- "notes": one short sentence on what (if anything) was off.

${nutrientPromptSpec()}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const foodId = typeof body?.food_catalog_id === "string" ? body.food_catalog_id : "";
    if (!foodId) return NextResponse.json({ error: "food_catalog_id is required" }, { status: 400 });

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { clientId } = scoped.scope;

    const metered = await enforceMeter(clientId, "verify_food");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const admin = createAdminClient();
    const { data: food, error: foodErr } = await admin
      .from("food_catalog")
      .select("*")
      .eq("id", foodId)
      .maybeSingle();
    if (foodErr) {
      console.error("verify-food: catalog read failed", foodErr.message);
      return NextResponse.json({ error: "Couldn't load that catalog entry." }, { status: 500 });
    }
    if (!food) return NextResponse.json({ error: "Food catalog entry not found." }, { status: 404 });

    // Present the row without internal/noise fields.
    const presentable: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(food as Record<string, unknown>)) {
      if (["id", "created_at", "updated_at", "client_id", "created_by", "verified", "ai_verified_at"].includes(k)) continue;
      if (v != null && v !== "") presentable[k] = v;
    }

    const result = await callClaudeJson({
      meter: { clientId: clientId, feature: "verify_food" },
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      maxTokens: 1500,
      messages: [{ role: "user", content: `Food catalog entry to audit:\n${JSON.stringify(presentable)}` }],
      validate: validateVerifyResult,
    });

    await logUsage(clientId, "verify_food", result.tokensIn, result.tokensOut, HAIKU_MODEL, { latencyMs: result.latencyMs, startedAt: result.startedAt });

    if (!result.value) {
      return NextResponse.json({ error: "Verification didn't return usable data — try again." }, { status: 502 });
    }

    const v = result.value;

    // NOTHING IS WRITTEN. See the header. `applied` stays in the response shape
    // so an existing caller keeps working; it is now always false, and `suggested`
    // says what to do with the numbers instead: show them to a person.
    return NextResponse.json({
      plausible: v.plausible,
      confidence: v.confidence,
      corrected: v.corrected,
      notes: v.notes,
      applied: false,
      suggested: true,
      basis: food.serving_grams != null ? `per ${food.serving_grams} g` : (food.serving_desc || "per serving"),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/verify-food failed:", msg);
    return NextResponse.json({ error: `Verify failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
