"use client";

import { useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";
import Link from "next/link";
import AssignProgramModal from "./AssignProgramModal";

interface MetricPoint {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

interface WorkoutEntry {
  id: string;
  scheduled_date: string;
  status: string;
  day_id: string | null;
  days: { id: string; label: string; position?: number } | null;
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
  allWorkouts: WorkoutEntry[];
  clientId: string;
  programs: { id: string; name: string; description: string | null }[];
  currentProgramId?: string;
}

// ---- Mini sparkline ----
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

// ---- Overview Tab ----
function OverviewTab({ client, allWorkouts, metrics, clientId, programs, currentProgramId, onAssignProgram }: {
  client: Client;
  allWorkouts: WorkoutEntry[];
  metrics: MetricPoint[];
  clientId: string;
  programs: { id: string; name: string; description: string | null }[];
  currentProgramId?: string;
  onAssignProgram: () => void;
}) {
  const todayStr = new Date().toISOString().split("T")[0];

  // Training stats
  const last7Start = new Date(); last7Start.setDate(last7Start.getDate() - 7);
  const last7Str = last7Start.toISOString().split("T")[0];
  const last30Start = new Date(); last30Start.setDate(last30Start.getDate() - 30);
  const last30Str = last30Start.toISOString().split("T")[0];
  const nextWeekStart = new Date(); nextWeekStart.setDate(nextWeekStart.getDate() + 1);
  const nextWeekEnd = new Date(); nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const nextWeekStartStr = nextWeekStart.toISOString().split("T")[0];
  const nextWeekEndStr = nextWeekEnd.toISOString().split("T")[0];

  const last7 = allWorkouts.filter(w => w.scheduled_date >= last7Str && w.scheduled_date <= todayStr);
  const last30 = allWorkouts.filter(w => w.scheduled_date >= last30Str && w.scheduled_date <= todayStr);
  const nextWeek = allWorkouts.filter(w => w.scheduled_date >= nextWeekStartStr && w.scheduled_date <= nextWeekEndStr);

  const last7Completed = last7.filter(w => w.status === "completed").length;
  const last30Completed = last30.filter(w => w.status === "completed").length;

  // Last workout
  const recentCompleted = allWorkouts
    .filter(w => w.status === "completed" && w.scheduled_date <= todayStr)
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0];

  // Today's workout
  const todayWorkout = allWorkouts.find(w => w.scheduled_date === todayStr);

  // Latest metrics
  const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;
  const prevMetric = metrics.length > 1 ? metrics[metrics.length - 2] : null;
  const weightDelta = latestMetric?.weight != null && prevMetric?.weight != null
    ? latestMetric.weight - prevMetric.weight : null;
  const bfDelta = latestMetric?.body_fat_pct != null && prevMetric?.body_fat_pct != null
    ? latestMetric.body_fat_pct - prevMetric.body_fat_pct : null;

  const weights = metrics.map(m => m.weight).filter((v): v is number => v != null);
  const bodyFats = metrics.map(m => m.body_fat_pct).filter((v): v is number => v != null);

  const currentProgram = programs.find(p => p.id === currentProgramId);

  return (
    <div className="space-y-4">
      {/* Training Stats */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Training</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "LAST 7 DAYS", value: `${last7Completed}/${last7.length}`, sub: "Tracked" },
            { label: "LAST 30 DAYS", value: `${last30Completed}/${last30.length}`, sub: "Tracked" },
            { label: "NEXT WEEK", value: nextWeek.length.toString(), sub: "Assigned" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-3 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <p className="text-[9px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--brand-text-secondary)" }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: "var(--brand-text)" }}>{s.value}</p>
              <p className="text-[10px] mt-0.5" style={{ color: s.sub === "Assigned" ? "var(--brand-text-secondary)" : "#22c55e" }}>{s.sub}</p>
            </div>
          ))}
        </div>
        {recentCompleted && (
          <div className="mt-2 px-3 py-2 rounded-xl flex items-center justify-between"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="flex items-center gap-2">
              <i className="ti ti-check-circle text-sm" style={{ color: "#22c55e" }} />
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                Last workout: <span style={{ color: "var(--brand-text)", fontWeight: 600 }}>
                  {recentCompleted.days?.label || "Workout"}
                </span>
                {recentCompleted.scheduled_date === todayStr ? " • Today" :
                  ` • ${new Date(recentCompleted.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            </div>
            <Link href={`/clients/${clientId}/day/${recentCompleted.days?.id || recentCompleted.day_id}`}
              className="text-[10px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: "var(--brand-primary)15", color: "var(--brand-primary)" }}>
              View
            </Link>
          </div>
        )}
      </div>

      {/* Today's session */}
      {todayWorkout && (() => {
        const done = todayWorkout.status === "completed";
        const dayId = todayWorkout.days?.id || todayWorkout.day_id;
        return (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>Today&apos;s Session</p>
            <Link href={`/clients/${clientId}/day/${dayId}`}>
              <div className="rounded-xl p-4 relative overflow-hidden"
                style={{ background: done ? "var(--brand-surface)" : "var(--brand-primary)", border: done ? "1px solid var(--brand-border)" : "none" }}>
                {!done && (
                  <div className="absolute top-0 right-0 w-28 h-28 rounded-full opacity-10"
                    style={{ background: "white", transform: "translate(30%,-30%)" }} />
                )}
                <div className="relative flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold" style={{ color: done ? "var(--brand-text)" : "white" }}>
                      {todayWorkout.days?.label || "Workout"}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: done ? "var(--brand-text-secondary)" : "rgba(255,255,255,0.7)" }}>
                      {done ? "Completed" : "Not started"}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: done ? "#22c55e20" : "rgba(255,255,255,0.2)" }}>
                    <i className={`ti ${done ? "ti-check" : "ti-player-play"} text-lg`}
                      style={{ color: done ? "#22c55e" : "white" }} />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        );
      })()}

      {/* Body Metrics */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Body Metrics Overview</p>
        <div className="space-y-2">
          {[
            { label: "Weight", latest: latestMetric?.weight, unit: "lb", delta: weightDelta, values: weights, color: "var(--brand-primary)", icon: "ti-scale" },
            { label: "Body Fat", latest: latestMetric?.body_fat_pct, unit: "%", delta: bfDelta, values: bodyFats, color: "#f59e0b", icon: "ti-percentage" },
          ].map(m => (
            <div key={m.label} className="rounded-xl p-3 flex items-center gap-3"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${m.color}15` }}>
                <i className={`ti ${m.icon} text-sm`} style={{ color: m.color }} />
              </div>
              <div className="flex-1">
                <p className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{m.label}</p>
                <p className="text-base font-bold leading-tight" style={{ color: "var(--brand-text)" }}>
                  {m.latest != null ? `${m.latest}${m.unit}` : "—"}
                  {m.delta != null && (
                    <span className="text-[10px] font-normal ml-1.5" style={{ color: m.delta <= 0 ? "#22c55e" : "#ef4444" }}>
                      {m.delta > 0 ? "+" : ""}{m.delta.toFixed(1)}{m.unit}
                    </span>
                  )}
                </p>
              </div>
              <MiniSparkline values={m.values} color={m.color} />
            </div>
          ))}
          {!latestMetric && (
            <div className="rounded-xl py-6 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>No metrics logged yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Program + Contact */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Program</p>
        <div className="rounded-xl flex items-center justify-between px-4 py-3"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--brand-primary)15" }}>
              <i className="ti ti-trophy text-sm" style={{ color: "var(--brand-primary)" }} />
            </div>
            <div>
              <p className="text-xs font-medium" style={{ color: "var(--brand-text)" }}>
                {currentProgram?.name || "None assigned"}
              </p>
              {currentProgram && <p className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>Active program</p>}
            </div>
          </div>
          <button onClick={onAssignProgram}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--brand-primary)", color: "white" }}>
            {currentProgramId ? "Change" : "Assign"}
          </button>
        </div>
      </div>

      {/* Injuries */}
      {client.injuries_limitations && (
        <div className="rounded-xl p-4"
          style={{ background: "#fef3c720", border: "1px solid #f59e0b40" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#f59e0b" }}>
            <i className="ti ti-alert-triangle mr-1" />Injuries / Limitations
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--brand-text)" }}>{client.injuries_limitations}</p>
        </div>
      )}

      {/* Contact */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Profile</p>
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
              <span className="text-[11px] font-medium w-20 flex-shrink-0 pt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                {row.label}
              </span>
              <span className="text-sm flex-1" style={{ color: "var(--brand-text)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- Training Calendar with 1W / 2W / 4W toggle ----
type ViewMode = "1w" | "2w" | "4w";

function TrainingCalendar({ workouts, clientId }: { workouts: WorkoutEntry[]; clientId: string }) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [viewMode, setViewMode] = useState<ViewMode>("4w");
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  // For 1w/2w: anchor to week containing viewDate
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const d = new Date(today);
    const dow = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const workoutMap = useMemo(() => {
    const map: Record<string, WorkoutEntry[]> = {};
    for (const w of workouts) {
      if (!map[w.scheduled_date]) map[w.scheduled_date] = [];
      map[w.scheduled_date].push(w);
    }
    return map;
  }, [workouts]);

  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Navigate helpers
  function prev() {
    if (viewMode === "4w") {
      setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    } else {
      const weeks = viewMode === "1w" ? 1 : 2;
      setWeekAnchor(d => { const n = new Date(d); n.setDate(n.getDate() - weeks * 7); return n; });
    }
  }
  function next() {
    if (viewMode === "4w") {
      setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    } else {
      const weeks = viewMode === "1w" ? 1 : 2;
      setWeekAnchor(d => { const n = new Date(d); n.setDate(n.getDate() + weeks * 7); return n; });
    }
  }
  function goToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const d = new Date(today);
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    setWeekAnchor(monday);
  }

  // Label for header
  let headerLabel = "";
  if (viewMode === "4w") {
    headerLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else {
    const weeks = viewMode === "1w" ? 1 : 2;
    const endDate = new Date(weekAnchor);
    endDate.setDate(weekAnchor.getDate() + weeks * 7 - 1);
    const startLabel = weekAnchor.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    headerLabel = `${startLabel} – ${endLabel}`;
  }

  // Workout chip component (shared)
  function WorkoutChip({ w, compact }: { w: WorkoutEntry; compact?: boolean }) {
    const done = w.status === "completed";
    const dayId = w.days?.id || w.day_id;
    if (!dayId) return null;
    return (
      <Link
        href={`/clients/${clientId}/day/${dayId}`}
        className="block rounded px-1.5 truncate"
        style={{
          background: done ? "#22c55e20" : "var(--brand-primary)20",
          color: done ? "#16a34a" : "var(--brand-primary)",
          border: `1px solid ${done ? "#22c55e40" : "var(--brand-primary)40"}`,
          fontSize: compact ? 9 : 11,
          lineHeight: compact ? "16px" : "20px",
          fontWeight: 500,
        }}>
        {w.days?.label || "Workout"}
      </Link>
    );
  }

  // ---- 4-week (monthly) grid ----
  if (viewMode === "4w") {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const days: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);

    return (
      <div>
        <CalendarHeader label={headerLabel} onPrev={prev} onNext={next} onToday={goToday}
          viewMode={viewMode} onViewMode={setViewMode} />
        <div className="grid grid-cols-7 mb-1">
          {DOW_LABELS.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase py-1"
              style={{ color: "var(--brand-text-secondary)" }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px" style={{ background: "var(--brand-border)" }}>
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} style={{ background: "var(--brand-bg)", minHeight: 72 }} />;
            const ds = day.toISOString().split("T")[0];
            const isToday = ds === todayStr;
            const dws = workoutMap[ds] || [];
            return (
              <div key={ds} style={{ background: "var(--brand-surface)", minHeight: 72, padding: "4px 3px" }}>
                <div className="flex justify-center mb-1">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
                    style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text-secondary)" }}>
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {dws.slice(0, 2).map(w => <WorkoutChip key={w.id} w={w} compact />)}
                  {dws.length > 2 && (
                    <p className="text-[9px] text-center" style={{ color: "var(--brand-text-secondary)" }}>+{dws.length - 2}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <CalendarLegend />
      </div>
    );
  }

  // ---- 1-week or 2-week expanded view ----
  const numWeeks = viewMode === "1w" ? 1 : 2;
  const weekDays: Date[] = [];
  for (let w = 0; w < numWeeks; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekAnchor);
      day.setDate(weekAnchor.getDate() + w * 7 + d);
      weekDays.push(day);
    }
  }

  return (
    <div>
      <CalendarHeader label={headerLabel} onPrev={prev} onNext={next} onToday={goToday}
        viewMode={viewMode} onViewMode={setViewMode} />

      {/* Week rows */}
      {Array.from({ length: numWeeks }).map((_, wi) => {
        const weekSlice = weekDays.slice(wi * 7, wi * 7 + 7);
        return (
          <div key={wi} className={wi > 0 ? "mt-3" : ""}>
            {/* DOW headers for first week (or each week in 2w) */}
            <div className="grid grid-cols-7 mb-1">
              {DOW_LABELS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold uppercase py-1"
                  style={{ color: "var(--brand-text-secondary)" }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px" style={{ background: "var(--brand-border)" }}>
              {weekSlice.map(day => {
                const ds = day.toISOString().split("T")[0];
                const isToday = ds === todayStr;
                const dws = workoutMap[ds] || [];
                const minH = viewMode === "1w" ? 140 : 100;
                return (
                  <div key={ds} style={{ background: "var(--brand-surface)", minHeight: minH, padding: "6px 4px" }}>
                    <div className="flex justify-center mb-2">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text)" }}>
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dws.map(w => <WorkoutChip key={w.id} w={w} compact={false} />)}
                      {dws.length === 0 && (
                        <p className="text-[9px] text-center mt-2" style={{ color: "var(--brand-text-secondary)" }}>—</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <CalendarLegend />
    </div>
  );
}

function CalendarHeader({ label, onPrev, onNext, onToday, viewMode, onViewMode }: {
  label: string; onPrev: () => void; onNext: () => void; onToday: () => void;
  viewMode: ViewMode; onViewMode: (v: ViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <button onClick={onToday}
        className="px-2.5 py-1 rounded-lg text-xs font-medium border"
        style={{ borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)", background: "var(--brand-surface)" }}>
        Today
      </button>
      <button onClick={onPrev} className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
      </button>
      <button onClick={onNext} className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
      </button>
      <span className="text-sm font-semibold flex-1" style={{ color: "var(--brand-text)" }}>{label}</span>
      {/* View toggle */}
      <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
        {(["1w", "2w", "4w"] as ViewMode[]).map(v => (
          <button key={v} onClick={() => onViewMode(v)}
            className="px-2.5 py-1 text-xs font-semibold transition-colors"
            style={{
              background: viewMode === v ? "var(--brand-primary)" : "var(--brand-surface)",
              color: viewMode === v ? "white" : "var(--brand-text-secondary)",
            }}>
            {v === "1w" ? "1 Week" : v === "2w" ? "2 Week" : "4 Week"}
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarLegend() {
  return (
    <div className="flex items-center gap-4 mt-3">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded" style={{ background: "var(--brand-primary)20", border: "1px solid var(--brand-primary)40" }} />
        <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>Assigned</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded" style={{ background: "#22c55e20", border: "1px solid #22c55e40" }} />
        <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>Completed</span>
      </div>
    </div>
  );
}

// ---- Metrics tab ----
function MetricsTab({ metrics }: { metrics: MetricPoint[] }) {
  const weights = metrics.map(m => m.weight).filter((v): v is number => v != null);
  const bodyFats = metrics.map(m => m.body_fat_pct).filter((v): v is number => v != null);
  const leanMasses = metrics.map(m => m.lean_mass).filter((v): v is number => v != null);
  return (
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
        <div className="rounded-xl py-10 text-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-chart-bar text-3xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No metrics logged yet</p>
        </div>
      )}
    </div>
  );
}

// ---- Info tab ----
function InfoTab({ client, programs, currentProgramId, clientId, onAssignProgram }: {
  client: Client; programs: { id: string; name: string; description: string | null }[];
  currentProgramId?: string; clientId: string; onAssignProgram: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "var(--brand-primary)15" }}>
            <i className="ti ti-trophy text-base" style={{ color: "var(--brand-primary)" }} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brand-text-secondary)" }}>Program</p>
            <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>
              {programs.find(p => p.id === currentProgramId)?.name || "None assigned"}
            </p>
          </div>
        </div>
        <button onClick={onAssignProgram}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "var(--brand-primary)", color: "white" }}>
          {currentProgramId ? "Change" : "Assign"}
        </button>
      </div>
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
            <span className="text-xs font-medium w-24 flex-shrink-0 pt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{row.label}</span>
            <span className="text-sm flex-1" style={{ color: "var(--brand-text)" }}>{row.value}</span>
          </div>
        ))}
      </div>
      {client.injuries_limitations && (
        <div className="rounded-xl p-4" style={{ background: "#fef3c720", border: "1px solid #f59e0b40" }}>
          <p className="text-xs font-semibold mb-1" style={{ color: "#f59e0b" }}>
            <i className="ti ti-alert-triangle mr-1" />Injuries / Limitations
          </p>
          <p className="text-sm" style={{ color: "var(--brand-text)" }}>{client.injuries_limitations}</p>
        </div>
      )}
    </div>
  );
}

// ---- Main component ----
export default function ClientProfileTabs({ client, metrics, allWorkouts, clientId, programs, currentProgramId }: Props) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "overview" | "training" | "metrics" | "info") ?? "overview";
  const [tab, setTab] = useState<"overview" | "training" | "metrics" | "info">(initialTab);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: "ti-layout-dashboard" },
    { id: "training" as const, label: "Training", icon: "ti-calendar" },
    { id: "metrics" as const, label: "Metrics", icon: "ti-chart-line" },
    { id: "info" as const, label: "Info", icon: "ti-user" },
  ];

  return (
    <div>
      <div className="sticky top-0 z-10 flex border-b overflow-x-auto no-scrollbar"
        style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
            style={{
              borderColor: tab === t.id ? "var(--brand-primary)" : "transparent",
              color: tab === t.id ? "var(--brand-primary)" : "var(--brand-text-secondary)",
              background: "transparent",
            }}>
            <i className={`ti ${t.icon} text-base`} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === "overview" && (
          <OverviewTab
            client={client}
            allWorkouts={allWorkouts}
            metrics={metrics}
            clientId={clientId}
            programs={programs}
            currentProgramId={currentProgramId}
            onAssignProgram={() => setShowAssignModal(true)}
          />
        )}
        {tab === "training" && <TrainingCalendar workouts={allWorkouts} clientId={clientId} />}
        {tab === "metrics" && <MetricsTab metrics={metrics} />}
        {tab === "info" && (
          <InfoTab client={client} programs={programs} currentProgramId={currentProgramId}
            clientId={clientId} onAssignProgram={() => setShowAssignModal(true)} />
        )}
      </div>

      {showAssignModal && (
        <AssignProgramModal
          clientId={clientId}
          clientName={client.name}
          programs={programs}
          currentProgramId={currentProgramId}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}
