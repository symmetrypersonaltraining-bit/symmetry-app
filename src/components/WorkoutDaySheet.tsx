"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type DaySheetWorkout = { id: string; dayId: string; date: string; label: string; status: string };

const LOCKED_START = "2026-08-03";
const LOCKED_END = "2026-08-09";
const isLocked = (d: string) => d >= LOCKED_START && d <= LOCKED_END;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isCardio = (l: string) => /cardio|treadmill|stair|walk|run/i.test(l);

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function relLabel(target: string, from: string): string {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(target + "T00:00:00").getTime();
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "same day";
  if (diff === 1) return "1 day later";
  if (diff === -1) return "1 day earlier";
  return diff > 0 ? diff + " days later" : Math.abs(diff) + " days earlier";
}
function pretty(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]}, ${MON[dt.getMonth()]} ${dt.getDate()}`;
}

/**
 * WorkoutDaySheet — shared bottom sheet for a single day's workouts.
 * Lists each workout BY NAME with Start (today) / Log (other days) + a Move
 * button that opens a scrollable date picker (forward AND backward, bounded to
 * today..+8wks; past + Peak Week blocked). Move updates scheduled_workouts.
 * Additive/isolated; renders nothing when date is null.
 */
export default function WorkoutDaySheet({
  date,
  workouts,
  basePath = "",
  forClient = "",
  today,
  onClose,
  onMoved,
}: {
  date: string | null;
  workouts: DaySheetWorkout[];
  forClient?: string;
  basePath?: string;
  today: string;
  onClose: () => void;
  onMoved?: (id: string, newDate: string) => void;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState<DaySheetWorkout | null>(null);
  const [sel, setSel] = useState<string>(today);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const wheelRef = useRef<HTMLDivElement | null>(null);

  const dates: string[] = [];
  for (let i = 0; i <= 56; i++) dates.push(addDays(today, i));

  useEffect(() => {
    if (!moving || !wheelRef.current) return;
    const start = moving.date >= today ? moving.date : today;
    setSel(start);
    const idx = Math.max(0, dates.indexOf(start));
    const el = wheelRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = idx * 44;
    });
  }, [moving]);

  if (!date) return null;

  function onWheelScroll() {
    const el = wheelRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / 44);
    const clamped = Math.min(Math.max(idx, 0), dates.length - 1);
    setSel(dates[clamped]);
  }

  async function doMove() {
    if (!moving || saving) return;
    const target = sel;
    if (target === moving.date) { setMoving(null); return; }
    if (target < today) { setNotice("Can't move a workout into the past."); return; }
    if (isLocked(target) || isLocked(moving.date)) { setNotice("Peak Week workouts are locked."); return; }
    setSaving(true);
    setNotice(null);
    try {
      const supabase: any = createClient();
      const { error } = await supabase.from("scheduled_workouts").update({ scheduled_date: target }).eq("id", moving.id);
      if (error) throw error;
      if (onMoved) onMoved(moving.id, target);
      setMoving(null);
      onClose();
      // Re-fetch every server-rendered calendar on this screen so the move
      // reflects everywhere at once (home ring, week bar, month grid, trainer
      // profile). Cross-device live sync is handled by RealtimeScheduleSync.
      router.refresh();
    } catch {
      setNotice("Couldn't move that workout. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const isToday = date === today;

  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,20,35,0.34)", zIndex: 60 }}
      />
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 61,
          background: "var(--brand-surface)",
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: "0 -10px 30px rgba(20,30,55,0.18)",
          padding: "14px 14px 20px",
          maxWidth: 520,
          margin: "0 auto",
          maxHeight: "85vh",
          WebkitOverflowScrolling: "touch",
          overflowY: "auto",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--brand-border)", margin: "0 auto 12px" }} />

        {!moving ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 2, background: "var(--brand-surface)", paddingTop: 2, paddingBottom: 10 }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: "var(--brand-text)" }}>
                {pretty(date)}{isToday ? " · Today" : ""}
              </span>
              <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, lineHeight: 1, padding: "0 4px", color: "var(--brand-text-secondary)", cursor: "pointer" }}>×</button>
            </div>
            {workouts.length === 0 ? (
              <div style={{ color: "var(--brand-text-secondary)", fontStyle: "italic", padding: "8px 2px 4px", fontSize: 13 }}>
                Rest day — nothing scheduled. 💪
              </div>
            ) : (
              workouts.map((w) => {
                const done = w.status === "completed";
                return (
                  <div
                    key={w.id}
                    style={{
                      background: "var(--brand-bg)",
                      border: "1px solid var(--brand-border)",
                      borderRadius: 13,
                      padding: "11px 12px",
                      marginBottom: 9,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span
                        style={{
                          width: 30, height: 30, borderRadius: 9, flex: "0 0 auto",
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                          background: isCardio(w.label) ? "#eafaf3" : "#eef2ff",
                        }}
                      >
                        {isCardio(w.label) ? "🏃" : "🏋️"}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--brand-text)", lineHeight: 1.2 }}>
                        {w.label}{done ? " ✓" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
                      <Link
                        href={`${basePath}/workout/${w.dayId}${forClient ? "?forClient=" + forClient : ""}`}
                        style={{
                          flex: 1, textAlign: "center", fontWeight: 700, fontSize: 12.5, padding: 9,
                          borderRadius: 10, textDecoration: "none",
                          background: isToday ? "var(--brand-primary)" : "var(--brand-card)",
                          color: isToday ? "#fff" : "var(--brand-text)",
                        }}
                      >
                        {isToday ? "▶ Start workout" : done ? "View / edit log" : "✓ Log this workout"}
                      </Link>
                      {!isLocked(w.date) && !done ? (
                        <button
                          onClick={() => setMoving(w)}
                          style={{
                            flex: "0 0 auto", padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                            border: "1px solid var(--brand-border)", background: "var(--brand-surface)",
                            color: "var(--brand-text)", fontWeight: 700, fontSize: 12.5,
                          }}
                        >
                          📅 Move
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
            {notice ? <div style={{ fontSize: 12, color: "var(--brand-primary)", marginTop: 6 }}>{notice}</div> : null}
          </>
        ) : (
          <>
            <div style={{ marginBottom: 4, fontWeight: 800, fontSize: 15, color: "var(--brand-text)" }}>Move workout</div>
            <div style={{ fontSize: 12.5, color: "var(--brand-text-secondary)", marginBottom: 10 }}>{moving.label}</div>
            <div style={{ position: "relative", background: "var(--brand-bg)", borderRadius: 14, padding: "6px 0" }}>
              <div
                style={{
                  position: "absolute", left: 8, right: 8, top: 66, height: 44,
                  border: "1px solid var(--brand-primary)", background: "#7c9cf510",
                  borderRadius: 8, pointerEvents: "none",
                }}
              />
              <div
                ref={wheelRef}
                onScroll={onWheelScroll}
                style={{ height: 176, overflowY: "auto", scrollSnapType: "y mandatory", paddingTop: 66, paddingBottom: 66 }}
              >
                {dates.map((d) => {
                  const locked = isLocked(d);
                  const active = d === sel;
                  return (
                    <div
                      key={d}
                      style={{
                        height: 44, scrollSnapAlign: "center", display: "flex", alignItems: "center",
                        justifyContent: "space-between", padding: "0 22px",
                        opacity: locked ? 0.35 : active ? 1 : 0.5,
                        fontWeight: active ? 800 : 500,
                        color: "var(--brand-text)", fontSize: 15,
                      }}
                    >
                      <span>{pretty(d)}{d === today ? " · Today" : ""}{locked ? " 🔒" : ""}</span>
                      <span style={{ fontSize: 12, color: active ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
                        {locked ? "Peak Week" : relLabel(d, moving.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {notice ? <div style={{ fontSize: 12, color: "var(--brand-primary)", marginTop: 6 }}>{notice}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button
                onClick={() => { setMoving(null); setNotice(null); }}
                style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={doMove}
                disabled={saving || isLocked(sel)}
                style={{ flex: 1, background: "var(--brand-primary)", color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: saving || isLocked(sel) ? 0.6 : 1 }}
              >
                {saving ? "Moving…" : "Move to " + pretty(sel)}
              </button>
            </div>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
