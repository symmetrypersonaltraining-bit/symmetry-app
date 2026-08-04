// POST /api/recipes/ai — the "work out the numbers for me" button.
//
// Dustin: "they should be able to build a recipe manually, using data base, and
// ai if needed to figure numbers, etc."
//
// TWO JOBS, one route:
//   mode 'ingredients' — free text ("2 lb ground beef, a can of black beans,
//                        1 cup rice") becomes structured rows with macros.
//   mode 'estimate'    — an ingredient list that already exists but has zeros
//                        in it gets the missing macros filled in.
//
// EVERY NUMBER IT RETURNS IS A GUESS, and the app says so: rows come back
// marked source 'ai' and the builder shows them differently from a catalog
// match. A model's estimate and a database lookup are not the same kind of
// fact, and a client deciding whether to trust a figure deserves to know which
// one they are looking at.
//
// Calories are recomputed from the macros here rather than trusted, because a
// model will happily return 640 kcal next to macros that add to 400 — that is
// exactly the mismatch that made a client's breakfast look doubled.

import { NextRequest, NextResponse } from "next/server";
import { resolveAiScope } from "@/lib/ai/scope";
import { callClaudeJson, HAIKU_MODEL } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { kcalOf } from "@/lib/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

interface AiIngredient {
  food: string;
  amount: number | null;
  unit: string | null;
  protein: number;
  carbs: number;
  fats: number;
  note?: string | null;
}
interface Reply { ingredients: AiIngredient[]; servings?: number | null; notes?: string | null }

const SYSTEM = `You estimate the nutrition of recipe ingredients for a personal-training app.

Return ONLY valid JSON, no markdown, no fences:
{"ingredients":[{"food":string,"amount":number|null,"unit":string|null,"protein":number,"carbs":number,"fats":number,"note":string|null}],"servings":number|null,"notes":string|null}

Rules:
- Macros are GRAMS for the amount given, for the WHOLE quantity of that ingredient in the recipe — not per 100 g and not per serving.
- Use ordinary cooking units the person would recognise: oz, g, cup, tbsp, tsp, each, clove, can.
- Cooked vs raw changes the numbers a lot. If the text says cooked, price it cooked; if it is ambiguous for meat, assume raw weight and say so in that ingredient's note.
- Water, salt, pepper, herbs, spices, vinegar, hot sauce, black coffee and calorie-free sweeteners are 0/0/0. Do not invent macros for them.
- Oil, butter and dressings are fat and matter — never round them away.
- Do NOT return calories. They are computed from the macros.
- If a quantity is missing, choose the amount a normal recipe would use and put what you assumed in that ingredient's note.
- If the text is not food at all, return {"ingredients":[]}.

Be conservative and specific. "Chicken breast" at 8 oz raw is about 53 g protein and 6 g fat, not 40 and 20.`;

function validate(raw: unknown): Reply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.ingredients)) return null;
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0;
  };
  const ingredients: AiIngredient[] = [];
  for (const item of o.ingredients) {
    if (!item || typeof item !== "object") continue;
    const i = item as Record<string, unknown>;
    const food = typeof i.food === "string" ? i.food.trim() : "";
    if (!food) continue;
    const amt = Number(i.amount);
    ingredients.push({
      food: food.slice(0, 80),
      amount: Number.isFinite(amt) && amt > 0 ? Math.round(amt * 100) / 100 : null,
      unit: typeof i.unit === "string" ? i.unit.trim().slice(0, 20) || null : null,
      protein: n(i.protein),
      carbs: n(i.carbs),
      fats: n(i.fats),
      note: typeof i.note === "string" ? i.note.trim().slice(0, 160) || null : null,
    });
    if (ingredients.length >= 40) break;
  }
  const sv = Number(o.servings);
  return {
    ingredients,
    servings: Number.isFinite(sv) && sv > 0 ? Math.round(sv) : null,
    notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 300) || null : null,
  };
}

export async function POST(req: NextRequest) {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;

  let body: { mode?: string; text?: string; ingredients?: { food: string; amount?: number | null; unit?: string | null }[]; title?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured" }, { status: 503 });

  let prompt: string;
  if (body.mode === "estimate" && Array.isArray(body.ingredients) && body.ingredients.length) {
    prompt =
      `Recipe: ${body.title || "(untitled)"}\n\nWork out the macros for each of these ingredients, keeping the food names and quantities exactly as given:\n` +
      body.ingredients.map((i) => `- ${[i.amount, i.unit, i.food].filter(Boolean).join(" ")}`).join("\n");
  } else {
    const text = (body.text || "").trim();
    if (!text) return NextResponse.json({ error: "Nothing to read" }, { status: 400 });
    prompt =
      `Recipe: ${body.title || "(untitled)"}\n\nTurn this into an ingredient list with macros. If it says how many it serves, return that too.\n\n` +
      text.slice(0, 4000);
  }

  const { value, tokensIn, tokensOut } = await callClaudeJson<Reply>({
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM,
    maxTokens: 1600,
    messages: [{ role: "user", content: prompt }],
    validate,
  });
  await logUsage(scoped.scope.clientId ?? null, "parse", tokensIn, tokensOut, HAIKU_MODEL);

  if (!value) return NextResponse.json({ error: "Couldn't read that — try describing the ingredients one per line." }, { status: 422 });

  // Calories are ours to compute, and the per-ingredient marking is what lets
  // the builder show these as estimates rather than as facts.
  const ingredients = value.ingredients.map((i) => ({
    ...i,
    source: "ai" as const,
    kcal: kcalOf(i.protein, i.carbs, i.fats),
  }));

  return NextResponse.json({ ok: true, ingredients, servings: value.servings, notes: value.notes });
}
