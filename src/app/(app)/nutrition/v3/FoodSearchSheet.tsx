"use client";

// Nutrition v3 — food_catalog search sheet: instant search, serving picker,
// qty steppers, verified badges, create-custom-food (source='client').
// Falls back to the legacy `foods` table if food_catalog isn't reachable yet.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CustomItem, kcalOf } from "@/lib/nutrition/dailyTotals";
import {
  NutrientMap,
  countKnownNutrients,
  formatNutrient,
  groupedNutrients,
  hasAnyNutrient,
  pctOfDaily,
  readNutrients,
  scaleNutrients,
} from "@/lib/nutrition/nutrients";
import { parseServing, servingsFor, unitsForServing } from "@/lib/units";
import { namedServings, multiplierForNamed, defaultAmountFor, type NamedServing } from "@/lib/servingOptions";
import Sheet from "./Sheet";
import BarcodeScanner from "./BarcodeScanner";

export interface CatalogFood {
  id: string;
  name: string;
  brand?: string | null;
  serving: string | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  kcal?: number | null;
  verified?: boolean | null;
  /**
   * Carried so a correction can keep it. Editing a scanned food saves the
   * client's own row WITH the barcode, so the next scan of that product finds
   * their corrected version rather than the wrong one again.
   */
  barcode?: string | null;
  source?: string | null; // usda | brand | restaurant | client | ...
  client_id?: string | null;
  // food_catalog has carried these since the OFF/USDA import and nothing ever
  // read them. Sodium in mg, the rest in g. null = the source did not publish
  // it, which has to stay distinct from zero all the way to the day total.
  fiber?: number | null;
  sugar?: number | null;
  sodium?: number | null;
  sat_fat?: number | null;
  /**
   * The full registry — all 33 nutrients, from food_catalog.micros.
   *
   * This sheet already carried the four legacy columns above and took real care
   * scaling them ("0.4 of an unknown sodium is still unknown"). It never read
   * `micros`, so the other 29 were dropped on the floor at the moment of
   * logging: a food with a complete lab-measured panel in the catalog became a
   * food with four nutrients the instant a client added it, and the day total
   * understated itself with nothing on screen to say so.
   *
   * The item shape already had somewhere to put them — CustomItem.mi, written
   * by the AI path and read by the registry. Only this sheet never filled it.
   */
  micros?: NutrientMap | null;
  /**
   * What ONE of this food weighs, per unit it actually comes in — "egg", 44 g.
   * From food_catalog.serving_options, which the sheet already fetched with
   * select("*") and mapRow simply dropped. Empty for the legacy `foods` table.
   */
  named: NamedServing[];
  /** food_catalog.serving_grams — what the stored macros are per. */
  baseGrams: number | null;
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0; }

// Unlike n(), this keeps "missing" as null instead of collapsing it to 0.
function nOrNull(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
}

function mapRow(raw: Record<string, unknown>, fromCatalog: boolean): CatalogFood {
  return {
    id: raw.id != null ? String(raw.id) : "",
    name: String(raw.name ?? raw.food ?? ""),
    brand: (raw.brand as string) ?? null,
    // food_catalog uses serving_desc; the legacy foods table uses serving.
    serving: (raw.serving_desc ?? raw.serving ?? raw.serving_size ?? null) as string | null,
    protein: n(raw.protein ?? raw.protein_g),
    carbs: n(raw.carbs ?? raw.carbs_g),
    fats: n(raw.fats ?? raw.fat ?? raw.fat_g),
    kcal: raw.kcal != null || raw.calories != null ? n(raw.kcal ?? raw.calories) : null,
    verified: (raw.verified as boolean) ?? null,
    barcode: (raw.barcode as string) ?? null,
    source: (raw.source as string) ?? (fromCatalog ? null : "foods"),
    client_id: (raw.created_by_client_id as string) ?? (raw.client_id as string) ?? null,
    // The legacy `foods` table has no nutrient columns at all, so these stay
    // null for those rows rather than reading as zero.
    fiber: nOrNull(raw.fiber),
    sugar: nOrNull(raw.sugar),
    sodium: nOrNull(raw.sodium),
    sat_fat: nOrNull(raw.sat_fat),
    // readNutrients merges the jsonb bag with the four legacy columns, so a row
    // that has only the legacy four still produces a valid four-entry map and a
    // row with a full panel produces all of it. One reader, one shape.
    micros: readNutrients(raw.micros, raw as Record<string, unknown>),
    // Dustin, 17 Aug: "I need to be able to adjust it by unit of measurements.
    // for exp 1 egg, 2 eggs etc." His HARD BOILED EGGS row has carried
    // {desc: "1 EGG (44 g)", grams: 44} the whole time; nothing read it.
    named: namedServings(raw.serving_options),
    baseGrams: nOrNull(raw.serving_grams),
  };
}

export default function FoodSearchSheet({
  clientId,
  title,
  subtitle,
  onPick,
  onClose,
  onBack,
}: {
  clientId: string;
  title: string;
  subtitle?: string;
  onPick: (item: CustomItem) => void;
  onClose: () => void;
  onBack?: () => void;
}) {
  const supabase = createClient();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [results, setResults] = useState<CatalogFood[]>([]);
  const [picked, setPicked] = useState<CatalogFood | null>(null);
  // Collapsed by default. The four headline nutrients are on screen either way;
  // this opens the rest. Resets whenever a different food is picked.
  const [showNutrients, setShowNutrients] = useState(false);
  // Feedback b534996d / f949f793: the serving picker used to be a ±0.25 stepper
  // over WHOLE servings, so a food stored as "25 g" (chili crisp oil) couldn't
  // be logged at 5 g. Now you TYPE the amount and pick the UNIT — grams, oz,
  // tsp, whatever is dimensionally compatible with the food's base serving —
  // and the multiplier is derived with servingsFor(). Same engine the legacy
  // meal-plan adjust-amounts sheet already uses, so both paths agree.
  const [amt, setAmt] = useState("1");
  const [unit, setUnit] = useState("serving");
  const [creating, setCreating] = useState(false);
  const [cf, setCf] = useState({ name: "", serving: "1 serving", p: "", c: "", f: "" });
  /**
   * What the row being CORRECTED already knew, kept so the correction does not
   * throw it away. Null when the food is being typed from scratch, in which
   * case there is nothing to keep.
   */
  const [carry, setCarry] = useState<{
    baseGrams: number | null;
    options: { desc: string; grams: number }[] | null;
    fiber: number | null; sugar: number | null; sodium: number | null; sat_fat: number | null;
    micros: Record<string, number | null> | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const catalogOk = useRef<boolean | null>(null);
  // Barcode scanning: scanner overlay, in-flight lookup, and the miss panel.
  const [scanning, setScanning] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanStage, setScanStage] = useState<{ barcode: string; stage: "off-miss" } | null>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    const t = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 2 && tab === "all") { if (on) setResults([]); return; }
      // RANKED, via search_food_catalog. See that function for why.
      //
      // This used to be `.ilike("%term%").limit(10)` with no order at all — on
      // 574,636 rows Postgres returns whichever ten it finds first, so
      // "chicken breast" put "Chicken breast with ginger soy sauce" at the top
      // and the plain one sixth, and a vaguer search dropped it off the list
      // entirely. That is the whole of "it's not picking up the most basic of
      // foods": the row was always there, nothing had an opinion about which
      // one was meant.
      //
      // The function ranks by their own saved foods, then exact/prefix/word
      // match, then verified, then whether the calories agree with the macros —
      // which keeps a 653-kcal "chicken breast" out of first place. 25 rather
      // than 10 because ranked results are worth scrolling.
      let rows: CatalogFood[] = [];
      if (catalogOk.current !== false) {
        try {
          const { data, error } = await supabase.rpc("search_food_catalog", {
            p_term: term,
            p_client_id: clientId || null,
            p_limit: 25,
            p_mine_only: tab === "mine",
          });
          if (error) throw error;
          catalogOk.current = true;
          rows = ((data as Record<string, unknown>[]) || []).map((r) => mapRow(r, true));
        } catch {
          catalogOk.current = false;
        }
      }
      if (catalogOk.current === false && term.length >= 2) {
        const { data } = await supabase.from("foods").select("*").ilike("name", "%" + term + "%").limit(10);
        rows = ((data as Record<string, unknown>[]) || []).map((r) => mapRow(r, false));
      }
      if (on) setResults(rows);
    }, 200);
    return () => { on = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab]);

  /**
   * A BADGE ON 96% OF ROWS IS NOT A BADGE, IT IS WALLPAPER.
   *
   * Dustin, 31 Aug: "why does everything say unverified?"
   *
   * Because almost everything is. 21,776 of 574,664 rows carry verified — 3.8%.
   * The other 552,888 came from Open Food Facts, so an amber UNVERIFIED sat on
   * essentially every result he ever saw. Amber reads as a warning; a warning on
   * every row is one he has to learn to ignore, and once he has learned that, it
   * cannot warn him about anything.
   *
   * The 3.8% is the useful signal, so that is the one that gets said out loud.
   * The rest carry their source quietly — where the numbers came from, in grey,
   * as information rather than an alarm.
   */
  function badge(f: CatalogFood) {
    if (f.source === "client" || f.client_id === clientId)
      return <span style={{ color: "#42A5F5", fontSize: 9, fontWeight: 800 }}>MY FOOD</span>;
    if (f.verified) return <span style={{ color: "#22c55e", fontSize: 9, fontWeight: 800 }}>✓ USDA</span>;
    // Not a warning. Just where it came from, for anyone who wants to know.
    return <span style={{ color: "var(--brand-text-secondary)", fontSize: 9, fontWeight: 700, opacity: 0.75 }}>community</span>;
  }

  // Open the amount picker for a food, seeded with its own base serving so the
  // default ("25 g") is what the trainer wrote — then it's freely editable.
  function openPicked(f: CatalogFood) {
    const ps = parseServing(f.serving);
    setPicked(f);
    setShowNutrients(false);
    // "100 g" is how the macros are STORED, not how anyone eats. When the food
    // knows what one of itself weighs, open on one of those — Dustin, 17 Aug,
    // opening HARD BOILED EGGS and being offered a hundred grams of egg.
    const better = defaultAmountFor(f.serving, f.named, f.baseGrams);
    setAmt(String(better ? better.amount : ps.amount));
    setUnit(better ? better.unit : ps.unit);
  }

  // Step size that suits the unit: 5 for g/ml (nobody nudges oil by 0.25 g),
  // 0.1 for the big mass/volume units, 0.25 for counts and servings.
  function stepFor(u: string): number {
    const k = u.toLowerCase();
    // You eat whole eggs. Nudging a count by 0.25 is the stepper being clever
    // at the client's expense.
    if (picked && picked.named.some((x) => x.label === k)) return 1;
    if (k === "g" || k === "ml") return 5;
    if (k === "mg") return 50;
    if (k === "kg" || k === "lb" || k === "l") return 0.1;
    return 0.25;
  }

  const amtNum = (() => { const x = parseFloat(amt); return isFinite(x) && x > 0 ? x : 0; })();
  // A named unit is not dimensionally derivable from the base serving string —
  // nothing about "100 g" says an egg weighs 44 — so it is resolved against the
  // food's own serving_options first, and only then handed to servingsFor().
  const namedMult = picked ? multiplierForNamed(amtNum, unit, picked.named, picked.baseGrams) : null;
  const mult = namedMult ?? (picked ? servingsFor(amtNum, unit, picked.serving) : 0);
  // Named units first: "egg" is what he came here to pick, and burying it under
  // six masses is most of why he could not find it.
  const unitOptions = picked
    ? [...picked.named.filter((x) => picked.baseGrams).map((x) => x.label), ...unitsForServing(picked.serving)]
        .filter((u, i, a) => a.indexOf(u) === i)
    : ["serving"];

  function bumpAmt(dir: 1 | -1) {
    const s = stepFor(unit);
    const next = Math.round(((amtNum || 0) + dir * s) * 1000) / 1000;
    setAmt(String(Math.max(s, next)));
  }

  // ── SWITCHING A UNIT MUST NOT CHANGE THE FOOD ─────────────────────────────
  //
  // Dustin, 28 Aug, on the database sheet: cream cheese reading
  //
  //     100  [ serving v ]        100 serving · P714 C357 F3571 · 35714 cal
  //
  // Thirty-five thousand calories. Ten kilograms of cream cheese.
  //
  // It opened correctly on "100 g" — the row's own base — and he tapped the
  // unit dropdown and chose "serving", which is offered on every food. That is
  // an entirely reasonable thing to tap. But "serving" HAS no dimension that
  // the mass converter understands, so the conversion quietly failed, the
  // number stayed at 100, and its meaning changed underneath it: 100 servings
  // of a food whose serving IS 100 g. A hundredfold, in one tap, silently.
  //
  // The base serving is the missing link and the row carries it. One serving of
  // this food is `baseGrams`, so grams and servings convert both ways, and the
  // quantity survives the switch: 100 g becomes 1 serving, not 100 of them.
  function changeUnit(next: string) {
    if (next === unit) { setUnit(next); return; }

    /** What one of a NAMED portion weighs ("egg" -> 44), else null. */
    const gramsPer = (u: string) => picked?.named.find((x) => x.label === u)?.gramsPerUnit ?? null;
    const base = picked?.baseGrams && isFinite(picked.baseGrams) && picked.baseGrams > 0 ? picked.baseGrams : null;

    /** The current quantity, in grams. Null when this unit has no weight. */
    const toG = (amount: number, u: string): number | null => {
      if (!(amount > 0)) return null;
      if (u === "serving") return base != null ? amount * base : null;
      const per = gramsPer(u);
      if (per) return amount * per;
      const g = servingsFor(amount, u, "1 g");     // mass units convert here
      return isFinite(g) && g > 0 ? g : null;
    };

    /** Grams back out into the requested unit. */
    const fromG = (grams: number, u: string): number | null => {
      if (u === "serving") return base != null ? grams / base : null;
      const per = gramsPer(u);
      if (per) return grams / per;
      const out = servingsFor(grams, "g", `1 ${u}`);
      return isFinite(out) && out > 0 ? out : null;
    };

    const grams = toG(amtNum, unit);
    const out = grams != null ? fromG(grams, next) : null;
    if (out != null && isFinite(out) && out > 0) {
      setAmt(String(Math.round(out * 1000) / 1000));
      setUnit(next);
      return;
    }

    // NO HONEST CONVERSION EXISTS between these two. Rather than leave the old
    // number sitting under a unit that now means something else — which is the
    // whole bug above — reset to one of the new unit. One is always true.
    setAmt("1");
    setUnit(next);
  }

  function pickItem(f: CatalogFood, m: number) {
    const p = n(f.protein) * m, c = n(f.carbs) * m, ft = n(f.fats) * m;
    // Label the item in the units the client actually entered ("5 g"), not as a
    // fraction of a serving ("0.2 × 25 g") — that's what they'll recognise later.
    const label = amtNum > 0 ? `${amtNum} ${unit}` : `${m} × ${f.serving || "serving"}`;
    // Nutrients scale by the same multiplier as the macros. null stays null —
    // 0.4 of an unknown sodium is still unknown, and writing 0 here would make
    // the day total silently understate itself with no way to tell.
    const scale = (v: number | null | undefined) => (v == null ? null : Math.round(v * m * 100) / 100);
    onPick({
      n: f.name,
      a: label,
      p, c, f: ft,
      k: f.kcal != null ? n(f.kcal) * m : kcalOf(p, c, ft),
      db: !!f.verified,
      food_id: f.id,
      fac: 1,
      fi: scale(f.fiber),
      su: scale(f.sugar),
      so: f.sodium == null ? null : Math.round(f.sodium * m),
      sf: scale(f.sat_fat),
      // The other 29, scaled by the same multiplier. scaleNutrients keeps null
      // as null for exactly the reason above. Without this line a food with a
      // full lab-measured panel in the catalog became a four-nutrient food the
      // moment it was logged, and the day total quietly understated itself.
      mi: f.micros && hasAnyNutrient(f.micros) ? scaleNutrients(f.micros, m) : null,
    });
  }

  // A barcode was scanned (or typed in the fallback). Stop the scanner, then
  // look it up by EXACT barcode in food_catalog. Hit → straight to the serving
  // picker; miss → offer the server-side Open Food Facts lookup.
  async function handleBarcode(code: string) {
    const barcode = code.replace(/\D/g, "");
    setScanning(false);
    if (barcode.length < 6) return;
    setScanStage(null);
    setScanBusy(true);
    try {
      // THEIR correction first, the shared row second.
      //
      // Since 20 Aug a client can save their own version of a scanned product
      // (see editPicked). Ordering by created_by_client_id descending puts a
      // row with an owner ahead of the shared one, and the .eq on client scopes
      // it to theirs — so a food they have already fixed never comes back wrong.
      const { data } = await supabase
        .from("food_catalog")
        .select("*")
        .eq("barcode", barcode)
        .or(`created_by_client_id.eq.${clientId},created_by_client_id.is.null`)
        .order("created_by_client_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        openPicked(mapRow(data as Record<string, unknown>, true));
        setScanBusy(false);
        return;
      }
    } catch { /* fall through to the OFF lookup */ }
    // NOT IN OUR CATALOG → JUST GO AND LOOK IT UP.
    //
    // This used to stop here and ask "Not in our database yet — want us to look
    // it up?" with a button. Dustin, 24 Aug, having scanned a real product and
    // been shown that screen: "barcode scan not working."
    //
    // He is right that it reads as a failure. Somebody who has just held a
    // phone up to a packet has already said what they want; the question adds a
    // tap, and phrases a routine cache miss as though something went wrong.
    // The lookup is a second and costs nothing, so it just runs. The only
    // screen left is the one for a barcode Open Food Facts has never heard of
    // either, which is a real dead end and does need a decision.
    await lookUpBarcode(barcode);
  }

  // Server-side Open Food Facts lookup (the route has open egress + inserts the
  // hit into food_catalog). Found → serving picker; missed → offer custom food.
  async function lookUpBarcode(barcode: string) {
    setScanStage(null);
    setScanBusy(true);
    try {
      const res = await fetch("/api/nutrition-ai/barcode-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode, clientId }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.found && json?.food) {
        setScanStage(null);
        openPicked(mapRow(json.food as Record<string, unknown>, true));
        setScanBusy(false);
        return;
      }
    } catch { /* network/route error → treat as a miss, offer custom food */ }
    setScanBusy(false);
    setScanStage({ barcode, stage: "off-miss" });
  }

  function startCustomFromBarcode(barcode: string) {
    setPendingBarcode(barcode);
    setScanStage(null);
    setCf({ name: "", serving: "1 serving", p: "", c: "", f: "" });
    setCreating(true);
  }

  /**
   * FIX THE NUMBERS ON A FOOD THAT IS ALREADY IN THE CATALOG.
   *
   * app_feedback 2026-08-17, client app, /nutrition: "Need to be able to edit
   * scanned barcode foods."
   *
   * A scan resolves straight to the amount picker, where you can change how
   * MUCH but not what it says the food contains. Most of the catalog is Open
   * Food Facts — 574,632 rows, crowd-entered — so wrong macros on a scanned
   * product are common and there was no way to correct one.
   *
   * The correction goes through the custom-food path that already exists,
   * pre-filled from what was scanned, so it is SAVED rather than applied once:
   * the next scan of that barcode finds their corrected version first. It keeps
   * the barcode, which is what makes that true.
   *
   * Their row, not the shared one. Correcting a Quest bar must not rewrite it
   * for all thirty clients — the same rule that stopped a shared meal being
   * deleted from one person's list on 17 Aug.
   */
  function editPicked() {
    if (!picked) return;
    setPendingBarcode(picked.barcode ?? null);
    // CORRECTING THE MACROS MUST NOT DESTROY THE REST OF THE ROW.
    //
    // This form collects a name, a serving and three macros, and saveCustomFood
    // wrote exactly those. So fixing a scanned product's protein also stripped
    // its gram weight, its serving options and every nutrient the Open Food
    // Facts import had given it -- the correction left the food WORSE than the
    // row it was correcting, and un-re-portionable for good.
    setCarry({
      baseGrams: picked.baseGrams ?? null,
      // Back to the shape the column stores. mapRow parses serving_options
      // into {label, gramsPerUnit}; the row holds {desc, grams}.
      options: picked.named && picked.named.length
        ? picked.named.map((n) => ({ desc: n.label, grams: n.gramsPerUnit }))
        : null,
      fiber: picked.fiber ?? null, sugar: picked.sugar ?? null,
      sodium: picked.sodium ?? null, sat_fat: picked.sat_fat ?? null,
      micros: picked.micros && hasAnyNutrient(picked.micros) ? picked.micros : null,
    });
    setCf({
      name: picked.name || "",
      // The base serving, not the amount currently dialled in — the numbers
      // being corrected are per-serving, and mixing the two is how a "2 Tbsp
      // (30 g)" food ends up doubled.
      serving: picked.serving || "1 serving",
      p: picked.protein == null ? "" : String(picked.protein),
      c: picked.carbs == null ? "" : String(picked.carbs),
      f: picked.fats == null ? "" : String(picked.fats),
    });
    setPicked(null);
    setCreating(true);
  }

  // Save a food you typed yourself, then hand it to the SAME amount picker every
  // searched food goes through.
  //
  // Jerry, 2026-07-31: "When u add a custom food and change the serving size the
  // macros dont change." He is exactly right, and the catalog caught him proving
  // it — two "Ultra Beer" rows 61 seconds apart, serving_desc "1 serving" then
  // "10 servings", macros byte-identical both times. This screen treated the
  // serving box as a LABEL: it was written to the row, printed on the item, and
  // never multiplied by anything. Meanwhile the search path has had working
  // amount/unit scaling since 7/17.
  //
  // So the typed serving now becomes the food's BASE serving and the picker
  // opens on top of it — type the macros for one slice, then say you had three.
  // No new arithmetic: servingsFor()/pickItem() already do all of it.
  async function saveCustomFood() {
    const p = parseFloat(cf.p) || 0, c = parseFloat(cf.c) || 0, f = parseFloat(cf.f) || 0;
    if (!cf.name.trim() || p + c + f === 0) return;
    const serving = cf.serving || "1 serving";
    // "30 g", "2 Tbsp (30 g)", "1 slice (28g)" all name a mass. Anything else
    // does not, and guessing one would be worse than leaving it unset.
    const gramMatch = serving.match(/([\d.]+)\s*g\b/i);
    const baseGrams = gramMatch ? Number(gramMatch[1]) : (carry?.baseGrams ?? null);
    const servingOptions =
      carry?.options ??
      (baseGrams != null ? [{ desc: serving, grams: baseGrams }] : null);
    setBusy(true);
    let id: string | null = null;
    setSaveWarning(null);
    let saved: Record<string, unknown> | null = null;
    try {
      const { data, error: insErr } = await supabase
        .from("food_catalog")
        .insert({
          created_by_client_id: clientId,
          name: cf.name.trim(),
          serving_desc: serving,
          kcal: kcalOf(p, c, f),
          protein: p, carbs: c, fats: f,
          source: "client",
          verified: false,
          // A FOOD WITH NO GRAM WEIGHT CAN ONLY EVER BE LOGGED IN ITSELF.
          //
          // serving_grams is what mapRow reads into baseGrams; without it
          // multiplierForNamed returns null, the unit list collapses to the one
          // typed serving, and the serving-to-gram bridge has no base, so a
          // food entered as "1 slice" is a food you can only ever have in
          // slices. Parsed from the typed serving when it names a mass, else
          // inherited from the row being corrected.
          ...(baseGrams != null ? { serving_grams: baseGrams } : {}),
          // At minimum the base serving itself, so the picker has something to
          // offer besides "1 serving".
          ...(servingOptions ? { serving_options: servingOptions } : {}),
          // Carried through a correction rather than blanked. null stays null:
          // an unknown sodium is a different fact from zero, all the way to the
          // day total.
          ...(carry?.fiber != null ? { fiber: carry.fiber } : {}),
          ...(carry?.sugar != null ? { sugar: carry.sugar } : {}),
          ...(carry?.sodium != null ? { sodium: carry.sodium } : {}),
          ...(carry?.sat_fat != null ? { sat_fat: carry.sat_fat } : {}),
          ...(carry?.micros ? { micros: carry.micros } : {}),
          ...(pendingBarcode ? { barcode: pendingBarcode } : {}),
        })
        .select()
        .single();
      // supabase-js resolves {data, error} rather than throwing, so this catch
      // never fired for a refusal — a duplicate barcode, an RLS denial, a
      // constraint. The food was logged locally and the client believed it was
      // saved to their catalog. It was not, and the next scan brought back the
      // same wrong numbers.
      if (insErr) throw insErr;
      saved = (data as Record<string, unknown> | null) ?? null;
      id = (data as { id?: string } | null)?.id ?? null;
    } catch (e) {
      // Still log the item locally — losing the entry as well would be worse —
      // but do not pretend it was saved.
      console.error("saveCustomFood", e);
      setSaveWarning("Logged for today, but couldn't save it to your foods.");
    }
    setBusy(false);
    setPendingBarcode(null);
    if (saved && id) {
      setCreating(false);
      setCf({ name: "", serving: "1 serving", p: "", c: "", f: "" });
      setCarry(null);
      openPicked(mapRow(saved, true));
      return;
    }
    // Catalog write failed — log it at face value rather than losing what they
    // typed. One serving of exactly what they entered, which is what the old
    // path always did.
    onPick({ n: cf.name.trim(), a: cf.serving || "1 serving", p, c, f, k: kcalOf(p, c, f), food_id: id, fac: 1 });
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)",
    borderRadius: 12, padding: "10px 12px", fontSize: 13, width: "100%", outline: "none",
  };

  return (
    <>
    <Sheet title={title} subtitle={subtitle || "Instant results as you type"} onClose={onClose} onBack={onBack}>
      {!picked && !creating && !scanStage && !scanBusy && (
        <>
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); }}
              placeholder='Search foods… try "chicken" or "oikos"'
              style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            />
            <button
              onClick={() => setScanning(true)}
              aria-label="Scan barcode"
              title="Scan barcode"
              className="flex items-center justify-center flex-shrink-0"
              style={{ width: 44, height: 44, borderRadius: 12, background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-primary)" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 5v14M6 5v14M9.5 5v14M13 5v14M16 5v14M18.5 5v14M21 5v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="flex gap-1.5 mt-2 mb-2">
            {(["all", "mine"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={tab === t ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                {t === "all" ? "All foods" : "My foods"}
              </button>
            ))}
          </div>
          {results.map((f) => (
            <button key={f.id} onClick={() => openPicked(f)}
              className="w-full flex items-center justify-between py-2.5 text-left"
              style={{ borderBottom: "1px solid var(--brand-border)" }}>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>
                  {f.name} {badge(f)}
                </p>
                <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  {(f.brand ? f.brand + " · " : "")}{f.serving || "1 serving"} · P{Math.round(n(f.protein))} C{Math.round(n(f.carbs))} F{Math.round(n(f.fats))} · {f.kcal != null ? Math.round(n(f.kcal)) : kcalOf(n(f.protein), n(f.carbs), n(f.fats))} cal
                </p>
              </div>
              <span style={{ color: "var(--brand-text-secondary)" }}>›</span>
            </button>
          ))}
          {q.trim().length >= 2 && results.length === 0 && (
            <p className="text-sm py-3 text-center" style={{ color: "var(--brand-text-secondary)" }}>
              No matches — create it as a custom food below.
            </p>
          )}
          <button onClick={() => { setCreating(true); setCf({ ...cf, name: q.trim() }); }}
            className="w-full mt-3 py-3 rounded-2xl text-sm font-bold"
            style={{ border: "1px dashed var(--brand-border)", color: "var(--brand-primary)", background: "transparent" }}>
            ＋ Create custom food
          </button>
        </>
      )}

      {scanBusy && (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Looking up barcode…</p>
          <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>One moment</p>
        </div>
      )}

      {scanStage && !scanBusy && (
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>Barcode {scanStage.barcode}</p>
          {/* Only ONE dead end is left. The catalog-miss branch used to sit here
              too, asking "want us to look it up?" — a tap in front of something
              that always happens and always works, phrased as a fault. It runs
              on its own now, and this screen is reached only when Open Food
              Facts has never heard of the barcode either, which is a real
              decision: type the numbers off the packet, or give up. */}
          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            We couldn&apos;t find this product anywhere — not in ours and not in Open Food
            Facts. Add it once and it is yours from then on.
          </p>
          <button onClick={() => startCustomFromBarcode(scanStage.barcode)} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>
            Add it as a custom food
          </button>
          <button onClick={() => setScanning(true)} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)", background: "transparent" }}>
            Scan again
          </button>
          <button onClick={() => setScanStage(null)} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            ‹ Back to search
          </button>
        </div>
      )}

      {picked && (
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{picked.name} {badge(picked)}</p>
          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            {(picked.brand ? picked.brand + " · " : "")}base: {picked.serving || "1 serving"}
          </p>
          <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>How much?</p>
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => bumpAmt(-1)} aria-label="Less" className="w-11 h-11 rounded-xl font-bold text-lg flex-shrink-0" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>−</button>
            <input
              value={amt}
              onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              aria-label="Amount"
              style={{ ...inputStyle, flex: 1, minWidth: 0, textAlign: "center", fontSize: 18, fontWeight: 800, padding: "10px 8px" }}
            />
            <select
              value={unit}
              onChange={(e) => changeUnit(e.target.value)}
              aria-label="Unit"
              style={{ ...inputStyle, width: "auto", flex: "0 0 auto", fontWeight: 700, padding: "12px 10px" }}
            >
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            <button onClick={() => bumpAmt(1)} aria-label="More" className="w-11 h-11 rounded-xl font-bold text-lg flex-shrink-0" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>＋</button>
          </div>
          <p className="text-center text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            {amtNum > 0 ? `${amtNum} ${unit}` : "—"} · P{Math.round(n(picked.protein) * mult)} C{Math.round(n(picked.carbs) * mult)} F{Math.round(n(picked.fats) * mult)} · {picked.kcal != null ? Math.round(n(picked.kcal) * mult) : kcalOf(n(picked.protein) * mult, n(picked.carbs) * mult, n(picked.fats) * mult)} cal
          </p>
          {/*
            Nutrients for THIS portion, before you commit to it.
            Dustin's feedback, 4 Aug: micronutrients everywhere in the food
            logger. The day total already had them; below the day level there
            was nothing, even though this sheet was already carrying and
            correctly scaling the data.
            Everything here comes from the shared registry — groupedNutrients,
            formatNutrient, pctOfDaily. No formatter is written locally, because
            a second copy of that logic is exactly what produced a duplicate
            nutrient panel on 15 Aug that had to be reverted.
          */}
          {(() => {
            const scaled = picked.micros ? scaleNutrients(picked.micros, mult) : null;
            const known = countKnownNutrients(scaled);
            if (!scaled || known === 0) {
              // Said out loud rather than shown as a row of dashes. "We don't
              // know" and "it contains none" are different facts, and a client
              // deciding between two foods deserves to be told which this is.
              return (
                <p className="text-center text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
                  No nutrient detail published for this food.
                </p>
              );
            }
            const groups = groupedNutrients(scaled).map((g) => ({
              ...g,
              rows: g.rows.filter((r) => r.value != null),
            })).filter((g) => g.rows.length > 0);
            return (
              <div className="mb-3">
                <button
                  onClick={() => setShowNutrients((v) => !v)}
                  aria-expanded={showNutrients}
                  className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
                  style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}
                >
                  {showNutrients ? "Hide" : "Show"} nutrients ({known})
                </button>
                {showNutrients && (
                  <div className="mt-2">
                    {groups.map((g) => (
                      <div key={g.group} className="mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>
                          {g.label}
                        </p>
                        {g.rows.map((r) => {
                          const pct = pctOfDaily(r.def.key, r.value);
                          return (
                            <div key={r.def.key} className="flex items-baseline justify-between text-xs py-0.5">
                              <span style={{ color: "var(--brand-text)" }}>{r.def.label}</span>
                              <span style={{ color: "var(--brand-text-secondary)" }}>
                                {formatNutrient(r.def.key, r.value)}
                                {/* Rounded. pctOfDaily returns full precision
                                    and this printed it raw, so a food with
                                    0.9 mg of thiamin read "75.83333333333334%"
                                    on the client's phone. The day panel's
                                    nutrientRow has always rounded; this site
                                    was copied without it. */}
                                {pct != null && <span className="ml-2 opacity-70">{Math.round(pct)}%</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                    <p className="text-[10px] mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                      Percentages are of a general daily reference, not your targets.
                      Only nutrients this food publishes are listed.
                    </p>
                  </div>
                )}
              </div>
            );
          })()}
          <button onClick={() => pickItem(picked, mult)} disabled={amtNum <= 0} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: amtNum > 0 ? 1 : 0.5 }}>
            Add it ✓
          </button>
          <button onClick={editPicked} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            These numbers look wrong — fix them
          </button>
          <button onClick={() => setPicked(null)} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            ‹ Back to search
          </button>
        </div>
      )}

      {creating && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>
            {pendingBarcode ? "Fix these numbers — saved as your own copy" : "Create custom food — saved to your catalog"}
          </p>
          {saveWarning && (
            <p className="text-xs mb-2" style={{ color: "#f59e0b" }}>{saveWarning}</p>
          )}
          <input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} placeholder="Food name — e.g. Mom's meatloaf" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={cf.serving} onChange={(e) => setCf({ ...cf, serving: e.target.value })} placeholder="Serving — e.g. 1 slice" style={{ ...inputStyle, marginBottom: 8 }} />
          <div className="grid grid-cols-3 gap-2">
            {([["p", "Protein g"], ["c", "Carbs g"], ["f", "Fats g"]] as ["p" | "c" | "f", string][]).map(([k, lab]) => (
              <input key={k} value={cf[k]} onChange={(e) => setCf({ ...cf, [k]: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" placeholder={lab} style={{ ...inputStyle, textAlign: "center" }} />
            ))}
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "var(--brand-text-secondary)" }}>
            = {kcalOf(parseFloat(cf.p) || 0, parseFloat(cf.c) || 0, parseFloat(cf.f) || 0)} cal per {cf.serving.trim() || "1 serving"}
            <br />
            <span style={{ opacity: 0.8 }}>You&apos;ll pick how much you had next.</span>
          </p>
          <button onClick={saveCustomFood} disabled={busy} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: cf.name.trim() ? 1 : 0.5 }}>
            {busy ? "Saving…" : "Save + add it"}
          </button>
          <button onClick={() => { setCreating(false); setPendingBarcode(null); }} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            Cancel
          </button>
        </div>
      )}
    </Sheet>
    {scanning && (
      <BarcodeScanner onDetected={handleBarcode} onClose={() => setScanning(false)} />
    )}
    </>
  );
}
