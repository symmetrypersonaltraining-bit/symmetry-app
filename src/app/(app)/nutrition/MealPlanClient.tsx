"use client";

import { useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface MealItem { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; protein: number | null; carbs: number | null; fats: number | null; position: number; }
interface Meal { id: string; name: string; timing: string | null; position: number; swaps: string | null; meal_items: MealItem[]; }
interface MealPlan { id: string; version_number: number; meals: Meal[]; }
interface AdherenceLog { id: string; meal_id: string | null; meal_position: number; adherence: string; off_plan_details: string | null; notes: string | null; est_kcal: number | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null; }
interface MacroTarget { calories: number; protein: number; carbs: number; fats: number; }

const ADHERENCE_OPTIONS = [
  { key: "1/4",        label: "\u00bc",        color: "#ef4444", pct: 0.25 },
  { key: "1/2",           label: "\u00bd",        color: "#f59e0b", pct: 0.5  },
  { key: "3/4", label: "\u00be",        color: "#84cc16", pct: 0.75 },
  { key: "Full",           label: "Full",     color: "#22c55e", pct: 1.0  },
  { key: "Off-plan",       label: "Off Plan", color: "#8b5cf6", pct: null },
];

const FREE_SLOTS = [
  { position: 1, label: "Meal 1", timing: "Morning" },
  { position: 2, label: "Meal 2", timing: "Mid-Morning" },
  { position: 3, label: "Meal 3", timing: "Lunch" },
  { position: 4, label: "Meal 4", timing: "Afternoon" },
  { position: 5, label: "Meal 5", timing: "Dinner" },
  { position: 6, label: "Meal 6", timing: "Evening Snack" },
];

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

  const [notesMap, setNotesMap] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const l of todayLogs) if (l.notes) m[l.meal_position] = l.notes;
    return m;
  });

  const [offPlanModal, setOffPlanModal] = useState<{ mealId: string | null; position: number; mealName: string } | null>(null);
  const [offPlanDetails, setOffPlanDetails] = useState("");
  const [offPlanKcal, setOffPlanKcal] = useState("");
  const [offPlanP,    setOffPlanP]    = useState("");
  const [offPlanC,    setOffPlanC]    = useState("");
  const [offPlanF,    setOffPlanF]    = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoResult,  setPhotoResult]  = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const sortedMeals = useMemo(() => {
    if (!mealPlan?.meals) return [];
    return [...mealPlan.meals].sort((a, b) => a.position - b.position);
  }, [mealPlan]);

  function getMealMacros(meal: Meal) {
    let protein = 0, carbs = 0, fats = 0;
    for (const item of meal.meal_items || []) {
      protein += item.protein || 0;
      carbs   += item.carbs   || 0;
      fats    += item.fats    || 0;
    }
    const kcal = protein * 4 + carbs * 4 + fats * 9;
    return { kcal, protein, carbs, fats };
  }

  const currentMacros = useMemo(() => {
    let kcal = 0, protein = 0, carbs = 0, fats = 0;
    for (const log of logs) {
      const opt = ADHERENCE_OPTIONS.find(o => o.key === log.adherence);
      if (!opt) continue;
      if (log.adherence === "Off-plan") {
        kcal    += log.est_kcal    || 0;
        protein += log.est_protein || 0;
        carbs   += log.est_carbs   || 0;
        fats    += log.est_fats    || 0;
      } else if (opt.pct !== null && log.meal_id) {
        const meal = sortedMeals.find(m => m.id === log.meal_id);
        if (meal) {
          const m = getMealMacros(meal);
          kcal    += m.kcal    * opt.pct;
          protein += m.protein * opt.pct;
          carbs   += m.carbs   * opt.pct;
          fats    += m.fats    * opt.pct;
        }
      }
    }
    return { kcal, protein, carbs, fats };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, sortedMeals]);

  const kcalTarget = macroTarget?.calories || 0;
  const kcalPct    = kcalTarget > 0 ? Math.min(currentMacros.kcal / kcalTarget, 1) : 0;
  const ringR      = 56;
  const ringCirc   = 2 * Math.PI * ringR;
  const loggedCount = logs.length;
  const totalMeals  = mealPlan ? sortedMeals.length : 0;

  async function logAdherence(meal: Meal, adherenceKey: string) {
    if (adherenceKey === "Off-plan") {
      const existing = logs.find(l => l.meal_position === meal.position);
      setOffPlanDetails(existing?.off_plan_details || "");
      setOffPlanKcal(existing?.est_kcal?.toString() || "");
      setOffPlanP(existing?.est_protein?.toString() || "");
      setOffPlanC(existing?.est_carbs?.toString() || "");
      setOffPlanF(existing?.est_fats?.toString() || "");
      setPhotoResult(null);
      setOffPlanModal({ mealId: meal.id, position: meal.position, mealName: meal.name });
      return;
    }
    setSaving(meal.id);
    try {
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: today, meal_id: meal.id,
        meal_position: meal.position, adherence: adherenceKey,
        off_plan_details: null, est_kcal: null, est_protein: null,
        est_carbs: null, est_fats: null, source: "client",
        notes: notesMap[meal.position] || null,
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== meal.position), data as AdherenceLog]);
    } finally { setSaving(null); }
  }

  async function saveNotes(position: number) {
    const note = notesMap[position] || null;
    const existing = logs.find(l => l.meal_position === position);
    if (!existing) return;
    await supabase.from("meal_adherence_logs").update({ notes: note }).eq("id", existing.id);
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1];
        const res = await fetch("/api/analyze-meal-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }),
        });
        const json = await res.json();
        if (json.error) {
          setPhotoResult("Could not analyze photo.");
        } else {
          setOffPlanKcal(json.calories?.toString() || "");
          setOffPlanP(json.protein_g?.toString() || "");
          setOffPlanC(json.carbs_g?.toString() || "");
          setOffPlanF(json.fat_g?.toString() || "");
          setOffPlanDetails(json.description || "");
          setPhotoResult(`AI detected: ${json.description}`);
        }
      } catch {
        setPhotoResult("Error analyzing photo.");
      } finally {
        setPhotoLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveOffPlan() {
    if (!offPlanModal) return;
    const key = offPlanModal.mealId || `pos-${offPlanModal.position}`;
    setSaving(key);
    try {
      const { data } = await supabase.from("meal_adherence_logs").upsert({
        client_id: clientId, log_date: today, meal_id: offPlanModal.mealId,
        meal_position: offPlanModal.position, adherence: "off_plan",
        off_plan_details: offPlanDetails || null,
        est_kcal:    offPlanKcal ? parseFloat(offPlanKcal) : null,
        est_protein: offPlanP    ? parseFloat(offPlanP)    : null,
        est_carbs:   offPlanC    ? parseFloat(offPlanC)    : null,
        est_fats:    offPlanF    ? parseFloat(offPlanF)    : null,
        notes: notesMap[offPlanModal.position] || null,
        source: "client",
      }, { onConflict: "client_id,log_date,meal_position" }).select().single();
      if (data) setLogs(prev => [...prev.filter(l => l.meal_position !== offPlanModal.position), data as AdherenceLog]);
      setOffPlanModal(null);
    } finally { setSaving(null); }
  }

  function openFreeSlot(slot: typeof FREE_SLOTS[0]) {
    const existing = logs.find(l => l.meal_position === slot.position);
    setOffPlanDetails(existing?.off_plan_details || "");
    setOffPlanKcal(existing?.est_kcal?.toString() || "");
    setOffPlanP(existing?.est_protein?.toString() || "");
    setOffPlanC(existing?.est_carbs?.toString() || "");
    setOffPlanF(existing?.est_fats?.toString() || "");
    setPhotoResult(null);
    setOffPlanModal({ mealId: null, position: slot.position, mealName: slot.label });
  }

  async function deleteLog(position: number) {
    const existing = logs.find(l => l.meal_position === position);
    if (!existing) return;
    setSaving(`del-${position}`);
    try {
      await supabase.from("meal_adherence_logs").delete().eq("id", existing.id);
      setLogs(prev => prev.filter(l => l.meal_position !== position));
    } finally { setSaving(null); }
  }

  const offPlanSavingKey = offPlanModal ? (offPlanModal.mealId || `pos-${offPlanModal.position}`) : null;

  return (
    <div className="pb-24" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>

      {/* Hidden camera input */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={handlePhotoCapture} />

      {/* Off-Plan Modal */}
      {offPlanModal && (
        <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setOffPlanModal(null)}>
          <div className="w-full rounded-t-3xl p-5 pb-10" style={{ background: "var(--brand-surface)" }}
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>
                {mealPlan ? `Off-Plan: ${offPlanModal.mealName}` : `Log ${offPlanModal.mealName}`}
              </h3>
              <button
                onClick={() => cameraRef.current?.click()}
                disabled={photoLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: "#0EA5E920", color: "#0EA5E9", border: "1px solid #0EA5E940" }}>
                {photoLoading
                  ? <><i className="ti ti-loader-2 animate-spin" /> Analyzing...</>
                  : <><i className="ti ti-camera" /> Snap Photo</>
                }
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
              {mealPlan ? "What did you have instead?" : "What did you eat?"} Snap a photo for AI macro analysis.
            </p>
            {photoResult && (
              <div className="mb-3 px-3 py-2 rounded-xl text-xs"
                style={{ background: "#0EA5E910", color: "#0EA5E9", border: "1px solid #0EA5E930" }}>
                {photoResult}
              </div>
            )}
            <textarea value={offPlanDetails} onChange={e => setOffPlanDetails(e.target.value)}
              placeholder="Describe what you ate..." className="w-full rounded-xl p-3 text-sm outline-none resize-none mb-3" rows={2}
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "kcal",      value: offPlanKcal, set: setOffPlanKcal },
                { label: "Protein g", value: offPlanP,    set: setOffPlanP    },
                { label: "Carbs g",   value: offPlanC,    set: setOffPlanC    },
                { label: "Fats g",    value: offPlanF,    set: setOffPlanF    },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs mb-1 text-center" style={{ color: "var(--brand-text-secondary)" }}>{f.label}</p>
                  <input type="number" value={f.value} onChange={e => f.set(e.target.value)}
                    placeholder="0" inputMode="decimal"
                    className="w-full text-center text-sm py-2 rounded-xl outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
              ))}
            </div>
            <button onClick={saveOffPlan} disabled={saving === offPlanSavingKey}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: "#8b5cf6" }}>
              {saving === offPlanSavingKey ? "Saving..." : mealPlan ? "Log Off-Plan" : "Save Meal"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
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

      {/* === NO MEAL PLAN === */}
      {!mealPlan && (
        <div className="px-4 mt-4">
          {logs.length > 0 && (
            <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--brand-text-secondary)" }}>Today&apos;s Macros</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Calories", value: Math.round(currentMacros.kcal),    target: macroTarget?.calories || 0, color: "#0EA5E9", unit: "cal" },
                  { label: "Protein",  value: Math.round(currentMacros.protein), target: macroTarget?.protein  || 0, color: "#22c55e", unit: "g"   },
                  { label: "Carbs",    value: Math.round(currentMacros.carbs),   target: macroTarget?.carbs    || 0, color: "#f59e0b", unit: "g"   },
                  { label: "Fats",     value: Math.round(currentMacros.fats),    target: macroTarget?.fats     || 0, color: "#ef4444", unit: "g"   },
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-3 flex flex-col items-center gap-1"
                    style={{ background: `${m.color}10`, border: `1px solid ${m.color}30` }}>
                    <span className="text-base font-bold" style={{ color: m.color }}>{m.value}</span>
                    <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{m.unit}</span>
                    <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>{m.label}</span>
                    {m.target > 0 && <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>/ {m.target}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {logs.length === 0 && (
            <div className="rounded-2xl p-5 mb-4 text-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-salad text-3xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="font-semibold text-sm mb-1" style={{ color: "var(--brand-text)" }}>No Meal Plan Yet</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Your trainer will assign your meal plan soon. You can still log your meals below.</p>
            </div>
          )}
          <p className="text-xs font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: "var(--brand-text-secondary)" }}>
            Log Today&apos;s Meals
          </p>
          <div className="space-y-2">
            {FREE_SLOTS.map(slot => {
              const logged = logs.find(l => l.meal_position === slot.position);
              return (
                <div key={slot.position} className="rounded-2xl overflow-hidden"
                  style={{ background: "var(--brand-surface)", border: logged ? "1.5px solid #8b5cf640" : "1px solid var(--brand-border)" }}>
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: logged ? "#8b5cf620" : "var(--brand-card)" }}>
                        {logged
                          ? <i className="ti ti-check text-base" style={{ color: "#8b5cf6" }} />
                          : <span className="text-sm font-bold" style={{ color: "var(--brand-text-secondary)" }}>M{slot.position}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{slot.label}</p>
                        {logged?.off_plan_details
                          ? <p className="text-xs mt-0.5 truncate" style={{ color: "var(--brand-text-secondary)" }}>{logged.off_plan_details}</p>
                          : <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{slot.timing}</p>
                        }
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {logged && (
                        <button onClick={() => deleteLog(slot.position)}
                          className="w-7 h-7 rounded-full flex items-center justify-center"
                          style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                          <i className="ti ti-trash text-xs" />
                        </button>
                      )}
                      <button onClick={() => openFreeSlot(slot)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold"
                        style={{ background: logged ? "#8b5cf620" : "var(--brand-primary)", color: logged ? "#8b5cf6" : "white" }}>
                        {logged ? "Edit" : "+ Log"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === WITH MEAL PLAN === */}
      {mealPlan && (
        <>
          {/* Calorie donut ring + macro stat cards */}
          <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="flex items-center gap-4">
              {/* Big calorie donut */}
              <div className="relative flex-shrink-0" style={{ width: 128, height: 128 }}>
                <svg width="128" height="128" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r={ringR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10"/>
                  <circle cx="64" cy="64" r={ringR} fill="none" stroke="#0EA5E9" strokeWidth="10"
                    strokeDasharray={`${ringCirc}`}
                    strokeDashoffset={`${ringCirc * (1 - kcalPct)}`}
                    strokeLinecap="round" transform="rotate(-90 64 64)"
                    style={{ transition: "stroke-dashoffset 0.7s ease" }}/>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold leading-tight" style={{ color: "var(--brand-text)" }}>
                    {Math.round(currentMacros.kcal)}
                  </span>
                  <span className="text-xs leading-none" style={{ color: "var(--brand-text-secondary)" }}>
                    {kcalTarget > 0 ? `/ ${kcalTarget}` : "cal"}
                  </span>
                  <span className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>kcal</span>
                </div>
              </div>

              {/* 4 macro stat cards */}
              <div className="flex-1 grid grid-cols-2 gap-2">
                {[
                  { label: "Protein",      value: Math.round(currentMacros.protein), target: macroTarget?.protein || 0, color: "#22c55e", unit: "g"     },
                  { label: "Carbs",        value: Math.round(currentMacros.carbs),   target: macroTarget?.carbs   || 0, color: "#f59e0b", unit: "g"     },
                  { label: "Fats",         value: Math.round(currentMacros.fats),    target: macroTarget?.fats    || 0, color: "#ef4444", unit: "g"     },
                  { label: "Meals Logged", value: loggedCount,                       target: totalMeals,               color: "#0EA5E9", unit: "meals"  },
                ].map(m => (
                  <div key={m.label} className="rounded-xl p-2.5 flex flex-col"
                    style={{ background: `${m.color}10`, border: `1px solid ${m.color}25` }}>
                    <span className="text-sm font-bold leading-none" style={{ color: m.color }}>
                      {m.value}
                      {m.target > 0 && <span className="text-xs font-normal opacity-60">/{m.target}</span>}
                      {m.label !== "Meals Logged" && (
                        <span className="text-xs font-normal ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>{m.unit}</span>
                      )}
                    </span>
                    <span className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Meal cards */}
          <div className="px-4 mt-4 space-y-3">
            {sortedMeals.map(meal => {
              const mealLog  = logs.find(l => l.meal_position === meal.position);
              const macros   = getMealMacros(meal);
              const isLogged = !!mealLog;
              const logOpt   = mealLog ? ADHERENCE_OPTIONS.find(o => o.key === mealLog.adherence) : null;
              const logColor = logOpt?.color || null;
              const isSaving = saving === meal.id;
              const noteVal  = notesMap[meal.position] || "";

              return (
                <div key={meal.id} className="rounded-2xl overflow-hidden"
                  style={{
                    background: "var(--brand-surface)",
                    border: isLogged && logColor ? `1.5px solid ${logColor}40` : "1px solid var(--brand-border)",
                  }}>

                  {/* Card header */}
                  <div className="flex items-start justify-between p-4 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: isLogged && logColor ? `${logColor}20` : "var(--brand-card)" }}>
                        {isLogged && logColor
                          ? <div className="w-3 h-3 rounded-full" style={{ background: logColor }} />
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
                            {Math.round(macros.kcal)} cal &middot; {Math.round(macros.protein)}P &middot; {Math.round(macros.carbs)}C &middot; {Math.round(macros.fats)}F
                          </p>
                        )}
                      </div>
                    </div>
                    {isLogged && logColor && logOpt && (
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                        style={{ background: `${logColor}20`, color: logColor }}>
                        {logOpt.label}
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

                  {/* Off-plan details */}
                  {mealLog?.adherence === "Off-plan" && mealLog.off_plan_details && (
                    <div className="mx-4 my-2 px-3 py-2 rounded-xl text-xs"
                      style={{ background: "#8b5cf610", color: "#8b5cf6", border: "1px solid #8b5cf630" }}>
                      <span className="font-medium">Had: </span>{mealLog.off_plan_details}
                      {(mealLog.est_protein || mealLog.est_carbs || mealLog.est_fats) && (
                        <span className="ml-2 opacity-80">
                          {mealLog.est_kcal ? `${Math.round(mealLog.est_kcal)} cal \u00b7 ` : ""}
                          {mealLog.est_protein ? `${Math.round(mealLog.est_protein)}P` : ""}
                          {mealLog.est_carbs   ? ` ${Math.round(mealLog.est_carbs)}C`  : ""}
                          {mealLog.est_fats    ? ` ${Math.round(mealLog.est_fats)}F`   : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Adherence pill chips: \u00bc \u00b7 \u00bd \u00b7 \u00be \u00b7 Full \u00b7 Off Plan + Camera */}
                  <div className="px-3 pt-2 pb-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {ADHERENCE_OPTIONS.map(opt => {
                        const isActive = mealLog?.adherence === opt.key;
                        return (
                          <button key={opt.key}
                            onClick={() => logAdherence(meal, opt.key)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                            style={{
                              background: isActive ? `${opt.color}25` : "var(--brand-card)",
                              color: isActive ? opt.color : "var(--brand-text-secondary)",
                              border: `1.5px solid ${isActive ? opt.color : "transparent"}`,
                              opacity: isSaving ? 0.5 : 1,
                            }}>
                            {opt.label}
                          </button>
                        );
                      })}
                      {/* Camera button \u2014 beside Off Plan */}
                      <button
                        onClick={() => {
                          const existing = logs.find(l => l.meal_position === meal.position);
                          setOffPlanDetails(existing?.off_plan_details || "");
                          setOffPlanKcal(existing?.est_kcal?.toString() || "");
                          setOffPlanP(existing?.est_protein?.toString() || "");
                          setOffPlanC(existing?.est_carbs?.toString() || "");
                          setOffPlanF(existing?.est_fats?.toString() || "");
                          setPhotoResult(null);
                          setOffPlanModal({ mealId: meal.id, position: meal.position, mealName: meal.name });
                          setTimeout(() => cameraRef.current?.click(), 120);
                        }}
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}
                        title="Snap photo for AI macro analysis">
                        <i className="ti ti-camera text-sm" />
                      </button>
                    </div>
                  </div>

                  {/* Notes field */}
                  <div className="px-3 pb-3">
                    <input
                      type="text"
                      value={noteVal}
                      placeholder="Add a note..."
                      onChange={e => setNotesMap(prev => ({ ...prev, [meal.position]: e.target.value }))}
                      onBlur={() => saveNotes(meal.position)}
                      className="w-full text-xs px-3 py-2 rounded-xl outline-none"
                      style={{
                        background: "var(--brand-bg)",
                        color: "var(--brand-text)",
                        border: "1px solid var(--brand-border)",
                      }}
                    />
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
                  const dow = d.getDay();
                  const diff = i + 1 - (dow === 0 ? 7 : dow);
                  const clone = new Date(d);
                  clone.setDate(d.getDate() + diff);
                  const dateStr = clone.toISOString().split("T")[0];
                  const dayLogs = weekLogs.filter(l => l.log_date === dateStr);
                  const hasLog  = dayLogs.length > 0;
                  const allFull = hasLog && dayLogs.every(l => l.adherence === "Full");
                  return (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{
                          background: !hasLog ? "var(--brand-card)" : allFull ? "#22c55e20" : "#f59e0b20",
                          border: `1px solid ${!hasLog ? "var(--brand-border)" : allFull ? "#22c55e" : "#f59e0b"}`,
                        }}>
                        <span className="text-xs">{!hasLog ? "-" : allFull ? "check" : "~"}</span>
                      </div>
                      <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
