"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ---- Types ----
type ViewMode = "week" | "month" | "day" | "agenda";

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
const HOUR_PX = 64;
const DAY_START = 5;
const DAY_END = 22;
const TOTAL_HOURS = DAY_END - DAY_START;
const TIME_COL_W = 52;
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DOW_FULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function clientColor(clients: Client[], clientId: string) {
  const idx = clients.findIndex(c => c.id === clientId);
  return CLIENT_COLORS[idx >= 0 ? idx % CLIENT_COLORS.length : 0];
}

function parseAppt(str: string): Date {
  return new Date(str.replace(" ", "T").replace("+00", "Z"));
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function dayStr(d: Date) { return d.toISOString().split("T")[0]; }

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

// ---- EventBlock (time grid) ----
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

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
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

// ---- MiniMonthCal ----
function MiniMonthCal({ year, month, selectedDate, onDateClick }: {
  year: number; month: number; selectedDate: Date; onDateClick: (d: Date) => void;
}) {
  const [m, setM] = useState({ year, month });
  const todayStr = new Date().toISOString().split("T")[0];
  const selStr = selectedDate.toISOString().split("T")[0];

  const firstDay = new Date(m.year, m.month, 1);
  const lastDay = new Date(m.year, m.month + 1, 0);
  const startDow = firstDay.getDay();
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

// ---- AddSessionModal (bottom sheet) ----
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
        {/* Drag handle */}
        <div className="flex justify-center -mt-2 mb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--brand-border)" }} />
        </div>
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

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>Client</label>
          <select value={clientId} onChange={e => setClientId(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {([["Start", startTime, setStartTime], ["End", endTime, setEndTime]] as const).map(([label, val, setter]) => (
            <div key={label}>
              <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>{label}</label>
              <input type="time" value={val} onChange={e => setter(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--brand-text-secondary)" }}>Title (optional)</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
        </div>

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

// ---- Session Detail Popup ----
function SessionDetailPopup({ ev, clients, onClose, onSaved }: {
  ev: AE; clients: Client[]; onClose: () => void; onSaved: () => void;
}) {
  const color = clientColor(clients, ev.clientId);
  const start = parseAppt(ev.scheduledAt);
  const end = ev.endsAt ? parseAppt(ev.endsAt) : new Date(start.getTime() + 3600000);
  const todayStr = new Date().toISOString().split("T")[0];
  const evDateStr = start.toISOString().split("T")[0];
  const isToday = evDateStr === todayStr;
  const [updating, setUpdating] = useState(false);

  async function updateStatus(status: string) {
    setUpdating(true);
    const supabase = createClient();
    await supabase.from("appointments").update({ status }).eq("id", ev.id);
    setUpdating(false);
    onSaved();
    onClose();
  }

  const statusColors: Record<string, string> = {
    scheduled: "#FB8C00",
    completed: "#43A047",
    cancelled: "#E53935",
    skipped: "#9E9E9E",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
        {/* Color bar header */}
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: `3px solid ${color}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                style={{ background: color }}>
                {ev.clientName.charAt(0)}
              </div>
              <div>
                <h3 className="text-base font-bold leading-tight" style={{ color: "var(--brand-text)" }}>{ev.clientName}</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  {start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
              style={{ background: "var(--brand-bg)" }}>
              <i className="ti ti-x text-xs" style={{ color: "var(--brand-text-secondary)" }} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Time */}
          <div className="flex items-center gap-2.5">
            <i className="ti ti-clock text-base" style={{ color: "var(--brand-text-secondary)" }} />
            <span className="text-sm" style={{ color: "var(--brand-text)" }}>
              {fmtTime(start)} – {fmtTime(end)}
            </span>
          </div>

          {/* Title */}
          {ev.title && (
            <div className="flex items-center gap-2.5">
              <i className="ti ti-barbell text-base" style={{ color: "var(--brand-text-secondary)" }} />
              <span className="text-sm" style={{ color: "var(--brand-text)" }}>{ev.title}</span>
            </div>
          )}

          {/* Status badge */}
          <div className="flex items-center gap-2.5">
            <i className="ti ti-circle-check text-base" style={{ color: "var(--brand-text-secondary)" }} />
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
              style={{
                background: `${statusColors[ev.status] || "#9E9E9E"}20`,
                color: statusColors[ev.status] || "#9E9E9E"
              }}>
              {ev.status}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 space-y-2">
          {isToday && ev.status === "scheduled" && (
            <Link href={`/clients/${ev.clientId}?tab=training`}
              className="w-full py-2.5 rounded-xl font-bold text-sm text-center flex items-center justify-center gap-2"
              style={{ background: "#E53935", color: "white" }}>
              <i className="ti ti-player-play text-sm" />
              Start Session
            </Link>
          )}
          <div className="grid grid-cols-2 gap-2">
            {ev.status !== "completed" && (
              <button onClick={() => updateStatus("completed")} disabled={updating}
                className="py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "#43A04720", color: "#43A047", border: "1px solid #43A04740" }}>
                <i className="ti ti-check text-xs" /> Complete
              </button>
            )}
            {ev.status !== "cancelled" && (
              <button onClick={() => updateStatus("cancelled")} disabled={updating}
                className="py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                style={{ background: "#E5393520", color: "#E53935", border: "1px solid #E5393540" }}>
                <i className="ti ti-x text-xs" /> Cancel
              </button>
            )}
            <Link href={`/clients/${ev.clientId}`}
              className="py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-user text-xs" /> Profile
            </Link>
            <Link href={`/clients/${ev.clientId}?tab=training`}
              className="py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
              <i className="ti ti-calendar text-xs" /> Training
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Day Detail Drawer (bottom sheet) ----
function DayDetailDrawer({ date, appointments, workouts, clients, onClose, onAddSession, onEventClick }: {
  date: Date;
  appointments: AE[];
  workouts: WorkoutEv[];
  clients: Client[];
  onClose: () => void;
  onAddSession: (date: Date) => void;
  onEventClick: (ev: AE) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [startY, setStartY] = useState(0);
  const [dragDelta, setDragDelta] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function close() {
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleTouchStart(e: React.TouchEvent) {
    setStartY(e.touches[0].clientY);
    setDragDelta(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) setDragDelta(delta);
  }

  function handleTouchEnd() {
    if (dragDelta > 80) {
      close();
    } else {
      setDragDelta(0);
    }
  }

  const sorted = [...appointments].sort((a, b) =>
    parseAppt(a.scheduledAt).getTime() - parseAppt(b.scheduledAt).getTime()
  );

  const dateLabel = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const isToday = dayStr(date) === dayStr(new Date());

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)", opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
        onClick={close}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-50 rounded-t-2xl overflow-hidden"
        style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderBottom: "none",
          transform: visible ? `translateY(${dragDelta}px)` : "translateY(100%)",
          transition: dragDelta > 0 ? "none" : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--brand-border)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--brand-border)" }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--brand-text)" }}>
              {isToday && <span className="text-sm font-semibold mr-2 px-2 py-0.5 rounded-full" style={{ background: "#E53935", color: "white" }}>Today</span>}
              {dateLabel}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              {sorted.length} session{sorted.length !== 1 ? "s" : ""}{workouts.length > 0 ? ` · ${workouts.length} scheduled workout${workouts.length !== 1 ? "s" : ""}` : ""}
            </p>
          </div>
          <button onClick={close}
            className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--brand-bg)" }}>
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {/* Scheduled workouts */}
          {workouts.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                Scheduled Workouts
              </p>
              <div className="space-y-1.5">
                {workouts.map(w => {
                  const color = clientColor(clients, w.clientId);
                  const isDone = w.status === "completed";
                  return (
                    <a key={w.id} href={`/clients/${w.clientId}?tab=training`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                      style={{ background: "var(--brand-bg)", border: `1px solid ${color}30` }}>
                      <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate"
                          style={{ color, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? 0.7 : 1 }}>
                          {w.clientName}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>
                          {w.dayLabel} · {isDone ? "Completed" : "Pending"}
                        </p>
                      </div>
                      {isDone && <i className="ti ti-check text-sm flex-shrink-0" style={{ color: "#43A047" }} />}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sessions */}
          {sorted.length > 0 ? (
            <div>
              {workouts.length > 0 && (
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Training Sessions
                </p>
              )}
              <div className="space-y-1.5">
                {sorted.map(ev => {
                  const color = clientColor(clients, ev.clientId);
                  const start = parseAppt(ev.scheduledAt);
                  const end = ev.endsAt ? parseAppt(ev.endsAt) : new Date(start.getTime() + 3600000);
                  const isCancelled = ev.status === "cancelled";
                  return (
                    <button key={ev.id}
                      onClick={() => { close(); setTimeout(() => onEventClick(ev), 100); }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                      style={{ background: "var(--brand-bg)", border: `1px solid ${color}30` }}>
                      <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ background: isCancelled ? "#9E9E9E" : color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate"
                          style={{ color: isCancelled ? "var(--brand-text-secondary)" : "var(--brand-text)",
                            textDecoration: isCancelled ? "line-through" : "none" }}>
                          {ev.clientName}
                        </p>
                        <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                          {fmtTime(start)} – {fmtTime(end)}
                          {ev.title && ev.title !== "Training Session" ? ` · ${ev.title}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize"
                          style={{
                            background: ev.status === "completed" ? "#43A04720" : ev.status === "cancelled" ? "#9E9E9E20" : "#FB8C0020",
                            color: ev.status === "completed" ? "#43A047" : ev.status === "cancelled" ? "#9E9E9E" : "#FB8C00"
                          }}>
                          {ev.status}
                        </span>
                        <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : workouts.length === 0 ? (
            <div className="py-8 text-center">
              <i className="ti ti-calendar-off text-3xl mb-2" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No sessions scheduled</p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: "1px solid var(--brand-border)" }}>
          <button onClick={() => { close(); setTimeout(() => onAddSession(date), 200); }}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: "var(--brand-primary)", color: "white" }}>
            <i className="ti ti-plus text-sm" />
            Add Session
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Time Grid (shared between Week and Day views) ----
function TimeGrid({
  days, clients, getDayEvents, getDayWorkouts, today, todayStr,
  onEventClick, onTimeClick, onDayHeaderClick, scrollRef
}: {
  days: Date[];
  clients: Client[];
  getDayEvents: (d: Date) => AE[];
  getDayWorkouts: (d: Date) => WorkoutEv[];
  today: Date;
  todayStr: string;
  onEventClick: (ev: AE) => void;
  onTimeClick: (day: Date, e: React.MouseEvent<HTMLDivElement>) => void;
  onDayHeaderClick: (day: Date) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  function handleTimeGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    onTimeClick(day, e);
  }

  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
      {/* Day headers */}
      <div className="flex flex-shrink-0 border-b" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
        <div style={{ width: TIME_COL_W, flexShrink: 0 }} />
        {days.map(day => {
          const ds = dayStr(day);
          const isToday = ds === todayStr;
          const dow = DOW[day.getDay()];
          return (
            <div key={ds} className="flex-1 flex flex-col items-center py-2 border-l cursor-pointer active:opacity-70"
              style={{ borderColor: "var(--brand-border)" }}
              onClick={() => onDayHeaderClick(day)}>
              <span className="text-[10px] font-semibold uppercase"
                style={{ color: isToday ? "#E53935" : "var(--brand-text-secondary)" }}>{dow}</span>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5"
                style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text)" }}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>



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
          {days.map(day => {
            const ds = dayStr(day);
            const isToday = ds === todayStr;
            const dayEvents = getDayEvents(day);
            const laid = layoutEvents(dayEvents);

            const nowMin = today.getHours() * 60 + today.getMinutes();
            const nowTop = (nowMin - DAY_START * 60) / 60 * HOUR_PX;
            const showNow = isToday && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;

            return (
              <div key={ds} className="flex-1 relative border-l"
                style={{ borderColor: "var(--brand-border)", background: isToday ? "rgba(229,57,53,0.02)" : "transparent" }}
                onClick={e => handleTimeGridClick(day, e)}>
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div key={i} style={{
                    position: "absolute", top: i * HOUR_PX, left: 0, right: 0, height: 1,
                    background: "var(--brand-border)", opacity: 0.5,
                  }} />
                ))}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div key={`h${i}`} style={{
                    position: "absolute", top: i * HOUR_PX + HOUR_PX / 2, left: 0, right: 0, height: 1,
                    background: "var(--brand-border)", opacity: 0.25,
                  }} />
                ))}
                {showNow && (
                  <div style={{ position: "absolute", top: nowTop, left: 0, right: 0, zIndex: 3 }}>
                    <div style={{ height: 2, background: "#E53935" }} />
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#E53935", position: "absolute", top: -4, left: -4 }} />
                  </div>
                )}
                {laid.map(ev => (
                  <EventBlock key={ev.id} ev={ev} clients={clients} onClick={onEventClick} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}


// ---- ClientWorkoutWeekView — per-client programmed workout calendar ----
function ClientWorkoutWeekView({ days, todayStr, workouts, loading, clientId, clientName }: {
  days: Date[];
  todayStr: string;
  workouts: Array<{ id: string; date: string; status: string; dayLabel: string; phaseLabel: string; programName: string; dayId: string | null }>;
  loading: boolean;
  clientId: string;
  clientName: string;
}) {
  const workoutByDate = useMemo(() => {
    const map: Record<string, typeof workouts[0]> = {};
    for (const w of workouts) map[w.date] = w;
    return map;
  }, [workouts]);

  const STATUS_COLOR: Record<string, string> = {
    completed: "#43A047",
    scheduled: "var(--brand-primary)",
    skipped: "#9E9E9E",
    cancelled: "#E53935",
  };

  return (
    <div className="flex flex-col" style={{ flex: 1, overflow: "hidden" }}>
      {/* Column headers */}
      <div className="flex flex-shrink-0 border-b"
        style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
        {days.map(day => {
          const ds = dayStr(day);
          const isToday = ds === todayStr;
          return (
            <div key={ds} className="flex-1 flex flex-col items-center py-2 border-l"
              style={{ borderColor: "var(--brand-border)" }}>
              <span className="text-[10px] font-semibold uppercase"
                style={{ color: isToday ? "#E53935" : "var(--brand-text-secondary)" }}>
                {DOW[day.getDay()]}
              </span>
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold mt-0.5"
                style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text)" }}>
                {day.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Week content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--brand-border)", borderTopColor: "var(--brand-primary)" }} />
          </div>
        ) : (
          <div className="flex h-full min-h-[320px]">
            {days.map(day => {
              const ds = dayStr(day);
              const isToday = ds === todayStr;
              const workout = workoutByDate[ds];
              const statusColor = workout ? (STATUS_COLOR[workout.status] || "var(--brand-primary)") : "var(--brand-border)";
              const isDone = workout?.status === "completed";

              return (
                <div key={ds} className="flex-1 border-l p-1.5 flex flex-col gap-1.5"
                  style={{
                    borderColor: "var(--brand-border)",
                    background: isToday ? "rgba(229,57,53,0.02)" : "transparent",
                    minWidth: 0,
                  }}>
                  {workout ? (
                    <a
                      href={workout.dayId
                        ? `/clients/${clientId}/day/${workout.dayId}`
                        : `/clients/${clientId}?tab=training`}
                      className="flex flex-col gap-1 rounded-xl p-2 cursor-pointer hover:opacity-90 transition-opacity"
                      style={{
                        background: isDone ? `${statusColor}15` : `${statusColor}12`,
                        border: `1.5px solid ${statusColor}40`,
                        textDecoration: "none",
                      }}>
                      {/* Status dot + label */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: statusColor }} />
                        <span className="text-[9px] font-semibold uppercase tracking-wide truncate"
                          style={{ color: statusColor }}>
                          {isDone ? "Done" : workout.status}
                        </span>
                      </div>
                      {/* Day label */}
                      <p className="text-xs font-semibold leading-tight"
                        style={{
                          color: "var(--brand-text)",
                          textDecoration: isDone ? "line-through" : "none",
                          opacity: isDone ? 0.7 : 1,
                        }}>
                        {workout.dayLabel}
                      </p>
                      {/* Phase / program */}
                      {(workout.phaseLabel || workout.programName) && (
                        <p className="text-[9px] leading-tight truncate"
                          style={{ color: "var(--brand-text-secondary)" }}>
                          {workout.phaseLabel || workout.programName}
                        </p>
                      )}
                      {/* Edit icon */}
                      <div className="flex justify-end mt-auto pt-1">
                        <i className="ti ti-pencil text-[10px]" style={{ color: "var(--brand-text-secondary)" }} />
                      </div>
                    </a>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 gap-1 rounded-xl"
                      style={{ border: "1px dashed var(--brand-border)" }}>
                      <span className="text-[9px]" style={{ color: "var(--brand-text-secondary)" }}>Rest</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer: link to profile */}
      <div className="flex-shrink-0 px-4 py-3 border-t flex items-center justify-between"
        style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
        <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>
          {clientName} · Programmed workouts
        </span>
        <a href={`/clients/${clientId}?tab=training`}
          className="text-xs font-semibold flex items-center gap-1"
          style={{ color: "var(--brand-primary)" }}>
          Full calendar <i className="ti ti-arrow-right text-[10px]" />
        </a>
      </div>
    </div>
  );
}

// ---- Main Component ----
export default function TrainerCalendar({ clients, appointmentMap, workoutMap }: Props) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  function getMonday(d: Date) {
    const copy = new Date(d);
    const dow = copy.getDay();
    copy.setDate(copy.getDate() - (dow === 0 ? 6 : dow - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekAnchor, setWeekAnchor] = useState(() => getMonday(today));
  const [dayAnchor, setDayAnchor] = useState(() => {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [monthView, setMonthView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [popupEv, setPopupEv] = useState<AE | null>(null);
  const [addModal, setAddModal] = useState<{ date: Date; timeStr: string } | null>(null);
  const [dayDrawer, setDayDrawer] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Per-client workout calendar (fetched client-side when a client is selected) ──
  const [clientWorkouts, setClientWorkouts] = useState<Array<{
    id: string; date: string; status: string;
    dayLabel: string; phaseLabel: string; programName: string; dayId: string | null;
  }>>([]);
  const [loadingClientWorkouts, setLoadingClientWorkouts] = useState(false);

  useEffect(() => {
    if (!selectedClientId) { setClientWorkouts([]); return; }
    setLoadingClientWorkouts(true);
    const supabase = createClient();
    // Fetch 4 weeks centered on current week anchor so nav is snappy
    const rangeStart = new Date(weekAnchor);
    rangeStart.setDate(rangeStart.getDate() - 14);
    const rangeEnd = new Date(weekAnchor);
    rangeEnd.setDate(rangeEnd.getDate() + 21);
    supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, day_id, days(id, label, phases(label, programs(name)))")
      .eq("client_id", selectedClientId)
      .gte("scheduled_date", dayStr(rangeStart))
      .lte("scheduled_date", dayStr(rangeEnd))
      .order("scheduled_date")
      .then(({ data }) => {
        setClientWorkouts((data || []).map((w: any) => ({
          id: w.id,
          date: w.scheduled_date,
          status: w.status || "scheduled",
          dayLabel: w.days?.label || "Workout",
          phaseLabel: w.days?.phases?.label || "",
          programName: w.days?.phases?.programs?.name || "",
          dayId: w.days?.id || w.day_id || null,
        })));
        setLoadingClientWorkouts(false);
      });
  }, [selectedClientId, weekAnchor]);

  useEffect(() => {
    if (scrollRef.current && (viewMode === "week" || viewMode === "day")) {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      // Scroll to ~1 hour before current time so the red line is visible
      const targetTop = Math.max(0, (nowMin - DAY_START * 60 - 60) / 60 * HOUR_PX);
      scrollRef.current.scrollTop = targetTop;
    }
  }, [viewMode]);

  function getWeekDays(anchor: Date): Date[] {
    const days: Date[] = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(anchor);
      day.setDate(anchor.getDate() + d);
      days.push(day);
    }
    return days;
  }

  const getDayEvents = useCallback((d: Date): AE[] => {
    const all = appointmentMap[dayStr(d)] || [];
    return selectedClientId ? all.filter(e => e.clientId === selectedClientId) : all;
  }, [appointmentMap, selectedClientId]);

  const getDayWorkouts = useCallback((d: Date): WorkoutEv[] => {
    const all = workoutMap[dayStr(d)] || [];
    return selectedClientId ? all.filter(e => e.clientId === selectedClientId) : all;
  }, [workoutMap, selectedClientId]);

  function navigate(dir: number) {
    if (viewMode === "month") {
      setMonthView(v => new Date(v.getFullYear(), v.getMonth() + dir, 1));
    } else if (viewMode === "week") {
      setWeekAnchor(a => {
        const d = new Date(a);
        d.setDate(d.getDate() + dir * 7);
        return d;
      });
    } else if (viewMode === "day") {
      setDayAnchor(a => {
        const d = new Date(a);
        d.setDate(d.getDate() + dir);
        return d;
      });
    } else if (viewMode === "agenda") {
      setMonthView(v => new Date(v.getFullYear(), v.getMonth() + dir, 1));
    }
  }

  function goToday() {
    setWeekAnchor(getMonday(today));
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    setDayAnchor(d);
    setMonthView(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function handleMiniCalClick(d: Date) {
    setWeekAnchor(getMonday(d));
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    setDayAnchor(copy);
    setViewMode("week");
  }

  function handleTimeGridClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMinutes = DAY_START * 60 + Math.floor(y / HOUR_PX * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60 / 15) * 15;
    setAddModal({ date: day, timeStr: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}` });
  }

  // Header label
  let headerLabel = "";
  if (viewMode === "month" || viewMode === "agenda") {
    headerLabel = monthView.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else if (viewMode === "week") {
    const days = getWeekDays(weekAnchor);
    const first = days[0], last = days[days.length - 1];
    const sameMonth = first.getMonth() === last.getMonth();
    headerLabel = sameMonth
      ? `${first.toLocaleDateString("en-US", { month: "long" })} ${first.getDate()}–${last.getDate()}, ${first.getFullYear()}`
      : `${first.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${last.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } else if (viewMode === "day") {
    headerLabel = dayAnchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }

  const weekDays = viewMode === "week" ? getWeekDays(weekAnchor) : [];

  // ---- MONTH VIEW ----
  function MonthView() {
    const year = monthView.getFullYear();
    const month = monthView.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
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
            const wks = getDayWorkouts(day);
            const totalItems = evs.length + wks.length;
            const maxShow = 3;
            const overflow = totalItems > maxShow ? totalItems - maxShow : 0;

            return (
              <div key={ds}
                style={{ background: "var(--brand-surface)", minHeight: 90, padding: "4px 3px", cursor: "pointer" }}
                onClick={() => setDayDrawer(day)}>
                <div className="flex justify-between items-center mb-1">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                    style={{
                      background: isToday ? "#E53935" : "transparent",
                      color: isToday ? "white" : day.getMonth() !== month ? "var(--brand-text-secondary)" : "var(--brand-text)"
                    }}>
                    {day.getDate()}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {/* Workout chips */}
                  {wks.slice(0, Math.min(wks.length, maxShow)).map(w => {
                    const color = clientColor(clients, w.clientId);
                    const isDone = w.status === "completed";
                    return (
                      <div key={w.id}
                        className="flex items-center gap-1 px-1.5 rounded text-[9px] font-medium truncate"
                        style={{ background: isDone ? `${color}20` : `${color}15`, color, border: `1px solid ${color}35`,
                          textDecoration: isDone ? "line-through" : "none" }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                        {w.clientName.split(" ")[0]}
                      </div>
                    );
                  })}
                  {/* Session chips */}
                  {evs.slice(0, Math.max(0, maxShow - wks.length)).map(ev => {
                    const color = clientColor(clients, ev.clientId);
                    return (
                      <div key={ev.id}
                        className="px-1.5 rounded text-[9px] font-medium truncate flex items-center gap-1"
                        style={{ background: `${color}25`, color, border: `1px solid ${color}50` }}>
                        <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                        {ev.clientName.split(" ")[0]} {ev.startTime}
                      </div>
                    );
                  })}
                  {overflow > 0 && (
                    <p className="text-[9px] font-medium text-center" style={{ color: "var(--brand-text-secondary)" }}>
                      +{overflow} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- AGENDA VIEW ----
  function AgendaView() {
    const year = monthView.getFullYear();
    const month = monthView.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const agendaDays: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      agendaDays.push(new Date(year, month, d));
    }

    // Only show days with events
    const daysWithEvents = agendaDays.filter(d => getDayEvents(d).length > 0 || getDayWorkouts(d).length > 0);

    if (daysWithEvents.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16" style={{ flex: 1 }}>
          <i className="ti ti-calendar-off text-4xl mb-3" style={{ color: "var(--brand-text-secondary)" }} />
          <p className="text-base font-medium" style={{ color: "var(--brand-text-secondary)" }}>No events this month</p>
        </div>
      );
    }

    return (
      <div className="overflow-y-auto" style={{ flex: 1 }}>
        {daysWithEvents.map(day => {
          const ds = dayStr(day);
          const isToday = ds === todayStr;
          const evs = getDayEvents(day).sort((a, b) =>
            parseAppt(a.scheduledAt).getTime() - parseAppt(b.scheduledAt).getTime()
          );
          const wks = getDayWorkouts(day);

          return (
            <div key={ds} className="border-b" style={{ borderColor: "var(--brand-border)" }}>
              {/* Date header */}
              <div className="flex items-center gap-3 px-4 py-2 sticky top-0 z-10"
                style={{ background: "var(--brand-surface)", borderBottom: `1px solid var(--brand-border)` }}>
                <div className="flex flex-col items-center w-10">
                  <span className="text-[10px] font-semibold uppercase" style={{ color: isToday ? "#E53935" : "var(--brand-text-secondary)" }}>
                    {DOW[day.getDay()].slice(0, 3)}
                  </span>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: isToday ? "#E53935" : "transparent", color: isToday ? "white" : "var(--brand-text)" }}>
                    {day.getDate()}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  {isToday && <span className="text-xs font-semibold" style={{ color: "#E53935" }}>Today</span>}
                </div>
              </div>
              {/* Events */}
              <div className="px-4 py-2 space-y-2">
                {wks.map(w => {
                  const color = clientColor(clients, w.clientId);
                  const isDone = w.status === "completed";
                  return (
                    <a key={w.id} href={`/clients/${w.clientId}?tab=training`}
                      className="flex items-center gap-3 rounded-xl px-3 py-2"
                      style={{ background: "var(--brand-bg)", borderLeft: `3px solid ${color}` }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                          style={{ color: "var(--brand-text-secondary)" }}>Workout</p>
                        <p className="text-sm font-medium truncate"
                          style={{ color, textDecoration: isDone ? "line-through" : "none" }}>
                          {w.clientName} · {w.dayLabel}
                        </p>
                      </div>
                      {isDone && <i className="ti ti-check text-sm" style={{ color: "#43A047" }} />}
                    </a>
                  );
                })}
                {evs.map(ev => {
                  const color = clientColor(clients, ev.clientId);
                  const start = parseAppt(ev.scheduledAt);
                  const end = ev.endsAt ? parseAppt(ev.endsAt) : new Date(start.getTime() + 3600000);
                  const isCancelled = ev.status === "cancelled";
                  return (
                    <button key={ev.id}
                      onClick={() => setPopupEv(ev)}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left"
                      style={{ background: "var(--brand-bg)", borderLeft: `3px solid ${isCancelled ? "#9E9E9E" : color}` }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                          {fmtTime(start)} – {fmtTime(end)}
                        </p>
                        <p className="text-sm font-medium truncate"
                          style={{ color: isCancelled ? "var(--brand-text-secondary)" : "var(--brand-text)",
                            textDecoration: isCancelled ? "line-through" : "none" }}>
                          {ev.clientName}
                          {ev.title && ev.title !== "Training Session" ? ` · ${ev.title}` : ""}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize flex-shrink-0"
                        style={{
                          background: ev.status === "completed" ? "#43A04720" : ev.status === "cancelled" ? "#9E9E9E20" : "#FB8C0020",
                          color: ev.status === "completed" ? "#43A047" : ev.status === "cancelled" ? "#9E9E9E" : "#FB8C00"
                        }}>
                        {ev.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const VIEW_LABELS: Record<ViewMode, string> = {
    month: "Month", week: "Week", day: "Day", agenda: "Agenda"
  };

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 120px)", minHeight: 500, overflow: "hidden" }}>
      {/* Left sidebar (desktop) */}
      <div className="hidden lg:flex flex-col flex-shrink-0 border-r"
        style={{ width: 200, borderColor: "var(--brand-border)", background: "var(--brand-surface)", overflowY: "auto" }}>
        <MiniMonthCal
          year={viewMode === "month" || viewMode === "agenda" ? monthView.getFullYear() : viewMode === "day" ? dayAnchor.getFullYear() : weekAnchor.getFullYear()}
          month={viewMode === "month" || viewMode === "agenda" ? monthView.getMonth() : viewMode === "day" ? dayAnchor.getMonth() : weekAnchor.getMonth()}
          selectedDate={viewMode === "month" || viewMode === "agenda" ? monthView : viewMode === "day" ? dayAnchor : weekAnchor}
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
                  className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 mr-1"
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
            {(["month","week","day","agenda"] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className="px-2.5 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: viewMode === v ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: viewMode === v ? "white" : "var(--brand-text-secondary)",
                }}>
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar body */}
        {viewMode === "month" && <MonthView />}
        {viewMode === "week" && !selectedClientId && (
          <TimeGrid
            days={weekDays}
            clients={clients}
            getDayEvents={getDayEvents}
            getDayWorkouts={getDayWorkouts}
            today={today}
            todayStr={todayStr}
            onEventClick={setPopupEv}
            onTimeClick={handleTimeGridClick}
            onDayHeaderClick={(day) => setDayDrawer(day)}
            scrollRef={scrollRef}
          />
        )}
        {viewMode === "week" && selectedClientId && (
          <ClientWorkoutWeekView
            days={weekDays}
            todayStr={todayStr}
            workouts={clientWorkouts}
            loading={loadingClientWorkouts}
            clientId={selectedClientId}
            clientName={clients.find(c => c.id === selectedClientId)?.name || ""}
          />
        )}
        {viewMode === "day" && (
          <TimeGrid
            days={[dayAnchor]}
            clients={clients}
            getDayEvents={getDayEvents}
            getDayWorkouts={getDayWorkouts}
            today={today}
            todayStr={todayStr}
            onEventClick={setPopupEv}
            onTimeClick={handleTimeGridClick}
            onDayHeaderClick={(day) => setDayDrawer(day)}
            scrollRef={scrollRef}
          />
        )}
        {viewMode === "agenda" && <AgendaView />}
      </div>

      {/* Google Calendar-style FAB */}
      <button
        onClick={() => setAddModal({ date: today, timeStr: "09:00" })}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{ background: "#E53935", boxShadow: "0 4px 16px rgba(229,57,53,0.4)" }}
        title="Add session"
      >
        <i className="ti ti-plus text-xl text-white" />
      </button>

      {/* Day Detail Drawer */}
      {dayDrawer && (
        <DayDetailDrawer
          date={dayDrawer}
          appointments={getDayEvents(dayDrawer)}
          workouts={getDayWorkouts(dayDrawer)}
          clients={clients}
          onClose={() => setDayDrawer(null)}
          onAddSession={(date) => setAddModal({ date, timeStr: "09:00" })}
          onEventClick={setPopupEv}
        />
      )}

      {/* Session Detail Popup */}
      {popupEv && (
        <SessionDetailPopup
          ev={popupEv}
          clients={clients}
          onClose={() => setPopupEv(null)}
          onSaved={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* Add Session Modal */}
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
