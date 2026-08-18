"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import MicButton from "@/components/MicButton";
import { createClient } from "@/lib/supabase/client";
// Aliased: this file already has a local submitFeedback() handler, and the
// import silently shadowed it — the call below was recursing into itself.
import { submitFeedback as fileFeedback } from "@/lib/feedback";
import { routeTrainingNote } from "@/lib/trainingNoteRouting";
import { sendClientMessage } from "@/app/(app)/home/messageActions";
import Link from "next/link";
import OffPlanBanner from "@/components/OffPlanBanner";
import WeeklyBriefCard from "@/components/WeeklyBriefCard";
import CelebrationScreen from "@/components/CelebrationScreen";
import SetFeedback from "@/components/SetFeedback";
import WakeLock from "@/components/WakeLock";
import { fx } from "@/lib/fx";
import { isDraftStale } from "@/lib/workoutDraft";
import { useStableViewportHeight } from "@/lib/useStableViewportHeight";
import CoachChatSheet, { type CoachActions } from "@/app/(app)/nutrition/v3/CoachChatSheet";
import { findSlotToPullForward, type SlotCandidate } from "@/lib/pullForward";
import { pickExistingLog, type ExistingLog } from "@/lib/workoutLogLookup";
import { feetToMeters, metersToFeet } from "@/lib/distanceField";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { exerciseTitleSize } from "@/lib/exerciseTitleSize";
import { chooseCompletionTargets, completionVerdict, type CompletionCandidate } from "@/lib/completionTarget";
import AiBadge from "@/components/AiBadge";
import {
  newTimer, start as tStart, pause as tPause, setMode as tSetMode,
  displaySecs, isExpired, isRunning, outcomeOnStop,
  type SetTimerState, type SetTimerMode,
} from "@/lib/setTimer";

interface Exercise {
  id: string;
  name: string;
  modality?: string | null;
  muscle_group: string | null;
  equipment_required?: string[] | null;
  video_url?: string | null;
  /** ok | dead | error | null — see /api/cron/check-videos. */
  video_status?: string | null;
}

interface PrescribedExercise {
  tracked_fields?: string[] | null;
  /** The underlying movement. Without it persistFields' library-wide half was
   *  reading undefined off an `as any` cast and silently doing nothing. */
  exercise_id?: string | null;
  id: string;
  position: number;
  sets: number;
  volume_type: string;
  volume_value: string | null;
  unilateral: boolean;
  tempo: string | null;
  load_descriptor: string | null;
  cue: string | null;
  rest: string | null;
  superset_group: string | null;
  exercises: Exercise;
}

interface Section {
  id: string;
  internal_name: string;
  client_facing_name: string;
  position: number;
  prescribed_exercises: PrescribedExercise[];
}

interface Props {
  day: { id: string; label: string; notes?: string | null };
  phase: { id: string; label: string };
  program: { id: string; name: string };
  sections: Section[];
  clientId: string | null;
  clientName?: string | null;
  isTrainerSession?: boolean;
  existingLogId: string | null;
  existingSetLogs: any[];
  /** The scheduled_workouts row this session came from, when it was on the calendar. */
  scheduledWorkoutId?: string | null;
  /**
   * The DATE this session belongs to — the scheduled date for a make-up, today
   * otherwise. Everything that used to ask the clock asks this instead.
   * Madeleine Coker, 8/6: "Trying to log my cardio for yesterday and it keeps
   * completing my cardio for today instead."
   */
  sessionDate: string;
}

// `distance` is in FEET on screen; src/lib/distanceField.ts converts to the
// metres the column stores. See the note there before changing units.
type SetData = { weight: string; reps: string; time: string; speed: string; hr: string; distance: string; done: boolean };
type HistoryEntry = { log_date: string; sets: { set_number: number; weight_lbs: number | null; reps: number | null }[] };

// \u2500\u2500\u2500 iOS SCROLL-WHEEL TIMER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function WheelColumn({ values, selected, onChange }: {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ITEM_H = 56;
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = selected * ITEM_H;
  }, []); // eslint-disable-line

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const idx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      onChange(values[clamped]);
    }, 80);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height: `${ITEM_H * 3}px`,
        overflowY: "scroll",
        scrollSnapType: "y mandatory",
        WebkitOverflowScrolling: "touch" as any,
        scrollbarWidth: "none" as any,
        msOverflowStyle: "none" as any,
        position: "relative",
      }}
    >
      <div style={{ height: ITEM_H }} />
      {values.map((v) => {
        const isSel = v === selected;
        return (
          <div
            key={v}
            style={{
              height: `${ITEM_H}px`,
              scrollSnapAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: isSel ? "2.25rem" : "1.5rem",
              fontWeight: isSel ? "800" : "400",
              color: isSel ? "var(--brand-primary)" : "var(--brand-text-secondary)",
              transition: "font-size 0.15s, color 0.15s",
              userSelect: "none",
              lineHeight: 1,
            }}
          >
            {String(v).padStart(2, "0")}
          </div>
        );
      })}
      <div style={{ height: ITEM_H }} />
    </div>
  );
}

// THE DETACHED STOPWATCH IS GONE.
//
// TimerWheel used to live here: a full-screen timer/stopwatch opened by a clock
// button in the header. It worked, and it was still the wrong shape — it had no
// idea which set you were on, so the number it produced had to be carried back
// to the right row in your head, and typed in by hand.
//
// Dustin, 12 Aug: "for timer lets have it function from where you set the
// actual time. that way we can get rid of the timer button at the top."
//
// Replaced by the per-set timer in the set rows below (src/lib/setTimer.ts).
// WheelColumn is kept — TimePickerSheet still uses it to set a set's time.

// \u2500\u2500\u2500 EXERCISE HISTORY DRAWER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
/** Nothing in the logger can execute a meal action, and none of these run. */
const NO_COACH_ACTIONS: CoachActions = {
  swapMealCustom: async () => {},
  moveMeal: async () => {},
  copyMeal: async () => {},
  deleteMeal: async () => {},
  addExtraParsed: async () => {},
  logMeal: async () => {},
  unlogMeal: async () => {},
};

function ExerciseHistory({ exerciseId, exId, clientId, exerciseName, onClose, onPrefill }: {
  exerciseId: string;
  exId?: string | null;
  clientId?: string | null;
  exerciseName: string;
  onClose: () => void;
  onPrefill?: (weight: string, reps: string) => void;
}) {
  const supabase = createClient();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // History is keyed by the underlying MOVEMENT (exercise_id) so it survives
      // program rebuilds; falls back to the prescription id for legacy rows.
      let q = supabase
        .from("set_logs")
        .select("set_number, weight_lbs, reps, workout_logs(log_date)")
        .eq("completed", true);
      q = exId ? q.eq("exercise_id", exId) : q.eq("prescribed_exercise_id", exerciseId);
      if (clientId) q = q.eq("client_id", clientId);
      const { data } = await q
        .order("logged_at", { ascending: false })
        .limit(500);

      if (data) {
        const grouped: Record<string, HistoryEntry> = {};
        for (const row of data as any[]) {
          const date = row.workout_logs?.log_date || "unknown";
          if (!grouped[date]) grouped[date] = { log_date: date, sets: [] };
          grouped[date].sets.push({ set_number: row.set_number, weight_lbs: row.weight_lbs, reps: row.reps });
        }
        setHistory(Object.values(grouped)); // full history — scrolls (no session cap)
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, exId, clientId]);

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const lastSession = history[0];
  const lastWeight = lastSession?.sets?.[0]?.weight_lbs;
  const lastReps = lastSession?.sets?.[0]?.reps;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl flex flex-col"
        style={{ background: "var(--brand-surface)", maxHeight: "85dvh", paddingBottom: "env(safe-area-inset-bottom)" }} onClick={e => e.stopPropagation()}>
        {/* Fixed header */}
        <div className="p-5 pb-3 flex-shrink-0">
          <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>History{history.length > 0 ? ` · ${history.length} sessions` : ""}</p>
              <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>{exerciseName}</h3>
            </div>
            <div className="flex items-center gap-2">
              {onPrefill && lastWeight != null && (
                <button onClick={() => { onPrefill(String(lastWeight), String(lastReps ?? "")); onClose(); }}
                  className="text-xs px-3 py-1.5 rounded-full font-semibold"
                  style={{ background: "var(--brand-primary)", color: "white" }}>
                  Use last
                </button>
              )}
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "var(--brand-card)" }}>
                <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
              </button>
            </div>
          </div>
        </div>
        {/* Scrollable list \u2014 shows the FULL dated history, scrolls as far back as it goes */}
        <div className="px-5 pb-8 overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: "touch" as any, overscrollBehavior: "contain" }}>
          {loading ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading{'\u2026'}</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center">
              <i className="ti ti-history text-3xl block mb-2" style={{ color: "var(--brand-text-secondary)" }} />
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No history yet for this exercise</p>
            </div>
          ) : history.map((entry, i) => (
            <div key={i} className="mb-4 rounded-xl p-4"
              style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--brand-primary)" }}>
                {i === 0 ? "Most Recent \u00b7 " : ""}{fmtDate(entry.log_date)}
              </p>
              {entry.sets.sort((a, b) => a.set_number - b.set_number).map(s => (
                <div key={s.set_number} className="flex items-center gap-3 py-1 text-sm">
                  <span className="w-6 text-xs" style={{ color: "var(--brand-text-secondary)" }}>S{s.set_number}</span>
                  <span className="font-medium" style={{ color: "var(--brand-text)" }}>
                    {s.weight_lbs ? `${s.weight_lbs} lb` : "BW"}
                  </span>
                  <span style={{ color: "var(--brand-text-secondary)" }}>{'\u00d7'}</span>
                  <span style={{ color: "var(--brand-text)" }}>{s.reps ?? "\u2014"} reps</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 REST TIMER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) { onDone(); return; }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onDone]);
  const pct = ((seconds - remaining) / seconds) * 100;
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return (
    <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}>
      <p className="text-white/50 text-sm mb-6 uppercase tracking-widest">Rest</p>
      <div className="relative w-40 h-40 mb-6">
        <svg width="160" height="160" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6"/>
          <circle cx="80" cy="80" r="70" fill="none" stroke="var(--brand-primary)" strokeWidth="6"
            strokeDasharray={`${2*Math.PI*70}`}
            strokeDashoffset={`${2*Math.PI*70*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 80 80)"
            style={{ transition: "stroke-dashoffset 1s linear" }}/>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold text-white tabular-nums">{m}:{s.toString().padStart(2,"0")}</span>
        </div>
      </div>
      <button onClick={onDone}
        className="px-8 py-3 rounded-full text-sm font-semibold text-white border border-white/20"
        style={{ background: "rgba(255,255,255,0.1)" }}>
        Skip Rest
      </button>
    </div>
  );
}


function SwapModal({ pe, onClose, onSwap }: { pe: PrescribedExercise; onClose: () => void; onSwap: (exercise: Exercise) => Promise<void> }) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!query.trim()) { setResults([]); return; }
      setLoading(true);
      // EVERY WORD, anywhere in the name — not the whole phrase as one blob.
      //
      // Dustin, 10 Aug, mid-session: tried to swap a lying leg curl for the
      // seated leg curl machine and the search found nothing. That machine had
      // been in the library since 14 July, as "Seated Hamstring Curl Machine".
      // Same day: "add box bridge and ball bridge" — both already existed, as
      // "Box Glute Bridge" and "Ball Glute Bridge". A single %box bridge%
      // matches NEITHER of those, because "Glute" sits between the two words.
      //
      // Three "it's missing, add it" reports in one day, all the same cause: a
      // library whose names carry an extra word in the middle, searched as one
      // literal string. Matching each word independently finds all three, and
      // stops him re-adding movements he already has.
      let q = supabase
        .from("exercises")
        .select("id, name, modality, muscle_group, equipment_required, video_url, video_status")
        .is("client_owner_id", null);
      for (const token of query.trim().split(/\s+/).slice(0, 6)) {
        q = q.ilike("name", `%${token}%`);
      }
      const { data } = await q.limit(30);
      setResults(data || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-[1000] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 max-h-[80vh] flex flex-col"
        style={{ background: "var(--brand-surface)", paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>Swap Exercise</p>
            <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>{pe.exercises?.name}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--brand-card)" }}>
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
        <div className="relative mb-4">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search exercises..."
            className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <p className="text-center text-sm py-6" style={{ color: "var(--brand-text-secondary)" }}>Searching...</p>}
          {!loading && query && results.length === 0 && (
            <p className="text-center text-sm py-6" style={{ color: "var(--brand-text-secondary)" }}>No exercises found</p>
          )}
          {!query && (
            <p className="text-center text-sm py-6" style={{ color: "var(--brand-text-secondary)" }}>Type to search the exercise library</p>
          )}
          {results.map(ex => (
            <button key={ex.id} disabled={swapping}
              onClick={async () => { setSwapping(true); await onSwap(ex); setSwapping(false); }}
              className="w-full text-left flex items-center gap-3 p-3 rounded-xl mb-2 transition-all active:opacity-70"
              style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-surface)" }}>
                <i className="ti ti-barbell text-sm" style={{ color: "var(--brand-primary)" }} />
              </div>
              <div className="flex-1 min-w-0">
                {/* Same complaint, one screen along: this is the swap picker
                    reached from the logger, and `truncate` meant choosing a
                    movement you could not fully read. The row is nearly full
                    width, so almost every name already fitted on one line and
                    only the long ones wrap — the list does not visibly change
                    for the movements he programs most. */}
                <p className="font-semibold text-sm" style={{ color: "var(--brand-text)", overflowWrap: "anywhere" }}>{ex.name}</p>
                {ex.muscle_group && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{ex.muscle_group}</p>
                )}
              </div>
              {swapping
                ? <span className="text-xs flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Saving...</span>
                : <i className="ti ti-arrow-right text-sm flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }} />
              }
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 MAIN COMPONENT \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function fmtSecs(total: number): string {
  const m = Math.floor(total / 60);
  const sec = Math.round(total % 60);
  return sec ? `${m}:${String(sec).padStart(2, "0")}` : String(m);
}

function parseTimeToSecs(t: string): number | null {
  if (!t) return null;
  if (t.includes(":")) {
    const [mm, ss] = t.split(":");
    return (parseInt(mm) || 0) * 60 + (parseInt(ss) || 0);
  }
  return Math.round((parseFloat(t) || 0) * 60);
}

function TimePickerSheet({ initial, onSet, onClose }: { initial: number; onSet: (secs: number) => void; onClose: () => void }) {
  const [m, setM] = useState(Math.min(59, Math.floor(initial / 60)));
  const [sec, setSec] = useState(Math.round(initial % 60));
  const mins = Array.from({ length: 60 }, (_, i) => i);
  const secs = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className="fixed inset-0 z-[1000] flex items-end" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", paddingBottom: "calc(40px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <p className="text-center text-xs uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>Set Time</p>
        <div className="relative flex items-center justify-center gap-4 mb-4" style={{ userSelect: "none" }}>
          <div className="absolute left-0 right-0 pointer-events-none rounded-xl"
            style={{ top: "50%", transform: "translateY(-50%)", height: 56, background: "var(--brand-primary)", opacity: 0.1, zIndex: 1 }} />
          <div style={{ flex: 1 }}>
            <p className="text-center text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>MIN</p>
            <WheelColumn values={mins} selected={m} onChange={setM} />
          </div>
          <div className="text-3xl font-bold" style={{ color: "var(--brand-text-secondary)", zIndex: 2 }}>:</div>
          <div style={{ flex: 1 }}>
            <p className="text-center text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>SEC</p>
            <WheelColumn values={secs} selected={sec} onChange={setSec} />
          </div>
        </div>
        <button onClick={() => onSet(m * 60 + sec)}
          className="w-full h-12 rounded-2xl font-bold text-white text-sm" style={{ background: "var(--brand-primary)" }}>
          Set Time
        </button>
      </div>
    </div>
  );
}

const SIDE_NAME_RE = /single[\s-]?(arm|leg)|one[\s-]?(arm|leg)|1[\s-]?(arm|leg)|\bunilateral\b|each side|split squat|\bpistol\b|bulgarian|\blunges?\b|step[\s-]?up/i;
const TIMED_NAME_RE = /plank|\bhold\b|stretch|foam roll|lacrosse ball|dead hang|wall sit|\bcarry\b|treadmill|\bbike\b|rower|elliptical|stair/i;
// Movements loaded by bodyweight (or a band) that should default to REPS ONLY
// — never a weight box. Now covers the corrective/activation menu (bridges,
// hinges, clamshells, pelvic tilts, wall slides, quadruped drills) that Dustin
// was having to re-set to reps by hand on every prescription.
const BW_NAME_RE = /push[\s-]?up|pull[\s-]?up|chin[\s-]?up|\bdips?\b|bird ?dog|dead ?bug|air squat|body ?weight|\bbw\b|\bband\b|mini[- ]?band|mobility|superman|inchworm|bear crawl|bridge|hip hinge|clam ?shell|pelvic tilt|wall slide|wall angel|glute march|fire hydrant|donkey kick|hollow|sit[\s-]?up|leg raise|scapular|cat[\s-]?cow|thoracic rotation|ankle rock|activation/i;
// A weight-bearing movement whose NAME matches BW_NAME_RE anyway (e.g.
// "Barbell Hip Bridge", "Dumbbell Hip Hinge") must keep its weight box.
const LOADED_NAME_RE = /barbell|dumbbell|\bdb\b|\bbb\b|kettlebell|\bkb\b|cable|machine|smith|plate|weighted|loaded|trap bar|landmine/i;

// THREE LEVELS, most specific first (2026-08-04). Dustin: "the app needs to
// have preset defaults for movements but still able to toggle change them."
//
//   1. tracked_fields on THIS prescription — somebody chose it here
//   2. default_tracked_fields on the MOVEMENT — the trainer's library default
//   3. the name/modality heuristic below — last resort
//
// Level 2 is the new one, and it is why a fix stops coming back: set Kettlebell
// Swing to weight+reps once and every future program inherits it, instead of
// re-running a guess that got Walking Lunge wrong for a month.
function defaultTrackedFields(pe: any): string[] {
  const raw = pe?.tracked_fields;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((f: string) => (f === "duration" ? "time" : f));
  }
  const lib = pe?.exercises?.default_tracked_fields;
  if (Array.isArray(lib) && lib.length > 0) {
    return lib.map((f: string) => (f === "duration" ? "time" : f));
  }
  const nm = String(pe?.exercises?.name || "");
  const eachSide = pe?.unilateral === true || SIDE_NAME_RE.test(nm);
  let base: string[];
  if (pe?.volume_type === "duration") base = ["time"];
  else if (TIMED_NAME_RE.test(nm)) base = ["time"];
  else if (BW_NAME_RE.test(nm) && !LOADED_NAME_RE.test(nm)) base = ["reps"];
  else base = ["weight", "reps"];
  return eachSide ? [...base, "each_side"] : base;
}

// Reps that should ALWAYS prefill from the day's programmed target (editable).
// Parses the first integer out of volume_value for rep-based movements so a
// programmed set never shows a blank rep box. Timed/distance movements stay blank.
function programmedReps(pe: any): string {
  const vt = pe?.volume_type;
  if (vt === "reps" || vt === "rep_range") {
    const m = String(pe?.volume_value ?? "").match(/\d+/);
    return m ? m[0] : "";
  }
  return "";
}

// Timed movements (foam rolling, stretches, holds) ALWAYS prefill the time field from the
// programmed duration so a duration set never shows blank. Parses "1 min", "1 min each side",
// "45 sec", "90 sec", "30s", "2 min" -> seconds -> the app's time format (e.g. "1" = 1:00).
function programmedTimeSecs(pe: any): number | null {
  const v = String(pe?.volume_value ?? "").toLowerCase();
  if (!v) return null;
  let m = v.match(/(\d+(?:\.\d+)?)\s*min/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = v.match(/(\d+)\s*(?:sec|s\b)/);
  if (m) return parseInt(m[1], 10);
  return null;
}
function programmedTime(pe: any): string {
  const vt = pe?.volume_type;
  if (vt !== "duration" && !/min|sec/i.test(String(pe?.volume_value ?? ""))) return "";
  const s = programmedTimeSecs(pe);
  return s != null ? fmtSecs(s) : "";
}

// Dumbbell/kettlebell or unilateral movements => weight is entered PER HAND, not total.
const DB_NAME_RE = /\bdumbbell\b|\bdb\b|\bkettlebell\b|\bkb\b|goblet/i;
function isPerHandLoad(pe: any): boolean {
  const nm = String(pe?.exercises?.name || "");
  const equip = (pe?.exercises?.equipment_required || []).join(" ").toLowerCase();
  const dbHeld = DB_NAME_RE.test(nm) || /dumbbell|kettlebell/.test(equip);
  const uni = pe?.unilateral === true || SIDE_NAME_RE.test(nm);
  return dbHeld || uni;
}

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?#]+)/);
  const id = m ? m[1] : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 960 }}>
        {id ? (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", background: "#000" }}>
            <iframe
              src={"https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0&playsinline=1"}
              title="Exercise demo"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div style={{ background: "var(--brand-surface)", borderRadius: 12, padding: 20, textAlign: "center" }}>
            <p style={{ color: "var(--brand-text)", marginBottom: 12, fontSize: 14 }}>No in-app demo set for this exercise yet.</p>
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: "#60a5fa", fontWeight: 600, fontSize: 14 }}>Find one on YouTube</a>
          </div>
        )}
        <button onClick={onClose} type="button" style={{ marginTop: 12, width: "100%", padding: 11, borderRadius: 10, background: "rgba(255,255,255,0.15)", color: "white", border: "none", fontWeight: 600, cursor: "pointer" }}>Close</button>
      </div>
    </div>
  );
}

export default function WorkoutLogger({
  day, phase, program, sections, clientId, clientName, isTrainerSession,
  existingLogId, existingSetLogs, scheduledWorkoutId, sessionDate,
}: Props) {
  const supabase = createClient();

  const buildInitialSets = (): Record<string, SetData[]> => {
    const result: Record<string, SetData[]> = {};
    for (const section of sections) {
      for (const pe of section.prescribed_exercises) {
        const logs = existingSetLogs.filter(sl => sl.prescribed_exercise_id === pe.id);
        result[pe.id] = Array.from({ length: (pe.sets || 3) }, (_, i) => {
          const ex = logs.find(l => l.set_number === i + 1);
          return { weight: ex?.weight_lbs?.toString() || "", reps: (ex?.reps != null ? ex.reps.toString() : programmedReps(pe)), time: ex?.duration_seconds != null ? fmtSecs(ex.duration_seconds) : programmedTime(pe), speed: ex?.speed != null ? String(ex.speed) : "", hr: ex?.heart_rate != null ? String(ex.heart_rate) : "", distance: metersToFeet(ex?.distance_meters), done: ex?.completed ?? false };
        });
      }
    }
    return result;
  };

  const [sets, setSets] = useState<Record<string, SetData[]>>(buildInitialSets);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(existingLogId);
  const [saving, setSaving] = useState(false);
  const [activeSectionIdx, setActiveSectionIdx] = useState(0);
  const [activeExerciseIdx, setActiveExerciseIdx] = useState(0);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const [sessionCancelled, setSessionCancelled] = useState(false);
  const [timePick, setTimePick] = useState<{ peId: string; si: number } | null>(null);
  const [sessionMode, setSessionMode] = useState(false);
  // The height this screen had before any keyboard opened. The session view is
  // pinned to it so the soft keyboard cannot reflow the layout — it covers the
  // bottom instead. Unconditional, like every hook must be.
  const stableH = useStableViewportHeight();
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fieldCfg, setFieldCfg] = useState<Record<string, string[]>>({});
  const [historyExercise, setHistoryExercise] = useState<{ id: string; exId?: string | null; name: string } | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  // ─── PER-SET TIMER ────────────────────────────────────────────────────────
  // Dustin, 12 Aug: "movements that track time you set timer or stop watch
  // right there where you log it, hit start, when time is up it logs as
  // complete." This replaces the clock button that used to sit in the header
  // and open a stopwatch with no idea which set you were on.
  //
  // Two pieces of state. `setTimers` is per SET, keyed `${peId}:${si}`.
  // `movementTimerMode` is per MOVEMENT, because the switch sits above the
  // sets and flips the whole exercise (13 Aug: "1 — switch above the sets").
  //
  // Neither of them measures the keyboard, moves the view, or changes the size
  // of anything — see tests/unit/loggerLayout.test.ts for why that matters on
  // this screen specifically.
  const [setTimers, setSetTimers] = useState<Record<string, SetTimerState>>({});
  const [movementTimerMode, setMovementTimerMode] = useState<Record<string, SetTimerMode>>({});
  // Bumped by the repaint interval. The DISPLAYED time is derived from the wall
  // clock, never from a count of ticks, so this only has to force a render — a
  // beat missed while the phone is asleep cannot make the number wrong.
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const [trainerNoteText, setTrainerNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  // Per-exercise notes (client or trainer flags an issue with THIS movement).
  const [exNoteText, setExNoteText] = useState("");
  const [savingExNote, setSavingExNote] = useState(false);
  const [exNoteSaved, setExNoteSaved] = useState(false);
  const [exNotePrior, setExNotePrior] = useState<{ id: string; note: string; author: string; created_at: string }[]>([]);
  const [localSections, setLocalSections] = useState<Section[]>(sections);
  const [swapTargetPe, setSwapTargetPe] = useState<PrescribedExercise | null>(null);
  // The coach, opened from the exercise header. See the button for why it is
  // not the floating one used on every other screen.
  const [coachOpen, setCoachOpen] = useState(false);
  // V6 consolidated logger: feedback sheet (both roles) → app_feedback; AI note sheet
  // (trainer only) → trainer_notes; cue collapsed behind an ⓘ toggle to shorten the header.
  //
  // NO AI ASSISTANT IN HERE, ON PURPOSE. Session mode covers the screen at
  // z-999, so HeaderAssist — and with it the assistant — is unreachable
  // mid-workout. That reads like an oversight and it is not one.
  //
  //   Dustin, 2026-08-04: "dont put ai assistant in logger there no reason fir
  //   clients to need it there"
  //
  // A client mid-set needs the weight box, the check button and a way to flag a
  // problem. That is what is here. An audit will keep surfacing this as a gap
  // (it did on 8/4, off the back of Todd's "keep ai assistant/feedback full
  // movable block" from 6/26) — it is a decision, not a bug. The flag button
  // below is the deliberate exception: reporting something broken has to work
  // from the screen it broke on.
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbSent, setFbSent] = useState(false);
  const [fbSending, setFbSending] = useState(false);
  const [showAiNote, setShowAiNote] = useState(false);
  const [trainerListening, setTrainerListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showCue, setShowCue] = useState(false);
  // Notes are typed in a sheet, not in the card — see the note at the card.
  const [noteSheetOpen, setNoteSheetOpen] = useState(false);

  // ── NO KEYBOARD-CONDITIONED LAYOUT. READ THIS BEFORE ADDING ANY. ──────────
  //
  // Deleted here on 8/1, for the SECOND time (4cb50a1 removed the same code in
  // July; a concurrent branch put it back, which 457328e had already warned
  // about happening):
  //
  //   • a visualViewport resize/scroll listener storing a `kbVV` object
  //   • a `typing` flag whose setter was never called, so the recovery poll,
  //     the touch-device guard and the innerHeight baseline were all dead code
  //   • an effect keyed on those that ran
  //     scrollIntoView({ block: "start", behavior: "smooth" }) on the focused
  //     input 90ms after the keyboard opened
  //
  // The listener stored a NEW object every visual-viewport scroll event, so it
  // re-triggered itself: scroll -> new kbVV -> smooth scrollIntoView -> scroll.
  // A scroll fight for as long as the keyboard was up, and the direct cause of
  // "the screen moves when I open the keyboard".
  //
  // The keyboard is handled ONE way now, and it is structural: the session view
  // is pinned to the tallest viewport height seen (useStableViewportHeight), so
  // the keyboard cannot resize or reflow anything — it just covers the notes,
  // footer and tabs at the bottom. The set rows are pinned above all of that
  // and never move. Nothing needs to react to the keyboard, and
  // tests/unit/loggerLayout.test.ts fails the build if anything starts to.
  //
  // focusScroll / focusBlur stay as inert handlers so no input call site has to
  // change; they only track which input has focus.
  const focusedInputRef = useRef<HTMLInputElement | null>(null);
  const focusScroll = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    focusedInputRef.current = e.currentTarget;
  }, []);
  const focusBlur = useCallback(() => {
    focusedInputRef.current = null;
  }, []);

  // --- Auto-save / resume draft: persists logged sets so leaving the browser never loses progress ---
  const __draftKey = `symmetry_wl_${clientId || 'me'}_${day?.id || 'day'}_${isTrainerSession ? 't' : 'c'}`;
  // The same physical workout (same client + day) can be entered two ways — a trainer
  // opening their own profile directly vs. resuming via the "in progress" dock (which adds
  // ?forClient=…). Those two paths compute a different t/c suffix, so a draft saved under one
  // could never be found (or cancelled) under the other. Always operate on BOTH suffixes.
  const __draftKeys = () => {
    const id = clientId || 'me';
    const d = day?.id || 'day';
    return [`symmetry_wl_${id}_${d}_t`, `symmetry_wl_${id}_${d}_c`];
  };
  const __clearDraft = () => {
    try { for (const k of __draftKeys()) window.localStorage.removeItem(k); } catch (e) {}
  };
  const __hydrated = useRef(false);
  const __snapshot = () => ({ sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, savedAt: Date.now() });
  useEffect(() => {
    try {
      let raw = typeof window !== 'undefined' ? window.localStorage.getItem(__draftKey) : null;
      // If nothing under the exact key, adopt a live draft saved under the sibling suffix
      // (from the other entry path) and migrate it here so there's only ever one copy.
      if (!raw && typeof window !== 'undefined') {
        for (const k of __draftKeys()) {
          if (k === __draftKey) continue;
          const r2 = window.localStorage.getItem(k);
          if (!r2) continue;
          try {
            const d2 = JSON.parse(r2);
            // Same staleness rule as below — never adopt a dead sibling draft as "live".
            if (d2 && d2.sessionMode === true && !isDraftStale(d2.savedAt)) { raw = r2; window.localStorage.removeItem(k); break; }
          } catch (e2) {}
        }
      }
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          if (d.sets && Object.keys(d.sets).length) {
            // Merge the saved draft ONTO the freshly prescribed-prefilled sets instead of
            // replacing them. A completed set is real logged data (kept as-is); every other
            // set falls back to the prescribed prefill where the draft is blank — so a stale
            // or blank draft can never wipe the prescribed reps (self-heals old blank drafts).
            const draft = d.sets as Record<string, SetData[]>;
            setSets(prev => {
              const merged: Record<string, SetData[]> = { ...prev };
              for (const peId of Object.keys(prev)) {
                const draftArr = draft[peId];
                if (!Array.isArray(draftArr)) continue;
                merged[peId] = prev[peId].map((base, i) => {
                  const dr = draftArr[i];
                  if (!dr) return base;
                  if (dr.done) return dr;
                  return {
                    weight: dr.weight || base.weight,
                    reps: dr.reps || base.reps,
                    time: dr.time || base.time,
                    speed: dr.speed || base.speed,
                    distance: dr.distance || base.distance,
                    hr: dr.hr || base.hr,
                    done: false,
                  };
                });
                if (draftArr.length > prev[peId].length) {
                  merged[peId] = merged[peId].concat(draftArr.slice(prev[peId].length));
                }
              }
              for (const peId of Object.keys(draft)) {
                if (!merged[peId]) merged[peId] = draft[peId];
              }
              return merged;
            });
          }
          if (typeof d.activeSectionIdx === 'number') setActiveSectionIdx(d.activeSectionIdx);
          if (typeof d.activeExerciseIdx === 'number') setActiveExerciseIdx(d.activeExerciseIdx);
          // Only a FRESH draft may restore the full-screen session lock. SessionDock already
          // treats a draft older than 8h as dead and stops offering it; hydration used to
          // ignore age entirely, so a stale draft slammed the client straight back into the
          // session view on every launch — closing and reopening the app could not clear it.
          // Past the window the sets and notes still come back (nothing is lost), but the
          // client lands on the overview and taps "Session" to go back in by choice.
          if (d.sessionMode === true && !isDraftStale(d.savedAt)) setSessionMode(true);
          if (typeof d.sessionNote === 'string') setSessionNote(d.sessionNote);
          if (d.workoutLogId) setWorkoutLogId(d.workoutLogId);
        }
      }
    } catch (e) {}
    __hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!__hydrated.current) return;
    try {
      if (workoutComplete || sessionCancelled) { __clearDraft(); return; }
      window.localStorage.setItem(__draftKey, JSON.stringify(__snapshot()));
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, workoutComplete, sessionCancelled]);
  useEffect(() => {
    const flush = () => {
      if (!__hydrated.current || workoutComplete || sessionCancelled) return;
      try { window.localStorage.setItem(__draftKey, JSON.stringify(__snapshot())); } catch (e) {}
    };
    const onVis = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') flush(); };
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('beforeunload', flush);
      window.addEventListener('pagehide', flush);
    }
    return () => {
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('beforeunload', flush);
        window.removeEventListener('pagehide', flush);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, workoutComplete, sessionCancelled]);
  // --- end auto-save ---

  // Hardware/browser BACK while in the focused logger: exit session mode back to
  // the overview instead of leaving the page or the app.
  //
  // The cleanup matters as much as the setup, and it was missing. Entering
  // session mode pushes a history entry; leaving by ANY route other than Back
  // — Cancel, Complete, the swipe — left that entry sitting there as the
  // current one. So back on the workout overview afterwards just popped our own
  // dead entry: same URL, same render, nothing visibly happened. Press it twice
  // and it worked. That is "the back button only works on some screens".
  //
  // Every entry into session mode leaked one, so the count grew with use.
  useEffect(() => {
    if (!sessionMode) return;
    let poppedByBack = false;
    try { window.history.pushState({ __wl: 1 }, ""); } catch { /* noop */ }
    const onPop = () => { poppedByBack = true; setSessionMode(false); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Back already consumed the entry; calling back() again would eat a real
      // one and skip the user past a page they never asked to leave.
      if (poppedByBack) return;
      try {
        const st = window.history.state as { __wl?: number } | null;
        if (st && st.__wl) window.history.back();
      } catch { /* noop */ }
    };
  }, [sessionMode]);

  const allFlat = localSections.flatMap(s => s.prescribed_exercises);
  const totalSets = Object.values(sets).reduce((a, arr) => a + arr.length, 0);
  const doneSets = Object.values(sets).reduce((a, arr) => a + arr.filter(s => s.done).length, 0);
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const currentSection = localSections[activeSectionIdx];
  const currentExercise = currentSection?.prescribed_exercises[activeExerciseIdx];
  // Load prior notes for THIS movement so client + trainer see what was flagged before,
  // keyed on exercise_id like set-log history. Isolated; revert = remove this block.
  const __exNoteExId = currentExercise?.exercises?.id;
  useEffect(() => {
    let on = true;
    setExNoteText(""); setExNoteSaved(false);
    if (!__exNoteExId || !clientId) { setExNotePrior([]); return; }
    (async () => {
      try {
        const { data } = await supabase.from("exercise_notes")
          .select("id, note, author, created_at")
          .eq("client_id", clientId).eq("exercise_id", __exNoteExId)
          .order("created_at", { ascending: false }).limit(5);
        if (on) setExNotePrior((data as unknown as { id: string; note: string; author: string; created_at: string }[]) || []);
      } catch { if (on) setExNotePrior([]); }
    })();
    return () => { on = false; };
  }, [__exNoteExId, clientId]);
  // Cardio = true conditioning work (treadmill, ropes, stair master, etc.). A duration-based
  // stretch or mobility hold is NOT cardio — keying off volume_type wrongly locked every timed
  // stretch to Time/Speed/HR only and hid the Reps/Weight options. Classify by modality, plus a
  // narrow name check so machine cardio that's mistagged still shows speed/HR. Duration exercises
  // still default to Time (defaultTrackedFields) and their time still saves (duration_seconds).
  // SECOND NARROWING (2026-08-04). The modality tag alone was still wrong for
  // loaded and plyometric lower-body work: the library files Walking Lunge,
  // Dumbbell Walking Lunge, Dumbbell Sumo Jump Squat, Jump Squats and friends
  // under "conditioning". Those are prescribed in REPS and loaded with weight,
  // but the cardio branch offers only Time/Speed/HR with no way to turn Weight
  // or Reps on — and then nulls weight_lbs and reps on save (see logSet). So
  // Jennifer typed her numbers, hit the check, and the app threw them away:
  //   "Needs to be weight and reps" · "Needs to be sets and weight"
  // 36 set_logs are on record with every single value NULL, still happening as
  // of 2026-08-03.
  //
  // Two rules, both stronger evidence than the library's modality guess:
  //   1. An explicit tracked_fields on the prescription wins. Someone chose it.
  //      (7 rows already said "weight" and were overridden anyway — which is why
  //      backfilling tracked_fields would NOT have fixed this.)
  //   2. Rep-prescribed work is never cardio. In the live data every genuine
  //      cardio prescription is duration- or distance-based; every misclassified
  //      strength/plyo one is reps.
  // Treadmill Walk, Stair Master, Battle Rope and Outdoor Walk are all duration
  // and stay cardio.
  const isCardioEx = (pe: any) => {
    if (!pe) return false;
    const tf = pe.tracked_fields;
    if (Array.isArray(tf) && tf.length > 0) return tf.some((f: string) => f === "speed" || f === "hr");
    if (pe.volume_type === "reps" || pe.volume_type === "rep_range") return false;
    const ex = pe.exercises || {};
    return /conditioning|cardio/i.test(ex.modality || "")
      || /treadmill|elliptical|stair.?master|stationary bike|spin bike|rowing machine|battle rope|\bjog(ging)?\b|sprint/i.test(ex.name || "");
  };

  // Live session volume — every logged set adds to it, so progress is visible as a
  // number, not just a bar.
  // MUST stay AFTER isCardioEx. It is a `const` arrow function, so referencing it
  // earlier in the component body hits the temporal dead zone and throws
  // "Cannot access 'isCardioEx' before initialization" on EVERY render — which
  // took the whole logger down on 2026-07-25. tsc cannot catch that (runtime
  // fault, not a type error), so the ordering here is load-bearing.
  const sessionVolume = Object.entries(sets).reduce((total, [peId, arr]) => {
    if (isCardioEx(allFlat.find(p => p.id === peId))) return total;
    return total + arr.reduce((a, s) => {
      if (!s.done) return a;
      const w = parseFloat(String(s.weight ?? "")) || 0;
      const r = parseInt(String(s.reps ?? ""), 10) || 0;
      return a + w * r;
    }, 0);
  }, 0);

  // --- Auto-advance to the next exercise once the current one is fully logged ---
  const __goNextExercise = () => {
    const secs = localSections || [];
    const cur = secs[activeSectionIdx];
    if (cur && Array.isArray(cur.prescribed_exercises) && activeExerciseIdx < cur.prescribed_exercises.length - 1) {
      setActiveExerciseIdx(activeExerciseIdx + 1);
    } else if (activeSectionIdx < secs.length - 1) {
      setActiveSectionIdx(activeSectionIdx + 1);
      setActiveExerciseIdx(0);
    }
  };
  
  // --- end auto-advance ---
  // --- Manual swipe between exercises (any time) ---
  const __goPrevExercise = () => {
    if (activeExerciseIdx > 0) { setActiveExerciseIdx(activeExerciseIdx - 1); return; }
    const secs = localSections || [];
    if (activeSectionIdx > 0) {
      const prevSec = secs[activeSectionIdx - 1];
      const lastIdx = prevSec && Array.isArray(prevSec.prescribed_exercises) ? Math.max(0, prevSec.prescribed_exercises.length - 1) : 0;
      setActiveSectionIdx(activeSectionIdx - 1);
      setActiveExerciseIdx(lastIdx);
    }
  };
  const __swipeStart = useRef<{x:number;y:number}|null>(null);
  useEffect(() => {
    if (!sessionMode) return;
    const onStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      __swipeStart.current = { x: t.clientX, y: t.clientY };
    };
    const onEnd = (e: TouchEvent) => {
      const st = __swipeStart.current; __swipeStart.current = null;
      if (!st) return;
      const tgt = e.target as HTMLElement | null;
      if (tgt && tgt.closest && tgt.closest('iframe, [data-no-swipe]')) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - st.x, dy = t.clientY - st.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) __goNextExercise(); else __goPrevExercise();
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMode, activeSectionIdx, activeExerciseIdx, localSections]);
  // --- end manual swipe ---
  // --- Auto-load previous weights per movement (editable) ---
  //
  // Dustin, 2026-08-04: "the most recent weights for that number of reps for
  // that movement should be preloaded."
  //
  // The old rule was "most recent SESSION, matched by set number", which is
  // wrong the moment the rep target changes. Last week 3×12 at 40 lb, today
  // 3×8 — it offered 40, when the number worth beating is whatever you last did
  // for 8. Now every set looks for the newest log of the SAME movement at the
  // SAME rep count, and only falls back to the newest at any rep count (which
  // is the old behaviour, and still better than a blank box).
  const [prevByPe, setPrevByPe] = useState<Record<string, Record<number, { weight: string; reps: string }>>>({});
  /** Newest-first prior logs per prescription, for rep-matched prefill. */
  const [histByPe, setHistByPe] = useState<Record<string, { weight: number | null; reps: number | null; set_number: number }[]>>({});
  useEffect(() => {
    if (!clientId) return;
    const peList = (localSections || []).flatMap((sec: any) => (sec.prescribed_exercises || []) as any[]);
    const peIds = peList.map((p: any) => p.id);
    if (!peIds.length) return;
    // Key history by the underlying MOVEMENT (exercise_id) so previous weights
    // survive program rebuilds; fall back to prescribed_exercise_id for old rows.
    const exByPe: Record<string, string> = {};
    for (const p of peList) if (p?.exercises?.id) exByPe[p.id] = p.exercises.id;
    const exIds = Array.from(new Set(Object.values(exByPe)));
    let cancelled = false;
    (async () => {
      try {
        const orFilter = exIds.length
          ? `exercise_id.in.(${exIds.join(',')}),prescribed_exercise_id.in.(${peIds.join(',')})`
          : `prescribed_exercise_id.in.(${peIds.join(',')})`;
        const { data } = await supabase
          .from('set_logs')
          .select('prescribed_exercise_id, exercise_id, set_number, weight_lbs, reps, workout_log_id, logged_at')
          .eq('client_id', clientId)
          .or(orFilter)
          .order('logged_at', { ascending: false })
          .limit(1000);
        if (cancelled || !data) return;
        const map: Record<string, Record<number, { weight: string; reps: string }>> = {};
        const rows = data as any[]; // already ordered logged_at DESC (newest first)
        const matches = (row: any, pe: string) =>
          (row.exercise_id && exByPe[pe] && row.exercise_id === exByPe[pe]) || row.prescribed_exercise_id === pe;
        for (const pe of peIds) {
          // Pick the most recent PRIOR session for this movement that has a REAL (>0)
          // logged weight — this is the fix for wrong prefills: ~half of set_logs were
          // saved with weight 0 (blank boxes), so the old "most recent row" logic pulled
          // 0s / stale numbers. Fall back to the most recent session at all (so reps still
          // prefill for bodyweight movements that legitimately have no weight).
          let realLog: string | null = null;
          let anyLog: string | null = null;
          for (const row of rows) {
            if (workoutLogId && row.workout_log_id === workoutLogId) continue;
            if (!matches(row, pe)) continue;
            if (anyLog === null) anyLog = row.workout_log_id;
            if (row.weight_lbs != null && Number(row.weight_lbs) > 0) { realLog = row.workout_log_id; break; }
          }
          const useLog = realLog || anyLog;
          if (!useLog) continue;
          for (const row of rows) {
            if (row.workout_log_id !== useLog || !matches(row, pe)) continue;
            if (!map[pe]) map[pe] = {};
            if (!map[pe][row.set_number]) map[pe][row.set_number] = {
              weight: (row.weight_lbs != null && Number(row.weight_lbs) > 0) ? String(row.weight_lbs) : '',
              reps: (row.reps != null && Number(row.reps) > 0) ? String(row.reps) : '',
            };
          }
        }
        // Every prior log for the movement, newest first — the rep-matched
        // prefill needs the whole history, not just the last session.
        const hist: Record<string, { weight: number | null; reps: number | null; set_number: number }[]> = {};
        for (const pe of peIds) {
          const list: { weight: number | null; reps: number | null; set_number: number }[] = [];
          for (const row of rows) {
            if (workoutLogId && row.workout_log_id === workoutLogId) continue;
            if (!matches(row, pe)) continue;
            list.push({
              weight: row.weight_lbs == null ? null : Number(row.weight_lbs),
              reps: row.reps == null ? null : Number(row.reps),
              set_number: row.set_number,
            });
          }
          if (list.length) hist[pe] = list;
        }
        setHistByPe(hist);
        setPrevByPe(map);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, localSections, workoutLogId]);
  useEffect(() => {
    if (!__hydrated.current) return;
    if (!prevByPe || !Object.keys(prevByPe).length) return;
    setSets((prev: any) => {
      let changed = false;
      const next: any = { ...prev };
      for (const pe of Object.keys(next)) {
        const pv = prevByPe[pe];
        if (!pv || !Array.isArray(next[pe])) continue;
        next[pe] = next[pe].map((row: any, i: number) => {
          const p = pv[i + 1] || pv[i];
          if (row.done || !(row.weight === '' || row.weight == null)) return row;
          // Rep-matched first: the newest real weight this movement was logged
          // at for THIS rep target. A blank/0 weight is not an answer — half of
          // set_logs carry 0 from an empty box.
          const target = Number(row.reps);
          const list = histByPe[pe] || [];
          const atReps = Number.isFinite(target) && target > 0
            ? list.find((h) => h.reps === target && h.weight != null && h.weight > 0)
            : undefined;
          if (atReps) {
            changed = true;
            return { ...row, weight: String(atReps.weight) };
          }
          if (p) {
            changed = true;
            return { ...row, weight: p.weight, reps: (row.reps === '' || row.reps == null) ? p.reps : row.reps };
          }
          return row;
        });
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevByPe, histByPe]);
  // --- end previous weights ---
  // --- Inline exercise video (thumbnail + tap to play) ---
  const __ytId = (u: any): string | null => {
    if (!u) return null;
    const str = String(u);
    let id: string | null = null;
    if (str.includes('/embed/')) id = str.split('/embed/')[1];
    else if (str.includes('/shorts/')) id = str.split('/shorts/')[1];
    else if (str.includes('youtu.be/')) id = str.split('youtu.be/')[1];
    else if (str.includes('v=')) id = str.split('v=')[1];
    if (!id) return null;
    id = id.split(/[?&/]/)[0];
    return id || null;
  };
  // --- end inline video hooks ---
  const globalIdx = localSections.slice(0, activeSectionIdx).reduce((a, s) => a + s.prescribed_exercises.length, 0) + activeExerciseIdx;
  const totalExercises = allFlat.length;

  function navigateToGlobal(idx: number) {
    let count = 0;
    for (let si = 0; si < localSections.length; si++) {
      for (let ei = 0; ei < localSections[si].prescribed_exercises.length; ei++) {
        if (count === idx) { setActiveSectionIdx(si); setActiveExerciseIdx(ei); return; }
        count++;
      }
    }
  }

  async function ensureWorkoutLog(): Promise<{ id: string; alreadyCompleted: boolean }> {
    // Dustin, 2026-08-06, mid-session on Knee Stability P2 Day 2:
    //   "Couldn't finish the workout: insert or update on table
    //    scheduled_workouts violates foreign key constraint
    //    scheduled_workouts_workout_log_id_fkey."
    //
    // The id came out of the resumed draft in localStorage, and the row it
    // named was gone. This function trusted it on sight. What followed:
    //
    //   1. the workout_logs UPDATE ran with .eq("id", <dead id>) and matched
    //      NOTHING — PostgREST does not call that an error, so it passed
    //   2. the scheduled_workouts write then pointed at the same dead id and
    //      the foreign key finally caught it
    //
    // So the failure surfaced two steps downstream of its cause, wearing the
    // name of a table that had nothing to do with it. And it was permanent:
    // the draft is re-read on every mount, so "tap Complete again" handed the
    // very same dead id back, forever. The sets could not save either —
    // set_logs carries the same foreign key.
    //
    // A resumed id is a claim about the database, not a fact. Check it.
    if (workoutLogId) {
      const { data: alive } = await supabase
        .from("workout_logs").select("id, completed").eq("id", workoutLogId).maybeSingle();
      if (alive) return { id: alive.id, alreadyCompleted: !!(alive as { completed?: boolean }).completed };
      // Dead. Drop it and fall through rather than stranding the session — the
      // sets are all still in component state and get written against whatever
      // log we settle on.
      setWorkoutLogId(null);
      __clearDraft();
    }
    // Lauren Standefer, 11 Aug, 10:04am:
    //   "Couldn't finish the workout: duplicate key value violates unique
    //    constraint uq_workout_log_one_completed."
    //
    // Her session HAD finished, thirty-four seconds earlier. What this function
    // did next was insert a SECOND log for the same client, day and date,
    // re-write all 24 of her sets into it, and try to complete that — which the
    // unique index correctly refused. So the toast said the workout failed at
    // the exact moment the database was protecting the workout that succeeded.
    //
    // The hole: having no id in hand was treated as proof that no log exists.
    // It is not. The draft gets cleared on completion, and any remount arrives
    // with empty state and a finished session sitting in the database.
    //
    // ASK before inserting. sessionDate, not the clock — logging yesterday's
    // session this morning must find yesterday's log.
    const { data: existing } = await supabase
      .from("workout_logs")
      .select("id, completed, created_at")
      .eq("client_id", clientId).eq("day_id", day.id).eq("log_date", sessionDate)
      .order("created_at", { ascending: false });
    const found = pickExistingLog((existing as ExistingLog[]) || []);
    if (found) {
      setWorkoutLogId(found.id);
      return { id: found.id, alreadyCompleted: !!found.completed };
    }
    const { data, error } = await supabase.from("workout_logs").insert({
      client_id: clientId, day_id: day.id, log_date: sessionDate,
      started_at: new Date().toISOString(), completed: false,
    }).select("id").single();
    if (error) throw error;
    setWorkoutLogId(data.id);
    return { id: data.id, alreadyCompleted: false };
  }

  const updateSet = useCallback((peId: string, si: number, field: keyof SetData, value: string | boolean) => {
    setSets(prev => {
      const u = { ...prev };
      u[peId] = u[peId].map((s, i) => i === si ? { ...s, [field]: value } : s);
      return u;
    });
  }, []);

  const prefillSets = useCallback((peId: string, weight: string, reps: string) => {
    setSets(prev => {
      const u = { ...prev };
      u[peId] = u[peId].map(s => s.done ? s : { ...s, weight, reps });
      return u;
    });
  }, []);

  // Save a field config for ONE prescription, then make it the DEFAULT for this
  // movement everywhere: every other prescription of the same exercise that has
  // never had its fields set (tracked_fields IS NULL) inherits it. Deliberate
  // per-prescription choices are never overwritten. This is what "default
  // bridges to reps only" means — fix it once, it stays fixed library-wide.
  //
  // This never actually ran. Every caller passed `pe.exercise_id ?? undefined`, the
  // page's select did not fetch exercise_id, and the cast hid it — so the value
  // was always undefined and the function returned at the guard below. "Default
  // bridges to reps only" and "default wall hip hinge to reps only" (Dustin,
  // 7/25) were both closed on a propagation that has never once fired.
  //
  // Now that it works, it is TRAINER-ONLY. Library-wide is what Dustin asked
  // for, but a client tapping a chip in their own logger should not rewrite
  // thirty-four other people's prescriptions.
  const persistFields = async (peId: string, exerciseId: string | undefined, nf: string[]) => {
    try { await supabase.from("prescribed_exercises").update({ tracked_fields: nf }).eq("id", peId); } catch {}
    if (!exerciseId || !isTrainerSession) return;
    try {
      await supabase.from("prescribed_exercises")
        .update({ tracked_fields: nf })
        .eq("exercise_id", exerciseId)
        .is("tracked_fields", null);
    } catch { /* best-effort: the single-row update above already succeeded */ }
    // And make it the movement's DEFAULT, so programs written later inherit it
    // instead of falling back to the heuristic. RLS on exercises is
    // trainer-only, so this is a no-op for anyone else even if it is reached.
    try {
      await supabase.from("exercises").update({ default_tracked_fields: nf }).eq("id", exerciseId);
    } catch { /* the prescription-level fix already landed */ }
  };

  const saveCardioFields = async (peId: string, nf: string[], exerciseId?: string) => {
    setFieldCfg(prev => ({ ...prev, [peId]: nf }));
    await persistFields(peId, exerciseId, nf);
  };

  /**
   * Take a set back off the board — in the database, not just on screen.
   *
   * Troy, 6/29: "Need to be able to click the log/check button on exercise to
   * unlog it." The button existed and worked, and every un-log was a lie: it
   * flipped local state only, so set_logs kept completed = true with the old
   * weight and reps. It survived on that phone because the localStorage draft
   * overrode `done` on rehydrate — and nowhere else. Open the same workout on
   * another device, or after the draft expired, and the set was logged again.
   */
  async function unlogSet(peId: string, si: number) {
    updateSet(peId, si, "done", false);
    if (!workoutLogId) return;   // never written, so nothing to undo
    try {
      await supabase.from("set_logs").update({ completed: false })
        .eq("workout_log_id", workoutLogId)
        .eq("prescribed_exercise_id", peId)
        .eq("set_number", si + 1);
    } catch { /* the box is already clear; the next log rewrites the row */ }
  }

  /**
   * `overrides` exists for the per-set timer.
   *
   * A timer that finishes has to write its time AND log the set. Calling
   * updateSet() then logSet() does not work: logSet reads `sets` out of the
   * render it was created in, so it would upsert the time the box held BEFORE
   * the timer touched it — a 30-second hold recorded as whatever was there
   * previously. Handing the value straight in is the only version that cannot
   * race the state update.
   */
  async function logSet(peId: string, si: number, overrides?: Partial<SetData>) {
    setSaving(true);
    try {
      const { id: logId } = await ensureWorkoutLog();
      const s = { ...sets[peId][si], ...(overrides ?? {}) };
      await supabase.from("set_logs").upsert({
        workout_log_id: logId, prescribed_exercise_id: peId, client_id: clientId,
        exercise_id: allFlat.find(p => p.id === peId)?.exercises?.id ?? null,
        set_number: si + 1,
        weight_lbs: isCardioEx(allFlat.find(p => p.id === peId)) ? null : (s.weight?.trim() ? (parseFloat(s.weight) || null) : null),
        reps: isCardioEx(allFlat.find(p => p.id === peId)) ? null : (s.reps?.trim() ? (parseInt(s.reps) || null) : null),
        duration_seconds: s.time ? parseTimeToSecs(s.time) : null,
        distance_meters: feetToMeters(s.distance),
        speed: isCardioEx(allFlat.find(p => p.id === peId)) ? (s.speed ? parseFloat(s.speed) || 0 : null) : null,
        heart_rate: isCardioEx(allFlat.find(p => p.id === peId)) ? (s.hr ? parseInt(s.hr) || 0 : null) : null,
        completed: true, logged_at: new Date().toISOString(),
      }, { onConflict: "workout_log_id,prescribed_exercise_id,set_number" });
      updateSet(peId, si, "done", true);
      if (navigator.vibrate) navigator.vibrate(50);
      const pe = allFlat.find(p => p.id === peId);
      if (pe?.rest && pe.rest !== "none" && pe.rest !== "0") {
        const match = pe.rest.match(/(\d+)/);
        if (match) setRestTimer(parseInt(match[1]));
      }
    } catch(e) { console.error(e); }
    finally { setSaving(false); }
  }

  // ─── PER-SET TIMER — controls ─────────────────────────────────────────────

  const tKey = (peId: string, si: number) => `${peId}:${si}`;

  /**
   * The mode this particular set will actually run in.
   *
   * The switch is per movement, but a set with no time in its box has nothing
   * to count DOWN from, so it runs as a stopwatch regardless of where the
   * switch is. The button turns amber to say so rather than sitting there
   * disabled — a dead button is a thing you tap twice and then complain about.
   */
  function timerModeFor(peId: string, si: number): SetTimerMode {
    const movement = movementTimerMode[peId] ?? "timer";
    if (movement === "stopwatch") return "stopwatch";
    const target = parseTimeToSecs(sets[peId]?.[si]?.time || "");
    return target && target > 0 ? "timer" : "stopwatch";
  }

  /** The live state for a set, built from its time box the first time it runs. */
  function timerFor(peId: string, si: number): SetTimerState {
    const existing = setTimers[tKey(peId, si)];
    const mode = timerModeFor(peId, si);
    const target = mode === "timer" ? parseTimeToSecs(sets[peId]?.[si]?.time || "") : null;
    if (existing && existing.mode === mode && existing.targetSecs === target) return existing;
    // The time box was edited, or the switch moved: rebuild from what it says
    // now. Carrying banked seconds across a retyped target would show a
    // countdown that does not match the number above it.
    return { ...newTimer(target), mode };
  }

  /** Start, or stop and record. The whole control is this one function. */
  function toggleSetTimer(peId: string, si: number) {
    const key = tKey(peId, si);
    const cur = timerFor(peId, si);
    const now = Date.now();

    if (isRunning(cur)) {
      const out = outcomeOnStop(cur, now);
      setSetTimers(t => ({ ...t, [key]: tPause(cur, now) }));
      if (out.seconds != null) {
        const text = fmtSecs(out.seconds);
        updateSet(peId, si, "time", text);
        // The write and the log go together, with the value handed straight to
        // logSet — see the note on `overrides` there.
        if (out.shouldLog) { fx("log"); logSet(peId, si, { time: text }); }
      }
      return;
    }

    const started = tStart(cur, now);
    if (!isRunning(started)) return;   // a countdown with no time to run
    // One clock at a time. Everything else banks what it has and stops.
    setSetTimers(t => {
      const next: Record<string, SetTimerState> = {};
      for (const k of Object.keys(t)) next[k] = k === key ? t[k] : tPause(t[k], now);
      next[key] = started;
      return next;
    });
    setTimerNow(now);
  }

  /** The switch above the sets. Flipping it stops and clears every set's clock. */
  function flipMovementTimerMode(peId: string, mode: SetTimerMode) {
    if ((movementTimerMode[peId] ?? "timer") === mode) return;
    const now = Date.now();
    setMovementTimerMode(m => ({ ...m, [peId]: mode }));
    setSetTimers(t => {
      const next: Record<string, SetTimerState> = {};
      for (const k of Object.keys(t)) {
        next[k] = k.startsWith(`${peId}:`) ? tSetMode(tPause(t[k], now), mode) : tPause(t[k], now);
      }
      return next;
    });
  }

  const anyTimerRunning = Object.values(setTimers).some(isRunning);

  /**
   * The auto-log below runs from inside an interval, and logSet closes over
   * `sets` from the render that built it. That interval is only rebuilt when
   * something starts or stops running — so a weight typed WHILE a hold counts
   * down would be written from a stale copy, and the set would log with
   * whatever the box held when the clock started. The ref keeps the callback
   * current without restarting the interval on every keystroke.
   */
  const logSetRef = useRef(logSet);
  logSetRef.current = logSet;

  const setTimerRunning = (peId: string, si: number) => isRunning(setTimers[tKey(peId, si)] ?? newTimer(null));

  /**
   * What the time box shows.
   *
   * While a clock is running it shows that clock; otherwise it shows what is
   * stored on the set. The box never changes width — it is already
   * tabular-nums — so a ticking number cannot reflow the row. That is not a
   * detail on this screen: see tests/unit/loggerLayout.test.ts.
   */
  function timeBoxText(peId: string, si: number, stored: string): string {
    const st = setTimers[tKey(peId, si)];
    if (!st || !isRunning(st)) return stored;
    return fmtSecs(displaySecs(st, timerNow));
  }

  /** The timer control that sits beside the log button. */
  function renderSetTimerButton(peId: string, si: number, small = false) {
    const st = timerFor(peId, si);
    const running = isRunning(st);
    const sw = st.mode === "stopwatch";
    // Amber = this set is a stopwatch, blue = it is counting down. A set with
    // no time in the box is amber even with the switch on Timer, because that
    // is what it will actually do.
    const tint = running ? "#f5b34a" : sw ? "#f5c77a" : "#8ec2ff";
    return (
      <button type="button" onClick={e => { e.stopPropagation(); toggleSetTimer(peId, si); }}
        aria-label={running ? "Stop timer" : sw ? "Start stopwatch" : "Start countdown"}
        className={`${small ? "w-9 h-9" : "w-10 h-10"} rounded-xl flex items-center justify-center flex-shrink-0`}
        style={{
          background: running ? "#f5b34a" : sw ? "rgba(245,179,74,0.16)" : "rgba(96,165,250,0.16)",
          border: `1px solid ${running ? "#f5b34a" : sw ? "rgba(245,179,74,0.4)" : "rgba(96,165,250,0.4)"}`,
          color: running ? "#20140a" : tint,
        }}>
        <i className={`ti ${running ? "ti-player-pause" : "ti-clock"} text-base`} />
      </button>
    );
  }

  /**
   * The Timer / Stopwatch switch, above the sets.
   *
   * Rendered ONLY for a movement that tracks time — a weight-and-reps exercise
   * has no use for it and every row of chrome on this screen costs height that
   * the sets need. It is driven by the caller's live field list, so switching
   * the Time chip on brings it up in the same tap.
   */
  function renderTimerModeSwitch(peId: string) {
    const mode = movementTimerMode[peId] ?? "timer";
    return (
      <div className="flex gap-1 p-0.5 rounded-xl mb-2" style={{ background: "rgba(255,255,255,0.05)" }}>
        {([["timer", "Timer"], ["stopwatch", "Stopwatch"]] as [SetTimerMode, string][]).map(([m, label]) => (
          <button key={m} type="button" onClick={e => { e.stopPropagation(); flipMovementTimerMode(peId, m); }}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: mode === m ? "var(--brand-primary)" : "transparent",
              color: mode === m ? "white" : "rgba(255,255,255,0.5)",
              border: "none",
            }}>
            {label}
          </button>
        ))}
      </div>
    );
  }

  /**
   * Repaint while something is running, and log a countdown that reaches zero.
   *
   * 250ms rather than 1000ms so the last second does not visibly hang, and the
   * interval is not created at all when nothing is running — an idle logger
   * must not wake up four times a second.
   *
   * This deliberately does NOT drive the clock. It only re-renders; every
   * number comes from Date.now(). That is what makes a backgrounded phone
   * come back with the right time instead of however many ticks it managed.
   */
  // WHY THIS TICKS ONCE A SECOND AND STOPS WHEN THE SCREEN IS AWAY.
  //
  // Dustin, 18 Aug: "If I leave the app open in my workout logger for a few
  // minutes without touching it while I'm rolling or doing an exercise, when I
  // go to log the exercise, it's very laggy. Sometimes it takes minutes to
  // actually click the movement."
  //
  // `timerNow` is state on the TOP-LEVEL logger component, so every tick
  // re-rendered the entire screen — every section, every exercise, every set
  // row and all of its controlled inputs. At 250ms that was FOUR FULL RENDERS
  // A SECOND, for as long as any rest timer ran, which is exactly the window he
  // describes: the timer is running while he rolls. On a phone that is minutes
  // of continuous main-thread work, and taps queue behind it.
  //
  // Two changes, neither of which touches a pixel:
  //
  //   1. Once a second, not four times. The clock is displayed as mm:ss by
  //      fmtSecs, so three of every four renders produced an identical screen.
  //      Expiry is detected a fraction later; a rest timer does not care.
  //   2. Nothing runs while the screen is hidden. It used to keep going until
  //      the OS throttled it, and the backlog landed on resume — which is why
  //      the lag is worst after leaving it sitting. On return it syncs
  //      immediately, so the time is right the moment he looks.
  //
  // The clock itself is still read from Date.now(), never accumulated from
  // ticks, so a phone that slept comes back with the correct time regardless of
  // how many ticks it missed.
  useEffect(() => {
    if (!anyTimerRunning) return;
    let id: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const now = Date.now();
      // Whole seconds only. A re-render that redraws the same mm:ss is pure
      // cost, and this keeps that true if the interval is ever shortened again.
      setTimerNow(prev => (Math.floor(prev / 1000) === Math.floor(now / 1000) ? prev : now));
      setSetTimers(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [k, st] of Object.entries(prev)) {
          if (!isRunning(st) || !isExpired(st, now)) continue;
          const [peId, siRaw] = k.split(":");
          const si = Number(siRaw);
          next[k] = tPause(st, now);
          changed = true;
          const out = outcomeOnStop(st, now);
          if (out.seconds != null && out.shouldLog) {
            const text = fmtSecs(out.seconds);
            updateSet(peId, si, "time", text);
            fx("log");
            logSetRef.current(peId, si, { time: text });
          }
        }
        return changed ? next : prev;
      });
    };
    const start = () => { if (id == null) id = setInterval(tick, 1000); };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") { stop(); return; }
      // Back on screen: catch up in one go, then resume ticking. A timer that
      // expired while the phone was in his pocket is finished here, not left
      // running until the next tick.
      tick();
      start();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVis);
      if (document.visibilityState === "hidden") stop(); else start();
    } else {
      start();
    }
    return () => {
      stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
    };
    // logSet/updateSet are stable enough for this: the effect only restarts
    // when something starts or stops running, which is exactly when it should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyTimerRunning]);

  async function logAllCurrentSets() {
    if (!currentExercise) return;
    setSaving(true);
    try {
      const { id: logId } = await ensureWorkoutLog();
      const peId = currentExercise.id;
      const arr = sets[peId] || [];
      const rows = arr.map((s, i) => ({
        workout_log_id: logId, prescribed_exercise_id: peId, client_id: clientId,
        exercise_id: currentExercise.exercises?.id ?? null,
        set_number: i + 1,
        weight_lbs: isCardioEx(currentExercise) ? null : (s.weight?.trim() ? (parseFloat(s.weight) || null) : null),
        reps: isCardioEx(currentExercise) ? null : (s.reps?.trim() ? (parseInt(s.reps) || null) : null),
        duration_seconds: s.time ? parseTimeToSecs(s.time) : null,
        distance_meters: feetToMeters(s.distance),
        speed: isCardioEx(currentExercise) ? (s.speed ? parseFloat(s.speed) || 0 : null) : null,
        heart_rate: isCardioEx(currentExercise) ? (s.hr ? parseInt(s.hr) || 0 : null) : null,
        completed: true, logged_at: new Date().toISOString(),
      }));
      if (rows.length) {
        await supabase.from("set_logs").upsert(rows, { onConflict: "workout_log_id,prescribed_exercise_id,set_number" });
      }
      setSets(prev => {
        const u = { ...prev };
        u[peId] = (u[peId] || []).map(s => ({ ...s, done: true }));
        return u;
      });
      if (navigator.vibrate) navigator.vibrate(50);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  // Cancel = discard the session. Previously this only cleared the localStorage draft, so every
  // set already logged stayed in set_logs and the workout_logs row stayed open forever - the
  // screen emptied but the data did not (10 abandoned sessions were left stranded that way,
  // one holding 28 sets). Now it deletes this session's rows for real.
  const [discarding, setDiscarding] = useState(false);
  async function discardSession() {
    if (discarding) return;
    const hasLogged = Object.values(sets).some(arr => arr.some(s => s.done));
    const msg = hasLogged
      ? "Discard this workout? Any sets you've already logged will be deleted."
      : "Discard this workout and exit?";
    if (typeof window !== "undefined" && !window.confirm(msg)) return;
    setDiscarding(true);
    try {
      if (workoutLogId) {
        const { error: slErr } = await supabase.from("set_logs").delete().eq("workout_log_id", workoutLogId);
        if (slErr) throw slErr;
        // completed=false guard: a finished workout must never be deletable from here, even if
        // this component somehow still holds its id.
        const { error: wlErr } = await supabase.from("workout_logs").delete()
          .eq("id", workoutLogId).eq("completed", false);
        if (wlErr) throw wlErr;
      }
      // The scheduled_workouts row is deliberately left alone: cancelling a session does not
      // unschedule the workout - it stays on the calendar to be done later.
      __clearDraft();
      setWorkoutLogId(null);
      setSets(buildInitialSets());
      setSessionNote("");
      setSessionCancelled(true);
      setSessionMode(false);
    } catch (e) {
      console.error(e);
      // Do NOT exit on failure - leaving the session open means the sets are still there to
      // retry, rather than the screen clearing while the rows survive (the old behaviour).
      if (typeof window !== "undefined") window.alert("Couldn't discard the workout - check your connection and try again.");
    } finally { setDiscarding(false); }
  }

  function addSetRow(peId: string) {
    setSets(prev => ({ ...prev, [peId]: [...(prev[peId] || []), { weight: "", reps: "", time: "", speed: "", hr: "", distance: "", done: false }] }));
    if (navigator.vibrate) navigator.vibrate(20);
  }
  function removeSetRow(peId: string) {
    setSets(prev => {
      const arr = prev[peId] || [];
      if (arr.length <= 1) return prev;
      return { ...prev, [peId]: arr.slice(0, -1) };
    });
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // Dustin, 8/4: "workout logger keeps not logging in my app. after I hit finish
  // it goes back n is not logged. happened multiple times today."
  //
  // This function had NO error handling. Not a swallowed catch — no catch at
  // all, just try/finally. So if the insert or either update failed, the promise
  // rejected into nowhere: no message, no retry, the button simply went from
  // "Saving…" back to "Complete ✓" and the session stayed open. From the other
  // side of the screen that is indistinguishable from "I hit finish and nothing
  // happened", which is exactly the report. A failure the user cannot see is a
  // failure that gets reported as flakiness and can never be diagnosed.
  //
  // Every write is now checked and anything that goes wrong is said out loud.
  const [completeError, setCompleteError] = useState<string | null>(null);

  async function completeWorkout() {
    setSaving(true);
    setCompleteError(null);
    try {
      const { id: logId, alreadyCompleted } = await ensureWorkoutLog();
      if (alreadyCompleted) {
        // This session is already finished in the database. Completing it a
        // second time trips uq_workout_log_one_completed, and the logger then
        // reports a SAVED workout as a failure — exactly what Lauren saw at
        // 10:04 on 11 Aug, thirty-four seconds after her workout saved.
        // Show her the finished state. Her sets are on this log already.
        //
        // One thing still worth checking: if the FIRST attempt died between
        // writing the log and marking the schedule, the session is complete but
        // the calendar still says it is not. Only then does the schedule block
        // below need to run — and skipping it when a row already points here
        // matters, because re-running it would look for "no session today" and
        // pull a future session forward onto today. That is the Sara Prince
        // failure, and we are not trading one bug for it.
        const { data: __linked } = await (supabase as any)
          .from("scheduled_workouts")
          .select("id").eq("workout_log_id", logId).limit(1);
        if (__linked && __linked.length) {
          setWorkoutComplete(true);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          return;
        }
      }
      const { data: logRows, error: logErr } = await supabase.from("workout_logs").update({
        completed: true, completed_at: new Date().toISOString(), status: "Done as planned",
        note: sessionNote || null,
      }).eq("id", logId).select("id");
      // THE workout row. If this failed the session did not happen as far as the
      // app is concerned, and carrying on to the schedule update would leave the
      // calendar claiming a workout that has no log behind it.
      if (logErr) throw logErr;
      // An UPDATE that matches no rows is not an error in PostgREST, so this
      // used to sail through and let the failure resurface further down as a
      // foreign-key violation naming scheduled_workouts. Nought rows here means
      // the log is not there; say so, here, where it happened.
      if (!logRows || !logRows.length) throw new Error("the workout log went missing mid-session");
      {
        // The day this session is FOR. Matching on the clock is what closed the
        // wrong card: the 6th's cardio was ticked off while the 5th's stayed open.
        const __today = sessionDate;
        // Mark the scheduled workout complete. Prefer today's instance; if the
        // workout was scheduled for a prior day and never moved, fall back to the
        // most recent still-scheduled instance on/before today so make-up logs
        // still show as completed on the schedule.
        // EVERY row for this day today, not the first one.
        //
        // This was `.order("id").limit(1)`, which marked exactly one scheduled
        // row complete and left any twin sitting there saying "not done". The
        // home screen decides whether a workout is logged purely from
        // scheduled_workouts.status — so with two rows for the same session you
        // finish the workout, go back, and the app tells you it isn't logged.
        // It is, and there is a second card claiming otherwise. Ordering by
        // UUID also meant WHICH one got marked was effectively random.
        //
        // Soft-deleted rows are excluded: a removed session must not be
        // resurrected as "completed".
        // THE ROW THIS SESSION WAS OPENED FROM WINS.
        //
        // Dustin, 17 Aug: he finished Upper Push and the app credited the
        // session dated 10 AUGUST, leaving today's on Start and the week at 0%.
        // At 17:02, mid-session, the day was forked — a personal copy was
        // created and today's scheduled row was repointed at it — while this
        // screen still held the day id it loaded with at 16:15. The lookup
        // below found nothing, and the make-up fallback reached back a week.
        //
        // The page already resolves the exact scheduled_workouts row when it
        // opens the session and hands it over as `scheduledWorkoutId`. This
        // never looked at it. A row id does not change when a fork rewrites
        // day_id, so preferring it closes the whole class: fork, swap, anything
        // that moves the day while somebody is lifting.
        const { data: __openedRows } = scheduledWorkoutId
          ? await (supabase as any)
              .from("scheduled_workouts")
              .select("id, day_id, scheduled_date, status, deleted_at")
              .eq("id", scheduledWorkoutId)
              .limit(1)
          : { data: null };
        const __opened = ((__openedRows as CompletionCandidate[] | null) ?? [])[0] ?? null;
        const { data: __todayRows } = await (supabase as any)
          .from("scheduled_workouts")
          .select("id, day_id, scheduled_date, status, deleted_at")
          .eq("client_id", clientId)
          .eq("day_id", day.id)
          .eq("scheduled_date", __today)
          .is("deleted_at", null);
        const __choice = chooseCompletionTargets(
          __opened,
          (__todayRows as CompletionCandidate[] | null) ?? [],
          __today,
        );
        let __swIds: string[] = __choice.ids;
        if (!__swIds.length) {
          const { data: __pastRows } = await (supabase as any)
            .from("scheduled_workouts")
            .select("id")
            .eq("client_id", clientId)
            .eq("day_id", day.id)
            .eq("status", "scheduled")
            .is("deleted_at", null)
            .lte("scheduled_date", __today)
            .order("scheduled_date", { ascending: false })
            .limit(1);
          if (__pastRows && __pastRows.length) __swIds = [__pastRows[0].id];
        }
        // ...and if there is nothing today and nothing missed, look FORWARD.
        //
        // Sara Prince, 11 Aug: "Did hip and ankle mobility Sunday to get a head
        // start. The app added additional sessions to Sunday instead of giving
        // me credit for two week mobility sessions."
        //
        // She was right, and this is where it happened. The lookup checked
        // today, then checked BACKWARDS for a missed session, then gave up and
        // inserted a brand new row — there was no case for doing a session
        // EARLY. So her Wednesday mobility, done on Sunday, created a second
        // session on Sunday and left Wednesday's still sitting there unfinished.
        // Her week went from 7 planned to 9 and read 30% adherence for being
        // ahead of schedule.
        //
        // Getting ahead of your programme must never look like falling behind.
        if (!__swIds.length) {
          const { data: __futureRows } = await (supabase as any)
            .from("scheduled_workouts")
            .select("id, day_id, scheduled_date, status, deleted_at")
            .eq("client_id", clientId)
            .eq("day_id", day.id)
            .eq("status", "scheduled")
            .is("deleted_at", null)
            .gt("scheduled_date", __today)
            .order("scheduled_date", { ascending: true })
            .limit(10);
          const __slot = findSlotToPullForward((__futureRows as SlotCandidate[]) || [], day.id, __today);
          if (__slot) {
            // Move it to today rather than completing it in place: the calendar
            // should show the session on the day it was actually done.
            const { error: __mvErr } = await (supabase as any)
              .from("scheduled_workouts")
              .update({
                scheduled_date: __today,
                moved_from_date: __slot.scheduled_date,
                status: "completed",
                workout_log_id: logId,
                updated_at: new Date().toISOString(),
              })
              .eq("id", __slot.id);
            if (__mvErr) throw __mvErr;
            __swIds = ["__moved__"]; // sentinel: handled, skip both branches below
          }
        }
        if (__swIds.length === 1 && __swIds[0] === "__moved__") {
          // Already handled by the pull-forward above.
        } else if (__swIds.length) {
          // `.select("id")` is not decoration. An update matching ZERO rows is
          // not an error in PostgREST, so without asking which rows changed the
          // session reports itself finished while the schedule still says
          // otherwise — which is the shape of most of this week's bugs.
          const { data: __changed, error: __swErr } = await (supabase as any)
            .from("scheduled_workouts")
            .update({ status: "completed", workout_log_id: logId })
            .in("id", __swIds)
            .select("id");
          if (__swErr) throw __swErr;
          const __verdict = completionVerdict(
            __swIds,
            ((__changed as { id: string }[] | null) ?? []).map((r) => r.id),
          );
          if (__verdict) throw new Error(__verdict);
        } else {
          // No scheduled row matched (unscheduled / make-up session) - create a completed
          // one so the workout still counts in every tracking tile and counter.
          const { error: __insErr } = await (supabase as any)
            .from("scheduled_workouts")
            .insert({ client_id: clientId, day_id: day.id, scheduled_date: __today, status: "completed", workout_log_id: logId, source: "client_self_assign" });
          if (__insErr) throw __insErr;
        }
      }
      setWorkoutComplete(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } catch (e) {
      // Say it. The sets are all still in the database and the session stays
      // open, so tapping again is safe and is the right thing to do.
      console.error("completeWorkout", e);
      setCompleteError(
        (e as { message?: string })?.message
          ? `Couldn't finish the workout: ${(e as { message?: string }).message}. Your sets are saved — tap Complete again.`
          : "Couldn't finish the workout — check your connection and tap Complete again. Your sets are saved.",
      );
    } finally { setSaving(false); }
  }

  // `startVoiceNote` used to sit here — a mic handler for the session note
  // whose button was never mounted in the JSX, so nothing could ever call it.
  // Deleted rather than carried: dead code that LOOKS like a working feature is
  // how "the logger already has a mic for that" stays believable for a week.

  async function saveTrainerNote() {
    if (!trainerNoteText.trim()) return;
    setSavingNote(true);
    try {
      await supabase.from("trainer_notes").insert({
        client_id: clientId,
        day_id: day.id,
        exercise_id: currentExercise?.exercises?.id ?? null,
        prescribed_exercise_id: currentExercise?.id ?? null,
        author: "trainer",
        note: trainerNoteText.trim(),
        created_at: new Date().toISOString(),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
      setTrainerNoteText("");
    } catch(e) { console.error(e); }
    finally { setSavingNote(false); }
  }

  async function saveExerciseNote() {
    if (!exNoteText.trim() || !currentExercise) return;
    setSavingExNote(true);
    try {
      const row = {
        client_id: clientId,
        exercise_id: currentExercise.exercises?.id ?? null,
        prescribed_exercise_id: currentExercise.id,
        workout_log_id: workoutLogId,
        day_id: day?.id ?? null,
        note: exNoteText.trim(),
        author: isTrainerSession ? "trainer" : "client",
      };
      const { data } = await supabase.from("exercise_notes").insert(row).select("id, note, author, created_at");
      if (data && data[0]) setExNotePrior(prev => [data[0] as unknown as { id: string; note: string; author: string; created_at: string }, ...prev]);
      // A note on a movement is a NOTE, not a question.
      //
      // Dustin, 14 Aug: "the notes on movements in workout logger is sending to
      // me as a 'question' — that should go in as notes to the ai to see when
      // we program and should be labeled accordingly."
      //
      // "[Question · Lat Pulldown]" framed every one of these as something
      // awaiting his reply, so a client writing "went up to 110, felt easy" —
      // which is programming information, not a question — landed in his inbox
      // looking like an unanswered message. It also set the client's
      // expectation that a reply was coming.
      //
      // The row itself already goes to exercise_notes, which is what the
      // programming AI reads. This copy exists only so he SEES it happen
      // without opening the logger, so it is labelled for what it is.
      //
      // ── 15 Aug: and now only when it is worth seeing ────────────────────
      //
      // Relabelling fixed the wording and nothing else. Every note still fired
      // a push, an email and an unread badge, exactly like a real message —
      // four of them from Jennifer inside ninety minutes, all of them loads.
      //
      // Dustin: "filter the ai stuff. if I need to deal w it send to me, if
      // not, send to ai feedback."
      //
      // routeTrainingNote decides. Symptoms, questions, app problems and
      // anything it does not recognise are DELIVERED; recognisable load and
      // equipment bookkeeping is not. Either way the exercise_notes row above
      // is already written, so the AI sees every note regardless and nothing
      // here can lose one — the only thing being decided is his phone.
      if (!isTrainerSession && routeTrainingNote(row.note) === "deliver") {
        const exName = currentExercise.exercises?.name ?? "Exercise";
        try { await sendClientMessage(`[Training note · ${exName}]\n${row.note}`); } catch (e) { console.error(e); }
      }
      setExNoteText(""); setExNoteSaved(true);
      setTimeout(() => setExNoteSaved(false), 2500);
    } catch (e) { console.error(e); }
    finally { setSavingExNote(false); }
  }

  async function submitFeedback() {
    if (!fbText.trim()) return;
    setFbSending(true);
    let src = "app";
    try { const m = localStorage.getItem("symmetry_view_mode"); if (m) src = m + "-app"; } catch { /* noop */ }
    try {
      await fileFeedback(supabase, { source: src, transcript: fbText.trim() });
    } catch (e) { console.error(e); }
    setFbSent(true); setFbText(""); setFbSending(false);
    setTimeout(() => { setFbSent(false); setShowFeedback(false); }, 2200);
  }

  // startFeedbackVoice, voiceMessage and startTrainerVoice used to fill this
  // space. Dictation is MicButton's job now, and `voiceMessage` — the best
  // failure copy in the app, and the only one that told a permission the person
  // can GRANT apart from a device limit they cannot — was promoted into
  // lib/dictation as `dictationMessage`. Every mic says it now, not just this
  // screen.

  // \u2500\u2500\u2500 WORKOUT COMPLETE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async function handleSwap(newExercise: Exercise) {
    if (!swapTargetPe) return;
    const peId = swapTargetPe.id;

    // FORK BEFORE EDITING. This used to be a bare
    //   update prescribed_exercises set exercise_id = … where id = peId
    // with no ownership check, on a button that is NOT trainer-gated. Most
    // scheduled workouts sit on shared library days by design — the isolation
    // trigger only forks a day when a SECOND client lands on it — so that
    // update was rewriting THE TEMPLATE. Nothing visibly broke, which is the
    // problem: the next client scheduled on that day would silently inherit a
    // substitution someone else made mid-session, with no record of why.
    //
    // The RPC forks the day when it is not already this client's, repoints only
    // THIS session (scope 'one', same as workoutAdjust), and swaps inside the
    // copy. A fork changes the ids the page is holding, so we reload.
    if (scheduledWorkoutId) {
      try {
        const { data, error } = await supabase.rpc("swap_prescribed_exercise", {
          p_scheduled_workout_id: scheduledWorkoutId,
          p_pe_id: peId,
          p_new_exercise_id: newExercise.id,
        });
        const res = data as { ok?: boolean; forked?: boolean } | null;
        if (!error && res?.ok) {
          if (res.forked) { window.location.reload(); return; }
          setLocalSections(prev => prev.map(sec => ({
            ...sec,
            prescribed_exercises: sec.prescribed_exercises.map(pe =>
              pe.id === peId ? { ...pe, exercises: newExercise } : pe),
          })));
          setSwapTargetPe(null);
          return;
        }
      } catch { /* fall through to the direct write below */ }
    }

    // No scheduled_workouts row to repoint (opened straight from a day, not
    // from the calendar) — there is nothing to fork ONTO, so this stays the old
    // in-place edit. Trainer-side editing of a library day is legitimate; the
    // hazard was only ever the client-facing session path above.
    await supabase.from("prescribed_exercises").update({ exercise_id: newExercise.id }).eq("id", peId);
    setLocalSections(prev => prev.map(sec => ({
      ...sec,
      prescribed_exercises: sec.prescribed_exercises.map(pe =>
        pe.id === peId ? { ...pe, exercises: newExercise } : pe
      ),
    })));
    setSwapTargetPe(null);
  }

    if (workoutComplete) {
    const symLines = ["That's the rep you won't remember and the one that counted.", "Logged. The work doesn't care how you felt about it.", "Showed up. Did the work. That's the whole thing.", "Not talked about. Done.", "It wasn't easy. It was worth it.", "The discipline is doing it when you don't feel it. You did."];
    const completionLine = symLines[(day.label ? day.label.length : 0) % symLines.length];
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "var(--brand-bg)" }}>
        {/* Celebration overlay (visual-polish): covers this screen; original stays mounted behind it. Revert = remove this block. */}
        <CelebrationScreen
          sets={sets}
          doneSets={doneSets}
          clientId={clientId}
          clientName={clientName}
          dayLabel={day.label}
          doneHref={isTrainerSession ? "/clients/" + clientId : "/home"}
        />
        <div className="relative mb-6" style={{ width: 120, height: 120 }}>
          <style>{"@keyframes symL{from{transform:translateX(-16px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes symR{from{transform:translateX(16px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes symChk{to{stroke-dashoffset:0}}"}</style>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <g style={{ animation: "symL 0.7s ease both" }}>
              <path d="M60 14 A46 46 0 0 0 60 106" fill="none" stroke="var(--brand-primary)" strokeWidth="6" strokeLinecap="round" />
            </g>
            <g style={{ animation: "symR 0.7s ease both" }}>
              <path d="M60 14 A46 46 0 0 1 60 106" fill="none" stroke="var(--brand-primary)" strokeWidth="6" strokeLinecap="round" />
            </g>
            <path d="M44 61 l11 12 l22 -24" fill="none" stroke="#22c55e" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 70, strokeDashoffset: 70, animation: "symChk 0.5s ease 0.7s forwards" }} />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-text)" }}>Session done.</h1>
        <p className="text-sm mb-2" style={{ color: "var(--brand-text-secondary)" }}>{day.label}</p>
        <p className="text-base font-medium mb-1" style={{ color: "var(--brand-text)", maxWidth: 320, lineHeight: 1.45 }}>{completionLine}</p>
        <p className="text-lg font-bold mb-6" style={{ color: "var(--brand-primary)" }}>{doneSets} sets logged</p>
        <Link href={isTrainerSession ? `/clients/${clientId}` : "/home"}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-white"
          style={{ background: "var(--brand-primary)" }}>
          <i className="ti ti-check" /> Done
        </Link>
      </div>
    );
  }

  // \u2500\u2500\u2500 SESSION MODE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if (sessionMode && currentExercise) {
    const peSets = sets[currentExercise.id] || [];
    const xFields = fieldCfg[currentExercise.id] || defaultTrackedFields(currentExercise);
    const saveFields = async (nf: string[]) => { setFieldCfg(prev => ({ ...prev, [currentExercise.id]: nf })); await persistFields(currentExercise.id, currentExercise.exercise_id ?? undefined, nf); };
    // Chip list matches the white preview: cardio gets Time/Speed/HR, strength gets
    // Weight/Reps/Time/Each side — plus any field already tracked on this exercise,
    // so the session view always shows the same fields as the edit/preview screen.
    const chipList: string[] = isCardioEx(currentExercise) ? ["time", "speed", "hr"] : ["weight", "reps", "time", "distance", "each_side"];
    for (const f of xFields) if (!chipList.includes(f) && ["weight", "reps", "time", "speed", "hr", "distance", "each_side"].includes(f)) chipList.push(f);

    return (
      <div
        className="fixed top-0 left-0 right-0 flex flex-col z-[999]"
        style={{
          background: "var(--session-bg)",
          // NOT inset-0. inset-0 resolves against the layout viewport, and the
          // Android WebView shrinks that viewport when the keyboard opens — so
          // every child reflowed into the smaller box and the exercise header
          // vanished. Pinning to the tallest height seen in this orientation
          // means the keyboard cannot resize this view at all: the bottom of it
          // (notes, footer, tabs) simply ends up under the keyboard, and the
          // sets stay exactly where they were. See useStableViewportHeight.
          height: stableH ?? "100dvh",
          overflow: "hidden",
        }}
      >
        {/* Set-pop + PR-glow overlay (pointer-events:none, cannot block logging). Revert = remove this line. */}
        <SetFeedback sets={sets} prevByPe={prevByPe} />
        {/* Keep the phone screen awake during an active session. Isolated; no-ops where unsupported. Revert = remove this line. */}
        <WakeLock active={sessionMode} />
        {restTimer !== null && <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />}
        {videoUrl && <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />}
        {historyExercise && (
          <ExerciseHistory exerciseId={historyExercise.id} exId={historyExercise.exId} clientId={clientId} exerciseName={historyExercise.name}
            onClose={() => setHistoryExercise(null)}
            onPrefill={(w, r) => prefillSets(currentExercise.id, w, r)} />
        )}
        {timePick && <TimePickerSheet initial={parseTimeToSecs(sets[timePick.peId]?.[timePick.si]?.time || "") || 0} onSet={(secs) => { updateSet(timePick.peId, timePick.si, "time", fmtSecs(secs)); setTimePick(null); }} onClose={() => setTimePick(null)} />}
        {swapTargetPe && <SwapModal pe={swapTargetPe} onClose={() => setSwapTargetPe(null)} onSwap={handleSwap} />}
        {coachOpen && clientId && (
          <CoachChatSheet
            clientId={clientId}
            dayContext={[]}
            actions={NO_COACH_ACTIONS}
            onApplySuggestion={async () => {}}
            // sessionDate, never a fresh clock read. The logger has exactly one
            // answer to "what day is this" and computing a second one here is
            // the bug this file's tests exist to prevent — a make-up session
            // logged for yesterday would have handed the coach today's date.
            selectedDate={sessionDate}
            canAct={false}
            claimsSlot={false}
            surface="logger"
            contextLine={
              currentExercise?.exercises?.name
                ? `You're on ${currentExercise.exercises.name}.`
                : undefined
            }
            startOpen
            onClose={() => setCoachOpen(false)}
          />
        )}

        {/* Feedback sheet (both roles) -> app_feedback for fast fixes */}
        {showFeedback && (
          <div className="fixed inset-0 z-[1000] flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowFeedback(false)}>
            <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
              {fbSent ? (
                <div className="py-6 text-center font-semibold" style={{ color: "#22c55e" }}>&#10003; Thanks &mdash; sent to the fix list.</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <i className="ti ti-flag text-base" style={{ color: "#f59e0b" }} />
                    <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>Report an issue / feedback</h3>
                  </div>
                  <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>Speak or type &mdash; this screen is tagged automatically so it can be fixed fast.</p>
                  <div className="flex gap-2">
                    <input type="text" value={fbText} onChange={e => setFbText(e.target.value)}
                      placeholder={"What went wrong or what you'd change…"}
                      className="flex-1 text-sm px-3 py-2.5 rounded-xl outline-none"
                      style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }} />
                    {/* This button was broken three ways and looked fine: no
                        onStart/onEnd so it never changed, the handle thrown away
                        so a second tap orphaned a recogniser, and alert() on
                        failure — which this file's own comment says wedges a
                        WebView. MicButton fixes all three and animates. */}
                    <MicButton
                      size={40}
                      onText={(t) => setFbText((prev) => (prev ? prev + " " + t : t))}
                      onNotice={setVoiceError}
                      style={{ borderRadius: 12, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b" }}
                    />
                    <button onClick={submitFeedback} disabled={fbSending || !fbText.trim()}
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#f59e0b" }}>
                      <i className="ti ti-send text-sm text-white" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Programming Note sheet (trainer only) -> trainer_notes for the Command Center */}
        {showAiNote && isTrainerSession && (
          <div className="fixed inset-0 z-[1000] flex items-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowAiNote(false)}>
            <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
              <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
              <div className="flex items-center gap-2 mb-1">
                {/* Trainer-only. Worth noting this one is AI *input*, not AI
                    output — what Dustin dictates here lands in trainer_notes
                    and becomes context the AI programs from later. The face is
                    still right: it is the thing that will remember it. */}
                <AiBadge size={20} mood="thinking" title="" />
                <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>AI Programming Note</h3>
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>Saved to {clientName ? clientName.split(" ")[0] + "'s" : "this client's"} programming notes ({currentExercise.exercises?.name}) for your Command Center chat.</p>
              <div className="flex gap-2">
                <input type="text" value={trainerNoteText} onChange={e => setTrainerNoteText(e.target.value)}
                  placeholder={"e.g. bump to 140 next week, elbows flaring…"}
                  className="flex-1 text-sm px-3 py-2.5 rounded-xl outline-none"
                  style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid rgba(139,92,246,0.3)" }} />
                <MicButton
                  size={40}
                  onText={(t) => setTrainerNoteText((prev) => (prev ? prev + " " + t : t))}
                  onListeningChange={setTrainerListening}
                  onNotice={setVoiceError}
                  style={{
                    borderRadius: 12,
                    background: trainerListening ? "#ef4444" : "rgba(139,92,246,0.2)",
                    border: "1px solid " + (trainerListening ? "#ef4444" : "rgba(139,92,246,0.3)"),
                    color: trainerListening ? "#fff" : "#8b5cf6",
                  }}
                />
                <button onClick={saveTrainerNote} disabled={savingNote || !trainerNoteText.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: noteSaved ? "#22c55e" : "#8b5cf6" }}>
                  <i className={`ti ${noteSaved ? "ti-check" : "ti-send"} text-sm text-white`} />
                </button>
              </div>
              {trainerListening && (
                <p className="text-xs mt-2 font-semibold" style={{ color: "#ef4444" }}>🎙 Listening — tap the square to stop.</p>
              )}
              {voiceError && <p className="text-xs mt-2" style={{ color: "#f5b34a" }}>{voiceError}</p>}
              {noteSaved && <p className="text-xs mt-2" style={{ color: "#22c55e" }}>Saved to this client&apos;s programming notes.</p>}
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="flex items-center justify-between px-3 pt-2 pb-2 flex-shrink-0 gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={discardSession} disabled={discarding}
              className="flex items-center gap-1 px-2.5 h-9 rounded-full"
              style={{ background: "rgba(255,90,90,0.16)", border: "1px solid rgba(255,90,90,0.4)" }}>
              <i className="ti ti-x text-sm" style={{ color: "#ff8a8a" }} />
              <span className="text-xs font-bold" style={{ color: "#ff8a8a" }}>Cancel</span>
            </button>
            <Link href={isTrainerSession && clientId ? `/clients/${clientId}` : "/home"}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)" }} aria-label="Exit to previous screen">
              <i className="ti ti-arrow-left text-base text-white/70" />
            </Link>
          </div>
          <div className="text-center min-w-0 flex-1">
            <p className="text-white/40 text-xs truncate">{day.label}</p>
            <p className="text-white/60 text-xs">{globalIdx + 1} / {totalExercises}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => setShowFeedback(true)} aria-label="Report an issue or feedback"
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.16)", border: "1px solid rgba(245,158,11,0.4)" }}>
              <i className="ti ti-flag text-base" style={{ color: "#f5b34a" }} />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mx-4 h-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand-primary)" }} />
        </div>
        {/* Live session volume. Sits in the existing gap under the progress bar,
            so it adds no height and moves nothing. Hidden until the first set is
            logged so an empty session doesn't show "0 lb". */}
        <div className="mx-4 mb-4 flex justify-end" style={{ height: 14 }}>
          {sessionVolume > 0 ? (
            <span className="text-[10px] font-bold tracking-wide"
              style={{ color: "rgba(255,255,255,0.34)", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(sessionVolume).toLocaleString()} LB MOVED
            </span>
          ) : null}
        </div>

        {/* Scroll region — the exercise HEADER and its notes only.
            
            Two rules have to hold at once and they used to be traded off against
            each other.

            Gerard, 7/31: a tall exercise pushed the Prev/Next/Complete bar off
            the bottom with nothing scrollable anywhere, so there was no way to
            advance, finish or leave. The fix put the header AND the sets in one
            flex-1 scroll box with the footer pinned below.

            {COACH_FIRST_NAME}, 8/1: that made the keyboard case worse. With the sets inside
            the flexible box, opening the keyboard squeezed that box to a sliver
            — set 1 visible, set 2 sheared in half — because the footer and the
            tab bar kept their full height in what was left.

            So the split is by ROLE, not by "everything above the footer":
              • header + notes  → scrollable. Unbounded content lives here.
              • set rows        → PINNED. Never compress, never scroll, always
                                  whole. They are the thing you came here to use.
              • footer          → pinned. Always reachable, at any height.

            Nothing here is conditioned on the keyboard. Keyboard-conditioned
            layout has caused roughly twenty bugs in this file and is banned. */}
        {/* PINNED, not scrollable. Gerard, 8/4: a screenshot mid-session with
            NO EXERCISE NAME anywhere — sets, Track chips, notes, but nothing
            saying what he was lifting.

            Nothing was missing from the data. This header used to live inside
            the shrinkable scroll box below, and flex-shrink:1 + min-h-0 lets a
            box collapse to ZERO when the pinned sets and footer want the space.
            On a shorter phone it did, and the name went with it — scrolled into
            a region with no height, so there was nothing to scroll.

            The name is the single thing this screen exists to tell you, so it
            gets the same treatment as the sets: pinned, never compressed. Only
            the meta pills and cue stay scrollable, which is what the 7/31 fix
            actually needed. A very long name clamps to two lines rather than
            growing without bound — the reason it was put in the scroll box. */}
        <div className="px-5 flex-shrink-0" style={{ flexShrink: 0 }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-primary)" }}>
            {currentSection.client_facing_name || currentSection.internal_name}
          </p>
          <div className="flex items-center gap-2.5">
            {/* A video known to be dead does not get a play button. Jennifer
                tapped one mid-set and got "the YouTube account associated with
                this video has been terminated" — a dead end dressed up as a
                feature. Better to show nothing than to offer something that
                fails: only 'dead' hides it, so an unchecked or errored video
                still shows, because absence of proof is not proof. */}
            {currentExercise?.exercises?.video_url && currentExercise.exercises.video_status !== "dead" && (() => {
              const __vid = __ytId(currentExercise.exercises.video_url);
              return (
                <button type="button" data-no-swipe aria-label="Play exercise demo"
                  onClick={() => setVideoUrl(currentExercise.exercises!.video_url!)}
                  style={{ position: 'relative', width: 60, height: 38, flexShrink: 0, borderRadius: 8, overflow: 'hidden', padding: 0, border: 'none', cursor: 'pointer', backgroundColor: '#111', backgroundImage: __vid ? ('url(https://img.youtube.com/vi/' + __vid + '/hqdefault.jpg)') : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '8px solid #fff', marginLeft: 1 }} />
                  </span>
                </button>
              );
            })()}
            {/* Dustin, 17 Aug: "I have to see the full name of every movement
                from logger screen." 0a512b4 (4 Aug) added WebkitLineClamp: 2
                here, which is the "changed back" he remembers — his screenshot
                shows "Cable Rope Tricep…" on a 27-character name.

                The clamp is gone, so nothing is ever hidden. The size steps
                down with length instead, so the heading stays about the same
                height rather than growing: at a fixed 20px the longest name he
                programs (55 characters) is four lines and pushes the Track
                chips and the whole set grid down the screen.

                Everything else on this row is untouched, and 317 of his 627
                movements still render at text-xl exactly as they do today. */}
            <h2 className={`${exerciseTitleSize(currentExercise.exercises?.name)} font-bold text-white leading-tight flex-1 min-w-0`}>
              {currentExercise.exercises?.name || "Exercise"}
            </h2>
            <button onClick={() => setHistoryExercise({ id: currentExercise.id, exId: currentExercise.exercises?.id, name: currentExercise.exercises?.name })}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} title="View history">
              <i className="ti ti-chart-bar text-base" style={{ color: "#7fa8ff" }} />
            </button>
            <button onClick={() => setSwapTargetPe(currentExercise)}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} title="Swap exercise">
              <i className="ti ti-switch-horizontal text-base" style={{ color: "#e0a83e" }} />
            </button>
            {/* The coach, in the row with the other per-exercise tools —
                deliberately NOT the floating button used everywhere else.
                
                CoachFab reads the keyboard height so it can hide itself, and
                this screen's oldest rule is that nothing here reacts to the
                keyboard: it pins its container instead, and every attempt to be
                clever about the keyboard in here has broken the layout. A button
                that is part of the row cannot cover anything and cannot move
                when the keyboard opens, so the rule stays intact and the coach
                is still one tap away mid-set.
                
                It also opens knowing which movement you are on. */}
            <button onClick={() => setCoachOpen(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }} title="Ask your coach">
              {/* The face, not a sparkle. This was one of the last two AI marks
                  in the app still wearing a generic glyph — deliberately left
                  until Dustin gave per-item permission for the logger, which he
                  did on 14 Aug. Same button, same 36px box, same row: only what
                  is inside it changed, so nothing about this screen's layout or
                  its keyboard behaviour moves. */}
              <AiBadge size={22} mood="lifting" title="" />
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch", flexGrow: 0, flexShrink: 1, flexBasis: "auto" }}>

        {/* Exercise header (V6 micro-pill) — one compact row: small video thumb + name +
            inline History/Swap. Meta as micro-pills, cue collapsed behind an info toggle to
            keep the header short so all sets sit above the keyboard. NO keyboard-conditioned
            layout — nothing here moves when the keyboard opens. */}
        <div className="px-5 mb-3 flex-shrink-0">
          <div className="flex gap-1.5 mt-2 flex-wrap items-center">
            {currentExercise.volume_value && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(14,165,233,0.15)", color: "var(--brand-primary)" }}>{currentExercise.volume_value}</span>
            )}
            {currentExercise.tempo && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{currentExercise.tempo}</span>
            )}
            {currentExercise.load_descriptor && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>{currentExercise.load_descriptor}</span>
            )}
            {xFields.includes("each_side") && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(14,165,233,0.15)", color: "var(--brand-primary)" }}>Each side</span>
            )}
            {currentExercise.cue && (
              <button type="button" onClick={() => setShowCue(v => !v)}
                className="text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: showCue ? "rgba(14,165,233,0.15)" : "rgba(255,255,255,0.06)", color: showCue ? "var(--brand-primary)" : "rgba(255,255,255,0.55)", border: "none" }}>
                <i className="ti ti-info-circle text-xs" /> Cue
              </button>
            )}
          </div>
          {showCue && currentExercise.cue && (
            <p className="text-xs mt-2 italic" style={{ color: "rgba(255,255,255,0.45)" }}>&ldquo;{currentExercise.cue}&rdquo;</p>
          )}
        </div>
        </div>
        {/* /scroll region — the exercise HEADER only. It is the one part of this
            screen whose height is unbounded (a long wrapped movement name), so
            it is the one part allowed to scroll. */}

        {/* Sets — a PINNED sibling of the scroll region, not a child of it.
            Inside it they inherited the box's squeeze when the keyboard opened.
            Out here they hold their full height no matter what is on screen. */}
        <div className="flex-shrink-0 px-5">
          <div className="flex items-center gap-2 mb-1" style={{ flexWrap: "wrap" }}>
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Track:</span>
            {chipList.map((f) => {
              const on = xFields.includes(f);
              return (
                <button key={f} type="button" onClick={() => saveFields(on ? xFields.filter((x: string) => x !== f) : [...xFields, f])}
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{ background: on ? "var(--brand-primary)" : "rgba(255,255,255,0.08)", color: on ? "white" : "rgba(255,255,255,0.5)", border: "none" }}>
                  {f === "weight" ? "Weight" : f === "reps" ? "Reps" : f === "time" ? "Time" : f === "speed" ? "Speed" : f === "hr" ? "HR" : f === "distance" ? "Distance" : "Each side"}
                </button>
              );
            })}
          </div>
          {/* Timer / Stopwatch — only on a movement that tracks time, and it
              appears the moment the Time chip above is switched on. */}
          {xFields.includes("time") && renderTimerModeSwitch(currentExercise.id)}
          <div className="flex gap-2 mb-2">
            <div className="w-8" />
            {xFields.includes("weight") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>{isPerHandLoad(currentExercise) ? "WEIGHT (lb/hand)" : "WEIGHT (lb)"}</div>}
            {xFields.includes("reps") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>REPS</div>}
            {/* TIME before DIST — the row below renders them in that order, and a
                header that disagrees puts "DIST (ft)" over the seconds box. Only
                reachable since distance became a real field on 12 Aug, because
                until then no movement could carry both. */}
            {xFields.includes("time") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>TIME (min)</div>}
            {xFields.includes("distance") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>DIST (ft)</div>}
            {xFields.includes("speed") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>SPEED (mph)</div>}
            {xFields.includes("hr") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>HR (bpm)</div>}
            {xFields.includes("time") && <div className="w-10" />}
            <div className="w-12" />
          </div>
          
              {peSets.map((setEntry, si) => (
            <div key={si} className="flex items-center gap-1.5 mb-1">
              <div className="w-8 text-center text-sm font-bold"
                style={{ color: setEntry.done ? "#22c55e" : "rgba(255,255,255,0.25)" }}>S{si + 1}</div>
              {xFields.includes("weight") && (<input type="text" value={setEntry.weight} onFocus={focusScroll} onBlur={() => { focusBlur(); if (setEntry.done) logSet(currentExercise.id, si); }}
                onChange={e => updateSet(currentExercise.id, si, "weight", e.target.value)}
                /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder=""
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="decimal" />)}
              {xFields.includes("reps") && (<input type="text" value={setEntry.reps} onFocus={focusScroll} onBlur={() => { focusBlur(); if (setEntry.done) logSet(currentExercise.id, si); }}
                onChange={e => updateSet(currentExercise.id, si, "reps", e.target.value)}
                /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder=""
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="numeric" />)}
              {xFields.includes("time") && (<input type="text" value={timeBoxText(currentExercise.id, si, setEntry.time)} readOnly
                /* Tapping the box still opens the picker — the time stays
                   editable, logged or not. It is only inert while its own
                   clock is running, where a tap means "I want to change the
                   number that is currently counting" and there is no sane
                   answer to that. Stop it first. */
                onClick={() => { if (!setTimerRunning(currentExercise.id, si)) setTimePick({ peId: currentExercise.id, si }); }}
                /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder="0:00"
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setTimerRunning(currentExercise.id, si) ? "rgba(245,179,74,0.14)" : setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setTimerRunning(currentExercise.id, si) ? "#ffe1b2" : setEntry.done ? "#22c55e" : "white",
                  border: setTimerRunning(currentExercise.id, si) ? "1px solid rgba(245,179,74,0.55)" : setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                  fontVariantNumeric: "tabular-nums",
                }} inputMode="decimal" />)}
              {xFields.includes("distance") && (<input type="text" value={setEntry.distance} onFocus={focusScroll} onBlur={() => { focusBlur(); if (setEntry.done) logSet(currentExercise.id, si); }}
                onChange={e => updateSet(currentExercise.id, si, "distance", e.target.value)}
                /* a logged set stays editable (Troy, 6/29) */ placeholder=""
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="decimal" />)}
              {xFields.includes("speed") && (<input type="text" value={setEntry.speed} onFocus={focusScroll} onBlur={() => { focusBlur(); if (setEntry.done) logSet(currentExercise.id, si); }}
                onChange={e => updateSet(currentExercise.id, si, "speed", e.target.value)}
                /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder=""
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="decimal" />)}
              {xFields.includes("hr") && (<input type="text" value={setEntry.hr} onFocus={focusScroll} onBlur={() => { focusBlur(); if (setEntry.done) logSet(currentExercise.id, si); }}
                onChange={e => updateSet(currentExercise.id, si, "hr", e.target.value)}
                /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder=""
                className="flex-1 min-w-0 text-center text-base font-bold py-1 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="numeric" />)}
              {xFields.includes("time") && renderSetTimerButton(currentExercise.id, si)}
              <button onClick={() => { if (setEntry.done) { unlogSet(currentExercise.id, si); } else { fx("log"); logSet(currentExercise.id, si); } }}
                disabled={saving}
                data-fx-own
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: setEntry.done ? "#22c55e" : "var(--brand-primary)" }}>
                {/* Logged sets draw the tick rather than snapping to it — reads as
                    "recorded", not merely "highlighted". Falls back to the plain
                    icon under prefers-reduced-motion via the .cw-check rules. */}
                {setEntry.done ? (
                  /* No enclosing circle any more: the icon Dustin picked is the
                     bare check. `.cw-check path` still draws it, and the CSS
                     degrades to a plain tick under prefers-reduced-motion. */
                  <svg className="cw-check" width="26" height="26" viewBox="0 0 52 52" aria-hidden>
                    {/* Same geometry as before — its length is ~35, which is what
                        `.cw-check path`'s stroke-dasharray: 36 is cut for. A longer
                        path would repeat the dash and never look finished. */}
                    <path d="M14 27l8 8 16-17" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  /* Dustin, 12 Aug: "that button that looks like a play button
                     to log stuff needs to change icons, that's confusing."
                     He is right — it never played anything. It logs the set,
                     and the timer is a separate control. A play triangle next
                     to a countdown is actively misleading about which one
                     starts the clock.

                     13 Aug, from the mockups: a BARE check, no circle — the
                     biggest, most legible mark at arm's length, which is the
                     distance this is actually read from. Unlogged it is drawn
                     faint; logging it draws the same tick solid, so the
                     animation reads as the mark being made rather than one
                     icon being swapped for a different one. */
                  <i className="ti ti-check text-2xl" style={{ color: "rgba(255,255,255,0.45)" }} />
                )}
              </button>
            </div>
          ))}
        {/* Consolidated toolbar: set stepper + Check all + (trainer) AI note */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center rounded-xl overflow-hidden flex-shrink-0" style={{ border: "1px dashed rgba(255,255,255,0.22)" }}>
            <button type="button" onClick={() => removeSetRow(currentExercise.id)} aria-label="Remove set" className="w-9 h-10 flex items-center justify-center text-lg" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }}>&#8722;</button>
            <span className="px-2 text-[11px] font-semibold whitespace-nowrap" style={{ color: "rgba(255,255,255,0.7)" }}>{peSets.length} sets</span>
            <button type="button" onClick={() => addSetRow(currentExercise.id)} aria-label="Add set" className="w-9 h-10 flex items-center justify-center text-lg" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.85)" }}>&#65291;</button>
          </div>
          <button type="button" onClick={logAllCurrentSets} className="flex-1 h-10 rounded-xl text-sm font-semibold text-white" style={{ background: "var(--brand-primary)" }}>Check all</button>
          {isTrainerSession && (
            <button type="button" onClick={() => setShowAiNote(true)} className="flex items-center gap-1 px-3 h-10 rounded-xl text-xs font-semibold flex-shrink-0" style={{ background: "rgba(139,92,246,0.16)", color: "#b79cf7", border: "1px solid rgba(139,92,246,0.3)" }}>
              <AiBadge size={16} mood="thinking" title="" /> AI note
            </button>
          )}
        </div>

        </div>

        {/* Per-exercise notes — client or trainer flags an issue with THIS movement
            (pain, couldn't do it, form). Saved to exercise_notes keyed by exercise so
            programming (app + chat) reads the history.

            DELIBERATELY THE LAST THING ABOVE THE FOOTER. {COACH_FIRST_NAME}'s rule for this
            screen: when the keyboard comes up it may cover this card and
            nothing else — every set row stays visible and nothing on screen
            moves. That only works if the notes are BELOW the sets, so the
            keyboard eats them from the bottom instead of eating a set row.
            Putting them above the sets (8/1, briefly) pushed the sets down into
            the keyboard, which is the whole problem this screen keeps having. */}
        <div className="mb-4 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <i className="ti ti-message-report text-sm" style={{ color: "var(--brand-primary)" }} />
            <p className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.75)" }}>Notes on this movement</p>
          </div>
          {exNotePrior.length > 0 && (
            <div className="mb-2 space-y-1" style={{ maxHeight: 96, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {exNotePrior.map(n => (
                <div key={n.id} className="text-[11px] rounded-lg px-2 py-1" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)" }}>
                  <span style={{ color: "var(--brand-primary)" }}>{n.author === "trainer" ? "You" : "Client"}: </span>{n.note}
                </div>
              ))}
            </div>
          )}
          {/* Dustin, 12 Aug: "when adding notes in logger you cant see the text
              box". He was right, and it was the cost of the rule directly
              above — notes sit last SO the keyboard covers them instead of a
              set row. That protects the sets and hides what you are typing.

              Rather than trade one for the other, typing happens in a sheet.
              Tapping here opens a panel whose input is at the TOP, so the
              keyboard shrinks the panel from below and the field it is
              shrinking towards stays visible.

              No listener, no measurement, no scrolling: the Android WebView
              already shrinks the layout viewport when the keyboard opens, and
              a fixed full-height panel simply occupies whatever is left. The
              logger behind it never moves, because it is pinned to stableH.
              This is the same rule as ever — do not react to the keyboard —
              applied to a surface where being covered is the actual problem. */}
          <button
            onClick={() => setNoteSheetOpen(true)}
            className="w-full flex items-center gap-2 text-left text-xs px-3 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.06)", color: exNoteText ? "white" : "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.15)" }}
          >
            <i className="ti ti-pencil text-sm flex-shrink-0" style={{ color: "var(--brand-primary)" }} />
            <span className="flex-1 truncate">{exNoteText || 'Pain, couldn\u2019t do it, form issue\u2026'}</span>
          </button>

          {noteSheetOpen && (
            <div
              className="fixed left-0 right-0 top-0 bottom-0 z-[1200] flex flex-col"
              style={{ background: "rgba(4,10,24,0.97)" }}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: "white" }}>Notes on this movement</p>
                <button
                  onClick={() => { setNoteSheetOpen(false); focusBlur(); }}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.85)" }}
                >Close</button>
              </div>

              {/* The input is FIRST and pinned, so it is the one thing the
                  keyboard can never reach. */}
              <div className="px-4 pb-3 flex gap-2 flex-shrink-0">
                <input
                  type="text" autoFocus value={exNoteText}
                  onChange={e => setExNoteText(e.target.value)}
                  onFocus={focusScroll} onBlur={focusBlur}
                  placeholder={'Pain, couldn\u2019t do it, form issue\u2026'}
                  className="flex-1 text-sm px-3 py-3 rounded-lg outline-none"
                  style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid var(--brand-primary)" }}
                />
                <button
                  onClick={async () => { await saveExerciseNote(); setNoteSheetOpen(false); }}
                  disabled={savingExNote || !exNoteText.trim()}
                  className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: exNoteSaved ? "#22c55e" : "var(--brand-primary)", opacity: (savingExNote || !exNoteText.trim()) ? 0.5 : 1 }}
                >
                  <i className={`ti ${exNoteSaved ? "ti-check" : "ti-send"} text-base text-white`} />
                </button>
              </div>

              {/* Earlier notes fill whatever is left. The keyboard covering
                  these is fine — they are reference, not what you are typing. */}
              <div className="px-4 pb-4 space-y-1.5" style={{ flexGrow: 1, flexShrink: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
                {exNotePrior.length === 0 && (
                  <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>No earlier notes on this movement.</p>
                )}
                {exNotePrior.map(n => (
                  <div key={n.id} className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)" }}>
                    <span style={{ color: "var(--brand-primary)" }}>{n.author === "trainer" ? "You" : "Client"}: </span>{n.note}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Spacer. The scroll box above is flex: 0 1 auto — it takes its NATURAL
            height and only shrinks (into scrolling) when the content genuinely
            does not fit. Making it flex-1 instead made it eat every spare pixel
            and shove the sets to the bottom of the screen, hundreds of px below
            the exercise they belong to. This absorbs the slack instead, so the
            sets sit directly under the header where they have always been and
            the footer still holds the bottom. */}
        <div className="flex-1 min-h-0" />

        {/* Bottom controls (Prev/Next/Complete). */}
        <div className="flex-shrink-0 px-5 pb-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex gap-3">
            <button onClick={() => navigateToGlobal(Math.max(0, globalIdx - 1))} disabled={globalIdx === 0}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: globalIdx === 0 ? "rgba(255,255,255,0.2)" : "white" }}>
              <i className="ti ti-arrow-left mr-1" /> Prev
            </button>
            {/* Never let a failed finish look like a successful one. */}
            {completeError && (
              <div style={{ position: "absolute", left: 12, right: 12, bottom: 62, background: "#7f1d1d", color: "#fff", borderRadius: 12, padding: "9px 12px", fontSize: 12, lineHeight: 1.4, zIndex: 5 }}>
                {completeError}
              </div>
            )}
            {globalIdx < totalExercises - 1 ? (
              <button onClick={() => navigateToGlobal(globalIdx + 1)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}>
                Next <i className="ti ti-arrow-right ml-1" />
              </button>
            ) : (
              <button onClick={completeWorkout} disabled={saving}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all"
                style={{
                  background: completeError ? "#ef4444" : progressPct === 100 ? "#22c55e" : "rgba(255,255,255,0.06)",
                  color: completeError || progressPct === 100 ? "white" : "rgba(255,255,255,0.3)",
                }}>
                {saving ? "Saving\u2026" : completeError ? "Try again \u21bb" : "Complete \u2713"}
              </button>
            )}
          </div>
        </div>
        {/* App tabs. Removed briefly on 8/1 to buy back height for the sets;
            put straight back at ${COACH_FIRST_NAME}'s request — he uses them mid-session.
            They are affordable again because of the restructure above: the sets
            are flex-shrink-0 OUTSIDE the scroll box now, so when the keyboard
            opens it is the header box and the spacer that give up height, never
            the set rows. Removing the tabs was solving the symptom; pinning the
            sets was the actual fix. */}
        <div className="flex-shrink-0 flex" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0c1626", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {(isTrainerSession
            ? [
                { href: "/home", icon: "ti-home", label: "Home" },
                { href: clientId ? `/nutrition?clientId=${clientId}` : "/nutrition", icon: "ti-salad", label: "Nutrition" },
                { href: clientId ? `/progress?clientId=${clientId}` : "/progress", icon: "ti-chart-line", label: "Progress" },
                { href: clientId ? `/clients/${clientId}` : "/clients", icon: "ti-user", label: clientName ? clientName.split(" ")[0] : "Client" },
              ]
            : [
                { href: "/home", icon: "ti-home", label: "Home" },
                { href: "/nutrition", icon: "ti-salad", label: "Nutrition" },
                { href: "/progress", icon: "ti-chart-line", label: "Progress" },
                { href: "/settings", icon: "ti-settings", label: "Settings" },
              ]
          ).map((tab) => (
            <Link key={tab.href} href={tab.href} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2" style={{ color: "rgba(255,255,255,0.6)" }}>
              <i className={`ti ${tab.icon} text-lg`} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>{tab.label}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // \u2500\u2500\u2500 STANDARD VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh", paddingBottom: 96 }}>
      {/* "Can we make phone stay open during session?" (7/8) — the wake lock was
          wired to session mode only, so the day-card view, which is how most
          people actually log, still went dark between sets. The logger being
          open at all is the signal. Auto-released by the browser the moment the
          tab is hidden; no-ops where unsupported. */}
      <WakeLock active />
      {videoUrl && <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />}
      {historyExercise && (
        <ExerciseHistory exerciseId={historyExercise.id} exId={historyExercise.exId} clientId={clientId} exerciseName={historyExercise.name}
          onClose={() => setHistoryExercise(null)}
          onPrefill={(w, r) => prefillSets(historyExercise.id, w, r)} />
      )}
      {restTimer !== null && <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />}
        {timePick && <TimePickerSheet initial={parseTimeToSecs(sets[timePick.peId]?.[timePick.si]?.time || "") || 0} onSet={(secs) => { updateSet(timePick.peId, timePick.si, "time", fmtSecs(secs)); setTimePick(null); }} onClose={() => setTimePick(null)} />}
      {swapTargetPe && <SwapModal pe={swapTargetPe} onClose={() => setSwapTargetPe(null)} onSwap={handleSwap} />}

      {/* 117353cd: the week's programming brief, on his first session with this
          client each week. Trainer-only and inline — never a blocking overlay,
          because he opens this standing in front of the client. */}
      {isTrainerSession && clientId && <WeeklyBriefCard clientId={clientId} />}

      {isTrainerSession && clientName && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium" style={{ background: "#f59e0b", color: "white" }}>
          <i className="ti ti-user-bolt text-sm" />
          Running session for <strong className="ml-1">{clientName}</strong>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "var(--brand-primary)" }} className="px-4 pt-1.5 pb-2">
        <div className="flex items-center gap-3 mb-2">
          <Link href={isTrainerSession ? `/clients/${clientId}` : "/home"}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <i className="ti ti-arrow-left text-white text-lg" />
          </Link>
          <div className="flex-1">
            <p className="text-white/60 text-xs">{program?.name} {'\u00b7'} {phase?.label}</p>
            <h1 className="text-white font-bold text-base">{day.label}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setSessionCancelled(false); setSessionMode(true); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
              <i className="ti ti-maximize text-sm" /> Session
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: "rgba(255,255,255,0.9)" }} />
          </div>
          <span className="text-white/70 text-xs font-medium">{progressPct}%</span>
        </div>
      </div>

      {clientId && <OffPlanBanner clientId={clientId} dayId={day.id} />}

      <div className="px-4 -mt-2 pb-8">
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto py-1.5 no-scrollbar">
          {localSections.map((sec, i) => (
            <button key={sec.id} onClick={() => { setActiveSectionIdx(i); setActiveExerciseIdx(0); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
              style={i === activeSectionIdx
                ? { background: "var(--brand-primary)", color: "white", borderColor: "var(--brand-primary)" }
                : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", borderColor: "var(--brand-border)" }}>
              {sec.client_facing_name || sec.internal_name}
            </button>
          ))}
        </div>

        {/* Exercise cards */}
        {currentSection?.prescribed_exercises.map((pe, i) => {
          const peSets = sets[pe.id] || [];
          const doneCount = peSets.filter(s => s.done).length;
          const isActive = i === activeExerciseIdx;
          const allDone = doneCount === pe.sets;
          const cardio = isCardioEx(pe);
          const sFields: string[] = cardio ? [] : (fieldCfg[pe.id] || defaultTrackedFields(pe));
          const nCols = ["weight", "reps", "time", "distance"].filter(f => sFields.includes(f)).length;
          // A timed movement gets one more fixed column for its timer button.
          // Fixed, not 1fr, so the input columns keep the width they had.
          const sTimer = sFields.includes("time");
          const sGrid = nCols > 0
            ? `28px repeat(${nCols}, 1fr)${sTimer ? " 40px" : ""} 40px`
            : "28px 1fr 40px";
          const cardioFields: string[] = fieldCfg[pe.id] || (((pe as any).tracked_fields && (pe as any).tracked_fields.some((f: string) => ["time","speed","hr"].includes(f))) ? (pe as any).tracked_fields : ["time", "speed", "hr"]);
          return (
            <div key={pe.id} className="rounded-2xl mb-3 overflow-hidden cursor-pointer"
              onClick={() => setActiveExerciseIdx(i)}
              style={{
                background: "var(--brand-surface)",
                border: isActive ? "1.5px solid var(--brand-primary)" : "1px solid var(--brand-border)",
              }}>
              <div className="flex items-start gap-3 p-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: allDone ? "#22c55e20" : "var(--brand-card)" }}>
                  {allDone
                    ? <i className="ti ti-check text-base" style={{ color: "#22c55e" }} />
                    : <span className="text-xs font-bold" style={{ color: "var(--brand-text-secondary)" }}>{i + 1}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{pe.exercises?.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                        {pe.sets} sets{pe.volume_value ? ` \u00b7 ${pe.volume_value}` : ""}{pe.load_descriptor ? ` \u00b7 ${pe.load_descriptor}` : ""}{sFields.includes("each_side") ? " \u00b7 each side" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      {/* The "watch demo" button was removed in favour of tapping
                          the video itself — but only the session view ever got a
                          video to tap. This card had neither. Same rule as there:
                          a demo known to be dead gets no play button. */}
                      {pe.exercises?.video_url && pe.exercises.video_status !== "dead" && (() => {
                        const __v = __ytId(pe.exercises.video_url);
                        return (
                          <button onClick={e => { e.stopPropagation(); setVideoUrl(pe.exercises!.video_url!); }}
                            aria-label="Play exercise demo"
                            style={{ position: "relative", width: 46, height: 30, flexShrink: 0, borderRadius: 7, overflow: "hidden", padding: 0, border: "none", cursor: "pointer", backgroundColor: "#111", backgroundImage: __v ? ("url(https://img.youtube.com/vi/" + __v + "/hqdefault.jpg)") : "none", backgroundSize: "cover", backgroundPosition: "center" }}>
                            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <span style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: "7px solid #fff", marginLeft: 1 }} />
                            </span>
                          </button>
                        );
                      })()}
                      <button onClick={e => { e.stopPropagation(); setHistoryExercise({ id: pe.id, exId: pe.exercises?.id, name: pe.exercises?.name }); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--brand-card)" }} title="View history">
                        <i className="ti ti-chart-bar text-sm" style={{ color: "var(--brand-primary)" }} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setSwapTargetPe(pe); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--brand-card)" }} title="Swap exercise">
                        <i className="ti ti-switch-horizontal text-sm" style={{ color: "#d9962b" }} />
                      </button>
                      <div className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{
                          background: allDone ? "#22c55e20" : "var(--brand-card)",
                          color: allDone ? "#22c55e" : "var(--brand-text-secondary)",
                        }}>
                        {doneCount}/{pe.sets}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isActive && (
                <div className="px-4 pb-4" style={{ borderTop: "1px solid var(--brand-border)" }}>
                  {pe.cue && (
                    <p className="text-xs italic pt-3 mb-3" style={{ color: "var(--brand-text-secondary)" }}>
                      &ldquo;{pe.cue}&rdquo;
                    </p>
                  )}
                  {cardio ? (<><div className="flex items-center gap-1.5 mb-2 mt-3 flex-wrap"><span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Track:</span>{([["time","Time"],["speed","Speed"],["hr","HR"]] as [string,string][]).map(([f, lab]) => { const on = cardioFields.includes(f); return (<button key={f} type="button" onClick={e => { e.stopPropagation(); saveCardioFields(pe.id, on ? cardioFields.filter((x: string) => x !== f) : [...cardioFields, f], pe.exercise_id ?? undefined); }} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: on ? "var(--brand-primary)" : "var(--brand-card)", color: on ? "white" : "var(--brand-text-secondary)", border: "none" }}>{lab}</button>); })}</div>{peSets.map((setEntry, si) => (<div key={si} className="flex items-center gap-1.5 mb-2"><div className="w-6 text-center text-xs font-bold" style={{ color: setEntry.done ? "#22c55e" : "var(--brand-text-secondary)" }}>{si + 1}</div>{cardioFields.includes("time") && (<input type="text" value={setEntry.time} onChange={e => updateSet(pe.id, si, "time", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }} /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={"min"} className="flex-1 min-w-0 text-center text-sm font-semibold py-2.5 rounded-xl outline-none" style={{ background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)", color: setEntry.done ? "#22c55e" : "var(--brand-text)", border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}` }} inputMode="decimal" />)}{cardioFields.includes("speed") && (<input type="text" value={setEntry.speed} onChange={e => updateSet(pe.id, si, "speed", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }} /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={"mph"} className="flex-1 min-w-0 text-center text-sm font-semibold py-2.5 rounded-xl outline-none" style={{ background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)", color: setEntry.done ? "#22c55e" : "var(--brand-text)", border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}` }} inputMode="decimal" />)}{cardioFields.includes("hr") && (<input type="text" value={setEntry.hr} onChange={e => updateSet(pe.id, si, "hr", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }} /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={"bpm"} className="flex-1 min-w-0 text-center text-sm font-semibold py-2.5 rounded-xl outline-none" style={{ background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)", color: setEntry.done ? "#22c55e" : "var(--brand-text)", border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}` }} inputMode="numeric" />)}<button onClick={e => { e.stopPropagation(); if (setEntry.done) { unlogSet(pe.id, si); } else { logSet(pe.id, si); } }} disabled={saving} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all flex-shrink-0" style={{ background: setEntry.done ? "#22c55e" : "var(--brand-primary)" }}><i className="ti ti-check text-sm text-white" /></button></div>))}</>) : (<><div className="flex items-center gap-1.5 mb-1 mt-3 flex-wrap"><span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Track:</span>{([["weight","Weight"],["reps","Reps"],["time","Time"],["distance","Distance"],["each_side","Each side"]] as [string,string][]).map(([f, lab]) => { const on = sFields.includes(f); return (<button key={f} type="button" onClick={e => { e.stopPropagation(); saveCardioFields(pe.id, on ? sFields.filter((x: string) => x !== f) : [...sFields, f], pe.exercise_id ?? undefined); }} className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: on ? "var(--brand-primary)" : "var(--brand-card)", color: on ? "white" : "var(--brand-text-secondary)", border: "none" }}>{lab}</button>); })}</div>{sTimer && renderTimerModeSwitch(pe.id)}<div className="grid mb-2" style={{ gridTemplateColumns: sGrid, gap: "8px" }}>
                    <div />
                    {sFields.includes("weight") && <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>{isPerHandLoad(pe) ? "LBS/HAND" : "LBS"}</div>}
                    {sFields.includes("reps") && <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>REPS</div>}
                    {/* DIST before TIME — this view renders them in that order. */}
                    {sFields.includes("distance") && <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>DIST (ft)</div>}
                    {sFields.includes("time") && <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>TIME (min)</div>}
                    {sTimer && <div />}
                    <div />
                  </div>
                  {peSets.map((setEntry, si) => (
                    <div key={si} className="grid mb-2 items-center" style={{ gridTemplateColumns: sGrid, gap: "8px" }}>
                      <div className="text-center text-xs font-bold"
                        style={{ color: setEntry.done ? "#22c55e" : "var(--brand-text-secondary)" }}>
                        {si + 1}
                      </div>
                      {sFields.includes("weight") && (<input type="text" value={setEntry.weight}
                        onChange={e => updateSet(pe.id, si, "weight", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }}
                        /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={'\u2014'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }} inputMode="decimal" />)}
                      {sFields.includes("reps") && (<input type="text" value={setEntry.reps}
                        onChange={e => updateSet(pe.id, si, "reps", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }}
                        /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={'\u2014'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }} inputMode="numeric" />)}
                      {sFields.includes("distance") && (<input type="text" value={setEntry.distance}
                        onChange={e => updateSet(pe.id, si, "distance", e.target.value)} onBlur={() => { if (setEntry.done) logSet(pe.id, si); }}
                        /* a logged set stays editable (Troy, 6/29) */ placeholder={'\u2014'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }} inputMode="decimal" />)}
                      {sFields.includes("time") && (<input type="text" value={timeBoxText(pe.id, si, setEntry.time)} readOnly
                        /* inert only while its own clock runs — see the session view */
                        onClick={e => { e.stopPropagation(); if (!setTimerRunning(pe.id, si)) setTimePick({ peId: pe.id, si }); }}
                        /* a logged set stays editable (Troy, 6/29) — correcting 135 to 155 must not require un-logging first */ placeholder={'0:00'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setTimerRunning(pe.id, si) ? "rgba(245,179,74,0.14)" : setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setTimerRunning(pe.id, si) ? "#d08a12" : setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setTimerRunning(pe.id, si) ? "rgba(245,179,74,0.55)" : setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                          fontVariantNumeric: "tabular-nums",
                        }} inputMode="decimal" />)}
                      {sTimer && renderSetTimerButton(pe.id, si)}
                      <button onClick={e => { e.stopPropagation(); if (setEntry.done) { unlogSet(pe.id, si); } else { logSet(pe.id, si); } }}
                        disabled={saving}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                        style={{ background: setEntry.done ? "#22c55e" : "var(--brand-primary)" }}>
                        <i className="ti ti-check text-lg text-white" style={{ opacity: setEntry.done ? 1 : 0.5 }} />
                      </button>
                    </div>
                  ))}</>)}
                </div>
              )}
            </div>
          );
        })}

        {/* Trainer AI programming note */}
        {isTrainerSession && (
          <div className="rounded-2xl p-4 mb-3"
            style={{ background: "var(--brand-surface)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <div className="flex items-center gap-2 mb-3">
              <AiBadge size={18} mood="thinking" title="" />
              <p className="text-xs font-semibold" style={{ color: "#8b5cf6" }}>AI Programming Note</p>
            </div>
            <div className="flex gap-2">
              <input type="text" value={trainerNoteText} onChange={e => setTrainerNoteText(e.target.value)}
                placeholder={'Record a note for AI program adjustments\u2026'}
                className="flex-1 text-sm px-3 py-2.5 rounded-xl outline-none"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid rgba(139,92,246,0.3)" }} />
              {/* Second mount of the same note field. Its icon referenced no
                  listening state at all, so this mic sat dead still while
                  recording even before the animation existed. */}
              <MicButton
                size={40}
                onText={(t) => setTrainerNoteText((prev) => (prev ? prev + " " + t : t))}
                onListeningChange={setTrainerListening}
                onNotice={setVoiceError}
                style={{
                  borderRadius: 12,
                  background: trainerListening ? "#ef4444" : "rgba(139,92,246,0.1)",
                  border: "1px solid " + (trainerListening ? "#ef4444" : "rgba(139,92,246,0.3)"),
                  color: trainerListening ? "#fff" : "#8b5cf6",
                }}
              />
              <button onClick={saveTrainerNote} disabled={savingNote || !trainerNoteText.trim()}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: noteSaved ? "#22c55e" : "#8b5cf6" }}>
                <i className={`ti ${noteSaved ? "ti-check" : "ti-send"} text-sm text-white`} />
              </button>
            </div>
            {noteSaved && <p className="text-xs mt-2" style={{ color: "#22c55e" }}>Note saved!</p>}
          </div>
        )}

        {completeError && (
          <p style={{ background: "rgba(239,68,68,0.12)", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 12, padding: "9px 12px", fontSize: 12.5, lineHeight: 1.45, marginTop: 10 }}>
            {completeError}
          </p>
        )}
        <button onClick={completeWorkout} disabled={saving}
          className="w-full rounded-2xl py-4 text-sm font-bold transition-all mt-2"
          style={completeError
            ? { background: "#ef4444", color: "white" }
            : progressPct === 100
            ? { background: "#22c55e", color: "white" }
            : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
          {saving ? "Saving\u2026" : completeError ? "Try again \u21bb" : progressPct === 100 ? "\ud83c\udfc6 Complete Workout" : `${progressPct}% \u2014 keep going!`}
        </button>
      </div>
      {!sessionMode && (
        <>
          <style>{`@keyframes ssbbounce{0%,100%{transform:translateY(0);box-shadow:0 8px 22px rgba(124,156,245,.45)}18%{transform:translateY(-13px);box-shadow:0 22px 38px rgba(124,156,245,.7)}36%{transform:translateY(0);box-shadow:0 8px 22px rgba(124,156,245,.45)}54%{transform:translateY(-6px)}72%{transform:translateY(0)}}`}</style>
          <button
            onClick={() => { setSessionCancelled(false); setSessionMode(true); }}
            aria-label="Start session and log"
            style={{
              position: "fixed", left: 12, right: 12, maxWidth: 520, margin: "0 auto",
              bottom: "calc(64px + env(safe-area-inset-bottom, 0px))", zIndex: 40,
              border: "none", borderRadius: 16, cursor: "pointer", padding: 15,
              fontSize: 16, fontWeight: 800, color: "#fff",
              background: isTrainerSession ? "#6366f1" : "var(--brand-primary)",
              animation: "ssbbounce 1.5s ease-in-out infinite",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {isTrainerSession ? `▶ Start ${clientName || "Client"}'s Session` : "▶ Start Session & Log"}
          </button>
        </>
      )}
    </div>
  );
}
