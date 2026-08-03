"use client";

// Build a workout by hand. No AI, no waiting, no describing what you want to a
// model and hoping.
//
// Dustin: "is there a way for plp to just manually enter a custom workout
// without using ai?" Half of one existed — free text describing what you did —
// but nothing that produced a workout you could actually LOG, set by set. That
// gap mattered most for the people who need it least: someone who already knows
// they're doing 4x8 incline press had to explain that to a model first.
//
// Deliberately plain. Rows of name / sets / reps / load, add a row, save. No
// pickers, no drag handles, no modal inside a modal. Someone standing in a gym
// with one thumb free is the whole audience.

import { useState } from "react";

interface Row {
  name: string;
  sets: string;
  reps: string;
  load: string;
  section: string;
}

const SECTIONS = ["Warm-Up", "Strength", "Accessory", "Cardio"];
const blank = (): Row => ({ name: "", sets: "3", reps: "10", load: "", section: "Strength" });

export default function ManualWorkoutBuilder({
  clientId,
  date,
  onDone,
  onCancel,
}: {
  /** Only set when a TRAINER builds for someone else. */
  clientId?: string;
  date?: string;
  onDone?: (dayId: string) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [markDone, setMarkDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = rows.filter((r) => r.name.trim());
  const canSave = title.trim().length > 0 && named.length > 0 && !busy;

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/workout-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          date,
          title: title.trim(),
          markDone,
          exercises: named.map((r) => ({
            name: r.name.trim(),
            sets: Number(r.sets) || null,
            reps: Number(r.reps) || null,
            load: r.load.trim() || null,
            section: r.section,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // Show what the server actually said. "Something went wrong" tells a
        // client nothing, and the two real failures here — no active program,
        // nothing entered — are both things they can act on.
        setError((json && json.error) || "Could not save that workout.");
        return;
      }
      if (onDone) onDone(json.dayId);
      else window.location.reload();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input: React.CSSProperties = {
    padding: "9px 10px",
    borderRadius: 9,
    border: "1px solid var(--brand-border)",
    background: "var(--brand-bg)",
    color: "var(--brand-text)",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Workout name — e.g. Push Day, Hotel Gym Full Body"
        style={{ ...input, fontWeight: 700 }}
      />

      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--brand-border)",
            background: "color-mix(in srgb, var(--brand-primary) 5%, var(--brand-surface))",
            borderRadius: 12,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={`Exercise ${i + 1}`}
              style={input}
            />
            {rows.length > 1 && (
              <button
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label={`Remove exercise ${i + 1}`}
                style={{
                  flex: "0 0 auto", width: 34, height: 34, borderRadius: 9,
                  border: "1px solid var(--brand-border)", background: "var(--brand-surface)",
                  color: "#ef4444", cursor: "pointer", fontSize: 15, lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--brand-text-secondary)" }}>SETS</span>
              <input value={r.sets} onChange={(e) => update(i, { sets: e.target.value })} inputMode="numeric" style={input} />
            </label>
            <label style={{ flex: 1 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--brand-text-secondary)" }}>REPS</span>
              <input value={r.reps} onChange={(e) => update(i, { reps: e.target.value })} inputMode="numeric" style={input} />
            </label>
            <label style={{ flex: 1.4 }}>
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--brand-text-secondary)" }}>LOAD</span>
              {/* Free text on purpose: "45 lb", "bodyweight", "red band", "RPE 8"
                  are all things people actually write, and none of them parse. */}
              <input value={r.load} onChange={(e) => update(i, { load: e.target.value })} placeholder="optional" style={input} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => update(i, { section: s })}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  border: "1px solid " + (r.section === s ? "var(--brand-primary)" : "var(--brand-border)"),
                  background: r.section === s ? "var(--brand-primary)" : "transparent",
                  color: r.section === s ? "#fff" : "var(--brand-text-secondary)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={() => setRows((prev) => [...prev, blank()])}
        style={{
          padding: 12, borderRadius: 12, border: "1px dashed var(--brand-border)",
          background: "transparent", color: "var(--brand-text)", cursor: "pointer",
          fontSize: 14, fontWeight: 700,
        }}
      >
        + Add another exercise
      </button>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--brand-text)", cursor: "pointer" }}>
        <input type="checkbox" checked={markDone} onChange={(e) => setMarkDone(e.target.checked)} style={{ width: 16, height: 16 }} />
        I already did this — log it as completed
      </label>

      {error && (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: "#ef4444", margin: 0 }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              flex: "0 0 auto", padding: "12px 16px", borderRadius: 12,
              border: "1px solid var(--brand-border)", background: "transparent",
              color: "var(--brand-text-secondary)", cursor: "pointer", fontWeight: 700,
            }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={save}
          disabled={!canSave}
          style={{
            flex: 1, padding: 12, borderRadius: 12, border: "none",
            background: "var(--brand-primary)", color: "#fff", cursor: canSave ? "pointer" : "default",
            fontSize: 14, fontWeight: 800, opacity: canSave ? 1 : 0.5,
          }}
        >
          {busy ? "Saving…" : markDone ? "Save & log it" : "Save workout"}
        </button>
      </div>
    </div>
  );
}
