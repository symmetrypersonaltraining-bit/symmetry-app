// POST /api/nutrition-ai/meal-edit
//
// "no sourdough, 4 eggs instead of 3, and add a banana"
//   → { ops: [{op:"set",id,amount}, {op:"remove",id}, {op:"add",name,servings,p,c,f}], note }
//
// Dustin, 24 Aug: "need to ai parse as well from here to add/edit items."
//
// WHY THIS IS NOT /api/nutrition-ai/parse.
//
// parse turns free text into a list of foods. That is half of what is wanted
// here. From the Adjust/edit sheet somebody is looking at a meal that already
// exists and the sentence they say is usually ABOUT it — drop this, double
// that, make it four. parse cannot express any of those, because it has never
// been told what is already on the plate. So this route is handed the current
// items, with their ids, and answers in operations against them.
//
// NOTHING IS SAVED. The reply is applied to the sheet's pending state, exactly
// as if the steppers had been tapped, and the trainer or client still presses
// Save. A model that can silently rewrite a logged meal is a model that can
// silently rewrite a logged meal.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveFood } from "@/lib/nutrition/resolveFoodOp";

interface InItem { id: string; food: string; amount: number | null; unit: string | null }

export interface MealEditOp {
  op: "set" | "remove" | "add" | "swap";
  /** set/remove/swap: the item id from the list we sent. */
  id?: string;
  /** set: the new amount, in the item's own unit. */
  amount?: number;
  /** add/swap: the food going on the plate, as they described it. */
  name?: string;
  /** add/swap: the measure they named, if they named one. */
  unit?: string;

  // ── FILLED IN BY THE SERVER FROM food_catalog, NEVER BY THE MODEL ──────────
  //
  // There is deliberately no p/c/f in what the model may return. Two prompting
  // attempts failed on consecutive tries - "6 oz of chicken breast" came back
  // as one serving, "200 g of potatoes" came back carrying the per-100 g
  // figures - and the answer is not a third prompt. A macro figure comes from
  // a row in the catalogue or it does not exist.

  /** The catalogue row this resolved to, or null when it is an estimate. */
  food_id?: string | null;
  /** True when the numbers came from the model because the catalogue had nothing. */
  estimated?: boolean;
  /** The row's own name, so a wrong CHOICE is visible on screen and fixable. */
  resolved_name?: string;
  verified?: boolean;
  /** Straight off the row, for `per_amount` of `unit`. */
  p?: number;
  c?: number;
  f?: number;
  per_amount?: number;
  /** The row's own serving choices, so the sheet can offer a unit picker. */
  options?: { label: string; gramsEach: number }[];
  grams_each?: number;
  servings?: number;
  /**
   * Set when nothing in the catalogue is that food. The sheet says so and
   * offers the search. NOTHING IS ADDED - a fabricated row that looks like
   * every other row is the failure being designed out.
   */
  unresolved?: boolean;
}

const SYSTEM = `You edit ONE meal in a physique coach's app. You are given the meal's current items (each with an id, a food name, an amount and a unit) and a sentence from the person eating it. Turn the sentence into operations against those items.

YOU NEVER STATE A NUTRITION FIGURE. No calories, no protein, no carbs, no fat, not for any food, not even if you are sure. The app reads every number from its food database. Your job is what the sentence MEANS.

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"ops":[{"op":"set","id":"<id>","amount":<number>}|{"op":"remove","id":"<id>"}|{"op":"add","name":"<food>","amount":<number>,"unit":"<unit>"}|{"op":"swap","id":"<id>","name":"<food>","amount":<number>,"unit":"<unit>"}],"note":"<one short plain sentence>"}

Rules:
- "set" changes an existing item's amount, in THAT ITEM'S OWN UNIT. If the item is "3 each" and they say "four eggs", that is {"op":"set","amount":4}. If the item is "50 g" and they say "double it", that is 100.
- "remove" is for "no X", "skip the X", "drop the X", "without X". Prefer remove over setting an amount to 0.
- "add" is ONLY for a food that is not already in the list.
- "swap" replaces one item with a different food, keeping its place: {"op":"swap","id":"<id of the item going out>","name":"<food coming in>","amount":<number>,"unit":"<unit>"}. Use it for "swap X for Y", "X instead of Y", "make it Y not X".
- ONE OPERATION PER FOOD. A sentence often names more than one. "a bagel w cream cheese" is TWO foods and therefore TWO ops — one for the bagel, one for the cream cheese. "eggs and toast", "chicken with rice", "coffee w creamer" are all two. Never fold a second food into the first one's name.
- "with", "w", "w/", "and", "plus", "topped with", "on the side" all introduce ANOTHER food. The only exception is when the two words are one dish a database would list under a single name — "peanut butter", "cream of rice", "chicken parmesan", "macaroni and cheese".
- NAME THE FOOD THE WAY A FOOD DATABASE WOULD, and include the preparation they implied — "chicken breast, cooked", "white potatoes, boiled", "white rice, cooked". Preparation is HOW IT WAS COOKED, not what it was served with. Do not include the amount in the name.
- WHENEVER THEY NAME A MEASURE — "6 oz", "200 g", "two tbsp" — put the number in "amount" and the unit in "unit", exactly as they said it. Do not convert it.
- If they name NO measure: for "add", omit amount and unit. For "swap", also omit them — the app carries the weight of the item being replaced across, which is what a swap means. NEVER invent a placeholder unit. "each", "serving", "whole" and "piece" are not measures — if they did not name one, leave both fields out.
- Match foods loosely against what is already on the meal — "the bread" should find "Homemade Sourdough", "eggs" should find "Boiled Eggs (whole)". If a food they mention is genuinely already listed, edit it rather than adding a duplicate.
- Only act on what they actually said. Never change an item they did not mention. An empty ops array is a valid answer.
- "note" is what you did, in one short sentence, in plain words. No numbers, no emoji.

WORKED EXAMPLE — "thomas cinnamon swirl bagel w cream cheese", nothing matching on the plate:
{"ops":[{"op":"add","name":"Thomas cinnamon swirl bagel"},{"op":"add","name":"cream cheese"}],"note":"Added a cinnamon swirl bagel and cream cheese."}
Two foods, two ops, no amounts, no units, no numbers.`;

const MAX_OPS = 25;

function validate(raw: unknown): { ops: MealEditOp[]; note: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { ops?: unknown; note?: unknown };
  if (!Array.isArray(r.ops)) return null;
  const ops: MealEditOp[] = [];
  for (const o of r.ops.slice(0, MAX_OPS)) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;
    const op = x.op;
    if (op === "set") {
      if (typeof x.id !== "string" || typeof x.amount !== "number" || !Number.isFinite(x.amount)) continue;
      // A negative amount is not a smaller portion, it is a broken reply.
      ops.push({ op: "set", id: x.id, amount: Math.max(0, x.amount) });
    } else if (op === "remove") {
      if (typeof x.id !== "string") continue;
      ops.push({ op: "remove", id: x.id });
    } else if (op === "add" || op === "swap") {
      const name = typeof x.name === "string" ? x.name.trim().slice(0, 80) : "";
      if (!name) continue;
      // A swap has to say what it is replacing, or it is just an add wearing
      // the wrong name and the old food silently stays on the plate.
      if (op === "swap" && typeof x.id !== "string") continue;
      const amount =
        typeof x.amount === "number" && Number.isFinite(x.amount) && x.amount > 0 ? x.amount : undefined;
      const unit = typeof x.unit === "string" && x.unit.trim() ? x.unit.trim().slice(0, 16) : undefined;
      ops.push({
        op,
        ...(op === "swap" ? { id: x.id as string } : {}),
        name,
        // An amount with no unit is not a measure, it is a number. Both or
        // neither — a bare "6" would render as "6" and mean nothing.
        ...(amount != null && unit ? { amount, unit } : {}),
      });
      // NOTE what is NOT read here: p, c, f, servings, per_amount. Even if the
      // model volunteers them they are dropped on the floor. The resolver below
      // fills those from food_catalog, and there is no path by which a number
      // the model produced reaches a client's log.
    }
  }
  return { ops, note: typeof r.note === "string" ? r.note.slice(0, 200) : "" };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Say what you want changed." }, { status: 400 });
    if (text.length > 800) return NextResponse.json({ error: "Keep it under 800 characters." }, { status: 400 });

    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const items: InItem[] = rawItems.slice(0, 40).map((i: Record<string, unknown>) => ({
      id: String(i?.id ?? ""),
      food: String(i?.food ?? "").slice(0, 120),
      amount: typeof i?.amount === "number" ? i.amount : null,
      unit: typeof i?.unit === "string" ? i.unit : null,
    })).filter((i: InItem) => i.id && i.food);

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { clientId } = scoped.scope;

    // Its own feature name, sharing food_parse's daily ALLOWANCE (both point at
    // ai_daily_parse_limit). Same kind of ask, so one cap; different name, so
    // its spend and its failures are its own on the AI health page.
    const metered = await enforceMeter(clientId, "meal_edit");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const listing = items.length
      ? items.map((i) => `- id=${i.id} · ${i.food} · ${i.amount ?? "—"}${i.unit ? " " + i.unit : ""}`).join("\n")
      : "(the meal has no items yet)";

    const result = await callClaudeJson({
      meter: { clientId, feature: "meal_edit" },
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM,
      maxTokens: 1200,
      messages: [{ role: "user", content: `CURRENT ITEMS:\n${listing}\n\nWHAT THEY SAID:\n${text}` }],
      validate,
    });

    if (!result.value) {
      return NextResponse.json(
        { error: "Couldn't work out that change — try naming the food and the amount." },
        { status: 502 },
      );
    }

    // Never hand back an op pointing at an item that was not on the meal. The
    // sheet would silently drop it, and a change the person watched being
    // accepted would not happen.
    const known = new Set(items.map((i) => i.id));
    const ops = result.value.ops.filter((o) => o.op === "add" || (o.id && known.has(o.id)));

    await logUsage(clientId, "meal_edit", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    // ── EVERY NUMBER COMES FROM A ROW ────────────────────────────────────────
    //
    // Each food the model named is looked up in food_catalog, and a second,
    // small call picks WHICH row it meant — with the candidates' real macros in
    // front of it. That second step is judgement, not recall, and it is needed
    // because neither ranking is safe alone: the top hit for "banana" is a row
    // reading 242 kcal and 14 g of fat, while verified-first turns "chicken
    // breast" into oven-roasted deli roll.
    //
    // Sequential rather than parallel: two or three foods at most, and a burst
    // of concurrent Haiku calls against one client's meter is not worth the
    // handful of milliseconds.
    const admin = createAdminClient();
    for (const op of ops) {
      if (op.op !== "add" && op.op !== "swap") continue;
      try {
        const resolved = await resolveFood({ db: admin, apiKey, clientId }, op.name || "", op.amount, op.unit);
        if (!resolved) { op.unresolved = true; continue; }
        op.food_id = resolved.food_id;
        op.estimated = !!resolved.estimated;
        op.resolved_name = resolved.name;
        op.verified = resolved.verified;
        op.p = resolved.p; op.c = resolved.c; op.f = resolved.f;
        op.amount = resolved.amount;
        op.unit = resolved.unit;
        op.per_amount = resolved.per_amount;
        // The row's real portions travel with it. Without these the sheet can
        // only ever show the one unit the resolver happened to choose.
        op.options = resolved.options || [];
        op.grams_each =
          resolved.unit === "g"
            ? 1
            : (resolved.options || []).find((o) => o.label === resolved.unit)?.gramsEach;
        op.servings = 1;
      } catch {
        // A lookup that fell over is not licence to invent one. It is the same
        // outcome as no match: say so, add nothing.
        op.unresolved = true;
      }
    }

    return NextResponse.json({ ops, note: result.value.note });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Couldn't apply that — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}
