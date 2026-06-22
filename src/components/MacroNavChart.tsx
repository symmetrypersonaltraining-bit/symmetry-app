"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface MacroData {
  calories: number; caloriesGoal: number;
  protein: number; proteinGoal: number;
  carbs: number; carbsGoal: number;
  fat: number; fatGoal: number;
}

export default function MacroNavChart({ active = false }: { active?: boolean }) {
  const [data, setData] = useState<MacroData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const today = new Date().toISOString().split("T")[0];
        const { data: target } = await supabase
          .from("macro_targets")
          .select("calories, protein, carbs, fats")
          .eq("client_id", user.id)
          .lte("effective_date", today)
          .order("effective_date", { ascending: false })
          .limit(1)
          .single();
        const caloriesGoal = Number(target?.calories ?? 2000);
        const proteinGoal = Number(target?.protein ?? 150);
        const carbsGoal = Number(target?.carbs ?? 200);
        const fatGoal = Number(target?.fats ?? 60);
        const { data: logs } = await supabase
          .from("meal_logs")
          .select("meal_id")
          .eq("client_id", user.id)
          .eq("log_date", today)
          .eq("adherence", "on_plan");
        if (!logs?.length) {
          setData({ calories: 0, caloriesGoal, protein: 0, proteinGoal, carbs: 0, carbsGoal, fat: 0, fatGoal });
          return;
        }
        const { data: items } = await supabase
          .from("meal_items")
          .select("protein, carbs, fats")
          .in("meal_id", logs.map((l) => l.meal_id));
        const t = (items ?? []).reduce(
          (a, i) => ({ p: a.p + Number(i.protein ?? 0), c: a.c + Number(i.carbs ?? 0), f: a.f + Number(i.fats ?? 0) }),
          { p: 0, c: 0, f: 0 }
        );
        setData({
          calories: t.p * 4 + t.c * 4 + t.f * 9, caloriesGoal,
          protein: t.p, proteinGoal,
          carbs: t.c, carbsGoal,
          fat: t.f, fatGoal,
        });
      } catch { /* silent */ }
    }
    load();
  }, []);

  const S = 24, cx = 12, cy = 12, r = 8, sw = 3.5;
  const C = 2 * Math.PI * r;

  function seg(pct: number, startFrac: number, color: string) {
    const filled = Math.min(1, Math.max(0, pct));
    const dash = (filled / 3) * C;
    const offset = -(startFrac * C);
    return (
      <circle key={startFrac} cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
  }

  const textColor = active ? "var(--brand-primary)" : "var(--brand-text-secondary)";
  const p = data ? Math.min(1, data.protein / (data.proteinGoal || 150)) : 0;
  const c = data ? Math.min(1, data.carbs / (data.carbsGoal || 200)) : 0;
  const f = data ? Math.min(1, data.fat / (data.fatGoal || 60)) : 0;

  return (
    <>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={textColor} strokeWidth={sw} opacity={0.15} />
        {seg(p, 0, "#3b82f6")}
        {seg(c, 1 / 3, "#f59e0b")}
        {seg(f, 2 / 3, "#f97316")}
      </svg>
      <span className="text-[10px] font-medium" style={{ color: textColor }}>Macros</span>
    </>
  );
           }
