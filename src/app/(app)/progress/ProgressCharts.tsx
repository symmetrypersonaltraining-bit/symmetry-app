"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type WeightLog = { metric_date: string; weight: number; body_fat_pct: number | null; lean_mass: number | null; fat_mass: number | null };
type PR = { exercise_name: string; weight: number; reps: number | null; date: string };

interface Props {
  weightLogs: WeightLog[];
  totalWorkouts: number;
  recentPRs: PR[];
  clientId: string | null;
}

const RANGES = ["1wk", "2wk", "4wk", "8wk", "3mo", "1yr", "Custom"];

function filterByRange(logs: WeightLog[], range: string): WeightLog[] {
  const now = new Date();
  const cutoff = new Date();
  switch (range) {
    case "1wk": cutoff.setDate(now.getDate() - 7); break;
    case "2wk": cutoff.setDate(now.getDate() - 14); break;
    case "4wk": cutoff.setDate(now.getDate() - 28); break;
    case "8wk": cutoff.setDate(now.getDate() - 56); break;
    case "3mo": cutoff.setMonth(now.getMonth() - 3); break;
    case "1yr": cutoff.setFullYear(now.getFullYear() - 1); break;
    default: return logs;
  }
  return logs.filter((l) => new Date(l.metric_date) >= cutoff);
}

function WeightChart({ logs }: { logs: WeightLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="py-10 text-center" style={{ color: "#4E6080" }}>
        <i className="ti ti-scale text-4xl block mb-2" style={{ color: "#C8D8EC" }} />
        <p className="text-sm">No weight data yet</p>
<p className="text-xs mt-1">Metrics logged in-app will appear here</p>
      </div>
    );
  }

  const weights = logs.map((l) => l.weight);
  const minW = Math.min(...weights) - 2;
  const maxW = Math.max(...weights) + 2;
  const range = maxW - minW || 1;

  const W = 560;
  const H = 140;
  const PAD = { top: 10, right: 20, bottom: 30, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const xStep = logs.length > 1 ? chartW / (logs.length - 1) : chartW;
  const points = logs.map((l, i) => ({
    x: PAD.left + (logs.length > 1 ? i * xStep : chartW / 2),
    y: PAD.top + chartH - ((l.weight - minW) / range) * chartH,
    w: l.weight,
    date: new Date(l.metric_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  const fillD = `${pathD} L ${points[points.length - 1].x},${H - PAD.bottom} L ${PAD.left},${H - PAD.bottom} Z`;

  const gridWeights = [minW, minW + range / 3, minW + (2 * range) / 3, maxW];
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest.w - first.w;

  return (
    <div>
      <div className="flex justify-between items-end mb-3">
        <div>
          <div className="text-2xl font-medium" style={{ color: "#0D1B2E" }}>
            {latest.w.toFixed(1)} <span className="text-sm font-normal" style={{ color: "#4E6080" }}>lbs</span>
          </div>
          <div className="text-xs" style={{ color: delta <= 0 ? "#059669" : "#DC2626" }}>
            <i className={`ti ${delta <= 0 ? "ti-trending-down" : "ti-trending-up"} text-xs align-middle`} />
            {" "}{delta <= 0 ? "" : "+"}{delta.toFixed(1)} lbs this period
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F4C81" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#0F4C81" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {gridWeights.map((w, i) => {
          const y = PAD.top + chartH - ((w - minW) / range) * chartH;
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#E2EBF4" strokeWidth="0.5" />
              <text x={PAD.left - 4} y={y + 4} fontSize="10" fill="#4E6080" textAnchor="end">
                {Math.round(w)}
              </text>
            </g>
          );
        })}
        {/* Fill area */}
        <path d={fillD} fill="url(#wGrad)" />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#0F4C81" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#0F4C81" />
        ))}
        {/* Latest point label */}
        <circle cx={latest.x} cy={latest.y} r="5" fill="#0F4C81" />
        {/* X-axis labels: show first, middle, last */}
        {[0, Math.floor(points.length / 2), points.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i && v < points.length)
          .map((i) => (
            <text key={i} x={points[i].x} y={H - 5} fontSize="10" fill="#4E6080" textAnchor="middle">
              {points[i].date}
            </text>
          ))}
      </svg>
    </div>
  );
}

export default function ProgressCharts({ weightLogs, totalWorkouts, recentPRs, clientId }: Props) {
  const [range, setRange] = useState("4wk");
  const [logWeight, setLogWeight] = useState("");
  const [logBodyFat, setLogBodyFat] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const supabase = createClient();
  const filteredLogs = filterByRange(weightLogs, range);

  async function handleLogWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !logWeight) return;
    setSaving(true);
    try {
      await supabase.from("body_weight_logs").upsert({
        client_id: clientId,
        weight_lbs: parseFloat(logWeight),
        body_fat_pct: logBodyFat ? parseFloat(logBodyFat) : null,
        logged_at: new Date().toISOString().split("T")[0],
      }, { onConflict: "client_id,logged_at" });
      setLogWeight("");
      setLogBodyFat("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Range selector */}
      <div className="flex gap-1.5 flex-wrap mb-3">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="px-3 py-1.5 rounded-full text-xs border transition-all"
            style={
              range === r
                ? { background: "#0F4C81", color: "white", borderColor: "#0F4C81" }
                : { background: "white", color: "#4E6080", borderColor: "#C8D8EC" }
            }
          >
            {r}
          </button>
        ))}
      </div>

      {/* Weight chart */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm" style={{ color: "#0D1B2E" }}>Body Weight</h3>
          <button
            className="text-xs flex items-center gap-1"
            style={{ color: "#0EA5E9" }}
            onClick={() => document.getElementById("log-weight-form")?.scrollIntoView({ behavior: "smooth" })}
          >
            <i className="ti ti-plus text-xs" /> Log today
          </button>
        </div>
        <WeightChart logs={filteredLogs} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Workouts", value: totalWorkouts || "â" },
          { label: "Streak", value: "â" },
          { label: "Avg mins", value: "â" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-3 text-center"
            style={{ background: "#EDF2F7", border: "0.5px solid #C8D8EC" }}
          >
            <div className="text-xl font-medium" style={{ color: "#0F4C81" }}>{s.value}</div>
            <div className="text-xs mt-0.5" style={{ color: "#4E6080" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* PRs */}
      {recentPRs.length > 0 && (
        <>
          <p className="label mt-4">personal records</p>
          <div className="card" style={{ padding: "0.5rem 1rem" }}>
            {recentPRs.map((pr, i) => (
              <div
                key={i}
                className="flex justify-between items-center py-2.5 border-b last:border-b-0"
                style={{ borderColor: "#EDF2F7" }}
              >
                <div>
                  <div className="text-sm font-medium">{pr.exercise_name}</div>
                  <div className="text-xs" style={{ color: "#4E6080" }}>{pr.date}</div>
                </div>
                <div className="text-sm font-medium" style={{ color: "#0F4C81" }}>
                  {pr.weight} lb{pr.reps ? ` Ã ${pr.reps}` : ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Log weight form */}
      <p className="label mt-4" id="log-weight-form">log today&apos;s weight</p>
      <div className="card">
        <form onSubmit={handleLogWeight}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "#4E6080" }}>Weight (lbs)</label>
              <input
                type="number"
                step="0.1"
                value={logWeight}
                onChange={(e) => setLogWeight(e.target.value)}
                placeholder="e.g. 185.5"
                className="set-input w-full"
                inputMode="decimal"
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "#4E6080" }}>Body fat % (optional)</label>
              <input
                type="number"
                step="0.1"
                value={logBodyFat}
                onChange={(e) => setLogBodyFat(e.target.value)}
                placeholder="e.g. 18.5"
                className="set-input w-full"
                inputMode="decimal"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={saving || !logWeight}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? "Savingâ¦" : saved ? "â Saved!" : "Log weight"}
          </button>
        </form>
      </div>
    </>
  );
}
