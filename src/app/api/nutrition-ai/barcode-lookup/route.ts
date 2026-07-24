// POST /api/nutrition-ai/barcode-lookup
// Body: { barcode: string, clientId?: string }
//   → { found: true,  source: "catalog"|"off", food: <food_catalog row> }
//   → { found: false, barcode }   (nothing in the catalog OR Open Food Facts)
//
// Looks a scanned barcode up: food_catalog first (another client may have
// inserted it since the scan), then Open Food Facts server-side — this route
// has open egress, unlike the client. An OFF hit is inserted into food_catalog
// (source='off', verified=false, per-100g macros + fiber/sugar/sodium/sat_fat +
// serving_options) and returned so one tap logs it.
//
// Auth-checked but NOT AI-metered: a barcode lookup makes no model call.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAiScope } from "@/lib/ai/scope";
import { mapOffProduct, OffProductJson } from "@/lib/nutrition/off";

const OFF_TIMEOUT_MS = 8000;
const OFF_UA = "SymmetryPersonalTraining/1.0 (nutrition logger; symmetrypersonaltraining@gmail.com)";

/** Barcodes are digits only; EAN-8 … EAN-13 / UPC land in 6–14 characters. */
function normalizeBarcode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : "";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const barcode = normalizeBarcode(body?.barcode);
    if (barcode.length < 6 || barcode.length > 14) {
      return NextResponse.json({ error: "Enter a valid barcode number." }, { status: 400 });
    }

    // Auth only — a barcode lookup is not an AI call, so it is not metered.
    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;

    const admin = createAdminClient();

    // 1) Already in the catalog?
    const { data: existing } = await admin
      .from("food_catalog")
      .select("*")
      .eq("barcode", barcode)
      .limit(1)
      .maybeSingle();
    if (existing) return NextResponse.json({ found: true, source: "catalog", food: existing });

    // 2) Fetch Open Food Facts (fail soft — a fetch error is just "not found").
    let offJson: OffProductJson | null = null;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), OFF_TIMEOUT_MS);
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
        { signal: ctrl.signal, headers: { "User-Agent": OFF_UA, Accept: "application/json" } }
      );
      clearTimeout(to);
      if (res.ok) offJson = (await res.json()) as OffProductJson;
    } catch (e) {
      console.error("barcode-lookup: OFF fetch failed", e);
    }

    const row = mapOffProduct(offJson, barcode);
    if (!row) return NextResponse.json({ found: false, barcode });

    // 3) Insert into food_catalog; tolerate a race on the unique barcode index.
    const { data: inserted, error: insErr } = await admin
      .from("food_catalog")
      .insert(row)
      .select()
      .single();
    if (insErr) {
      // Concurrent insert likely hit the unique barcode index — re-read it.
      const { data: after } = await admin
        .from("food_catalog")
        .select("*")
        .eq("barcode", barcode)
        .limit(1)
        .maybeSingle();
      if (after) return NextResponse.json({ found: true, source: "catalog", food: after });
      // Catalog write didn't land — still hand back the mapped product so the
      // client can log it (food_id null; the row simply wasn't persisted).
      console.error("barcode-lookup: insert failed", insErr.message);
      return NextResponse.json({ found: true, source: "off", food: { ...row, id: null } });
    }

    return NextResponse.json({ found: true, source: "off", food: inserted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/barcode-lookup failed:", msg);
    return NextResponse.json({ error: `Lookup failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
