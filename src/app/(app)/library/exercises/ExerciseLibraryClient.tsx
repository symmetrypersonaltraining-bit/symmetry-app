"use client";

import { useState } from "react";

interface Exercise {
  id: string;
  name: string;
  muscle_group: string | null;
  modality: string | null;
  equipment: string | null;
  video_url: string | null;
  availability_status: string;
}

interface Props {
  exercises: Exercise[];
}

const MUSCLE_GROUPS = [
  "All", "Chest", "Back", "Shoulders", "Biceps", "Triceps",
  "Quads", "Hamstrings", "Glutes", "Core", "Hip & Groin", "Calves", "Full Body",
];

const MODALITY_ICON: Record<string, string> = {
  Strength: "ti-barbell",
  Cardio: "ti-run",
  Mobility: "ti-stretching",
  Activation: "ti-bolt",
  Stability: "ti-arrows-minimize",
};

export default function ExerciseLibraryClient({ exercises }: Props) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");

  const filtered = exercises.filter((e) => {
    const matchSearch =
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.muscle_group || "").toLowerCase().includes(search.toLowerCase());
    const matchMuscle =
      muscleFilter === "All" ||
      (e.muscle_group || "").toLowerCase().includes(muscleFilter.toLowerCase());
    return matchSearch && matchMuscle;
  });

  return (
    <>
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-base"
            style={{ color: "var(--brand-text-secondary)" }} />
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border"
            style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
          />
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex-shrink-0"
          style={{ background: "var(--brand-primary)" }}>
          <i className="ti ti-plus text-base" /> Add
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 no-scrollbar">
        {MUSCLE_GROUPS.map((mg) => (
          <button key={mg} onClick={() => setMuscleFilter(mg)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
            style={{
              background: muscleFilter === mg ? "var(--brand-primary)" : "var(--brand-surface)",
              color: muscleFilter === mg ? "white" : "var(--brand-text-secondary)",
              borderColor: muscleFilter === mg ? "var(--brand-primary)" : "var(--brand-border)",
            }}>
            {mg}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div className="py-12 text-center" style={{ color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-barbell text-3xl mb-2 block" />
            <p className="text-sm">No exercises found</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b text-xs font-medium"
              style={{ color: "var(--brand-text-secondary)", borderColor: "var(--brand-border)", background: "var(--brand-bg)" }}>
              {filtered.length} exercises
            </div>
            {filtered.map((ex) => {
              const icon = MODALITY_ICON[ex.modality || ""] || "ti-barbell";
              return (
                <div key={ex.id}
                  className="flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0"
                  style={{ borderColor: "var(--brand-border)" }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--brand-card)" }}>
                    <i className={`ti ${icon} text-lg`} style={{ color: "var(--brand-primary)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>
                      {ex.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {ex.muscle_group && (
                        <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{ex.muscle_group}</span>
                      )}
                      {ex.modality && (
                        <>
                          <span style={{ color: "var(--brand-border)" }}>·</span>
                          <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{ex.modality}</span>
                        </>
                      )}
                      {ex.equipment && (
                        <>
                          <span style={{ color: "var(--brand-border)" }}>·</span>
                          <span className="text-[10px]" style={{ color: "var(--brand-text-secondary)" }}>{ex.equipment}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {ex.video_url && (
                    <a href={ex.video_url} target="_blank" rel="noopener noreferrer"
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--brand-card)" }}>
                      <i className="ti ti-player-play text-sm" style={{ color: "var(--brand-primary)" }} />
                    </a>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
