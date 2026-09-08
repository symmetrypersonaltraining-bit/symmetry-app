/**
 * Regenerate the generated half of src/lib/nutrition/foodUnitDefaults.ts.
 *
 * WHY THIS IS A TS SCRIPT AND NOT THE SQL ALONE.
 *
 * The map's keys have to be exactly what `unitKey` produces at runtime, or an
 * entry is in the file under a name nothing can look up. That has already
 * happened: the previous generation folded accents to their plain letter while
 * `unitKey` stripped them, so "Jocko Mölk Whey" was filed as `jocko molk whey`
 * and looked up as `jocko m lk whey`. Three of his foods sat in the map and
 * answered for nothing.
 *
 * Two implementations of one normalisation will drift again, so there is only
 * one now: this script imports `unitKey` from the app and uses it. The SQL's
 * whole job is to hand over the raw (food, unit, count) triples.
 *
 * Run, in two steps:
 *
 *   1. Run scripts/food-unit-defaults.sql through the Supabase MCP tool and
 *      save the single returned string to a file, e.g. /tmp/meal-item-units.tsv
 *      (one row per line: food <TAB> unit <TAB> count).
 *   2. npx tsx scripts/emit-food-unit-defaults.ts /tmp/meal-item-units.tsv
 *
 * It rewrites the marked region of foodUnitDefaults.ts in place and leaves the
 * hand-written matcher above and below it untouched. Run the unit tests after.
 */

import fs from "node:fs";
import path from "node:path";
import { unitKey } from "../src/lib/nutrition/foodUnitDefaults";

const TARGET = path.join(__dirname, "..", "src", "lib", "nutrition", "foodUnitDefaults.ts");
const START = "// ─── GENERATED FROM meal_items — START ───────────────────────";
const END = "// ─── GENERATED FROM meal_items — END ────────────────────────";

const tsvPath = process.argv[2];
if (!tsvPath) {
  console.error("usage: npx tsx scripts/emit-food-unit-defaults.ts <tsv from food-unit-defaults.sql>");
  process.exit(1);
}

// ── Read the raw pairs ────────────────────────────────────────────────────
const rows: { food: string; unit: string; n: number }[] = [];
for (const line of fs.readFileSync(tsvPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const parts = line.split("\t");
  if (parts.length !== 3) throw new Error(`not three tab-separated fields: ${JSON.stringify(line)}`);
  const n = Number(parts[2]);
  if (!Number.isInteger(n) || n < 1) throw new Error(`bad count: ${JSON.stringify(line)}`);
  rows.push({ food: parts[0], unit: parts[1].trim().toLowerCase(), n });
}
if (!rows.length) throw new Error("no rows — did the query return anything?");

// ── Normalise with the app's own key, and add the counts up ───────────────
//
// The counts are summed AFTER normalising, because that is the number the
// matcher weighs. "Almond butter" and "Almond Butter" are one food he has
// programmed eight times, not two he has programmed six and two.
const byKey = new Map<string, Map<string, number>>();
for (const r of rows) {
  const key = unitKey(r.food);
  if (!key || !r.unit) continue;
  const units = byKey.get(key) ?? new Map<string, number>();
  units.set(r.unit, (units.get(r.unit) ?? 0) + r.n);
  byKey.set(key, units);
}

// Most-used unit wins; the unit's own name breaks a tie, so the output is
// stable across runs rather than depending on row order.
const entries = [...byKey.entries()]
  .map(([key, units]) => {
    const [unit, uses] = [...units.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return { key, unit, uses };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

const pairs = [...byKey.values()].reduce((t, u) => t + u.size, 0);
const q = (s: string) => JSON.stringify(s);

const block = [
  START,
  `// ${entries.length} foods, from ${pairs} distinct (food, unit) pairs, ${rows.length} raw rows.`,
  "//",
  "// Regenerate with scripts/emit-food-unit-defaults.ts — never by hand. The keys",
  "// are whatever unitKey() makes of the food name, because that is what the",
  "// lookup asks for.",
  "const HIS_UNIT = new Map<string, HisUnit>([",
  ...entries.map((e) => `  [${q(e.key)}, { unit: ${q(e.unit)}, uses: ${e.uses} }],`),
  "]);",
  END,
].join("\n");

const src = fs.readFileSync(TARGET, "utf8");
const from = src.indexOf(START);
const to = src.indexOf(END);
if (from < 0 || to < 0) throw new Error(`markers not found in ${TARGET} — put them back before regenerating`);
fs.writeFileSync(TARGET, src.slice(0, from) + block + src.slice(to + END.length), "utf8");

console.error(`${entries.length} foods, ${pairs} (food, unit) pairs, from ${rows.length} rows -> ${TARGET}`);
