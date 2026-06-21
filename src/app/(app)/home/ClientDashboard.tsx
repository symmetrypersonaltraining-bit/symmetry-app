"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface MetricPoint {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

interface RecentWorkout {
  id: string;
  day_id?: string;
  scheduled_date: string;
  status: string;
  days: { label: string } | null;
}

interface ScheduledDay {
  id: string;
  date: string;
  completed: boolean;
}

interface TodayWorkout {
  id: string;
  day_id?: string;
  status: string;
  days: any;
}

interface Props {
  firstName: string;
  todayWorkouts: TodayWorkout[];
  metrics: MetricPoint[];
  completedCount: number;
  totalScheduled: number;
  recentWorkouts: RecentWorkout[];
  streakDays: number;
  weekWorkouts: { date: string; completed: boolean }[];
  allScheduled?: ScheduledDay[];
  clientId?: string | null;
}

// \u2500\u2500\u2500 Sparkline \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center h-10 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
        \u2014
      </div>
    );
  }
  const w = 100, h = 36, pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = `M ${pts.join(" L ")}`;
  const lastPt = pts[pts.length - 1].split(",");
  const fillPts = [...pts, `${(w - pad).toFixed(1)},${h}`, `${pad},${h}`];
  const fill = `M ${fillPts.join(" L ")} Z`;
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const delta = last - prev;
  const trendColor = delta >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div className="flex items-end gap-2">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        <path d={fill} fill={color} opacity="0.12" />
        <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastPt[0]} cy={lastPt[1]} r="3" fill={color} />
      </svg>
      <span className="text-xs font-semibold tabular-nums" style={{ color: trendColor }}>
        {delta > 0 ? "\u2191" : delta < 0 ? "\u2193" : "\u2013"}{Math.abs(delta).toFixed(1)}
      </span>
    </div>
  );
}

// \u2500\u2500\u2500 Full Chart \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function FullChart({ values, dates, color, label, unit }: { values: number[]; dates: string[]; color: string; label: string; unit: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (values.length < 2) return <div className="flex items-center justify-center h-48 text-sm" style={{ color: "var(--brand-text-secondary)" }}>Not enough data to chart</div>;
  const W = 340, H = 160, padX = 40, padY = 16, padB = 28;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const chartW = W - padX * 2, chartH = H - padY - padB;
  const pts = values.map((v, i) => ({ x: padX + (i / (values.length - 1)) * chartW, y: padY + (1 - (v - min) / range) * chartH, v, date: dates[i] }));
  const pathD = `M ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
  const fillD = `M ${pts[0].x},${H - padB} L ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} L ${pts[pts.length - 1].x},${H - padB} Z`;
  const yTicks = [min, min + range / 2, max].map(v => ({ v, y: padY + (1 - (v - min) / range) * chartH }));
  const xTicks = [0, Math.floor(pts.length / 2), pts.length - 1].map(i => pts[i]);
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const gradId = `grad-${label.replace(/\s/g, "")}`;
  return (
    <div className="relative select-none">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", touchAction: "none" }} onMouseLeave={() => setHovered(null)}>
        <defs><linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.25" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {yTicks.map((t, i) => <line key={i} x1={padX} y1={t.y} x2={W - padX} y2={t.y} stroke="var(--brand-border)" strokeWidth="1" strokeDasharray="3,3" />)}
        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {yTicks.map((t, i) => <text key={i} x={padX - 4} y={t.y + 4} textAnchor="end" fontSize="9" fill="var(--brand-text-secondary)">{t.v.toFixed(1)}</text>)}
        {xTicks.map((p, i) => <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--brand-text-secondary)">{fmtDate(p.date)}</text>)}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHovered(i)}>
            <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : 3} fill={color} stroke="var(--brand-bg)" strokeWidth="2" style={{ transition: "r 0.1s" }} />
            {hovered === i && <g><rect x={p.x - 28} y={p.y - 30} width={56} height={22} rx={4} fill="var(--brand-card)" stroke="var(--brand-border)" strokeWidth="1" /><text x={p.x} y={p.y - 15} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--brand-text)">{p.v.toFixed(1)}{unit}</text></g>}
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[{ label: "Current", val: values[values.length - 1] }, { label: "Peak", val: Math.max(...values) }, { label: "Low", val: Math.min(...values) }].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>{s.label}</p>
            <p className="text-base font-bold" style={{ color: "var(--brand-text)" }}>{s.val.toFixed(1)}<span className="text-xs font-normal ml-0.5">{unit}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 Metric Modal \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function MetricModal({ metricKey, label, unit, color, icon, metrics, onClose }: { metricKey: "weight" | "body_fat_pct" | "lean_mass" | "fat_mass"; label: string; unit: string; color: string; icon: string; metrics: MetricPoint[]; onClose: () => void }) {
  const values = metrics.map(m => m[metricKey]).filter((v): v is number => v != null);
  const dates = metrics.filter(m => m[metricKey] != null).map(m => m.metric_date);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-8" style={{ background: "var(--brand-bg)", maxHeight: "85vh", overflowY: "auto" }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}><i className={`ti ${icon} text-lg`} style={{ color }} /></div>
            <div><h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>{label}</h2><p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{metrics.length} measurements</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} /></button>
        </div>
        <FullChart values={values} dates={dates} color={color} label={label} unit={unit} />
        <Link href="/progress" onClick={onClose} className="flex items-center justify-center gap-2 mt-5 py-3 rounded-2xl text-sm font-semibold" style={{ background: "var(--brand-primary)", color: "white" }}><i className="ti ti-chart-line" />View Full Progress</Link>
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 Metric Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function MetricCard({ label, value, unit, values, color, icon, onClick }: { label: string; value: string | number | null; unit: string; values: number[]; color: string; icon: string; onClick: () => void }) {
  const hasData = value != null;
  return (
    <button onClick={onClick} className="metric-card text-left w-full" style={{ cursor: "pointer" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
        <i
          className={`ti ${hasData ? icon : "ti-clock-hour-3"} text-sm`}
          style={{ color: hasData ? color : "var(--brand-text-secondary)", opacity: hasData ? 1 : 0.45 }}
        />
      </div>
      <div className="text-lg font-bold mb-2" style={{ color: "var(--brand-text)" }}>
        {hasData
          ? <span>{value}<span className="text-xs font-normal ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>{unit}</span></span>
          : <span className="text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>Nothing logged yet</span>}
      </div>
      <Sparkline values={values} color={color} />
      <p className="text-xs mt-1.5" style={{ color: "var(--brand-text-secondary)" }}>
        {hasData ? "Tap to expand \u2197" : "Logged after assessment"}
      </p>
    </button>
  );
}

// \u2500\u2500\u2500 Week Ring \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function WeekRing({ allScheduled = [], weekOffset, onPrev, onNext }: { allScheduled: ScheduledDay[]; weekOffset: number; onPrev: () => void; onNext: () => void }) {
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const today = new Date();
  const todayDow = today.getDay();
  const todayStr = today.toISOString().split("T")[0];
  const displayWeekStart = new Date(today);
  displayWeekStart.setDate(today.getDate() - todayDow + weekOffset * 7);
  const weekLabel = weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : weekOffset < -1 ? `${Math.abs(weekOffset)} Weeks Ago` : "";
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(displayWeekStart);
    d.setDate(displayWeekStart.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const workout = allScheduled.find(w => w.date === dateStr);
    return { dow: i, dateStr, workout, isToday: dateStr === todayStr };
  });
  const scheduled = weekDays.filter(d => d.workout).length;
  const completed = weekDays.filter(d => d.workout?.completed).length;
  const adherence = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
  const canGoNext = weekOffset < 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} /></button>
        <div className="text-center">
          <p className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>{weekLabel}</p>
          {scheduled > 0 && <p className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>{adherence}% adherence</p>}
        </div>
        <button onClick={onNext} disabled={!canGoNext} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: canGoNext ? "var(--brand-surface)" : "transparent", border: canGoNext ? "1px solid var(--brand-border)" : "none", opacity: canGoNext ? 1 : 0.3 }}><i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} /></button>
      </div>
      <div className="flex gap-1.5 justify-center">
        {weekDays.map(({ dow, dateStr, workout, isToday }) => {
          const done = workout?.completed;
          const sched = !!workout;
          const circle = (
            <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all" style={{ background: done ? "#22c55e20" : sched ? "var(--brand-card)" : "transparent", border: isToday ? "2px solid var(--brand-primary)" : done ? "1.5px solid #22c55e" : sched ? "1px solid var(--brand-border)" : "1px dashed var(--brand-border)" }}>
              {done ? <i className="ti ti-check text-xs" style={{ color: "#22c55e" }} /> : sched ? <i className="ti ti-barbell text-xs" style={{ color: "var(--brand-text-secondary)" }} /> : null}
            </div>
          );
          return (
            <div key={dow} className="flex flex-col items-center gap-1">
              {workout?.id ? <Link href={`/workout/${workout.id}`}>{circle}</Link> : circle}
              <span className="text-xs" style={{ color: isToday ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>{DAYS[dow]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 Main Dashboard \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
type MetricKey = "weight" | "body_fat_pct" | "lean_mass" | "fat_mass";
const METRIC_CONFIG: { key: MetricKey; label: string; unit: string; color: string; icon: string }[] = [
  { key: "weight",       label: "Body Weight", unit: "lbs", color: "var(--brand-primary)", icon: "ti-scale" },
  { key: "body_fat_pct", label: "Body Fat",    unit: "%",   color: "#f59e0b",              icon: "ti-percentage" },
  { key: "lean_mass",    label: "Lean Mass",   unit: "lbs", color: "#22c55e",              icon: "ti-barbell" },
  { key: "fat_mass",     label: "Fat Mass",    unit: "lbs", color: "#ef4444",              icon: "ti-flame" },
];

export default function ClientDashboard({ firstName, todayWorkouts = [], metrics, completedCount, totalScheduled, recentWorkouts, streakDays, weekWorkouts, allScheduled = [], clientId }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const metricValues = useMemo(() => ({
    weight:       metrics.map(m => m.weight).filter((v): v is number => v != null),
    body_fat_pct: metrics.map(m => m.body_fat_pct).filter((v): v is number => v != null),
    lean_mass:    metrics.map(m => m.lean_mass).filter((v): v is number => v != null),
    fat_mass:     metrics.map(m => m.fat_mass).filter((v): v is number => v != null),
  }), [metrics]);
  const latestVal = (key: MetricKey) => { const arr = metricValues[key]; return arr.length > 0 ? arr[arr.length - 1].toFixed(1) : null; };
  const isCardioLabel = (label: string) => /cardio|treadmill|stair|walk|run/i.test(label);
  const isMilestone = streakDays > 0 && streakDays % 7 === 0;
  const scheduleSource: ScheduledDay[] = allScheduled.length > 0 ? allScheduled : weekWorkouts.map(w => ({ id: "", date: w.date, completed: w.completed }));
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const activeMetricConfig = activeMetric ? METRIC_CONFIG.find(m => m.key === activeMetric) : null;

  return (
    <>
      {activeMetric && activeMetricConfig && (
        <MetricModal metricKey={activeMetric} label={activeMetricConfig.label} unit={activeMetricConfig.unit} color={activeMetricConfig.color} icon={activeMetricConfig.icon} metrics={metrics} onClose={() => setActiveMetric(null)} />
      )}
      <div className="p-4 pb-28 space-y-4 max-w-lg mx-auto">
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{greeting},</p>
            <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>{firstName} {'👋'}</h1>
          </div>
          {streakDays > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${isMilestone ? "animate-pulse" : ""}`} style={{ background: isMilestone ? "#f59e0b20" : "var(--brand-surface)", border: `1px solid ${isMilestone ? "#f59e0b" : "var(--brand-border)"}` }}>
              <span className="text-base">{isMilestone ? "\u00f0\u009f\u008e\u0089" : "\u00f0\u009f\u0094\u00a5"}</span>
              <div><span className="text-sm font-bold" style={{ color: isMilestone ? "#f59e0b" : "var(--brand-text)" }}>{streakDays}</span><span className="text-xs ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>day{streakDays !== 1 ? "s" : ""}</span></div>
            </div>
          )}
        </div>

        <div className="metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>This Week</span>
            <Link href="/client-preview/schedule" className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>View Schedule {'\u2192'}</Link>
          </div>
          <WeekRing allScheduled={scheduleSource} weekOffset={weekOffset} onPrev={() => setWeekOffset(o => o - 1)} onNext={() => setWeekOffset(o => Math.min(0, o + 1))} />
        </div>

        {todayWorkouts.length > 0 ? (
          <div className="space-y-3">
            {todayWorkouts.map((tw, i) => {
              const lnk = (tw as any).day_id || tw.id;
              const lbl = tw.days?.label || "Today's Workout";
              const don = tw.status === "completed";
              const crd = isCardioLabel(lbl);
              if (i === 0) {
                return (<Link key={tw.id} href={`/workout/${lnk}${clientId ? `?forClient=${clientId}` : ''}`}><div className="rounded-2xl p-5 relative overflow-hidden" style={{ background: "var(--brand-primary)" }}><div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: "white", transform: "translate(30%,-30%)" }} /><div className="absolute bottom-0 left-0 w-20 h-20 rounded-full opacity-5" style={{ background: "white", transform: "translate(-30%,30%)" }} /><div className="relative"><p className="text-xs font-semibold text-white/70 mb-1 uppercase tracking-widest">{crd ? "Today's Cardio" : "Today's Workout"}</p><h2 className="text-xl font-bold text-white mb-3">{lbl}</h2>{don ? (<div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5"><i className="ti ti-check text-sm text-white" /><span className="text-xs text-white font-medium">Completed \u2713</span></div>) : (<div className="inline-flex items-center gap-2 bg-white text-sm font-semibold rounded-full px-4 py-2" style={{ color: "var(--brand-primary)" }}><i className={`ti ${crd?"ti-run":"ti-player-play"}`} />{crd?"Start Cardio":"Start Workout"}</div>)}</div></div></Link>);
              }
              return (<Link key={tw.id} href={`/workout/${lnk}${clientId ? `?forClient=${clientId}` : ''}`}><div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: don ? "#22c55e20" : "var(--brand-card)" }}><i className={`ti ${don?"ti-check":crd?"ti-run":"ti-barbell"} text-base`} style={{ color: don ? "#22c55e" : "var(--brand-primary)" }} /></div><div className="flex-1 min-w-0"><p className="text-xs font-semibold uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>{crd?"Today's Cardio":"Also Today"}</p><p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{lbl}</p></div>{don ? (<span className="text-xs font-medium flex-shrink-0" style={{ color: "#22c55e" }}>Done \u2713</span>) : (<div className="flex items-center gap-1 flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold text-white" style={{ background: "var(--brand-primary)" }}><i className="ti ti-player-play text-xs" /> Start</div>)}</div></Link>);
            })}
          </div>
        ) : (
          <div className="rounded-2xl p-5 text-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><i className="ti ti-moon text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} /><p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Rest Day</p><p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>Recovery is part of the program {'💪'}</p></div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link href="/nutrition"><div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#22c55e20" }}><i className="ti ti-salad text-lg" style={{ color: "#22c55e" }} /></div><div><p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Nutrition</p><p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Log meals</p></div></div></Link>
          <Link href="/log"><div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f59e0b20" }}><i className="ti ti-plus-circle text-lg" style={{ color: "#f59e0b" }} /></div><div><p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Log</p><p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Cardio & weight</p></div></div></Link>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Progress</h2>
            <Link href="/progress" className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>View all {'\u2192'}</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {METRIC_CONFIG.map(mc => <MetricCard key={mc.key} label={mc.label} value={latestVal(mc.key)} unit={mc.unit} values={metricValues[mc.key]} color={mc.color} icon={mc.icon} onClick={() => setActiveMetric(mc.key)} />)}
          </div>
          {metrics.length === 0 && <div className="rounded-2xl py-8 text-center mt-2" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><i className="ti ti-chart-line text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} /><p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Your trainer will log your metrics after each assessment.</p></div>}
        </div>

        <div>
          <h2 className="text-base font-bold mb-2.5" style={{ color: "var(--brand-text)" }}>Recent Workouts</h2>
          {recentWorkouts.length === 0 ? (
            <div className="rounded-2xl py-8 text-center" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}><i className="ti ti-trophy text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} /><p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Complete your first workout to see history here.</p></div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              {recentWorkouts.map((w, i) => (
                <Link key={w.id} href={`/workout/${(w as any).day_id || w.id}`}>
                  <div className={`flex items-center gap-3 px-4 py-3.5 ${i < recentWorkouts.length - 1 ? "border-b" : ""}`} style={{ borderColor: "var(--brand-border)" }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#22c55e20" }}><i className="ti ti-check text-xs" style={{ color: "#22c55e" }} /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>{w.days?.label || "Workout"}</p><p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{fmtDate(w.scheduled_date)}</p></div>
                    <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}