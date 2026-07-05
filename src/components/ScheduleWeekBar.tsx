"use client";
import { useMemo, useState } from "react";
import WorkoutDaySheet from "./WorkoutDaySheet";

export interface WeekBarWorkout {
  id: string;
  dayId: string;
  date: string;
  label: string;
  status: string;
}

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
const isCardio = (l: string) => /cardio|treadmill|stair|walk|run/i.test(l || "");

/**
 * ScheduleWeekBar — a one-week strip atop the View Schedule page.
 * Tap a day to open the shared WorkoutDaySheet (Start / Log / Move).
 * Isolated + additive: renders from props only, never mutates unless a move
 * happens (handled by WorkoutDaySheet), then reflects it locally.
 */
export default function ScheduleWeekBar({
  workouts: initial,
  basePath = "",
}: {
  workouts: WeekBarWorkout[];
  basePath?: string;
}) {
  const today = todayCT();
  const [workouts, setWorkouts] = useState<WeekBarWorkout[]>(initial);
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  // Sunday-start week containing today, shifted by weekOffset
  const weekStart = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - dt.getDay() + weekOffset * 7);
    const p = (x: number) => String(x).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }, [today, weekOffset]);

  const byDate = useMemo(() => {
    const map: Record<string, WeekBarWorkout[]> = {};
    for (const w of workouts) (map[w.date] = map[w.date] || []).push(w);
    return map;
  }, [workouts]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, dow: i, dayWorkouts: byDate[date] || [], isToday: date === today, dateNum: Number(date.slice(8, 10)) };
  });

  const weekLabel =
    weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : weekOffset === 1 ? "Next Week" : weekOffset > 1 ? `In ${weekOffset} Weeks` : `${Math.abs(weekOffset)} Weeks Ago`;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => o - 1)}
          style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "var(--brand-card)", color: "var(--brand-text-secondary)", cursor: "pointer" }}
          aria-label="Previous week"
        >
          ‹
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--brand-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{weekLabel}</span>
        <button
          type="button"
          onClick={() => setWeekOffset((o) => Math.min(o + 1, 8))}
          style={{ width: 26, height: 26, borderRadius: 999, border: "none", background: "var(--brand-card)", color: "var(--brand-text-secondary)", cursor: "pointer" }}
          aria-label="Next week"
        >
          ›
        </button>
      </div>
      <div style={{ display: "flex", gap: 5, justifyContent: "space-between" }}>
        {days.map(({ date, dow, dayWorkouts, isToday, dateNum }) => {
          const has = dayWorkouts.length > 0;
          const done = has && dayWorkouts.every((w) => w.status === "completed");
          const cardio = has && dayWorkouts.some((w) => isCardio(w.label));
          const clickable = has;
          return (
            <button
              key={date}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && setSheetDate(date)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "7px 2px",
                borderRadius: 13,
                cursor: clickable ? "pointer" : "default",
                border: isToday ? "2px solid var(--brand-primary)" : "1px solid var(--brand-border)",
                background: has ? "var(--brand-surface)" : "transparent",
                opacity: clickable ? 1 : 0.55,
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 700, color: isToday ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>{DOW[dow]}</span>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12.5,
                  fontWeight: 700,
                  background: done ? "var(--brand-primary)" : has ? "var(--brand-card)" : "transparent",
                  color: done ? "#fff" : "var(--brand-text)",
                }}
              >
                {dateNum}
              </span>
              <span style={{ height: 6, display: "flex", alignItems: "center", gap: 2 }}>
                {has
                  ? dayWorkouts.slice(0, 3).map((w, i) => (
                      <span key={w.id || i} style={{ width: 5, height: 5, borderRadius: 999, background: w.status === "completed" ? "var(--brand-primary)" : cardio ? "#5ec9a3" : "var(--brand-text-secondary)" }} />
                    ))
                  : null}
              </span>
            </button>
          );
        })}
      </div>
      {sheetDate && (
        <WorkoutDaySheet
          date={sheetDate}
          workouts={(byDate[sheetDate] || []).map((w) => ({ id: w.id, dayId: w.dayId, date: w.date, label: w.label, status: w.status }))}
          basePath={basePath}
          today={today}
          onClose={() => setSheetDate(null)}
          onMoved={(id, newDate) => setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, date: newDate } : w)))}
        />
      )}
    </div>
  );
}
