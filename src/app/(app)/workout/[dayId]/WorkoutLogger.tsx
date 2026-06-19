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
}

interface PrescribedExercise {
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
  label: string;
  position: number;
  notes: string | null;
  prescribed_exercises: PrescribedExercise[];
}

interface Props {
  day: { id: string; label: string; notes: string | null };
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
          <circle cx="80" cy="80" r="70" fill="none" stroke="#0EA5E9" strokeWidth="6"
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

function ExerciseHistory({ exerciseId, exerciseName, onClose }: { exerciseId: string; exerciseName: string; onClose: () => void }) {
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
        .limit(50);

      if (data) {
        const grouped: Record<string, HistoryEntry> = {};
        for (const row of data as any[]) {
          const date = row.workout_logs?.log_date || "unknown";
          if (!grouped[date]) grouped[date] = { log_date: date, sets: [] };
          grouped[date].sets.push({ set_number: row.set_number, weight_lbs: row.weight_lbs, reps: row.reps });
        }
        setHistory(Object.values(grouped).slice(0, 10));
      }
      setLoading(false);
    }
    load();
  }, [exerciseId]);

  function fmtDate(d: string) {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5 max-h-[70vh] overflow-y-auto"
        style={{ background: "var(--brand-surface)" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: "var(--brand-text-secondary)" }}>History</p>
            <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>{exerciseName}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--brand-card)" }}>
            <i className="ti ti-x text-sm" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading…</div>
        ) : history.length === 0 ? (
          <div className="py-8 text-center">
            <i className="ti ti-history text-3xl block mb-2" style={{ color: "var(--brand-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No history yet for this exercise</p>
          </div>
        ) : history.map((entry, i) => (
          <div key={i} className="mb-4 rounded-xl p-4"
            style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs font-semibold mb-2" style={{ color: "var(--brand-primary)" }}>{fmtDate(entry.log_date)}</p>
            {entry.sets.sort((a,b) => a.set_number - b.set_number).map(s => (
              <div key={s.set_number} className="flex items-center gap-3 py-1 text-sm">
                <span className="w-6 text-xs" style={{ color: "var(--brand-text-secondary)" }}>S{s.set_number}</span>
                <span className="font-medium" style={{ color: "var(--brand-text)" }}>
                  {s.weight_lbs ? `${s.weight_lbs} lb` : "BW"}
                </span>
                <span style={{ color: "var(--brand-text-secondary)" }}>×</span>
                <span style={{ color: "var(--brand-text)" }}>{s.reps ?? "—"} reps</span>
              </div>
            ))}
          </div>
        ))}
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
  const [historyExercise, setHistoryExercise] = useState<{ id: string; name: string } | null>(null);
  const [sessionNote, setSessionNote] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const allFlat = sections.flatMap(s => s.prescribed_exercises);
  const totalSets = Object.values(sets).reduce((a, arr) => a + arr.length, 0);
  const doneSets = Object.values(sets).reduce((a, arr) => a + arr.filter(s => s.done).length, 0);
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const currentSection = sections[activeSectionIdx];
  const currentExercise = currentSection?.prescribed_exercises[activeExerciseIdx];

  // Global exercise index for session mode navigation
  const globalIdx = sections.slice(0, activeSectionIdx).reduce((a, s) => a + s.prescribed_exercises.length, 0) + activeExerciseIdx;
  const totalExercises = allFlat.length;

  function navigateToGlobal(idx: number) {
    let count = 0;
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      for (let ei = 0; ei < sec.prescribed_exercises.length; ei++) {
        if (count === idx) { setActiveSectionIdx(si); setActiveExerciseIdx(ei); return; }
        count++;
      }
    }
  }

  async function ensureWorkoutLog(): Promise<string> {
    if (workoutLogId) return workoutLogId;
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase.from("workout_logs").insert({
      client_id: clientId, day_id: day.id, log_date: today,
      started_at: new Date().toISOString(), completed: false, status: "in_progress",
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
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
      // Start rest timer if rest is specified
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
        completed: true, completed_at: new Date().toISOString(), status: "completed",
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

  // ——— WORKOUT COMPLETE SCREEN ———
  if (workoutComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
        style={{ background: "var(--brand-bg)" }}>
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-full flex items-center justify-center"
            style={{ background: "#22c55e20" }}>
            <i className="ti ti-trophy text-5xl" style={{ color: "#22c55e" }} />
          </div>
          <div className="absolute -top-1 -right-1 text-2xl animate-bounce">🎉</div>
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-text)" }}>Session Complete!</h1>
        <p className="text-sm mb-2" style={{ color: "var(--brand-text-secondary)" }}>
          {day.label}
        </p>
        <p className="text-lg font-bold mb-6" style={{ color: "var(--brand-primary)" }}>
          {doneSets} sets logged
        </p>
        <Link href={isTrainerSession ? `/clients/${clientId}` : "/home"}
          className="inline-flex items-center gap-2 px-8 py-3 rounded-full font-semibold text-white"
          style={{ background: "var(--brand-primary)" }}>
          <i className="ti ti-check" /> Done
        </Link>
      </div>
    );
  }

  // ——— SESSION MODE (coaching cockpit) ———
  if (sessionMode && currentExercise) {
    const peSets = sets[currentExercise.id] || [];
    const doneCount = peSets.filter(s => s.done).length;
    const allDone = doneCount === currentExercise.sets;

    return (
      <div className="fixed inset-0 flex flex-col" style={{ background: "#0D1117" }}>
        {restTimer !== null && (
          <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />
        )}
        {historyExercise && (
          <ExerciseHistory exerciseId={historyExercise.id} exerciseName={historyExercise.name}
            onClose={() => setHistoryExercise(null)} />
        )}

        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-safe pt-4 pb-3 flex-shrink-0">
          <button onClick={() => setSessionMode(false)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <i className="ti ti-minimize text-white text-base" />
          </button>
          <div className="text-center">
            <p className="text-white/40 text-xs">{day.label}</p>
            <p className="text-white/60 text-xs">{globalIdx + 1} / {totalExercises}</p>
          </div>
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: progressPct === 100 ? "#22c55e20" : "rgba(255,255,255,0.08)" }}>
            <span className="text-xs font-bold" style={{ color: progressPct === 100 ? "#22c55e" : "white" }}>
              {progressPct}%
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mx-4 h-0.5 rounded-full mb-4" style={{ background: "rgba(255,255,255,0.08)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: "var(--brand-primary)" }} />
        </div>

        {/* Exercise name + history button */}
        <div className="px-5 mb-6 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--brand-primary)" }}>
                {currentSection.label}
              </p>
              <h2 className="text-2xl font-bold text-white leading-tight">
                {currentExercise.exercises?.name}
              </h2>
              {currentExercise.load_descriptor && (
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {currentExercise.load_descriptor}
                </p>
              )}
              {currentExercise.cue && (
                <p className="text-xs mt-1 italic" style={{ color: "rgba(255,255,255,0.35)" }}>
                  &ldquo;{currentExercise.cue}&rdquo;
                </p>
              )}
            </div>
            <button onClick={() => setHistoryExercise({ id: currentExercise.id, name: currentExercise.exercises?.name })}
              className="flex-shrink-0 ml-3 mt-1 w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <i className="ti ti-history text-white/50 text-base" />
            </button>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            {currentExercise.volume_value && (
              <span className="text-xs px-2.5 py-1 rounded-full"
                style={{ background: "rgba(14,165,233,0.15)", color: "#0EA5E9" }}>
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

        {/* Sets — BIG inputs */}
        <div className="flex-1 overflow-y-auto px-5">
          <div className="flex gap-2 mb-3">
            <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
              WEIGHT (lb)
            </div>
            <div className="flex-1 text-center text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
              REPS
            </div>
            <div className="w-14" />
          </div>
          {peSets.map((setEntry, si) => (
            <div key={si} className="flex items-center gap-3 mb-3">
              <div className="w-8 text-center text-sm font-bold"
                style={{ color: setEntry.done ? "#22c55e" : "rgba(255,255,255,0.25)" }}>
                S{si + 1}
              </div>
              <input type="number" value={setEntry.weight}
                onChange={e => updateSet(currentExercise.id, si, "weight", e.target.value)}
                disabled={setEntry.done} placeholder="0"
                className="flex-1 text-center text-3xl font-bold py-4 rounded-2xl outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }}
                inputMode="decimal" />
              <input type="number" value={setEntry.reps}
                onChange={e => updateSet(currentExercise.id, si, "reps", e.target.value)}
                disabled={setEntry.done} placeholder="0"
                className="flex-1 text-center text-3xl font-bold py-4 rounded-2xl outline-none"
                style={{
                  background: setEntry.done ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.06)",
                  color: setEntry.done ? "#22c55e" : "white",
                  border: setEntry.done ? "1px solid rgba(34,197,94,0.2)" : "1px solid rgba(255,255,255,0.08)",
                }}
                inputMode="numeric" />
              <button onClick={() => { if (!setEntry.done) logSet(currentExercise.id, si); }}
                disabled={setEntry.done || saving}
                className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: setEntry.done ? "#22c55e" : "var(--brand-primary)",
                  opacity: setEntry.done ? 1 : 1,
                }}>
                <i className={`ti ${setEntry.done ? "ti-check" : "ti-player-play"} text-xl text-white`} />
              </button>
            </div>
          ))}
        </div>

        {/* Bottom nav */}
        <div className="flex-shrink-0 px-5 pb-8 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {/* Session note */}
          <div className="flex items-center gap-2 mb-4">
            <input type="text" value={sessionNote}
              onChange={e => setSessionNote(e.target.value)}
              placeholder="Session note…"
              className="flex-1 text-sm px-4 py-2.5 rounded-xl outline-none"
              style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.08)" }} />
            <button onClick={startVoiceNote}
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: listening ? "#ef4444" : "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <i className={`ti ${listening ? "ti-microphone-off" : "ti-microphone"} text-base`}
                style={{ color: listening ? "white" : "rgba(255,255,255,0.4)" }} />
            </button>
          </div>
          <div className="flex gap-3">
            <button onClick={() => navigateToGlobal(Math.max(0, globalIdx - 1))}
              disabled={globalIdx === 0}
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
                {saving ? "Saving…" : "Complete ✓"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ——— STANDARD VIEW ———
  return (
    <div style={{ background: "var(--brand-bg)", minHeight: "100vh" }}>
      {historyExercise && (
        <ExerciseHistory exerciseId={historyExercise.id} exerciseName={historyExercise.name}
          onClose={() => setHistoryExercise(null)} />
      )}
      {restTimer !== null && (
        <RestTimer seconds={restTimer} onDone={() => setRestTimer(null)} />
      )}

      {/* Trainer banner */}
      {isTrainerSession && clientName && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-medium"
          style={{ background: "#f59e0b", color: "white" }}>
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
            <p className="text-white/60 text-xs">{program?.name} · {phase?.label}</p>
            <h1 className="text-white font-bold text-base">{day.label}</h1>
          </div>
          <button onClick={() => setSessionMode(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold"
            style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
            <i className="ti ti-maximize text-sm" /> Session
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, background: "#0EA5E9" }} />
          </div>
          <span className="text-white/70 text-xs font-medium">{progressPct}%</span>
        </div>
      </div>

      <div className="px-4 -mt-2 pb-8">
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
          {sections.map((sec, i) => (
            <button key={sec.id}
              onClick={() => { setActiveSectionIdx(i); setActiveExerciseIdx(0); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
              style={i === activeSectionIdx
                ? { background: "var(--brand-primary)", color: "white", borderColor: "var(--brand-primary)" }
                : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", borderColor: "var(--brand-border)" }}>
              {sec.label}
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
            <div key={pe.id}
              className="rounded-2xl mb-3 overflow-hidden cursor-pointer"
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
                      <p className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>
                        {pe.exercises?.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                        {pe.sets} sets{pe.volume_value ? ` · ${pe.volume_value}` : ""}
                        {pe.load_descriptor ? ` · ${pe.load_descriptor}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      <button onClick={e => { e.stopPropagation(); setHistoryExercise({ id: pe.id, name: pe.exercises?.name }); }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "var(--brand-card)" }}>
                        <i className="ti ti-history text-sm" style={{ color: "var(--brand-text-secondary)" }} />
                      </button>
                      <div className="text-xs font-medium px-2 py-1 rounded-full"
                        style={{
                          background: allDone ? "#22c55e20" : "var(--brand-card)",
                          color: allDone ? "#22c55e" : "var(--brand-text-secondary)"
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
                        disabled={setEntry.done} placeholder="—"
                        className="text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }}
                        inputMode="decimal" />
                      <input type="number" value={setEntry.reps}
                        onChange={e => updateSet(pe.id, si, "reps", e.target.value)}
                        disabled={setEntry.done} placeholder="—"
                        className="text-center text-base font-semibold py-2.5 rounded-xl outline-none"
                        style={{
                          background: setEntry.done ? "rgba(34,197,94,0.08)" : "var(--brand-bg)",
                          color: setEntry.done ? "#22c55e" : "var(--brand-text)",
                          border: `1px solid ${setEntry.done ? "rgba(34,197,94,0.2)" : "var(--brand-border)"}`,
                        }}
                        inputMode="numeric" />
                      <button onClick={e => { e.stopPropagation(); if (!setEntry.done) logSet(pe.id, si); }}
                        disabled={setEntry.done || saving}
                        className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                        style={{
                          background: setEntry.done ? "#22c55e" : "var(--brand-primary)",
                        }}>
                        <i className="ti ti-check text-sm text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Complete button */}
        <button onClick={completeWorkout} disabled={saving || progressPct < 100}
          className="w-full rounded-2xl py-4 text-sm font-bold transition-all mt-2"
          style={progressPct === 100
            ? { background: "#22c55e", color: "white" }
            : { background: "var(--brand-surface)", color: "var(--brand-text-secondary)", border: "1px solid var(--brand-border)" }}>
          {saving ? "Saving…" : progressPct === 100 ? "🏆 Complete Workout" : `${progressPct}% — keep going!`}
        </button>
      </div>
    </div>
  );
}
