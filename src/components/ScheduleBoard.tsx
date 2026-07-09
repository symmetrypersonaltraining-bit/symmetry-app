"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
function shortLabel(dateStr: string): string {
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
const isLockedDate = (d: string) => d >= LOCKED_START && d <= LOCKED_END;

/**
 * ScheduleBoard — compact, scrollable schedule board (redesign from
 * schedule-redesign-mockup.html). Dense rows so ~5-7 days are visible at once on
 * mobile. Each day lists its workouts as full-name, color-coded tiles.
 * Reschedule two ways: (1) DRAG a tile by its ⠿ grip onto another day, or
 * (2) tap the day → WorkoutDaySheet (Start / Log / Move date-picker). Both honor
 * the guardrails (block before today, Peak Week Aug 3-9 locked, never move
 * completed). A move updates scheduled_workouts + router.refresh() so every
 * calendar reflects it (realtime handles other devices). Additive/isolated.
 */
export default function ScheduleBoard({
  workouts: initial,
  basePath = "",
  forClient = "",
  daysBack = 2,
  daysAhead = 20,
}: {
  workouts: BoardWorkout[];
  basePath?: string;
  forClient?: string;
  daysBack?: number;
  daysAhead?: number;
}) {
  const router = useRouter();
  const today = todayCT();
  const [workouts, setWorkouts] = useState<BoardWorkout[]>(initial);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const dragRef = useRef<any>(null);
  const justDragged = useRef(false);

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

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function moveWorkout(id: string, toDate: string | null) {
    if (!toDate) return;
    const w = workouts.find((x) => x.id === id);
    if (!w || w.date === toDate) return;
    if (toDate < today) { flash("Can't move a workout into the past."); return; }
    if (isLockedDate(toDate) || isLockedDate(w.date)) { flash("Peak Week workouts are locked."); return; }
    // optimistic
    setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: toDate } : x)));
    try {
      const supabase: any = createClient();
      const { error } = await supabase.from("scheduled_workouts").update({ scheduled_date: toDate }).eq("id", id);
      if (error) throw error;
      flash("Moved ✓");
      router.refresh();
    } catch {
      // revert on failure
      setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: w.date } : x)));
      flash("Couldn't move that workout. Try again.");
    }
  }

  // ── grip drag ──────────────────────────────────────────────
  function onGripDown(e: React.PointerEvent, w: BoardWorkout) {
    e.stopPropagation();
    e.preventDefault();
    try { (e.currentTarget as any).setPointerCapture(e.pointerId); } catch { /* noop */ }
    dragRef.current = { id: w.id, label: w.label, startX: e.clientX, startY: e.clientY, active: false, ghost: null, pid: e.pointerId };
  }
  function onGripMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
      // activate: build ghost
      const g = document.createElement("div");
      g.textContent = d.label;
      g.style.cssText = "position:fixed;z-index:9999;pointer-events:none;background:var(--brand-primary);color:#fff;font-weight:700;font-size:12.5px;padding:8px 12px;border-radius:10px;box-shadow:0 8px 22px rgba(20,30,55,.28);max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:rotate(-1.5deg)";
      document.body.appendChild(g);
      d.ghost = g;
      d.active = true;
      try { (navigator as any).vibrate && (navigator as any).vibrate(12); } catch { /* noop */ }
    }
    if (d.ghost) { d.ghost.style.left = e.clientX - 40 + "px"; d.ghost.style.top = e.clientY - 44 + "px"; }
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const dayEl = under && under.closest ? under.closest("[data-board-date]") : null;
    const dt = dayEl ? (dayEl as HTMLElement).getAttribute("data-board-date") : null;
    setOverDate(dt && !isLockedDate(dt) && dt >= today ? dt : null);
  }
  function onGripUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.active) {
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const dayEl = under && under.closest ? under.closest("[data-board-date]") : null;
      const dt = dayEl ? (dayEl as HTMLElement).getAttribute("data-board-date") : null;
      if (d.ghost) { try { d.ghost.remove(); } catch { /* noop */ } }
      justDragged.current = true;
      window.setTimeout(() => { justDragged.current = false; }, 250);
      moveWorkout(d.id, dt);
    }
    setOverDate(null);
    dragRef.current = null;
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div>
        {days.map((k) => {
          const isToday = k === today;
          const isPast = k < today;
          const locked = isPast || isLockedDate(k);
          const items = byDate[k] || [];
          const empty = items.length === 0;
          const isOver = overDate === k;
          return (
            <div
              key={k}
              data-board-date={k}
              onClick={() => { if (!justDragged.current && items.length > 0) setSheetDate(k); }}
              style={{
                border: isOver ? "1.5px solid var(--brand-primary)" : isToday ? "1px solid var(--brand-primary)" : "1px solid var(--brand-border)",
                borderRadius: 11,
                marginBottom: 6,
                background: isOver ? "color-mix(in srgb, var(--brand-primary) 10%, var(--brand-surface))" : "var(--brand-surface)",
                opacity: locked && !isOver ? 0.7 : 1,
                cursor: items.length > 0 ? "pointer" : "default",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: empty ? "5px 10px" : "4px 10px",
                  borderBottom: empty ? "none" : "1px solid var(--brand-border)",
                  background: isToday ? "color-mix(in srgb, var(--brand-primary) 12%, transparent)" : "transparent",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 11.5, color: "var(--brand-text)" }}>
                  {shortLabel(k)}
                  {isToday ? <span style={{ color: "var(--brand-primary)", fontWeight: 800 }}> · Today</span> : null}
                </span>
                <span style={{ fontSize: 10.5, color: "var(--brand-text-secondary)" }}>
                  {isLockedDate(k) ? "🔒 Peak Week" : empty ? "Rest" : isPast ? "past" : ""}
                </span>
              </div>
              {!empty && (
                <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                  {items.map((w) => {
                    const t = typeOf(w.label);
                    const done = w.status === "completed";
                    const draggable = !done && !locked;
                    return (
                      <div
                        key={w.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          background: "var(--brand-bg)",
                          border: "1px solid var(--brand-border)",
                          borderLeft: `4px solid ${TYPE_COLOR[t]}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                        }}
                      >
                        {draggable ? (
                          <span
                            onPointerDown={(e) => onGripDown(e, w)}
                            onPointerMove={onGripMove}
                            onPointerUp={onGripUp}
                            onPointerCancel={onGripUp}
                            onClick={(e) => e.stopPropagation()}
                            title="Drag to another day"
                            style={{ touchAction: "none", cursor: "grab", color: "var(--brand-text-secondary)", fontSize: 16, lineHeight: 1, letterSpacing: "-2px", padding: "2px 4px", margin: "-2px 0", userSelect: "none" }}
                          >
                            ⠿
                          </span>
                        ) : (
                          <span style={{ width: 12 }} />
                        )}
                        <span style={{ fontSize: 13.5 }}>{t === "car" ? "🏃" : t === "mob" ? "🧘" : "🏋️"}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, color: "var(--brand-text)", lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {w.label}
                          {done ? <span style={{ color: "#22c55e" }}> ✓</span> : null}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 999, color: TYPE_COLOR[t], background: `color-mix(in srgb, ${TYPE_COLOR[t]} 16%, transparent)`, flexShrink: 0 }}>
                          {t === "car" ? "Cardio" : t === "mob" ? "Mobility" : "Workout"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 10.5, color: "var(--brand-text-secondary)", marginTop: 3 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLOR.wk, display: "inline-block" }} />Workout</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLOR.mob, display: "inline-block" }} />Mobility</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLOR.car, display: "inline-block" }} />Cardio</span>
        <span>Drag ⠿ to move · tap a day for options</span>
      </div>
      {notice ? <div style={{ fontSize: 11.5, color: "var(--brand-primary)", marginTop: 4, fontWeight: 600 }}>{notice}</div> : null}
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
