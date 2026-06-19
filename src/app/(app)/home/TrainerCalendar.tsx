"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface AppointmentEntry {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface Props {
  clients: { id: string; name: string }[];
  appointmentMap: Record<string, AppointmentEntry[]>;
  startDate: string;
}

// ─── Color palette (vibrant, per client) ────────────────────────────────────
const CLIENT_COLORS = [
  "#1E88E5", "#43A047", "#8E24AA", "#FB8C00",
  "#00ACC1", "#E91E63", "#7CB342", "#3949AB",
  "#00897B", "#F4511E", "#6D4C41", "#039BE5",
];

function clientColor(clients: { id: string }[], clientId: string) {
  const idx = clients.findIndex((c) => c.id === clientId);
  return CLIENT_COLORS[idx % CLIENT_COLORS.length];
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
}

function fmt12(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Status styles ───────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  scheduled: { bg: "rgba(14,165,233,0.12)", color: "#0EA5E9", border: "rgba(14,165,233,0.3)", label: "Scheduled" },
  completed: { bg: "#D1FAE5", color: "#065F46", border: "#A7F3D0", label: "Done" },
  cancelled: { bg: "rgba(239,68,68,0.1)", color: "#ef4444", border: "rgba(239,68,68,0.3)", label: "Cancelled" },
  no_show:   { bg: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "rgba(245,158,11,0.3)", label: "No-show" },
};

// ─── Day Detail Drawer ───────────────────────────────────────────────────────
function DayDrawer({
  date, entries, clients, onClose, onStatusChange,
}: {
  date: string;
  entries: AppointmentEntry[];
  clients: { id: string; name: string }[];
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}) {
  const supabase = createClient();
  const [updating, setUpdating] = useState<string | null>(null);

  const d = new Date(date + "T00:00:00");
  const dayNum = d.getDate();
  const dow = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthLabel = d.toLocaleDateString("en-US", { month: "long" });
  const isToday = date === todayStr();
  const sorted = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    await supabase.from("appointments").update({ status }).eq("id", id);
    onStatusChange(id, status);
    setUpdating(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.45)" }} />
      <div
        className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-t-2xl overflow-hidden"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        onClick={(e) => e.stopPropagation()}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--brand-border)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--brand-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: isToday ? "#E53935" : "var(--brand-card)", color: isToday ? "white" : "var(--brand-text)" }}>
              {dayNum}
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: "var(--brand-text)" }}>{dow}</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{monthLabel} {dayNum}</p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sorted.length === 0 && (
            <div className="text-center py-10">
              <i className="ti ti-calendar-off text-3xl block mb-2" style={{ color: "var(--brand-border)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No sessions scheduled</p>
            </div>
          )}
          {sorted.map((entry) => {
            const color = clientColor(clients, entry.clientId);
            const s = STATUS_STYLE[entry.status] || STATUS_STYLE.scheduled;
            const busy = updating === entry.id;
            return (
              <div key={entry.id} className="rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--brand-border)" }}>
                {/* Color bar + content */}
                <div className="flex">
                  <div className="w-1 flex-shrink-0" style={{ background: color }} />
                  <div className="flex-1 p-3">
                    <div className="flex items-start gap-3">
                      <div className="text-right w-16 flex-shrink-0 pt-0.5">
                        <p className="text-xs font-semibold" style={{ color: "var(--brand-text)" }}>{fmt12(entry.startTime)}</p>
                        <p className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{fmt12(entry.endTime)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                            style={{ background: color }}>
                            {getInitials(entry.clientName)}
                          </span>
                          <Link href={`/clients/${entry.clientId}`}
                            className="text-sm font-semibold hover:underline truncate"
                            style={{ color: "var(--brand-text)" }} onClick={onClose}>
                            {entry.clientName}
                          </Link>
                        </div>
                        <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                          {entry.title || "Training Session"}
                        </p>
                        <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                      </div>
                    </div>
                    {/* Action buttons */}
                    {entry.status !== "completed" && entry.status !== "cancelled" && (
                      <div className="flex gap-2 mt-2 pt-2 border-t" style={{ borderColor: "var(--brand-border)" }}>
                        <button onClick={() => updateStatus(entry.id, "completed")} disabled={busy}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "#22c55e20", color: "#22c55e", opacity: busy ? 0.5 : 1 }}>
                          {busy ? "…" : "✓ Done"}
                        </button>
                        <button onClick={() => updateStatus(entry.id, "no_show")} disabled={busy}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b", opacity: busy ? 0.5 : 1 }}>
                          No-show
                        </button>
                        <button onClick={() => updateStatus(entry.id, "cancelled")} disabled={busy}
                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", opacity: busy ? 0.5 : 1 }}>
                          Cancel
                        </button>
                      </div>
                    )}
                    {(entry.status === "completed" || entry.status === "cancelled" || entry.status === "no_show") && (
                      <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--brand-border)" }}>
                        <button onClick={() => updateStatus(entry.id, "scheduled")} disabled={busy}
                          className="text-xs px-3 py-1 rounded-lg font-medium"
                          style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)", opacity: busy ? 0.5 : 1 }}>
                          ↩ Undo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div className="px-4 pb-5 pt-2 border-t" style={{ borderColor: "var(--brand-border)" }}>
          <button className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
            style={{ background: "#E53935", color: "white" }}>
            <i className="ti ti-plus text-base" />
            Add on {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Calendar ───────────────────────────────────────────────────────────
const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TrainerCalendar({ clients, appointmentMap }: Props) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [filterClient, setFilterClient] = useState<string | null>(null); // null = all
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [localMap, setLocalMap] = useState(appointmentMap);

  const today = todayStr();

  // Build month grid
  const cells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const startDow = firstDay.getDay(); // 0=Sun
    const grid: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) grid.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const mm = String(viewMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      grid.push(`${viewYear}-${mm}-${dd}`);
    }
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
  }

  function handleStatusChange(id: string, status: string) {
    setLocalMap(prev => {
      const next = { ...prev };
      for (const date of Object.keys(next)) {
        next[date] = next[date].map(e => e.id === id ? { ...e, status } : e);
      }
      return next;
    });
  }

  // Unique clients that have at least one appointment
  const activeClientIds = useMemo(() => {
    const ids = new Set<string>();
    Object.values(localMap).flat().forEach(e => ids.add(e.clientId));
    return Array.from(ids);
  }, [localMap]);

  const activeClients = clients.filter(c => activeClientIds.includes(c.id));

  // Stats
  const pastDates = Object.keys(localMap).filter(d => d <= today);
  const totalPast = pastDates.reduce((a, d) => a + localMap[d].length, 0);
  const completedPast = pastDates.reduce((a, d) => a + localMap[d].filter(e => e.status === "completed").length, 0);
  const pctOverall = totalPast > 0 ? Math.round(completedPast / totalPast * 100) : null;

  return (
    <div>
      {/* ── Client Avatar Strip ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
        {/* All button */}
        <button
          onClick={() => setFilterClient(null)}
          className="flex flex-col items-center gap-1 flex-shrink-0"
          title="All clients">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all"
            style={{
              background: filterClient === null ? "#E53935" : "var(--brand-surface)",
              color: filterClient === null ? "white" : "var(--brand-text-secondary)",
              border: filterClient === null ? "2.5px solid #E53935" : "2px solid var(--brand-border)",
              boxShadow: filterClient === null ? "0 0 0 3px rgba(229,57,53,0.2)" : "none",
            }}>
            <i className="ti ti-users text-base" />
          </div>
          <span className="text-[9px] font-medium" style={{ color: filterClient === null ? "#E53935" : "var(--brand-text-secondary)" }}>
            All
          </span>
        </button>

        {/* Per-client avatars */}
        {activeClients.map((c) => {
          const color = clientColor(clients, c.id);
          const initials = getInitials(c.name);
          const isSelected = filterClient === c.id;
          const firstName = c.name.split(" ")[0];
          return (
            <div key={c.id} className="flex flex-col items-center gap-1 flex-shrink-0">
              {/* Avatar — clicking filters calendar; long-press / right-click goes to profile */}
              <button
                onClick={() => setFilterClient(isSelected ? null : c.id)}
                title={`Filter: ${c.name}`}
                className="relative transition-all"
                style={{ outline: "none" }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                  style={{
                    background: color,
                    border: isSelected ? `2.5px solid ${color}` : "2px solid transparent",
                    boxShadow: isSelected ? `0 0 0 3px ${color}33` : "none",
                    opacity: filterClient && !isSelected ? 0.45 : 1,
                    transition: "all 0.15s ease",
                  }}>
                  {initials}
                </div>
                {isSelected && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                    style={{ background: color }} />
                )}
              </button>
              {/* Name label — clicking goes to their profile Training tab */}
              <Link href={`/clients/${c.id}?tab=training`}
                className="text-[9px] font-medium text-center w-12 truncate"
                style={{ color: isSelected ? color : "var(--brand-text-secondary)" }}
                title={`Open ${c.name}'s Training Calendar`}>
                {firstName}
              </Link>
            </div>
          );
        })}
      </div>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      {pctOverall !== null && (
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <span style={{ color: "var(--brand-text-secondary)" }}>Completion:</span>
            <span className="font-bold" style={{ color: pctOverall >= 80 ? "#22c55e" : pctOverall >= 60 ? "#f59e0b" : "#ef4444" }}>
              {pctOverall}%
            </span>
            <span style={{ color: "var(--brand-text-secondary)" }}>· {completedPast}/{totalPast} sessions</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-1.5 rounded-xl text-xs ml-auto"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            {(["scheduled", "completed", "cancelled"] as const).map(s => {
              const st = STATUS_STYLE[s];
              return (
                <span key={s} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
                  <span style={{ color: "var(--brand-text-secondary)" }}>{st.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Calendar nav ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
          <i className="ti ti-chevron-left text-sm" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <button onClick={goToday}
          className="px-3 h-8 rounded-lg text-xs font-medium border"
          style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "#E53935" }}>
          Today
        </button>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg flex items-center justify-center border"
          style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
          <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
        </button>
        <span className="text-sm font-bold ml-1 flex-1" style={{ color: "var(--brand-text)" }}>{monthLabel}</span>
        {filterClient && (
          <span className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5 font-medium"
            style={{ background: clientColor(clients, filterClient) + "20", color: clientColor(clients, filterClient) }}>
            {clients.find(c => c.id === filterClient)?.name.split(" ")[0]}
            <button onClick={() => setFilterClient(null)} className="text-[10px]">✕</button>
          </span>
        )}
      </div>

      {/* ── Month Grid ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
        {/* DOW header */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)" }}>
          {DOW_LABELS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--brand-text-secondary)" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7" style={{ background: "var(--brand-border)", gap: "1px" }}>
          {cells.map((dateStr, i) => {
            if (!dateStr) {
              return <div key={`empty-${i}`} style={{ background: "var(--brand-bg)", minHeight: 88 }} />;
            }

            const d = new Date(dateStr + "T00:00:00");
            const dayNum = d.getDate();
            const isToday = dateStr === today;
            const isPast = dateStr < today;

            const dayEntries = (localMap[dateStr] || [])
              .filter(e => !filterClient || e.clientId === filterClient)
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            const doneCount = dayEntries.filter(e => e.status === "completed").length;

            return (
              <div key={dateStr}
                className="cursor-pointer transition-colors"
                style={{
                  background: isToday ? "rgba(229,57,53,0.04)" : "var(--brand-surface)",
                  minHeight: 88,
                  padding: "6px 4px 4px",
                }}
                onClick={() => setSelectedDate(dateStr)}>

                {/* Date number */}
                <div className="flex items-center justify-center mb-1">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      background: isToday ? "#E53935" : "transparent",
                      color: isToday ? "white" : isPast ? "var(--brand-text-secondary)" : "var(--brand-text)",
                    }}>
                    {dayNum === 1
                      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : dayNum}
                  </span>
                </div>

                {/* Event chips */}
                <div className="space-y-0.5 px-0.5">
                  {dayEntries.slice(0, 3).map((entry) => {
                    const color = clientColor(clients, entry.clientId);
                    const done = entry.status === "completed";
                    const cancelled = entry.status === "cancelled";
                    return (
                      <div key={entry.id}
                        className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium overflow-hidden"
                        style={{
                          background: cancelled ? "transparent" : color + "18",
                          color: cancelled ? "var(--brand-text-secondary)" : color,
                          border: `1px solid ${cancelled ? "var(--brand-border)" : color + "40"}`,
                          textDecoration: cancelled ? "line-through" : "none",
                          opacity: cancelled ? 0.6 : 1,
                        }}>
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ background: color }}>
                          {getInitials(entry.clientName)}
                        </span>
                        <span className="truncate leading-none">
                          {fmt12(entry.startTime)} {entry.clientName.split(" ")[0]}
                        </span>
                        {done && <i className="ti ti-check text-[9px] flex-shrink-0" />}
                      </div>
                    );
                  })}
                  {dayEntries.length > 3 && (
                    <div className="text-[10px] px-1.5 font-medium" style={{ color: "var(--brand-text-secondary)" }}>
                      +{dayEntries.length - 3} more
                    </div>
                  )}
                </div>

                {/* Bottom completion dot */}
                {dayEntries.length > 0 && doneCount === dayEntries.length && (
                  <div className="mt-1 flex justify-center">
                    <div className="w-1 h-1 rounded-full" style={{ background: "#22c55e" }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Day Drawer ───────────────────────────────────────────────────────── */}
      {selectedDate && (
        <DayDrawer
          date={selectedDate}
          entries={(localMap[selectedDate] || []).filter(e => !filterClient || e.clientId === filterClient)}
          clients={clients}
          onClose={() => setSelectedDate(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
