#!/usr/bin/env node
/**
 * IMPORT USDA'S HOUSEHOLD PORTIONS — the file our catalogue never got.
 *
 * Dustin, 8 Sep: "You can go online as AI and figure out how many grams a small
 * banana is. That needs to happen for all of these foods... There's hundreds of
 * databases out there that do this and already have all the right numbers.
 * Where are those numbers coming from?"
 *
 * They come from ONE place. Every nutrition app — MyFitnessPal, Cronometer,
 * LoseIt — gets "1 small" / "1 medium" / "1 large" from the **food_portion**
 * file of USDA FoodData Central. It is free, public, and definitive.
 *
 * Our import took the nutrients and a few cup measures and left that file
 * behind:
 *
 *     rows carrying ANY size portion        706
 *     searchable rows                   322,232      0.2%
 *
 * Every workaround in the food code — the keyword map, the piece-size table,
 * the RACC pass, weighedDefaultAmount — exists because of that one gap. This
 * script closes it.
 *
 * ── WHY IT IS NOT ALREADY RUN ──────────────────────────────────────────────
 *
 * The sandbox this session runs in blocks USDA at the network layer:
 *
 *     api.nal.usda.gov       connect_rejected (organization policy)
 *     fdc.nal.usda.gov       blocked by the egress proxy
 *     data.gov, huggingface  blocked
 *     github.com             reachable — but no one mirrors food_portion.csv
 *
 * So this is written, tested against the shape of the data, and waiting on one
 * network permission. Allow `api.nal.usda.gov` in the environment's network
 * policy, put a free FDC key in the environment, and run it.
 *
 *   USDA_FDC_API_KEY=xxxx  SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
 *     node scripts/import-usda-portions.mjs [--limit N] [--dry-run]
 *
 * A key takes a minute: https://fdc.nal.usda.gov/api-key-signup.html
 *
 * ── WHAT IT WRITES ─────────────────────────────────────────────────────────
 *
 * `food_portion_reference` — one row per (food, portion), each carrying the FDC
 * id it came from, so every number in this app can be traced to its source.
 * It deliberately does NOT touch `serving_grams`: that is the weight the macros
 * are quoted for, and moving it silently rescales every macro on the row.
 */

const FDC = "https://api.nal.usda.gov/fdc/v1";
const KEY = process.env.USDA_FDC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : Infinity;

if (!KEY) fail("USDA_FDC_API_KEY is not set. https://fdc.nal.usda.gov/api-key-signup.html");
if (!DRY && (!SUPABASE_URL || !SERVICE_KEY)) fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run.");

function fail(msg) { console.error(`\n  ${msg}\n`); process.exit(1); }

/**
 * A portion description worth keeping.
 *
 * USDA writes the size in `modifier` ("small", "1 medium (7\" long)") and the
 * weight in `gramWeight`. We keep the household sizes and the common measures
 * and drop the ones that are not portions a person serves themselves — "1 cubic
 * inch", "1 yield from...", anything per-pound.
 */
const SIZE = /\b(extra small|small|medium|large|extra large|jumbo)\b/i;
const MEASURE = /\b(cup|tbsp|tablespoon|tsp|teaspoon|slice|piece|fillet|breast|thigh|link|patty|oz|fl oz)\b/i;
const REJECT = /(yield from|cubic inch|per pound|refuse|as purchased|not further specified)/i;

function portionsOf(food) {
  const out = [];
  for (const p of food.foodPortions ?? []) {
    const desc = [p.modifier, p.portionDescription, p.measureUnit?.name]
      .filter((s) => s && s !== "undetermined").join(" ").trim();
    const grams = Number(p.gramWeight);
    if (!desc || !(grams > 0) || REJECT.test(desc)) continue;
    if (!SIZE.test(desc) && !MEASURE.test(desc)) continue;
    const size = (desc.match(SIZE) || [])[0]?.toLowerCase();
    out.push({ portion: size ?? desc.toLowerCase().slice(0, 60), grams, size: Boolean(size) });
  }
  // One weight per portion name: USDA lists several for some foods and the
  // median is the honest single answer.
  const byName = new Map();
  for (const p of out) {
    if (!byName.has(p.portion)) byName.set(p.portion, []);
    byName.get(p.portion).push(p.grams);
  }
  return [...byName].map(([portion, gs]) => ({
    portion,
    grams: gs.sort((a, b) => a - b)[Math.floor(gs.length / 2)],
  }));
}

async function fdcJson(path) {
  const url = `${FDC}${path}${path.includes("?") ? "&" : "?"}api_key=${KEY}`;
  const r = await fetch(url);
  if (r.status === 429) { await sleep(60_000); return fdcJson(path); }
  if (!r.ok) throw new Error(`FDC ${r.status} on ${path.split("?")[0]}`);
  return r.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upsert(rows) {
  if (DRY || !rows.length) return;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/food_portion_reference?on_conflict=food_key,portion`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`supabase ${r.status}: ${await r.text()}`);
}

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "");

  // SR Legacy and Foundation are the whole foods: the ones with sizes. Branded
  // products already carry their label serving and are not the problem.
  let page = 1, seen = 0, kept = 0;
  for (;;) {
    const res = await fdcJson(
      `/foods/search?query=*&dataType=SR%20Legacy,Foundation&pageSize=200&pageNumber=${page}`);
    const foods = res.foods ?? [];
    if (!foods.length) break;

    const batch = [];
    for (const hit of foods) {
      if (seen >= LIMIT) break;
      seen++;
      const full = await fdcJson(`/food/${hit.fdcId}`);
      const key = String(full.description || "").toLowerCase().split(",")[0].trim();
      for (const p of portionsOf(full)) {
        kept++;
        batch.push({
          food_key: key, portion: p.portion, grams: p.grams,
          source: `USDA FoodData Central ${full.fdcId} (${full.dataType})`,
        });
      }
      await sleep(120);            // stay under the 3,600/hour key limit
    }
    await upsert(batch);
    console.log(`page ${page}: ${seen} foods read, ${kept} portions kept`);
    if (seen >= LIMIT) break;
    page++;
  }
  console.log(`\ndone — ${seen} foods, ${kept} portions into food_portion_reference`);
}

main().catch((e) => fail(e.message));
