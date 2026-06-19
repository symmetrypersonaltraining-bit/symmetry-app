"use client";

import { useState } from "react";

interface MetricPoint {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

interface RecentW {
  id: string;
  scheduled_date: string;
  status: string;
  days: { label: string } | null;
}

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  injuries_limitations: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  training_frequency: number | null;
  current_weight: number | null;
  current_body_fat_pct: number | null;
}

interface Props {
  client: Client;
  metrics: MetricPoint[];
  recent: RecentW[];
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span style={{ color: "var(--brand-text-secondary)", fontSize: 12 }}>—</span>;
  const w = 80, h = 28, pad = 3;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={`M ${pts.join(" L ")}`} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ClientProfileTabs({ client, metrics, recent }: Props) {
  const [tab, setTab] = useState<"metrics" | "history" | "info">("metrics");

  const tabs = [
    { id: "metrics" as const, label: "Metrics", icon: "ti-chart-line" },
    { id: "history" as const, label: "History", icon: "ti-history" },
    { id: "info" as const, label: "Info", icon: "ti-user" },
  ];

  const weights = metrics.map(m => m.weight).filter((v): v is number => v != null);
  const bodyFats = metrics.map(m => m.body_fat_pct).filter((v): v is number => v != null);
  const leanMasses = metrics.map(m => m.lean_mass).filter((v): v is number => v != null);

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl p-1 mb-4"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: tab === t.id ? "var(--brand-primary)" : "transparent",
              color: tab === t.id ? "white" : "var(--brand-text-secondary)",
            }}>
            <i className={`ti ${t.icon} text-sm`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* METRICS TAB */}
      {tab === "metrics" && (
        <div className="space-y-3">
          {[
            { label: "Body Weight", values: weights, unit: "lb", color: "var(--brand-primary)", icon: "ti-scale" },
            { label: "Body Fat %", values: bodyFats, unit: "%", color: "#f59e0b", icon: "ti-percentage" },
            { label: "Lean Mass", values: leanMasses, unit: "lb", color: "#22c55e", icon: "ti-barbell" },
          ].map(m => {
            const latest = m.values.length > 0 ? m.values[m.values.length - 1] : null;
            const prev = m.values.length > 1 ? m.values[m.values.length - 2] : null;
            const delta = latest != null && prev != null ? (latest - prev) : null;
            return (
              <div key={m.label} className="rounded-xl p-4 flex items-center gap-4"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${m.color}15` }}>
                  <i className={`ti ${m.icon} text-base`} style={{ color: m.color }} />
                </div>
                <div className="flex-1">
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{m.label}</p>
                  <p className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>
                    {latest != null ? `${latest}${m.unit}` : "—"}
                    {delta != null && (
                      <span className="text-xs font-normal ml-2" style={{ color: delta <= 0 ? "#22c55e" : "#ef4444" }}>
                        {delta > 0 ? "+" : ""}{delta.toFixed(1)}{m.unit}
                      </span>
                    )}
                  </p>
                </div>
                <MiniSparkline values={m.values} color={m.color} />
              </div>
            );
          })}
          {metrics.length === 0 && (
            <div className="rounded-xl py-8 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-chart-bar text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No metrics logged yet</p>
            </div>
          )}
        </div>
      )}

      {/* HISTORY TAB */}
      {tab === "history" && (
        <div>
          {recent.length === 0 ? (
            <div className="rounded-xl py-8 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-history text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No completed workouts yet</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              {recent.map((w, i) => (
                <div key={w.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < recent.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--brand-border)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: w.status === "completed" ? "#22c55e20" : "var(--brand-card)" }}>
                    <i className={`ti ${w.status === "completed" ? "ti-check" : "ti-x"} text-sm`}
                      style={{ color: w.status === "completed" ? "#22c55e" : "var(--brand-text-secondary)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>
                      {w.days?.label || "Workout"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                      {fmtDate(w.scheduled_date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* INFO TAB */}
      {tab === "info" && (
        <div className="space-y-3">
          <div className="rounded-xl overflow-hidden"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            {[
              { label: "Email", value: client.email },
              { label: "Phone", value: client.phone || "—" },
              { label: "Goal", value: client.primary_goal || "—" },
              { label: "Experience", value: client.experience_level || "—" },
              { label: "Frequency", value: client.training_frequency ? `${client.training_frequency}x / week` : "—" },
            ].map((row, i, arr) => (
              <div key={row.label} className={`flex items-start gap-4 px-4 py-3 ${i < arr.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "var(--brand-border)" }}>
                <span className="text-xs font-medium w-24 flex-shrink-0 pt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  {row.label}
                </span>
                <span className="text-sm flex-1" style={{ color: "var(--brand-text)" }}>{row.value}</span>
              </div>
            ))}
          </div>
          {client.injuries_limitations && (
            <div className="rounded-xl p-4"
              style={{ background: "#fef3c720", border: "1px solid #f59e0b40" }}>
              <p className="text-xs font-semibold mb-1" style={{ color: "#f59e0b" }}>
                <i className="ti ti-alert-triangle mr-1" />Injuries / Limitations
              </p>
              <p className="text-sm" style={{ color: "var(--brand-text)" }}>{client.injuries_limitations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
