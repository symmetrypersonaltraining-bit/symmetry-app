"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export interface CalWorkout {
  id: string;
  dayId: string;
  date: string;
  label: string;
  status: string;
}

// Peak Week is locked — never allow moves from or onto these dates
const LOCKED_START = "2026-08-03";
const LOCKED_END = "2026-08-09";

function isCardio(label: string) {
  return /cardio/i.test(label);
}

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export default function RescheduleCalendar({ workouts: initial, basePath = "" }: { workouts: CalWorkout[]; basePath?: string }) {
  const supabase = createClient();
  const today = todayCT();
  const [workouts, setWorkouts] = useState<CalWorkout[]>(initial);
  const [viewYear, setViewYear] = useState<number>(parseInt(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState<number>(parseInt(today.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [moving, setMoving] = useState<CalWorkout | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m: Record<string, CalWorkout[]> = {};
    for (const w of workouts) {
      (m[w.date] = m[w.date] || []).push(w);
    }
    return m;
  }, [workouts]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const fmt = (d: number) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const isLocked = (date: string) => date >= LOCKED_START && date <= LOCKED_END;

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11); } else { setViewMonth(viewMonth - 1); }
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0); } else { setViewMonth(viewMonth + 1); }
  }

  async function moveTo(targetDate: string) {
    if (!moving || saving) return;
    if (targetDate === moving.date) { setMoving(null); return; }
    if (targetDate < today) { setNotice("Can't move a workout into the past."); return; }
    if (isLocked(targetDate) || isLocked(moving.date)) { setNotice("Peak Week workouts are locked."); return; }
    setSaving(true);
    setNotice(null);
    try {
      const { error } = await (supabase as any)
        .from("scheduled_workouts")
        .update({ scheduled_date: targetDate })
        .eq("id", moving.id);
      if (error) throw error;
      setWorkouts(prev => prev.map(w => (w.id === moving.id ? { ...w, date: targetDate } : w)));
      setNotice(`Moved to ${new Date(targetDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ✓`);
      setSelectedDate(targetDate);
      setMoving(null);
    } catch {
      setNotice("Couldn't move that workout. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDayTap(date: string) {
    if (moving) { moveTo(date); return; }
    setSelectedDate(date);
    setNotice(null);
  }

  const selWorkouts = byDate[selectedDate] || [];
  const selLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{monthLabel}</p>
        <div className="flex gap-1">
          <button type="button" onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-chevron-left text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-chevron-right text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
      </div>

      {moving && (
        <div className="mb-3 rounded-xl px-3 py-2 text-xs font-medium flex items-center justify-between" style={{ background: "color-mix(in srgb, var(--brand-primary) 12%, transparent)", color: "var(--brand-primary)" }}>
          <span>Moving &ldquo;{moving.label}&rdquo; — tap the new day</span>
          <button type="button" onClick={() => setMoving(null)} className="font-semibold" style={{ color: "var(--brand-primary)", background: "none", border: "none" }}>Cancel</button>
        </div>
      )}
      {notice && !moving && (
        <div className="mb-3 rounded-xl px-3 py-2 text-xs font-medium" style={{ background: "color-mix(in srgb, var(--brand-primary) 8%, transparent)", color: "var(--brand-text-secondary)" }}>{notice}</div>
      )}

      <div className="grid grid-cols-7 gap-1 mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium" style={{ color: "var(--brand-text-secondary)" }}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 mb-4">
        {Array.from({ length: firstDow }, (_, i) => <div key={"pad" + i} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const date = fmt(d);
          const dayWorkouts = byDate[date] || [];
          const isToday = date === today;
          const isSel = date === selectedDate && !moving;
          const locked = isLocked(date);
          const isTarget = !!moving && date >= today && !locked;
          return (
            <button key={date} type="button" onClick={() => handleDayTap(date)}
              className="rounded-lg flex flex-col items-center justify-start pt-1 pb-0.5 transition-all"
              style={{
                minHeight: 44,
                background: isSel ? "color-mix(in srgb, var(--brand-primary) 15%, transparent)" : isTarget ? "color-mix(in srgb, var(--brand-primary) 6%, transparent)" : "transparent",
                border: isToday ? "1.5px solid var(--brand-primary)" : isTarget ? "1px dashed var(--brand-primary)" : "1px solid transparent",
                opacity: locked && moving ? 0.35 : 1,
                cursor: "pointer",
              }}>
              <span className="text-[11px] font-semibold" style={{ color: isToday ? "var(--brand-primary)" : "var(--brand-text)" }}>{d}</span>
              <span className="flex gap-0.5 flex-wrap justify-center" style={{ minHeight: 12 }}>
                {dayWorkouts.slice(0, 2).map(w => (
                  <i key={w.id} className={`ti ${isCardio(w.label) ? "ti-run" : "ti-barbell"} text-[10px]`}
                    style={{ color: w.status === "completed" ? "#22c55e" : "var(--brand-text-secondary)" }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ borderTop: "1px solid var(--brand-border)" }} className="pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--brand-text-secondary)" }}>{selLabel}</p>
        {selWorkouts.length === 0 ? (
          <p className="text-xs py-2" style={{ color: "var(--brand-text-secondary)" }}>Rest day — nothing scheduled.</p>
        ) : (
          <div className="space-y-2">
            {selWorkouts.map(w => (
              <div key={w.id} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <i className={`ti ${isCardio(w.label) ? "ti-run" : "ti-barbell"} text-base flex-shrink-0`}
                  style={{ color: w.status === "completed" ? "#22c55e" : "var(--brand-primary)" }} />
                <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: "var(--brand-text)" }}>{w.label}</span>
                {w.status === "completed" ? (
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: "#22c55e" }}>Done ✓</span>
                ) : isLocked(w.date) ? (
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}><i className="ti ti-lock" /> Locked</span>
                ) : (
                  <>
                    <Link href={`${basePath}/workout/${w.dayId}`} className="text-xs font-semibold flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Open</Link>
                    <button type="button" disabled={saving} onClick={() => { setMoving(w); setNotice(null); }}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg flex-shrink-0"
                      style={{ background: "var(--brand-primary)", color: "white", border: "none" }}>
                      Move →
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
