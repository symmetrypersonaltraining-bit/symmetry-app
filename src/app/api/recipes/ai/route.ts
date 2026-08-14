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
//   mode 'create'      — WHAT MEGAN ASKED FOR, 14 Aug: "would be cool to put in
//                        ingredients and have it make the recipe to fit macros.
//                        Im using chatgpt to do it now." You give it what is in
//                        your kitchen and the macros you have left; it chooses
//                        the QUANTITIES so the totals land, and writes the
//                        method. The other two modes read a recipe you already
//                        have. This one writes one.
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
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";
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
interface Reply {
  ingredients: AiIngredient[];
  servings?: number | null;
  notes?: string | null;
  /** 'create' only — the recipe it wrote. */
  title?: string | null;
  description?: string | null;
  instructions?: string[];
  prep_minutes?: number | null;
  cook_minutes?: number | null;
}

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

// The create-mode prompt is separate rather than a paragraph bolted onto the
// one above, because the job is genuinely different: that one READS a recipe,
// this one WRITES one and has to land on a number while doing it.
const CREATE_SYSTEM = `You write recipes for clients of a personal-training studio, from the food they already have, hitting a macro target.

Return ONLY valid JSON, no markdown, no fences:
{"title":string,"description":string,"servings":number,"prep_minutes":number,"cook_minutes":number,"ingredients":[{"food":string,"amount":number,"unit":string,"protein":number,"carbs":number,"fats":number,"note":string|null}],"instructions":[string],"notes":string|null}

THE TARGET IS THE JOB. You are choosing QUANTITIES so the per-serving totals land on the macros you are given. Getting within about 5 g on each of protein, carbs and fat is the whole point — a recipe that tastes plausible and misses the numbers is a failure here.

Rules:
- Use the ingredients you are given. You may add ordinary storecupboard items — oil, salt, pepper, herbs, spices, vinegar, stock, garlic, lemon — and you should say so in notes. Do NOT invent a main ingredient they did not mention.
- If the target cannot be hit with what they have, get as close as you can and say plainly in notes what is short and what one item would fix it.
- Macros are GRAMS, for the WHOLE quantity of that ingredient in the recipe — not per 100 g, not per serving.
- Do NOT return calories. They are computed from the macros.
- Cooked vs raw changes the numbers a lot. Say which you priced in that ingredient's note.
- Oil and butter are fat and matter. Never round them away to make a target work.
- instructions: 3–8 steps, each one plain and short, the way you would say it out loud. No numbering — the app numbers them.
- title: what a person would call it, not a description. "Chipotle Beef Rice Bowl", not "High Protein Beef And Rice Dish With Vegetables".
- description: one sentence, under 140 characters.
- Real cooking. Ordinary equipment, ordinary technique, nothing that needs a scale for every step.`;

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
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
  const mins = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.min(600, Math.round(x)) : null;
  };
  return {
    ingredients,
    servings: Number.isFinite(sv) && sv > 0 ? Math.round(sv) : null,
    notes: str(o.notes, 300),
    title: str(o.title, 120),
    description: str(o.description, 200),
    // Steps are the part a person actually follows, so an empty or non-string
    // entry is dropped rather than rendered as a blank numbered line.
    instructions: Array.isArray(o.instructions)
      ? o.instructions
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim().slice(0, 400))
          .slice(0, 20)
      : [],
    prep_minutes: mins(o.prep_minutes),
    cook_minutes: mins(o.cook_minutes),
  };
}

export async function POST(req: NextRequest) {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;

  // Kill switch. This route could spend after every client-facing feature had
  // already paused — the cap meant nothing here.
  const paused = await enforceMeter(null, "recipe_ai");
  if (paused) return paused;

  let body: {
    mode?: string;
    text?: string;
    ingredients?: { food: string; amount?: number | null; unit?: string | null }[];
    title?: string;
    /** create mode */
    have?: string;
    target?: { protein?: number; carbs?: number; fats?: number };
    servings?: number;
    constraints?: string;
  };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI isn't configured" }, { status: 503 });

  let prompt: string;
  let system = SYSTEM;
  let maxTokens = 1600;

  if (body.mode === "create") {
    const have = (body.have || "").trim();
    if (!have) return NextResponse.json({ error: "Tell me what you've got in the kitchen." }, { status: 400 });

    const t = body.target || {};
    const p = Number(t.protein), c = Number(t.carbs), f = Number(t.fats);
    const hasTarget = [p, c, f].some((x) => Number.isFinite(x) && x > 0);
    if (!hasTarget) {
      return NextResponse.json({ error: "Give me a macro target to aim at." }, { status: 400 });
    }
    const servings = Number.isFinite(Number(body.servings)) && Number(body.servings) > 0
      ? Math.min(12, Math.round(Number(body.servings))) : 1;

    // The target is stated PER SERVING and the servings count is stated
    // separately, because "make it hit 40g protein" means per plate to a person
    // and there is no way to guess which they meant.
    const targetLine = [
      Number.isFinite(p) && p > 0 ? `protein ${Math.round(p)} g` : null,
      Number.isFinite(c) && c > 0 ? `carbs ${Math.round(c)} g` : null,
      Number.isFinite(f) && f > 0 ? `fat ${Math.round(f)} g` : null,
    ].filter(Boolean).join(", ");

    prompt =
      `They have: ${have.slice(0, 1500)}\n\n` +
      `Target PER SERVING: ${targetLine}\n` +
      `Servings: ${servings}\n` +
      (body.constraints ? `Must respect: ${body.constraints.slice(0, 400)}\n` : "") +
      `\nWrite one recipe. Choose the quantities so each serving lands on that target. ` +
      `Ingredient macros you return are for the WHOLE recipe, not per serving.`;
    system = CREATE_SYSTEM;
    maxTokens = 2200;
  } else if (body.mode === "estimate" && Array.isArray(body.ingredients) && body.ingredients.length) {
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
    meter: { clientId: scoped.scope.clientId ?? null, feature: "recipe_ai" },
    apiKey,
    model: HAIKU_MODEL,
    system,
    maxTokens,
    messages: [{ role: "user", content: prompt }],
    validate,
  });
  await logUsage(scoped.scope.clientId ?? null, "recipe_ai", tokensIn, tokensOut, HAIKU_MODEL);

  if (!value) return NextResponse.json({ error: "Couldn't read that — try describing the ingredients one per line." }, { status: 422 });

  // Calories are ours to compute, and the per-ingredient marking is what lets
  // the builder show these as estimates rather than as facts.
  const ingredients = value.ingredients.map((i) => ({
    ...i,
    source: "ai" as const,
    kcal: kcalOf(i.protein, i.carbs, i.fats),
  }));

  if (body.mode === "create") {
    // Totals are computed HERE from the ingredient rows, never taken from the
    // model. It is the only way to tell the person honestly how close it landed
    // — and a model asked to hit a target will sometimes report the target back
    // rather than what it actually wrote.
    const sv = value.servings && value.servings > 0 ? value.servings : 1;
    const tot = ingredients.reduce(
      (a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fats }),
      { p: 0, c: 0, f: 0 },
    );
    const per = {
      protein: Math.round((tot.p / sv) * 10) / 10,
      carbs: Math.round((tot.c / sv) * 10) / 10,
      fats: Math.round((tot.f / sv) * 10) / 10,
      kcal: kcalOf(tot.p / sv, tot.c / sv, tot.f / sv),
    };
    return NextResponse.json({
      ok: true,
      recipe: {
        title: value.title || "Untitled recipe",
        description: value.description,
        servings: sv,
        prep_minutes: value.prep_minutes,
        cook_minutes: value.cook_minutes,
        instructions: value.instructions || [],
      },
      ingredients,
      perServing: per,
      notes: value.notes,
    });
  }

  return NextResponse.json({ ok: true, ingredients, servings: value.servings, notes: value.notes });
}
