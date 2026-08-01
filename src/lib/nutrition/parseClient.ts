// Client helper for the AI food parser (/api/nutrition-ai/parse — workstream C).
// Defensive: tolerates several response shapes and fails soft (null) so the UI
// can fall back to "save as pending — macros tonight" like the current logger.

import { CustomItem, kcalOf } from "./dailyTotals";

interface ParseResult {
  items: CustomItem[];
  description?: string | null;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return isFinite(n) ? n : 0;
}

function mapItem(raw: Record<string, unknown>): CustomItem | null {
  const name = (raw.name ?? raw.food ?? raw.n ?? raw.item ?? "") as string;
  if (!name) return null;
  const p = num(raw.protein ?? raw.protein_g ?? raw.p);
  const c = num(raw.carbs ?? raw.carbs_g ?? raw.c);
  const f = num(raw.fats ?? raw.fat ?? raw.fat_g ?? raw.fats_g ?? raw.f);
  const k = raw.kcal != null || raw.calories != null ? num(raw.kcal ?? raw.calories) : kcalOf(p, c, f);
  const amount = (raw.amount ?? raw.serving ?? raw.a ?? raw.quantity ?? null) as string | number | null;
  const unit = (raw.unit ?? "") as string;
  const a = amount != null ? String(amount) + (unit ? " " + unit : "") : null;
  return {
    n: String(name),
    a,
    p, c, f, k,
    free: !!(raw.free ?? raw.unlimited ?? raw.is_unlimited),
    est: true,
    fac: 1,
  };
}

/**
 * Why the AI said no, when it said no.
 *
 * This used to collapse every failure into `null`: a 429 daily cap, a 503
 * missing API key and a 200 {paused} kill-switch all came back the same, and
 * the UI rendered "AI parse isn't available right now" for all of them. A
 * trainer who had simply used their fifteen parses for the day was told the
 * feature was broken — which is exactly the report that started this
 * ("my AI button does nothing"). The coach sheet already distinguishes all
 * three; the parse path threw the information away.
 *
 * Null still means "no usable result" so no call site has to change; the reason
 * rides alongside for the ones that want to say something true.
 */
export type ParseFailure = "cap" | "paused" | "unavailable" | "empty" | null;
let lastFailure: ParseFailure = null;

/** The reason the most recent parseFoodText returned null. */
export function lastParseFailure(): ParseFailure {
  return lastFailure;
}

export function parseFailureMessage(f: ParseFailure): string {
  switch (f) {
    case "cap":
      return "You've used today's AI estimates. They reset at midnight — you can still add this by hand.";
    case "paused":
      return "AI is paused right now. You can still add this by hand.";
    case "unavailable":
      return "AI estimating isn't reachable right now. You can still add this by hand.";
    default:
      return "Couldn't work that one out — try naming the food more plainly, or add it by hand.";
  }
}

export async function parseFoodText(text: string, clientId?: string): Promise<ParseResult | null> {
  lastFailure = null;
  try {
    const res = await fetch("/api/nutrition-ai/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, clientId }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      lastFailure = res.status === 429 || json?.capExceeded ? "cap" : "unavailable";
      return null;
    }
    if (!json || json.error) {
      lastFailure = json?.paused ? "paused" : "unavailable";
      return null;
    }
    if (json.paused) {
      lastFailure = "paused";
      return null;
    }
    const rawItems: unknown[] = Array.isArray(json.items)
      ? json.items
      : Array.isArray(json.foods)
      ? json.foods
      : Array.isArray(json)
      ? json
      : [];
    const items = rawItems
      .map((r) => (r && typeof r === "object" ? mapItem(r as Record<string, unknown>) : null))
      .filter((x): x is CustomItem => !!x);
    if (!items.length) {
      // Single-estimate shape ({calories, protein_g, ...}) → one item.
      const single = mapItem(json as Record<string, unknown>);
      if (single && (single.p || single.c || single.f || single.k)) {
        return { items: [{ ...single, n: json.description || text.slice(0, 60) }], description: json.description || null };
      }
      lastFailure = "empty";
      return null;
    }
    return { items, description: (json.description as string) || null };
  } catch {
    lastFailure = "unavailable";
    return null;
  }
}
