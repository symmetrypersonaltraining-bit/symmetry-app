"use client";

// Nutrition v3 — custom meal composer: name + free-text items with amounts →
// AI parse (/api/nutrition-ai/parse) → itemized, editable (steppers/remove) →
// save. Side-by-side compare vs the plan meal it replaces (swap mode).

import { useState } from "react";
import { describeItems, CustomItem, Macros, customMealMacros, customMealNutrientMap } from "@/lib/nutrition/dailyTotals";
import { countKnownNutrients, formatNutrient, groupedNutrients, pctOfDaily } from "@/lib/nutrition/nutrients";
import { parseFoodText, lastParseFailure, parseFailureMessage } from "@/lib/nutrition/parseClient";
import Sheet from "./Sheet";
import AiBadge from "@/components/AiBadge";
import MicButton from "@/components/MicButton";

export default function ComposerSheet({
  title,
  subtitle,
  clientId,
  askName,
  initialName,
  compare,
  saveLabel,
  keepOption,
  draft,
  onDraftChange,
  onOpenFoodSearch,
  onSave,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: string;
  clientId: string;
  askName?: boolean;
  /** Seeds draft.name when the parent opens this sheet. Read there, not here. */
  initialName?: string;
  compare?: { label: string; macros: Macros } | null;
  saveLabel: string;
  /**
   * Show the "keep this in My Meals" tick above the save button, and pass its
   * state to onSave.
   *
   * Robert Burns, 14 Aug: he typed what he ate, logged it, and went looking for
   * a way to keep it. There wasn't one on this screen. The save DOES exist —
   * "⭐ Save to My Meals" — but only in a meal's ⋯ menu, and only AFTER the meal
   * is on the plan, which is not where anyone finishes typing. He also looked
   * for "My Foods", which is what he'd have called it.
   *
   * A tick here rather than a second button: the moment he wants is "log this
   * AND keep it", and two buttons would make him pick one.
   *
   * 21 Aug: it is now on EVERY mode. Swap and unlogged-insert used to call
   * saveMyMeal whether or not anybody asked, which is how a library fills with
   * meals nobody chose to keep. Dustin: "when i hit swap for custom, it should
   * not force to save the meal in library, it's an option but may just be a
   * one time off plan swap they type and ai parse for macros and cal."
   */
  keepOption?: boolean;
  /**
   * The draft, owned by the parent.
   *
   * It used to live in here, which was fine while typing was the only way to
   * get an item into a custom meal. It stopped being fine the moment the food
   * library became reachable from this sheet: only the TOP sheet in the stack
   * renders, so pushing the search unmounts this component, and a locally-held
   * draft is gone — the typed name, the parsed items, all of it — by the time
   * the food comes back. Lifting it up means the round trip to the library is
   * invisible, and Back out of the search returns to the meal as it was.
   *
   * Only the DRAFT moves. The textarea, the parsing spinner and the nutrient
   * disclosure stay local: they are about this render, not about the meal.
   */
  draft: { name: string; items: CustomItem[] };
  onDraftChange: (next: { name: string; items: CustomItem[] }) => void;
  /** Opens the food library. Omit and the button is not drawn. */
  onOpenFoodSearch?: () => void;
  onSave: (items: CustomItem[], name: string, keep: boolean) => void | Promise<void>;
  onClose: () => void;
  onBack?: () => void;
}) {
  const name = draft.name;
  const items = draft.items;
  const setName = (v: string) => onDraftChange({ name: v, items });
  const setItems = (fn: (prev: CustomItem[]) => CustomItem[]) =>
    onDraftChange({ name, items: fn(items) });
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseFailed, setParseFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Defaults OFF. Most typed meals are a one-off ("chicken and rice at Mum's"),
  // and a library that fills itself with those is worse than one you have to
  // opt into — the whole complaint was about FINDING the save, not about it
  // being one tap too many.
  const [keep, setKeep] = useState(false);
  // Collapsed by default. The macros are why anyone opened this sheet; the
  // nutrients are why they might change their mind about it.
  const [showNutrients, setShowNutrients] = useState(false);

  const totals = customMealMacros({ name, items });
  // The same function the day total will call on this meal once it is logged,
  // not a second addition written here — see customMealNutrientMap.
  const nutrients = customMealNutrientMap({ name, items });
  const knownNutrients = countKnownNutrients(nutrients);
  const r = Math.round;

  async function runParse() {
    if (!text.trim()) return;
    setParsing(true);
    setParseFailed(null);
    const result = await parseFoodText(text.trim(), clientId);
    setParsing(false);
    if (!result || !result.items.length) { setParseFailed(parseFailureMessage(lastParseFailure())); return; }
    setItems((prev) => [...prev, ...result.items]);
    // A food that is not in the database is NOT added, and saying so is the
    // whole point — every number on these rows now comes from a real row, so a
    // food with no row has no honest macros to show. Dropping it quietly would
    // leave a logged meal missing an item nobody noticed.
    setParseFailed(
      result.unresolved?.length
        ? `Added the rest. Couldn't find ${result.unresolved.slice(0, 3).join(", ")} in the food database — add ${result.unresolved.length > 1 ? "those" : "that"} from Food search so the macros are right.`
        : null,
    );
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
      {/* Voice sits ON the box, not on a previous screen. Somebody standing at a
          counter reciting what they just ate should not have to back out of the
          composer to find the microphone. */}
      <div style={{ position: "relative" }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type items with amounts… e.g. 8 oz chicken breast, 1 cup jasmine rice, 1 tbsp olive oil"
          rows={3}
          style={{ ...inputStyle, resize: "none", fontFamily: "inherit", paddingRight: 48 }}
        />
        <div style={{ position: "absolute", right: 8, bottom: 10 }}>
          <MicButton size={32} onText={(t) => setText((p) => (p ? p + ", " + t : t))} />
        </div>
      </div>
      <button onClick={runParse} disabled={parsing || !text.trim()} className="w-full mt-2 py-3 rounded-2xl text-sm font-bold text-white" style={{ background: "var(--brand-primary)", opacity: text.trim() && !parsing ? 1 : 0.6 }}>
        {parsing ? "Parsing items & estimating macros…" : "AI parse items →"}
      </button>

      {/* The library, from here.
          Dustin, 21 Aug: "make sure that the app can access full food library
          from every option." Every other way of building a meal could reach the
          catalogue; this one — the sheet behind "Swap for custom" — could only
          be typed into, so a food with a known label was re-typed and
          re-estimated by the model instead of read off the row that already
          had the real numbers. Sits under the parse button rather than above
          it: typing is still the fast path, this is the accurate one. */}
      {onOpenFoodSearch && (
        <button
          onClick={onOpenFoodSearch}
          className="w-full mt-1.5 py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}
        >
          <span aria-hidden>🗄</span> Pick from the food library
        </button>
      )}
      {parsing && (
        <div className="flex items-center gap-3 mt-3 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <AiBadge size={22} mood="thinking" title="" />
          <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Analyzing…</span>
        </div>
      )}
      {parseFailed && (
        <p className="text-xs mt-2 rounded-xl p-2.5" style={{ background: "rgba(245,158,11,0.12)", color: "#b45309", border: "1px solid rgba(245,158,11,0.4)" }}>
          {parseFailed}
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

          {/*
            The nutrients this meal is about to log.

            The parse route asks the model for all 33 and the day total reads
            them — but below the day level this sheet showed four macros and
            stopped, so nobody could see what a typed meal was actually worth
            until after it was logged and they went looking for the day panel.

            Registry helpers only — groupedNutrients, formatNutrient,
            pctOfDaily. A local formatter here is exactly what produced the
            duplicate nutrient panel that had to be reverted on 15 Aug.
          */}
          {knownNutrients === 0 ? (
            // Said out loud. "We don't know" and "it contains none" are
            // different facts, and the estimate is only as good as what the
            // model returned.
            <p className="text-xs pb-1" style={{ color: "var(--brand-text-secondary)" }}>
              No nutrient detail for these items — macros only.
            </p>
          ) : (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowNutrients((v) => !v)}
                aria-expanded={showNutrients}
                className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
                style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)", background: "transparent" }}
              >
                {showNutrients ? "Hide" : "Show"} nutrients ({knownNutrients})
              </button>
              {showNutrients && (
                <div className="mt-2">
                  {groupedNutrients(nutrients)
                    .map((g) => ({ ...g, rows: g.rows.filter((row) => row.value != null) }))
                    .filter((g) => g.rows.length > 0)
                    .map((g) => (
                      <div key={g.group} className="mb-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>
                          {g.label}
                        </p>
                        {g.rows.map((row) => {
                          const pct = pctOfDaily(row.def.key, row.value);
                          return (
                            <div key={row.def.key} className="flex items-baseline justify-between text-xs py-0.5">
                              <span style={{ color: "var(--brand-text)" }}>{row.def.label}</span>
                              <span style={{ color: "var(--brand-text-secondary)" }}>
                                {formatNutrient(row.def.key, row.value)}
                                {/* Rounded, like the day panel's nutrientRow.
                                    pctOfDaily returns full precision on
                                    purpose, so every render site has to do
                                    this — printing it raw gives
                                    "12.345678901234568%". */}
                                {pct != null && <span className="ml-2 opacity-70">{Math.round(pct)}%</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  <p className="text-[10px] mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                    Estimated. Percentages are of a general daily reference, not your targets.
                  </p>
                </div>
              )}
            </div>
          )}

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
          {keepOption && (
            <button
              type="button"
              onClick={() => setKeep((k) => !k)}
              aria-pressed={keep}
              className="w-full mt-1 mb-1 flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left"
              style={{ background: "var(--brand-bg)", border: `1px solid ${keep ? "#22c55e" : "var(--brand-border)"}` }}
            >
              <span
                aria-hidden
                className="flex items-center justify-center rounded-md"
                style={{
                  width: 20, height: 20, fontSize: 13, fontWeight: 800, lineHeight: 1,
                  background: keep ? "#22c55e" : "transparent",
                  border: keep ? "1px solid #22c55e" : "1px solid var(--brand-border)",
                  color: "#fff",
                }}
              >
                {keep ? "✓" : ""}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                ⭐ Keep this in My Meals
                <span className="block text-xs font-normal" style={{ color: "var(--brand-text-secondary)" }}>
                  Off by default — a one-off swap stays a one-off. Tick it and it is in the library to reuse.
                </span>
              </span>
            </button>
          )}
          <button
            onClick={async () => { setSaving(true); try { await onSave(items, name.trim() || describeItems(items), keep); } finally { setSaving(false); } }}
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
