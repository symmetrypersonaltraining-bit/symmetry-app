"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extraConfirmFor, removalVerdict } from "@/lib/removeGuard";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isPeakWeekLocked } from "@/lib/peak-week";
import { moveScheduledWorkout } from "@/lib/moveWorkout";

export interface BoardWorkout {
  id: string;
  dayId: string;
  date: string;
  label: string;
  status: string;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// PEAK WEEK IS ONE PERSON'S, NOT EVERYONE'S.
//
// These two constants froze 2026-08-03 → 08-09 for EVERY client in the app.
// They are Dustin's own peak week — his shoot is Aug 9 — and they were written
// as a module-level constant, so every client on the roster opened their
// schedule to a padlock and "Peak Week" on every day of that range.
//
// Reported 2026-08-03, 5:17 AM, by Tyler Dorsett: "My workouts are locked and
// it won't let me access them." He was trying to train.
//
// Scoped to the trainer's own client row. A client can always move their own
// sessions; whoever needs a genuine freeze can get one that is stored per
// client rather than compiled in. The `lockedFor` prop makes the scope explicit
// at every call site instead of leaving it implicit in a constant nobody reads.
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


/**
 * ScheduleBoard — compact scrollable schedule board. ~5-7 days visible on mobile.
 * Reschedule two ways: (1) PRESS-AND-HOLD a workout tile (~250ms) then drag it
 * onto another day — the target day highlights; release to drop. (2) tap the
 * "Move" button on a tile to pick a date. Missed (past, not-yet-completed)
 * sessions also get a one-tap "→ Today". Both honor guardrails (no destination
 * more than 7 days back, Peak Week Aug 3-9 locked, never move completed;
 * a workout sitting on a past date is NOT locked — see 6e90c584). A move updates
 * scheduled_workouts + router.refresh() so every calendar reflects it (realtime
 * covers other devices). Additive/isolated.
 */
export default function ScheduleBoard({
  workouts: initial,
  basePath = "",
  forClient = "",
  ownerClientId = "",
  daysBack = 7,
  daysAhead = 20,
}: {
  workouts: BoardWorkout[];
  basePath?: string;
  forClient?: string;
  /**
   * Whose schedule this board is showing. Needed because `forClient` is only
   * set when a TRAINER is viewing someone else — on a client's own /workout
   * page it is empty, so it cannot answer "is this Dustin's board?". The Peak
   * Week freeze is scoped on this.
   */
  ownerClientId?: string;
  daysBack?: number;
  daysAhead?: number;
}) {
  const router = useRouter();
  const today = todayCT();
  // Workouts may be moved up to 7 days BACK (Dustin 2026-07-12); Peak Week + completed stay locked.
  const minMoveDate = addDays(today, -7);
  const [workouts, setWorkouts] = useState<BoardWorkout[]>(initial);
  const [overDate, setOverDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [movePick, setMovePick] = useState<{ id: string; label: string } | null>(null);
  const [pickDate, setPickDate] = useState<string>(today);
  // Only the person whose peak week it is sees the lock. Everyone else's
  // schedule behaves normally — which is what it should always have done.
  const isLockedDate = useCallback(
    (d: string) => isPeakWeekLocked(d, forClient || ownerClientId),
    [forClient, ownerClientId],
  );
  const [showPast, setShowPast] = useState(false);
  // Feedback 6e90c584: "ability to move past workouts forwards". A workout that
  // sits on a past date used to be frozen — no drag handle, no Move button — so
  // a session you missed on Tuesday was stuck on Tuesday forever. Only two
  // things should actually freeze a tile: it's already COMPLETED (history), or
  // it's Peak Week (locked by design). Being in the past just means you missed
  // it, and missing it is exactly when you need to move it.
  const missed = useMemo(
    () => workouts.filter((w) => w.date < today && w.status !== "completed" && !isLockedDate(w.date)),
    [workouts, today, isLockedDate],
  );
  // The past section used to auto-open whenever anything was missed, which meant
  // the board almost always opened onto last week rather than today — you had to
  // scroll down to find the day you were actually on. It stays collapsed now.
  // Missed sessions are not hidden by that: the toggle itself turns amber and
  // says how many there are and what to do with them, which is a louder signal
  // than an expanded list you have to scroll past.
  // Full workout library for swap-in (Dustin 7/13: clients can move/add/swap from full library)
  const [libDays, setLibDays] = useState<{ id: string; label: string }[] | null>(null);
  const [libQ, setLibQ] = useState("");
  useEffect(() => {
    if (!movePick || libDays) return;
    (async () => {
      try {
        const supabase: any = createClient();
        const { data } = await supabase.from("days").select("id, label").order("label").limit(400);
        setLibDays((data as { id: string; label: string }[]) || []);
      } catch { setLibDays([]); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movePick]);

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

  const upcomingDays = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i <= daysAhead; i++) out.push(addDays(today, i));
    return out;
  }, [today, daysAhead]);
  const pastDays = useMemo(() => {
    const out: string[] = [];
    for (let i = -daysBack; i <= -1; i++) out.push(addDays(today, i));
    return out;
  }, [today, daysBack]);

  function flash(msg: string) {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function moveWorkout(id: string, toDate: string | null) {
    if (!toDate) return;
    const w = workouts.find((x) => x.id === id);
    if (!w || w.date === toDate) return;
    if (toDate < minMoveDate) { flash("Can't move a workout more than 7 days back."); return; }
    if (isLockedDate(toDate) || isLockedDate(w.date)) { flash("Peak Week workouts are locked."); return; }
    setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: toDate } : x)));
    try {
      const supabase: any = createClient();
      // Shared with the day sheet (src/lib/moveWorkout.ts). It also carries
      // workout_logs.log_date, which this surface has been leaving behind since
      // completed workouts became movable — the streak and the consistency
      // calendar read log_date, so without it the app disagreed with itself
      // about which day the session happened on.
      const failure = await moveScheduledWorkout(supabase, { id }, toDate);
      if (failure) throw new Error(failure);
      flash("Moved ✓");
      router.refresh();
    } catch {
      setWorkouts((prev) => prev.map((x) => (x.id === id ? { ...x, date: w.date } : x)));
      flash("Couldn't move that workout. Try again.");
    }
  }

  // Replace a scheduled workout with a different day from the full library.
  // Only day_id changes; date/position/history untouched. Completed + Peak Week locked.
  async function replaceWorkout(id: string, day: { id: string; label: string }) {
    const w = workouts.find((x) => x.id === id);
    if (!w) return;
    if (isLockedDate(w.date)) { flash("Peak Week workouts are locked."); return; }
    if (w.status === "completed") { flash("Can't replace a completed workout."); return; }
    const prevLabel = w.label; const prevDayId = w.dayId;
    setWorkouts((p) => p.map((x) => (x.id === id ? { ...x, label: day.label, dayId: day.id } : x)));
    try {
      const supabase: any = createClient();
      const { error } = await supabase.from("scheduled_workouts").update({ day_id: day.id }).eq("id", id);
      if (error) throw error;
      flash("Swapped in ✓");
      router.refresh();
    } catch {
      setWorkouts((p) => p.map((x) => (x.id === id ? { ...x, label: prevLabel, dayId: prevDayId } : x)));
      flash("Couldn't swap that workout. Try again.");
    }
  }

  // Soft-remove: sets deleted_at so the workout disappears from every schedule
  // (all reads filter deleted_at IS NULL) but the row is preserved (reversible).
  async function removeWorkout(w: BoardWorkout) {
    if (isLockedDate(w.date)) { flash("Peak Week workouts are locked."); return; }
    if (typeof window !== "undefined" && !window.confirm(`Delete "${w.label}" from ${shortLabel(w.date)}? This just removes it — to keep it for another day, use Move instead. You can also re-add it later.`)) return;
    // A FINISHED session is not tidying, it is erasing training that happened.
    //
    // Dustin, 17 Aug: he deleted a stray third workout and his COMPLETED Upper
    // Push — 70 minutes, a real log behind it — is what disappeared. Whatever
    // routed the delete there, a completed session should never come off on a
    // single tap.
    const extra = extraConfirmFor({ id: w.id, label: w.label, date: w.date, status: w.status });
    if (extra && typeof window !== "undefined" && !window.confirm(extra)) return;
    setWorkouts((prev) => prev.filter((x) => x.id !== w.id));
    try {
      const supabase: any = createClient();
      // `.select("id")` is the guard, not decoration. The row is filtered off
      // the screen BEFORE this write, so a delete that hits a different row —
      // or no row — looks identical to one that worked, and the damage lands
      // somewhere nobody is looking. That is exactly how 17 Aug went unnoticed.
      const { data: gone, error } = await supabase
        .from("scheduled_workouts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", w.id)
        .select("id");
      if (error) throw error;
      const verdict = removalVerdict(w.id, ((gone as { id: string }[] | null) ?? []).map((r) => r.id));
      if (verdict) {
        setWorkouts((prev) => [...prev, w]);
        if (typeof window !== "undefined") window.alert(verdict);
        router.refresh();
        return;
      }
      flash("Removed");
      router.refresh();
    } catch {
      setWorkouts((prev) => [...prev, w]);
      flash("Couldn't remove. Try again.");
    }
  }

  // Swap: exchange the dates of two workouts on different days (switches both at once).
  async function swapWorkout(aId: string, b: BoardWorkout) {
    const a = workouts.find((x) => x.id === aId);
    if (!a || !b || a.id === b.id || a.date === b.date) return;
    if (isLockedDate(a.date) || isLockedDate(b.date)) { flash("Peak Week workouts are locked."); return; }
    const aDate = a.date, bDate = b.date;
    // Set when the rollback below could not put `a` back. It changes what the
    // catch is allowed to claim, and it stops the optimistic state being
    // reverted to a position the database no longer agrees with.
    let halfSwapped = false;
    setWorkouts((prev) => prev.map((x) => (x.id === a.id ? { ...x, date: bDate } : x.id === b.id ? { ...x, date: aDate } : x)));
    try {
      const supabase: any = createClient();
      // Both halves of a swap are moves, so both record where they came from.
      // moved_from_date is not only provenance: pg_cron jobid 18
      // (sync_supervised_workouts_to_appointments) leaves a row alone only
      // while it is set, so a swap that did not set it could be half-undone by
      // the job within hours — one session dragged back onto its appointment's
      // date and the other left where the swap put it.
      const r1 = await supabase.from("scheduled_workouts")
        .update({ scheduled_date: bDate, moved_from_date: aDate }).eq("id", a.id);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from("scheduled_workouts")
        .update({ scheduled_date: aDate, moved_from_date: bDate }).eq("id", b.id);
      // Compensating rollback, deliberately NOT setting moved_from_date: this
      // puts `a` back where it started, and stamping a move onto a swap that
      // did not happen would be a lie. The marker r1 already wrote is left in
      // place rather than blanked - it makes jobid 18 skip the row, which is
      // the safe direction to be wrong in.
      if (r2.error) {
        // The rollback is checked too. If it fails, "Couldn't swap" is no
        // longer true — `a` has moved and `b` has not — and the trainer needs
        // to hear that rather than a message telling them to try again.
        const back = await supabase.from("scheduled_workouts").update({ scheduled_date: aDate }).eq("id", a.id).select("id");
        if (back.error || !back.data || back.data.length === 0) halfSwapped = true;
        throw r2.error;
      }
      flash("Swapped ✓");
      router.refresh();
    } catch {
      if (halfSwapped) {
        // Do NOT revert the display. `a` really did move and the rollback
        // failed, so putting it back on screen would show a board that does
        // not exist. Refreshing is the only honest thing left.
        flash("Half-swapped — one moved, one did not. Refresh and check both days.");
        router.refresh();
        return;
      }
      setWorkouts((prev) => prev.map((x) => (x.id === a.id ? { ...x, date: aDate } : x.id === b.id ? { ...x, date: bDate } : x)));
      flash("Couldn't swap. Try again.");
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
    // Drag preview = a clone of the FULL workout card (enlarged) so it's clear
    // what's being moved, not just the name. Falls back to a text pill if the
    // clone ever fails (crash-safe).
    let g: HTMLElement;
    try {
      const src = d.tileEl as HTMLElement;
      const w = src.getBoundingClientRect().width;
      g = src.cloneNode(true) as HTMLElement;
      g.querySelectorAll("button").forEach((b) => { (b as HTMLElement).style.pointerEvents = "none"; });
      g.style.width = w + "px";
      g.style.margin = "0";
      g.style.background = "var(--brand-surface)";
      g.style.opacity = "0.97";
      g.style.transform = "scale(1.08) rotate(-1.5deg)";
      g.style.transformOrigin = "top left";
    } catch {
      g = document.createElement("div");
      g.textContent = d.label;
      g.style.background = "var(--brand-primary)";
      g.style.color = "#fff";
      g.style.fontWeight = "700";
      g.style.fontSize = "12.5px";
      g.style.padding = "8px 12px";
      g.style.maxWidth = "70vw";
      g.style.whiteSpace = "nowrap";
      g.style.overflow = "hidden";
      g.style.textOverflow = "ellipsis";
      g.style.transform = "rotate(-1.5deg)";
    }
    g.style.position = "fixed";
    g.style.zIndex = "9999";
    g.style.pointerEvents = "none";
    g.style.borderRadius = "10px";
    g.style.boxShadow = "0 14px 34px rgba(20,30,55,.34)";
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
    setOverDate(dt && !isLockedDate(dt) && dt >= minMoveDate ? dt : null);
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
      {pastDays.length > 0 && (
        <button
          onClick={() => setShowPast((s) => !s)}
          style={{
            width: "100%", marginBottom: 6, padding: "6px 10px", borderRadius: 10,
            border: !showPast && missed.length > 0 ? "1px solid #f59e0b" : "1px dashed var(--brand-border)",
            background: !showPast && missed.length > 0 ? "color-mix(in srgb, #f59e0b 12%, transparent)" : "transparent",
            color: !showPast && missed.length > 0 ? "#b45309" : "var(--brand-text-secondary)",
            fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          }}
        >
          {showPast
            ? "▴ Hide past workouts"
            : missed.length > 0
              ? "▾ " + missed.length + " missed workout" + (missed.length === 1 ? "" : "s") + " — move " + (missed.length === 1 ? "it" : "them") + " forward"
              : "▾ Show past workouts (" + pastDays.length + " days)"}
        </button>
      )}
      <div>
        {[...(showPast ? pastDays : []), ...upcomingDays].map((k) => {
          const isToday = k === today;
          const isPast = k < today;
          // 6e90c584: `locked` used to be `isPast || isLockedDate(k)`, which froze
          // every past tile — no drag handle, no Move, no Remove. A session you
          // missed on Tuesday was stuck on Tuesday forever, which is the one case
          // you MOST need to reschedule. Only Peak Week freezes a date now;
          // `isPast` stays purely cosmetic (the dimming and the "past" label).
          // The per-tile `movable` below still excludes completed workouts, so
          // history is never editable.
          const locked = isLockedDate(k);
          const items = byDate[k] || [];
          const empty = items.length === 0;
          const isOver = overDate === k;
          return (
            <div
              key={k}
              data-board-date={k}
              style={{
                border: isOver ? "1.5px solid var(--brand-primary)" : isToday ? "2.5px solid var(--brand-primary)" : "1px solid var(--brand-border)",
                borderRadius: 11,
                marginBottom: 6,
                background: isOver ? "color-mix(in srgb, var(--brand-primary) 10%, var(--brand-surface))" : "var(--brand-surface)",
                // Today was a 1px border in the same colour as every other
                // border — scrolling a month of days, nothing said "you are
                // here". A thicker ring, a shadow and a lift make it findable
                // without reading a single date.
                boxShadow: isToday && !isOver
                  ? "0 0 0 3px color-mix(in srgb, var(--brand-primary) 18%, transparent), 0 6px 18px rgba(0,0,0,.10)"
                  : undefined,
                transform: isToday && !isOver ? "scale(1.012)" : undefined,
                // Past days still read as "behind you" even though they're now
                // movable — the dimming is cosmetic, not a lock indicator.
                opacity: (locked || isPast) && !isOver ? 0.7 : 1,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: empty ? "6px 10px" : "5px 10px",
                  // The date row is now a coloured band in the active scheme
                  // rather than transparent. Reported while scrolling a month
                  // of Peak Week days: every block looked the same, so the days
                  // ran together and the date was the hardest thing on the card
                  // to find. A tinted band with a stronger rule under it does
                  // the separating, and it costs no vertical space.
                  //
                  // Derived from --brand-primary, so it is whatever scheme is
                  // active — and it deepens with the depth level like every
                  // other surface, instead of being a fixed colour that fights
                  // the theme.
                  borderBottom: empty
                    ? "none"
                    : "1.5px solid color-mix(in srgb, var(--brand-primary) 38%, var(--brand-border))",
                  background: isToday
                    ? "var(--brand-primary)"
                    : "color-mix(in srgb, var(--brand-primary) 15%, var(--brand-surface))",
                }}
              >
                <span style={{ fontWeight: 800, fontSize: isToday ? 12.5 : 12, letterSpacing: "-0.01em", color: isToday ? "#fff" : "var(--brand-text)" }}>
                  {shortLabel(k)}
                  {isToday ? <span style={{ color: "#fff", fontWeight: 900 }}> · TODAY</span> : null}
                </span>
                <span style={{ fontSize: 10.5, color: isToday ? "rgba(255,255,255,.85)" : "var(--brand-text-secondary)" }}>
                  {isLockedDate(k)
                    ? "🔒 Peak Week"
                    : empty
                      ? "Rest"
                      : isPast
                        ? items.some((w) => w.status !== "completed")
                          ? "missed"
                          : "past"
                        : ""}
                </span>
              </div>
              {!empty && (
                <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 5 }}>
                  {items.map((w) => {
                    const t = typeOf(w.label);
                    const done = w.status === "completed";
                    // `!done` used to be part of this, on the reasoning that a
                    // completed workout is history and history should not move.
                    // In practice a session gets logged on the wrong day often
                    // enough — logged today, actually trained yesterday — and
                    // there was no way to correct it from here at all. Moving a
                    // completed workout carries its log with it, so nothing is
                    // lost. Peak Week is still the only genuine freeze.
                    const movable = !locked;
                    // A missed session's overwhelmingly common fix is "do it
                    // today instead", so that gets a one-tap button rather than
                    // making Dustin open the Move sheet and pick a date. Hidden
                    // once today is already Peak Week (moveWorkout would refuse).
                    const canPullForward = movable && isPast && !isLockedDate(today);
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
                          flexWrap: "wrap",
                          gap: 7,
                          // Each workout gets a full ring in its own type
                          // colour, not just a left bar. On a day with a lift
                          // AND a cardio session the two tiles sat on
                          // near-identical backgrounds with a 1px neutral
                          // border, so they read as one block with two lines of
                          // text. The ring plus a tint of the same colour makes
                          // each session a discrete object at a glance, and the
                          // colour still says which kind it is.
                          background: `color-mix(in srgb, ${TYPE_COLOR[t]} 9%, var(--brand-surface))`,
                          border: `1.5px solid color-mix(in srgb, ${TYPE_COLOR[t]} 55%, transparent)`,
                          borderLeft: `5px solid ${TYPE_COLOR[t]}`,
                          borderRadius: 9,
                          padding: "7px 8px",
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
                        <span style={{ flex: 1, fontWeight: 600, fontSize: 12.5, color: "var(--brand-text)", lineHeight: 1.25, minWidth: 96, wordBreak: "break-word" }}>
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
                        {canPullForward ? (
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); moveWorkout(w.id, today); }}
                            title="Move this missed workout to today"
                            style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: "4px 9px", borderRadius: 8, border: "1px solid #f59e0b", background: "color-mix(in srgb, #f59e0b 14%, transparent)", color: "#b45309", cursor: "pointer" }}
                          >
                            → Today
                          </button>
                        ) : null}
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
              min={minMoveDate}
              onChange={(e) => setPickDate(e.target.value)}
              style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 15, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setMovePick(null)} style={{ flex: "0 0 auto", background: "transparent", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", borderRadius: 12, padding: "12px 16px", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
              <button
                onClick={() => { if (pickDate) { moveWorkout(movePick.id, pickDate); setMovePick(null); } }}
                disabled={isLockedDate(pickDate) || pickDate < minMoveDate}
                style={{ flex: 1, background: "var(--brand-primary)", color: "#fff", border: "none", borderRadius: 12, padding: 12, fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: isLockedDate(pickDate) || pickDate < minMoveDate ? 0.6 : 1 }}
              >
                Move here
              </button>
            </div>
            {(() => {
              const a = workouts.find((x) => x.id === movePick.id);
              const cands = workouts.filter((x) => a && x.id !== a.id && x.date !== a.date && x.date >= today && !isLockedDate(x.date) && x.status !== "completed").sort((p, q) => p.date.localeCompare(q.date));
              if (cands.length === 0) return null;
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-text-secondary)", marginBottom: 6 }}>Or swap with another day:</div>
                  <div style={{ maxHeight: 150, overflowY: "auto" }}>
                    {cands.map((x) => (
                      <button key={x.id} onClick={() => { swapWorkout(movePick.id, x); setMovePick(null); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", marginBottom: 5, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", cursor: "pointer", textAlign: "left" }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.label}</span>
                        <span style={{ fontSize: 11, color: "var(--brand-primary)", flexShrink: 0, fontWeight: 700 }}>⇄ {shortLabel(x.date)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {libDays && libDays.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--brand-text-secondary)", marginBottom: 6 }}>Or swap in a workout from the library:</div>
                <input value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search library..."
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 12.5, marginBottom: 6, fontFamily: "inherit", boxSizing: "border-box" }} />
                <div style={{ maxHeight: 150, overflowY: "auto" }}>
                  {libDays.filter((d) => !libQ.trim() || d.label.toLowerCase().includes(libQ.trim().toLowerCase())).slice(0, 40).map((d) => (
                    <button key={d.id} onClick={() => { replaceWorkout(movePick.id, d); setMovePick(null); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 10px", marginBottom: 5, borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", cursor: "pointer", textAlign: "left" }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{d.label}</span>
                      <span style={{ fontSize: 11, color: "var(--brand-primary)", flexShrink: 0, fontWeight: 700 }}>swap in</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
