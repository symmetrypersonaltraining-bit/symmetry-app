"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface DayMacros { cal: number; calGoal: number; p: number; c: number; f: number; pGoal: number; cGoal: number; fGoal: number; }

function fraction(a: string | null): number {
  switch (String(a || "").toLowerCase()) {
    case "full": return 1;
    case "3/4": return 0.75;
    case "1/2": return 0.5;
    case "partial": return 0.5;
    case "skipped": return 0;
    case "off-plan": return 0;
    default: return 1;
  }
}

function Ring({ value, goal, color, size, stroke, showNum, sub, label }: { value: number; goal: number; color: string; size: number; stroke: number; showNum?: boolean; sub?: string; label?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  const R = (size - stroke) / 2;
  const C = 2 * Math.PI * R;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const off = mounted ? C * (1 - pct) : C;
  const c2 = size / 2;
  return (
    <div style={{ textAlign: "center" }}>
      <div className="relative" style={{ width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
          <circle cx={c2} cy={c2} r={R} fill="none" stroke="var(--brand-border)" strokeWidth={stroke} />
          <circle cx={c2} cy={c2} r={R} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={off}
            style={{ transition: "stroke-dashoffset 1s ease", transform: "rotate(-90deg)", transformOrigin: c2 + "px " + c2 + "px" }} />
        </svg>
        {showNum && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span style={{ fontSize: size > 50 ? "13px" : "11px", fontWeight: 800, color: "var(--brand-text)", lineHeight: 1 }}>{Math.round(value)}</span>
            {sub && <span style={{ fontSize: "7px", color: "var(--brand-text-secondary)" }}>{sub}</span>}
          </div>
        )}
      </div>
      {label && <div style={{ fontSize: "9px", fontWeight: 600, color: color, marginTop: 3 }}>{label}</div>}
    </div>
  );
}

export default function DailyMacrosRing() {
  const [d, setD] = useState<DayMacros | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const blank = { cal: 0, calGoal: 2000, p: 0, c: 0, f: 0, pGoal: 0, cGoal: 0, fGoal: 0 };
        if (!user) { setD(blank); return; }
        const { data: client } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        const clientId = client?.id;
        if (!clientId) { setD(blank); return; }
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const [{ data: target }, { data: logs }] = await Promise.all([
          supabase.from("macro_targets").select("calories, protein, carbs, fats, effective_date").eq("client_id", clientId).lte("effective_date", today).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("meal_adherence_logs").select("adherence, meal_id, est_kcal, est_protein, est_carbs, est_fats, trainer_macro_override").eq("client_id", clientId).eq("log_date", today),
        ]);
        const calGoal = Number(target?.calories ?? 2000);
        const pGoal = Number(target?.protein ?? 0);
        const cGoal = Number(target?.carbs ?? 0);
        const fGoal = Number(target?.fats ?? 0);
        const rows = (logs as any[]) || [];
        const ids = [...new Set(rows.map(l => l.meal_id).filter(Boolean))] as string[];
        const planned: Record<string, { p: number; c: number; f: number }> = {};
        if (ids.length) {
          const { data: items } = await supabase.from("meal_items").select("meal_id, protein, carbs, fats").in("meal_id", ids);
          for (const it of (items as any[]) || []) {
            const cur = planned[it.meal_id] || { p: 0, c: 0, f: 0 };
            cur.p += Number(it.protein) || 0; cur.c += Number(it.carbs) || 0; cur.f += Number(it.fats) || 0;
            planned[it.meal_id] = cur;
          }
        }
        let p = 0, c = 0, f = 0;
        for (const l of rows) {
          const ov = l.trainer_macro_override;
          if (ov && (ov.protein != null || ov.carbs != null || ov.fats != null)) {
            p += Number(ov.protein) || 0; c += Number(ov.carbs) || 0; f += Number(ov.fats) || 0; continue;
          }
          if (l.est_protein != null || l.est_carbs != null || l.est_fats != null) {
            p += Number(l.est_protein) || 0; c += Number(l.est_carbs) || 0; f += Number(l.est_fats) || 0; continue;
          }
          const fr = fraction(l.adherence);
          const pl = l.meal_id ? planned[l.meal_id] : null;
          if (fr > 0 && pl) { p += pl.p * fr; c += pl.c * fr; f += pl.f * fr; }
        }
        const cal = Math.round(4 * p + 4 * c + 9 * f);
        setD({ cal, calGoal, p: Math.round(p), c: Math.round(c), f: Math.round(f), pGoal, cGoal, fGoal });
      } catch {
        setD({ cal: 0, calGoal: 2000, p: 0, c: 0, f: 0, pGoal: 0, cGoal: 0, fGoal: 0 });
      }
    })();
  }, []);

  const dd = d || { cal: 0, calGoal: 2000, p: 0, c: 0, f: 0, pGoal: 0, cGoal: 0, fGoal: 0 };

  return (
    <>
      <div onClick={() => setOpen(true)} className="rounded-2xl p-3 cursor-pointer h-full"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Macros</span>
          <i className="ti ti-arrows-maximize" style={{ fontSize: 13, color: "var(--brand-text-secondary)" }} />
        </div>
        <div className="flex items-end justify-around">
          <Ring value={dd.cal} goal={dd.calGoal} color="#0EA5E9" size={46} stroke={5} showNum sub="kcal" label="Cal" />
          <Ring value={dd.p} goal={dd.pGoal} color="#22c55e" size={34} stroke={4} label={"P " + dd.p} />
          <Ring value={dd.c} goal={dd.cGoal} color="#f59e0b" size={34} stroke={4} label={"C " + dd.c} />
          <Ring value={dd.f} goal={dd.fGoal} color="#e84e4e" size={34} stroke={4} label={"F " + dd.f} />
        </div>
      </div>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="w-full" style={{ maxWidth: 480, background: "var(--brand-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: "var(--brand-border)", margin: "0 auto 16px" }} />
            <p className="text-base font-bold" style={{ color: "var(--brand-text)", marginBottom: 4 }}>Today&apos;s Macros</p>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)", marginBottom: 16 }}>Consumed vs assigned</p>
            <div className="flex items-start justify-around" style={{ marginBottom: 18, gap: 4 }}>
              <Ring value={dd.cal} goal={dd.calGoal} color="#0EA5E9" size={70} stroke={7} showNum sub="kcal" label={dd.cal + " / " + dd.calGoal} />
              <Ring value={dd.p} goal={dd.pGoal} color="#22c55e" size={70} stroke={7} showNum sub="g" label={"Protein " + dd.p + "/" + dd.pGoal} />
              <Ring value={dd.c} goal={dd.cGoal} color="#f59e0b" size={70} stroke={7} showNum sub="g" label={"Carbs " + dd.c + "/" + dd.cGoal} />
              <Ring value={dd.f} goal={dd.fGoal} color="#e84e4e" size={70} stroke={7} showNum sub="g" label={"Fat " + dd.f + "/" + dd.fGoal} />
            </div>
            <Link href="/nutrition?viewAsClient=true" className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold" style={{ background: "var(--brand-primary)", color: "white" }}>
              <i className="ti ti-salad" /> Log nutrition
            </Link>
            <button onClick={() => setOpen(false)} type="button" className="w-full mt-2 py-2 text-sm" style={{ background: "none", border: "none", color: "var(--brand-text-secondary)" }}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
