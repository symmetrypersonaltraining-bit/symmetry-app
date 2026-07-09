"use client";
import { useMemo, useState } from "react";
import WorkoutDaySheet from "./WorkoutDaySheet";

export interface BoardWorkout {
  id: string;
  dayId: string;
  date: string;
  label: string;
  status: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LOCKED_START = "2026-08-03";
const LOCKED_END = "2026-08-09";

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
function pretty(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${MON[dt.getMonth()]} ${dt.getDate()}`;
}
const isCardio = (l: string) => /cardio|treadmill|stair|walk|run|bike|zone ?2|conditioning/i.test(l || "");
const isMobility = (l: string) => /mobility|stretch|foam|roll|yoga|flexib/i.test(l || "");
function typeOf(label: string): "wk" | "mob" | "car" {
  if (isCardio(label)) return "car";
  if (isMobility(label)) return "mob";
  return "wk";
}
const TYPE_COLOR: Record<string, string> = { wk: "var(--brand-primary)", mob: "#a78bfa", car: "#5ec9a3" };
const TYPE_LABEL: Record<string, string> = { wk: "Workout", mob: "Mobility", car: "Cardio" };
const TYPE_ICON: Record<string, string> = { wk: "🏋️", mob: "🧘", car: "🏃" };

/**
 * ScheduleBoard — the redesigned schedule: a vertical, scrollable 7-day+ board
 * where each day is a card of full-name, color-coded tiles (Workout / Mobility /
 * Cardio). Tap any day to open the shared WorkoutDaySheet (Start / Log / Move —
 * move works forward and back with the past-block + Peak Week guardrails). Reads
 * from scheduled_workouts (one source of truth); a move refreshes every calendar
 * via WorkoutDaySheet's router.refresh() and realtime. Additive/isolated.
 */
export default function ScheduleBoard({
  workouts: initial,
  basePath = "",
  forClient = "",
  daysBack = 3,
  daysAhead = 24,
}: {
  workouts: BoardWorkout[];
  basePath?: string;
  forClient?: string;
  daysBack?: number;
  daysAhead?: number;
}) {
  const today = todayCT();
  const [workouts, setWorkouts] = useState<BoardWorkout[]>(initial);
  const [sheetDate, setSheetDate] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map: Record<string, BoardWorkout[]> = {};
    for (const w of workouts) (map[w.date] = map[w.date] || []).push(w);
    return map;
  }, [workouts]);

  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = -daysBack; i <= daysAhead; i++) out.push(addDays(today, i));
    return out;
  }, [today, daysBack, daysAhead]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ maxHeight: "58vh", overflowY: "auto", WebkitOverflowScrolling: "touch", paddingRight: 2 }}>
        {days.map((k) => {
          const isToday = k === today;
          const isPast = k < today;
          const locked = isPast || (k >= LOCKED_START && k <= LOCKED_END);
          const items = byDate[k] || [];
          return (
            <div
              key={k}
              onClick={() => items.length > 0 && setSheetDate(k)}
              style={{
                border: isToday ? "1px solid var(--brand-primary)" : "1px solid var(--brand-border)",
                borderRadius: 13,
                marginBottom: 9,
                background: "var(--brand-surface)",
                opacity: locked ? 0.72 : 1,
                cursor: items.length > 0 ? "pointer" : "default",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderBottom: items.length ? "1px solid var(--brand-border)" : "none",
                  background: isToday ? "color-mix(in srgb, var(--brand-primary) 12%, transparent)" : "transparent",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--brand-text)" }}>
                  {pretty(k)}
                  {isToday ? <span style={{ color: "var(--brand-primary)", fontWeight: 800 }}> · Today</span> : null}
                </span>
                <span style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>
                  {k >= LOCKED_START && k <= LOCKED_END ? "🔒 Peak Week" : isPast ? "past" : ""}
                </span>
              </div>
              <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 7 }}>
                {items.length === 0 ? (
                  <div style={{ color: "var(--brand-text-secondary)", fontSize: 12.5, padding: "2px 4px 4px", fontStyle: "italic" }}>Rest day</div>
                ) : (
                  items.map((w) => {
                    const t = typeOf(w.label);
                    const done = w.status === "completed";
                    return (
                      <div
                        key={w.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          background: "var(--brand-bg)",
                          border: "1px solid var(--brand-border)",
                          borderLeft: `4px solid ${TYPE_COLOR[t]}`,
                          borderRadius: 10,
                          padding: "10px 11px",
                        }}
                      >
                        <span style={{ fontSize: 15 }}>{TYPE_ICON[t]}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5, color: "var(--brand-text)", lineHeight: 1.2 }}>
                          {w.label}
                          {done ? <span style={{ color: "#22c55e" }}> ✓</span> : null}
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            padding: "2px 7px",
                            borderRadius: 999,
                            color: TYPE_COLOR[t],
                            background: `color-mix(in srgb, ${TYPE_COLOR[t]} 16%, transparent)`,
                          }}
                        >
                          {TYPE_LABEL[t]}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: TYPE_COLOR.wk, display: "inline-block" }} />Workout</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: TYPE_COLOR.mob, display: "inline-block" }} />Mobility</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 2, background: TYPE_COLOR.car, display: "inline-block" }} />Cardio</span>
        <span>Tap a day to Start / Log / Move</span>
      </div>
      {sheetDate && (
        <WorkoutDaySheet
          date={sheetDate}
          workouts={(byDate[sheetDate] || []).map((w) => ({ id: w.id, dayId: w.dayId, date: w.date, label: w.label, status: w.status }))}
          basePath={basePath}
          forClient={forClient}
          today={today}
          onClose={() => setSheetDate(null)}
          onMoved={(id, newDate) => setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, date: newDate } : w)))}
        />
      )}
    </div>
  );
}
