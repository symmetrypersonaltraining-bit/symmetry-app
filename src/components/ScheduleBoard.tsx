"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
const HOLD_MS = 250;

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
 * ScheduleBoard — compact scrollable schedule board. ~5-7 days visible on mobile.
 * Reschedule two ways: (1) PRESS-AND-HOLD a workout tile (~250ms) then drag it
 * onto another day — the target day highlights; release to drop. (2) tap the
 * "Move" button on a tile to pick a date. Both honor guardrails (block before
 * today, Peak Week Aug 3-9 locked, never move completed). A move updates
 * scheduled_workouts + router.refresh() so every calendar reflects it (realtime
 * covers other devices). Additive/isolated.
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
  const [overDate, setOverDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movePick, setMovePick] = useState<{ id: string; label: string } | null>(null);
  const [pickDate, setPickDate] = useState<string>(today);

  const dragRef = useRef<any>(null);
  const activeRef = useRef(false);
  // Stable listener reference (created once) that only blocks scroll WHILE a drag is
  // active. Stable ref => removeEventListener matches; activeRef guard => a leaked
  // listener can never freeze page scrolling.
  const preventScrollRef = useRef((e: Event) => { if (activeRef.current) { try { e.preventDefault(); } catch { /* noop */ } } });

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
    setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: toDate } : x)));
    try {
      const supabase: any = createClient();
      const { error } = await supabase.from("scheduled_workouts").update({ scheduled_date: toDate }).eq("id", id);
      if (error) throw error;
      flash("Moved ✓");
      router.refresh();
    } catch {
      setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: w.date } : x)));
      flash("Couldn't move that workout. Try again.");
    }
  }

  // Soft-remove: sets deleted_at so the workout disappears from every schedule
  // (all reads filter deleted_at IS NULL) but the row is preserved (reversible).
  async function removeWorkout(w: BoardWorkout) {
    if (isLockedDate(w.date)) { flash("Peak Week workouts are locked."); return; }
    if (typeof window !== "undefined" && !window.confirm(`Remove "${w.label}" from ${shortLabel(w.date)}? You can re-add it later.`)) return;
    setWorkouts((prev) => prev.filter((x) => x.id !== w.id));
    try {
      const supabase: any = createClient();
      const { error } = await supabase.from("scheduled_workouts").update({ deleted_at: new Date().toISOString() }).eq("id", w.id);
      if (error) throw error;
      flash("Removed");
      router.refresh();
    } catch {
      setWorkouts((prev) => [...prev, w]);
      flash("Couldn't remove. Try again.");
    }
  }

  // ── press-hold-drag ────────────────────────────────────────
  function cleanupDrag() {
    const d = dragRef.current;
    if (d) {
      if (d.timer) { clearTimeout(d.timer); }
      if (d.ghost) { try { d.ghost.remove(); } catch { /* noop */ } }
      try { d.tileEl && d.tileEl.releasePointerCapture && d.tileEl.releasePointerCapture(d.pid); } catch { /* noop */ }
    }
    activeRef.current = false;
    try { document.removeEventListener("touchmove", preventScrollRef.current); } catch { /* noop */ }
    dragRef.current = null;
    setOverDate(null);
  }

  function activateDrag() {
    const d = dragRef.current;
    if (!d || d.active) return;
    d.active = true;
    const g = document.createElement("div");
    g.textContent = d.label;
    g.style.cssText = "position:fixed;z-index:9999;pointer-events:none;background:var(--brand-primary);color:#fff;font-weight:700;font-size:12.5px;padding:8px 12px;border-radius:10px;box-shadow:0 8px 22px rgba(20,30,55,.28);max-width:70vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transform:rotate(-1.5deg)";
    g.style.left = d.lastX - 40 + "px";
    g.style.top = d.lastY - 44 + "px";
    document.body.appendChild(g);
    d.ghost = g;
    try { d.tileEl.setPointerCapture(d.pid); } catch { /* noop */ }
    activeRef.current = true;
    document.addEventListener("touchmove", preventScrollRef.current, { passive: false } as any);
    try { (navigator as any).vibrate && (navigator as any).vibrate(14); } catch { /* noop */ }
  }

  function onTileDown(e: React.PointerEvent, w: BoardWorkout) {
    if (e.button != null && e.button !== 0) return;
    dragRef.current = {
      id: w.id, label: w.label, startX: e.clientX, startY: e.clientY,
      lastX: e.clientX, lastY: e.clientY, active: false, ghost: null,
      pid: e.pointerId, tileEl: e.currentTarget,
      timer: window.setTimeout(activateDrag, HOLD_MS),
    };
  }
  function onTileMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    d.lastX = e.clientX; d.lastY = e.clientY;
    if (!d.active) {
      // moved before hold fired → it's a scroll, cancel the pickup
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 10) {
        clearTimeout(d.timer);
        dragRef.current = null;
      }
      return;
    }
    if (d.ghost) { d.ghost.style.left = e.clientX - 40 + "px"; d.ghost.style.top = e.clientY - 44 + "px"; }
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const dayEl = under && under.closest ? under.closest("[data-board-date]") : null;
    const dt = dayEl ? (dayEl as HTMLElement).getAttribute("data-board-date") : null;
    setOverDate(dt && !isLockedDate(dt) && dt >= today ? dt : null);
  }
  function onTileUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (d.active) {
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const dayEl = under && under.closest ? under.closest("[data-board-date]") : null;
      const dt = dayEl ? (dayEl as HTMLElement).getAttribute("data-board-date") : null;
      moveWorkout(d.id, dt);
    }
    cleanupDrag();
  }

  useEffect(() => () => cleanupDrag(), []); // safety on unmount

  function launchWorkout(w: BoardWorkout) {
    router.push(`${basePath}/workout/${w.dayId}${forClient ? "?forClient=" + forClient : ""}`);
  }

  function openMove(w: BoardWorkout) {
    setMovePick({ id: w.id, label: w.label });
    const w0 = workouts.find((x) => x.id === w.id);
    setPickDate(w0 && w0.date >= today ? w0.date : today);
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
              style={{
                border: isOver ? "1.5px solid var(--brand-primary)" : isToday ? "1px solid var(--brand-primary)" : "1px solid var(--brand-border)",
                borderRadius: 11,
                marginBottom: 6,
                background: isOver ? "color-mix(in srgb, var(--brand-primary) 10%, var(--brand-surface))" : "var(--brand-surface)",
                opacity: locked && !isOver ? 0.7 : 1,
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
                    const movable = !done && !locked;
                    return (
                      <div
                        key={w.id}
                        onPointerDown={movable ? (e) => onTileDown(e, w) : undefined}
                        onPointerMove={movable ? onTileMove : undefined}
                        onPointerUp={movable ? onTileUp : undefined}
                        onPointerCancel={movable ? () => cleanupDrag() : undefined}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          background: "var(--brand-bg)",
                          border: "1px solid var(--brand-border)",
                          borderLeft: `4px solid ${TYPE_COLOR[t]}`,
                          borderRadius: 8,
                          padding: "6px 8px",
                          cursor: movable ? "grab" : "default",
                          userSelect: "none",
                          WebkitUserSelect: "none",
                          WebkitTouchCallout: "none",
                        } as any}
                      >
                        {movable ? (
                          <span title="Press & hold, then drag" style={{ color: "var(--brand-text-secondary)", fontSize: 16, lineHeight: 1, letterSpacing: "-2px" }}>⠿</span>
                        ) : (
                          <span style={{ width: 10 }} />
                        )}
                        <span style={{ fontSize: 13.5 }}>{t === "car" ? "🏃" : t === "mob" ? "🧘" : "🏋️"}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, color: "var(--brand-text)", lineHeight: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {w.label}
                          {done ? <span style={{ color: "#22c55e" }}> ✓</span> : null}
                        </span>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); launchWorkout(w); }}
                          style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 8, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer" }}
                        >
                          {done ? "View" : "▶ Start"}
                        </button>
                        {movable ? (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); openMove(w); }}
                            style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "var(--brand-primary)", cursor: "pointer" }}
                          >
                            Move
                          </button>
                        ) : null}
                        {movable ? (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); removeWorkout(w); }}
                            title="Remove from schedule"
                            aria-label="Remove from schedule"
                            style={{ flexShrink: 0, fontSize: 13, padding: "4px 6px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-surface)", color: "#ef4444", cursor: "pointer", lineHeight: 1 }}
                          >
                            <i className="ti ti-trash" />
                          </button>
                        ) : null}
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
        <span>Press &amp; hold a workout to drag · or tap Move</span>
      </div>
      {notice ? <div style={{ fontSize: 11.5, color: "var(--brand-primary)", marginTop: 4, fontWeight: 600 }}>{notice}</div> : null}

      {movePick && (
        <>
          <div onClick={() => setMovePick(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,35,0.34)", zIndex: 60 }} />
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 61, background: "var(--brand-surface)", borderTopLeftRadius: 20, borderTopRightRadius: 20, boxShadow: "0 -10px 30px rgba(20,30,55,0.18)", padding: "16px 16px 24px", maxWidth: 520, margin: "0 auto" }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "var(--brand-text)", marginBottom: 2 }}>Move workout</div>
            <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginBottom: 12 }}>{movePick.label}</div>
            <input
              type="date"
              value={pickDate}
              min={today}
              onChange={(e) => setPickDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 15, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setMovePick(null)} style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={() => { if (pickDate) { moveWorkout(movePick.id, pickDate); setMovePick(null); } }}
                disabled={isLockedDate(pickDate) || pickDate < today}
                style={{ flex: 1, background: "var(--brand-primary)", color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: isLockedDate(pickDate) || pickDate < today ? 0.6 : 1 }}
              >
                Move here
              </button>
            </div>
            <button
              onClick={() => { const w = workouts.find((x) => x.id === movePick.id); setMovePick(null); if (w) removeWorkout(w); }}
              style={{ marginTop: 12, width: "100%", background: "transparent", border: "none", color: "#ef4444", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: "6px 0" }}
            >
              🗑 Remove from schedule
            </button>
          </div>
        </>
      )}
    </div>
  );
}
