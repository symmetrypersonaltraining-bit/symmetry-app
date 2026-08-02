"use client";
import AddWorkoutButton from "@/components/AddWorkoutButton";

import { useState, useMemo } from "react";
import Link from "next/link";
import { dismissClientNotification } from "./notifActions";
import HomeMacrosCard from "@/components/HomeMacrosCard";
import CountUp from "@/components/CountUp";
import StreakFlame from "@/components/StreakFlame";
import MilestoneToast from "@/components/MilestoneToast";
import PrankInvoice from "@/components/PrankInvoice";
import PaymentDueBanner from "@/components/PaymentDueBanner";
import MilestoneBadges from "@/components/MilestoneBadges";
import ClientWeekSummary from "@/components/ClientWeekSummary";
import ProgrammingQuestion from "@/components/ProgrammingQuestion";
import SundayWeighInReminder from "@/components/SundayWeighInReminder";
import CommunityPair from "@/components/CommunityPair";
import ClientTakeovers from "@/components/ClientTakeovers";
import { RestDaySlip } from "@/components/FunMoments";
import WorkoutDaySheet from "@/components/WorkoutDaySheet";

interface MetricPoint {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

interface RecentWorkout {
  id: string;
  scheduled_date: string;
  status: string;
  days: { label: string } | null;
}

interface ScheduledDay {
  id: string;
  date: string;
  completed: boolean;
  label?: string;
}

interface ClientNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  amount_due: number | null;
  due_date: string | null;
}

interface Props {
  firstName: string;
  // todayWorkouts (array) is preferred. todayWorkout (single) kept for backwards compat.
  todayWorkout?: { id: string; status: string; days: any } | null;
  todayWorkouts?: Array<{ id: string; status: string; days: any }>;
  metrics: MetricPoint[];
  completedCount: number;
  totalScheduled: number;
  recentWorkouts: RecentWorkout[];
  streakDays: number;
  weekWorkouts: { date: string; completed: boolean }[];
  allScheduled?: ScheduledDay[];
  basePath?: string;
  notifications?: ClientNotification[];
  isOwnTrainerView?: boolean;
}

// ─── Payment Notification Banner ─────────────────────────────────────────────
function PaymentNotificationBanner({
  notifications,
}: {
  notifications: ClientNotification[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = notifications.filter(n => !dismissed.has(n.id));
  if (visible.length === 0) return null;

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  }

  async function handleDismiss(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    await dismissClientNotification(id);
  }

  return (
    <div className="space-y-2">
      {visible.map(n => (
        <div
          key={n.id}
          className="rounded-2xl p-4 relative"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1.5px solid rgba(245,158,11,0.35)",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(245,158,11,0.15)" }}
            >
              <i className="ti ti-credit-card text-base" style={{ color: "#f59e0b" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{n.title}</p>
              {n.body && (
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{n.body}</p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {n.amount_due != null && (
                  <span className="text-sm font-bold" style={{ color: "#f59e0b" }}>
                    ${n.amount_due.toFixed(2)}
                  </span>
                )}
                {n.due_date && (
                  <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                    Due {fmtDate(n.due_date)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleDismiss(n.id)}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)" }}
              title="Dismiss"
            >
              <i className="ti ti-x text-xs" style={{ color: "#f59e0b" }} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Sparkline (mini, for metric cards) ───────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center h-10 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
        —
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
        {delta > 0 ? "↑" : delta < 0 ? "↓" : "–"}{Math.abs(delta).toFixed(1)}
      </span>
    </div>
  );
}

// ─── Full Chart (modal) ────────────────────────────────────────────────────────
function FullChart({
  values, dates, color, label, unit,
}: {
  values: number[]; dates: string[]; color: string; label: string; unit: string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (values.length < 2) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: "var(--brand-text-secondary)" }}>
        Not enough data to chart
      </div>
    );
  }

  const W = 340, H = 160, padX = 40, padY = 16, padB = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const chartW = W - padX * 2;
  const chartH = H - padY - padB;

  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * chartW;
    const y = padY + (1 - (v - min) / range) * chartH;
    return { x, y, v, date: dates[i] };
  });

  const pathD = `M ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")}`;
  const fillD = `M ${pts[0].x},${H - padB} L ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ")} L ${pts[pts.length - 1].x},${H - padB} Z`;

  const yTicks = [min, min + range / 2, max].map(v => ({
    v, y: padY + (1 - (v - min) / range) * chartH,
  }));

  const xTicks = [0, Math.floor(pts.length / 2), pts.length - 1].map(i => pts[i]);

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const gradId = `grad-${label.replace(/\s/g, "")}`;

  return (
    <div className="relative select-none">
      <svg
        width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: "visible", touchAction: "none" }}
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <line key={i} x1={padX} y1={t.y} x2={W - padX} y2={t.y}
            stroke="var(--brand-border)" strokeWidth="1" strokeDasharray="3,3" />
        ))}
        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {yTicks.map((t, i) => (
          <text key={i} x={padX - 4} y={t.y + 4} textAnchor="end" fontSize="9"
            fill="var(--brand-text-secondary)">{t.v.toFixed(1)}</text>
        ))}
        {xTicks.map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" fontSize="9"
            fill="var(--brand-text-secondary)">{fmtDate(p.date)}</text>
        ))}
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHovered(i)}>
            <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 5 : 3}
              fill={color} stroke="var(--brand-bg)" strokeWidth="2"
              style={{ transition: "r 0.1s" }} />
            {hovered === i && (
              <g>
                <rect x={p.x - 28} y={p.y - 30} width={56} height={22} rx={4}
                  fill="var(--brand-card)" stroke="var(--brand-border)" strokeWidth="1" />
                <text x={p.x} y={p.y - 15} textAnchor="middle" fontSize="10" fontWeight="600"
                  fill="var(--brand-text)">{p.v.toFixed(1)}{unit}</text>
              </g>
            )}
          </g>
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: "Current", val: values[values.length - 1] },
          { label: "Peak", val: Math.max(...values) },
          { label: "Low", val: Math.min(...values) },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 text-center"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>{s.label}</p>
            <p className="text-base font-bold" style={{ color: "var(--brand-text)" }}>
              <CountUp end={s.val} decimals={1} duration={900} /><span className="text-xs font-normal ml-0.5">{unit}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Metric Modal ──────────────────────────────────────────────────────────────
function MetricModal({
  metricKey, label, unit, color, icon, metrics, onClose, basePath = "",
}: {
  metricKey: "weight" | "body_fat_pct" | "lean_mass" | "fat_mass";
  label: string; unit: string; color: string; icon: string;
  metrics: MetricPoint[];
  onClose: () => void;
  basePath?: string;
}) {
  const values = metrics.map(m => m[metricKey]).filter((v): v is number => v != null);
  const dates = metrics.filter(m => m[metricKey] != null).map(m => m.metric_date);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl p-6 pb-8"
        style={{ background: "var(--brand-bg)", maxHeight: "85vh", overflowY: "auto" }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${color}20` }}>
              <i className={`ti ${icon} text-lg`} style={{ color }} />
            </div>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>{label}</h2>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {metrics.length} measurements
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
          >
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
        <FullChart values={values} dates={dates} color={color} label={label} unit={unit} />
        <Link
          href={`${basePath}/progress`}
          onClick={onClose}
          className="flex items-center justify-center gap-2 mt-5 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: "var(--brand-primary)", color: "white" }}
        >
          <i className="ti ti-chart-line" />
          View Full Progress
        </Link>
      </div>
    </div>
  );
}

// ─── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({
  label, value, unit, values, color, icon, onClick,
}: {
  label: string; value: string | number | null; unit: string;
  values: number[]; color: string; icon: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="metric-card text-left w-full" style={{ cursor: "pointer" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
        <i className={`ti ${icon} text-sm`} style={{ color }} />
      </div>
      <div className="text-lg font-bold mb-2" style={{ color: "var(--brand-text)" }}>
        {value != null
          ? <span>{value}<span className="text-xs font-normal ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>{unit}</span></span>
          : <span style={{ color: "var(--brand-text-secondary)", fontSize: "13px" }}>No data</span>
        }
      </div>
      <Sparkline values={values} color={color} />
      <p className="text-xs mt-1.5" style={{ color: "var(--brand-text-secondary)" }}>Tap to expand ↗</p>
    </button>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────────
function isCardioLabel(label?: string) {
  return /cardio/i.test(label ?? "");
}

function workoutDotColor(label?: string) {
  return isCardioLabel(label) ? "#22c55e" : "var(--brand-primary)";
}

function toCT(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// ─── Week Ring ─────────────────────────────────────────────────────────────────
function WeekRing({
  allScheduled = [], weekOffset, onPrev, onNext, basePath = "",
}: {
  allScheduled: ScheduledDay[];
  weekOffset: number; onPrev: () => void; onNext: () => void; basePath?: string;
}) {
  const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const today = new Date();
  const todayDow = today.getDay();
  const todayStr = toCT(today);

  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [movedOverrides, setMovedOverrides] = useState<Record<string, string>>({});
  const effectiveScheduled = Object.keys(movedOverrides).length
    ? allScheduled.map((w) => (movedOverrides[w.id] ? { ...w, date: movedOverrides[w.id] } : w))
    : allScheduled;

  const displayWeekStart = new Date(today);
  displayWeekStart.setDate(today.getDate() - todayDow + weekOffset * 7);

  const weekLabel = weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : weekOffset === 1 ? "Next Week" : weekOffset > 1 ? `In ${weekOffset} Weeks` : `${Math.abs(weekOffset)} Weeks Ago`;

  // FIX: use .filter() (not .find()) so days with both cardio + lifting return all workouts
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(displayWeekStart);
    d.setDate(displayWeekStart.getDate() + i);
    const dateStr = toCT(d);
    const workouts = effectiveScheduled.filter(w => w.date === dateStr);
    const dateNum = d.getDate();
    return { dow: i, dateStr, workouts, isToday: dateStr === todayStr, dateNum };
  });

  // Count individual workouts, not just days
  const scheduled = weekDays.reduce((acc, d) => acc + d.workouts.length, 0);
  const completed = weekDays.reduce((acc, d) => acc + d.workouts.filter(w => w.completed).length, 0);
  const adherence = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
  const canGoNext = weekOffset < 4;

  // Render a single workout circle
  function renderCircle(w: ScheduledDay, size: "lg" | "sm", showTodayBorder = false) {
    const done = w.completed;
    const dotColor = workoutDotColor(w.label);
    const dim = size === "lg" ? "w-8 h-8" : "w-6 h-6";
    const iconSize = size === "lg" ? "text-xs" : "text-[9px]";
    const border = showTodayBorder
      ? "2px solid var(--brand-primary)"
      : done
      ? `1.5px solid ${dotColor}`
      : "1px solid var(--brand-border)";
    return (
      <div
        className={`${dim} rounded-full flex items-center justify-center transition-all`}
        style={{ background: done ? `${dotColor}20` : "var(--brand-card)", border }}
      >
        {done ? (
          <i className={`ti ti-check ${iconSize}`} style={{ color: dotColor }} />
        ) : (
          <i className={`ti ${isCardioLabel(w.label) ? "ti-run" : "ti-barbell"} ${iconSize}`} style={{ color: "var(--brand-text-secondary)" }} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onPrev} className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <div className="text-center">
          <p className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>{weekLabel}</p>
          {scheduled > 0 && (
            <p className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>{adherence}% adherence</p>
          )}
        </div>
        <button onClick={onNext} disabled={!canGoNext} className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: canGoNext ? "var(--brand-surface)" : "transparent", border: canGoNext ? "1px solid var(--brand-border)" : "none", opacity: canGoNext ? 1 : 0.3 }}>
          <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
      </div>
      <div className="flex gap-1 justify-center">
        {weekDays.map(({ dow, dateStr, workouts, isToday, dateNum }) => {
          const dayColor = isToday ? "var(--brand-primary)" : "var(--brand-text-secondary)";
          return (
            <div key={dow} className="flex flex-col items-center gap-0.5">
              {workouts.length === 0 ? (
                // Empty / rest day
                <div className="w-8 h-8 rounded-full" style={{
                  border: isToday ? "2px solid var(--brand-primary)" : "1px dashed var(--brand-border)",
                }} />
              ) : (
                // Tap the day to open the workout sheet (Start / Log / Move)
                <button
                  type="button"
                  onClick={() => setSheetDate(dateStr)}
                  style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer" }}
                  aria-label={`View ${DAYS[dow]} ${dateNum} workouts`}
                >
                  {workouts.length === 1 ? (
                    renderCircle(workouts[0], "lg", isToday)
                  ) : (
                    <div
                      className="flex flex-col items-center gap-0.5 rounded-xl px-0.5 py-0.5"
                      style={{ border: isToday ? "2px solid var(--brand-primary)" : "1px solid var(--brand-border)", background: "var(--brand-surface)" }}
                    >
                      {workouts.map((w, wi) => (
                        <span key={w.id || `${dateStr}-${wi}`}>{renderCircle(w, "sm")}</span>
                      ))}
                    </div>
                  )}
                </button>
              )}
              {/* Day label + date number */}
              <div className="flex flex-col items-center" style={{ lineHeight: 1.1 }}>
                <span className="text-xs" style={{ color: dayColor }}>{DAYS[dow]}</span>
                <span style={{ fontSize: "9px", color: dayColor }}>{dateNum}</span>
              </div>
            </div>
          );
        })}
      </div>
      {sheetDate && (
        <WorkoutDaySheet
          date={sheetDate}
          workouts={effectiveScheduled
            .filter((w) => w.date === sheetDate)
            .map((w) => ({
              id: w.id,
              dayId: w.id,
              date: w.date,
              label: (typeof w.label === "string" ? w.label : ((w.label as any) && (w.label as any).label)) || "Workout",
              status: w.completed ? "completed" : "scheduled",
            }))}
          basePath={basePath}
          today={todayStr}
          onClose={() => setSheetDate(null)}
          onMoved={(id, newDate) => setMovedOverrides((m) => ({ ...m, [id]: newDate }))}
        />
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
type MetricKey = "weight" | "body_fat_pct" | "lean_mass" | "fat_mass";

const METRIC_CONFIG: { key: MetricKey; label: string; unit: string; color: string; icon: string }[] = [
  { key: "weight",       label: "Body Weight", unit: "lbs", color: "var(--brand-primary)", icon: "ti-scale"      },
  { key: "body_fat_pct", label: "Body Fat",    unit: "%",   color: "#f59e0b",              icon: "ti-percentage" },
  { key: "lean_mass",    label: "Lean Mass",   unit: "lbs", color: "#22c55e",              icon: "ti-barbell"    },
  { key: "fat_mass",     label: "Fat Mass",    unit: "lbs", color: "#ef4444",              icon: "ti-flame"      },
];

export default function ClientDashboard({
  firstName,
  todayWorkout,
  todayWorkouts: todayWorkoutsProp,
  metrics,
  completedCount,
  totalScheduled,
  recentWorkouts,
  streakDays,
  weekWorkouts,
  allScheduled = [],
  basePath = "",
  notifications = [],
  isOwnTrainerView = false,
}: Props) {
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

  const latestVal = (key: MetricKey) => {
    const arr = metricValues[key];
    return arr.length > 0 ? arr[arr.length - 1].toFixed(1) : null;
  };

  // Derive unified array — prefer todayWorkouts prop, fall back to todayWorkout single for compat
  const _todayWorkouts = todayWorkoutsProp ?? (todayWorkout ? [todayWorkout] : []);

  const isMilestone = streakDays > 0 && streakDays % 7 === 0;

  const scheduleSource: ScheduledDay[] = allScheduled.length > 0
    ? allScheduled
    : weekWorkouts.map(w => ({ id: "", date: w.date, completed: w.completed }));

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const activeMetricConfig = activeMetric ? METRIC_CONFIG.find(m => m.key === activeMetric) : null;

  return (
    <>
      {/* Full-screen announcements — challenge invite, winner celebration, or
          a broadcast from Dustin. ONE component so at most one can ever be on
          screen; see ClientTakeovers for the priority rule. Renders nothing
          once each has been seen, and nothing at all when there is none. */}
      <ClientTakeovers basePath={basePath} />

      {activeMetric && activeMetricConfig && (
        <MetricModal
          metricKey={activeMetric}
          label={activeMetricConfig.label}
          unit={activeMetricConfig.unit}
          color={activeMetricConfig.color}
          icon={activeMetricConfig.icon}
          metrics={metrics}
          onClose={() => setActiveMetric(null)}
          basePath={basePath}
        />
      )}

      <div className="p-4 pb-28 space-y-4 max-w-lg mx-auto cw-reveal">
        <PrankInvoice />
        <PaymentDueBanner />
      {isMilestone && streakDays > 0 && (
        <MilestoneToast emoji="🎉" message={`${streakDays}-day streak — keep it going!`} once={`streak-${streakDays}`} />
      )}
        {/* Header */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{greeting},</p>
            <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}><span style={{ backgroundImage: hour < 12 ? "linear-gradient(100deg,#ff9f5a,#ff6b6b,#c86dd7)" : hour < 17 ? "linear-gradient(100deg,#7c9cf5,#5ec9a3,#ffd36e)" : "linear-gradient(100deg,#6366f1,#8b6ff0,#3aa8c1)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{firstName}</span> 👋</h1>
          </div>
          <div className="flex items-center gap-2">
          {streakDays > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${isMilestone ? "animate-pulse" : ""}`}
              style={{ background: isMilestone ? "#f59e0b20" : "var(--brand-surface)", border: `1px solid ${isMilestone ? "#f59e0b" : "var(--brand-border)"}` }}>
              <StreakFlame days={streakDays} milestone={isMilestone} />
              <div>
                <span className="text-sm font-bold" style={{ color: isMilestone ? "#f59e0b" : "var(--brand-text)" }}><CountUp end={streakDays} duration={800} /></span>
                <span className="text-xs ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>day{streakDays !== 1 ? "s" : ""}</span>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Payment Notifications */}
        {notifications.length > 0 && (
          <PaymentNotificationBanner notifications={notifications} />
        )}

        {/* Add workout (client can add an extra workout to today) */}
        <div style={{ marginBottom: 12 }}><AddWorkoutButton /></div>
        {/* Week overview */}
        <div className="metric-card">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>This Week</span>
            <Link href={`${basePath}/workout`} className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>
              View Schedule →
            </Link>
          </div>
          <WeekRing allScheduled={scheduleSource} weekOffset={weekOffset} onPrev={() => setWeekOffset(o => o - 1)} onNext={() => setWeekOffset(o => Math.min(4, o + 1))} basePath={basePath} />
        </div>

        {/* Today's Workout — 0 workouts: rest day | 1 workout: single card | 2+: picker */}
        {_todayWorkouts.length === 0 ? (
          // Rest day gets the signed permission slip (2026-07-25) — makes resting
          // feel prescribed rather than skipped, and it's shareable to the group.
          <RestDaySlip firstName={firstName} />
        ) : _todayWorkouts.length === 1 ? (
          // Single workout — original branded card
          <Link href={`${basePath}/workout/${_todayWorkouts[0].id}`}>
            <div className="rounded-2xl p-5 relative overflow-hidden cursor-pointer cw-lift" style={{ background: "var(--brand-primary)" }}>
              <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10" style={{ background: "white", transform: "translate(30%, -30%)" }} />
              <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full opacity-5" style={{ background: "white", transform: "translate(-30%, 30%)" }} />
              <div className="relative">
                <p className="text-xs font-semibold text-white/70 mb-1 uppercase tracking-widest">Today&apos;s Workout</p>
                <h2 className="text-xl font-bold text-white mb-3">{_todayWorkouts[0].days?.label || "Today's Workout"}</h2>
                {_todayWorkouts[0].status === "completed" ? (
                  <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5">
                    <i className="ti ti-check text-sm text-white" />
                    <span className="text-xs text-white font-medium">Completed ✓</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 bg-white text-sm font-semibold rounded-full px-4 py-2" style={{ color: "var(--brand-primary)" }}>
                    <i className="ti ti-player-play" />
                    Start Workout
                  </div>
                )}
              </div>
            </div>
          </Link>
        ) : (
          // Multiple workouts today — branded header + individual clickable rows
          // A SURFACE CARD LIKE EVERY OTHER CARD ON THIS SCREEN.
          //
          // This was a solid `background: var(--brand-primary)` block with
          // white text and rows on rgba(0,0,0,0.22). It was the only card on
          // the dashboard that was not a surface, which made it the one thing
          // that could not follow the scheme properly — reported as "today's
          // workouts should be consistent w the rest of the color scheme", and
          // before that as looking grey, because a translucent black row over
          // a coloured block goes grey no matter what colour the block is.
          //
          // Emphasis now comes from the header tint and the left bar on each
          // row — the same language the schedule board uses — rather than from
          // inverting the whole card.
          <div className="card overflow-hidden" style={{ padding: 0 }}>
            <div
              className="px-4 py-2.5"
              style={{
                background: "color-mix(in srgb, var(--brand-primary) 15%, var(--brand-surface))",
                borderBottom: "1.5px solid color-mix(in srgb, var(--brand-primary) 38%, var(--brand-border))",
              }}
            >
              <p className="text-xs font-extrabold uppercase tracking-widest" style={{ color: "var(--brand-text)" }}>
                Today&apos;s Workouts
              </p>
            </div>
            <div className="space-y-2 p-2">
              {_todayWorkouts.map((tw) => {
                const twLabel = (tw.days as any)?.label || "Workout";
                const twIsCardio = isCardioLabel(twLabel);
                const twDone = tw.status === "completed";
                // Same two colours the schedule board uses for the same two
                // kinds of session, so a cardio row looks like a cardio row
                // wherever you meet it.
                const twColor = twIsCardio ? "#5ec9a3" : "var(--brand-primary)";
                return (
                  <Link key={tw.id} href={`${basePath}/workout/${tw.id}`} className="block">
                    <div
                      className="flex items-center gap-3 px-3 py-3 rounded-xl"
                      style={{
                        background: `color-mix(in srgb, ${twColor} 9%, var(--brand-surface))`,
                        border: `1.5px solid color-mix(in srgb, ${twColor} 55%, transparent)`,
                        borderLeft: `5px solid ${twColor}`,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `color-mix(in srgb, ${twColor} 18%, transparent)` }}
                      >
                        <i className={`ti ${twIsCardio ? "ti-run" : "ti-barbell"} text-sm`} style={{ color: twColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{twLabel}</p>
                      </div>
                      {twDone ? (
                        <div className="inline-flex items-center gap-1 rounded-full px-2 py-1 flex-shrink-0"
                          style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a" }}>
                          <i className="ti ti-check text-xs" />
                          <span className="text-xs font-semibold">Done</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 flex-shrink-0"
                          style={{ background: "var(--brand-primary)", color: "#fff" }}>
                          <i className="ti ti-player-play text-xs" />
                          <span className="text-xs font-semibold">Start</span>
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Full-screen Sunday weigh-in reminder (fires only on Sundays, once) */}
        <SundayWeighInReminder />

        {/* Challenge + group, as a split pair directly under today's workout.
            Deliberately here rather than further down: buried below the fold
            they were invisible, and the whole point is that people see the
            group without hunting for it. Two half-cards cost the height of one
            full card, so the training content above them does not move. */}
        <CommunityPair />

        {/* "This week" tiles + the Focus line. Unchanged. */}
        <ClientWeekSummary />

        {/* Fortnightly programming check-in. Renders nothing at all on the
            weeks nothing is being asked, and disappears the moment it is
            answered — so it never becomes furniture people scroll past. Sits
            directly under the week card because that is the block it is asking
            about. */}
        <ProgrammingQuestion />
        {/* CoachFocusCard ("Coach's Read") removed 2026-08-01. It restated the
            Focus line that ClientWeekSummary already shows, so clients read the
            same coaching twice in two different voices. The weekly question it
            carried has moved onto the Focus row rather than being lost. */}
        <HomeMacrosCard />

        <MilestoneBadges />
        {/* Metrics */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Progress</h2>
            <Link href={`${basePath}/progress`} className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>View all →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {METRIC_CONFIG.map(mc => (
              <MetricCard key={mc.key} label={mc.label} value={latestVal(mc.key)} unit={mc.unit} values={metricValues[mc.key]} color={mc.color} icon={mc.icon} onClick={() => setActiveMetric(mc.key)} />
            ))}
          </div>
          {metrics.length === 0 && (
            <div className="rounded-2xl py-8 text-center mt-2" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-chart-line text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Your trainer will log your metrics after each assessment.</p>
            </div>
          )}
        </div>

        {/* AI Insights — trainer-only when viewing own client app */}
        {isOwnTrainerView && (
          <div className="rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="flex items-center gap-2 mb-2">
              <i className="ti ti-brain text-base" style={{ color: "var(--brand-primary)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>AI Insights</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--brand-primary) 13%, transparent)", color: "var(--brand-primary)" }}>Trainer View</span>
            </div>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              AI-powered coaching insights will appear here when viewing a client&apos;s dashboard.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
