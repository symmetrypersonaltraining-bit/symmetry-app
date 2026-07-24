// Open Food Facts → food_catalog mapping. Pure & offline-testable (no network,
// no DB): the /api/nutrition-ai/barcode-lookup route does the fetch + insert
// around this. Output matches the existing source='off' rows already in the
// catalog: per-100g macros, sodium in milligrams, serving_options starting with
// [100 g, 1 oz] plus the product's own serving size when OFF provides one.

export interface ServingOption {
  desc: string;
  grams: number;
}

export interface OffCatalogRow {
  name: string;
  brand: string | null;
  barcode: string;
  source: "off";
  verified: false;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null; // milligrams per 100 g
  sat_fat: number | null; // grams per 100 g
  serving_desc: string;
  serving_grams: number;
  serving_options: ServingOption[];
}

export interface OffProductJson {
  status?: number;
  product?: Record<string, unknown>;
}

function num(v: unknown): number | null {
  const x = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(x) ? x : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Map an OFF API v2 product response into a food_catalog insert row.
 * Returns null when the product is absent (status 0 / missing) or has no
 * usable name — the route turns that into a "not found, add custom" offer.
 * All macros are per 100 g.
 */
export function mapOffProduct(json: OffProductJson | null | undefined, barcode: string): OffCatalogRow | null {
  if (!json || json.status === 0 || !json.product) return null;
  const p = json.product;
  const nut = (p.nutriments as Record<string, unknown>) || {};

  const name = str(p.product_name) || str(p.product_name_en) || str(p.generic_name);
  if (!name) return null;

  const brand = str(p.brands).split(",")[0].trim() || null;

  // Calories per 100 g — prefer the kcal field, else convert kJ (energy_100g).
  let kcal = num(nut["energy-kcal_100g"]);
  if (kcal == null) {
    const kj = num(nut["energy_100g"]);
    if (kj != null) kcal = Math.round(kj / 4.184);
  }

  // OFF stores sodium in grams; the catalog stores milligrams.
  const sodiumG = num(nut["sodium_100g"]);
  const sodium = sodiumG != null ? Math.round(sodiumG * 1000) : null;

  const serving_options: ServingOption[] = [
    { desc: "100 g", grams: 100 },
    { desc: "1 oz", grams: 28.35 },
  ];
  const servingDesc = str(p.serving_size);
  const servingQty = num(p.serving_quantity);
  if (servingDesc && servingQty != null && servingQty > 0) {
    serving_options.push({ desc: servingDesc, grams: servingQty });
  }

  return {
    name,
    brand,
    barcode,
    source: "off",
    verified: false,
    kcal: kcal ?? 0,
    protein: num(nut["proteins_100g"]) ?? 0,
    carbs: num(nut["carbohydrates_100g"]) ?? 0,
    fats: num(nut["fat_100g"]) ?? 0,
    fiber: num(nut["fiber_100g"]),
    sugar: num(nut["sugars_100g"]),
    sodium,
    sat_fat: num(nut["saturated-fat_100g"]),
    serving_desc: "100 g",
    serving_grams: 100,
    serving_options,
  };
}
