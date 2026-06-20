"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

// ---- Types ----
interface ClientRow {
  id: string;h
  name: string;
}

interface ScheduledWorkout {
  id: string;
  scheduled_date: string;
  status: string;
  day_id: string | null;
  days: { id: string; label: string } | null;
  client_id: string;
}

interface ProgramDay {
  id: string;
  label: string;
  phase_label: string;
  program_name: string;
}

interface PrescribedExercise {
  id: string;
  position: number;
  sets: number | null;
  volume_value: string | null;
  load_descriptor: string | null;
  exercises: { name: string } | null;
}

interface Section {
  id: string;
  internal_name: string;
  client_facing_name: string;
  position: number;
  prescribed_exercises: PrescribedExercise[];
}

interface DayDetail {
  id: string;
  label: string;
  sections: Section[];
}

// Library panel types
interface LibraryDay {
  day_id: string;
  day_label: string;
  position: number;
  phase_label: string;
  phase_position: number;
  program_id: string;
  program_name: string;
  exercises: string[];
}

// Copied week type
interface CopiedWeekWorkout {
  day_id: string | null;
  dayOfWeek: number; // 0=Mon ... 6=Sun
  label: string;
}

// ---- Exercise list ----
const EXERCISE_LIST = [
  "Squat","Deadlift","Bench Press","Overhead Press","Pull-Up","Row","Lunge","Hip Thrust",
  "Romanian Deadlift","Leg Press","Leg Curl","Leg Extension","Calf Raise","Incline Press",
  "Dumbbell Fly","Tricep Extension","Bicep Curl","Face Pull","Lateral Raise","Front Raise",
  "Plank","Crunch","Russian Twist","Mountain Climber","Burpee","Box Jump","Kettlebell Swing",
  "Battle Rope","Cable Row","Lat Pulldown",
];

// ---- Helpers ----
function getWeekDates(weekOffset: number): Date[] {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function todayStr() {
  return dateStr(new Date());
}

function nameInitials(name: string) {
  return name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
}

function addWeeks(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

const DOW_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const AVATAR_BG = ["#DDEEFF","#FEF3C7","#F3E8FF","#FEE2E2","#D1FAE5","#FCE7F3"];
const AVATAR_TX = ["#0F4C81","#92400E","#6B21A8","#991B1B","#065F46","#9D174D"];

// ---- EditExerciseRow ----
function EditExerciseRow({ pe, onSave }: {
  pe: PrescribedExercise;
  onSave: (id: string, sets: string, volume: string, load: string) => void;
}) {
  const [sets, setSets] = useState(pe.sets?.toString() || "");
  const [volume, setVolume] = useState(pe.volume_value || "");
  const [load, setLoad] = useState(pe.load_descriptor || "");

  return (
    <div className="grid grid-cols-4 gap-1 px-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: "var(--brand-border)" }}>
      <div className="col-span-1 text-xs font-medium flex items-center truncate"
        style={{ color: "var(--brand-text)" }}>
        {pe.exercises?.name || "Exercise"}
      </div>
      <input value={sets} onChange={e => setSets(e.target.value)}
        onBlur={() => onSave(pe.id, sets, volume, load)}
        placeholder="Sets" className="rounded px-1 py-1 text-xs border text-center outline-none"
        style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
      <input value={volume} onChange={e => setVolume(e.target.value)}
        onBlur={() => onSave(pe.id, sets, volume, load)}
        placeholder="Reps" className="rounded px-1 py-1 text-xs border text-center outline-none"
        style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
      <input value={load} onChange={e => setLoad(e.target.value)}
        onBlur={() => onSave(pe.id, sets, volume, load)}
        placeholder="Load" className="rounded px-1 py-1 text-xs border text-center outline-none"
        style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
    </div>
  );
}

// ---- WorkoutEditor panel ----
function WorkoutEditor({
  clientId,
  selectedDate,
  editingWorkout,
  onClose,
  onRefresh,
}: {
  clientId: string;
  selectedDate: string | null;
  editingWorkout: ScheduledWorkout | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<"program" | "create" | "edit">(
    editingWorkout ? "edit" : "program"
  );
  const [programDays, setProgramDays] = useState<ProgramDay[]>([]);
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null);
  const [loadingDays, setLoadingDays] = useState(false);
  const [saving, setSaving] = useState(false);

  const [workoutName, setWorkoutName] = useState("");
  const [micActive, setMicActive] = useState(false);
  const [newSections, setNewSections] = useState<Array<{
    label: string; type: string;
    exercises: Array<{ name: string; sets: string; reps: string; weight: string; rest: string }>;
  }>>([{
    label: "Main", type: "Regular",
    exercises: [{ name: "", sets: "3", reps: "10", weight: "", rest: "60s" }]
  }]);

  const micRef = useRef<any>(null);

  useEffect(() => {
    if (tab !== "program") return;
    setLoadingDays(true);
    supabase
      .from("days")
      .select(`
        id, label, position,
        phases(label, position,
          programs(name,
            program_assignments(client_id)
          )
        )
      `)
      .then(({ data }) => {
        const rows: ProgramDay[] = [];
        for (const d of (data || []) as any[]) {
          const ph = d.phases;
          if (!ph) continue;
          const prog = ph.programs;
          if (!prog) continue;
          const pas = prog.program_assignments || [];
          if (!pas.some((pa: any) => pa.client_id === clientId)) continue;
          rows.push({
            id: d.id,
            label: d.label,
            phase_label: ph.label || "",
            program_name: prog.name || "",
          });
        }
        setProgramDays(rows);
        setLoadingDays(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clientId]);

  useEffect(() => {
    if (tab !== "edit" || !editingWorkout?.day_id) return;
    supabase
      .from("days")
      .select(`id, label, sections(id, internal_name, client_facing_name, position, prescribed_exercises(id, position, sets, volume_value, load_descriptor, exercises(name)))`)
      .eq("id", editingWorkout.day_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        setDayDetail({
          id: d.id,
          label: d.label,
          sections: (d.sections || [])
            .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
            .map((s: any) => ({
              ...s,
              prescribed_exercises: (s.prescribed_exercises || []).sort(
                (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
              ),
            })),
        });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, editingWorkout]);

  async function assignDay(dayId: string) {
    if (!selectedDate) return;
    setSaving(true);
    await supabase.from("scheduled_workouts").insert({
      client_id: clientId,
      day_id: dayId,
      scheduled_date: selectedDate,
      status: "scheduled",
    });
    setSaving(false);
    onRefresh();
    onClose();
  }

  async function saveAndSchedule() {
    if (!workoutName.trim() || !selectedDate) return;
    setSaving(true);
    try {
      const { data: pa } = await supabase
        .from("program_assignments")
        .select("program_id")
        .eq("client_id", clientId)
        .eq("active", true)
        .maybeSingle();

      let programId: string | undefined = (pa as any)?.program_id;
      if (!programId) {
        const { data: prog } = await supabase
          .from("programs")
          .insert({ name: "Custom Workouts", description: "Auto-created" })
          .select("id")
          .single();
        programId = (prog as any)?.id;
        if (programId) {
          await supabase.from("program_assignments").insert({
            client_id: clientId,
            program_id: programId,
            active: true,
            start_date: new Date().toISOString().split("T")[0],
          });
        }
      }

      let phaseId: string | undefined;
      if (programId) {
        const { data: existPhase } = await supabase
          .from("phases")
          .select("id")
          .eq("program_id", programId)
          .order("position")
          .limit(1)
          .maybeSingle();
        if (existPhase) {
          phaseId = (existPhase as any).id;
        } else {
          const { data: newPhase } = await supabase
            .from("phases")
            .insert({ program_id: programId, label: "Phase 1", position: 0 })
            .select("id")
            .single();
          phaseId = (newPhase as any)?.id;
        }
      }

      if (!phaseId) { setSaving(false); return; }

      const { data: newDay } = await supabase
        .from("days")
        .insert({ phase_id: phaseId, label: workoutName, position: Date.now() })
        .select("id")
        .single();

      if (!newDay) { setSaving(false); return; }

      for (let si = 0; si < newSections.length; si++) {
        const sec = newSections[si];
        const { data: newSec } = await supabase
          .from("sections")
          .insert({ day_id: (newDay as any).id, internal_name: sec.label, client_facing_name: sec.label, position: si })
          .select("id")
          .single();
        if (!newSec) continue;

        for (let ei = 0; ei < sec.exercises.length; ei++) {
          const ex = sec.exercises[ei];
          if (!ex.name.trim()) continue;
          let { data: exRow } = await supabase
            .from("exercises")
            .select("id")
            .ilike("name", ex.name.trim())
            .maybeSingle();
          if (!exRow) {
            const { data: newEx } = await supabase
              .from("exercises")
              .insert({ name: ex.name.trim() })
              .select("id")
              .single();
            exRow = newEx;
          }
          if (!exRow) continue;
          await supabase.from("prescribed_exercises").insert({
            section_id: (newSec as any).id,
            exercise_id: (exRow as any).id,
            position: ei,
            sets: ex.sets ? parseInt(ex.sets) : null,
            volume_type: "reps",
            volume_value: ex.reps || null,
            load_descriptor: ex.weight || null,
            rest: ex.rest || null,
          });
        }
      }

      await supabase.from("scheduled_workouts").insert({
        client_id: clientId,
        day_id: (newDay as any).id,
        scheduled_date: selectedDate,
        status: "scheduled",
      });

      onRefresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function saveExercise(id: string, sets: string, volume: string, load: string) {
    await supabase.from("prescribed_exercises").update({
      sets: sets ? parseInt(sets) : null,
      volume_value: volume || null,
      load_descriptor: load || null,
    }).eq("id", id);
  }

  function startMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => {
      setWorkoutName(e.results[0][0].transcript);
      setMicActive(false);
    };
    recognition.onerror = () => setMicActive(false);
    recognition.onend = () => setMicActive(false);
    micRef.current = recognition;
    recognition.start();
    setMicActive(true);
  }

  function stopMic() {
    micRef.current?.stop();
    setMicActive(false);
  }

  function addSection() {
    setNewSections(s => [...s, {
      label: `Section ${s.length + 1}`, type: "Regular",
      exercises: [{ name: "", sets: "3", reps: "10", weight: "", rest: "60s" }]
    }]);
  }

  function addExercise(si: number) {
    setNewSections(s => s.map((sec, i) => i === si
      ? { ...sec, exercises: [...sec.exercises, { name: "", sets: "3", reps: "10", weight: "", rest: "60s" }] }
      : sec));
  }

  const tabs = editingWorkout
    ? [{ id: "edit", label: "Edit Workout" }, { id: "program", label: "Program Days" }, { id: "create", label: "Create New" }]
    : [{ id: "program", label: "Program Days" }, { id: "create", label: "Create New" }];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--brand-border)", background: "var(--brand-primary)" }}>
        <h2 className="text-white font-bold text-sm">
          {editingWorkout
            ? `Edit: ${editingWorkout.days?.label || "Workout"}`
            : selectedDate
              ? `Add Workout · ${selectedDate}`
              : "Workout Editor"}
        </h2>
        <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.2)" }}>
          <i className="ti ti-x text-white text-sm" />
        </button>
      </div>

      <div className="flex border-b flex-shrink-0" style={{ borderColor: "var(--brand-border)" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as "program" | "create" | "edit")}
            className="flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors"
            style={{
              borderColor: tab === t.id ? "var(--brand-primary)" : "transparent",
              color: tab === t.id ? "var(--brand-primary)" : "var(--brand-text-secondary)",
              background: "var(--brand-surface)",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4" style={{ background: "var(--brand-bg)" }}>
        {tab === "program" && (
          <div className="space-y-2">
            {loadingDays ? (
              <div className="text-center py-8" style={{ color: "var(--brand-text-secondary)" }}>
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading program days...
              </div>
            ) : programDays.length === 0 ? (
              <div className="text-center py-8" style={{ color: "var(--brand-text-secondary)" }}>
                <i className="ti ti-calendar-off text-3xl block mb-2" />
                <p className="text-sm">No program assigned to this client.</p>
                <p className="text-xs mt-1">Use &quot;Create New&quot; to build a workout.</p>
              </div>
            ) : (
              programDays.map(day => (
                <button key={day.id} onClick={() => assignDay(day.id)} disabled={saving}
                  className="w-full text-left rounded-xl p-3 border transition-all hover:shadow-sm"
                  style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
                  <div className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>{day.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {day.program_name} · {day.phase_label}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--brand-text-secondary)" }}>Workout Name</label>
              <div className="flex gap-2">
                <input
                  value={workoutName}
                  onChange={e => setWorkoutName(e.target.value)}
                  placeholder="e.g. Upper Body A"
                  className="flex-1 rounded-lg px-3 py-2 text-sm border outline-none"
                  style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
                />
                <button
                  onClick={micActive ? stopMic : startMic}
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
                  style={{
                    background: micActive ? "#7c3aed" : "var(--brand-surface)",
                    border: `1px solid ${micActive ? "#7c3aed" : "var(--brand-border)"}`,
                  }}
                  title="Voice input">
                  <i className="ti ti-microphone text-base"
                    style={{ color: micActive ? "white" : "var(--brand-text-secondary)" }} />
                </button>
              </div>
            </div>

            {newSections.map((sec, si) => (
              <div key={si} className="rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                <div className="flex items-center gap-2 px-3 py-2 border-b"
                  style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)" }}>
                  <input
                    value={sec.client_facing_name}
                    onChange={e => setNewSections(s => s.map((x, i) => i === si ? { ...x, label: e.target.value } : x))}
                    className="flex-1 text-xs font-semibold bg-transparent outline-none"
                    style={{ color: "var(--brand-text)" }}
                  />
                  <select
                    value={sec.type}
                    onChange={e => setNewSections(s => s.map((x, i) => i === si ? { ...x, type: e.target.value } : x))}
                    className="text-xs rounded border px-1 py-0.5 outline-none"
                    style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                    {["Regular","Interval","AMRAP","Timed"].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-5 gap-1 px-3 pt-2 pb-1">
                  {["Exercise","Sets","Reps","Weight","Rest"].map(h => (
                    <div key={h} className="text-[10px] font-semibold text-center"
                      style={{ color: "var(--brand-text-secondary)" }}>{h}</div>
                  ))}
                </div>

                {sec.exercises.map((ex, ei) => (
                  <div key={ei} className="grid grid-cols-5 gap-1 px-3 py-1">
                    <input
                      list="exercise-list"
                      value={ex.name}
                      onChange={e => setNewSections(s => s.map((x, i) => i === si ? {
                        ...x, exercises: x.exercises.map((xe, j) => j === ei ? { ...xe, name: e.target.value } : xe)
                      } : x))}
                      placeholder="Exercise"
                      className="w-full rounded px-1 py-1 text-xs border outline-none"
                      style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
                    />
                    {(["sets","reps","weight","rest"] as const).map(field => (
                      <input key={field}
                        value={ex[field]}
                        onChange={e => setNewSections(s => s.map((x, i) => i === si ? {
                          ...x, exercises: x.exercises.map((xe, j) => j === ei ? { ...xe, [field]: e.target.value } : xe)
                        } : x))}
                        placeholder={field === "weight" ? "lbs" : field === "rest" ? "60s" : field === "sets" ? "3" : "10"}
                        className="w-full rounded px-1 py-1 text-xs border text-center outline-none"
                        style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
                      />
                    ))}
                  </div>
                ))}

                <button onClick={() => addExercise(si)}
                  className="w-full py-2 text-xs font-medium border-t flex items-center justify-center gap-1 hover:opacity-80"
                  style={{ borderColor: "var(--brand-border)", color: "var(--brand-primary)", background: "transparent" }}>
                  <i className="ti ti-plus text-xs" /> Add Exercise
                </button>
              </div>
            ))}

            <button onClick={addSection}
              className="w-full py-2.5 rounded-xl text-xs font-semibold border-2 border-dashed hover:opacity-80"
              style={{ borderColor: "var(--brand-primary)", color: "var(--brand-primary)", background: "transparent" }}>
              + Add Section
            </button>

            <button onClick={saveAndSchedule} disabled={saving || !workoutName.trim() || !selectedDate}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
              style={{ background: "var(--brand-primary)" }}>
              {saving ? "Saving..." : "Save & Schedule"}
            </button>

            <datalist id="exercise-list">
              {EXERCISE_LIST.map(e => <option key={e} value={e} />)}
            </datalist>
          </div>
        )}

        {tab === "edit" && (
          <div className="space-y-3">
            {!dayDetail ? (
              <div className="text-center py-8" style={{ color: "var(--brand-text-secondary)" }}>
                <div className="w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : (
              <>
                <div className="font-bold text-base mb-3" style={{ color: "var(--brand-text)" }}>{dayDetail.label}</div>
                {dayDetail.sections.map(sec => (
                  <div key={sec.id} className="rounded-xl overflow-hidden border"
                    style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                    <div className="px-3 py-2 border-b text-xs font-semibold"
                      style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                      {sec.client_facing_name}
                    </div>
                    {sec.prescribed_exercises.length === 0 ? (
                      <div className="px-3 py-3 text-xs text-center" style={{ color: "var(--brand-text-secondary)" }}>No exercises</div>
                    ) : sec.prescribed_exercises.map(pe => (
                      <EditExerciseRow key={pe.id} pe={pe} onSave={saveExercise} />
                    ))}
                  </div>
                ))}
                {editingWorkout?.day_id && (
                  <Link href={`/clients/${clientId}/day/${editingWorkout.day_id}`}
                    className="block text-center w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-2"
                    style={{ background: "var(--brand-primary)" }}>
                    Open Full Editor →
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Library Panel ----
function LibraryPanel({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [libraryDays, setLibraryDays] = useState<LibraryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "client">("all");
  const [clientProgramIds, setClientProgramIds] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("program_assignments")
      .select("program_id")
      .eq("client_id", clientId)
      .then(({ data }) => {
        setClientProgramIds((data || []).map((r: any) => r.program_id));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("days")
      .select(`
        id, label, position,
        phases(
          id, label, position,
          programs(
            id, name, status,
            program_assignments(client_id)
          )
        ),
        sections(
          prescribed_exercises(
            position,
            exercises(name)
          )
        )
      `)
      .then(({ data }) => {
        const rows: LibraryDay[] = [];
        for (const d of (data || []) as any[]) {
          const ph = d.phases;
          if (!ph) continue;
          const prog = ph.programs;
          if (!prog) continue;

          const exNames: string[] = [];
          for (const sec of d.sections || []) {
            const sorted = [...(sec.prescribed_exercises || [])].sort(
              (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)
            );
            for (const pe of sorted) {
              const name = pe.exercises?.name;
              if (name && !exNames.includes(name)) exNames.push(name);
            }
          }

          rows.push({
            day_id: d.id,
            day_label: d.label || "Unnamed Day",
            position: d.position ?? 0,
            phase_label: ph.label || "",
            phase_position: ph.position ?? 0,
            program_id: prog.id,
            program_name: prog.name || "Unnamed Program",
            exercises: exNames,
          });
        }
        rows.sort((a, b) => {
          if (a.program_name < b.program_name) return -1;
          if (a.program_name > b.program_name) return 1;
          if (a.phase_position !== b.phase_position) return a.phase_position - b.phase_position;
          return a.position - b.position;
        });
        setLibraryDays(rows);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = libraryDays.filter(d => {
    if (filter === "client" && !clientProgramIds.includes(d.program_id)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      d.day_label.toLowerCase().includes(q) ||
      d.program_name.toLowerCase().includes(q) ||
      d.exercises.some(e => e.toLowerCase().includes(q))
    );
  });

  const grouped: Record<string, LibraryDay[]> = {};
  for (const d of filtered) {
    if (!grouped[d.program_name]) grouped[d.program_name] = [];
    grouped[d.program_name].push(d);
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 sm:absolute sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto sm:h-full flex flex-col shadow-2xl border-t sm:border-t-0 sm:border-l rounded-t-2xl sm:rounded-none"
      style={{
        width: "100%",
        maxHeight: "70vh",
        overflowY: "auto",
        ...(typeof window !== "undefined" && window.innerWidth >= 640 ? { width: "clamp(260px, 280px, 100vw)", maxHeight: "none", overflowY: "visible" } : {}),
        background: "var(--brand-surface)",
        borderColor: "var(--brand-border)",
        zIndex: 40,
      }}>
      <div className="flex items-center justify-between px-3 py-3 border-b flex-shrink-0"
        style={{ borderColor: "var(--brand-border)", background: "var(--brand-primary)" }}>
        <div className="flex items-center gap-2">
          <i className="ti ti-books text-white text-base" />
          <span className="text-white font-bold text-sm">Workout Library</span>
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.2)" }}>
          <i className="ti ti-x text-white text-xs" />
        </button>
      </div>

      <div className="px-3 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--brand-border)" }}>
        <div className="relative">
          <i className="ti ti-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs"
            style={{ color: "var(--brand-text-secondary)" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search days or exercises..."
            className="w-full pl-7 pr-3 py-2 rounded-lg text-xs border outline-none"
            style={{
              background: "var(--brand-bg)",
              borderColor: "var(--brand-border)",
              color: "var(--brand-text)",
            }}
          />
        </div>
        <div className="flex rounded-lg overflow-hidden border mt-2" style={{ borderColor: "var(--brand-border)" }}>
          {(["all","client"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="flex-1 py-1.5 text-[11px] font-semibold transition-colors"
              style={{
                background: filter === f ? "var(--brand-primary)" : "var(--brand-surface)",
                color: filter === f ? "white" : "var(--brand-text-secondary)",
              }}>
              {f === "all" ? "All Programs" : "This Client"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 py-1.5 flex-shrink-0 border-b" style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)" }}>
        <p className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>
          Drag a card onto any calendar day to schedule it
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="text-center py-8" style={{ color: "var(--brand-text-secondary)" }}>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading library...</p>
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-8" style={{ color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-mood-empty text-3xl block mb-2" />
            <p className="text-xs">No days found.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([programName, days]) => (
            <div key={programName} className="mb-4">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 px-1"
                style={{ color: "var(--brand-primary)" }}>
                {programName}
              </div>
              <div className="space-y-1.5">
                {days.map(d => (
                  <div
                    key={d.day_id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData("type", "library");
                      e.dataTransfer.setData("dayId", d.day_id);
                      e.dataTransfer.setData("dayLabel", d.day_label);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="rounded-lg p-2.5 border cursor-grab active:cursor-grabbing select-none"
                    style={{
                      background: "var(--brand-bg)",
                      borderColor: "var(--brand-border)",
                    }}>
                    <div className="font-semibold text-xs mb-0.5" style={{ color: "var(--brand-text)" }}>
                      {d.day_label}
                    </div>
                    <div className="text-[10px] mb-1" style={{ color: "var(--brand-text-secondary)" }}>
                      {d.phase_label} · {d.exercises.length} exercise{d.exercises.length !== 1 ? "s" : ""}
                    </div>
                    {d.exercises.length > 0 && (
                      <div className="text-[10px] truncate" style={{ color: "var(--brand-text-secondary)" }}>
                        {d.exercises.slice(0, 3).join(", ")}{d.exercises.length > 3 ? "..." : ""}
                      </div>
                    )}
                    <div className="mt-1.5 flex items-center gap-1">
                      <i className="ti ti-drag-drop text-[10px]" style={{ color: "var(--brand-primary)" }} />
                      <span className="text-[10px]" style={{ color: "var(--brand-primary)" }}>Drag to schedule</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---- Workout Chip ----
function WorkoutChip({
  workout,
  onEdit,
  onDelete,
  onCopy,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  workout: ScheduledWorkout;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  isDragging?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      className="rounded-lg px-2 py-1.5 mb-1 border cursor-grab active:cursor-grabbing relative group select-none transition-opacity"
      style={{
        background: "var(--brand-primary)18",
        borderColor: "var(--brand-primary)40",
        opacity: isDragging ? 0.4 : 1,
      }}>
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: "var(--brand-primary)" }}>
            {workout.days?.label || "Workout"}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); setConfirmDelete(false); }}
          className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center"
          style={{ background: "var(--brand-primary)20" }}>
          <i className="ti ti-dots text-[10px]" style={{ color: "var(--brand-primary)" }} />
        </button>
      </div>

      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 rounded-xl shadow-xl border z-30 min-w-[130px]"
          style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
          {confirmDelete ? (
            <div className="p-2">
              <p className="text-xs mb-2 font-medium" style={{ color: "var(--brand-text)" }}>Delete this workout?</p>
              <div className="flex gap-1">
                <button onClick={() => { onDelete(); setMenuOpen(false); }}
                  className="flex-1 py-1 rounded text-xs font-semibold text-white"
                  style={{ background: "#ef4444" }}>Delete</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-1 rounded text-xs font-medium"
                  style={{ color: "var(--brand-text-secondary)", background: "var(--brand-bg)" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <button onClick={() => { onCopy(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-t-xl hover:opacity-80"
                style={{ color: "var(--brand-text)" }}>
                <i className="ti ti-copy text-sm" style={{ color: "var(--brand-primary)" }} /> Copy
              </button>
              <button onClick={() => { onEdit(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80"
                style={{ color: "var(--brand-text)" }}>
                <i className="ti ti-pencil text-sm" style={{ color: "var(--brand-primary)" }} /> Edit
              </button>
              <button onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-b-xl hover:opacity-80"
                style={{ color: "#ef4444" }}>
                <i className="ti ti-trash text-sm" /> Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function ProgramPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.clientId as string;
  const supabase = createClient();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientName, setClientName] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [density, setDensity] = useState<"1w" | "2w" | "4w">("1w");
  const [workouts, setWorkouts] = useState<ScheduledWorkout[]>([]);
  const [loading, setLoading] = useState(true);

  const [editorOpen, setEditorOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<ScheduledWorkout | null>(null);

  const [copiedWorkout, setCopiedWorkout] = useState<ScheduledWorkout | null>(null);
  const [draggingWorkoutId, setDraggingWorkoutId] = useState<string | null>(null);
  const [draggingWorkout, setDraggingWorkout] = useState<ScheduledWorkout | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [dragType, setDragType] = useState<"chip" | "library" | null>(null);

  const [copiedWeek, setCopiedWeek] = useState<CopiedWeekWorkout[] | null>(null);
  const [bulkPasteCount, setBulkPasteCount] = useState(1);
  const [bulkPasting, setBulkPasting] = useState(false);

  const today = todayStr();

  const baseMonday = (() => {
    const t = new Date();
    const dow = t.getDay();
    const m = new Date(t);
    m.setDate(t.getDate() - (dow === 0 ? 6 : dow - 1));
    m.setHours(0, 0, 0, 0);
    return m;
  })();

  useEffect(() => {
    supabase.from("clients").select("id, name").order("name")
      .then(({ data }) => setClients((data || []) as ClientRow[]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!clientId) return;
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle()
      .then(({ data }) => { if (data) setClientName((data as any).name); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const loadWorkouts = useCallback(async () => {
    setLoading(true);
    const weeks = density === "1w" ? 1 : density === "2w" ? 2 : 4;
    const allDatesArr: string[] = [];
    for (let w = 0; w < weeks; w++) {
      getWeekDates(weekOffset + w).forEach(d => allDatesArr.push(dateStr(d)));
    }
    const { data } = await supabase
      .from("scheduled_workouts")
      .select("id, scheduled_date, status, day_id, client_id, days(id, label)")
      .eq("client_id", clientId)
      .gte("scheduled_date", allDatesArr[0])
      .lte("scheduled_date", allDatesArr[allDatesArr.length - 1])
      .order("scheduled_date");
    setWorkouts((data || []) as unknown as ScheduledWorkout[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, weekOffset, density]);

  useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setCopiedWorkout(null); setCopiedWeek(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function deleteWorkout(id: string) {
    await supabase.from("scheduled_workouts").delete().eq("id", id);
    loadWorkouts();
  }

  async function pasteWorkout(date: string) {
    if (!copiedWorkout) return;
    await supabase.from("scheduled_workouts").insert({
      client_id: clientId, day_id: copiedWorkout.day_id,
      scheduled_date: date, status: "scheduled",
    });
    setCopiedWorkout(null);
    loadWorkouts();
  }

  async function moveWorkout(workout: ScheduledWorkout, newDate: string) {
    await supabase.from("scheduled_workouts").update({ scheduled_date: newDate }).eq("id", workout.id);
    loadWorkouts();
  }

  async function scheduleLibraryDay(dayId: string, targetDate: string) {
    await supabase.from("scheduled_workouts").insert({
      client_id: clientId, day_id: dayId,
      scheduled_date: targetDate, status: "scheduled", source: "trainer", position: 1,
    });
    loadWorkouts();
  }

  function copyCurrentWeek() {
    const weekDates = getWeekDates(weekOffset);
    const weekWorkouts: CopiedWeekWorkout[] = [];
    for (let i = 0; i < weekDates.length; i++) {
      const ds = dateStr(weekDates[i]);
      workouts.filter(w => w.scheduled_date === ds).forEach(w => {
        weekWorkouts.push({ day_id: w.day_id, dayOfWeek: i, label: w.days?.label || "Workout" });
      });
    }
    setCopiedWeek(weekWorkouts);
    setCopiedWorkout(null);
  }

  async function pasteWeekBulk(startWeekOffset: number, count: number) {
    if (!copiedWeek || copiedWeek.length === 0) return;
    setBulkPasting(true);
    const insertRows: any[] = [];
    for (let w = 0; w < count; w++) {
      const weekStart = addWeeks(baseMonday, startWeekOffset + w);
      for (const workout of copiedWeek) {
        if (!workout.day_id) continue;
        insertRows.push({
          client_id: clientId, day_id: workout.day_id,
          scheduled_date: dateStr(addDays(weekStart, workout.dayOfWeek)),
          status: "scheduled", source: "trainer", position: 1,
        });
      }
    }
    if (insertRows.length > 0) await supabase.from("scheduled_workouts").insert(insertRows);
    setBulkPasting(false);
    setCopiedWeek(null);
    loadWorkouts();
  }

  const weeks = density === "1w" ? 1 : density === "2w" ? 2 : 4;
  const allDays: Date[] = [];
  for (let w = 0; w < weeks; w++) getWeekDates(weekOffset + w).forEach(d => allDays.push(d));

  const rangeLabel = (() => {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${fmt(allDays[0])} – ${fmt(allDays[allDays.length - 1])}`;
  })();

  const workoutByDate: Record<string, ScheduledWorkout[]> = {};
  for (const w of workouts) {
    if (!workoutByDate[w.scheduled_date]) workoutByDate[w.scheduled_date] = [];
    workoutByDate[w.scheduled_date].push(w);
  }

  const compact = density !== "1w";

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--brand-bg)" }}>

      {sidebarOpen && (
        <div className="w-48 flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
          <div className="px-3 py-2.5 border-b flex items-center justify-between"
            style={{ borderColor: "var(--brand-border)" }}>
            <span className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--brand-text-secondary)" }}>Clients</span>
            <button onClick={() => setSidebarOpen(false)}
              className="w-5 h-5 flex items-center justify-center rounded hover:opacity-70">
              <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {clients.map(c => {
              const ci = c.name.charCodeAt(0) % AVATAR_BG.length;
              const isSelected = c.id === clientId;
              return (
                <button key={c.id} onClick={() => router.push(`/clients/${c.id}/program`)}
                  className="w-full flex items-center gap-2 px-2 py-2 transition-all text-left"
                  style={{
                    background: isSelected ? "var(--brand-primary)15" : "transparent",
                    borderLeft: isSelected ? "3px solid var(--brand-primary)" : "3px solid transparent",
                  }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{ background: AVATAR_BG[ci], color: AVATAR_TX[ci] }}>
                    {nameInitials(c.name)}
                  </div>
                  <span className="text-xs font-medium truncate"
                    style={{ color: isSelected ? "var(--brand-primary)" : "var(--brand-text)" }}>
                    {c.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b flex-shrink-0"
          style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)}
              className="w-7 h-7 flex items-center justify-center rounded hover:opacity-70">
              <i className="ti ti-layout-sidebar text-sm" style={{ color: "var(--brand-text-secondary)" }} />
            </button>
          )}
          <Link href={`/clients/${clientId}`}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <i className="ti ti-arrow-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
          </Link>
          <span className="font-bold text-sm flex-1 truncate" style={{ color: "var(--brand-text)" }}>
            {clientName || "Programming Engine"}
          </span>

          <div className="flex items-center gap-1">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-7 h-7 rounded flex items-center justify-center hover:opacity-70"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-chevron-left text-xs" style={{ color: "var(--brand-text-secondary)" }} />
            </button>
            <span className="text-xs font-medium px-2 min-w-[130px] text-center" style={{ color: "var(--brand-text)" }}>
              {rangeLabel}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)}
              className="w-7 h-7 rounded flex items-center justify-center hover:opacity-70"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
            </button>
          </div>

          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
            {(["1w","2w","4w"] as const).map(d => (
              <button key={d} onClick={() => setDensity(d)}
                className="px-2.5 py-1 text-xs font-semibold transition-colors"
                style={{
                  background: density === d ? "var(--brand-primary)" : "var(--brand-surface)",
                  color: density === d ? "white" : "var(--brand-text-secondary)",
                }}>
                {d}
              </button>
            ))}
          </div>

          <button onClick={copyCurrentWeek} title="Copy this week"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold hover:opacity-80 transition-colors"
            style={{
              background: copiedWeek ? "var(--brand-primary)15" : "var(--brand-bg)",
              border: `1px solid ${copiedWeek ? "var(--brand-primary)" : "var(--brand-border)"}`,
              color: copiedWeek ? "var(--brand-primary)" : "var(--brand-text-secondary)",
            }}>
            <i className="ti ti-calendar-copy text-sm" />
            <span className="hidden sm:inline">Copy Week</span>
          </button>

          <button
            onClick={() => { setLibraryOpen(v => !v); if (!libraryOpen && editorOpen) setEditorOpen(false); }}
            title="Workout Library"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold hover:opacity-80 transition-colors"
            style={{
              background: libraryOpen ? "var(--brand-primary)" : "var(--brand-bg)",
              border: `1px solid ${libraryOpen ? "var(--brand-primary)" : "var(--brand-border)"}`,
              color: libraryOpen ? "white" : "var(--brand-text-secondary)",
            }}>
            <i className="ti ti-books text-sm" />
            <span className="hidden sm:inline">Library</span>
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto relative">
            <div className="min-w-[700px]">
            <div className="grid sticky top-0 z-10 border-b"
              style={{
                gridTemplateColumns: `repeat(${allDays.length}, minmax(${compact ? 80 : 120}px, 1fr))`,
                borderColor: "var(--brand-border)",
                background: "var(--brand-surface)",
              }}>
              {allDays.map((d, i) => {
                const ds = dateStr(d);
                const isToday = ds === today;
                return (
                  <div key={i} className="border-r px-2 py-2 group relative"
                    style={{ borderColor: "var(--brand-border)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase"
                        style={{ color: isToday ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
                        {DOW_SHORT[i % 7]}
                      </span>
                      <button
                        onClick={() => { setSelectedDate(ds); setEditingWorkout(null); setEditorOpen(true); setLibraryOpen(false); }}
                        className={`w-5 h-5 rounded flex items-center justify-center transition-opacity ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        style={{ background: "var(--brand-primary)20", color: "var(--brand-primary)" }}>
                        <i className="ti ti-plus text-[10px]" />
                      </button>
                    </div>
                    <div className={`font-bold ${compact ? "text-xs" : "text-sm"} w-6 h-6 flex items-center justify-center rounded-full`}
                      style={{
                        background: isToday ? "var(--brand-primary)" : "transparent",
                        color: isToday ? "white" : "var(--brand-text)",
                      }}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid"
              style={{ gridTemplateColumns: `repeat(${allDays.length}, minmax(${compact ? 80 : 120}px, 1fr))` }}>
              {allDays.map((d, i) => {
                const ds = dateStr(d);
                const dayWorkouts = workoutByDate[ds] || [];
                const isOver = dragOverDate === ds;
                const isPasteMode = !!copiedWorkout;

                return (
                  <div key={i}
                    className="border-r border-b min-h-[100px] p-1.5 relative transition-colors"
                    style={{
                      borderColor: "var(--brand-border)",
                      background: isOver ? "var(--brand-primary)12" : isPasteMode ? "#7c3aed08" : "transparent",
                      cursor: isPasteMode ? "copy" : "default",
                    }}
                    onClick={() => { if (copiedWorkout) pasteWorkout(ds); }}
                    onDragOver={e => { e.preventDefault(); setDragOverDate(ds); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDate(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverDate(null);
                      const type = e.dataTransfer.getData("type");
                      if (type === "library") {
                        const dayId = e.dataTransfer.getData("dayId");
                        if (dayId) scheduleLibraryDay(dayId, ds);
                        setDragType(null);
                        return;
                      }
                      if (draggingWorkout && draggingWorkout.scheduled_date !== ds) moveWorkout(draggingWorkout, ds);
                      setDraggingWorkoutId(null);
                      setDraggingWorkout(null);
                      setDragType(null);
                    }}>

                    {loading && dayWorkouts.length === 0 && i < 7 && (
                      <div className="h-4 rounded animate-pulse mt-1" style={{ background: "var(--brand-border)" }} />
                    )}

                    {dayWorkouts.map(w => (
                      <WorkoutChip
                        key={w.id}
                        workout={w}
                        isDragging={draggingWorkoutId === w.id}
                        onEdit={() => { setEditingWorkout(w); setSelectedDate(ds); setEditorOpen(true); setLibraryOpen(false); }}
                        onDelete={() => deleteWorkout(w.id)}
                        onCopy={() => setCopiedWorkout(w)}
                        onDragStart={e => {
                          e.dataTransfer.setData("type", "chip");
                          e.dataTransfer.setData("scheduledWorkoutId", w.id);
                          e.dataTransfer.setData("fromDate", ds);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingWorkout(w);
                          setDraggingWorkoutId(w.id);
                          setDragType("chip");
                        }}
                        onDragEnd={() => { setDraggingWorkout(null); setDraggingWorkoutId(null); setDragType(null); }}
                      />
                    ))}

                    {isOver && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center rounded"
                        style={{ border: "2px dashed var(--brand-primary)", background: "var(--brand-primary)08" }}>
                        {dragType === "library" && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                            style={{ background: "var(--brand-primary)", color: "white" }}>
                            Drop here
                          </span>
                        )}
                      </div>
                    )}

                    {isPasteMode && !isOver && (
                      <div className="absolute inset-0 rounded pointer-events-none"
                        style={{ border: "2px dashed #7c3aed40" }} />
                    )}
                  </div>
                );
              })}
            </div>

            {libraryOpen && (
              <LibraryPanel clientId={clientId} onClose={() => setLibraryOpen(false)} />
            )}
            </div>{/* end min-w-[700px] wrapper */}
          </div>

          {editorOpen && (
            <div className={isMobile
                ? "fixed bottom-0 left-0 right-0 z-50 flex flex-col overflow-hidden rounded-t-2xl border-t shadow-2xl"
                : "flex-shrink-0 border-l flex flex-col overflow-hidden"
              }
              style={isMobile
                ? { height: "70vh", background: "var(--brand-surface)", borderColor: "var(--brand-border)" }
                : { width: 460, borderColor: "var(--brand-border)", background: "var(--brand-surface)" }
              }>
              <WorkoutEditor
                clientId={clientId}
                selectedDate={selectedDate}
                editingWorkout={editingWorkout}
                onClose={() => { setEditorOpen(false); setEditingWorkout(null); setSelectedDate(null); }}
                onRefresh={loadWorkouts}
              />
            </div>
          )}
        </div>
      </div>

      {copiedWorkout && !copiedWeek && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-6 py-3 flex items-center justify-between shadow-2xl"
          style={{ background: "#7c3aed", color: "white" }}>
          <div className="flex items-center gap-3">
            <i className="ti ti-copy text-lg" />
            <span className="text-sm font-semibold">
              Copied: {copiedWorkout.days?.label || "Workout"} · Click any day to paste
            </span>
          </div>
          <button onClick={() => setCopiedWorkout(null)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            Esc / Cancel
          </button>
        </div>
      )}

      {copiedWeek && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 py-3 flex flex-wrap items-center gap-3 shadow-2xl"
          style={{ background: "#0f4c81", color: "white" }}>
          <div className="flex items-center gap-2 flex-shrink-0">
            <i className="ti ti-calendar-copy text-lg" />
            <span className="text-sm font-semibold">
              Week copied ({copiedWeek.length} workout{copiedWeek.length !== 1 ? "s" : ""})
            </span>
          </div>
          <span className="text-xs opacity-70 hidden sm:inline">Navigate to any week, then paste below.</span>
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            <span className="text-xs opacity-90">Paste for</span>
            <input
              type="number" min={1} max={52} value={bulkPasteCount}
              onChange={e => setBulkPasteCount(Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))}
              className="w-14 px-2 py-1 rounded text-xs text-center font-semibold outline-none"
              style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}
            />
            <span className="text-xs opacity-90">week{bulkPasteCount !== 1 ? "s" : ""}</span>
            <button
              onClick={() => pasteWeekBulk(weekOffset, bulkPasteCount)}
              disabled={bulkPasting}
              className="px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-50"
              style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
              {bulkPasting ? "Pasting..." : "Paste"}
            </button>
            <button onClick={() => setCopiedWeek(null)}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <i className="ti ti-x text-xs" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
