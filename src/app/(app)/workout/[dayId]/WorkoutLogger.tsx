"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Exercise {
  id: string;
  name: string;
  modality?: string | null;
  muscle_group: string | null;
  equipment_required?: string[] | null;
  video_url?: string | null;
}

interface PrescribedExercise {
  tracked_fields?: string[] | null;
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
}

type SetData = { weight: string; reps: string; done: boolean };
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

function TimerWheel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"timer" | "stopwatch">("timer");
  const [timerMins, setTimerMins] = useState(1);
  const [timerSecs, setTimerSecs] = useState(30);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalTimerSecs = timerMins * 60 + timerSecs;

  function start() {
    setElapsed(mode === "timer" ? totalTimerSecs : 0);
    setExpired(false);
    setRunning(true);
  }
  function pause() { setRunning(false); }
  function reset() {
    setRunning(false);
    setElapsed(mode === "timer" ? totalTimerSecs : 0);
    setExpired(false);
  }

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsed(prev => {
        if (mode === "stopwatch") return prev + 1;
        const next = prev - 1;
        if (next <= 0) {
          setRunning(false);
          setExpired(true);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]);

  const displaySecs = elapsed;
  const m = Math.floor(displaySecs / 60);
  const s = displaySecs % 60;
  const mins = Array.from({ length: 100 }, (_, i) => i);
  const secs = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-10" style={{ background: "var(--brand-surface)" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />

        {/* Mode toggle */}
        <div className="flex rounded-xl overflow-hidden mb-6 border" style={{ borderColor: "var(--brand-border)" }}>
          {(["timer", "stopwatch"] as const).map(md => (
            <button key={md} onClick={() => { setMode(md); reset(); }}
              className="flex-1 py-2.5 text-sm font-semibold transition-all capitalize"
              style={mode === md
                ? { background: "var(--brand-primary)", color: "white" }
                : { background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
              {md === "timer" ? "\u23f1 Timer" : "\u23f2 Stopwatch"}
            </button>
          ))}
        </div>

        {!running && !expired && mode === "timer" ? (
          <div className="relative flex items-center justify-center gap-4 mb-4" style={{ userSelect: "none" }}>
            {/* Selection highlight */}
            <div className="absolute left-0 right-0 pointer-events-none rounded-xl"
              style={{ top: "50%", transform: "translateY(-50%)", height: 56, background: "var(--brand-primary)", opacity: 0.1, zIndex: 1 }} />
            <div style={{ flex: 1 }}>
              <p className="text-center text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>MIN</p>
              <WheelColumn values={mins} selected={timerMins} onChange={setTimerMins} />
            </div>
            <div className="text-3xl font-bold" style={{ color: "var(--brand-text-secondary)", zIndex: 2 }}>:</div>
            <div style={{ flex: 1 }}>
              <p className="text-center text-xs uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>SEC</p>
              <WheelColumn values={secs} selected={timerSecs} onChange={setTimerSecs} />
            </div>
          </div>
        ) : (
          <div className={`text-center py-6 ${expired ? "animate-pulse" : ""}`}>
            <div className="text-7xl font-black tabular-nums tracking-tight"
              style={{ color: expired ? "#ef4444" : "var(--brand-primary)" }}>
              {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
            </div>
            {expired && <p className="text-sm font-semibold mt-2" style={{ color: "#ef4444" }}>Time&apos;s up!</p>}
            {mode === "stopwatch" && (
              <p className="text-xs mt-2" style={{ color: "var(--brand-text-secondary)" }}>
                {Math.floor(elapsed / 3600) > 0 && `${Math.floor(elapsed / 3600)}h `}elapsed
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-2">
          <button onClick={reset} className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-rotate-clockwise text-lg" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          <button onClick={running ? pause : start}
            className="flex-1 h-12 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2"
            style={{ background: expired ? "#ef4444" : "var(--brand-primary)" }}>
            <i className={`ti ${running ? "ti-player-pause" : "ti-player-play"} text-lg`} />
            {running ? "Pause" : expired ? "Restart" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}

// \u2500\u2500\u2500 EXERCISE HISTORY DRAWER \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function ExerciseHistory({ exerciseId, exerciseName, onClose, onPrefill }: {
  exerciseId: string;
  exerciseName: string;
  onClose: () => void;
  onPrefill?: (weight: string, reps: string) => void;
}) {
  const supabase = createClient();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("set_logs")
        .select("set_number, weight_lbs, reps, workout_logs(log_date)")
        .eq("prescribed_exercise_id", exerciseId)
        .eq("completed", true)
        .order("logged_at", { ascending: false })
        .limit(64);

      if (data) {
        const grouped: Record<string, HistoryEntry> = {};
        for (const row of data as any[]) {
          const date = row.workout_logs?.log_date || "unknown";
          if (!grouped[date]) grouped[date] = { log_date: date, sets: [] };
          grouped[date].sets.push({ set_number: row.set_number, weight_lbs: row.weight_lbs, reps: row.reps });
        }
        setHistory(Object.values(grouped).slice(0, 8));
      }
      setLoading(false);
    }
    load();
  }, [exerciseId]);

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const lastSession = history[0];
  const lastWeight = lastSession?.sets?.[0]?.weight_lbs;
  const lastReps = lastSession?.sets?.[0]?.reps;

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 max-h-[75vh] overflow-y-auto"
        style={{ background: "var(--brand-surface)" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>History</p>
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
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
      const { data } = await supabase
        .from("exercises")
        .select("id, name, modality, muscle_group, equipment_required")
        .ilike("name", `%${query}%`)
        .limit(30);
      setResults(data || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 pb-10 max-h-[80vh] flex flex-col"
        style={{ background: "var(--brand-surface)" }} onClick={e => e.stopPropagation()}>
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
                <p className="font-semibold text-sm truncate" style={{ color: "var(--brand-text)" }}>{ex.name}</p>
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
function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&?#]+)/);
  const id = m ? m[1] : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
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
  existingLogId, existingSetLogs,
}: Props) {
  const supabase = createClient();

  const buildInitialSets = (): Record<string, SetData[]> => {
    const result: Record<string, SetData[]> = {};
    for (const section of sections) {
      for (const pe of section.prescribed_exercises) {
        const logs = existingSetLogs.filter(sl => sl.prescribed_exercise_id === pe.id);
        result[pe.id] = Array.from({ length: pe.sets }, (_, i) => {
          const ex = logs.find(l => l.set_number === i + 1);
          return { weight: ex?.weight_lbs?.toString() || "", reps: ex?.reps?.toString() || "", done: ex?.completed ?? false };
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
  const [sessionMode, setSessionMode] = useState(false);
  const [restTimer, setRestTimer] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fieldCfg, setFieldCfg] = useState<Record<string, string[]>>({});
  const [historyExercise, setHistoryExercise] = useState<{ id: string; name: string } | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const [listening, setListening] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [trainerNoteText, setTrainerNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [localSections, setLocalSections] = useState<Section[]>(sections);
  const [swapTargetPe, setSwapTargetPe] = useState<PrescribedExercise | null>(null);

  // --- Auto-save / resume draft: persists logged sets so leaving the browser never loses progress ---
  const __draftKey = `symmetry_wl_${clientId || 'me'}_${day?.id || 'day'}_${isTrainerSession ? 't' : 'c'}`;
  const __hydrated = useRef(false);
  const __snapshot = () => ({ sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, savedAt: Date.now() });
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(__draftKey) : null;
      if (raw) {
        const d = JSON.parse(raw);
        if (d && typeof d === 'object') {
          if (d.sets && Object.keys(d.sets).length) setSets(d.sets);
          if (typeof d.activeSectionIdx === 'number') setActiveSectionIdx(d.activeSectionIdx);
          if (typeof d.activeExerciseIdx === 'number') setActiveExerciseIdx(d.activeExerciseIdx);
          if (typeof d.sessionMode === 'boolean') setSessionMode(d.sessionMode);
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
      if (workoutComplete) { window.localStorage.removeItem(__draftKey); return; }
      window.localStorage.setItem(__draftKey, JSON.stringify(__snapshot()));
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, workoutComplete]);
  useEffect(() => {
    const flush = () => {
      if (!__hydrated.current || workoutComplete) return;
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
  }, [sets, activeSectionIdx, activeExerciseIdx, sessionMode, sessionNote, workoutLogId, workoutComplete]);
  // --- end auto-save ---
  const recognitionRef = useRef<any>(null);

  const allFlat = localSections.flatMap(s => s.prescribed_exercises);
  const totalSets = Object.values(sets).reduce((a, arr) => a + arr.length, 0);
  const doneSets = Object.values(sets).reduce((a, arr) => a + arr.filter(s => s.done).length, 0);
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const currentSection = localSections[activeSectionIdx];
  const currentExercise = currentSection?.prescribed_exercises[activeExerciseIdx];
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

  async function ensureWorkoutLog(): Promise<string> {
    if (workoutLogId) return workoutLogId;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const { data, error } = await supabase.from("workout_logs").insert({
      client_id: clientId, day_id: day.id, log_date: today,
      started_at: new Date().toISOString(), completed: false,
    }).select("id").single();
    if (error) throw error;
    setWorkoutLogId(data.id);
    return data.id;
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

  async function logSet(peId: string, si: number) {
    setSaving(true);
    try {
      const logId = await ensureWorkoutLog();
      const s = sets[peId][si];
      await supabase.from("set_logs").upsert({
        workout_log_id: logId, prescribed_exercise_id: peId, client_id: clientId,
        set_number: si + 1, weight_lbs: s.weight ? parseFloat(s.weight) : null,
        reps: s.reps ? parseInt(s.reps) : null, completed: true, logged_at: new Date().toISOString(),
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

  async function completeWorkout() {
    setSaving(true);
    try {
      const logId = await ensureWorkoutLog();
      await supabase.from("workout_logs").update({
        completed: true, completed_at: new Date().toISOString(), status: "Done as planned",
        note: sessionNote || null,
      }).eq("id", logId);
      setWorkoutComplete(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } finally { setSaving(false); }
  }

  function startVoiceNote() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    recognitionRef.current = r;
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript || "";
      if (t) setSessionNote(prev => prev ? prev + " " + t : t);
    };
    r.start();
  }

  async function saveTrainerNote() {
    if (!trainerNoteText.trim()) return;
    setSavingNote(true);
    try {
      await supabase.from("trainer_notes").insert({
        client_id: clientId,
        day_id: day.id,
        note: trainerNoteText.trim(),
        created_at: new Date().toISOString(),
      });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
      setTrainerNoteText("");
    } catch(e) { console.error(e); }
    finally { setSavingNote(false); }
  }

  function startTrainerVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = false; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript || "";
      if (t) setTrainerNoteText(prev => prev ? prev + " " + t : t);
    };
    r.start();
  }

  // \u2500\u2500\u2500 WORKOUT COMPLETE \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  async function handleSwap(newExercise: Exercise) {
    if (!swapTargetPe) return;
    const peId = swapTargetPe.id;
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
    const xFields = fieldCfg[currentExercise.id] || (currentExercise as any).tracked_fields || ["weight", "reps"];
    const saveFields = async (nf: string[]) => { setFieldCfg(prev => ({ ...prev, [currentExercise.id]: nf })); try { await supabase.from("prescribed_exercises").update({ tracked_fields: nf }).eq("id", currentExercise.id); } catch {} };

    return (
      <div className="fixed inset-0 flex flex-col z-[100]" style={{ background: "#0D1117" }}>
        {restTimer !== null && <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />}
        {videoUrl && <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />}
        {historyExercise && (
          <ExerciseHistory exerciseId={historyExercise.id} exerciseName={historyExercise.name}
            onClose={() => setHistoryExercise(null)}
            onPrefill={(w, r) => prefillSets(currentExercise.id, w, r)} />
        )}
        {showTimer && <TimerWheel onClose={() => setShowTimer(false)} />}
        {swapTargetPe && <SwapModal pe={swapTargetPe} onClose={() => setSwapTargetPe(null)} onSwap={handleSwap} />}

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setSessionMode(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <i className="ti ti-minimize text-white text-base" />
          </button>
          <div className="text-center">
            <p className="text-white/40 text-xs">{day.label}</p>
            <p className="text-white/60 text-xs">{globalIdx + 1} / {totalExercises}</p>
          </div>
          <button onClick={() => setShowTimer(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <i className="ti ti-clock text-white/60 text-base" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mx-4 h-0.5 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand-primary)" }} />
        </div>

        {/* Exercise header */}
        <div className="px-5 mb-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--brand-primary)" }}>
                {currentSection.client_facing_name || currentSection.internal_name}
              </p>
              <h2 className="text-2xl font-bold text-white leading-tight">{currentExercise.exercises?.name}</h2>
            {currentExercise.exercises?.video_url && (
              <button type="button" onClick={() => setVideoUrl(currentExercise.exercises!.video_url!)}
                className="inline-flex items-center gap-1.5 mt-1.5 text-sm font-medium"
                style={{ color: "#60a5fa", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                <i className="ti ti-video text-base" /> Watch demo
              </button>
            )}
              {currentExercise.load_descriptor && (
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{currentExercise.load_descriptor}</p>
              )}
              {currentExercise.cue && (
                <p className="text-xs mt-1 italic" style={{ color: "rgba(255,255,255,0.35)" }}>
                  &ldquo;{currentExercise.cue}&rdquo;
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 ml-3 mt-1 flex-shrink-0">
              <button onClick={() => setHistoryExercise({ id: currentExercise.id, name: currentExercise.exercises?.name })}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                title="View history">
                <i className="ti ti-chart-bar text-white/50 text-base" />
              </button>
              <button onClick={() => setSwapTargetPe(currentExercise)}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                title="Swap exercise">
                <i className="ti ti-switch-horizontal text-white/50 text-base" />
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {currentExercise.volume_value && (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(14,165,233,0.15)", color: "var(--brand-primary)" }}>
                {currentExercise.volume_value}
              </span>
            )}
            {currentExercise.tempo && (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                {currentExercise.tempo}
              </span>
            )}
            {currentExercise.unilateral && (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                Unilateral
              </span>
            )}
          </div>
        </div>

        {/* Sets */}
        <div className="flex-1 overflow-y-auto px-5">
          {isTrainerSession && (
            <div className="flex items-center gap-2 mb-2" style={{ flexWrap: "wrap" }}>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Track:</span>
              {["weight", "reps"].map((f) => {
                const on = xFields.includes(f);
                return (
                  <button key={f} type="button" onClick={() => saveFields(on ? xFields.filter((x: string) => x !== f) : [...xFields, f])}
                    className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: on ? "var(--brand-primary)" : "rgba(255,255,255,0.08)", color: on ? "white" : "rgba(255,255,255,0.5)", border: "none" }}>
                    {f === "weight" ? "Weight" : "Reps"}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 mb-2">
            <div className="w-8" />
            {xFields.includes("weight") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>WEIGHT (lb)</div>}
            {xFields.includes("reps") && <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>REPS</div>}
            <div className="w-12" />
          </div>
          {peSets.map((setEntry, si) => (
            <div key={si} className="flex items-center gap-2 mb-2">
              <div className="w-8 text-center text-sm font-bold"
                style={{ color: setEntry.done ? "#22c55e" : "rgba(255,255,255,0.25)" }}>S{si + 1}</div>
              {xFields.includes("weight") && (<input type="number" value={setEntry.weight}
                onChange={e => updateSet(currentExercise.id, si, "weight", e.target.value)}
                disabled={setEntry.done} placeholder="0"
                className="flex-1 min-w-0 text-center text-xl font-bold py-2 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="decimal" />)}
              {xFields.includes("reps") && (<input type="number" value={setEntry.reps}
                onChange={e => updateSet(currentExercise.id, si, "reps", e.target.value)}
                disabled={setEntry.done} placeholder="0"
                className="flex-1 min-w-0 text-center text-xl font-bold py-2 rounded-lg outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }} inputMode="numeric" />)}
              <button onClick={() => { if (!setEntry.done) logSet(currentExercise.id, si); }}
                disabled={setEntry.done || saving}
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: setEntry.done ? "#22c55e" : "var(--brand-primary)" }}>
                <i className={`ti ${setEntry.done ? "ti-check" : "ti-player-play"} text-xl text-white`} />
              </button>
            </div>
          ))}
        </div>

        {/* Bottom controls */}
        <div className="flex-shrink-0 px-5 pb-8 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Session note */}
          <div className="flex items-center gap-2 mb-3">
            <input type="text" value={sessionNote} onChange={e => setSessionNote(e.target.value)}
              placeholder={'Session note\u2026'} className="flex-1 text-sm px-4 py-2.5 rounded-xl outline-none"
              style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.08)" }} />
            <button onClick={startVoiceNote}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: listening ? "#ef4444" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <i className={`ti ${listening ? "ti-microphone-off" : "ti-microphone"} text-base`}
                style={{ color: listening ? "white" : "rgba(255,255,255,0.4)" }} />
            </button>
          </div>

          {/* Trainer AI note */}
          {isTrainerSession && (
            <div className="mb-3 rounded-xl p-3" style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}>
              <div className="flex items-center gap-2 mb-2">
                <i className="ti ti-brain text-sm" style={{ color: "#8b5cf6" }} />
                <p className="text-xs font-semibold" style={{ color: "#8b5cf6" }}>AI Programming Note</p>
              </div>
              <div className="flex gap-2">
                <input type="text" value={trainerNoteText} onChange={e => setTrainerNoteText(e.target.value)}
                  placeholder={'Note for AI program adjustments\u2026'}
                  className="flex-1 text-xs px-3 py-2 rounded-lg outline-none"
                  style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(139,92,246,0.3)" }} />
                <button onClick={startTrainerVoice}
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.3)" }}>
                  <i className="ti ti-microphone text-sm" style={{ color: "#8b5cf6" }} />
                </button>
                <button onClick={saveTrainerNote} disabled={savingNote || !trainerNoteText.trim()}
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: noteSaved ? "#22c55e" : "rgba(139,92,246,0.8)" }}>
                  <i className={`ti ${noteSaved ? "ti-check" : "ti-send"} text-sm text-white`} />
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => navigateToGlobal(Math.max(0, globalIdx - 1))} disabled={globalIdx === 0}
              className="flex-1 py-3.5 rounded-2xl text-sm font-semibold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: globalIdx === 0 ? "rgba(255,255,255,0.2)" : "white" }}>
              <i className="ti ti-arrow-left mr-1" /> Prev
            </button>
            {globalIdx < totalExercises - 1 ? (
              <button onClick={() => navigateToGlobal(globalIdx + 1)}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold text-white"
                style={{ background: "var(--brand-primary)" }}>
                Next <i className="ti ti-arrow-right ml-1" />
              </button>
            ) : (
              <button onClick={completeWorkout} disabled={progressPct < 100 || saving}
                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold transition-all"
                style={{
                  background: progressPct === 100 ? "#22c55e" : "rgba(255,255,255,0.06)",
                  color: progressPct === 100 ? "white" : "rgba(255,255,255,0.3)",
                }}>
                {saving ? "Saving\u2026" : "Complete \u2713"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // \u2500\u2500\u2500 STANDARD VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {historyExercise && (
        <ExerciseHistory exerciseId={historyExercise.id} exerciseName={historyExercise.name}
          onClose={() => setHistoryExercise(null)}
          onPrefill={(w, r) => prefillSets(historyExercise.id, w, r)} />
      )}
      {restTimer !== null && <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />}
      {showTimer && <TimerWheel onClose={() => setShowTimer(false)} />}
      {swapTargetPe && <SwapModal pe={swapTargetPe} onClose={() => setSwapTargetPe(null)} onSwap={handleSwap} />}

      {isTrainerSession && clientName && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium" style={{ background: "#f59e0b", color: "white" }}>
          <i className="ti ti-user-bolt text-sm" />
          Running session for <strong className="ml-1">{clientName}</strong>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "var(--brand-primary)" }} className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
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
            <button onClick={() => setShowTimer(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <i className="ti ti-clock text-white text-base" />
            </button>
            <button onClick={() => setSessionMode(true)}
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

      <div className="px-4 -mt-2 pb-8">
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
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
                        {pe.sets} sets{pe.volume_value ? ` \u00b7 ${pe.volume_value}` : ""}{pe.load_descriptor ? ` \u00b7 ${pe.load_descriptor}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); setHistoryExercise({ id: pe.id, name: pe.exercises?.name }); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--brand-card)" }} title="View history">
                        <i className="ti ti-chart-bar text-sm" style={{ color: "var(--brand-primary)" }} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setSwapTargetPe(pe); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--brand-card)" }} title="Swap exercise">
                        <i className="ti ti-switch-horizontal text-sm" style={{ color: "var(--brand-text-secondary)" }} />
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
                  <div className="grid mb-2 mt-3" style={{ gridTemplateColumns: "28px 1fr 1fr 40px", gap: "8px" }}>
                    <div />
                    <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>LBS</div>
                    <div className="text-center text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>REPS</div>
                    <div />
                  </div>
                  {peSets.map((setEntry, si) => (
                    <div key={si} className="grid mb-2 items-center" style={{ gridTemplateColumns: "28px 1fr 1fr 40px", gap: "8px" }}>
                      <div className="text-center text-xs font-bold"
                        style={{ color: setEntry.done ? "#22c55e" : "var(--brand-text-secondary)" }}>
                        {si + 1}
                      </div>
                      <input type="number" value={setEntry.weight}
                        onChange={e => updateSet(pe.id, si, "weight", e.target.value)}
                        disabled={setEntry.done} placeholder={'\u2014'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }} inputMode="decimal" />
                      <input type="number" value={setEntry.reps}
                        onChange={e => updateSet(pe.id, si, "reps", e.target.value)}
                        disabled={setEntry.done} placeholder={'\u2014'}
                        className="w-full min-w-0 text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }} inputMode="numeric" />
                      <button onClick={e => { e.stopPropagation(); if (!setEntry.done) logSet(pe.id, si); }}
                        disabled={setEntry.done || saving}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                        style={{ background: setEntry.done ? "#22c55e" : "var(--brand-primary)" }}>
                        <i className="ti ti-check text-sm text-white" />
                      </button>
                    </div>
                  ))}
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
              <i className="ti ti-brain text-sm" style={{ color: "#8b5cf6" }} />
              <p className="text-xs font-semibold" style={{ color: "#8b5cf6" }}>AI Programming Note</p>
            </div>
            <div className="flex gap-2">
              <input type="text" value={trainerNoteText} onChange={e => setTrainerNoteText(e.target.value)}
                placeholder={'Record a note for AI program adjustments\u2026'}
                className="flex-1 text-sm px-3 py-2.5 rounded-xl outline-none"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid rgba(139,92,246,0.3)" }} />
              <button onClick={startTrainerVoice}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
                <i className="ti ti-microphone text-sm" style={{ color: "#8b5cf6" }} />
              </button>
              <button onClick={saveTrainerNote} disabled={savingNote || !trainerNoteText.trim()}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: noteSaved ? "#22c55e" : "#8b5cf6" }}>
                <i className={`ti ${noteSaved ? "ti-check" : "ti-send"} text-sm text-white`} />
              </button>
            </div>
            {noteSaved && <p className="text-xs mt-2" style={{ color: "#22c55e" }}>Note saved!</p>}
          </div>
        )}

        <button onClick={completeWorkout} disabled={saving || progressPct < 100}
          className="w-full rounded-2xl py-4 text-sm font-bold transition-all mt-2"
          style={progressPct === 100
            ? { background: "#22c55e", color: "white" }
            : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
          {saving ? "Saving\u2026" : progressPct === 100 ? "\ud83c\udfc6 Complete Workout" : `${progressPct}% \u2014 keep going!`}
        </button>
      </div>
    </div>
  );
}
