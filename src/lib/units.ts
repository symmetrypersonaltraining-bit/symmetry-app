// Food unit-conversion system.
// A food's macros are stored per its `serving` string (e.g. "100 g", "4 oz", "1 cup", "1 slice").
// This lets a client log/adjust an added food in ANY compatible unit (mass↔mass, volume↔volume,
// count↔count) and get accurate macros by scaling to the food's base serving. When the requested
// unit isn't dimensionally compatible with the food's serving, we fall back to treating the number
// as a count of servings (so nothing ever breaks).

export type Dim = "mass" | "volume" | "count";
interface UnitDef { dim: Dim; toBase: number; label: string }

// toBase: mass→grams, volume→milliliters, count→each.
const UNITS: Record<string, UnitDef> = {
  g: { dim: "mass", toBase: 1, label: "g" },
  gram: { dim: "mass", toBase: 1, label: "g" },
  grams: { dim: "mass", toBase: 1, label: "g" },
  kg: { dim: "mass", toBase: 1000, label: "kg" },
  mg: { dim: "mass", toBase: 0.001, label: "mg" },
  oz: { dim: "mass", toBase: 28.3495, label: "oz" },
  ounce: { dim: "mass", toBase: 28.3495, label: "oz" },
  ounces: { dim: "mass", toBase: 28.3495, label: "oz" },
  lb: { dim: "mass", toBase: 453.592, label: "lb" },
  lbs: { dim: "mass", toBase: 453.592, label: "lb" },
  pound: { dim: "mass", toBase: 453.592, label: "lb" },

  ml: { dim: "volume", toBase: 1, label: "ml" },
  milliliter: { dim: "volume", toBase: 1, label: "ml" },
  l: { dim: "volume", toBase: 1000, label: "L" },
  liter: { dim: "volume", toBase: 1000, label: "L" },
  tsp: { dim: "volume", toBase: 4.92892, label: "tsp" },
  teaspoon: { dim: "volume", toBase: 4.92892, label: "tsp" },
  tbsp: { dim: "volume", toBase: 14.7868, label: "tbsp" },
  tablespoon: { dim: "volume", toBase: 14.7868, label: "tbsp" },
  cup: { dim: "volume", toBase: 236.588, label: "cup" },
  cups: { dim: "volume", toBase: 236.588, label: "cup" },
  "fl oz": { dim: "volume", toBase: 29.5735, label: "fl oz" },
  floz: { dim: "volume", toBase: 29.5735, label: "fl oz" },
  pint: { dim: "volume", toBase: 473.176, label: "pint" },
  quart: { dim: "volume", toBase: 946.353, label: "quart" },

  each: { dim: "count", toBase: 1, label: "each" },
  whole: { dim: "count", toBase: 1, label: "whole" },
  piece: { dim: "count", toBase: 1, label: "piece" },
  pieces: { dim: "count", toBase: 1, label: "piece" },
  slice: { dim: "count", toBase: 1, label: "slice" },
  slices: { dim: "count", toBase: 1, label: "slice" },
  scoop: { dim: "count", toBase: 1, label: "scoop" },
  serving: { dim: "count", toBase: 1, label: "serving" },
  servings: { dim: "count", toBase: 1, label: "serving" },
};

export function normUnit(u: string | null | undefined): string {
  return (u || "").trim().toLowerCase().replace(/\.+$/, "");
}
export function unitDim(u: string | null | undefined): Dim | null {
  const d = UNITS[normUnit(u)];
  return d ? d.dim : null;
}

// Parse a serving string like "100 g", "1/2 cup", "4 oz", "1 slice", "cup", "1" → {amount, unit}.
export function parseServing(s: string | null | undefined): { amount: number; unit: string } {
  if (!s) return { amount: 1, unit: "serving" };
  const str = String(s).trim().toLowerCase();
  const m = str.match(/^([\d]+\s*\/\s*[\d]+|[\d]*\.?[\d]+)?\s*([a-z][a-z ]*)?$/);
  if (!m) return { amount: 1, unit: "serving" };
  let amount = 1;
  if (m[1]) {
    if (m[1].includes("/")) {
      const [a, b] = m[1].split("/").map((x) => parseFloat(x.trim()));
      amount = b ? a / b : (a || 1);
    } else amount = parseFloat(m[1]);
  }
  if (!isFinite(amount) || amount <= 0) amount = 1;
  const unitRaw = normUnit(m[2] || "");
  const unit = UNITS[unitRaw] ? UNITS[unitRaw].label : "serving";
  return { amount, unit };
}

// Convert `amount` from unit `from` to unit `to`. Returns null when dimensions don't match.
export function convert(amount: number, from: string, to: string): number | null {
  const a = UNITS[normUnit(from)], b = UNITS[normUnit(to)];
  if (!a || !b || a.dim !== b.dim) return null;
  return (amount * a.toBase) / b.toBase;
}

// How many of the food's base servings does (amount, unit) equal, given the food's serving string?
// Falls back to `amount` (treated as servings) when the units are incompatible.
export function servingsFor(amount: number, unit: string, servingStr: string | null | undefined): number {
  const base = parseServing(servingStr);
  const conv = convert(amount, unit, base.unit);
  if (conv == null) return amount;
  return base.amount > 0 ? conv / base.amount : amount;
}

// Pickable units for a food (its own serving unit + all units in the same dimension + "serving").
export function unitsForServing(servingStr: string | null | undefined): string[] {
  const base = parseServing(servingStr);
  const dim = unitDim(base.unit);
  const labels: string[] = [];
  if (dim) {
    for (const k of Object.keys(UNITS)) {
      if (UNITS[k].dim === dim && UNITS[k].label !== "serving" && !labels.includes(UNITS[k].label)) labels.push(UNITS[k].label);
    }
  }
  if (!labels.includes("serving")) labels.push("serving");
  return labels;
}
