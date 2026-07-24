"use client";

// Nutrition v3 — food_catalog search sheet: instant search, serving picker,
// qty steppers, verified badges, create-custom-food (source='client').
// Falls back to the legacy `foods` table if food_catalog isn't reachable yet.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CustomItem, kcalOf } from "@/lib/nutrition/dailyTotals";
import Sheet from "./Sheet";

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
  source?: string | null; // usda | brand | restaurant | client | ...
  client_id?: string | null;
}

function n(v: unknown): number { const x = Number(v); return isFinite(x) ? x : 0; }

function mapRow(raw: Record<string, unknown>, fromCatalog: boolean): CatalogFood {
  return {
    id: String(raw.id),
    name: String(raw.name ?? raw.food ?? ""),
    brand: (raw.brand as string) ?? null,
    // food_catalog uses serving_desc; the legacy foods table uses serving.
    serving: (raw.serving_desc ?? raw.serving ?? raw.serving_size ?? null) as string | null,
    protein: n(raw.protein ?? raw.protein_g),
    carbs: n(raw.carbs ?? raw.carbs_g),
    fats: n(raw.fats ?? raw.fat ?? raw.fat_g),
    kcal: raw.kcal != null || raw.calories != null ? n(raw.kcal ?? raw.calories) : null,
    verified: (raw.verified as boolean) ?? null,
    source: (raw.source as string) ?? (fromCatalog ? null : "foods"),
    client_id: (raw.created_by_client_id as string) ?? (raw.client_id as string) ?? null,
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
  const [qty, setQty] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cf, setCf] = useState({ name: "", serving: "1 serving", p: "", c: "", f: "" });
  const [busy, setBusy] = useState(false);
  const catalogOk = useRef<boolean | null>(null);

  useEffect(() => {
    let on = true;
    const t = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 2 && tab === "all") { if (on) setResults([]); return; }
      // Prefer food_catalog (v3); fall back to the legacy foods table.
      let rows: CatalogFood[] = [];
      if (catalogOk.current !== false) {
        try {
          let query = supabase.from("food_catalog").select("*").limit(10);
          if (term.length >= 2) query = query.ilike("name", "%" + term + "%");
          if (tab === "mine") query = query.eq("created_by_client_id", clientId);
          const { data, error } = await query;
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

  function badge(f: CatalogFood) {
    if (f.source === "client" || f.client_id === clientId)
      return <span style={{ color: "#42A5F5", fontSize: 9, fontWeight: 800 }}>MY FOOD</span>;
    if (f.verified) return <span style={{ color: "#22c55e", fontSize: 9, fontWeight: 800 }}>✓ VERIFIED</span>;
    return <span style={{ color: "#f59e0b", fontSize: 9, fontWeight: 800 }}>UNVERIFIED</span>;
  }

  function pickItem(f: CatalogFood, mult: number) {
    const p = n(f.protein) * mult, c = n(f.carbs) * mult, ft = n(f.fats) * mult;
    onPick({
      n: f.name,
      a: `${mult} × ${f.serving || "serving"}`,
      p, c, f: ft,
      k: f.kcal != null ? n(f.kcal) * mult : kcalOf(p, c, ft),
      db: !!f.verified,
      food_id: f.id,
      fac: 1,
    });
  }

  async function saveCustomFood() {
    const p = parseFloat(cf.p) || 0, c = parseFloat(cf.c) || 0, f = parseFloat(cf.f) || 0;
    if (!cf.name.trim() || p + c + f === 0) return;
    setBusy(true);
    let id: string | null = null;
    try {
      const { data } = await supabase
        .from("food_catalog")
        .insert({
          created_by_client_id: clientId,
          name: cf.name.trim(),
          serving_desc: cf.serving || "1 serving",
          kcal: kcalOf(p, c, f),
          protein: p, carbs: c, fats: f,
          source: "client",
          verified: false,
        })
        .select()
        .single();
      id = (data as { id?: string } | null)?.id ?? null;
    } catch { /* catalog not ready — still log the item locally */ }
    setBusy(false);
    onPick({ n: cf.name.trim(), a: cf.serving || "1 serving", p, c, f, k: kcalOf(p, c, f), food_id: id, fac: 1 });
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)",
    borderRadius: 12, padding: "10px 12px", fontSize: 13, width: "100%", outline: "none",
  };

  return (
    <Sheet title={title} subtitle={subtitle || "Instant results as you type"} onClose={onClose} onBack={onBack}>
      {!picked && !creating && (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); }}
            placeholder='Search foods… try "chicken" or "oikos"'
            style={inputStyle}
          />
          <div className="flex gap-1.5 mt-2 mb-2">
            {(["all", "mine"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={tab === t ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                {t === "all" ? "All foods" : "My foods"}
              </button>
            ))}
          </div>
          {results.map((f) => (
            <button key={f.id} onClick={() => { setPicked(f); setQty(1); }}
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

      {picked && (
        <div>
          <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{picked.name} {badge(picked)}</p>
          <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            {(picked.brand ? picked.brand + " · " : "")}base: {picked.serving || "1 serving"}
          </p>
          <div className="flex items-center justify-center gap-4 mb-2">
            <button onClick={() => setQty(Math.max(0.25, Math.round((qty - 0.25) * 100) / 100))} className="w-10 h-10 rounded-xl font-bold text-lg" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>−</button>
            <span className="text-xl font-extrabold text-center" style={{ color: "var(--brand-text)", minWidth: 64 }}>{qty}</span>
            <button onClick={() => setQty(Math.round((qty + 0.25) * 100) / 100)} className="w-10 h-10 rounded-xl font-bold text-lg" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>＋</button>
          </div>
          <p className="text-center text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
            {qty} × {picked.serving || "serving"} · P{Math.round(n(picked.protein) * qty)} C{Math.round(n(picked.carbs) * qty)} F{Math.round(n(picked.fats) * qty)} · {picked.kcal != null ? Math.round(n(picked.kcal) * qty) : kcalOf(n(picked.protein) * qty, n(picked.carbs) * qty, n(picked.fats) * qty)} cal
          </p>
          <button onClick={() => pickItem(picked, qty)} className="w-full py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)" }}>
            Add it ✓
          </button>
          <button onClick={() => setPicked(null)} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            ‹ Back to search
          </button>
        </div>
      )}

      {creating && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Create custom food — saved to your catalog</p>
          <input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} placeholder="Food name — e.g. Mom's meatloaf" style={{ ...inputStyle, marginBottom: 8 }} />
          <input value={cf.serving} onChange={(e) => setCf({ ...cf, serving: e.target.value })} placeholder="Serving — e.g. 1 slice" style={{ ...inputStyle, marginBottom: 8 }} />
          <div className="grid grid-cols-3 gap-2">
            {([["p", "Protein g"], ["c", "Carbs g"], ["f", "Fats g"]] as ["p" | "c" | "f", string][]).map(([k, lab]) => (
              <input key={k} value={cf[k]} onChange={(e) => setCf({ ...cf, [k]: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" placeholder={lab} style={{ ...inputStyle, textAlign: "center" }} />
            ))}
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "var(--brand-text-secondary)" }}>
            = {kcalOf(parseFloat(cf.p) || 0, parseFloat(cf.c) || 0, parseFloat(cf.f) || 0)} cal
          </p>
          <button onClick={saveCustomFood} disabled={busy} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: cf.name.trim() ? 1 : 0.5 }}>
            {busy ? "Saving…" : "Save + add it"}
          </button>
          <button onClick={() => setCreating(false)} className="w-full mt-2 py-2.5 rounded-2xl text-sm font-semibold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}>
            Cancel
          </button>
        </div>
      )}
    </Sheet>
  );
}
