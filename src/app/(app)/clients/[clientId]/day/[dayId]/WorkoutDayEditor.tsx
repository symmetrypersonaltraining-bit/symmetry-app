"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Exercise {
  id: string;
  name: string;
  modality: string | null;
  muscle_group: string | null;
}

interface PrescribedExercise {
  id: string;
  position: number;
  sets: number | null;
  volume_type: string | null;
  volume_value: string | null;
  unilateral: boolean;
  tempo: string | null;
  load_descriptor: string | null;
  cue: string | null;
  rest: string | null;
  superset_group: string | null;
  exercises: Exercise | null;
}

interface Section {
  id: string;
  internal_name: string;
  client_facing_name: string;
  position: number;
  prescribed_exercises: PrescribedExercise[];
}

interface Props {
  dayId: string;
  clientId: string;
  sections: Section[];
  exercises: Exercise[];
}

const VOLUME_TYPES = ["reps", "time", "distance", "calories"];

// \u2500\u2500 Add Exercise Drawer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function AddExerciseDrawer({
  sectionId,
  exercises,
  nextPosition,
  onClose,
  onAdded,
}: {
  sectionId: string;
  exercises: Exercise[];
  nextPosition: number;
  onClose: () => void;
  onAdded: (pe: PrescribedExercise) => void;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [sets, setSets] = useState("3");
  const [volumeType, setVolumeType] = useState("reps");
  const [volumeValue, setVolumeValue] = useState("10");
  const [rest, setRest] = useState("60s");
  const [cue, setCue] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.muscle_group || "").toLowerCase().includes(search.toLowerCase())
  );

  async function handleAdd() {
    if (!selectedExId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("prescribed_exercises")
      .insert({
        section_id: sectionId,
        exercise_id: selectedExId,
        position: nextPosition,
        sets: parseInt(sets) || null,
        volume_type: volumeType,
        volume_value: volumeValue,
        rest: rest || null,
        cue: cue || null,
      })
      .select(`id, position, sets, volume_type, volume_value, unilateral, tempo, load_descriptor, cue, rest, superset_group, exercises(id, name, modality, muscle_group)`)
      .single();

    if (!error && data) {
      onAdded(data as any);
      onClose();
    }
    setSaving(false);
  }

  const selectedEx = exercises.find(e => e.id === selectedExId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
      <div className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl overflow-hidden"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--brand-border)" }}>
          <h3 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Add Exercise</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: "var(--brand-text-secondary)" }} />
            <input type="text" placeholder="Search exercises\u2026" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border"
              style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
          </div>

          {/* Exercise list */}
          {!selectedEx && (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--brand-border)" }}>
              {filtered.slice(0, 20).map((ex, i, arr) => (
                <button key={ex.id}
                  onClick={() => setSelectedExId(ex.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left ${i < arr.length - 1 ? "border-b" : ""}`}
                  style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>{ex.name}</p>
                    <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                      {ex.muscle_group}{ex.modality ? ` \u00b7 ${ex.modality}` : ""}
                    </p>
                  </div>
                  <i className="ti ti-plus text-sm" style={{ color: "var(--brand-primary)" }} />
                </button>
              ))}
              {filtered.length > 20 && (
                <div className="px-4 py-2 text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                  Showing 20 of {filtered.length} \u2014 refine search
                </div>
              )}
            </div>
          )}

          {/* Selected exercise + params */}
          {selectedEx && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "var(--brand-primary)15", border: "1px solid var(--brand-primary)40" }}>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: "var(--brand-primary)" }}>{selectedEx.name}</p>
                  <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{selectedEx.muscle_group}</p>
                </div>
                <button onClick={() => setSelectedExId(null)}
                  className="text-xs px-2 py-1 rounded" style={{ color: "var(--brand-text-secondary)" }}>
                  Change
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: "var(--brand-text-secondary)" }}>Sets</label>
                  <input type="number" value={sets} onChange={e => setSets(e.target.value)} min="1"
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: "var(--brand-text-secondary)" }}>Volume</label>
                  <input type="text" value={volumeValue} onChange={e => setVolumeValue(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: "var(--brand-text-secondary)" }}>Type</label>
                  <select value={volumeType} onChange={e => setVolumeType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}>
                    {VOLUME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: "var(--brand-text-secondary)" }}>Rest</label>
                  <input type="text" value={rest} onChange={e => setRest(e.target.value)}
                    placeholder="60s"
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                  style={{ color: "var(--brand-text-secondary)" }}>Coaching Cue (optional)</label>
                <input type="text" value={cue} onChange={e => setCue(e.target.value)}
                  placeholder="Keep core tight, neutral spine\u2026"
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: "var(--brand-bg)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>
          )}
        </div>

        {selectedEx && (
          <div className="px-4 pb-5 pt-2 border-t" style={{ borderColor: "var(--brand-border)" }}>
            <button onClick={handleAdd} disabled={saving}
              className="w-full py-3 rounded-xl text-sm font-bold text-white"
              style={{ background: "var(--brand-primary)", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Adding\u2026" : `Add ${sets}\u00d7${volumeValue} ${selectedEx.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// \u2500\u2500 Edit Exercise Row \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function ExerciseRow({
  pe,
  onDelete,
  onUpdate,
}: {
  pe: PrescribedExercise;
  onDelete: () => void;
  onUpdate: (field: string, value: string | number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const supabase = createClient();

  async function handleDelete() {
    setDeleting(true);
    await supabase.from("prescribed_exercises").delete().eq("id", pe.id);
    onDelete();
  }

  const label = pe.exercises?.name || "Exercise";
  const prescription = [
    pe.sets ? `${pe.sets} sets` : null,
    pe.volume_value ? `${pe.volume_value} ${pe.volume_type || "reps"}` : null,
    pe.rest ? `rest ${pe.rest}` : null,
  ].filter(Boolean).join(" \u00b7 ");

  return (
    <div className="rounded-xl overflow-hidden border mb-2"
      style={{ borderColor: "var(--brand-border)" }}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3"
        style={{ background: "var(--brand-surface)" }}>
        <i className="ti ti-grip-vertical text-base cursor-grab"
          style={{ color: "var(--brand-border)" }} />
        <div className="flex-1 min-w-0" onClick={() => setExpanded(v => !v)}>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--brand-text)" }}>{label}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{prescription || "No prescription"}</p>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ color: "var(--brand-text-secondary)" }}>
          <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"} text-sm`} />
        </button>
        <button onClick={handleDelete} disabled={deleting}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "#fef2f220", color: "#ef4444" }}>
          <i className="ti ti-trash text-sm" />
        </button>
      </div>

      {/* Expanded edit form */}
      {expanded && (
        <div className="px-4 py-3 grid grid-cols-2 gap-3 border-t"
          style={{ borderColor: "var(--brand-border)", background: "var(--brand-bg)" }}>
          {[
            { label: "Sets", field: "sets", value: pe.sets ?? "", type: "number" },
            { label: "Volume", field: "volume_value", value: pe.volume_value ?? "", type: "text" },
            { label: "Type", field: "volume_type", value: pe.volume_type ?? "reps", type: "select" },
            { label: "Rest", field: "rest", value: pe.rest ?? "", type: "text" },
            { label: "Tempo", field: "tempo", value: pe.tempo ?? "", type: "text" },
          ].map(({ label: lbl, field, value, type }) => (
            <div key={field}>
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                style={{ color: "var(--brand-text-secondary)" }}>{lbl}</label>
              {type === "select" ? (
                <select defaultValue={String(value)}
                  onChange={async e => {
                    const v = e.target.value;
                    onUpdate(field, v);
                    await supabase.from("prescribed_exercises").update({ [field]: v }).eq("id", pe.id);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}>
                  {VOLUME_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input type={type} defaultValue={String(value)}
                  onBlur={async e => {
                    const v = type === "number" ? Number(e.target.value) : e.target.value;
                    onUpdate(field, v);
                    await supabase.from("prescribed_exercises").update({ [field]: v || null }).eq("id", pe.id);
                  }}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
              )}
            </div>
          ))}
          {pe.cue !== undefined && (
            <div className="col-span-2">
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                style={{ color: "var(--brand-text-secondary)" }}>Cue</label>
              <input type="text" defaultValue={pe.cue ?? ""}
                onBlur={async e => {
                  await supabase.from("prescribed_exercises").update({ cue: e.target.value || null }).eq("id", pe.id);
                }}
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// \u2500\u2500 Main Editor \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
export default function WorkoutDayEditor({ dayId, clientId, sections: initialSections, exercises }: Props) {
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [addingToSection, setAddingToSection] = useState<string | null>(null);

  const handleDelete = useCallback((sectionId: string, peId: string) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, prescribed_exercises: s.prescribed_exercises.filter(pe => pe.id !== peId) }
        : s
    ));
  }, []);

  const handleUpdate = useCallback((sectionId: string, peId: string, field: string, value: string | number) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, prescribed_exercises: s.prescribed_exercises.map(pe =>
            pe.id === peId ? { ...pe, [field]: value } : pe
          )}
        : s
    ));
  }, []);

  const handleAdded = useCallback((sectionId: string, pe: PrescribedExercise) => {
    setSections(prev => prev.map(s =>
      s.id === sectionId
        ? { ...s, prescribed_exercises: [...s.prescribed_exercises, pe] }
        : s
    ));
  }, []);

  return (
    <div className="space-y-5">
      {sections.map(section => (
        <div key={section.id}>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--brand-text-secondary)" }}>{section.client_facing_name || section.internal_name}</h3>

            </div>
            <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {section.prescribed_exercises.length} exercises
            </span>
          </div>

          {/* Exercise rows */}
          {section.prescribed_exercises.length === 0 && (
            <div className="rounded-xl py-6 text-center border-2 border-dashed mb-2"
              style={{ borderColor: "var(--brand-border)" }}>
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>No exercises in this section</p>
            </div>
          )}
          {section.prescribed_exercises.map(pe => (
            <ExerciseRow
              key={pe.id}
              pe={pe}
              onDelete={() => handleDelete(section.id, pe.id)}
              onUpdate={(field, value) => handleUpdate(section.id, pe.id, field, value)}
            />
          ))}

          {/* Add exercise button */}
          <button
            onClick={() => setAddingToSection(section.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border-2 border-dashed transition-colors"
            style={{ borderColor: "var(--brand-primary)40", color: "var(--brand-primary)" }}>
            <i className="ti ti-plus text-base" />
            Add Exercise to {section.client_facing_name || section.internal_name}
          </button>
        </div>
      ))}

      {/* Add Exercise Drawer */}
      {addingToSection && (
        <AddExerciseDrawer
          sectionId={addingToSection}
          exercises={exercises}
          nextPosition={
            (sections.find(s => s.id === addingToSection)?.prescribed_exercises.length ?? 0) + 1
          }
          onClose={() => setAddingToSection(null)}
          onAdded={(pe) => handleAdded(addingToSection, pe)}
        />
      )}
    </div>
  );
}
