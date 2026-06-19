"use client";

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

interface MealItem { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; protein: number | null; carbs: number | null; fats: number | null; position: number; }
interface Meal { id: string; name: string; timing: string | null; position: number; swaps: string | null; meal_items: MealItem[]; }
interface MealPlan { id: string; version_number: number; meals: Meal[]; }
interface AdherenceLog { id: string; meal_id: string; meal_position: number; adherence: string; off_plan_details: string | null; est_kcal: number | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null; }
interface MacroTarget { calories: number; protein: number; carbs: number; fats: number; }

const ADHERENCE_OPTIONS = [
  { key: "full", label: "Full", emoji: "✅", pct: 1.0 },
  { key: "three_quarters", label: "¾", emoji: "🟡", pct: 0.75 },
  { key: "half", label: "½", emoji: "🟠", pct: 0.5 },
  { key: "quarter", label: "¼", emoji: "🔴", pct: 0.25 },
  { key: "skipped", label: "Skip", emoji: "⛔", pct: 0 },
  { key: "off_plan", label: "Off Plan", emoji: "🚫", pct: null },
];

const ADHERENCE_COLORS: Record<string, string> = {
  full: "#22c55e", three_quarters: "#84cc16", half: "#f59e0b",
  quarter: "#ef4444", skipped: "#6b7280", off_plan: "#8b5cf6",
};

function MacroRing({ value, target, color, label, unit = "g" }: {
  value: number; target: number; color: string; label: string; unit?: string;
}) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7"/>
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${circ * (1 - pct)}`}
            strokeLinecap="round" transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs font-bold leading-none" style={{ color: "var(--brand-text)" }}>{Math.round(value)}</span>
          <span className="text-xs leading-none" style={{ color: "var(--brand-text-secondary)" }}>{unit}</span>
        </div>
      </div>
      <p className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>{label}</p>
      {target > 0 && (
        <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>/ {Math.round(target)}</p>
      )}
    </div>
  );
}

interface Props {
  clientId: string;
  clientName: string;
  mealPlan: MealPlan | null;
  todayLogs: AdherenceLog[];
  macroTarget: MacroTarget | null;
  weekLogs: { log_date: string; adherence: string }[];
  today: string;
  isTrainer?: boolean;
}

export default function MealPlanClient({ clientId, clientName, mealPlan, todayLogs, macroTarget, weekLogs, today, isTrainer }: Props) {
  const supabase = createClient();
  const [logs, setLogs] = useState<AdherenceLog[]>(todayLogs);
  const [saving, setSaving] = useState<string | null>(null);
  const [offPlanModal, setOffPlanModal] = useState<{ meal: Meal } | null>(null);
  const [offPlanDetails, setOffPlanDetails] = useState("");
  const [offPlanKcal, setOffPlanKcal] = useState("");
  const [offPlanP, setOffPlanP] = useState("");
  const [offPlanC, setOffPlanC] = useState("");
  const [offPlanF, setOffPlanF] = useState("");

  const sortedMeals = useMemo(() => {
    if (!mealPlan?.meals) return [];
    return [...mealPlan.meals].sort((a, b) => a.position - b.position);
  }, [mealPlan]);

  function getMealMacros(meal: Meal) {
    let protein = 0, carbs = 0, fats = 0;
    for (const item of meal.meal_items || []) {
      protein += item.protein || 0;
      carbs += item.carbs || 0;
      fats += item.fats || 0;
    }
    const kcal = protein * 4 + carbs * 4 + fats * 9;
    return { kcal, protein, carbs, fats };
  }

  const currentMacros = useMemo(() => {
    let kcal = 0, protein = 0, carbs = 0, fats = 0;
    for (const log of logs) {
      const meal = sortedMeals.find(m => m.id === log.meal_id);
      if (!meal) continue;
      const opt = ADHERENCE_OPTIONS.find(o => o.key === log.adherence);
      if (!opt) continue;
      if (log.adherence === "off_plan") {
        kcal += log.est_kcal || 0;
        protein += log.est_protein || 0;
        carbs += log.est_carbs || 0;
        fats += log.est_fats || 0;
      } else if (opt.pct !== null) {
        const m = getMealMacros(meal);
        kcal += m.kcal * opt.pct;
        protein += m.protein * opt.pct;
        carbs += m.carbs * opt.pct;
        fats += m.fats * opt.pct;
      }
    }
    return { kcal, protein, carbs, fats };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, sortedMeals]);

  async function logAdherence(meal: Meal, adherenceKey: string) {
    if (adherenceKey === "off_plan") {
      setOffPlanModal({ meal });
      return;
    }
    setSaving(meal.id);
    try {
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: today, meal_id: meal.id,
        meal_position: meal.position, adherence: adherenceKey,
        off_plan_details: null, est_kcal: null, est_protein: null,
        est_carbs: null, est_fats: null, source: "client_app",
      }, { onConflict: "client_id,log_date,meal_id" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_id !== meal.id), data as AdherenceLog]);
    } finally { setSaving(null); }
  }

  async function saveOffPlan() {
    if (!offPlanModal) return;
    setSaving(offPlanModal.meal.id);
    try {
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: today, meal_id: offPlanModal.meal.id,
        meal_position: offPlanModal.meal.position, adherence: "off_plan",
        off_plan_details: offPlanDetails || null,
        est_kcal: offPlanKcal ? parseFloat(offPlanKcal) : null,
        est_protein: offPlanP ? parseFloat(offPlanP) : null,
        est_carbs: offPlanC ? parseFloat(offPlanC) : null,
        est_fats: offPlanF ? parseFloat(offPlanF) : null,
        source: "client_app",
      }, { onConflict: "client_id,log_date,meal_id" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_id !== offPlanModal.meal.id), data as AdherenceLog]);
      setOffPlanModal(null);
      setOffPlanDetails(""); setOffPlanKcal(""); setOffPlanP(""); setOffPlanC(""); setOffPlanF("");
    } finally { setSaving(null); }
  }

  const loggedCount = logs.length;
  const totalMeals = sortedMeals.length;
  const todayPct = totalMeals > 0 ? loggedCount / totalMeals : 0;

  if (!mealPlan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center pb-24"
        style={{ background: "var(--brand-bg)" }}>
        <i className="ti ti-salad text-5xl mb-4" style={{ color: "var(--brand-text-secondary)" }} />
        <h2 className="font-bold text-lg mb-2" style={{ color: "var(--brand-text)" }}>No Meal Plan Yet</h2>
        <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Your trainer will assign your meal plan soon.</p>
      </div>
    );
  }

  return (
    <div className="pb-24" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* Off Plan Modal */}
      {offPlanModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setOffPlanModal(null)}>
          <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
            <h3 className="font-bold text-base mb-1" style={{ color: "var(--brand-text)" }}>Off-Plan: {offPlanModal.meal.name}</h3>
            <p className="text-xs mb-4" style={{ color: "var(--brand-text-secondary)" }}>What did you have instead? (optional)</p>
            <textarea value={offPlanDetails} onChange={e => setOffPlanDetails(e.target.value)}
              placeholder="Describe what you ate…" className="w-full rounded-xl p-3 text-sm outline-none resize-none mb-3" rows={2}
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "kcal", value: offPlanKcal, set: setOffPlanKcal },
                { label: "Protein g", value: offPlanP, set: setOffPlanP },
                { label: "Carbs g", value: offPlanC, set: setOffPlanC },
                { label: "Fats g", value: offPlanF, set: setOffPlanF },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs mb-1 text-center" style={{ color: "var(--brand-text-secondary)" }}>{f.label}</p>
                  <input type="number" value={f.value} onChange={e => f.set(e.target.value)}
                    placeholder="—" inputMode="decimal"
                    className="w-full text-center text-sm py-2 rounded-xl outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
              ))}
            </div>
            <button onClick={saveOffPlan} disabled={saving === offPlanModal.meal.id}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: "#8b5cf6" }}>
              {saving === offPlanModal.meal.id ? "Saving…" : "Log Off-Plan"}
            </button>
          </div>
        </div>
      )}

      {/* Header — hidden for trainer (trainer has its own header with selector) */}
      {!isTrainer && (
        <div className="px-4 pt-6 pb-4" style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
          <h1 className="text-xl font-bold mb-0.5" style={{ color: "var(--brand-text)" }}>Nutrition</h1>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
      )}
      {isTrainer && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{clientName}</p>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>
      )}

      {/* Macro rings */}
      <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Today&apos;s Macros</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: todayPct === 1 ? "#22c55e" : "var(--brand-primary)" }} />
            <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{loggedCount}/{totalMeals} logged</span>
          </div>
        </div>
        <div className="flex justify-around">
          <MacroRing value={currentMacros.kcal} target={macroTarget?.calories || 0} color="#0EA5E9" label="kcal" unit="cal" />
          <MacroRing value={currentMacros.protein} target={macroTarget?.protein || 0} color="#22c55e" label="Protein" />
          <MacroRing value={currentMacros.carbs} target={macroTarget?.carbs || 0} color="#f59e0b" label="Carbs" />
          <MacroRing value={currentMacros.fats} target={macroTarget?.fats || 0} color="#ef4444" label="Fats" />
        </div>
        <div className="mt-4 h-1.5 rounded-full" style={{ background: "var(--brand-border)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${todayPct * 100}%`, background: "var(--brand-primary)" }} />
        </div>
      </div>

      {/* Meal cards */}
      <div className="px-4 mt-4 space-y-3">
        {sortedMeals.map(meal => {
          const mealLog = logs.find(l => l.meal_id === meal.id);
          const macros = getMealMacros(meal);
          const isLogged = !!mealLog;
          const logColor = mealLog ? ADHERENCE_COLORS[mealLog.adherence] : null;
          const isSaving = saving === meal.id;
          const currentOpt = mealLog ? ADHERENCE_OPTIONS.find(o => o.key === mealLog.adherence) : null;

          return (
            <div key={meal.id} className="rounded-2xl overflow-hidden"
              style={{
                background: "var(--brand-surface)",
                border: isLogged ? `1.5px solid ${logColor}40` : "1px solid var(--brand-border)",
              }}>
              <div className="flex items-start justify-between p-4 pb-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: isLogged && logColor ? `${logColor}20` : "var(--brand-card)" }}>
                    {isLogged
                      ? <span className="text-base">{currentOpt?.emoji}</span>
                      : <span className="text-sm font-bold" style={{ color: "var(--brand-text-secondary)" }}>M{meal.position}</span>
                    }
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{meal.name}</p>
                    {meal.timing && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{meal.timing}</p>
                    )}
                    {macros.kcal > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                        {Math.round(macros.kcal)} cal · {Math.round(macros.protein)}P · {Math.round(macros.carbs)}C · {Math.round(macros.fats)}F
                      </p>
                    )}
                  </div>
                </div>
                {isLogged && logColor && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ background: `${logColor}20`, color: logColor }}>
                    {currentOpt?.label}
                  </span>
                )}
              </div>

              {/* Food items */}
              {(meal.meal_items || []).sort((a, b) => a.position - b.position).map(item => (
                <div key={item.id} className="px-4 py-1.5 flex items-start gap-2"
                  style={{ borderTop: "1px solid var(--brand-border)" }}>
                  <i className="ti ti-point-filled text-xs mt-0.5 flex-shrink-0" style={{ color: "var(--brand-primary)" }} />
                  <span className="text-sm" style={{ color: "var(--brand-text)" }}>
                    {item.food}
                    {!item.is_unlimited && item.amount && (
                      <span className="ml-1 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                        {item.amount}{item.unit ? ` ${item.unit}` : ""}
                      </span>
                    )}
                    {item.is_unlimited && (
                      <span className="ml-1 text-xs" style={{ color: "var(--brand-text-secondary)" }}>(unlimited)</span>
                    )}
                  </span>
                </div>
              ))}

              {/* Swaps */}
              {meal.swaps && (
                <div className="mx-4 my-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                  <span className="font-medium">Swap: </span>{meal.swaps}
                </div>
              )}

              {/* Adherence buttons */}
              <div className="p-3 pt-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {ADHERENCE_OPTIONS.map(opt => {
                    const isActive = mealLog?.adherence === opt.key;
                    const btnColor = ADHERENCE_COLORS[opt.key];
                    return (
                      <button key={opt.key} onClick={() => logAdherence(meal, opt.key)}
                        disabled={isSaving}
                        className="flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl transition-all"
                        style={{
                          background: isActive ? `${btnColor}20` : "var(--brand-card)",
                          border: `1px solid ${isActive ? btnColor : "transparent"}`,
                          opacity: isSaving ? 0.5 : 1,
                        }}>
                        <span className="text-base leading-none">{opt.emoji}</span>
                        <span className="text-xs font-medium leading-none"
                          style={{ color: isActive ? btnColor : "var(--brand-text-secondary)" }}>
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 7-day summary */}
      {weekLogs.length > 0 && (
        <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--brand-text-secondary)" }}>This Week</p>
          <div className="flex gap-2 flex-wrap">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((day, i) => {
              const d = new Date();
              const dayOfWeek = d.getDay();
              const diff = i + 1 - (dayOfWeek === 0 ? 7 : dayOfWeek);
              const dateClone = new Date(d);
              dateClone.setDate(d.getDate() + diff);
              const dateStr = dateClone.toISOString().split("T")[0];
              const dayLogs = weekLogs.filter(l => l.log_date === dateStr);
              const hasLog = dayLogs.length > 0;
              const allFull = hasLog && dayLogs.every(l => l.adherence === "full");
              return (
                <div key={day} className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: !hasLog ? "var(--brand-card)" : allFull ? "#22c55e20" : "#f59e0b20",
                      border: `1px solid ${!hasLog ? "var(--brand-border)" : allFull ? "#22c55e" : "#f59e0b"}`,
                    }}>
                    <span className="text-xs">{!hasLog ? "–" : allFull ? "✓" : "~"}</span>
                  </div>
                  <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{day}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
