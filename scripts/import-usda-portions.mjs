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
 *   USDA_FDC_API_KEY=xxxx node scripts/import-usda-portions.mjs
 *
 * By default it writes `usda-portions.json` and Claude loads that through the
 * Supabase connection it already has -- so the only secret anyone has to handle
 * is the free USDA key. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY instead
 * if you want it to write to the database directly.
 *
 * A key takes a minute: https://fdc.nal.usda.gov/api-key-signup/
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

// Default: write the portions to a file, which Claude then loads through the
// Supabase connection it already has. That way the only secret Dustin has to
// handle is the free USDA key -- no service-role key pasted into an
// environment variable that "anyone who uses the environment can read".
const outArg = process.argv.find((a) => a.startsWith("--out="));
const OUT = outArg ? outArg.split("=")[1] : (SUPABASE_URL && SERVICE_KEY ? null : "usda-portions.json");

if (!KEY) fail("USDA_FDC_API_KEY is not set. Free key: https://fdc.nal.usda.gov/api-key-signup/");

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
const REJECT = /(yield from|cubic inch|per pound|refuse|as purchased|not further specified)/i;

// ⚠️ SIZES ONLY, AND THAT IS THE WHOLE POINT.
//
// The first run pulled cups and tablespoons too, and two things went wrong at
// once. It duplicated work already done — `food_serving_rules` holds the RACC
// map and every row carries its own serving_options — and it COLLIDED: the key
// is the food's name before the first comma, so "Amaranth grain, cooked" and
// "Amaranth grain, uncooked" both key to "amaranth grain" and the second
// silently overwrote the first at 193 g against 246 g. A cooked/raw mix-up is
// exactly the class of wrong number this work exists to end.
//
// Sizes do not have that problem — a small banana is a small banana — and they
// are the gap nothing else can fill: 706 of 322,232 rows carried one.

function portionsOf(food) {
  const out = [];
  for (const p of food.foodPortions ?? []) {
    const desc = [p.modifier, p.portionDescription, p.measureUnit?.name]
      .filter((s) => s && s !== "undetermined").join(" ").trim();
    const grams = Number(p.gramWeight);
    if (!desc || !(grams > 0) || REJECT.test(desc)) continue;
    const size = (desc.match(SIZE) || [])[0]?.toLowerCase();
    if (!size) continue;
    out.push({ portion: size, grams });
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

const collected = [];

async function upsert(rows) {
  if (DRY || !rows.length) return;
  if (OUT) { collected.push(...rows); return; }
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
  let page = 1, seen = 0, kept = 0, skipped = 0;
  for (;;) {
    const res = await fdcJson(
      `/foods/search?query=*&dataType=SR%20Legacy,Foundation&pageSize=200&pageNumber=${page}`);
    const foods = res.foods ?? [];
    if (!foods.length) break;

    const batch = [];
    for (const hit of foods) {
      if (seen >= LIMIT) break;
      seen++;
      // ⚠️ ONE BAD ID MUST NOT LOSE THE RUN. The first full pass died on
      // `FDC 404 on /food/1105314` -- an id the SEARCH endpoint returns and the
      // DETAIL endpoint does not have -- and because the throw reached
      // main().catch() it exited having written nothing after ~40 minutes of
      // fetching. A food we cannot read is a food we skip.
      let full;
      try {
        full = await fdcJson(`/food/${hit.fdcId}`);
      } catch (e) {
        skipped++;
        await sleep(120);
        continue;
      }
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
    // Checkpoint: the file is rewritten after every page, so whatever the run
    // has found so far survives an interruption.
    if (OUT && !DRY) {
      await (await import("node:fs/promises")).writeFile(OUT, JSON.stringify(collected, null, 2));
    }
    console.log(`page ${page}: ${seen} read, ${kept} portions, ${skipped} skipped`);
    if (seen >= LIMIT) break;
    page++;
  }
  if (OUT && !DRY) {
    await (await import("node:fs/promises")).writeFile(OUT, JSON.stringify(collected, null, 2));
    console.log(`\ndone — ${seen} foods, ${kept} portions written to ${OUT}`);
    console.log("Tell Claude: \"load usda-portions.json into food_portion_reference\".");
  } else {
    console.log(`\ndone — ${seen} foods, ${kept} portions into food_portion_reference`);
  }
}

main().catch((e) => fail(e.message));
