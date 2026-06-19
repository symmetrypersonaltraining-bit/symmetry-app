"use client";

import { useState } from "react";
import Link from "next/link";

interface WorkoutEntry {
  clientId: string;
  clientName: string;
  label: string;
  completed: boolean;
  id: string;
}

interface Props {
  clients: { id: string; name: string }[];
  workoutMap: Record<string, WorkoutEntry[]>;
  startDate: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEK_OPTIONS = [1, 2, 4] as const;
const AVATAR_COLORS = [
  "#0F4C81", "#1B5E20", "#4A148C", "#BF360C", "#880E4F",
  "#37474F", "#2D2D2D", "#006064", "#4E342E", "#558B2F",
];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): { day: number; month: string } {
  const d = new Date(dateStr + "T00:00:00");
  return { day: d.getDate(), month: d.toLocaleDateString("en-US", { month: "short" }) };
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

function isPast(dateStr: string): boolean {
  return dateStr < new Date().toISOString().split("T")[0];
}

/** SVG ring that wraps around the date number */
function StatusRing({ total, done, isPastDay, isCurrentDay }: { total: number; done: number; isPastDay: boolean; isCurrentDay: boolean }) {
  if (total === 0) return null;
  const r = 13;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? done / total : 0;
  const color = pct === 1 ? "#22c55e" : pct > 0 ? "#f59e0b" : isPastDay ? "#ef4444" : "#94a3b8";
  const dashOffset = circ * (1 - pct);

  return (
    <svg width="30" height="30" viewBox="0 0 30 30" className="absolute inset-0" style={{ pointerEvents: "none" }}>
      <circle cx="15" cy="15" r={r} fill="none"
        stroke={isCurrentDay ? "rgba(14,165,233,0.3)" : "rgba(150,150,150,0.15)"}
        strokeWidth="2.5"/>
      {pct > 0 && (
        <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${circ}`} strokeDashoffset={`${dashOffset}`}
          strokeLinecap="round" transform="rotate(-90 15 15)"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}/>
      )}
      {pct === 0 && isPastDay && (
        <circle cx="15" cy="15" r={r} fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray="3 4" transform="rotate(-90 15 15)" opacity="0.5"/>
      )}
    </svg>
  );
}

export default function TrainerCalendar({ clients, workoutMap, startDate }: Props) {
  const [weeks, setWeeks] = useState<1 | 2 | 4>(4);
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterClient, setFilterClient] = useState<string | null>(null);

  const displayStart = addDays(startDate, weekOffset * 7);
  const totalDays = weeks * 7;
  const dates: string[] = [];
  for (let i = 0; i < totalDays; i++) dates.push(addDays(displayStart, i));
  const weekRows: string[][] = [];
  for (let w = 0; w < weeks; w++) weekRows.push(dates.slice(w * 7, (w + 1) * 7));

  const rangeStart = new Date(displayStart + "T00:00:00");
  const rangeEnd = new Date(addDays(displayStart, totalDays - 1) + "T00:00:00");
  const rangeLabel = `${rangeStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${rangeEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  function getClientColor(clientId: string) {
    const idx = clients.findIndex((c) => c.id === clientId);
    return AVATAR_COLORS[idx % AVATAR_COLORS.length];
  }

  function getClientInitials(name: string) {
    return name.split(" ").map((n) => n[0] || "").join("").slice(0, 2).toUpperCase();
  }

  const cellHeight = weeks === 1 ? "min-h-32" : weeks === 2 ? "min-h-24" : "min-h-20";
  const maxCards = weeks === 4 ? 3 : 5;

  // Summary stats
  const todayStr = new Date().toISOString().split("T")[0];
  const allEntries = Object.entries(workoutMap);
  const pastEntries = allEntries.filter(([d]) => d <= todayStr);
  const totalScheduledPast = pastEntries.reduce((a, [, e]) => a + e.length, 0);
  const totalCompletedPast = pastEntries.reduce((a, [, e]) => a + e.filter(x => x.completed).length, 0);
  const overallPct = totalScheduledPast > 0 ? Math.round(totalCompletedPast / totalScheduledPast * 100) : null;

  return (
    <div>
      {/* Stats bar */}
      {overallPct !== null && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span style={{ color: "var(--brand-text-secondary)" }}>All-client adherence:</span>
            <span className="font-bold" style={{ color: overallPct >= 80 ? "#22c55e" : overallPct >= 60 ? "#f59e0b" : "#ef4444" }}>
              {overallPct}%
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-calendar-check" style={{ color: "#22c55e" }} />
            <span style={{ color: "var(--brand-text-secondary)" }}>{totalCompletedPast} / {totalScheduledPast} sessions</span>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-xs ml-auto"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#22c55e" }} />
              <span style={{ color: "var(--brand-text-secondary)" }}>Done</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#f59e0b" }} />
              <span style={{ color: "var(--brand-text-secondary)" }}>Partial</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#ef4444" }} />
              <span style={{ color: "var(--brand-text-secondary)" }}>Missed</span>
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset((o) => o - 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
            <i className="ti ti-chevron-left text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <button onClick={() => setWeekOffset(0)}
            className="px-3 h-8 rounded-lg text-xs font-medium border"
            style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-primary)" }}>
            Today
          </button>
          <button onClick={() => setWeekOffset((o) => o + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border"
            style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
            <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <span className="text-sm font-medium ml-1" style={{ color: "var(--brand-text)" }}>{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <select value={filterClient || ""} onChange={(e) => setFilterClient(e.target.value || null)}
            className="px-3 py-1.5 rounded-lg text-sm border"
            style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}>
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name.split(" ")[0]} {c.name.split(" ").slice(-1)[0]?.[0]}.
              </option>
            ))}
          </select>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
            {WEEK_OPTIONS.map((w) => (
              <button key={w} onClick={() => setWeeks(w)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: weeks === w ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: weeks === w ? "white" : "var(--brand-text-secondary)",
                }}>
                {w}W
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
        {/* Headers */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--brand-border)" }}>
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--brand-text-secondary)", background: "var(--brand-bg)" }}>
              {d}
            </div>
          ))}
        </div>

        {weekRows.map((weekDates, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0"
            style={{ borderColor: "var(--brand-border)" }}>
            {weekDates.map((date) => {
              const { day, month } = formatDate(date);
              const todayCell = isToday(date);
              const pastCell = isPast(date);
              const allEntries = (workoutMap[date] || []).filter(
                (e) => !filterClient || e.clientId === filterClient
              );
              const doneCount = allEntries.filter(e => e.completed).length;
              const totalCount = allEntries.length;

              return (
                <div key={date}
                  className={`${cellHeight} border-r last:border-r-0 p-1.5`}
                  style={{
                    borderColor: "var(--brand-border)",
                    background: todayCell ? "rgba(14,165,233,0.05)" : "transparent",
                  }}>
                  {/* Date with ring */}
                  <div className="flex items-center gap-1 mb-1">
                    <div className="relative w-[30px] h-[30px] flex-shrink-0 flex items-center justify-center">
                      <StatusRing total={totalCount} done={doneCount} isPastDay={pastCell} isCurrentDay={todayCell} />
                      <span className="relative z-10 text-xs font-semibold"
                        style={{ color: todayCell ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
                        {day}
                      </span>
                    </div>
                    {day === 1 && (
                      <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{month}</span>
                    )}
                  </div>

                  {/* Workout cards */}
                  <div className="space-y-0.5">
                    {allEntries.slice(0, maxCards).map((entry) => {
                      const color = getClientColor(entry.clientId);
                      const initials = getClientInitials(entry.clientName);
                      return (
                        <Link key={entry.id} href={`/clients/${entry.clientId}`}
                          className="flex items-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium truncate"
                          style={{
                            background: entry.completed ? "#D1FAE5" : color + "18",
                            color: entry.completed ? "#065F46" : color,
                            border: `1px solid ${entry.completed ? "#A7F3D0" : color + "40"}`,
                          }}
                          title={`${entry.clientName} — ${entry.label}`}>
                          <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold text-white"
                            style={{ background: color }}>
                            {initials}
                          </span>
                          <span className="truncate">{entry.label}</span>
                          {entry.completed && <i className="ti ti-check text-[10px] flex-shrink-0" />}
                        </Link>
                      );
                    })}
                    {allEntries.length > maxCards && (
                      <div className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ color: "var(--brand-text-secondary)", background: "var(--brand-bg)" }}>
                        +{allEntries.length - maxCards} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
