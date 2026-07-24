"use client";

// Nutrition v3 — standalone averages strip. NOTE: on the v3 nutrition screen
// this is no longer rendered — its content was merged into the unified top
// macro card (NutritionV3Client). Kept as a self-contained component (backed
// by the shared useNutritionAverages hook) for any non-v3 use.

import { useState } from "react";
import { useNutritionAverages, AVG_RANGES, RangeKey, shiftDate } from "./useNutritionAverages";

export default function AveragesStrip({ clientId, today }: { clientId: string; today: string }) {
  const [range, setRange] = useState<RangeKey>("1w");
  const [customStart, setCustomStart] = useState(shiftDate(today, -6));
  const [customEnd, setCustomEnd] = useState(today);
  const { loading, result } = useNutritionAverages(clientId, today, range, customStart, customEnd);

  const stat = (label: string, value: string, sub?: string) => (
    <div className="text-center flex-1">
      <p className="font-extrabold" style={{ color: "var(--brand-text)", fontSize: 17, lineHeight: 1.1 }}>{value}</p>
      <p style={{ color: "var(--brand-text-secondary)", fontSize: 9, fontWeight: 700, letterSpacing: 0.8 }}>{label}</p>
      {sub && <p style={{ color: "var(--brand-text-secondary)", fontSize: 9 }}>{sub}</p>}
    </div>
  );

  return (
    <div className="rounded-2xl p-3.5 mb-3" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <div className="flex gap-1 mb-2.5 flex-wrap">
        {AVG_RANGES.map((rg) => (
          <button key={rg.key} onClick={() => setRange(rg.key)} className="px-3 py-1.5 rounded-full text-xs font-bold"
            style={range === rg.key ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
            {rg.label}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex gap-2 items-center mb-2.5 text-xs">
          <input type="date" value={customStart} max={today} onChange={(e) => setCustomStart(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
          <span style={{ color: "var(--brand-text-secondary)" }}>to</span>
          <input type="date" value={customEnd} max={today} onChange={(e) => setCustomEnd(e.target.value)} className="flex-1 rounded-lg px-2 py-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
        </div>
      )}
      {loading ? (
        <p className="text-center py-4 text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading…</p>
      ) : !result || result.loggedDays === 0 ? (
        <p className="text-center py-4 text-sm" style={{ color: "var(--brand-text-secondary)" }}>No logs in this range yet.</p>
      ) : (
        <>
          <div className="flex items-center">
            {stat("AVG CAL", Math.round(result.kcal).toLocaleString(), result.target ? `target ${Math.round(result.target.kcal).toLocaleString()}` : undefined)}
            {stat("PROTEIN", Math.round(result.p) + "g", result.target ? `of ${Math.round(result.target.p)}g` : undefined)}
            {stat("CARBS", Math.round(result.c) + "g", result.target ? `of ${Math.round(result.target.c)}g` : undefined)}
            {stat("FAT", Math.round(result.f) + "g", result.target ? `of ${Math.round(result.target.f)}g` : undefined)}
          </div>
          <div className="flex items-center mt-3 pt-3" style={{ borderTop: "1px dashed var(--brand-border)" }}>
            {stat("ADHERENCE", result.adherence != null ? Math.round(result.adherence) + "%" : "—", "plan meals")}
            {stat("LOGGING RATE", Math.round((result.loggedDays / result.totalDays) * 100) + "%", `${result.loggedDays} of ${result.totalDays} days`)}
          </div>
        </>
      )}
    </div>
  );
}
