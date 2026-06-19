"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Metric { id: string; metric_date: string; weight: number | null; body_fat_pct: number | null; lean_mass: number | null; fat_mass: number | null; }
interface CardioLog { id: string; log_date: string; type: string | null; duration_minutes: number | null; distance: number | null; calories: number | null; avg_hr: number | null; }

const CARDIO_TYPES = ["Walk", "Run", "Bike", "Elliptical", "Stair Climber", "Row", "Swim", "HIIT", "Other"];

interface Props { clientId: string; today: string; recentMetrics: Metric[]; recentCardio: CardioLog[]; }

export default function LogClient({ clientId, today, recentMetrics, recentCardio }: Props) {
  const supabase = createClient();
  const [tab, setTab] = useState<"weigh" | "cardio">("weigh");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Weigh-in state
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [weighDate, setWeighDate] = useState(today);

  // Cardio state
  const [cardioType, setCardioType] = useState("Walk");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [cardioKcal, setCardioKcal] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [cardioDate, setCardioDate] = useState(today);

  const [metrics, setMetrics] = useState<Metric[]>(recentMetrics);
  const [cardioLogs, setCardioLogs] = useState<CardioLog[]>(recentCardio);

  async function saveWeighIn() {
    if (!weight) return;
    setSaving(true);
    try {
      const w = parseFloat(weight);
      const bf = bodyFat ? parseFloat(bodyFat) : null;
      const lean = bf !== null ? w * (1 - bf / 100) : null;
      const fat = bf !== null ? w * (bf / 100) : null;
      const { data } = await supabase.from("metrics").upsert({
        client_id: clientId,
        metric_date: weighDate,
        weight: w,
        body_fat_pct: bf,
        lean_mass: lean,
        fat_mass: fat,
        source: "client_app",
      }, { onConflict: "client_id,metric_date" }).select().single();
      if (data) {
        setMetrics(prev => [data as Metric, ...prev.filter(m => m.metric_date !== weighDate)].slice(0, 5));
      }
      setWeight(""); setBodyFat("");
      setSuccess("Weight logged!");
      setTimeout(() => setSuccess(null), 2500);
    } finally { setSaving(false); }
  }

  async function saveCardio() {
    if (!duration) return;
    setSaving(true);
    try {
      const { data } = await supabase.from("cardio_logs").insert({
        client_id: clientId,
        log_date: cardioDate,
        type: cardioType,
        duration_minutes: duration ? parseFloat(duration) : null,
        distance: distance ? parseFloat(distance) : null,
        calories: cardioKcal ? parseFloat(cardioKcal) : null,
        avg_hr: avgHr ? parseInt(avgHr) : null,
        source: "client_app",
      }).select().single();
      if (data) {
        setCardioLogs(prev => [data as CardioLog, ...prev].slice(0, 5));
      }
      setDuration(""); setDistance(""); setCardioKcal(""); setAvgHr("");
      setSuccess("Cardio logged!");
      setTimeout(() => setSuccess(null), 2500);
    } finally { setSaving(false); }
  }

  function fmtDate(d: string) {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="pb-24" style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {/* Success toast */}
      {success && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-semibold text-white shadow-lg"
          style={{ background: "#22c55e" }}>
          ✓ {success}
        </div>
      )}

      <div className="px-4 pt-6 pb-4" style={{ background: "var(--brand-surface)", borderBottom: "1px solid var(--brand-border)" }}>
        <h1 className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>Log</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 py-3">
        {(["weigh", "cardio"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={t === tab
              ? { background: "var(--brand-primary)", color: "white" }
              : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
            {t === "weigh" ? "⚖️ Weigh-In" : "🏃 Cardio"}
          </button>
        ))}
      </div>

      <div className="px-4">
        {tab === "weigh" ? (
          <div>
            <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Date</label>
                <input type="date" value={weighDate} onChange={e => setWeighDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Weight (lb)</label>
                  <input type="number" value={weight} onChange={e => setWeight(e.target.value)}
                    placeholder="e.g. 185" inputMode="decimal"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Body Fat % (optional)</label>
                  <input type="number" value={bodyFat} onChange={e => setBodyFat(e.target.value)}
                    placeholder="e.g. 22.5" inputMode="decimal"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
              </div>
              <button onClick={saveWeighIn} disabled={saving || !weight}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all"
                style={{ background: weight ? "var(--brand-primary)" : "var(--brand-card)", opacity: weight ? 1 : 0.5 }}>
                {saving ? "Saving…" : "Log Weight"}
              </button>
            </div>
            {/* Recent */}
            {metrics.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--brand-text-secondary)" }}>Recent</p>
                {metrics.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-xl mb-2"
                    style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                    <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{fmtDate(m.metric_date)}</span>
                    <div className="flex gap-4">
                      {m.weight && <span className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{m.weight} lb</span>}
                      {m.body_fat_pct && <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{m.body_fat_pct}% BF</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Date</label>
                <input type="date" value={cardioDate} onChange={e => setCardioDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
              </div>
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Type</label>
                <div className="flex gap-2 flex-wrap">
                  {CARDIO_TYPES.map(t => (
                    <button key={t} onClick={() => setCardioType(t)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                      style={t === cardioType
                        ? { background: "var(--brand-primary)", color: "white" }
                        : { background: "var(--brand-card)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Duration (min)</label>
                  <input type="number" value={duration} onChange={e => setDuration(e.target.value)}
                    placeholder="30" inputMode="numeric"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Distance (mi)</label>
                  <input type="number" value={distance} onChange={e => setDistance(e.target.value)}
                    placeholder="—" inputMode="decimal"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Calories</label>
                  <input type="number" value={cardioKcal} onChange={e => setCardioKcal(e.target.value)}
                    placeholder="—" inputMode="numeric"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Avg HR (bpm)</label>
                  <input type="number" value={avgHr} onChange={e => setAvgHr(e.target.value)}
                    placeholder="—" inputMode="numeric"
                    className="w-full px-3 py-3 rounded-xl text-base font-semibold text-center outline-none"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                </div>
              </div>
              <button onClick={saveCardio} disabled={saving || !duration}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all"
                style={{ background: duration ? "#f59e0b" : "var(--brand-card)", opacity: duration ? 1 : 0.5 }}>
                {saving ? "Saving…" : "Log Cardio"}
              </button>
            </div>
            {/* Recent */}
            {cardioLogs.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: "var(--brand-text-secondary)" }}>Recent</p>
                {cardioLogs.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl mb-2"
                    style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{c.type || "Cardio"}</p>
                      <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{fmtDate(c.log_date)}</p>
                    </div>
                    <div className="text-right">
                      {c.duration_minutes && <p className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{c.duration_minutes} min</p>}
                      {c.distance && <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{c.distance} mi</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
