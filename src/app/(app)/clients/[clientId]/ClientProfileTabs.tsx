"use client";

import { useSearchParams } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";
import AssignProgramModal from "./AssignProgramModal";
import MetricCards from "@/components/MetricCards";

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
  secondary_goals: string | null;
  experience_level: string | null;
  training_frequency: number | null;
  current_weight: number | null;
  current_body_fat_pct: number | null;
  date_of_birth: string | null;
  start_date: string | null;
  notes: string | null;
  current_fees: number | null;
  is_self_coached: boolean | null;
  payment_reminders_enabled: boolean | null;
  created_at: string | null;
}

interface Props {
  client: Client;
  metrics: MetricPoint[];
  allWorkouts: WorkoutEntry[];
  clientId: string;
  programs: { id: string; name: string; description: string | null }[];
  currentProgramId?: string;
  appointments?: any[];
}

// ---- Mini sparkline ----
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span style={{ color: "var(--brand-text-secondary)", fontSize: 12 }}>\u2014</span>;
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

  const recentCompleted = allWorkouts
    .filter(w => w.status === "completed" && w.scheduled_date <= todayStr)
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0];

  const todayWorkout = allWorkouts.find(w => w.scheduled_date === todayStr);

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
                {recentCompleted.scheduled_date === todayStr ? " \u2022 Today" :
                  ` \u2022 ${new Date(recentCompleted.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
              </p>
            </div>
            {(recentCompleted.days?.id || recentCompleted.day_id) ? (
              <Link href={`/workout/${recentCompleted.days?.id || recentCompleted.day_id}?forClient=${clientId}`}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "var(--brand-primary)15", color: "var(--brand-primary)" }}>
                View
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {todayWorkout && (() => {
        const done = todayWorkout.status === "completed";
        const dayId = todayWorkout.days?.id || todayWorkout.day_id;
        const sessionCard = (
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
        );
        return (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>Today's Session</p>
            {dayId ? <Link href={`/workout/${dayId}?forClient=${clientId}`}>{sessionCard}</Link> : sessionCard}
          </div>
        );
      })()}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Body Metrics Overview</p>
        <div className="space-y-2">
          {latestMetric ? [
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
                  {m.latest != null ? `${m.latest}${m.unit}` : "\u2014"}
                  {m.delta != null && (
                    <span className="text-[10px] font-normal ml-1.5" style={{ color: m.delta <= 0 ? "#22c55e" : "#ef4444" }}>
                      {m.delta > 0 ? "+" : ""}{m.delta.toFixed(1)}{m.unit}
                    </span>
                  )}
                </p>
              </div>
              <MiniSparkline values={m.values} color={m.color} />
            </div>
          )) : (
            <div className="rounded-xl py-6 text-center"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-chart-bar text-2xl block mb-1.5" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>No metrics on file</p>
            </div>
          )}
        </div>
      </div>

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

      {/* Trainer: open this client's nutrition plan + logging stats */}
      <Link
        href={"/nutrition?clientId=" + clientId}
        className="flex items-center justify-between rounded-xl p-4"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#22c55e20" }}>
            <i className="ti ti-salad text-base" style={{ color: "#22c55e" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Nutrition Plan &amp; Logs</p>
            <p className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>Meal plan, macros &amp; adherence</p>
          </div>
        </div>
        <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
      </Link>

      {client.injuries_limitations && (
        <div className="rounded-xl p-4"
          style={{ background: "#fef3c720", border: "1px solid #f59e0b40" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "#f59e0b" }}>
            <i className="ti ti-alert-triangle mr-1" />Injuries / Limitations
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--brand-text)" }}>{client.injuries_limitations}</p>
        </div>
      )}

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
          style={{ color: "var(--brand-text-secondary)" }}>Profile</p>
        <div className="rounded-xl overflow-hidden"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          {[
            { label: "Email", value: client.email },
            { label: "Phone", value: client.phone || "\u2014" },
            { label: "Goal", value: client.primary_goal || "\u2014" },
            { label: "Experience", value: client.experience_level || "\u2014" },
            { label: "Frequency", value: client.training_frequency ? `${client.training_frequency}x / week` : "\u2014" },
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
  const [viewMode, setViewMode] = useState<ViewMode>("1w");
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [weekAnchor, setWeekAnchor] = useState(() => {
    const d = new Date(today);
    const dow = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
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

  const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
    monday.setDate(d.getDate() - dow);
    monday.setHours(0, 0, 0, 0);
    setWeekAnchor(monday);
  }

  let headerLabel = "";
  if (viewMode === "4w") {
    headerLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else {
    const weeks = viewMode === "1w" ? 1 : 2;
    const endDate = new Date(weekAnchor);
    endDate.setDate(weekAnchor.getDate() + weeks * 7 - 1);
    const startLabel = weekAnchor.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    headerLabel = `${startLabel} \u2013 ${endLabel}`;
  }

  function WorkoutChip({ w, compact }: { w: WorkoutEntry; compact?: boolean }) {
    const done = w.status === "completed";
    const dayId = w.days?.id || w.day_id;
    if (!dayId) return null;
    return (
      <Link
        href={`/workout/${dayId}?forClient=${clientId}`}
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

  // Programming Engine button \u2014 appears above the calendar
  const ProgrammingEngineButton = (
    <div className="flex justify-end mb-3">
      <Link
        href={`/clients/${clientId}/program`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: "var(--brand-primary)", color: "white" }}>
        <i className="ti ti-engine" />
        Open Programming Engine
      </Link>
    </div>
  );

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
        {ProgrammingEngineButton}
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
      {ProgrammingEngineButton}
      <CalendarHeader label={headerLabel} onPrev={prev} onNext={next} onToday={goToday}
        viewMode={viewMode} onViewMode={setViewMode} />
      {Array.from({ length: numWeeks }).map((_, wi) => {
        const weekSlice = weekDays.slice(wi * 7, wi * 7 + 7);
        return (
          <div key={wi} className={wi > 0 ? "mt-3" : ""}>
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
      {metrics.length > 0 && [
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
                {latest != null ? `${latest}${m.unit}` : "\u2014"}
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
function InfoTab({ client, programs, currentProgramId, clientId }: {
  client: Client; programs: { id: string; name: string; description: string | null }[];
  currentProgramId?: string; clientId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<"" | "saved" | "error">("");
  const [form, setForm] = useState({
    phone: client.phone || "",
    primary_goal: client.primary_goal || "",
    secondary_goals: client.secondary_goals || "",
    experience_level: client.experience_level || "",
    training_frequency: client.training_frequency != null ? String(client.training_frequency) : "",
    current_weight: client.current_weight != null ? String(client.current_weight) : "",
    current_body_fat_pct: client.current_body_fat_pct != null ? String(client.current_body_fat_pct) : "",
    injuries_limitations: client.injuries_limitations || "",
    notes: client.notes || "",
    current_fees: client.current_fees != null ? String(client.current_fees) : "",
    is_self_coached: client.is_self_coached ?? false,
  });

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const save = useCallback(async () => {
    setSaving(true);
    setSaveMsg("");
    const supabase = createBrowserClient();
    const payload: Record<string, string | number | boolean | null> = {
      phone: form.phone || null,
      primary_goal: form.primary_goal || null,
      secondary_goals: form.secondary_goals || null,
      experience_level: form.experience_level || null,
      training_frequency: form.training_frequency ? Number(form.training_frequency) : null,
      current_weight: form.current_weight ? Number(form.current_weight) : null,
      current_body_fat_pct: form.current_body_fat_pct ? Number(form.current_body_fat_pct) : null,
      injuries_limitations: form.injuries_limitations || null,
      notes: form.notes || null,
      current_fees: form.current_fees ? Number(form.current_fees) : null,
      is_self_coached: form.is_self_coached,
    };
    const { error } = await (supabase as any).from("clients").update(payload).eq("id", clientId);
    setSaving(false);
    if (error) { setSaveMsg("error"); } else { setSaveMsg("saved"); setEditing(false); }
    setTimeout(() => setSaveMsg(""), 3000);
  }, [form, clientId]);

  function Row({ label, field, type = "text", placeholder = "" }: {
    label: string; field: keyof typeof form; type?: string; placeholder?: string;
  }) {
    const val = form[field] as string;
    return (
      <div className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
        style={{ borderColor: "var(--brand-border)" }}>
        <span className="text-xs font-medium w-28 flex-shrink-0 pt-2"
          style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
        {editing ? (
          <input type={type} value={val} onChange={e => set(field, e.target.value)}
            placeholder={placeholder || label} className="flex-1 text-sm rounded-lg px-2.5 py-1.5 outline-none"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-primary)", color: "var(--brand-text)" }} />
        ) : (
          <span className="text-sm flex-1 pt-1.5"
            style={{ color: val ? "var(--brand-text)" : "var(--brand-text-secondary)" }}>
            {val || "\u2014"}
          </span>
        )}
      </div>
    );
  }

  function TextAreaRow({ label, field, placeholder = "" }: {
    label: string; field: keyof typeof form; placeholder?: string;
  }) {
    const val = form[field] as string;
    return (
      <div className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
        style={{ borderColor: "var(--brand-border)" }}>
        <span className="text-xs font-medium w-28 flex-shrink-0 pt-1.5"
          style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
        {editing ? (
          <textarea rows={3} value={val} onChange={e => set(field, e.target.value)}
            placeholder={placeholder || label} className="flex-1 text-sm rounded-lg px-2.5 py-1.5 outline-none resize-none"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-primary)", color: "var(--brand-text)" }} />
        ) : (
          <span className="text-sm flex-1 pt-0.5"
            style={{ color: val ? "var(--brand-text)" : "var(--brand-text-secondary)", whiteSpace: "pre-wrap" }}>
            {val || "\u2014"}
          </span>
        )}
      </div>
    );
  }

  function SelectRow({ label, field, options }: {
    label: string; field: keyof typeof form; options: string[];
  }) {
    const val = form[field] as string;
    return (
      <div className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
        style={{ borderColor: "var(--brand-border)" }}>
        <span className="text-xs font-medium w-28 flex-shrink-0 pt-2"
          style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
        {editing ? (
          <select value={val} onChange={e => set(field, e.target.value)}
            className="flex-1 text-sm rounded-lg px-2.5 py-1.5 outline-none"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-primary)", color: "var(--brand-text)" }}>
            <option value="">\u2014</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <span className="text-sm flex-1 pt-1.5"
            style={{ color: val ? "var(--brand-text)" : "var(--brand-text-secondary)" }}>
            {val || "\u2014"}
          </span>
        )}
      </div>
    );
  }

  const currentProgram = programs.find(p => p.id === currentProgramId);
  function fmtDate(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="space-y-4">
      {saveMsg && (
        <div className="rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{ background: saveMsg === "saved" ? "#22c55e20" : "#ef444420", color: saveMsg === "saved" ? "#16a34a" : "#dc2626", border: `1px solid ${saveMsg === "saved" ? "#22c55e40" : "#ef444440"}` }}>
          {saveMsg === "saved" ? "\u2713 Changes saved" : "\u2717 Save failed \u2014 try again"}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--brand-primary)15" }}>
            <i className="ti ti-trophy text-base" style={{ color: "var(--brand-primary)" }} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--brand-text-secondary)" }}>Program</p>
            <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{currentProgram?.name || "None assigned"}</p>
          </div>
        </div>
        <Link href={`/clients/${clientId}/program`} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "var(--brand-primary)", color: "white" }}>
          Manage
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Client Details</h3>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm({ phone: client.phone || "", primary_goal: client.primary_goal || "", secondary_goals: client.secondary_goals || "", experience_level: client.experience_level || "", training_frequency: client.training_frequency != null ? String(client.training_frequency) : "", current_weight: client.current_weight != null ? String(client.current_weight) : "", current_body_fat_pct: client.current_body_fat_pct != null ? String(client.current_body_fat_pct) : "", injuries_limitations: client.injuries_limitations || "", notes: client.notes || "", current_fees: client.current_fees != null ? String(client.current_fees) : "", is_self_coached: client.is_self_coached ?? false }); }}
              className="px-3 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>Cancel</button>
            <button onClick={save} disabled={saving} className="px-3 py-1 rounded-lg text-xs font-semibold"
              style={{ background: "var(--brand-primary)", color: "white", opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving\u2026" : "Save"}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-pencil text-xs" />Edit
          </button>
        )}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="px-4 py-2 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Contact</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Email</span>
          <span className="text-sm" style={{ color: "var(--brand-text)" }}>{client.email}</span>
        </div>
        {Row({label:"Phone", field:"phone", type:"tel", placeholder:"+1 (555) 000-0000"})}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="px-4 py-2 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Training</p>
        </div>
        {Row({label:"Primary Goal", field:"primary_goal", placeholder:"e.g. Fat loss, muscle gain"})}
        {Row({label:"Secondary Goals", field:"secondary_goals", placeholder:"e.g. Improve endurance"})}
        {SelectRow({options:["Beginner", "Intermediate", "Advanced", "Elite"], label:"Experience", field:"experience_level"})}
        {Row({label:"Frequency", field:"training_frequency", type:"number", placeholder:"3"})}
        <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Start Date</span>
          <span className="text-sm" style={{ color: "var(--brand-text)" }}>{fmtDate(client.start_date)}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Date of Birth</span>
          <span className="text-sm" style={{ color: "var(--brand-text)" }}>{fmtDate(client.date_of_birth)}</span>
        </div>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="px-4 py-2 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Body Metrics</p>
        </div>
        {Row({label:"Weight (lbs)", field:"current_weight", type:"number", placeholder:"0.0"})}
        {Row({label:"Body Fat %", field:"current_body_fat_pct", type:"number", placeholder:"0.0"})}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="px-4 py-2 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Notes & Limitations</p>
        </div>
        {(form.injuries_limitations || editing) && (
          TextAreaRow({label:"Injuries / Limits", field:"injuries_limitations", placeholder:"Any injuries or movement restrictions"})
        )}
        {TextAreaRow({label:"Trainer Notes", field:"notes", placeholder:"Internal notes (not visible to client)"})}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="px-4 py-2 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Admin</p>
        </div>
        {Row({label:"Monthly Fee", field:"current_fees", type:"number", placeholder:"0"})}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Self-Coached</span>
          {editing ? (
            <button onClick={() => set("is_self_coached", !form.is_self_coached)} className="w-10 h-6 rounded-full relative transition-colors"
              style={{ background: form.is_self_coached ? "var(--brand-primary)" : "var(--brand-border)" }}>
              <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow"
                style={{ left: form.is_self_coached ? "calc(100% - 22px)" : "2px" }} />
            </button>
          ) : (
            <span className="text-sm" style={{ color: "var(--brand-text)" }}>{form.is_self_coached ? "Yes" : "No"}</span>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Payment SMS</span>
          <span className="text-sm" style={{ color: "var(--brand-text)" }}>{client.payment_reminders_enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderColor: "var(--brand-border)" }}>
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Client Since</span>
          <span className="text-sm" style={{ color: "var(--brand-text)" }}>
            {client.created_at ? new Date(client.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "\u2014"}
          </span>
        </div>
      </div>
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
    { id: "metrics" as const, label: "Progress", icon: "ti-chart-line" },
    { id: "info" as const, label: "Info", icon: "ti-user" },
  ];

  return (
    <div>
      <div className="sticky top-0 z-10 flex border-b overflow-x-auto no-scrollbar"
        style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
            style={{ borderColor: tab === t.id ? "var(--brand-primary)" : "transparent", color: tab === t.id ? "var(--brand-primary)" : "var(--brand-text-secondary)", background: "transparent" }}>
            <i className={`ti ${t.icon} text-base`} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tab === "overview" && (
          <OverviewTab client={client} allWorkouts={allWorkouts} metrics={metrics} clientId={clientId}
            programs={programs} currentProgramId={currentProgramId} onAssignProgram={() => setShowAssignModal(true)} />
        )}
        {tab === "training" && <TrainingCalendar workouts={allWorkouts} clientId={clientId} />}
        {tab === "metrics" && <MetricCards clientId={clientId} />}
        {tab === "info" && (
          <InfoTab client={client} programs={programs} currentProgramId={currentProgramId}
            clientId={clientId} />
        )}
      </div>
      {showAssignModal && (
        <AssignProgramModal clientId={clientId} clientName={client.name} programs={programs}
          currentProgramId={currentProgramId} onClose={() => setShowAssignModal(false)} />
      )}
    </div>
  );
}