"use client";

import { useState } from "react";
import {
  type MacroTargets, type MacroKey,
  gramsAtPct, pctOf, setGrams, setKcal, setPct,
} from "@/lib/nutrition/macroSplit";

/**
 * CALORIES AND MACROS, IN ONE CONTROL, ALWAYS AGREEING.
 *
 * Dustin, 11 Sep 2026: *"We need to be able to change the macros and the
 * calories, and they all need to follow each other. If I lower my carbs by
 * grams, it needs to drop the calories down — or it may make more sense to set
 * the macros by percentages and then give a number in grams at each percentage
 * based off of the calories right next to it."*
 *
 * Three ways in, every one of them leaving numbers that agree:
 *
 *   grams  → the other two stay put, calories follow (4/4/9)
 *   calories → the split is kept, all three grams rescale
 *   percent  → the calories stay put, the other two keep their ratio
 *
 * The arithmetic is `macroSplit.ts`, which is where the reasoning and the tests
 * live. This file is the boxes.
 *
 * ONE CONTROL, BOTH PLACES — the targets he types before a plan is drafted and
 * the targets he overrides on the draft. Two copies of a rule this fiddly would
 * disagree inside a week.
 *
 * ── Why a raw-text buffer ──────────────────────────────────────────────────
 *
 * A fully controlled numeric input that recomputes on every keystroke fights
 * the person typing: clear the box to retype and it snaps to 0 under their
 * cursor. So the FOCUSED field keeps the characters as typed, and the value
 * underneath is committed on every change. On blur the buffer is dropped and
 * the box re-reads the real number — which is also what makes a rescale
 * visible the moment you leave the field.
 */
export default function TargetEditor({
  value, onChange, title,
}: {
  value: MacroTargets;
  onChange: (t: MacroTargets) => void;
  title?: string;
}) {
  const [raw, setRaw] = useState<Record<string, string>>({});
  const pct = pctOf(value);

  const box: React.CSSProperties = {
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)",
    borderRadius: 12, padding: "10px 6px", fontSize: 13, width: "100%", outline: "none", textAlign: "center",
  };
  const cap: React.CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: "var(--brand-text-secondary)", textAlign: "center", display: "block" };

  const digits = (s: string) => s.replace(/[^0-9]/g, "");
  const shown = (key: string, real: number) => (raw[key] !== undefined ? raw[key] : String(real));
  const commit = (key: string, text: string, apply: (n: number) => MacroTargets) => {
    const d = digits(text);
    setRaw((r) => ({ ...r, [key]: d }));
    onChange(apply(d === "" ? 0 : Number(d)));
  };
  const release = (key: string) => setRaw((r) => { const n = { ...r }; delete n[key]; return n; });

  const MACROS: { k: MacroKey; label: string }[] = [
    { k: "p", label: "PROTEIN" }, { k: "c", label: "CARBS" }, { k: "f", label: "FAT" },
  ];

  return (
    <div>
      {title && (
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>{title}</p>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        <label className="block">
          <span style={cap}>CALORIES</span>
          <input inputMode="numeric" aria-label="target calories"
            value={shown("kcal", value.kcal)}
            onChange={(e) => commit("kcal", e.target.value, (n) => setKcal(value, n))}
            onBlur={() => release("kcal")}
            style={{ ...box, fontWeight: 800 }} />
        </label>
        {MACROS.map(({ k, label }) => (
          <label key={k} className="block">
            <span style={cap}>{label} g</span>
            <input inputMode="numeric" aria-label={`target ${label.toLowerCase()} grams`}
              value={shown(k, value[k])}
              onChange={(e) => commit(k, e.target.value, (n) => setGrams(value, k, n))}
              onBlur={() => release(k)}
              style={box} />
          </label>
        ))}
      </div>

      {/* The percentage row, under the grams it belongs to. Each box says what
          that share comes to in grams — the number he asked to see beside it. */}
      <div className="grid grid-cols-4 gap-1.5 mt-1">
        <span style={{ ...cap, alignSelf: "center", paddingTop: 6 }}>% OF CAL</span>
        {MACROS.map(({ k, label }) => (
          <label key={k} className="block">
            <input inputMode="numeric" aria-label={`target ${label.toLowerCase()} percent`}
              value={shown(`${k}%`, pct[k])}
              onChange={(e) => commit(`${k}%`, e.target.value, (n) => setPct(value, k, n))}
              onBlur={() => release(`${k}%`)}
              style={{ ...box, padding: "8px 6px", fontSize: 12 }} />
            <span style={{ ...cap, marginTop: 2 }}>
              {gramsAtPct(value.kcal, k, Number(shown(`${k}%`, pct[k])) || 0)} g
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs mt-1.5" style={{ color: "var(--brand-text-secondary)" }}>
        {pct.p + pct.c + pct.f === 100
          ? "Change any box — the rest follow. Calories are always 4/4/9 of the grams."
          : `Splits to ${pct.p + pct.c + pct.f}% — grams are what count, so this is only rounding.`}
      </p>
    </div>
  );
}
