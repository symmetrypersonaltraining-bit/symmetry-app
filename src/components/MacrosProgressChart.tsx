"use client";
import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeDayTotals, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

type Daily = { date: string; calories: number; protein: number; carbs: number; fats: number };
const RANGES = ["1wk", "2wk", "4wk", "8wk", "Custom"];
const METRICS = [
  { key: "calories", label: "Calories", color: "var(--brand-primary)", unit: "kcal" },
  { key: "protein", label: "Protein", color: "#1D9E75", unit: "g" },
  { key: "carbs", label: "Carbs", color: "#EF9F27", unit: "g" },
  { key: "fats", label: "Fat", color: "#D85A30", unit: "g" },
] as const;

function ymd(d: Date) { const m = String(d.getMonth()+1).padStart(2,"0"); const day = String(d.getDate()).padStart(2,"0"); return d.getFullYear()+"-"+m+"-"+day; }

export default function MacrosProgressChart({ clientId }: { clientId: string | null }) {
  const supabase = createClient();
  const [daily, setDaily] = useState<Daily[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<string>("calories");
  const [range, setRange] = useState<string>("4wk");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    let active = true;
    (async () => {
      setLoading(true);
      // Data computed through the canonical dailyTotals module (NutritionV3) so
      // this chart, the macro bar and the averages strips always agree —
      // adherence is properly prorated, Skipped counts 0, item overrides and
      // the v3 log protocol (custom meals, placeholders) are all respected.
      const { data: logs } = await (supabase as any)
        .from("meal_adherence_logs")
        .select("*")
        .eq("client_id", clientId)
        .order("log_date");
      const rows = (logs || []) as (LogRow & { log_date: string })[];
      const mealIds = Array.from(new Set(rows.map(r => r.meal_id).filter(Boolean)));
      const pseudoMeals: PlanMeal[] = [];
      if (mealIds.length) {
        const { data: items } = await (supabase as any).from("meal_items").select("id, meal_id, food, amount, unit, is_unlimited, protein, carbs, fats, position").in("meal_id", mealIds);
        const byMeal: Record<string, PlanMeal> = {};
        for (const it of (items || []) as any[]) {
          const m = byMeal[it.meal_id] || (byMeal[it.meal_id] = { id: String(it.meal_id), name: "", timing: null, position: 0, meal_items: [] });
          m.meal_items.push({ id: String(it.id), food: String(it.food || ""), amount: it.amount, unit: it.unit, is_unlimited: !!it.is_unlimited, protein: it.protein, carbs: it.carbs, fats: it.fats, position: Number(it.position) || 0 });
        }
        pseudoMeals.push(...Object.values(byMeal));
      }
      if (!active) return;
      const byDate: Record<string, (LogRow & { log_date: string })[]> = {};
      for (const row of rows) (byDate[row.log_date] ||= []).push(row);
      const arr = Object.keys(byDate).map(date => {
        const t = computeDayTotals(byDate[date], pseudoMeals);
        return { date, calories: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fats: Math.round(t.fats) };
      }).sort((a,b) => a.date < b.date ? -1 : 1);
      setDaily(arr);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [clientId]);

  const filtered = useMemo(() => {
    if (range === "Custom") {
      if (!customStart && !customEnd) return daily;
      return daily.filter(d => (!customStart || d.date >= customStart) && (!customEnd || d.date <= customEnd));
    }
    const days = range === "1wk" ? 7 : range === "2wk" ? 14 : range === "4wk" ? 28 : 56;
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); const cs = ymd(cutoff);
    return daily.filter(d => d.date >= cs);
  }, [daily, range, customStart, customEnd]);

  const m = METRICS.find(x => x.key === metric)!;
  const vals = filtered.map(d => (d as any)[metric] as number);
  const W = 560, H = 150, PAD = { top: 12, right: 16, bottom: 26, left: 44 };
  const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
  const minV = vals.length ? Math.min(...vals) : 0;
  const maxV = vals.length ? Math.max(...vals) : 1;
  const lo = Math.max(0, minV - (maxV - minV) * 0.1 - 1);
  const hi = maxV + (maxV - minV) * 0.1 + 1;
  const span = hi - lo || 1;
  const xStep = filtered.length > 1 ? cW / (filtered.length - 1) : cW;
  const pts = filtered.map((d, i) => ({
    x: PAD.left + (filtered.length > 1 ? i * xStep : cW / 2),
    y: PAD.top + cH - (((d as any)[metric] - lo) / span) * cH,
  }));
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
  const avg = vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length) : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm" style={{ color: "var(--brand-text)" }}>Calories & Macros</h3>
        <span className="text-xs" style={{ color: "#4E6080" }}>{filtered.length ? "avg " + avg + " " + m.unit : ""}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {METRICS.map(x => (
          <button key={x.key} onClick={() => setMetric(x.key)} className="px-2.5 py-1 rounded-full text-xs border transition-all"
            style={metric === x.key ? { background: x.color, color: "white", borderColor: x.color } : { background: "white", color: "#4E6080", borderColor: "#C8D8EC" }}>{x.label}</button>
        ))}
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {RANGES.map(r => (
          <button key={r} onClick={() => setRange(r)} className="px-3 py-1.5 rounded-full text-xs border transition-all"
            style={range === r ? { background: "var(--brand-primary)", color: "white", borderColor: "var(--brand-primary)" } : { background: "white", color: "#4E6080", borderColor: "#C8D8EC" }}>{r}</button>
        ))}
      </div>
      {range === "Custom" && (
        <div className="flex gap-2 items-center mb-3 text-xs" style={{ color: "#4E6080" }}>
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="rounded-lg px-2 py-1 border" style={{ borderColor: "#C8D8EC" }} />
          <span>to</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="rounded-lg px-2 py-1 border" style={{ borderColor: "#C8D8EC" }} />
        </div>
      )}
      {loading ? (
        <div className="py-10 text-center text-sm" style={{ color: "#4E6080" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center" style={{ color: "#4E6080" }}>
          <i className="ti ti-chart-line text-4xl block mb-2" style={{ color: "#C8D8EC" }} />
          <p className="text-sm">No nutrition logs in this range</p>
        </div>
      ) : (
        <svg viewBox={"0 0 " + W + " " + H} className="w-full" style={{ overflow: "visible" }}>
          {[0, 0.5, 1].map((t, i) => {
            const y = PAD.top + cH * t; const v = Math.round(hi - span * t);
            return (<g key={i}><line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#EEF2F7" /><text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9AA8BD">{v}</text></g>);
          })}
          <path d={path} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: "macroDraw 1.1s ease forwards" }} />
          {pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r="2.5" fill={m.color} style={{ opacity: 0, animation: "macroDot 0.3s ease forwards", animationDelay: (0.4 + i * 0.02) + "s" }} />))}
          <style>{"@keyframes macroDraw{to{stroke-dashoffset:0}}@keyframes macroDot{to{opacity:1}}"}</style>
        </svg>
      )}
    </div>
  );
}
