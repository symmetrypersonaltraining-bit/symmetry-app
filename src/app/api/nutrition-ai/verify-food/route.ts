// POST /api/nutrition-ai/verify-food
// Body: { food_catalog_id: string, clientId?: string }
// Sanity-checks a food_catalog entry's macros against known label/USDA values.
// Returns the corrected macros; when the model is confident (high confidence)
// the row is updated in place: verified=true, ai_verified_at=now(), corrected
// macro values. Auth-checked, metered (feature 'verify'), Haiku.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateVerifyResult } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

const SYSTEM_PROMPT = `You are a nutrition data auditor. You are given one food-catalog entry (name, serving info, macros) from a coaching app. Compare it against your knowledge of official nutrition labels and USDA data for that food/brand at that serving size.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"plausible":boolean,"confidence":"high"|"medium"|"low","corrected":{"kcal":number,"protein":number,"carbs":number,"fats":number},"notes":string}

Rules:
- "plausible": whether the stored macros are reasonable for this food at this serving.
- "corrected": your best macros for the stated serving. If the stored values are already right, return them unchanged.
- "confidence": "high" ONLY when you clearly recognize the food/brand and serving and are sure of the label/USDA values; "medium" for well-known generic foods with some serving ambiguity; "low" otherwise.
- "notes": one short sentence on what (if anything) was off.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const foodId = typeof body?.food_catalog_id === "string" ? body.food_catalog_id : "";
    if (!foodId) return NextResponse.json({ error: "food_catalog_id is required" }, { status: 400 });

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { clientId } = scoped.scope;

    const metered = await enforceMeter(clientId, "verify");
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
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      maxTokens: 400,
      messages: [{ role: "user", content: `Food catalog entry to audit:\n${JSON.stringify(presentable)}` }],
      validate: validateVerifyResult,
    });

    await logUsage(clientId, "verify", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      return NextResponse.json({ error: "Verification didn't return usable data — try again." }, { status: 502 });
    }

    const v = result.value;
    let applied = false;
    if (v.confidence === "high") {
      const nowIso = new Date().toISOString();
      const fullUpdate: Record<string, unknown> = {
        protein: v.corrected.protein,
        carbs: v.corrected.carbs,
        fats: v.corrected.fats,
        kcal: v.corrected.kcal,
        verified: true,
        ai_verified_at: nowIso,
      };
      let { error: updErr } = await admin.from("food_catalog").update(fullUpdate).eq("id", foodId);
      if (updErr) {
        // Column-name drift tolerance (e.g. no kcal column yet) — retry with the core set.
        const minimal = { protein: v.corrected.protein, carbs: v.corrected.carbs, fats: v.corrected.fats, verified: true, ai_verified_at: nowIso };
        ({ error: updErr } = await admin.from("food_catalog").update(minimal).eq("id", foodId));
      }
      if (updErr) console.error("verify-food: update failed", updErr.message);
      else applied = true;
    }

    return NextResponse.json({
      plausible: v.plausible,
      confidence: v.confidence,
      corrected: v.corrected,
      notes: v.notes,
      applied, // true when the catalog row was updated (verified + corrected values)
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/verify-food failed:", msg);
    return NextResponse.json({ error: `Verify failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
