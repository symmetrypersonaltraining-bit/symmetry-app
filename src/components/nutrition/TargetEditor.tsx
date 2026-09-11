"use client";

import { useEffect, useRef, useState } from "react";
import {
  type MacroTargets, type MacroKey,
  fromPct, gramsAtPct, pctOf, setGrams, setKcal, splitAddsUp,
} from "@/lib/nutrition/macroSplit";
import { onTarget } from "@/lib/nutrition/draftEdit";

/**
 * CALORIES AND MACROS, IN ONE CONTROL, ALWAYS AGREEING.
 *
 * Dustin, 11 Sep 2026: *"We need to be able to change the macros and the
 * calories, and they all need to follow each other. If I lower my carbs by
 * grams, it needs to drop the calories down — or it may make more sense to set
 * the macros by percentages and then give a number in grams at each percentage
 * based off of the calories right next to it."*
 *
 * Three ways in:
 *
 *   grams    → the other two stay put, calories follow (4/4/9)
 *   calories → the split is kept, all three grams rescale
 *   percent  → a SET, committed only when the three total 100 — see below
 *
 * The arithmetic is `macroSplit.ts`, which is where the reasoning and the tests
 * live. This file is the boxes.
 *
 * ONE CONTROL, BOTH PLACES — the targets he types before a plan is drafted and
 * the targets he overrides on the draft. Two copies of a rule this fiddly would
 * disagree inside a week.
 *
 * ── WHAT THE PLAN ACTUALLY COMES TO, ON THE SAME BOX ───────────────────────
 *
 * Dustin, 11 Sep 2026: *"What if we have the targets where they are and then
 * have a slash and then the calories of what's actually in the meal plan? That
 * way, as I make adjustments, the second number changes so I can see what my
 * target is and what I'm actually at… The first number on those needs to be
 * the one that changes. So the actual target is the second number… nineteen
 * hundred calories out of eighteen fifty calories. That way I can see that I
 * went over on my calories… And then we don't need that banner at all."*
 *
 * So `actual` prints under each box as "1,900 of 1,850" — what the plan is
 * first, what it is aiming at second — and it replaced the separate "This plan
 * comes to" banner entirely. Four numbers each next to the target they miss
 * beat one line under the two of them.
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
  value, onChange, title, actual, onSplitValid,
}: {
  value: MacroTargets;
  onChange: (t: MacroTargets) => void;
  title?: string;
  /** What the plan below currently comes to. Omit where there is no plan yet. */
  actual?: { kcal: number; p: number; c: number; f: number };
  /** False while the percentage boxes do not total 100, so Accept can wait. */
  onSplitValid?: (ok: boolean) => void;
}) {
  const [raw, setRaw] = useState<Record<string, string>>({});
  // The target as it stood when the focused field was entered. Rescaling the
  // calories from the LAST keystroke zeroes every macro on the way to a bigger
  // number — see setKcal. This is the baseline it scales from instead.
  const [base, setBase] = useState<MacroTargets | null>(null);
  const pct = pctOf(value);

  /**
   * THE PERCENTAGES ARE TYPED AS A SET, NOT ONE AT A TIME.
   *
   * Dustin, 11 Sep: *"when I change one, it should not change the others. It
   * should just show that the others do not match up to a hundred percent
   * until I adjust them manually."*
   *
   * Null means "showing the real split". The moment he types, this holds all
   * three exactly as typed and NOTHING is committed until they total 100 —
   * which is what lets him set a custom split without the other two sliding
   * out from under him, and what keeps a split that does not add up from ever
   * becoming grams.
   */
  const [pctDraft, setPctDraft] = useState<Record<MacroKey, number> | null>(null);
  const shownPct = pctDraft ?? pct;
  const pctTotal = shownPct.p + shownPct.c + shownPct.f;
  const splitOk = pctDraft === null || splitAddsUp(pctDraft);

  // Reported up rather than inferred by the parent, because only this control
  // knows a split is mid-edit. The ref keeps it to real transitions.
  const lastReported = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastReported.current === splitOk) return;
    lastReported.current = splitOk;
    onSplitValid?.(splitOk);
  }, [splitOk, onSplitValid]);

  const box: React.CSSProperties = {
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)",
    borderRadius: 12, padding: "10px 6px", fontSize: 13, width: "100%", outline: "none", textAlign: "center",
  };
  const cap: React.CSSProperties = { fontSize: 9, fontWeight: 800, letterSpacing: 0.6, color: "var(--brand-text-secondary)", textAlign: "center", display: "block" };
  const OFF = "#dc2626";

  const digits = (s: string) => s.replace(/[^0-9]/g, "");
  const shown = (key: string, real: number) => (raw[key] !== undefined ? raw[key] : String(real));

  /** A grams or calories edit. Any of them abandons a half-typed split. */
  const commit = (key: string, text: string, apply: (n: number, from: MacroTargets) => MacroTargets) => {
    const d = digits(text);
    const from = base ?? value;
    if (!base) setBase(from);
    setPctDraft(null);
    setRaw((r) => ({ ...r, [key]: d }));
    onChange(apply(d === "" ? 0 : Number(d), from));
  };
  const release = (key: string) => {
    setRaw((r) => { const n = { ...r }; delete n[key]; return n; });
    setBase(null);
  };

  /** A percentage edit. Held until the three of them are a split. */
  const commitPct = (k: MacroKey, text: string) => {
    const d = digits(text);
    const next = { ...shownPct, [k]: d === "" ? 0 : Math.min(100, Number(d)) };
    if (splitAddsUp(next)) {
      setPctDraft(null);
      onChange(fromPct(value.kcal, next));
    } else {
      setPctDraft(next);
    }
  };

  const MACROS: { k: MacroKey; label: string }[] = [
    { k: "p", label: "PROTEIN" }, { k: "c", label: "CARBS" }, { k: "f", label: "FAT" },
  ];

  /** "1,900 of 1,850" — what it is, then what it is aiming at. */
  const vs = (key: "kcal" | MacroKey, unit: string) => {
    if (!actual) return null;
    const ok = onTarget(key, actual[key], value[key]);
    return (
      <span style={{ ...cap, marginTop: 3, color: ok ? "var(--brand-text-secondary)" : OFF, fontWeight: 800 }}>
        {Math.round(actual[key]).toLocaleString()} of {Math.round(value[key]).toLocaleString()}{unit}
      </span>
    );
  };

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
            onChange={(e) => commit("kcal", e.target.value, (n, from) => setKcal(value, n, from))}
            onBlur={() => release("kcal")}
            style={{ ...box, fontWeight: 800 }} />
          {vs("kcal", "")}
        </label>
        {MACROS.map(({ k, label }) => (
          <label key={k} className="block">
            <span style={cap}>{label} g</span>
            <input inputMode="numeric" aria-label={`target ${label.toLowerCase()} grams`}
              value={shown(k, value[k])}
              onChange={(e) => commit(k, e.target.value, (n, from) => setGrams(from, k, n))}
              onBlur={() => release(k)}
              style={box} />
            {vs(k, "g")}
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
              value={String(shownPct[k])}
              onChange={(e) => commitPct(k, e.target.value)}
              style={{
                ...box, padding: "8px 6px", fontSize: 12,
                border: "1px solid " + (splitOk ? "var(--brand-border)" : OFF),
                color: splitOk ? "var(--brand-text)" : OFF,
                fontWeight: splitOk ? 400 : 800,
              }} />
            <span style={{ ...cap, marginTop: 2 }}>
              {gramsAtPct(value.kcal, k, shownPct[k])} g
            </span>
          </label>
        ))}
      </div>

      <p className="text-xs mt-1.5" style={{ color: splitOk ? "var(--brand-text-secondary)" : OFF, fontWeight: splitOk ? 400 : 700 }}>
        {splitOk
          ? "Change any box — grams move calories, calories keep the split. Percentages apply once the three total 100."
          : `These percentages come to ${pctTotal}%, not 100%. Adjust the other two — nothing is applied, and the plan cannot be saved, until they add up.`}
      </p>
    </div>
  );
}
