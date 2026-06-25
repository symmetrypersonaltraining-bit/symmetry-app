"use client";

import { useState } from "react";
import Logo from "@/components/Logo";

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
  "Quads", "Hamstrings", "Glutes", "Core", "Hip & Groin", "Calves", "Full Body", "Mobility/Recovery",
];

const MODALITY_ICON: Record<string, string> = {
  bodybuilding: "ti-barbell",
  cardio: "ti-run",
  mobility: "ti-stretching",
  activation: "ti-bolt",
  stability: "ti-arrows-minimize",
  corrective: "ti-activity",
};

const MODALITY_COLOR: Record<string, string> = {
  bodybuilding: "#0EA5E9",
  cardio: "#f59e0b",
  mobility: "#22c55e",
  activation: "#a855f7",
  stability: "#06b6d4",
  corrective: "#ef4444",
};

/** Extract YouTube video ID from common URL formats */
function getYouTubeThumbnail(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/
  );
  return match ? `https://img.youtube.com/vi/${match[1]}/mqdefault.jpg` : null;
}

function ExerciseDrawer({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const icon = MODALITY_ICON[ex.modality?.toLowerCase() || ""] || "ti-barbell";
  const color = MODALITY_COLOR[ex.modality?.toLowerCase() || ""] || "var(--brand-primary)";
  const ytThumb = getYouTubeThumbnail(ex.video_url);
  const ytId = ex.video_url ? (ex.video_url.match(/(?:watch\?v=|youtu\.be\/|embed\/|shorts\/)([^&?#]+)/)?.[1] || null) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
      <div className="relative w-full lg:w-[480px] rounded-t-2xl lg:rounded-2xl overflow-hidden"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        onClick={e => e.stopPropagation()}>

        {/* \u2500\u2500 Drag handle (mobile) \u2500\u2500 */}
        <div className="flex justify-center pt-3 pb-0 lg:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--brand-border)" }} />
        </div>

        {/* \u2500\u2500 Header \u2500\u2500 */}
        <div className="flex items-start gap-4 px-5 pt-4 pb-4 border-b"
          style={{ borderColor: "var(--brand-border)" }}>

          {/* Exercise visual \u2014 YouTube thumbnail or Symmetry logo placeholder */}
          {ytId ? (
                <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 8, overflow: "hidden", background: "#000" }}>
                  <iframe src={"https://www.youtube-nocookie.com/embed/" + ytId + "?rel=0&playsinline=1"} title="Exercise demo" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                </div>
              ) : (
                <a href={ex.video_url!} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--brand-primary)", fontWeight: 600, fontSize: 13 }}>
                  <i className="ti ti-brand-youtube" /> Find a demo on YouTube
                </a>
              )}

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold leading-snug" style={{ color: "var(--brand-text)" }}>{ex.name}</h2>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {ex.modality && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{ background: color + "20", color }}>
                  {ex.modality}
                </span>
              )}
              {ex.muscle_group && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
                  {ex.muscle_group}
                </span>
              )}
            </div>
          </div>

          {/* Close button \u2014 prominent, always visible */}
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}
            aria-label="Close">
            <i className="ti ti-x text-base" />
          </button>
        </div>

        {/* \u2500\u2500 Details \u2500\u2500 */}
        <div className="p-5 space-y-4">
          {ex.equipment && (
            <div className="flex items-center gap-3">
              <i className="ti ti-tools text-base w-5 flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }} />
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold mb-0.5"
                  style={{ color: "var(--brand-text-secondary)" }}>Equipment</p>
                <p className="text-sm" style={{ color: "var(--brand-text)" }}>{ex.equipment}</p>
              </div>
            </div>
          )}

          {/* Video section */}
          {ex.video_url ? (
            <div>
              <p className="text-[10px] uppercase tracking-wide font-semibold mb-2"
                style={{ color: "var(--brand-text-secondary)" }}>Video</p>
              {ytThumb ? (
                <a href={ex.video_url} target="_blank" rel="noopener noreferrer"
                  className="relative block rounded-xl overflow-hidden"
                  style={{ aspectRatio: "16/9" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ytThumb} alt={ex.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.35)" }}>
                    <div className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.92)" }}>
                      <i className="ti ti-player-play text-xl" style={{ color: "#E53935" }} />
                    </div>
                  </div>
                </a>
              ) : (
                <a href={ex.video_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm"
                  style={{ background: "var(--brand-primary)", color: "white" }}>
                  <i className="ti ti-player-play text-base" />
                  Watch Exercise Demo
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: "var(--brand-card)", border: "1px dashed var(--brand-border)" }}>
              <i className="ti ti-video-off text-base" style={{ color: "var(--brand-text-secondary)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--brand-text-secondary)" }}>No video attached</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Video links can be added from Everfit export
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="w-2 h-2 rounded-full"
              style={{ background: ex.availability_status === "available" ? "#22c55e" : "#f59e0b" }} />
            <span className="text-xs capitalize" style={{ color: "var(--brand-text-secondary)" }}>
              {ex.availability_status}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExerciseLibraryClient({ exercises }: Props) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("All");
  const [selected, setSelected] = useState<Exercise | null>(null);

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
              const icon = MODALITY_ICON[ex.modality?.toLowerCase() || ""] || "ti-barbell";
              const color = MODALITY_COLOR[ex.modality?.toLowerCase() || ""] || "var(--brand-primary)";
              return (
                <button key={ex.id}
                  onClick={() => setSelected(ex)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 border-b last:border-b-0 text-left transition-colors hover:bg-opacity-50"
                  style={{ borderColor: "var(--brand-border)" }}>
                  {(() => { const __t = getYouTubeThumbnail(ex.video_url); return __t ? (<img src={__t} alt="" loading="lazy" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />) : (<div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: color + "15" }}>
                    <i className={`ti ${icon} text-lg`} style={{ color }} />
                  </div>); })()}
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
                          <span style={{ color: "var(--brand-border)" }}>\u00b7</span>
                          <span className="text-[10px] capitalize" style={{ color: "var(--brand-text-secondary)" }}>{ex.modality}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ex.video_url && (
                      <span className="w-6 h-6 rounded-full flex items-center justify-center"
                        style={{ background: "#22c55e20" }}>
                        <i className="ti ti-player-play text-[10px]" style={{ color: "#22c55e" }} />
                      </span>
                    )}
                    <i className="ti ti-chevron-right text-xs" style={{ color: "var(--brand-text-secondary)" }} />
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {selected && <ExerciseDrawer ex={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
