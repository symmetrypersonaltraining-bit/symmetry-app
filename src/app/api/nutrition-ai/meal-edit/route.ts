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

interface InItem { id: string; food: string; amount: number | null; unit: string | null }

export interface MealEditOp {
  op: "set" | "remove" | "add" | "swap";
  /** set/remove/swap: the item id from the list we sent. */
  id?: string;
  /** set: the new amount, in the item's own unit. */
  amount?: number;
  /** add/swap: the food going on the plate. */
  name?: string;
  servings?: number;
  p?: number;
  c?: number;
  f?: number;
  /**
   * THE MEASURE, when they gave one.
   *
   * Dustin, 24 Aug: "swap chicken thigh w 6 oz of chicken breast" came back as
   * "1 serving" with no way to change it, because `add` had no field for an
   * amount or a unit and so both were discarded on the way through. p/c/f are
   * quoted FOR `amount` of `unit` when these are present.
   */
  unit?: string;
}

const SYSTEM = `You edit ONE meal in a physique coach's app. You are given the meal's current items (each with an id, a food name, an amount and a unit) and a sentence from the person eating it. Turn the sentence into operations against those items.

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"ops":[{"op":"set","id":"<id>","amount":<number>}|{"op":"remove","id":"<id>"}|{"op":"add","name":"<food>","amount":<number>,"unit":"<unit>","p":<g>,"c":<g>,"f":<g>}|{"op":"swap","id":"<id>","name":"<food>","amount":<number>,"unit":"<unit>","p":<g>,"c":<g>,"f":<g>}],"note":"<one short plain sentence>"}

Rules:
- "set" changes an existing item's amount, in THAT ITEM'S OWN UNIT. If the item is "3 each" and they say "four eggs", that is {"op":"set","amount":4}. If the item is "50 g" and they say "double it", that is 100.
- "remove" is for "no X", "skip the X", "drop the X", "without X". Prefer remove over setting an amount to 0.
- "add" is ONLY for a food that is not already in the list. Give p/c/f from USDA / label knowledge; assume cooked weight and plain preparation unless told otherwise. Be realistic, never inflated.
- WHENEVER THEY NAME A MEASURE — "6 oz", "200 g", "two tbsp" — put it in "amount" and "unit" and quote p/c/f FOR THAT MEASURE. Only fall back to "servings" with p/c/f per serving when they named no measure at all. Never round a stated measure to a serving.
- "swap" replaces one item with a different food, keeping its place: {"op":"swap","id":"<id of the item going out>","name":"<food coming in>","amount":<number>,"unit":"<unit>","p":<g>,"c":<g>,"f":<g>}. Use it for "swap X for Y", "X instead of Y", "make it Y not X". If they name a measure for the new food, give it. IF THEY DO NOT, OMIT amount AND unit — the app will carry the old item's own weight across, which is what "swap" means. Do not invent a serving.
- Match foods loosely — "the bread" should find "Homemade Sourdough", "eggs" should find "Boiled Eggs (whole)". If a food they mention is genuinely already listed, edit it rather than adding a duplicate.
- Only act on what they actually said. Never change an item they did not mention. An empty ops array is a valid answer.
- "note" is what you did, in one short sentence, in plain words. No emoji.`;

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
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
      const amount =
        typeof x.amount === "number" && Number.isFinite(x.amount) && x.amount > 0 ? x.amount : undefined;
      const unit = typeof x.unit === "string" && x.unit.trim() ? x.unit.trim().slice(0, 16) : undefined;
      ops.push({
        op,
        ...(op === "swap" ? { id: x.id as string } : {}),
        name,
        // Only meaningful when no measure was given. Left at 1 otherwise so a
        // reply carrying both cannot double-count.
        servings: amount != null ? 1 : (typeof x.servings === "number" && x.servings > 0 ? x.servings : 1),
        p: num(x.p), c: num(x.c), f: num(x.f),
        // An amount with no unit is not a measure, it is a number. Both or
        // neither — a bare "6" would render as "6" and mean nothing.
        ...(amount != null && unit ? { amount, unit } : {}),
      });
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
    return NextResponse.json({ ops, note: result.value.note });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Couldn't apply that — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}
