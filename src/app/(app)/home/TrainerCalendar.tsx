"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ---- Types ----
type ViewMode = "week" | "2week" | "month";

interface AE {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
  scheduledAt: string;
  endsAt: string | null;
}

interface Client { id: string; name: string; }

interface WorkoutEv {
  id: string;
  clientId: string;
  clientName: string;
  date: string;
  dayLabel: string;
  status: string;
}

interface Props {
  clients: Client[];
  appointmentMap: Record<string, AE[]>;
  workoutMap: Record<string, WorkoutEv[]>;
  startDate: string;
}

// ---- Constants ----
const CLIENT_COLORS = [
  "#1E88E5","#43A047","#8E24AA","#FB8C00","#00ACC1",
  "#E91E63","#7CB342","#3949AB","#00897B","#F4511E",
  "#6D4C41","#039BE5",
];
const HOUR_PX = 64;      // px per hour in week view
const DAY_START = 5;     // 5 AM
const DAY_END = 22;      // 10 PM
const TOTAL_HOURS = DAY_END - DAY_START;
const TIME_COL_W = 52;   // px for time labels column
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function clientColor(clients: Client[], clientId: string) {
  const idx = clients.findIndex(c => c.id === clientId);
  return CLIENT_COLORS[idx >= 0 ? idx % CLIENT_COLORS.length : 0];
}

// Parse "2026-06-22 10:30:00+00" → local Date
function parseAppt(str: string): Date {
  return new Date(str.replace(" ", "T").replace("+00", "Z"));
}

// Lay out events side-by-side when they overlap
function layoutEvents(events: AE[]): Array<AE & { lane: number; laneCount: number }> {
  if (events.length === 0) return [];
  const parsed = events.map(e => {
    const s = parseAppt(e.scheduledAt);
    const en = e.endsAt ? parseAppt(e.endsAt) : new Date(s.getTime() + 3600000);
    return { ...e, startMs: s.getTime(), endMs: en.getTime(), lane: 0, laneCount: 1 };
  }).sort((a, b) => a.startMs - b.startMs);

  const lanes: number[] = [];
  for (const ev of parsed) {
    let lane = lanes.findIndex(end => end <= ev.startMs);
    if (lane === -1) { lane = lanes.length; lanes.push(ev.endMs); }
    else lanes[lane] = ev.endMs;
    ev.lane = lane;
  }
  const total = lanes.length;
  return parsed.map(ev => ({ ...ev, laneCount: total }));
}

// Event block in time grid
function EventBlock({ ev, clients, onClick }: {
  ev: AE & { lane: number; laneCount: number };
  clients: Client[];
  onClick: (ev: AE) => void;
}) {
  const start = parseAppt(ev.scheduledAt);
  const end = ev.endsAt ? parseAppt(ev.endsAt) : new Date(start.getTime() + 3600000);
  const startMin = start.getHours() * 60 + start.getMinutes();
  const endMin = end.getHours() * 60 + end.getMinutes();
  const dayStartMin = DAY_START * 60;
  const top = Math.max((startMin - dayStartMin) / 60 * HOUR_PX, 0);
  const height = Math.max((endMin - startMin) / 60 * HOUR_PX, 22);
  const color = clientColor(clients, ev.clientId);
  const pct = 100 / ev.laneCount;
  const left = ev.lane * pct;
  const isCancelled = ev.status === "cancelled";

  const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div
      onClick={() => onClick(ev)}
      style={{
        position: "absolute",
        top, left: `${left}%`, width: `calc(${pct}% - 2px)`,
        height: Math.max(height, 22),
        background: isCancelled ? "var(--brand-surface)" : `${color}e0`,
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "2px 5px",
        cursor: "pointer",
        overflow: "hidden",
        zIndex: 2,
        opacity: isCancelled ? 0.5 : 1,
      }}>
      <p className="text-xs font-semibold leading-tight truncate"
        style={{ color: isCancelled ? "var(--brand-text)" : "white", textDecoration: isCancelled ? "line-through" : "none" }}>
        {ev.clientName}
      </p>
      {height > 32 && (
        <p className="text-[10px] leading-tight" style={{ color: isCancelled ? "var(--brand-text-secondary)" : "rgba(255,255,255,0.85)" }}>
          {fmtTime(start)}–{fmtTime(end)}
        </p>
      )}
    </div>
  );
}

// Mini month calendar for sidebar
function MiniMonthCal({ year, month, selectedDate, onDateClick }: {
  year: number; month: number; selectedDate: Date; onDateClick: (d: Date) => void;
}) {
  const [m, setM] = useState({ year, month });
  const todayStr = new Date().toISOString().split("T")[0];
  const selStr = selectedDate.toISOString().split("T")[0];

  const firstDay = new Date(m.year, m.month, 1);
  const lastDay = new Date(m.year, m.month + 1, 0);
  let startDow = firstDay.getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const label = new Date(m.year, m.month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setM(p => {
          const d = new Date(p.year, p.month - 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10">
          <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>{label}</span>
        <button onClick={() => setM(p => {
          const d = new Date(p.year, p.month + 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })} className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10">
          <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold" style={{ color: "var(--brand-text-secondary)" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const ds = `${m.year}-${String(m.month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isToday = ds === todayStr;
          const isSel = ds === selStr;
          return (
            <button key={i} onClick={() => onDateClick(new Date(m.year, m.month, day))}
              className="w-full aspect-square flex items-center justify-center rounded-full text-[11px] font-medium"
              style={{
                background: isSel ? "var(--brand-primary)" : isToday ? "#E5393520" : "transparent",
                color: isSel ? "white" : isToday ? "#E53935" : "var(--brand-text)",
                fontWeight: isToday || isSel ? 700 : 400,
              }}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Add Session Modal
function AddSessionModal({ date, timeStr, clients, onClose, onSaved }: {
  date: Date; timeStr: string; clients: Client[]; onClose: () => void; onSaved: () => void;
}) {
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [startTime, setStartTime] = useState(timeStr);
  const [endTime, setEndTime] = useState(() => {
    const [h, m] = timeStr.split(":").map(Number);
    return `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  });
  const [title, setTitle] = useState("Training Session");
  const [recurring, setRecurring] = useState("none");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const dateStr = date.toISOString().split("T")[0];

    const buildRow = (ds: string) => ({
      client_id: clientId,
      scheduled_at: `${ds}T${startTime}:00`,
      ends_at: `${ds}T${endTime}:00`,
      title,
      status: "scheduled",
    });

    const rows = [buildRow(dateStr)];

    if (recurring !== "none") {
      const weeks = recurring === "4w" ? 4 : recurring === "8w" ? 8 : 12;
      for (let w = 1; w < weeks; w++) {
        const d = new Date(date);
        d.setDate(d.getDate() + w * 7);
        rows.push(buildRow(d.toISOString().split("T")[0]));
      }
    }

    for (const row of rows) {
      await supabase.from("appointments").insert(row);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Add Session</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg"
            style={{ background: "var(--brand-bg)" }}>
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
        <div className="text-sm font-medium" style={{ color: "var(--brand-text-secondary)" }}>
          {date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </div>

        {/* Client */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>Client</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Time */}
        <div className="grid grid-cols-2 gap-3">
          {[["Start", startTime, setStartTime], ["End", endTime, setEndTime]].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>{label as string}</label>
              <input type="time" value={val as string} onChange={e => (setter as any)(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            </div>
          ))}
        </div>

        {/* Title */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>Title (optional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
        </div>

        {/* Recurring */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: "var(--brand-text-secondary)" }}>Repeat weekly</label>
          <div className="grid grid-cols-4 gap-2">
            {[["none","None"],["4w","4 wks"],["8w","8 wks"],["12w","12 wks"]].map(([val, lbl]) => (
              <button key={val} onClick={() => setRecurring(val)}
                className="rounded-xl py-2 text-xs font-semibold transition-colors"
                style={{
                  background: recurring === val ? "var(--brand-primary)" : "var(--brand-bg)",
                  color: recurring === val ? "white" : "var(--brand-text-secondary)",
                  border: `1px solid ${recurring === val ? "var(--brand-primary)" : "var(--brand-border)"}`,
                }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-bold text-sm"
          style={{ background: "var(--brand-primary)", color: "white", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : recurring !== "none" ? `Save (${recurring === "4w" ? 4 : recurring === "8w" ? 8 : 12} sessions)` : "Save Session"}
        </button>
      </div>
    </div>
  );
}

// Event detail popup
function EventPopup({ ev, clients, onClose }: { ev: AE; clients: Client[]; onClose: () => void }) {
  const color = clientColor(clients, ev.clientId);
  const start = parseAppt(ev.scheduledAt);
  const end = ev.endsAt ? parseAppt(ev.endsAt) : new Date(start.getTime() + 3600000);
  const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl p-5 w-80 space-y-3"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-8 rounded-full flex-shrink-0" style={{ background: color }} />
          <div className="flex-1">
            <h3 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>{ev.clientName}</h3>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {fmtTime(start)}–{fmtTime(end)}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background: "var(--brand-bg)" }}>
            <i className="ti ti-x text-xs" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
        {ev.title && ev.title !== "Training Session" && (
          <p className="text-sm" style={{ color: "var(--brand-text)" }}>{ev.title}</p>
        )}
        <div className="flex gap-2">
          <Link href={`/clients/${ev.clientId}?tab=training`}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-center"
            style={{ background: `${color}20`, color }}>
            View Training
          </Link>
          <Link href={`/clients/${ev.clientId}`}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-center"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
            Profile
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function TrainerCalendar({ clients, appointmentMap, workoutMap }: Props) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Week anchor = Monday of current week
  function getMonday(d: Date) {
    const copy = new Date(d);
    const dow = copy.getDay();
    copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekAnchor, setWeekAnchor] = useState(() => getMonday(today));
  const [monthView, setMonthView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [popupEv, setPopupEv] = useState<AE | null>(null);
  const [addModal, setAddModal] = useState<{ date: Date; timeStr: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to 7am on mount
  useEffect(() => {
    if (scrollRef.current && viewMode !== "month") {
      scrollRef.current.scrollTop = (7 - DAY_START) * HOUR_PX;
    }
  }, [viewMode]);

  function getWeekDays(anchor: Date, weeks = 1): Date[] {
    const days: Date[] = [];
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(anchor);
        day.setDate(anchor.getDate() + w * 7 + d);
        days.push(day);
      }
    }
    return days;
  }

  function dayStr(d: Date) { return d.toISOString().split("T")[0]; }

  function getDayEvents(d: Date): AE[] {
    const all = appointmentMap[dayStr(d)] || [];
    return selectedClientId ? all.filter(e => e.clientId === selectedClientId) : all;
  }

  function getDayWorkouts(d: Date): WorkoutEv[] {
    const all = workoutMap[dayStr(d)] || [];
    return selectedClientId ? all.filter(e => e.clientId === selectedClientId) : all;
  }

  function navigate(dir: number) {
    if (viewMode === "month") {
      setMonthView(v => new Date(v.getFullYear(), v.getMonth() + dir, 1));
    } else {
      const weeks = viewMode === "2week" ? 2 : 1;
      setWeekAnchor(a => {
        const d = new Date(a);
        d.setDate(d.getDate() + dir * weeks * 7);
        return d;
      });
    }
  }

  function goToday() {
    setWeekAnchor(getMonday(today));
    setMonthView(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function handleMiniCalClick(d: Date) {
    setWeekAnchor(getMonday(d));
    setViewMode("week");
  }

  // Header label
  let headerLabel = "";
  if (viewMode === "month") {
    headerLabel = monthView.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else {
    const weeks = viewMode === "2week" ? 2 : 1;
    const days = getWeekDays(weekAnchor, weeks);
    const first = days[0], last = days[days.length - 1];
    const sameMonth = first.getMonth() === last.getMonth();
    headerLabel = sameMonth
      ? `${first.toLocaleDateString("en-US", { month: "long" })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`
      : `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  const displayWeeks = viewMode === "2week" ? 2 : 1;
  const weekDays = viewMode !== "month" ? getWeekDays(weekAnchor, displayWeeks) : [];

  // Time grid click → add session
  function handleTimeGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = DAY_START * 60 + Math.floor(y / HOUR_PX * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60 / 15) * 15;
    setAddModal({ date: day, timeStr: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}` });
  }

  // ---- WEEK/2WEEK VIEW ----
  function WeekView() {
    const colWidth = `${100 / (weekDays.length + (viewMode === "week" ? 0 : 0))}%`;

    return (
      <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
        {/* Day headers */}
        <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
          <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
          {weekDays.map(day => {
            const ds = dayStr(day);
            const isToday = ds === todayStr;
            const dow = DOW[day.getDay()];
            return (
              <div key={ds} className="flex-1 flex flex-col items-center py-2 border-l"
                style={{ borderColor: "var(--brand-border)" }}>
                <span className="text-[10px] font-semibold uppercase" style={{ color: isToday ? "#E53935" : "var(--brand-text-secondary)" }}>{dow}</span>
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5"
                  style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text)" }}>
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        {/* All-day workout chips row */}
        {weekDays.some(d => getDayWorkouts(d).length > 0) && (
          <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)", minHeight: 32 }}>
            <div style={{ width: TIME_COL_W, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 6 }}>
              <span className="text-[9px] font-semibold uppercase" style={{ color: "var(--brand-text-secondary)" }}>Schedule</span>
            </div>
            {weekDays.map(day => {
              const ws = getDayWorkouts(day);
              return (
                <div key={dayStr(day)} className="flex-1 flex flex-wrap gap-0.5 p-1 border-l overflow-hidden"
                  style={{ borderColor: "var(--brand-border)" }}>
                  {ws.map(w => {
                    const color = clientColor(clients, w.clientId);
                    const isDone = w.status === "completed";
                    return (
                      <a key={w.id} href={`/clients/${w.clientId}?tab=training`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-1.5 rounded text-[9px] font-semibold truncate max-w-full"
                        style={{ background: isDone ? `${color}30` : `${color}18`, color, border: `1px solid ${color}40`,
                          textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.7 : 1 }}>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        {w.clientName.split(" ")[0]}
                      </a>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Scrollable time grid */}
        <div ref={scrollRef} className="overflow-y-auto" style={{ flex: 1 }}>
          <div className="flex" style={{ minHeight: TOTAL_HOURS * HOUR_PX }}>
            {/* Time labels */}
            <div style={{ width: TIME_COL_W, flexShrink: 0, position: "relative" }}>
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                const h = DAY_START + i;
                if (h > DAY_END) return null;
                const label = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
                return (
                  <div key={h} style={{ position: "absolute", top: i * HOUR_PX - 8, right: 8 }}>
                    <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Day columns */}
            {weekDays.map(day => {
              const ds = dayStr(day);
              const isToday = ds === todayStr;
              const dayEvents = getDayEvents(day);
              const laid = layoutEvents(dayEvents);

              // Current time indicator
              const nowMin = today.getHours() * 60 + today.getMinutes();
              const nowTop = (nowMin - DAY_START * 60) / 60 * HOUR_PX;
              const showNow = isToday && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;

              return (
                <div key={ds} className="flex-1 relative border-l"
                  style={{ borderColor: "var(--brand-border)", background: isToday ? "rgba(229,57,53,0.02)" : "transparent" }}
                  onClick={e => handleTimeGridClick(day, e)}>
                  {/* Hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div key={i} style={{
                      position: "absolute", top: i * HOUR_PX, left: 0, right: 0, height: 1,
                      background: "var(--brand-border)", opacity: 0.5,
                    }} />
                  ))}
                  {/* Half-hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div key={`h${i}`} style={{
                      position: "absolute", top: i * HOUR_PX + HOUR_PX / 2, left: 0, right: 0, height: 1,
                      background: "var(--brand-border)", opacity: 0.25,
                    }} />
                  ))}
                  {/* Now indicator */}
                  {showNow && (
                    <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, zIndex: 3 }}>
                      <div style={{ height: 2, background: "#E53935" }} />
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E53935", position: "absolute", top: -4, left: -4 }} />
                    </div>
                  )}
                  {/* Events */}
                  {laid.map(ev => (
                    <EventBlock key={ev.id} ev={ev} clients={clients} onClick={e => { setPopupEv(e); }} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ---- MONTH VIEW ----
  function MonthView() {
    const year = monthView.getFullYear();
    const month = monthView.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="flex flex-col" style={{ flex: 1 }}>
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
          {DOW.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase py-2"
              style={{ color: "var(--brand-text-secondary)" }}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px flex-1" style={{ background: "var(--brand-border)" }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ background: "var(--brand-bg)", minHeight: 90 }} />;
            const ds = dayStr(day);
            const isToday = ds === todayStr;
            const evs = getDayEvents(day);
            return (
              <div key={ds} style={{ background: "var(--brand-surface)", minHeight: 90, padding: "4px 3px" }}
                onClick={() => { setWeekAnchor(getMonday(day)); setViewMode("week"); }}>
                <div className="flex justify-between items-center mb-1">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text-secondary)" }}>
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {/* Scheduled workout chips */}
                  {(getDayWorkouts(day)).slice(0, 2).map(w => {
                    const color = clientColor(clients, w.clientId);
                    const isDone = w.status === "completed";
                    return (
                      <a key={w.id} href={`/clients/${w.clientId}?tab=training`}
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1 px-1.5 rounded text-[9px] font-medium truncate"
                        style={{ background: isDone ? `${color}20` : `${color}15`, color, border: `1px solid ${color}35`,
                          textDecoration: isDone ? "line-through" : "none" }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                        {w.clientName.split(" ")[0]}
                      </a>
                    );
                  })}
                  {/* Appointment chips */}
                  {evs.slice(0, 2).map(ev => {
                    const color = clientColor(clients, ev.clientId);
                    return (
                      <div key={ev.id} onClick={e => { e.stopPropagation(); setPopupEv(ev); }}
                        className="px-1.5 rounded text-[9px] font-medium truncate"
                        style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>
                        ⏰ {ev.startTime}
                      </div>
                    );
                  })}
                  {(getDayWorkouts(day).length + evs.length) > 4 && <p className="text-[9px] text-center" style={{ color: "var(--brand-text-secondary)" }}>+{getDayWorkouts(day).length + evs.length - 4} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 120px)", minHeight: 500, overflow: "hidden" }}>
      {/* Left sidebar */}
      <div className="hidden lg:flex flex-col flex-shrink-0 border-r"
        style={{ width: 200, borderColor: "var(--brand-border)", background: "var(--brand-surface)", overflowY: "auto" }}>
        {/* Mini month */}
        <MiniMonthCal
          year={viewMode === "month" ? monthView.getFullYear() : weekAnchor.getFullYear()}
          month={viewMode === "month" ? monthView.getMonth() : weekAnchor.getMonth()}
          selectedDate={viewMode === "month" ? monthView : weekAnchor}
          onDateClick={handleMiniCalClick}
        />
        <div className="border-t mx-3 mb-3" style={{ borderColor: "var(--brand-border)" }} />
        {/* Client filter */}
        <div className="px-3 pb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--brand-text-secondary)" }}>Clients</p>
          <button onClick={() => setSelectedClientId(null)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg mb-1 text-xs font-medium"
            style={{ background: !selectedClientId ? "var(--brand-primary)20" : "transparent", color: !selectedClientId ? "var(--brand-primary)" : "var(--brand-text)" }}>
            <div className="w-3 h-3 rounded-full" style={{ background: "var(--brand-primary)" }} /> All clients
          </button>
          {clients.map((c, idx) => {
            const color = CLIENT_COLORS[idx % CLIENT_COLORS.length];
            const isActive = selectedClientId === c.id;
            return (
              <div key={c.id} className="flex items-center gap-1 w-full rounded-lg"
                style={{ background: isActive ? `${color}20` : "transparent" }}>
                <button onClick={() => setSelectedClientId(isActive ? null : c.id)}
                  className="flex items-center gap-2 flex-1 px-2 py-1 text-xs truncate"
                  style={{ color: isActive ? color : "var(--brand-text)", fontWeight: isActive ? 600 : 400 }}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color }} />
                  {c.name.split(" ")[0]}
                </button>
                <a href={`/clients/${c.id}?tab=training`}
                  className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 flex-shrink-0 mr-1"
                  title="View schedule"
                  style={{ color: "var(--brand-text-secondary)" }}>
                  <i className="ti ti-arrow-right text-[10px]" />
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main calendar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
          style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
          <button onClick={goToday}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)", background: "var(--brand-bg)" }}>
            Today
          </button>
          <button onClick={() => navigate(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <button onClick={() => navigate(1)} className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <span className="text-sm font-semibold flex-1 truncate" style={{ color: "var(--brand-text)" }}>{headerLabel}</span>

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
            {(["week","2week","month"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: viewMode === v ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: viewMode === v ? "white" : "var(--brand-text-secondary)",
                }}>
                {v === "week" ? "Week" : v === "2week" ? "2 Wk" : "Month"}
              </button>
            ))}
          </div>

          {/* Add */}
          <button onClick={() => setAddModal({ date: today, timeStr: "09:00" })}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--brand-primary)" }}>
            <i className="ti ti-plus text-sm text-white" />
          </button>
        </div>

        {/* Calendar body */}
        {viewMode === "month" ? <MonthView /> : <WeekView />}
      </div>

      {/* Popups */}
      {popupEv && <EventPopup ev={popupEv} clients={clients} onClose={() => setPopupEv(null)} />}
      {addModal && (
        <AddSessionModal
          date={addModal.date}
          timeStr={addModal.timeStr}
          clients={clients}
          onClose={() => setAddModal(null)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}
