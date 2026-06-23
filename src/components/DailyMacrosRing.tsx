"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface DayMacros { cal: number; calGoal: number; p: number; c: number; f: number; }

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

export default function DailyMacrosRing() {
  const [d, setD] = useState<DayMacros | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setD({ cal: 0, calGoal: 2000, p: 0, c: 0, f: 0 }); return; }
        const { data: client } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        const clientId = client?.id;
        if (!clientId) { setD({ cal: 0, calGoal: 2000, p: 0, c: 0, f: 0 }); return; }
        const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const [{ data: target }, { data: logs }] = await Promise.all([
          supabase.from("macro_targets").select("calories, protein, carbs, fats, effective_date").eq("client_id", clientId).lte("effective_date", today).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
          supabase.from("meal_adherence_logs").select("adherence, meal_id, est_kcal, est_protein, est_carbs, est_fats, trainer_macro_override").eq("client_id", clientId).eq("log_date", today),
        ]);
        const calGoal = Number(target?.calories ?? 2000);
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
        setD({ cal, calGoal, p: Math.round(p), c: Math.round(c), f: Math.round(f) });
      } catch {
        setD({ cal: 0, calGoal: 2000, p: 0, c: 0, f: 0 });
      }
    })();
  }, []);

  const R = 26;
  const CIRC = 2 * Math.PI * R;
  const pct = d && d.calGoal > 0 ? Math.min(1, d.cal / d.calGoal) : 0;
  const offset = mounted ? CIRC * (1 - pct) : CIRC;

  return (
    <Link href="/nutrition">
      <div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer h-full"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="relative flex-shrink-0" style={{ width: 60, height: 60 }}>
          <svg width="60" height="60" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--brand-border)" strokeWidth="6" />
            <circle cx="32" cy="32" r={R} fill="none" stroke="#0EA5E9" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease", transform: "rotate(-90deg)", transformOrigin: "32px 32px" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs font-bold leading-none" style={{ color: "var(--brand-text)" }}>{d ? d.cal : "—"}</span>
            <span style={{ fontSize: "8px", color: "var(--brand-text-secondary)" }}>kcal</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Macros</p>
          <p className="text-xs mb-1" style={{ color: "var(--brand-text-secondary)" }}>{d ? ("of " + d.calGoal) : "Today"}</p>
          <div className="flex gap-2" style={{ fontSize: "10px", fontWeight: 600 }}>
            <span style={{ color: "#22c55e" }}>P {d ? d.p : 0}</span>
            <span style={{ color: "#f59e0b" }}>C {d ? d.c : 0}</span>
            <span style={{ color: "#ef4444" }}>F {d ? d.f : 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
