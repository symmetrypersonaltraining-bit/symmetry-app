"use client";

// Nutrition v3 — unified Grocery & Prep bottom sheet (replaces the old
// GroceryListSheet path AND the trapping full-screen /nutrition/print page for
// v3). Everything lives here: start-date + day-count controls, an inline
// grocery list (RAW) and full meal-prep production sheet (COOKED, every meal's
// actual items shown inline), and TWO PDF buttons — "Grocery PDF" and
// "Meal Prep PDF" — that generate a shareable/sendable PDF via the browser's
// native print (Save as PDF / Share). Printing happens through a hidden iframe
// so the user NEVER leaves the app — no dead-end screen.

import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import { PlanMeal } from "@/lib/nutrition/dailyTotals";
import { buildGroceryList, buildPrepCards, RangeSpec } from "@/lib/nutrition/groceryEngine";
import { buildPrintDocument, PrintKind } from "@/lib/nutrition/printHtml";

// Print a full HTML document via a hidden iframe → native print dialog
// ("Save as PDF" / Share). No navigation, so the sheet stays open behind it
// and dismissing the dialog returns straight to the app. Falls back to a new
// window (with its own Close + Share) only if the iframe can't be used.
function printHtmlDoc(html: string) {
  try {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    document.body.appendChild(iframe);
    const cw = iframe.contentWindow;
    if (!cw) { iframe.remove(); throw new Error("no iframe window"); }
    cw.document.open();
    cw.document.write(html);
    cw.document.close();
    const fire = () => {
      try { cw.focus(); cw.print(); } catch { /* noop */ }
      setTimeout(() => { try { iframe.remove(); } catch { /* noop */ } }, 2000);
    };
    // Give the browser a tick to lay out before printing.
    setTimeout(fire, 350);
  } catch {
    try {
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
    } catch { /* noop */ }
  }
}

function todayChicago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function fmtShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export default function GroceryPrepSheet({
  clientId, clientName, planLabel, meals, target, onClose,
}: {
  clientId: string;
  clientName: string;
  planLabel: string;
  meals: PlanMeal[];
  target: { calories: number; protein: number; carbs: number; fats: number } | null;
  onClose: () => void;
}) {
  const today = todayChicago();
  const [startISO, setStartISO] = useState(today);
  const [days, setDays] = useState(7);
  const [tab, setTab] = useState<"grocery" | "prep">("grocery");
  const range: RangeSpec = useMemo(() => ({ startISO, days }), [startISO, days]);

  const list = useMemo(() => buildGroceryList(meals, range), [meals, range]);
  const prep = useMemo(() => buildPrepCards(meals, range), [meals, range]);

  const groups = useMemo(() => {
    const g: Record<string, typeof list> = {};
    for (const l of list) (g[l.group] ||= [] as typeof list).push(l);
    return g;
  }, [list]);
  const GROUP_ORDER: [string, string][] = [
    ["protein", "Protein — buy RAW · meat in lb + oz"],
    ["carbs", "Carbs"],
    ["fats", "Fats"],
    ["other", "Other"],
    ["free", "Free / unlimited"],
  ];

  function makePdf(kind: PrintKind) {
    const html = buildPrintDocument(
      { kind, clientName, planLabel, meals, target, startISO, days, todayISO: today },
      { toolbar: "none" }
    );
    printHtmlDoc(html);
  }

  const stepBtn: React.CSSProperties = { background: "var(--brand-bg)", color: "var(--brand-primary)", border: "1px solid var(--brand-border)" };
  const rangeLabel = `${fmtShort(startISO)} – ${fmtShort(addDays(startISO, days - 1))} · ${days} day${days === 1 ? "" : "s"}`;

  return (
    <Sheet title="Grocery & Prep" subtitle="Grocery = RAW (what to buy) · Prep = COOKED per container" onClose={onClose}>
      {/* range controls */}
      <div className="rounded-2xl p-3 mb-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Start</span>
          <input type="date" value={startISO} onChange={(e) => { if (e.target.value) setStartISO(e.target.value); }}
            className="flex-1 min-w-0 text-sm rounded-lg px-2 py-1.5"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Days</span>
          {[3, 5, 7].map((n) => (
            <button key={n} onClick={() => setDays(n)} className="px-3 py-1.5 rounded-lg text-sm font-semibold"
              style={days === n ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>{n}</button>
          ))}
          <div className="flex items-center rounded-lg overflow-hidden ml-auto" style={{ border: "1px solid var(--brand-border)" }}>
            <button onClick={() => setDays((d) => Math.max(1, d - 1))} className="w-8 h-8 text-base font-bold" style={stepBtn}>−</button>
            <span className="w-8 text-center text-sm" style={{ color: "var(--brand-text)" }}>{days}</span>
            <button onClick={() => setDays((d) => Math.min(14, d + 1))} className="w-8 h-8 text-base font-bold" style={stepBtn}>＋</button>
          </div>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--brand-text-secondary)" }}>{rangeLabel}</p>
      </div>

      {/* PDF actions — the sendable outputs */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button onClick={() => makePdf("grocery")} className="py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2" style={{ background: "var(--brand-primary)" }}>
          🛒 Grocery PDF
        </button>
        <button onClick={() => makePdf("prep")} className="py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-primary)", color: "var(--brand-primary)" }}>
          📦 Meal Prep PDF
        </button>
      </div>
      <p className="text-xs text-center mb-3" style={{ color: "var(--brand-text-secondary)" }}>
        Opens your print dialog — pick <b>Save as PDF</b> or <b>Share</b> to send it to a client or family.
      </p>

      {/* view toggle */}
      <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
        {(["grocery", "prep"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className="flex-1 py-2 rounded-lg text-xs font-bold"
            style={tab === t ? { background: "var(--brand-surface)", color: "var(--brand-text)", boxShadow: "0 1px 4px rgba(0,0,0,0.12)" } : { color: "var(--brand-text-secondary)" }}>
            {t === "grocery" ? "Grocery (raw)" : "Prep sheet (cooked)"}
          </button>
        ))}
      </div>

      {/* GROCERY (inline) */}
      {tab === "grocery" && (
        <div>
          {!list.length && <p className="text-sm py-3 text-center" style={{ color: "var(--brand-text-secondary)" }}>No live plan — nothing to buy yet.</p>}
          {GROUP_ORDER.map(([g, lab]) => {
            const items = groups[g];
            if (!items?.length) return null;
            return (
              <div key={g} className="mb-3">
                <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>{lab}</p>
                {items.map((l, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--brand-border)" }}>
                    <span className="text-sm min-w-0 mr-2" style={{ color: "var(--brand-text)" }}>
                      {l.food}
                      {l.detail && <span className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>{l.detail}</span>}
                    </span>
                    <span className="text-sm font-semibold flex-shrink-0 text-right" style={{ color: "var(--brand-text)" }}>{l.qty}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!!list.length && (
            <p className="text-xs rounded-xl p-2.5" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
              RAW buy amounts: cooked meat ×4/3 · grains → dry · potatoes ×1.2. Alternating meals (e.g. chicken ⇄ beef) are split by day across the window.
            </p>
          )}
        </div>
      )}

      {/* PREP production sheet (inline — every meal's items shown) */}
      {tab === "prep" && (
        <div>
          {!prep.cards.length && !prep.fresh.length && <p className="text-sm py-3 text-center" style={{ color: "var(--brand-text-secondary)" }}>No live plan — prep cards generate once a plan is assigned.</p>}
          <p className="text-xs uppercase tracking-widest font-bold mb-2 text-center" style={{ color: "var(--brand-text-secondary)" }}>
            {days}-day production sheet from {fmtShort(startISO)} · cooked oz + grams
          </p>
          {prep.cards.map((card, ci) => (
            <div key={ci} className="rounded-2xl p-3 mb-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <p className="text-sm font-bold mb-1" style={{ color: "var(--brand-text)" }}>
                {card.mealName}{card.timing && <span style={{ color: "var(--brand-text-secondary)", fontWeight: 600 }}> · {card.timing}</span>}
              </p>
              {card.groups.map((grp, gi) => (
                grp.containers <= 0 ? null : (
                  <div key={gi} className="mt-1.5">
                    <p className="text-xs font-bold" style={{ color: "#2e7d32" }}>
                      {grp.label ? grp.label + " · " : ""}MAKE {grp.containers} CONTAINER{grp.containers === 1 ? "" : "S"} — each container:
                    </p>
                    {grp.items.map((it, ii) => (
                      <div key={ii} className="flex justify-between py-0.5 text-xs" style={{ color: "var(--brand-text)", borderBottom: "1px dotted var(--brand-border)" }}>
                        <span style={{ color: "var(--brand-text)" }}>{it.food}{it.free && <span style={{ color: "var(--brand-text-secondary)" }}> (free)</span>}</span>
                        <b className="text-right flex-shrink-0" style={{ color: "var(--brand-text)" }}>{it.qty}</b>
                      </div>
                    ))}
                    <p className="text-xs mt-1" style={{ color: "var(--brand-text-secondary)" }}>
                      Per container: <b style={{ color: "var(--brand-text)" }}>{Math.round(grp.perContainer.kcal)} kcal · {Math.round(grp.perContainer.p)}P/{Math.round(grp.perContainer.c)}C/{Math.round(grp.perContainer.f)}F</b>
                    </p>
                    {grp.batch.length > 0 && (
                      <div className="mt-1.5">
                        <p className="text-xs font-bold" style={{ color: "#2e7d32" }}>COOK TOTAL (BATCH):</p>
                        {grp.batch.map((b, bi) => (
                          <p key={bi} className="text-xs pl-2 py-0.5" style={{ color: "var(--brand-text-secondary)", borderLeft: "2px solid var(--brand-border)" }}>{b}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              ))}
            </div>
          ))}
          {prep.fresh.length > 0 && (
            <div className="rounded-2xl p-3 mb-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--brand-text-secondary)" }}>Made fresh daily</p>
              {prep.fresh.map((fr, i) => (
                <div key={i} className="flex justify-between py-0.5 text-sm" style={{ color: "var(--brand-text)" }}>
                  <span>{fr.mealName}</span>
                  <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>{fr.days} day{fr.days === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
