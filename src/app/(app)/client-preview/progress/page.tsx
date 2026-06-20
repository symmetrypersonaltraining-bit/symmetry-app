"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

interface MetricRow {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

const RANGES = [
  { label: "1wk", days: 7 },
  { label: "2wk", days: 14 },
  { label: "4wk", days: 28 },
  { label: "8wk", days: 56 },
];

const METRIC_CONFIGS = [
  { key: "weight",       label: "Weight",    unit: "lbs", color: "#0F4C81", canLog: true },
  { key: "body_fat_pct", label: "Body Fat",  unit: "%",   color: "#e87c3e", canLog: true },
  { key: "lean_mass",    label: "Lean Mass", unit: "lbs", color: "#22c55e", canLog: false },
  { key: "fat_mass",     label: "Fat Mass",  unit: "lbs", color: "#e84e4e", canLog: false },
  { key: "workouts",     label: "Workouts",  unit: "",    color: "#8b5cf6", canLog: false },
  { key: "streak",       label: "Streak",    unit: "days",color: "#f59e0b", canLog: false },
  { key: "avg_cardio",   label: "Avg Cardio",unit: "min", color: "#06b6d4", canLog: false },
];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <svg width="80" height="30" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogModal({ clientId, onClose, onSaved }: { clientId: string; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!weight && !bodyFat) return;
    setSaving(true);
    const w = weight ? parseFloat(weight) : null;
    const bf = bodyFat ? parseFloat(bodyFat) : null;
    const lean = w !== null && bf !== null ? w * (1 - bf / 100) : null;
    const fat = w !== null && bf !== null ? w * (bf / 100) : null;

    await supabase.from("metrics").upsert({
      client_id: clientId,
      metric_date: date,
      ...(w !== null && { weight: w }),
      ...(bf !== null && { body_fat_pct: bf }),
      ...(lean !== null && { lean_mass: lean }),
      ...(fat !== null && { fat_mass: fat }),
      source: "client_app",
    }, { onConflict: "client_id,metric_date" });

    setSaving(false);
    setSuccess(true);
    setTimeout(() => { onSaved(); onClose(); }, 800);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--brand-surface)", borderRadius: "16px 16px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--brand-text)" }}>Log Today&apos;s Measurements</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand-text-secondary)", fontSize: 20 }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Weight (lbs)</label>
          <input type="number" step="0.1" placeholder="e.g. 185.5" value={weight} onChange={e => setWeight(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Body Fat % (optional)</label>
          <input type="number" step="0.1" placeholder="e.g. 18.5" value={bodyFat} onChange={e => setBodyFat(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <button onClick={handleSave} disabled={saving || success || (!weight && !bodyFat)}
          style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: success ? "#22c55e" : "var(--brand-primary)", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: (!weight && !bodyFat) ? 0.5 : 1 }}>
          {success ? "✓ Saved!" : saving ? "Saving..." : "Save Measurement"}
        </button>
      </div>
    </div>
  );
}

export default function ClientPreviewProgressPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Dustin");
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [workoutCounts, setWorkoutCounts] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [avgCardio, setAvgCardio] = useState<number | null>(null);
  const [rangeIdx, setRangeIdx] = useState(2);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      // Both trainer (previewing as client) and real client can view this page
      let cr: { id: string; name: string } | null = null;
      if (user.email === TRAINER_EMAIL) {
        const { data } = await supabase.from("clients").select("id, name").ilike("name", "%Dustin%").maybeSingle();
        cr = data;
      } else {
        const { data } = await supabase.from("clients").select("id, name").eq("auth_user_id", user.id).maybeSingle();
        cr = data;
      }
      if (!cr) return;
      setClientId(cr.id);
      setClientName(cr.name || "Dustin");
    };
    init();
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoading(true);
      const days = RANGES[rangeIdx].days;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split("T")[0];

      const [mRes, wRes, cardioRes] = await Promise.all([
        supabase.from("metrics").select("metric_date,weight,body_fat_pct,lean_mass,fat_mass")
          .eq("client_id", clientId).gte("metric_date", sinceStr).order("metric_date"),
        supabase.from("workout_logs").select("id", { count: "exact", head: true })
          .eq("client_id", clientId).eq("completed", true).gte("logged_at", sinceStr + "T00:00:00"),
        supabase.from("cardio_logs").select("duration_minutes")
          .eq("client_id", clientId).gte("log_date", sinceStr),
      ]);

      setMetrics(mRes.data || []);
      setWorkoutCounts(wRes.count || 0);

      // Streak: consecutive days with workout_logs
      const { data: allWorkoutDates } = await supabase
        .from("workout_logs").select("logged_at").eq("client_id", clientId).eq("completed", true).order("logged_at", { ascending: false });
      if (allWorkoutDates && allWorkoutDates.length > 0) {
        const uniqueDates = [...new Set(allWorkoutDates.map((w: any) => w.logged_at?.split("T")[0]).filter(Boolean))].sort().reverse();
        let streak = 0;
        const today = new Date().toISOString().split("T")[0];
        for (let i = 0; i < uniqueDates.length; i++) {
          const expected = new Date();
          expected.setDate(expected.getDate() - i);
          const expStr = expected.toISOString().split("T")[0];
          if (uniqueDates[i] === expStr || (i === 0 && uniqueDates[i] === today)) streak++;
          else break;
        }
        setStreakDays(streak);
      }

      // Avg cardio duration
      const cardioData = cardioRes.data || [];
      if (cardioData.length > 0) {
        const total = cardioData.reduce((sum: number, c: any) => sum + (c.duration_minutes || 0), 0);
        setAvgCardio(Math.round(total / cardioData.length));
      } else {
        setAvgCardio(null);
      }

      setLoading(false);
    };
    load();
  }, [clientId, rangeIdx, refreshKey]);

  function getMetricData(key: string): { date: string; value: number }[] {
    if (["workouts", "streak", "avg_cardio"].includes(key)) return [];
    return metrics.filter(m => m[key as keyof MetricRow] != null)
      .map(m => ({ date: m.metric_date, value: Number(m[key as keyof MetricRow]) }));
  }

  function getCurrentAndChange(key: string): { current: string; change: string } {
    if (key === "workouts") return { current: String(workoutCounts), change: "" };
    if (key === "streak") return { current: streakDays > 0 ? `${streakDays}` : "—", change: "" };
    if (key === "avg_cardio") return { current: avgCardio !== null ? `${avgCardio}` : "—", change: "" };
    const data = getMetricData(key);
    if (data.length === 0) return { current: "—", change: "" };
    const cur = data[data.length - 1].value;
    const start = data[0].value;
    const diff = cur - start;
    const sign = diff >= 0 ? "+" : "";
    return { current: cur.toFixed(1), change: `${sign}${diff.toFixed(1)}` };
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--brand-bg)" }}>
      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 className="text-white font-medium text-lg">Progress</h1>
            <p className="text-white/60 text-sm">{clientName}</p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 10, color: "white", fontWeight: 700, fontSize: 13, padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <i className="ti ti-plus text-sm" />
            Log
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px" }}>
        {RANGES.map((r, i) => (
          <button key={r.label} onClick={() => setRangeIdx(i)}
            style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
              background: rangeIdx === i ? "var(--brand-primary)" : "var(--brand-surface)",
              color: rangeIdx === i ? "white" : "var(--brand-text-secondary)" }}>
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--brand-text-secondary)" }}>Loading...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, padding: "0 16px 20px" }}>
          {METRIC_CONFIGS.map((cfg, idx) => {
            const { current, change } = getCurrentAndChange(cfg.key);
            const sparkData = getMetricData(cfg.key).map(d => d.value);
            const isNeg = change.startsWith("-");
            return (
              <div key={cfg.key}
                style={{ background: "var(--brand-surface)", borderRadius: 12, padding: "12px 14px", borderTop: `3px solid ${cfg.color}`, animationDelay: `${idx * 0.05}s`, position: "relative" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", fontWeight: 600, marginBottom: 4 }}>{cfg.label}</div>
                  {cfg.canLog && (
                    <button onClick={() => setShowLogModal(true)}
                      style={{ background: cfg.color + "20", border: "none", borderRadius: 6, color: cfg.color, fontWeight: 700, fontSize: 10, padding: "2px 7px", cursor: "pointer" }}>
                      + Log
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-text)", lineHeight: 1.1 }}>
                  {current}<span style={{ fontSize: 11, fontWeight: 500, color: "var(--brand-text-secondary)", marginLeft: 2 }}>{cfg.unit}</span>
                </div>
                {change && (
                  <div style={{ fontSize: 11, color: isNeg ? "#22c55e" : "#ef4444", fontWeight: 600, marginTop: 2 }}>
                    {change} {cfg.unit}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Sparkline data={sparkData} color={cfg.color} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showLogModal && clientId && (
        <LogModal
          clientId={clientId}
          onClose={() => setShowLogModal(false)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
