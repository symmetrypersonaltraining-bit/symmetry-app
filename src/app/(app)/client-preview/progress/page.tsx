"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import ProgressCharts from "@/app/(app)/progress/ProgressCharts";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";
type WL = { metric_date: string; weight: number | null; body_fat_pct: number | null; lean_mass: number | null; fat_mass: number | null };

export default function ClientPreviewProgressPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [weightLogs, setWeightLogs] = useState<WL[]>([]);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }
      let cr: { id: string } | null = null;
      if (user.email === TRAINER_EMAIL) {
        const { data } = await supabase.from("clients").select("id").ilike("name", "%Dustin%").maybeSingle();
        cr = data as any;
      } else {
        const { data } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        cr = data as any;
      }
      if (!cr) { setLoading(false); return; }
      setClientId(cr.id);
      const ninety = new Date(); ninety.setDate(ninety.getDate() - 90);
      const { data: bw } = await supabase
        .from("body_weight_logs")
        .select("logged_at, weight_lbs, body_fat_pct")
        .eq("client_id", cr.id)
        .gte("logged_at", ninety.toISOString().split("T")[0])
        .order("logged_at", { ascending: true });
      setWeightLogs((bw || []).map((d: any) => ({ metric_date: d.logged_at, weight: d.weight_lbs, body_fat_pct: d.body_fat_pct ?? null, lean_mass: null, fat_mass: null })));
      const { count } = await supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", cr.id);
      setTotalWorkouts(count || 0);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-center text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading…</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
      <h1 className="text-2xl font-bold gradient-text mb-4">Progress</h1>
      <ProgressCharts weightLogs={weightLogs as any} clientId={clientId} totalWorkouts={totalWorkouts} recentPRs={[]} />
    </div>
  );
}
