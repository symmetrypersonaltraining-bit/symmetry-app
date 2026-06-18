"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Exercise {
  id: string;
  name: string;
  category: string | null;
  muscle_group: string | null;
  equipment: string | null;
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
  existingLogId: string | null;
  existingSetLogs: any[];
}

type SetData = {
  weight: string;
  reps: string;
  done: boolean;
};

export default function WorkoutLogger({
  day,
  phase,
  program,
  sections,
  clientId,
  existingLogId,
  existingSetLogs,
}: Props) {
  const supabase = createClient();

  // Build initial set state from existing logs
  const buildInitialSets = (): Record<string, SetData[]> => {
    const result: Record<string, SetData[]> = {};
    for (const section of sections) {
      for (const pe of section.prescribed_exercises) {
        const logs = existingSetLogs.filter(
          (sl) => sl.prescribed_exercise_id === pe.id
        );
        result[pe.id] = Array.from({ length: pe.sets }, (_, i) => {
          const existing = logs.find((l) => l.set_number === i + 1);
          return {
            weight: existing?.weight_lbs?.toString() || existing?.weight?.toString() || "",
            reps: existing?.reps?.toString() || "",
            done: existing?.completed ?? false,
          };
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

  const allExercises = sections.flatMap((s) => s.prescribed_exercises);
  const totalExercises = allExercises.length;

  // Count done sets across all exercises
  const totalSets = Object.values(sets).reduce((acc, arr) => acc + arr.length, 0);
  const doneSets = Object.values(sets).reduce(
    (acc, arr) => acc + arr.filter((s) => s.done).length,
    0
  );
  const progressPct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  async function ensureWorkoutLog(): Promise<string> {
    if (workoutLogId) return workoutLogId;
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({
        client_id: clientId,
        day_id: day.id,
        log_date: today,
        started_at: new Date().toISOString(),
        completed: false,
        status: "in_progress",
      })
      .select("id")
      .single();

    if (error) throw error;
    setWorkoutLogId(data.id);
    return data.id;
  }

  const updateSet = useCallback(
    (peId: string, setIdx: number, field: keyof SetData, value: string | boolean) => {
      setSets((prev) => {
        const updated = { ...prev };
        updated[peId] = updated[peId].map((s, i) =>
          i === setIdx ? { ...s, [field]: value } : s
        );
        return updated;
      });
    },
    []
  );

  async function logSet(peId: string, setIdx: number) {
    setSaving(true);
    try {
      const logId = await ensureWorkoutLog();
      const setData = sets[peId][setIdx];

      // Upsert set log
      await supabase.from("set_logs").upsert(
        {
          workout_log_id: logId,
          prescribed_exercise_id: peId,
          client_id: clientId,
          set_number: setIdx + 1,
          weight_lbs: setData.weight ? parseFloat(setData.weight) : null,
          reps: setData.reps ? parseInt(setData.reps) : null,
          completed: true,
          logged_at: new Date().toISOString(),
        },
        { onConflict: "workout_log_id,prescribed_exercise_id,set_number" }
      );

      updateSet(peId, setIdx, "done", true);
    } catch (e) {
      console.error("Error logging set:", e);
    } finally {
      setSaving(false);
    }
  }

  async function completeWorkout() {
    setSaving(true);
    try {
      const logId = await ensureWorkoutLog();
      await supabase
        .from("workout_logs")
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: "completed",
        })
        .eq("id", logId);
      setWorkoutComplete(true);
    } finally {
      setSaving(false);
    }
  }

  if (workoutComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#EDF2F7" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ background: "#D1FAE5" }}>
          <i className="ti ti-trophy text-4xl" style={{ color: "#059669" }} />
        </div>
        <h1 className="text-2xl font-medium mb-2" style={{ color: "#0D1B2E" }}>Workout complete!</h1>
        <p className="text-sm mb-6" style={{ color: "#4E6080" }}>{day.label} · {doneSets} sets logged</p>
        <Link href="/workout" className="btn-primary px-8 py-3 rounded-xl inline-block">Back to workouts</Link>
      </div>
    );
  }

  const currentSection = sections[activeSectionIdx];
  const currentExercise = currentSection?.prescribed_exercises[activeExerciseIdx];
  const currentSets = currentExercise ? sets[currentExercise.id] || [] : [];

  return (
    <div style={{ background: "#EDF2F7", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ background: "#0F4C81" }} className="px-4 pt-4 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/workout"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <i className="ti ti-arrow-left text-white text-lg" />
          </Link>
          <div className="flex-1">
            <p className="text-white/60 text-xs">{program.name} · {phase.label}</p>
            <h1 className="text-white font-medium text-base">{day.label}</h1>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: "#0EA5E9" }}
            />
          </div>
          <span className="text-white/70 text-xs">{progressPct}%</span>
        </div>
      </div>

      <div className="px-4 -mt-3">
        {/* Section tabs */}
        <div className="flex gap-2 overflow-x-auto py-3 no-scrollbar">
          {sections.map((sec, i) => (
            <button
              key={sec.id}
              onClick={() => { setActiveSectionIdx(i); setActiveExerciseIdx(0); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all"
              style={
                i === activeSectionIdx
                  ? { background: "#0F4C81", color: "white", borderColor: "#0F4C81" }
                  : { background: "white", color: "#4E6080", borderColor: "#C8D8EC" }
              }
            >
              {sec.label}
            </button>
          ))}
        </div>

        {/* Exercise list for active section */}
        {currentSection && (
          <>
            {currentSection.prescribed_exercises.map((pe, i) => {
              const peSets = sets[pe.id] || [];
              const doneCount = peSets.filter((s) => s.done).length;
              const isActive = i === activeExerciseIdx;

              return (
                <div
                  key={pe.id}
                  className="card mb-3 cursor-pointer"
                  onClick={() => setActiveExerciseIdx(i)}
                  style={isActive ? { border: "1.5px solid #0EA5E9" } : {}}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "#0EA5E9" }}>
                        Exercise {i + 1} of {currentSection.prescribed_exercises.length}
                      </span>
                      <h3 className="font-medium text-base mt-0.5" style={{ color: "#0D1B2E" }}>
                        {pe.exercises?.name}
                      </h3>
                      {pe.load_descriptor && (
                        <p className="text-xs mt-0.5" style={{ color: "#4E6080" }}>
                          {pe.load_descriptor}
                        </p>
                      )}
                      {pe.cue && (
                        <p className="text-xs mt-1 italic" style={{ color: "#4E6080" }}>
                          &ldquo;{pe.cue}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      {doneCount === pe.sets && (
                        <span className="tag-green text-xs px-2 py-1 rounded-full">✓ Done</span>
                      )}
                      {pe.rest && (
                        <span className="tag text-xs">
                          <i className="ti ti-clock text-xs" /> {pe.rest}
                        </span>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <>
                      {/* Set headers */}
                      <div className="grid mb-2" style={{ gridTemplateColumns: "32px 1fr 1fr 36px", gap: "7px" }}>
                        <div />
                        <div className="text-center text-xs font-medium" style={{ color: "#4E6080" }}>
                          Weight (lb)
                        </div>
                        <div className="text-center text-xs font-medium" style={{ color: "#4E6080" }}>
                          Reps
                        </div>
                        <div />
                      </div>

                      {peSets.map((setEntry, si) => (
                        <div
                          key={si}
                          className="grid mb-2 items-center"
                          style={{ gridTemplateColumns: "32px 1fr 1fr 36px", gap: "7px" }}
                        >
                          <div
                            className="text-center text-xs font-medium"
                            style={{ color: setEntry.done ? "#0EA5E9" : "#4E6080" }}
                          >
                            S{si + 1}
                          </div>
                          <input
                            type="number"
                            value={setEntry.weight}
                            onChange={(e) => updateSet(pe.id, si, "weight", e.target.value)}
                            disabled={setEntry.done}
                            placeholder="—"
                            className={`set-input ${setEntry.done ? "done" : ""}`}
                            inputMode="decimal"
                          />
                          <input
                            type="number"
                            value={setEntry.reps}
                            onChange={(e) => updateSet(pe.id, si, "reps", e.target.value)}
                            disabled={setEntry.done}
                            placeholder="—"
                            className={`set-input ${setEntry.done ? "done" : ""}`}
                            inputMode="numeric"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); if (!setEntry.done) logSet(pe.id, si); }}
                            disabled={setEntry.done || saving}
                            className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
                            style={
                              setEntry.done
                                ? { background: "#0EA5E9", borderColor: "#0EA5E9" }
                                : { background: "#F0F4F8", border: "0.5px solid #C8D8EC" }
                            }
                          >
                            <i
                              className="ti ti-check text-sm"
                              style={{ color: setEntry.done ? "white" : "#C8D8EC" }}
                            />
                          </button>
                        </div>
                      ))}

                      {/* Volume / tempo info */}
                      {(pe.volume_value || pe.tempo) && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {pe.volume_value && (
                            <span className="tag text-xs">Target: {pe.volume_value}</span>
                          )}
                          {pe.tempo && (
                            <span className="tag text-xs">Tempo: {pe.tempo}</span>
                          )}
                          {pe.unilateral && (
                            <span className="tag text-xs">Unilateral</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Complete workout button */}
        <button
          onClick={completeWorkout}
          disabled={saving || progressPct < 100}
          className="w-full rounded-xl py-4 text-sm font-medium mb-6 transition-all"
          style={
            progressPct === 100
              ? { background: "#059669", color: "white" }
              : { background: "#C8D8EC", color: "#4E6080" }
          }
        >
          {progressPct === 100 ? "Complete workout ✓" : `${progressPct}% done — keep going!`}
        </button>
      </div>
    </div>
  );
}
