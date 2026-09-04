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
- Real cooking. Ordinary equipment, ordinary technique, nothing that needs a scale for every step.
- NEVER state per-serving macros or calories in notes. The app computes those from your ingredient rows and shows them; saying them yourself only creates a second number that disagrees with the first.
- notes is for what you assumed, what you added from the storecupboard, and what is short if you could not hit the target. Nothing else.`;

// The correction pass, sent when the first attempt misses, with the arithmetic
// already done for it.
//
// Measured on the very first live call this route ever made: asked for 45/55/18
// per serving, it wrote a recipe totalling 49/71.3/22.8 -- thirty percent over
// on carbs -- and its own notes read "protein 46 g, carbs 54 g, fat 17 g. This
// lands almost exactly on target." It reported the TARGET back rather than what
// it had written. That is why totals are computed here and never trusted from
// the reply, and why one arithmetic-aware retry earns its second call: the
// numbers landing IS the feature. Without it this is a recipe generator that
// lies about the one thing it was asked to do.
const FIX_SYSTEM = `You are correcting the quantities in a recipe so it hits a macro target.

Return ONLY valid JSON in the SAME shape you were given, no markdown, no fences.

You will be told the target, and the ACTUAL per-serving totals computed from the ingredient rows you returned. Those actuals are arithmetic on your own numbers -- they are right and yours were wrong. Do not argue with them.

Rules:
- Change AMOUNTS, and the macros that follow from them. Keep the same foods, the same method, the same title.
- Scale the macros with the amounts. Halving the rice halves its carbs.
- Fix the biggest miss first. Sixteen grams over on carbs matters more than two on fat.
- If the target genuinely cannot be reached with these foods, get as close as possible and say so plainly in notes.
- NEVER state per-serving macros in notes. The app computes them.`;

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
    // The macros it gave are for the amount it was asked about, so that amount
    // is the basis. Without this the builder's amount box was decoration: it
    // re-rendered the line and left the totals where they were.
    base_amount: i.amount ?? null,
    kcal: kcalOf(i.protein, i.carbs, i.fats),
  }));

  if (body.mode === "create") {
    const t2 = body.target || {};
    const want = {
      protein: Number(t2.protein) || 0,
      carbs: Number(t2.carbs) || 0,
      fats: Number(t2.fats) || 0,
    };

    // Totals are computed HERE from the ingredient rows, never taken from the
    // model. See the note on FIX_SYSTEM for what happened the first time this
    // route ran against the real API.
    const perServing = (rows: typeof ingredients, servings: number) => {
      const s = servings > 0 ? servings : 1;
      const tot = rows.reduce(
        (a, i) => ({ p: a.p + i.protein, c: a.c + i.carbs, f: a.f + i.fats }),
        { p: 0, c: 0, f: 0 },
      );
      return {
        protein: Math.round((tot.p / s) * 10) / 10,
        carbs: Math.round((tot.c / s) * 10) / 10,
        fats: Math.round((tot.f / s) * 10) / 10,
        kcal: kcalOf(tot.p / s, tot.c / s, tot.f / s),
      };
    };

    // How far off is "off"? Six grams or twelve percent, whichever is kinder,
    // on each macro actually asked for. Tight enough to catch a real miss,
    // loose enough not to spend a second call correcting two grams of fat.
    const missed = (x: { protein: number; carbs: number; fats: number }) =>
      (["protein", "carbs", "fats"] as const).some(
        (k) => !!want[k] && Math.abs(x[k] - want[k]) > Math.max(6, want[k] * 0.12),
      );
    const dist = (x: { protein: number; carbs: number; fats: number }) =>
      (["protein", "carbs", "fats"] as const).reduce(
        (a, k) => a + (want[k] ? Math.abs(x[k] - want[k]) : 0), 0,
      );

    let sv = value.servings && value.servings > 0 ? value.servings : 1;
    let rows = ingredients;
    let per = perServing(rows, sv);
    let corrected = false;

    // Up to TWO rounds. One pass reliably fixes the macro it is pointed at and
    // can leave another short; a second lands the rest. Three is not worth the
    // spend — by then it is oscillating rather than converging.
    for (let round = 0; round < 2 && missed(per); round++) {
      // Name the gap and its DIRECTION. The first correction pass fixed carbs
      // perfectly and left protein 10 g short — it treated "hit the target" as
      // one instruction instead of three, and fixed the loudest. Telling it
      // "you are 10 g UNDER on protein, increase a protein source" is a
      // different and much easier request than "land on the target".
      const gaps = (["protein", "carbs", "fats"] as const)
        .filter((k) => !!want[k])
        .map((k) => {
          const d = Math.round((per[k] - want[k]) * 10) / 10;
          if (Math.abs(d) < 1) return `${k}: on target, leave it alone`;
          return d > 0
            ? `${k}: ${d} g OVER — reduce a ${k === "protein" ? "protein" : k === "carbs" ? "carb" : "fat"} source`
            : `${k}: ${Math.abs(d)} g UNDER — increase a ${k === "protein" ? "protein" : k === "carbs" ? "carb" : "fat"} source`;
        })
        .join("\n  ");

      const fixPrompt =
        `Target per serving: protein ${want.protein} g, carbs ${want.carbs} g, fat ${want.fats} g.\n` +
        `Your recipe ACTUALLY comes to: protein ${per.protein} g, carbs ${per.carbs} g, ` +
        `fat ${per.fats} g per serving across ${sv} servings.\n\n` +
        `Fix ALL of these, not just the biggest:\n  ${gaps}\n\nHere is what you returned:\n` +
        JSON.stringify({
          title: value.title,
          servings: sv,
          description: value.description,
          prep_minutes: value.prep_minutes,
          cook_minutes: value.cook_minutes,
          instructions: value.instructions,
          ingredients: rows.map((i) => ({
            food: i.food, amount: i.amount, unit: i.unit,
            protein: i.protein, carbs: i.carbs, fats: i.fats, note: i.note,
          })),
        }) +
        `\n\nAdjust the amounts so it lands on the target.`;

      const fix = await callClaudeJson<Reply>({
        meter: { clientId: scoped.scope.clientId ?? null, feature: "recipe_ai" },
        apiKey,
        model: HAIKU_MODEL,
        system: FIX_SYSTEM,
        maxTokens: 2200,
        messages: [{ role: "user", content: fixPrompt }],
        validate,
      });
      await logUsage(scoped.scope.clientId ?? null, "recipe_ai", fix.tokensIn, fix.tokensOut, HAIKU_MODEL);

      if (fix.value && fix.value.ingredients.length) {
        const fixedRows = fix.value.ingredients.map((i) => ({
          ...i, source: "ai" as const, base_amount: i.amount ?? null,
          kcal: kcalOf(i.protein, i.carbs, i.fats),
        }));
        const fixedSv = fix.value.servings && fix.value.servings > 0 ? fix.value.servings : sv;
        const fixedPer = perServing(fixedRows, fixedSv);
        // Only take the correction if it is actually CLOSER. A retry that makes
        // it worse is worse than not retrying at all.
        if (dist(fixedPer) < dist(per)) {
          rows = fixedRows;
          sv = fixedSv;
          per = fixedPer;
          corrected = true;
          value.title = fix.value.title || value.title;
          value.description = fix.value.description || value.description;
          value.instructions =
            fix.value.instructions && fix.value.instructions.length
              ? fix.value.instructions
              : value.instructions;
          value.notes = fix.value.notes || value.notes;
        } else {
          // No improvement. `per` is unchanged, so another round would send a
          // byte-identical prompt and get the same answer back — a paid call
          // for a guaranteed no-op. Stop and report honestly instead.
          break;
        }
      } else {
        break;
      }
    }

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
      ingredients: rows,
      perServing: per,
      target: want,
      // The UI shows this. Somebody deciding whether to cook it is entitled to
      // be told it came out over, rather than shown a number and left to do the
      // subtraction themselves.
      onTarget: !missed(per),
      corrected,
      notes: value.notes,
    });
  }

  return NextResponse.json({ ok: true, ingredients, servings: value.servings, notes: value.notes });
}
