"use client";
import { useMemo, useState, type CSSProperties } from "react";
import WorkoutDaySheet from "./WorkoutDaySheet";

export interface CalWorkout {
  id: string;
  dayId: string;
  date: string;
  label: string;
  status: string;
}

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
const isCardio = (l: string) => /cardio|treadmill|stair|walk|run/i.test(l);
function shortLabel(label: string): string {
  const parts = label.split("—");
  const tail = (parts.length > 1 ? parts[parts.length - 1] : label).trim();
  return tail.length > 12 ? tail.slice(0, 11) + "…" : tail;
}

/**
 * RescheduleCalendar — month calendar of the client's scheduled workouts.
 * Tapping a day opens the shared WorkoutDaySheet (named workouts + Start/Log +
 * scroll-to-move, forward AND backward). Same props as before, so every caller
 * (client schedule AND trainer client-management) upgrades automatically.
 */
export default function RescheduleCalendar({
  workouts: initial,
  basePath = "",
}: {
  workouts: CalWorkout[];
  basePath?: string;
}) {
  const today = todayCT();
  const [workouts, setWorkouts] = useState<CalWorkout[]>(initial);
  const [viewYear, setViewYear] = useState<number>(parseInt(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState<number>(parseInt(today.slice(5, 7)) - 1);
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m: Record<string, CalWorkout[]> = {};
    for (const w of workouts) (m[w.date] = m[w.date] || []).push(w);
    return m;
  }, [workouts]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const fmt = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); } else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); } else setViewMonth(viewMonth + 1);
  }
  function onMoved(id: string, newDate: string) {
    setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, date: newDate } : w)));
  }

  const cellBtn: CSSProperties = {
    minHeight: 62, borderRadius: 10, padding: "4px 3px", cursor: "pointer",
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)",
    display: "flex", flexDirection: "column", alignItems: "stretch", gap: 2, textAlign: "center",
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--brand-text)" }}>{monthLabel}</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={prevMonth} style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-bg)", border: "1px solid var(--brand-border)", cursor: "pointer", color: "var(--brand-text-secondary)" }}>‹</button>
          <button type="button" onClick={nextMonth} style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-bg)", border: "1px solid var(--brand-border)", cursor: "pointer", color: "var(--brand-text-secondary)" }}>›</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--brand-text-secondary)" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {Array.from({ length: firstDow }, (_, i) => <div key={"pad" + i} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = fmt(day);
          const dayWk = byDate[date] || [];
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              onClick={() => setSheetDate(date)}
              style={{ ...cellBtn, borderColor: isToday ? "var(--brand-primary)" : "var(--brand-border)", boxShadow: isToday ? "0 0 0 1px var(--brand-primary)" : "none" }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? "var(--brand-primary)" : "var(--brand-text)" }}>{day}</div>
              {dayWk.slice(0, 2).map((w) => (
                <div
                  key={w.id}
                  style={{
                    fontSize: 8, fontWeight: 700, borderRadius: 4, padding: "1px 2px",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    background: isCardio(w.label) ? "#eafaf3" : "#eef2ff",
                    color: w.status === "completed" ? "#22c55e" : isCardio(w.label) ? "#2f9e7f" : "var(--brand-primary)",
                  }}
                >
                  {w.status === "completed" ? "✓ " : ""}{shortLabel(w.label)}
                </div>
              ))}
              {dayWk.length > 2 ? <div style={{ fontSize: 8, color: "var(--brand-text-secondary)" }}>+{dayWk.length - 2}</div> : null}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 10, textAlign: "center" }}>
        Tap a day to start, log, or move its workouts.
      </p>
      <WorkoutDaySheet
        date={sheetDate}
        workouts={sheetDate ? (byDate[sheetDate] || []).map((w) => ({ id: w.id, dayId: w.dayId, date: w.date, label: w.label, status: w.status })) : []}
        basePath={basePath}
        today={today}
        onClose={() => setSheetDate(null)}
        onMoved={onMoved}
      />
    </div>
  );
}
