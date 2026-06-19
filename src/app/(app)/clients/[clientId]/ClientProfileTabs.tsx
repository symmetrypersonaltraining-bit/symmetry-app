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

// ---- Training Calendar ----
function TrainingCalendar({ workouts, clientId }: { workouts: WorkoutEntry[]; clientId: string }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  // Build a map: date string -> workouts
  const workoutMap = useMemo(() => {
    const map: Record<string, WorkoutEntry[]> = {};
    for (const w of workouts) {
      if (!map[w.scheduled_date]) map[w.scheduled_date] = [];
      map[w.scheduled_date].push(w);
    }
    return map;
  }, [workouts]);

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  function goToday() {
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  // Build calendar grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Start grid on Monday
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0

  const days: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Pad to complete last row
  while (days.length % 7 !== 0) days.push(null);

  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayStr = today.toISOString().split("T")[0];

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      {/* Calendar header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={goToday}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)", background: "var(--brand-surface)" }}>
          Today
        </button>
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-chevron-left text-sm" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{monthLabel}</span>
      </div>

      {/* DOW headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase py-1"
            style={{ color: "var(--brand-text-secondary)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px" style={{ background: "var(--brand-border)" }}>
        {days.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} style={{ background: "var(--brand-bg)", minHeight: 80 }} />;
          }
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === todayStr;
          const dayWorkouts = workoutMap[dateStr] || [];
          const completed = dayWorkouts.filter(w => w.status === "completed").length;

          return (
            <div key={dateStr}
              style={{ background: "var(--brand-surface)", minHeight: 80, padding: "6px 4px" }}>
              {/* Date number */}
              <div className="flex items-center justify-center mb-1">
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                  style={{
                    background: isToday ? "var(--brand-primary)" : "transparent",
                    color: isToday ? "white" : "var(--brand-text-secondary)",
                  }}>
                  {day.getDate()}
                </span>
              </div>

              {/* Workout chips */}
              <div className="space-y-0.5">
                {dayWorkouts.slice(0, 2).map(w => {
                  const done = w.status === "completed";
                  const dayId = w.days?.id || w.day_id;
                  return (
                    <Link key={w.id}
                      href={`/clients/${clientId}/day/${dayId}`}
                      className="block px-1.5 py-0.5 rounded text-[9px] leading-tight font-medium truncate"
                      style={{
                        background: done ? "#22c55e20" : "var(--brand-primary)20",
                        color: done ? "#22c55e" : "var(--brand-primary)",
                        border: `1px solid ${done ? "#22c55e40" : "var(--brand-primary)40"}`,
                        display: "block",
                      }}>
                      {w.days?.label || "Workout"}
                    </Link>
                  );
                })}
                {dayWorkouts.length > 2 && (
                  <p className="text-[9px] text-center" style={{ color: "var(--brand-text-secondary)" }}>
                    +{dayWorkouts.length - 2} more
                  </p>
                )}
              </div>

              {/* Completion dot */}
              {dayWorkouts.length > 0 && completed === dayWorkouts.length && (
                <div className="mt-1 flex justify-center">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
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
    </div>
  );
}

// ---- Overview tab content ----
function OverviewTab({ allWorkouts, clientId }: { allWorkouts: WorkoutEntry[]; clientId: string }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const in14 = new Date();
  in14.setDate(in14.getDate() + 14);
  const in14Str = in14.toISOString().split("T")[0];

  const upcoming = allWorkouts
    .filter(w => w.scheduled_date >= todayStr && w.scheduled_date <= in14Str)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 8);

  const todayW = upcoming.find(w => w.scheduled_date === todayStr);
  const upcomingFuture = upcoming.filter(w => w.scheduled_date !== todayStr);

  return (
    <div className="space-y-4">
      {/* TODAY */}
      {todayW && (() => {
        const done = todayW.status === "completed";
        const dayId = todayW.days?.id || todayW.day_id;
        return (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>Today&apos;s Session</p>
            <Link href={`/clients/${clientId}/day/${dayId}`}>
              <div className="rounded-2xl p-5 relative overflow-hidden"
                style={{ background: done ? "var(--brand-surface)" : "var(--brand-primary)", border: done ? "1px solid var(--brand-border)" : "none" }}>
                {!done && (
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10"
                    style={{ background: "white", transform: "translate(30%,-30%)" }} />
                )}
                <div className="relative flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: done ? "var(--brand-text)" : "white" }}>
                      {todayW.days?.label || "Workout"}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: done ? "var(--brand-text-secondary)" : "rgba(255,255,255,0.7)" }}>Today</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: done ? "#22c55e20" : "rgba(255,255,255,0.2)" }}>
                    <i className={`ti ${done ? "ti-check" : "ti-player-play"} text-xl`}
                      style={{ color: done ? "#22c55e" : "white" }} />
                  </div>
                </div>
                {!done && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 text-sm font-bold"
                    style={{ color: "var(--brand-primary)" }}>
                    <i className="ti ti-player-play" />Run Session
                  </div>
                )}
              </div>
            </Link>
          </div>
        );
      })()}

      {/* UPCOMING */}
      {upcomingFuture.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--brand-text-secondary)" }}>Upcoming 2 Weeks</p>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            {upcomingFuture.map((w, i, arr) => {
              const dt = new Date(w.scheduled_date + "T00:00:00");
              const dow = dt.toLocaleDateString("en-US", { weekday: "short" });
              const done = w.status === "completed";
              const dayId = w.days?.id || w.day_id;
              return (
                <Link key={w.id} href={`/clients/${clientId}/day/${dayId}`}
                  className={`flex items-center gap-4 px-4 py-3.5 ${i < arr.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--brand-border)", display: "flex" }}>
                  <div className="text-center w-10 flex-shrink-0">
                    <div className="text-[10px] font-semibold uppercase" style={{ color: "var(--brand-text-secondary)" }}>{dow}</div>
                    <div className="text-sm font-bold" style={{ color: "var(--brand-text)" }}>{dt.getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>
                      {w.days?.label || "Workout"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                      {dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {done && <i className="ti ti-check text-sm" style={{ color: "#22c55e" }} />}
                  <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="rounded-2xl py-10 text-center"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          <i className="ti ti-calendar-x text-3xl mb-2 block" style={{ color: "var(--brand-text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No workouts scheduled in the next 14 days</p>
        </div>
      )}
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
function InfoTab({ client, programs, currentProgramId, clientId, onAssignProgram }: { client: Client; programs: { id: string; name: string; description: string | null }[]; currentProgramId?: string; clientId: string; onAssignProgram: () => void }) {
  return (
    <div className="space-y-3">
      {/* Program assignment */}
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
      {/* Tab bar — pinned to top of white area */}
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
        {tab === "overview" && <OverviewTab allWorkouts={allWorkouts} clientId={clientId} />}
        {tab === "training" && <TrainingCalendar workouts={allWorkouts} clientId={clientId} />}
        {tab === "metrics" && <MetricsTab metrics={metrics} />}
        {tab === "info" && <InfoTab client={client} programs={programs} currentProgramId={currentProgramId} clientId={clientId} onAssignProgram={() => setShowAssignModal(true)} />}
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
