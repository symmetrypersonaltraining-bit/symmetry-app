"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeDayTotals, PlanMeal, PlanItem, LogRow } from "@/lib/nutrition/dailyTotals";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

interface MacroState { kcal: number; protein: number; carbs: number; fats: number; }
interface TargetState { calories: number; protein: number; carbs: number; fats: number; }

function hmKcal(p: number, c: number, f: number) { return 4 * p + 4 * c + 9 * f; }

export default function HomeMacrosCard() {
  const [consumed, setConsumed] = useState<MacroState | null>(null);
  const [target, setTarget] = useState<TargetState | null>(null);
  const [shownKcal, setShownKcal] = useState(0);
  const prevKcal = useRef(0);

  useEffect(() => {
    let on = true;
    (async () => {
      const supabase = createClient();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      let clientId: string | null = null;
      try { clientId = new URLSearchParams(window.location.search).get("forClient"); } catch { clientId = null; }
      if (!clientId) {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData ? userData.user : null;
        if (!user) return;
        if ((user.email || "") === TRAINER_EMAIL) {
          const { data: c } = await supabase.from("clients").select("id").ilike("name", "%Dustin%").limit(1);
          clientId = c && c[0] ? c[0].id : null;
        } else {
          const { data: c } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).limit(1);
          clientId = c && c[0] ? c[0].id : null;
        }
      }
      if (!clientId || !on) return;
      // For v3 clients the home ring MUST match the Nutrition screen's top card
      // exactly. That card computes today's totals via computeDayTotals (the
      // canonical calc). Fetch the same inputs and — when the v3 flag is on —
      // run the same function so the numbers never diverge. Non-v3 clients keep
      // the legacy inline proration below.
      const [logsRes, mtRes, mpRes, settingsRes] = await Promise.all([
        supabase.from("meal_adherence_logs").select("*").eq("client_id", clientId).eq("log_date", today),
        supabase.from("macro_targets").select("*").eq("client_id", clientId).lte("effective_date", today).order("effective_date", { ascending: false }).limit(1),
        supabase.from("meal_plans").select("id, meals(id, name, timing, position, swaps, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))").eq("client_id", clientId).eq("status", "live").lte("effective_date", today).order("effective_date", { ascending: false }).limit(1),
        // Tolerates the column not existing yet (flag stays off → legacy calc).
        supabase.from("client_app_settings").select("nutrition_v3").eq("client_id", clientId).maybeSingle(),
      ]);
      if (!on) return;
      const mt = (mtRes.data || [])[0] as TargetState | undefined;
      const plan = (mpRes.data || [])[0] as {
        meals?: { id: string; name?: string | null; timing?: string | null; position?: number | null; swaps?: string | null;
          meal_items?: Array<Record<string, unknown>> }[];
      } | undefined;
      const nutritionV3 = (settingsRes.data as { nutrition_v3?: boolean } | null)?.nutrition_v3 === true;

      if (nutritionV3) {
        // Canonical path — identical to NutritionV3Client's `totals`.
        const planMeals: PlanMeal[] = (plan?.meals || []).map((m) => ({
          id: String(m.id),
          name: String(m.name ?? ""),
          timing: (m.timing ?? null) as string | null,
          position: Number(m.position) || 0,
          swaps: (m.swaps ?? null) as string | null,
          meal_items: ((m.meal_items || []) as Array<Record<string, unknown>>).map((it): PlanItem => ({
            id: String(it.id),
            food: String(it.food || ""),
            amount: (it.amount ?? null) as number | null,
            unit: (it.unit ?? null) as string | null,
            is_unlimited: !!it.is_unlimited,
            basis: (it.basis ?? null) as string | null,
            protein: (it.protein ?? null) as number | null,
            carbs: (it.carbs ?? null) as number | null,
            fats: (it.fats ?? null) as number | null,
            position: Number(it.position) || 0,
          })),
        }));
        const t = computeDayTotals((logsRes.data || []) as LogRow[], planMeals);
        setConsumed({ kcal: t.kcal, protein: t.protein, carbs: t.carbs, fats: t.fats });
      } else {
        // Legacy inline proration (unchanged behavior for non-v3 clients).
        const logs = (logsRes.data || []) as { adherence: string; meal_id: string | null; est_kcal: number | null; est_protein: number | null; est_carbs: number | null; est_fats: number | null }[];
        const mealMacros: Record<string, { p: number; c: number; f: number }> = {};
        for (const meal of (plan && plan.meals) || []) {
          let p = 0, c = 0, f = 0;
          for (const it of (meal.meal_items || []) as Array<{ protein?: number | null; carbs?: number | null; fats?: number | null }>) {
            p += it.protein || 0; c += it.carbs || 0; f += it.fats || 0;
          }
          mealMacros[meal.id] = { p, c, f };
        }
        const PCT: Record<string, number> = { "1/4": 0.25, "1/2": 0.5, "3/4": 0.75, "Full": 1, "Partial": 0.5, "Skipped": 0 };
        let p = 0, c = 0, f = 0, k = 0;
        for (const log of logs) {
          if (log.adherence === "Off-plan") {
            p += log.est_protein || 0; c += log.est_carbs || 0; f += log.est_fats || 0;
            k += log.est_kcal != null ? log.est_kcal : hmKcal(log.est_protein || 0, log.est_carbs || 0, log.est_fats || 0);
          } else {
            const pct = PCT[log.adherence];
            if (pct && log.meal_id && mealMacros[log.meal_id]) {
              const m = mealMacros[log.meal_id];
              p += m.p * pct; c += m.c * pct; f += m.f * pct; k += hmKcal(m.p, m.c, m.f) * pct;
            }
          }
        }
        setConsumed({ kcal: k, protein: p, carbs: c, fats: f });
      }
      if (mt) setTarget({ calories: mt.calories || 0, protein: mt.protein || 0, carbs: mt.carbs || 0, fats: mt.fats || 0 });
    })();
    return () => { on = false; };
  }, []);

  const kcal = Math.round(consumed ? consumed.kcal : 0);
  useEffect(() => {
    const start = prevKcal.current, end = kcal, t0 = performance.now(), dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const x = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - x, 3);
      setShownKcal(Math.round(start + (end - start) * e));
      if (x < 1) raf = requestAnimationFrame(tick); else prevKcal.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kcal]);

  if (!consumed) return null;

  const tKcal = target ? target.calories : 0, tP = target ? target.protein : 0, tC = target ? target.carbs : 0, tF = target ? target.fats : 0;
  const RING_C = 2 * Math.PI * 20;
  const ARC_L = 163.4;
  const pctOf = (v: number, t: number) => (t > 0 ? Math.min(v / t, 1) : 0);
  function ring(label: string, value: number, tgt: number, color: string) {
    return (
      <div className="flex flex-col items-center gap-0.5" style={{ width: 56 }}>
        <div className="relative" style={{ width: 48, height: 48 }}>
          <svg width="48" height="48" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--brand-border)" strokeWidth="6" />
            <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={String(RING_C)} strokeDashoffset={String(RING_C * (1 - pctOf(value, tgt)))}
              style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-extrabold" style={{ color, fontSize: 11 }}>{Math.round(value)}</div>
        </div>
        <span className="font-bold tracking-wider" style={{ color: "var(--brand-text-secondary)", fontSize: 9 }}>{label}</span>
        <span className="font-semibold" style={{ color: "var(--brand-text)", fontSize: 10 }}>{Math.round(value)} / {Math.round(tgt)}g</span>
      </div>
    );
  }
  return (
    <div className="rounded-3xl p-4 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Today&apos;s Nutrition</h2>
        <a href="/nutrition" className="text-xs font-semibold" style={{ color: "var(--brand-primary)" }}>Log →</a>
      </div>
      <style>{"@keyframes hmFlick{0%,100%{transform:translateX(-50%) scale(1)}50%{transform:translateX(-50%) scale(1.18) rotate(-4deg)}}"}</style>
      <div className="flex items-start justify-between">
        {ring("PROTEIN", consumed.protein, tP, "var(--brand-primary)")}
        <div className="flex flex-col items-center flex-1" style={{ minWidth: 110 }}>
          <div className="relative" style={{ height: 58, marginTop: -8, marginBottom: -12 }}>
            <svg width="106" height="58" viewBox="0 0 128 70">
              <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke="var(--brand-border)" strokeWidth="9" strokeLinecap="round" />
              <path d="M 12 64 A 52 52 0 0 1 116 64" fill="none" stroke="url(#homeKcalGrad)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={String(ARC_L)} strokeDashoffset={String(ARC_L * (1 - pctOf(consumed.kcal, tKcal)))}
                style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
              <defs>
                <linearGradient id="homeKcalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand-primary)" />
                  <stop offset="55%" stopColor="#5ec9a3" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>
            </svg>
            <span className="absolute" style={{ left: "50%", top: 10, transform: "translateX(-50%)", fontSize: 14, animation: "hmFlick 1.6s ease-in-out infinite" }}>🔥</span>
          </div>
          <div className="font-extrabold leading-none relative" style={{ color: "var(--brand-text)", fontSize: 30, fontVariantNumeric: "tabular-nums", zIndex: 1 }}>{shownKcal.toLocaleString()}</div>
          <div style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>
            of <b style={{ color: "var(--brand-text)" }}>{tKcal.toLocaleString()}</b> cal · <b style={{ color: "var(--brand-text)" }}>{Math.max(tKcal - kcal, 0).toLocaleString()}</b> left
          </div>
        </div>
        {ring("CARBS", consumed.carbs, tC, "#5ec9a3")}
        {ring("FATS", consumed.fats, tF, "#f59e0b")}
      </div>
    </div>
  );
}
