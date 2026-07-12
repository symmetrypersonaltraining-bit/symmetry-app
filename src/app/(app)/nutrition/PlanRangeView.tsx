"use client";

// Forward meal-plan range view (Notion #1): shows the plan across 1/4/8 weeks
// or a custom window. Read-only and self-contained — falls back to the already
// loaded base plan if its own fetches fail, so it can never blank the screen.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type RVItem = { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; protein: number | null; carbs: number | null; fats: number | null; position: number };
type RVMeal = { id: string; name: string; position: number; meal_items: RVItem[] };
type RVPlan = { id: string; version_number?: number | null; effective_date?: string | null; meals: RVMeal[] };

function addDaysStr(s: string, n: number) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
}
function fmtDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function planTotals(p: RVPlan | null) {
  let protein = 0, carbs = 0, fats = 0, meals = 0;
  for (const m of p?.meals || []) {
    meals++;
    for (const it of m.meal_items || []) { protein += it.protein || 0; carbs += it.carbs || 0; fats += it.fats || 0; }
  }
  return { kcal: protein * 4 + carbs * 4 + fats * 9, protein, carbs, fats, meals };
}

export default function PlanRangeView({ clientId, startDate, days, basePlan, baseTarget }: {
  clientId: string;
  startDate: string;
  days: number;
  basePlan: RVPlan | null;
  baseTarget: { calories?: number | null; effective_date?: string | null } | null;
}) {
  const supabase = createClient();
  const [futurePlans, setFuturePlans] = useState<RVPlan[]>([]);
  const [futureTargets, setFutureTargets] = useState<{ calories?: number | null; effective_date?: string | null }[]>([]);
  const endDate = addDaysStr(startDate, days - 1);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const [fpRes, ftRes] = await Promise.all([
          supabase.from("meal_plans")
            .select("id, version_number, effective_date, meals(id, name, position, meal_items(id, food, amount, unit, is_unlimited, protein, carbs, fats, position))")
            .eq("client_id", clientId).eq("status", "live")
            .gt("effective_date", startDate).lte("effective_date", endDate)
            .order("effective_date", { ascending: true }),
          supabase.from("macro_targets")
            .select("calories, effective_date").eq("client_id", clientId)
            .gt("effective_date", startDate).lte("effective_date", endDate)
            .order("effective_date", { ascending: true }),
        ]);
        if (!on) return;
        setFuturePlans((fpRes.data as RVPlan[]) || []);
        setFutureTargets(ftRes.data || []);
      } catch { /* fall back to base plan only */ }
    })();
    return () => { on = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, startDate, days]);

  const rows = useMemo(() => {
    const out: { date: string; plan: RVPlan | null; target: { calories?: number | null } | null }[] = [];
    for (let i = 0; i < days; i++) {
      const d = addDaysStr(startDate, i);
      let plan: RVPlan | null = basePlan;
      for (const p of futurePlans) if (p.effective_date && p.effective_date <= d) plan = p;
      let target = baseTarget;
      for (const t of futureTargets) if (t.effective_date && t.effective_date <= d) target = t;
      out.push({ date: d, plan, target });
    }
    return out;
  }, [startDate, days, basePlan, baseTarget, futurePlans, futureTargets]);

  const weekly = days > 7;
  const shown = weekly ? rows.filter((_, i) => i % 7 === 0) : rows;

  return (
    <div className="px-4 mt-3 space-y-2 pb-6">
      <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
        Plan ahead: {fmtDay(startDate)} &ndash; {fmtDay(endDate)}
        {futurePlans.length === 0 && futureTargets.length === 0 ? " · same plan every day in this window" : " · plan/target changes shown per row"}
      </p>
      {shown.map(r => {
        const t = planTotals(r.plan);
        return (
          <div key={r.date} className="rounded-2xl px-4 py-3" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                {weekly ? `Week of ${fmtDay(r.date)}` : fmtDay(r.date)}
              </p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{t.meals} meals · {Math.round(t.kcal)} cal/day</p>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              {Math.round(t.protein)}P · {Math.round(t.carbs)}C · {Math.round(t.fats)}F
              {r.target?.calories ? ` · target ${Math.round(Number(r.target.calories))} cal` : ""}
              {r.plan?.version_number != null ? ` · plan v${r.plan.version_number}` : ""}
            </p>
            {!weekly && [...(r.plan?.meals || [])].sort((a, b) => a.position - b.position).map(m => (
              <p key={m.id} className="text-xs mt-1" style={{ color: "var(--brand-text)" }}>
                <span style={{ color: "var(--brand-primary)" }}>&bull;</span> {m.name}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
