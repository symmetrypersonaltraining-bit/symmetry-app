// POST /api/nutrition-ai/plan-build  (Sonnet — plan quality matters here)
// Two modes:
//   { targets: { kcal, p, c, f } }  → 5 itemized meals hitting those targets
//   { consult: { answers } }        → recommends targets (with reasoning) from
//                                     the client's metrics/goal, then the meals
// Returns a strict-JSON plan DRAFT:
//   { targets, reasoning, meals: [{ name, timing, items: [{ food, amount, unit, p, c, f, kcal }], subtotal }], totals }
// DOES NOT write to the DB — the client reviews/confirms and the UI inserts.
// Auth-checked, client-scoped, metered (feature 'plan_build', default 1/day).

import { NextRequest, NextResponse } from "next/server";
import { SONNET_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validatePlanDraft } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { Db, enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";

const SYSTEM_PROMPT = `You build meal plans for Symmetry Personal Training (physique coach Dustin). Plans use simple, repeatable whole foods in the style of his real plans: chicken breast, 93/7 ground beef, white fish, eggs / egg whites, Oikos Triple Zero yogurt, whey protein, cream of rice, jasmine rice, potatoes, oats, rice cakes, fruit, olive oil, almonds/nut butter, vegetables (free). Amounts are precise (grams or common measures, cooked basis unless noted).

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"targets":{"kcal":number,"p":number,"c":number,"f":number},"reasoning":string|null,"meals":[{"name":string,"timing":string|null,"items":[{"food":string,"amount":number|null,"unit":string|null,"p":number,"c":number,"f":number,"kcal":number}]}],"totals":{"kcal":number,"p":number,"c":number,"f":number}}

Rules:
- Exactly 5 meals (Meal 1 through Meal 5), each with 2-4 items and a sensible timing (e.g. "7:00 AM", "post-workout").
- Per-item p/c/f are grams for the stated amount; kcal consistent with the macros.
- The summed totals MUST land within 3% of the targets on kcal and within 5g on each macro. Check your math before answering.
- When TARGETS are given: use them exactly as the "targets" and set "reasoning" to null.
- When a CONSULT is given (client answers + metrics/goal): first decide appropriate daily targets (protein ~0.8-1.2g per lb bodyweight, sensible deficit/surplus for the goal), put a concise 2-4 sentence explanation in "reasoning", then build the meals to hit them.
- This is a DRAFT for the coach/client to review — do not mention databases or saving.`;

interface Targets {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

function cleanTargets(t: unknown): Targets | null {
  if (!t || typeof t !== "object") return null;
  const o = t as Record<string, unknown>;
  const kcal = Math.round(Number(o.kcal ?? o.calories));
  const p = Number(o.p ?? o.protein);
  const c = Number(o.c ?? o.carbs);
  const f = Number(o.f ?? o.fats);
  if (![kcal, p, c, f].every((n) => Number.isFinite(n) && n > 0)) return null;
  if (kcal < 800 || kcal > 6000) return null;
  return { kcal, p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

async function consultContext(db: Db, clientId: string | null): Promise<string> {
  if (!clientId) return "No client profile data available.";
  const today = new Date().toISOString().slice(0, 10);
  const [clientRes, metricsRes, targetRes] = await Promise.all([
    db.from("clients").select("name, primary_goal").eq("id", clientId).maybeSingle(),
    db
      .from("metrics")
      .select("metric_date, weight, body_fat_pct")
      .eq("client_id", clientId)
      .order("metric_date", { ascending: false })
      .limit(10),
    db
      .from("macro_targets")
      .select("calories, protein, carbs, fats, effective_date")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const client = clientRes.data as { name: string | null; primary_goal: string | null } | null;
  const metrics = (metricsRes.data as { metric_date: string; weight: number | null; body_fat_pct: number | null }[]) || [];
  const w = metrics.find((m) => m.weight != null);
  const bf = metrics.find((m) => m.body_fat_pct != null);
  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;

  const lines: string[] = [];
  if (client?.name) lines.push(`Client: ${client.name}.`);
  if (client?.primary_goal) lines.push(`Stated goal: ${client.primary_goal}.`);
  if (w) lines.push(`Latest weight: ${w.weight} lbs (${w.metric_date}).`);
  if (bf) lines.push(`Latest body fat: ${bf.body_fat_pct}% (${bf.metric_date}).`);
  if (target)
    lines.push(`Current targets: ${target.calories} kcal / ${target.protein}P / ${target.carbs}C / ${target.fats}F.`);
  return lines.length ? lines.join("\n") : "No client profile data available.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const targets = cleanTargets(body?.targets);
    const consult = body?.consult && typeof body.consult === "object" ? body.consult : null;
    if (!targets && !consult) {
      return NextResponse.json(
        { error: "Send either targets {kcal,p,c,f} or consult {answers}." },
        { status: 400 }
      );
    }

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;

    const metered = await enforceMeter(clientId, "plan_build");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    let userText: string;
    if (targets) {
      userText = `Build a 5-meal plan for these exact daily targets: ${targets.kcal} kcal, ${targets.p}g protein, ${targets.c}g carbs, ${targets.f}g fat.`;
    } else {
      const answersStr = JSON.stringify(consult!.answers ?? consult).slice(0, 4000);
      const ctx = await consultContext(supabase, clientId);
      userText = `CONSULT MODE — first recommend daily macro targets with brief reasoning, then build the 5-meal plan.\n\nClient data (server-assembled):\n${ctx}\n\nConsult answers from the client:\n${answersStr}`;
    }

    const result = await callClaudeJson({
      apiKey,
      model: SONNET_MODEL,
      system: SYSTEM_PROMPT,
      maxTokens: 3000,
      messages: [{ role: "user", content: userText }],
      validate: validatePlanDraft,
    });

    await logUsage(clientId, "plan_build", result.tokensIn, result.tokensOut, SONNET_MODEL);

    if (!result.value) {
      return NextResponse.json(
        { error: "Couldn't produce a clean plan draft — please try again, or ask Dustin to build it manually." },
        { status: 502 }
      );
    }
    // Draft only — the UI shows it for confirmation and performs the insert.
    return NextResponse.json({ draft: true, plan: result.value });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/plan-build failed:", msg);
    return NextResponse.json({ error: `Plan build failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
