"use client";

// Nutrition v3 — custom meal composer: name + free-text items with amounts →
// AI parse (/api/nutrition-ai/parse) → itemized, editable (steppers/remove) →
// save. Side-by-side compare vs the plan meal it replaces (swap mode).

import { useState } from "react";
import { CustomItem, Macros, customMealMacros } from "@/lib/nutrition/dailyTotals";
import { parseFoodText } from "@/lib/nutrition/parseClient";
import Sheet from "./Sheet";

export default function ComposerSheet({
  title,
  subtitle,
  clientId,
  askName,
  initialName,
  compare,
  saveLabel,
  onSave,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: string;
  clientId: string;
  askName?: boolean;
  initialName?: string;
  compare?: { label: string; macros: Macros } | null;
  saveLabel: string;
  onSave: (items: CustomItem[], name: string) => void | Promise<void>;
  onClose: () => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState(initialName || "");
  const [text, setText] = useState("");
  const [items, setItems] = useState<CustomItem[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseFailed, setParseFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const totals = customMealMacros({ name, items });
  const r = Math.round;

  async function runParse() {
    if (!text.trim()) return;
    setParsing(true);
    setParseFailed(false);
    const result = await parseFoodText(text.trim(), clientId);
    setParsing(false);
    if (!result || !result.items.length) { setParseFailed(true); return; }
    setItems((prev) => [...prev, ...result.items]);
    setText("");
  }

  function step(i: number, dir: number) {
    setItems((prev) => prev.map((it, j) => j === i
      ? { ...it, fac: Math.max(0.25, Math.min(4, Math.round(((it.fac ?? 1) + dir * 0.25) * 100) / 100)) }
      : it));
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)",
    borderRadius: 12, padding: "10px 12px", fontSize: 13, width: "100%", outline: "none",
  };

  return (
    <Sheet title={title} subtitle={subtitle || "Free-text items → AI parse → editable macros"} onClose={onClose} onBack={onBack}>
      {askName && (
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Meal name — e.g. Salmon power bowl" style={{ ...inputStyle, marginBottom: 8 }} />
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type items with amounts… e.g. 8 oz chicken breast, 1 cup jasmine rice, 1 tbsp olive oil"
        rows={3}
        style={{ ...inputStyle, resize: "none", fontFamily: "inherit" }}
      />
      <button onClick={runParse} disabled={parsing || !text.trim()} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: text.trim() && !parsing ? 1 : 0.6 }}>
        {parsing ? "Parsing items & estimating macros…" : "AI parse items →"}
      </button>
      {parsing && (
        <div className="flex items-center gap-3 mt-3 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <span className="inline-block w-5 h-5 rounded-full animate-spin" style={{ border: "2.5px solid var(--brand-border)", borderTopColor: "var(--brand-primary)" }} />
          <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Analyzing…</span>
        </div>
      )}
      {parseFailed && (
        <p className="text-xs mt-2 rounded-xl p-2.5" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.4)" }}>
          Couldn&apos;t parse right now — try again in a moment, or add foods one-by-one from the food database.
        </p>
      )}

      {items.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest mt-4 mb-2" style={{ color: "var(--brand-text-secondary)" }}>
            Parsed items — edit anything <span style={{ color: "#42A5F5", fontSize: 9, fontWeight: 800, background: "rgba(66,165,245,0.15)", padding: "2px 6px", borderRadius: 5 }}>EST</span>
          </p>
          {items.map((it, i) => {
            const fac = it.fac ?? 1;
            return (
              <div key={i} className="flex items-center gap-2 rounded-xl p-2.5 mb-1.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--brand-text)" }}>{it.n}</p>
                  <p style={{ color: "var(--brand-text-secondary)", fontSize: 10 }}>
                    {(it.a || "1 serving")}{fac !== 1 ? ` ×${fac}` : ""} · {r((it.k ?? 0) * fac)} cal · {r(it.p * fac)}P/{r(it.c * fac)}C/{r(it.f * fac)}F{it.free ? " · FREE" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => step(i, -1)} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>−</button>
                  <span className="text-xs font-bold text-center" style={{ color: "var(--brand-text-secondary)", minWidth: 32 }}>×{fac}</span>
                  <button onClick={() => step(i, 1)} className="w-7 h-7 rounded-lg text-sm font-bold" style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>＋</button>
                </div>
                <button onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))} aria-label="Remove item" style={{ color: "var(--brand-text-secondary)", padding: 6 }}>✕</button>
              </div>
            );
          })}
          <div className="flex justify-between py-2 text-sm font-bold" style={{ color: "var(--brand-text)" }}>
            <span style={{ color: "var(--brand-text-secondary)", fontWeight: 500 }}>Total</span>
            <span>{r(totals.kcal)} cal · {r(totals.protein)}P / {r(totals.carbs)}C / {r(totals.fats)}F</span>
          </div>
          {compare && (
            <div className="grid grid-cols-2 gap-2 my-2">
              <div className="rounded-xl p-2.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <p className="text-xs font-bold" style={{ color: "var(--brand-text)" }}>{compare.label}</p>
                <p style={{ color: "var(--brand-text-secondary)", fontSize: 11 }}>
                  {r(compare.macros.kcal)} cal · {r(compare.macros.protein)}P/{r(compare.macros.carbs)}C/{r(compare.macros.fats)}F
                </p>
              </div>
              <div className="rounded-xl p-2.5" style={{ background: "var(--brand-bg)", border: "1px solid #22c55e" }}>
                <p className="text-xs font-bold" style={{ color: "var(--brand-text)" }}>Your custom</p>
                <p style={{ color: "var(--brand-text-secondary)", fontSize: 11 }}>
                  {r(totals.kcal)} cal · {r(totals.protein)}P/{r(totals.carbs)}C/{r(totals.fats)}F
                </p>
                <p style={{ color: "#22c55e", fontSize: 11, fontWeight: 700 }}>
                  {totals.kcal <= compare.macros.kcal ? "−" : "+"}{Math.abs(r(totals.kcal - compare.macros.kcal))} cal vs plan
                </p>
              </div>
            </div>
          )}
          <button
            onClick={async () => { setSaving(true); try { await onSave(items, name.trim() || "Custom meal"); } finally { setSaving(false); } }}
            disabled={saving}
            className="w-full mt-1 py-3 rounded-2xl text-sm font-bold text-white"
            style={{ background: "var(--brand-primary)" }}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        </>
      )}
    </Sheet>
  );
}
