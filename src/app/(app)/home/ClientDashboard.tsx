"use client";

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
  scheduled_date: string;
  status: string;
  days: { label: string } | null;
}

interface Props {
  firstName: string;
  todayWorkout: { id: string; status: string; days: any } | null;
  metrics: MetricPoint[];
  completedCount: number;
  totalScheduled: number;
  recentWorkouts: RecentWorkout[];
  streakDays: number;
  weekWorkouts: { date: string; completed: boolean }[];
}

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

function MetricCard({
  label, value, unit, values, color, icon
}: {
  label: string; value: string | number | null; unit: string;
  values: number[]; color: string; icon: string;
}) {
  return (
    <div className="rounded-2xl p-3.5" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
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
    </div>
  );
}

function WeekRing({ workouts }: { workouts: { date: string; completed: boolean }[] }) {
  const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const today = new Date().getDay();
  return (
    <div className="flex gap-1.5 justify-center">
      {days.map((d, i) => {
        const isToday = i === today;
        const w = workouts.find(wk => new Date(wk.date + "T12:00:00").getDay() === i);
        const done = w?.completed;
        const scheduled = !!w;
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: done ? "#22c55e20" : scheduled ? "var(--brand-card)" : "transparent",
                border: isToday
                  ? "2px solid var(--brand-primary)"
                  : done ? "1.5px solid #22c55e" : scheduled ? "1px solid var(--brand-border)" : "1px dashed var(--brand-border)",
              }}>
              {done
                ? <i className="ti ti-check text-xs" style={{ color: "#22c55e" }} />
                : scheduled
                  ? <i className="ti ti-barbell text-xs" style={{ color: "var(--brand-text-secondary)" }} />
                  : null
              }
            </div>
            <span className="text-xs" style={{ color: isToday ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>{d}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ClientDashboard({
  firstName, todayWorkout, metrics, completedCount, totalScheduled,
  recentWorkouts, streakDays, weekWorkouts,
}: Props) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const weights = metrics.map(m => m.weight).filter((v): v is number => v != null);
  const bodyFats = metrics.map(m => m.body_fat_pct).filter((v): v is number => v != null);
  const leanMasses = metrics.map(m => m.lean_mass).filter((v): v is number => v != null);
  const fatMasses = metrics.map(m => m.fat_mass).filter((v): v is number => v != null);

  const latestWeight = weights.length > 0 ? weights[weights.length - 1].toFixed(1) : null;
  const latestBF = bodyFats.length > 0 ? bodyFats[bodyFats.length - 1].toFixed(1) : null;
  const latestLean = leanMasses.length > 0 ? leanMasses[leanMasses.length - 1].toFixed(1) : null;
  const latestFat = fatMasses.length > 0 ? fatMasses[fatMasses.length - 1].toFixed(1) : null;

  const adherence = totalScheduled > 0 ? Math.round((completedCount / totalScheduled) * 100) : 0;
  const twStr = todayWorkout?.days?.label || "Today's Workout";
  const twDone = todayWorkout?.status === "completed";

  const isMilestone = streakDays > 0 && streakDays % 7 === 0;

  function fmtDate(d: string) {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div className="p-4 pb-28 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between pt-2">
        <div>
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{greeting},</p>
          <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>{firstName} 👋</h1>
        </div>
        {streakDays > 0 && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${isMilestone ? "animate-pulse" : ""}`}
            style={{ background: isMilestone ? "#f59e0b20" : "var(--brand-surface)", border: `1px solid ${isMilestone ? "#f59e0b" : "var(--brand-border)"}` }}>
            <span className="text-base">{isMilestone ? "🎉" : "🔥"}</span>
            <div>
              <span className="text-sm font-bold" style={{ color: isMilestone ? "#f59e0b" : "var(--brand-text)" }}>{streakDays}</span>
              <span className="text-xs ml-0.5" style={{ color: "var(--brand-text-secondary)" }}>day{streakDays !== 1 ? "s" : ""}</span>
            </div>
          </div>
        )}
      </div>

      {/* Week overview */}
      <div className="rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>This Week</p>
          <p className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>{adherence}% adherence</p>
        </div>
        <WeekRing workouts={weekWorkouts} />
      </div>

      {/* Today's Workout */}
      {todayWorkout ? (
        <Link href={`/workout/${todayWorkout.id}`}>
          <div className="rounded-2xl p-5 relative overflow-hidden cursor-pointer"
            style={{ background: "var(--brand-primary)" }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
              style={{ background: "white", transform: "translate(30%, -30%)" }} />
            <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full opacity-5"
              style={{ background: "white", transform: "translate(-30%, 30%)" }} />
            <div className="relative">
              <p className="text-xs font-semibold text-white/70 mb-1 uppercase tracking-widest">Today's Workout</p>
              <h2 className="text-xl font-bold text-white mb-3">{twStr}</h2>
              {twDone ? (
                <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5">
                  <i className="ti ti-check text-sm text-white" />
                  <span className="text-xs text-white font-medium">Completed ✓</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 bg-white text-sm font-semibold rounded-full px-4 py-2"
                  style={{ color: "var(--brand-primary)" }}>
                  <i className="ti ti-player-play" />
                  Start Workout
                </div>
              )}
            </div>
          </div>
        </Link>
      ) : (
        <div className="rounded-2xl p-5 text-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-moon text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Rest Day</p>
          <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>Recovery is part of the program 💪</p>
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/nutrition">
          <div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "#22c55e20" }}>
              <i className="ti ti-salad text-lg" style={{ color: "#22c55e" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Nutrition</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Log meals</p>
            </div>
          </div>
        </Link>
        <Link href="/log">
          <div className="rounded-2xl p-4 flex items-center gap-3 cursor-pointer"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "#f59e0b20" }}>
              <i className="ti ti-plus-circle text-lg" style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Log</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Cardio & weight</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Metrics */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Progress</h2>
          <Link href="/progress" className="text-xs font-medium" style={{ color: "var(--brand-primary)" }}>
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Body Weight" value={latestWeight} unit="lbs" values={weights} color="var(--brand-primary)" icon="ti-scale" />
          <MetricCard label="Body Fat" value={latestBF} unit="%" values={bodyFats} color="#f59e0b" icon="ti-percentage" />
          <MetricCard label="Lean Mass" value={latestLean} unit="lbs" values={leanMasses} color="#22c55e" icon="ti-barbell" />
          <MetricCard label="Fat Mass" value={latestFat} unit="lbs" values={fatMasses} color="#ef4444" icon="ti-flame" />
        </div>
        {metrics.length === 0 && (
          <div className="rounded-2xl py-8 text-center mt-2"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-chart-line text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              Your trainer will log your metrics after each assessment.
            </p>
          </div>
        )}
      </div>

      {/* Recent Workouts */}
      <div>
        <h2 className="text-base font-bold mb-2.5" style={{ color: "var(--brand-text)" }}>Recent Workouts</h2>
        {recentWorkouts.length === 0 ? (
          <div className="rounded-2xl py-8 text-center"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-trophy text-2xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              Complete your first workout to see history here.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            {recentWorkouts.map((w, i) => (
              <div key={w.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${i < recentWorkouts.length - 1 ? "border-b" : ""}`}
                style={{ borderColor: "var(--brand-border)" }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "#22c55e20" }}>
                  <i className="ti ti-check text-xs" style={{ color: "#22c55e" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>
                    {w.days?.label || "Workout"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {fmtDate(w.scheduled_date)}
                  </p>
                </div>
                <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
