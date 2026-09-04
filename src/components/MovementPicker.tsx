"use client";

// Pick a movement out of the library, the same way you pick a workout.
//
// Dustin, 4 Sep: "now we need to do pretty much the same thing with taht build
// my own button. it needs to function the same where we can search movements
// from movement library with filters, ai, etc."
//
// So this is the movement-level twin of the add-workout sheet: filters over
// what the library actually knows, an Ask button that reads a sentence and sets
// those filters, and a View on every result so you can see what a movement is —
// and its video — before you commit to it. Back always returns to the same
// search.
//
// TWO RULES THAT ARE NOT NEGOTIABLE HERE:
//
//   1. `availability_status = 'excluded'` movements are never listed. Eleven of
//      them, and they are excluded because Dustin does not program them.
//   2. `corrective_phase_tags` — Inhibit, Lengthen, Activate, Integrate — is the
//      internal corrective engine and is NEVER shown to a client or offered as a
//      filter. It is on the row; it stays off the screen.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FunLoader } from "@/components/FunMoments";
import AiBadge from "@/components/AiBadge";

export interface LibExercise {
  id: string;
  name: string;
  modality: string | null;
  muscle_group: string | null;
  equipment_required: string[] | null;
  video_url: string | null;
}

/** muscle_group is free text typed by hand over a year. Normalise, never trust. */
function muscleKey(raw: string | null): string | null {
  const m = (raw || "").toLowerCase().trim();
  if (!m) return null;
  if (m === "chest") return "chest";
  if (m === "back") return "back";
  if (m === "shoulders") return "shoulders";
  if (m === "biceps") return "biceps";
  if (m === "triceps") return "triceps";
  if (m === "arms") return "arms";
  if (m === "core" || m === "abs") return "core";
  if (m === "glutes") return "glutes";
  if (m === "lower body" || m === "legs" || m === "adductors") return "legs";
  if (m === "ankle/lower leg") return "ankle";
  if (m === "pelvis/hip") return "hips";
  if (m.includes("neck") || m.startsWith("cervical")) return "neck";
  if (m === "full body") return "full-body";
  if (m.startsWith("mobility")) return "mobility";
  return null;
}

/** Client-facing modality. "bodybuilding" is not a word anybody searches with. */
function modalityKey(raw: string | null): string | null {
  const m = (raw || "").toLowerCase().trim();
  if (m === "bodybuilding") return "strength";
  if (m === "powerlifting") return "power";
  if (m === "functional/athletic") return "functional";
  if (m === "conditioning") return "conditioning";
  if (m === "mobility") return "mobility";
  return null;
}

/** Equipment has drifted — "Lacrosse Ball" and "Lacrosse ball" are one thing. */
function equipKey(raw: string): string | null {
  const e = raw.toLowerCase().trim();
  if (!e || e === "none") return "bodyweight";
  if (e.includes("bodyweight")) return "bodyweight";
  if (e.includes("dumbbell")) return "dumbbells";
  if (e.includes("barbell") || e.includes("specialty bars")) return "barbells";
  if (e.includes("kettlebell")) return "kettlebells";
  if (e.includes("cable")) return "cable";
  if (e.includes("smith")) return "smith machine";
  if (e.includes("leg press")) return "leg press";
  if (e.includes("machine") || e.includes("pendulum")) return "machine";
  if (e.includes("band") || e.includes("flexbar")) return "bands";
  if (e.includes("box")) return "boxes";
  if (e.includes("foam roller")) return "foam roller";
  if (e.includes("lacrosse")) return "lacrosse ball";
  if (e.includes("stability ball")) return "stability ball";
  if (e.includes("medicine ball")) return "medicine ball";
  if (e.includes("pull-up")) return "pull-up bar";
  if (e.includes("treadmill")) return "treadmill";
  if (e.includes("ghd")) return "ghd";
  if (e.includes("battle rope")) return "battle ropes";
  if (e.includes("balance disc") || e.includes("wobble")) return "balance disc";
  if (e.includes("mat")) return "mat";
  if (e.includes("sandbag")) return "sandbag";
  if (e.includes("rower")) return "rower";
  return null;
}

const M_MUSCLE: [string, string][] = [["chest", "Chest"], ["back", "Back"], ["shoulders", "Shoulders"], ["biceps", "Biceps"], ["triceps", "Triceps"], ["arms", "Arms"], ["core", "Core"], ["glutes", "Glutes"], ["legs", "Legs"], ["hips", "Hips"], ["ankle", "Ankle"], ["neck", "Neck"], ["full-body", "Full body"], ["mobility", "Mobility"]];
const M_MODALITY: [string, string][] = [["strength", "Strength"], ["power", "Power"], ["functional", "Functional"], ["conditioning", "Conditioning"], ["mobility", "Mobility"]];
const M_EQUIP: [string, string][] = [["bodyweight", "Bodyweight"], ["dumbbells", "Dumbbells"], ["barbells", "Barbells"], ["kettlebells", "Kettlebells"], ["cable", "Cable"], ["machine", "Machine"], ["bands", "Bands"], ["boxes", "Box"], ["foam roller", "Foam roller"], ["lacrosse ball", "Lacrosse ball"], ["stability ball", "Stability ball"], ["medicine ball", "Med ball"], ["pull-up bar", "Pull-up bar"], ["leg press", "Leg press"], ["smith machine", "Smith"], ["treadmill", "Treadmill"], ["ghd", "GHD"], ["battle ropes", "Battle ropes"], ["balance disc", "Balance disc"], ["mat", "Mat"], ["sandbag", "Sandbag"], ["rower", "Rower"]];

export default function MovementPicker({
  onPick,
  onClose,
}: {
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [all, setAll] = useState<LibExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [fMuscle, setFMuscle] = useState<string[]>([]);
  const [fMod, setFMod] = useState<string[]>([]);
  const [fEquip, setFEquip] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiReading, setAiReading] = useState("");
  const [detail, setDetail] = useState<LibExercise | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const { data } = await supabase
        .from("exercises")
        .select("id, name, modality, muscle_group, equipment_required, video_url, availability_status")
        .order("name");
      if (!on) return;
      const rows = ((data as (LibExercise & { availability_status: string | null })[]) || [])
        // Rule 13. An excluded movement must never be programmable, from any
        // surface — this is one of the surfaces.
        .filter((e) => (e.availability_status || "available") !== "excluded");
      setAll(rows);
      setLoading(false);
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const filterCount = fMuscle.length + fMod.length + fEquip.length;
  function clearFilters() { setFMuscle([]); setFMod([]); setFEquip([]); setAiReading(""); }

  async function askAi() {
    const text = q.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/movement-search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      const j = await res.json().catch(() => null);
      if (!j || !j.filter) { setAiReading("Couldn't read that one — try the filters."); return; }
      setFMuscle(j.filter.muscle || []);
      setFMod(j.filter.modality || []);
      setFEquip(j.filter.equipment || []);
      setAiReading(j.reading || "");
      // Keywords stay in the box: for a movement, the pattern word — press,
      // hinge, row — is usually the most useful part of what was said, and it
      // matches names directly.
      setQ((j.filter.keywords || []).join(" ") || text);
      setShowFilters(true);
    } catch {
      setAiReading("Couldn't read that one — try the filters.");
    } finally { setAiBusy(false); }
  }

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((e) => {
      if (fMuscle.length) { const k = muscleKey(e.muscle_group); if (!k || !fMuscle.includes(k)) return false; }
      if (fMod.length) { const k = modalityKey(e.modality); if (!k || !fMod.includes(k)) return false; }
      if (fEquip.length) {
        const keys = (e.equipment_required || []).map(equipKey).filter(Boolean) as string[];
        if (!keys.some((k) => fEquip.includes(k))) return false;
      }
      if (!terms.length) return true;
      const hay = e.name.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [all, q, fMuscle, fMod, fEquip]);

  function chip(key: string, lab: string, on: boolean, onClick: () => void) {
    return (
      <button key={key} type="button" onClick={onClick}
        style={{
          padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 700,
          fontFamily: "inherit", whiteSpace: "nowrap",
          border: on ? "1px solid transparent" : "1px solid var(--brand-border)",
          background: on ? "var(--brand-primary)" : "transparent",
          color: on ? "#fff" : "var(--brand-text)",
        }}>{lab}</button>
    );
  }
  function chipRow(title: string, opts: [string, string][], sel: string[], set: (v: string[]) => void) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--brand-text-secondary)", marginBottom: 5 }}>{title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {opts.map(([v, lab]) => chip(v, lab, sel.includes(v), () => toggle(sel, v, set)))}
        </div>
      </div>
    );
  }

  const meta = (e: LibExercise) => {
    const bits: string[] = [];
    const mk = muscleKey(e.muscle_group);
    const dk = modalityKey(e.modality);
    if (mk) bits.push(M_MUSCLE.find(([v]) => v === mk)?.[1] || mk);
    if (dk) bits.push(M_MODALITY.find(([v]) => v === dk)?.[1] || dk);
    const eq = Array.from(new Set((e.equipment_required || []).map(equipKey).filter(Boolean))) as string[];
    if (eq.length) bits.push(eq.slice(0, 2).map((k) => M_EQUIP.find(([v]) => v === k)?.[1] || k).join(", "));
    return bits.join(" · ");
  };

  // The detail view is a LAYER. Everything behind it — search text, chips,
  // scroll — stays mounted, so Back is genuinely back.
  if (detail) {
    return (
      <div>
        <button onClick={() => setDetail(null)}
          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "var(--brand-text)", padding: "2px 0 10px", fontFamily: "inherit" }}>
          ← Back to results
        </button>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, color: "var(--brand-text)" }}>{detail.name}</div>
        <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", marginTop: 5 }}>{meta(detail) || "No details recorded"}</div>
        {detail.video_url ? (
          <a href={detail.video_url} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", marginTop: 14, padding: 12, borderRadius: 12, border: "1px solid var(--brand-border)", textAlign: "center", fontWeight: 800, fontSize: 13.5, color: "var(--brand-text)", textDecoration: "none" }}>
            ▶ Watch the demo
          </a>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--brand-text-secondary)" }}>No video on this one yet.</div>
        )}
        <button onClick={() => { onPick(detail.name); setDetail(null); }}
          style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 800, fontFamily: "inherit" }}>
          Use this movement
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--brand-text)" }}>Pick a movement</div>
        <button onClick={onClose}
          style={{ marginLeft: "auto", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--brand-text-secondary)", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") askAi(); }}
          placeholder="Search, or describe what you want"
          style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontFamily: "inherit", fontSize: 14 }} />
        <button onClick={askAi} disabled={aiBusy || !q.trim()} title="Let AI read what you asked for"
          style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "10px 13px", borderRadius: 10, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: aiBusy || !q.trim() ? "default" : "pointer", opacity: aiBusy || !q.trim() ? 0.5 : 1, fontWeight: 800, fontSize: 13, fontFamily: "inherit" }}>
          {aiBusy ? "…" : <><AiBadge size={16} mood="neutral" ring={false} title="" /> Ask</>}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={() => setShowFilters((v) => !v)}
          style={{ padding: "6px 11px", borderRadius: 999, border: "1px solid var(--brand-border)", background: filterCount ? "color-mix(in srgb, var(--brand-primary) 14%, transparent)" : "transparent", color: "var(--brand-text)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
          {showFilters ? "Hide filters" : "Filters"}{filterCount ? ` · ${filterCount}` : ""}
        </button>
        {filterCount > 0 && (
          <button onClick={clearFilters}
            style={{ border: "none", background: "transparent", color: "var(--brand-text-secondary)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>Clear</button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--brand-text-secondary)", fontWeight: 700 }}>
          {results.length} movement{results.length === 1 ? "" : "s"}
        </span>
      </div>

      {aiReading && (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, padding: "9px 11px", borderRadius: 10, marginBottom: 10, color: "var(--brand-text)", background: "color-mix(in srgb, var(--brand-primary) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--brand-primary) 24%, transparent)" }}>
          {aiReading}
        </div>
      )}

      {showFilters && (
        <div style={{ padding: "4px 0 2px" }}>
          {chipRow("Body part", M_MUSCLE, fMuscle, setFMuscle)}
          {chipRow("Type", M_MODALITY, fMod, setFMod)}
          {chipRow("Equipment", M_EQUIP, fEquip, setFEquip)}
        </div>
      )}

      {loading ? (
        <FunLoader label="Loading the movement library…" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "46dvh", overflowY: "auto" }}>
          {results.slice(0, 150).map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 11px", borderRadius: 11, border: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--brand-text)", lineHeight: 1.3 }}>{e.name}</div>
                <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 3 }}>
                  {meta(e)}{e.video_url ? " · video" : ""}
                </div>
              </div>
              <button onClick={() => onPick(e.name)}
                style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 9, border: "none", background: "var(--brand-primary)", color: "#fff", cursor: "pointer", fontSize: 12.5, fontWeight: 800, fontFamily: "inherit" }}>Use</button>
              <button onClick={() => setDetail(e)}
                style={{ flexShrink: 0, padding: "8px 11px", borderRadius: 9, border: "1px solid var(--brand-border)", background: "transparent", color: "var(--brand-text)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>View</button>
            </div>
          ))}
          {results.length === 0 && (
            <div style={{ padding: 14, fontSize: 13, lineHeight: 1.5, color: "var(--brand-text-secondary)" }}>
              Nothing matches that.{filterCount > 0 ? " Try clearing a filter." : " You can still type the name yourself."}
            </div>
          )}
          {results.length > 150 && (
            <div style={{ padding: "8px 2px", fontSize: 11.5, color: "var(--brand-text-secondary)" }}>
              Showing the first 150 of {results.length}. Narrow it with a filter or a word.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
