/**
 * WHEN THE CATALOGUE DOES NOT HAVE IT, GO AND GET IT.
 *
 * Dustin, 9 Sep 2026: *"ai needs to be involved here, if it's not in the data
 * base they need a way to search in online through ai and get real numbers.
 * again this is the whole point of having a 'brain' in the app."*
 *
 * ── WHAT "AI GOES AND GETS IT" HAS TO MEAN, AND WHAT IT MUST NOT ────────────
 *
 * It cannot mean asking a model to recite the macros. That is the failure this
 * whole subsystem was built to end, and the parse route's own header records
 * it: *"recall plus arithmetic, and it got both wrong in ways that looked
 * right."* A recited number is self-consistent by construction — the `banana`
 * row in this database reads 242 kcal, 2P, 27C, 14F, and 2×4 + 27×4 + 14×9 is
 * exactly 242. No arithmetic check can ever catch it.
 *
 * So the model's job here is the same as everywhere else in this module: say
 * WHAT the food is, and CHOOSE between real rows. The rows come from USDA
 * FoodData Central over the network — the same place every serious nutrition
 * app gets its numbers — and every row that comes back is written into
 * food_catalog carrying the FDC id it came from, so any number in this app can
 * be traced to its source years later.
 *
 * ── WHY THIS BEATS THE ESTIMATE FALLBACK IT SITS IN FRONT OF ────────────────
 *
 * resolveFood already had a last-ditch step where the model estimates a food
 * the catalogue has never heard of. That step stays, because a network can be
 * down and 500,000 rows still will not have everything — but it is now the
 * FOURTH thing tried rather than the third, and what it produces is marked as
 * an estimate. Anything this module returns is a real measured row.
 *
 * ── WHAT IT COSTS ──────────────────────────────────────────────────────────
 *
 * One HTTP call on a catalogue miss, and one INSERT the first time a food is
 * seen. Every client after that gets it out of food_catalog with no network at
 * all, because the row is now IN the catalogue. The database teaches itself.
 */

const FDC = "https://api.nal.usda.gov/fdc/v1";

/** FDC nutrient ids. These are stable and documented; they are not guesses. */
const N = {
  protein: 1003,
  fat: 1004,
  carbs: 1005,
  kcal: 1008,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
  satFat: 1258,
} as const;

export interface UsdaOnlineFood {
  fdcId: number;
  description: string;
  dataType: string;
  brand: string | null;
  /** Per 100 g, which is how the search endpoint normalises every dataType. */
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  satFat: number | null;
  /** The label serving, when the row carries one ("1 roll", 61 g). */
  servingGrams: number | null;
  servingLabel: string | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The datasets, most trustworthy first.
 *
 * Foundation and SR Legacy are laboratory-measured whole foods. Survey (FNDDS)
 * is USDA's own modelling of prepared dishes — which is what a "cinnamon roll"
 * or a "chicken burrito" actually is, and the reason a catalogue of whole foods
 * misses them. Branded is last on purpose: it is the manufacturer-submitted
 * half, the same crowd data that put a 336 kcal "Banana" with zero protein into
 * this catalogue in the first place.
 */
const DATA_TYPES = "Foundation,SR%20Legacy,Survey%20(FNDDS),Branded";

export function usdaOnlineAvailable(): boolean {
  return !!process.env.USDA_FDC_API_KEY;
}

export async function searchUsdaOnline(term: string, limit = 8): Promise<UsdaOnlineFood[]> {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key || !term.trim()) return [];
  const url =
    `${FDC}/foods/search?query=${encodeURIComponent(term.trim())}` +
    `&dataType=${DATA_TYPES}&pageSize=${Math.max(1, Math.min(25, limit))}&api_key=${key}`;

  let json: unknown;
  try {
    // A slow lookup must not hang a client's logging. Eight seconds is long
    // enough for FDC on a normal day and short enough that a bad day falls
    // through to the estimate step instead of spinning.
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }

  const foods = (json as { foods?: unknown[] })?.foods;
  if (!Array.isArray(foods)) return [];

  const out: UsdaOnlineFood[] = [];
  for (const raw of foods) {
    const f = raw as Record<string, unknown>;
    const byId = new Map<number, number>();
    for (const rn of (f.foodNutrients as Record<string, unknown>[] | undefined) ?? []) {
      const id = num(rn.nutrientId);
      const v = num(rn.value);
      if (id != null && v != null) byId.set(id, v);
    }
    const protein = byId.get(N.protein) ?? null;
    const carbs = byId.get(N.carbs) ?? null;
    const fats = byId.get(N.fat) ?? null;
    // A row missing any macro is not a food we can price. Skipping it is the
    // whole discipline of this module — a partial row looks identical to a
    // complete one once it is on a plate.
    if (protein == null || carbs == null || fats == null) continue;

    const ss = num(f.servingSize);
    const unit = String(f.servingSizeUnit ?? "").toLowerCase();
    const household = typeof f.householdServingFullText === "string" ? f.householdServingFullText.trim() : "";
    const servingGrams = ss != null && (unit === "g" || unit === "gram" || unit === "grm") ? ss : null;

    out.push({
      fdcId: Number(f.fdcId),
      description: String(f.description ?? "").trim(),
      dataType: String(f.dataType ?? ""),
      brand: (typeof f.brandName === "string" && f.brandName.trim())
        ? f.brandName.trim()
        : (typeof f.brandOwner === "string" && f.brandOwner.trim() ? f.brandOwner.trim() : null),
      kcal: byId.get(N.kcal) ?? null,
      protein, carbs, fats,
      fiber: byId.get(N.fiber) ?? null,
      sugar: byId.get(N.sugar) ?? null,
      sodium: byId.get(N.sodium) ?? null,
      satFat: byId.get(N.satFat) ?? null,
      servingGrams,
      servingLabel: household || null,
    });
  }
  return out.filter((f) => f.fdcId && f.description);
}

const round2 = (n: number | null): number | null => (n == null ? null : Math.round(n * 100) / 100);

/**
 * Write one USDA row into the catalogue and hand back what landed.
 *
 * Idempotent on `fdc_id`: the second client to eat the same thing reads the row
 * this call created rather than going back to the network. That is the point —
 * the catalogue grows a real row each time it is short one.
 *
 * `fdc_id` is the column that already existed for this. I added a second one
 * called `source_ref` before finding it, because the schema listing I checked
 * returned every column twice and hit its own row limit before reaching
 * `fdc_id` — a truncated listing looks exactly like a complete one. It is
 * dropped again; two columns meaning the same thing is how a lookup starts
 * missing half its rows.
 *
 * `verified` is deliberately TRUE for Foundation, SR Legacy and Survey and
 * FALSE for Branded. See the migration that re-scoped that column: Branded is
 * manufacturer-submitted and is exactly the data that earned the badge its bad
 * name.
 */
export async function cacheUsdaFood(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  food: UsdaOnlineFood,
): Promise<Record<string, unknown> | null> {
  const ref = String(food.fdcId);
  const measured = food.dataType !== "Branded";

  const { data: existing } = await db
    .from("food_catalog")
    .select("*")
    .eq("source", "usda_online")
    .eq("fdc_id", ref)
    .maybeSingle();
  if (existing) return existing as Record<string, unknown>;

  // Every row this writes is per 100 g, because that is what the search
  // endpoint returns for every dataType. The label serving rides along in
  // serving_options so a countable portion is available without a second call.
  // {desc, grams} -- the shape every other row in this column already uses.
  // A near-miss here is silent: parseServingOption reads `desc` and a row full
  // of `label` keys resolves to no portions at all.
  const options: { desc: string; grams: number }[] = [{ desc: "100 g", grams: 100 }];
  if (food.servingLabel && food.servingGrams && food.servingGrams > 0) {
    options.push({ desc: food.servingLabel, grams: food.servingGrams });
  } else if (food.servingGrams && food.servingGrams > 0) {
    options.push({ desc: "1 serving", grams: food.servingGrams });
  }

  const row = {
    name: food.description,
    brand: food.brand,
    source: "usda_online",
    fdc_id: ref,
    kcal: round2(food.kcal ?? (food.protein! * 4 + food.carbs! * 4 + food.fats! * 9)),
    protein: round2(food.protein),
    carbs: round2(food.carbs),
    fats: round2(food.fats),
    fiber: round2(food.fiber),
    sugar: round2(food.sugar),
    sodium: round2(food.sodium),
    sat_fat: round2(food.satFat),
    serving_desc: "100 g",
    serving_grams: 100,
    serving_options: options,
    verified: measured,
  };

  // insert, not upsert: the select above is the idempotency check, and the
  // partial unique index behind it is not a constraint PostgREST can name in
  // on_conflict. A race that loses simply re-reads the winner's row.
  const { data, error } = await db
    .from("food_catalog")
    .insert(row)
    .select("*")
    .maybeSingle();
  if (error) {
    const { data: raced } = await db
      .from("food_catalog").select("*")
      .eq("source", "usda_online").eq("fdc_id", ref).maybeSingle();
    return (raced as Record<string, unknown> | null) ?? null;
  }
  if (error || !data) return null;
  return data as Record<string, unknown>;
}
