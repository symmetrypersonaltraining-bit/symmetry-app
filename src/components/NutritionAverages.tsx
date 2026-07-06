"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type RangeKey = "day" | "1w" | "2w" | "4w" | "8w" | "custom";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "day", label: "Today", days: 1 },
  { key: "1w", label: "1W", days: 7 },
  { key: "2w", label: "2W", days: 14 },
  { key: "4w", label: "4W", days: 28 },
  { key: "8w", label: "8W", days: 56 },
  { key: "custom", label: "Custom", days: 0 },
];

function shiftDate(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
function labelDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

interface Row { log_date: string; meal_id: string | null; adherence: string | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null; }
interface Item { meal_id: string; protein: number | null; carbs: number | null; fats: number | null; }
interface Result { loggedDays: number; totalDays: number; p: number; c: number; f: number; kcal: number; target: { p: number; c: number; f: number; kcal: number } | null; start: string; end: string; }

function Ring({ label, value, target, color }: { label: string; value: number; target: number | null; color: string }) {
  const r = 26; const circ = 2 * Math.PI * r;
  const pct = target && target > 0 ? value / target : 0;
  const dash = Math.min(pct, 1) * circ;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(140,150,180,.25)" strokeWidth="7" />
        <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={dash + " " + circ} transform="rotate(-90 35 35)" />
        <text x="35" y="39" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">{Math.round(value)}</text>
      </svg>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 10, opacity: 0.55 }}>{target != null ? "of " + Math.round(target) + "g" : ""}</div>
    </div>
  );
}

export default function NutritionAverages({ clientId, today }: { clientId: string; today: string }) {
  const [range, setRange] = useState<RangeKey>("day");
  const [customStart, setCustomStart] = useState<string>(shiftDate(today, -6));
  const [customEnd, setCustomEnd] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    let start = today; let end = today;
    if (range === "custom") { start = customStart; end = customEnd; if (start > end) { const t = start; start = end; end = t; } }
    else { const rg = RANGES.find((x) => x.key === range); const days = rg ? rg.days : 1; start = shiftDate(today, -(days - 1)); end = today; }
    const supabase = createClient();
    const logsRes = await supabase.from("meal_adherence_logs").select("log_date, meal_id, adherence, est_protein, est_carbs, est_fats").eq("client_id", clientId).gte("log_date", start).lte("log_date", end);
    const logs = (logsRes.data as Row[]) || [];
    const mealIds = Array.from(new Set(logs.map((l) => l.meal_id).filter((x): x is string => !!x)));
    const itemsByMeal: Record<string, { p: number; c: number; f: number }> = {};
    if (mealIds.length) {
      const itemsRes = await supabase.from("meal_items").select("meal_id, protein, carbs, fats").in("meal_id", mealIds);
      for (const it of (((itemsRes.data as Item[]) || []))) {
        const k = it.meal_id;
        if (!itemsByMeal[k]) itemsByMeal[k] = { p: 0, c: 0, f: 0 };
        itemsByMeal[k].p += Number(it.protein) || 0;
        itemsByMeal[k].c += Number(it.carbs) || 0;
        itemsByMeal[k].f += Number(it.fats) || 0;
      }
    }
    const targetRes = await supabase.from("macro_targets").select("calories, protein, carbs, fats, effective_date").eq("client_id", clientId).lte("effective_date", end).order("effective_date", { ascending: false }).limit(1).maybeSingle();
    const dayset = new Set<string>();
    let sp = 0; let sc = 0; let sf = 0;
    for (const l of logs) {
      dayset.add(l.log_date);
      let p = 0; let c = 0; let f = 0;
      if (l.est_protein != null || l.est_carbs != null || l.est_fats != null) { p = Number(l.est_protein) || 0; c = Number(l.est_carbs) || 0; f = Number(l.est_fats) || 0; }
      else if (l.adherence === "Skip") { p = 0; c = 0; f = 0; }
      else if (l.meal_id && itemsByMeal[l.meal_id]) { p = itemsByMeal[l.meal_id].p; c = itemsByMeal[l.meal_id].c; f = itemsByMeal[l.meal_id].f; }
      sp += p; sc += c; sf += f;
    }
    const logged = dayset.size;
    const denom = logged || 1;
    const t = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
    setResult({ loggedDays: logged, totalDays: diffDays(start, end) + 1, p: sp / denom, c: sc / denom, f: sf / denom, kcal: (4 * sp + 4 * sc + 9 * sf) / denom, target: t ? { p: Number(t.protein) || 0, c: Number(t.carbs) || 0, f: Number(t.fats) || 0, kcal: Number(t.calories) || 0 } : null, start: start, end: end });
    setLoading(false);
  }, [clientId, today, range, customStart, customEnd]);

  useEffect(() => { load(); }, [load]);

  const adhPct = result && result.target && result.target.kcal > 0 ? Math.round((result.kcal / result.target.kcal) * 100) : null;
  const isToday = range === "day";

  return (
    <div style={{ background: "var(--brand-surface, #ffffff)", border: "1px solid rgba(140,150,180,.18)", borderRadius: 20, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {RANGES.map((rg) => (
          <button key={rg.key} onClick={() => setRange(rg.key)} style={{ flex: "1 0 auto", minWidth: 52, padding: "7px 8px", borderRadius: 999, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: range === rg.key ? "var(--brand-primary, #7c9cf5)" : "rgba(140,150,180,.14)", color: range === rg.key ? "#fff" : "inherit" }}>{rg.label}</button>
        ))}
      </div>
      {range === "custom" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", fontSize: 12 }}>
          <input type="date" value={customStart} max={today} onChange={(e) => setCustomStart(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit" }} />
          <span style={{ opacity: 0.6 }}>to</span>
          <input type="date" value={customEnd} max={today} onChange={(e) => setCustomEnd(e.target.value)} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(140,150,180,.3)", background: "transparent", color: "inherit" }} />
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: "center", padding: "24px 0", opacity: 0.6, fontSize: 13 }}>Loading...</div>
      ) : !result || result.loggedDays === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", opacity: 0.6, fontSize: 13 }}>No logs {isToday ? "today" : "in this range"} yet.</div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 8 }}>
            {isToday ? "Today" : labelDate(result.start) + " - " + labelDate(result.end)}{" · "}{isToday ? "" : "avg/day · "}logged {result.loggedDays} of {result.totalDays}
          </div>
          <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
            <Ring label="PROTEIN" value={result.p} target={result.target ? result.target.p : null} color="var(--brand-primary, #7c9cf5)" />
            <Ring label="CARBS" value={result.c} target={result.target ? result.target.c : null} color="#5ec9a3" />
            <Ring label="FATS" value={result.f} target={result.target ? result.target.f : null} color="#f59e0b" />
          </div>
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>{Math.round(result.kcal)}</div>
            <div style={{ fontSize: 11, opacity: 0.65, marginTop: 2 }}>{isToday ? "kcal" : "avg kcal / day"}{result.target ? " · target " + Math.round(result.target.kcal) : ""}{adhPct != null ? " · " + adhPct + "%" : ""}</div>
          </div>
        </>
      )}
    </div>
  );
}
