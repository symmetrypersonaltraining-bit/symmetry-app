"use client";

import { useMemo, useState } from "react";

interface GItem { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; position: number; basis?: string | null; }
interface GMeal { id: string; name: string; timing: string | null; position: number; meal_items: GItem[]; }
interface GPlan { id: string; meals: GMeal[]; }

// Grocery + meal-prep generator (app-wide for any meal plan).
// Client picks a start date + number of days, sets how many days they'll eat each
// meal option, and marks meals as batch-prepped or made fresh. Output: one combined
// grocery list (amount × days per item) + a prep card (containers + batch amounts).

const DAY_MS = 86400000;

function toISO(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function fmtShort(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function GroceryListSheet({ plan, onClose }: { plan: GPlan; onClose: () => void }) {
  // ---- Date range: start date + # of days ----
  const todayISO = toISO(new Date());
  const [startISO, setStartISO] = useState(todayISO);
  const [numDays, setNumDays] = useState(7);
  const endISO = useMemo(() => {
    const d = new Date(startISO + "T12:00:00");
    return toISO(new Date(d.getTime() + (numDays - 1) * DAY_MS));
  }, [startISO, numDays]);

  // ---- Group meals into slots by position (options share a position) ----
  const slots = useMemo(() => {
    const byPos: Record<number, GMeal[]> = {};
    for (const m of [...(plan.meals || [])].sort((a, b) => a.position - b.position)) {
      (byPos[m.position] ||= []).push(m);
    }
    return Object.keys(byPos).map(Number).sort((a, b) => a - b).map((position) => ({ position, options: byPos[position] }));
  }, [plan]);

  const slotLabel = (s: { position: number; options: GMeal[] }) =>
    (s.options[0].timing && s.options[0].timing.length <= 24 ? s.options[0].timing : null) || `Meal ${s.position}`;

  // days[mealId] = how many days in the range they'll eat that option.
  // Single-option slots track the range length automatically until the client
  // overrides them (then they're clamped to the range). Multi-option start at 0.
  const [daysOverride, setDaysOverride] = useState<Record<string, number>>({});
  const daysFor = (opt: GMeal, slot: { options: GMeal[] }) => {
    const v = daysOverride[opt.id];
    if (v != null) return Math.min(v, numDays);
    return slot.options.length === 1 ? numDays : 0;
  };
  // Cap a slot's total selected days at the range length.
  const slotTotal = (slot: { options: GMeal[] }) => slot.options.reduce((t, o) => t + daysFor(o, slot), 0);

  // fresh[mealId] = true → made fresh daily (no containers on the prep card).
  const [fresh, setFresh] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const basisTag = (b?: string | null) => (b === "raw" ? " raw" : b === "cooked" ? " cooked" : "");

  // ---- Grocery list: amount × days, merged across all meals ----
  const list = useMemo(() => {
    const agg: Record<string, { food: string; unit: string | null; basis: string | null; total: number; unlimited: boolean }> = {};
    for (const s of slots) {
      for (const opt of s.options) {
        const n = daysFor(opt, s);
        if (n <= 0) continue;
        for (const it of opt.meal_items || []) {
          const key = (it.food || "").toLowerCase() + "||" + (it.unit || "") + "||" + (it.basis || "");
          if (!agg[key]) agg[key] = { food: it.food, unit: it.unit, basis: it.basis || null, total: 0, unlimited: false };
          if (it.is_unlimited || it.amount == null) { agg[key].unlimited = true; }
          else agg[key].total += (Number(it.amount) || 0) * n;
        }
      }
    }
    return Object.values(agg).sort((a, b) => a.food.localeCompare(b.food));
  }, [slots, daysOverride, numDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Prep card: per selected option → containers + batch amounts ----
  const prep = useMemo(() => {
    const rows: { meal: GMeal; slotName: string; n: number; isFresh: boolean; items: { food: string; unit: string | null; basis: string | null; total: number; unlimited: boolean }[] }[] = [];
    for (const s of slots) {
      for (const opt of s.options) {
        const n = daysFor(opt, s);
        if (n <= 0) continue;
        rows.push({
          meal: opt,
          slotName: slotLabel(s),
          n,
          isFresh: !!fresh[opt.id],
          items: (opt.meal_items || []).map(it => ({
            food: it.food,
            unit: it.unit,
            basis: it.basis || null,
            total: it.is_unlimited || it.amount == null ? 0 : (Number(it.amount) || 0) * n,
            unlimited: it.is_unlimited || it.amount == null,
          })),
        });
      }
    }
    return rows;
  }, [slots, daysOverride, numDays, fresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
  const qtyText = (r: { total: number; unit: string | null; basis: string | null; unlimited: boolean }) => {
    const unit = `${r.unit ? " " + r.unit : ""}${basisTag(r.basis)}`;
    return r.unlimited && r.total === 0 ? "as needed" : `${fmt(r.total)}${unit}${r.unlimited ? " + as needed" : ""}`;
  };
  const anySelected = list.length > 0;
  const prepped = prep.filter(p => !p.isFresh);
  const freshRows = prep.filter(p => p.isFresh);

  function copyList() {
    const lines: string[] = [];
    lines.push(`Grocery list — ${fmtShort(startISO)} to ${fmtShort(endISO)} (${numDays} day${numDays === 1 ? "" : "s"})`);
    for (const r of list) lines.push(`• ${r.food} — ${qtyText(r)}`);
    if (prepped.length > 0) {
      lines.push("");
      lines.push("Meal prep card");
      for (const p of prepped) {
        lines.push(`${p.meal.name} (${p.slotName}) — ${p.n} container${p.n === 1 ? "" : "s"}`);
        for (const it of p.items) lines.push(`  • ${it.food} — ${qtyText(it)}`);
      }
    }
    if (freshRows.length > 0) {
      lines.push("");
      lines.push("Made fresh daily (no prep containers)");
      for (const p of freshRows) lines.push(`• ${p.meal.name} (${p.slotName}) — ${p.n} day${p.n === 1 ? "" : "s"}`);
    }
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* noop */ }
  }

  const stepBtn = { background: "var(--brand-card)", color: "var(--brand-primary)" } as const;

  return (
    <div className="fixed inset-0 z-[1200] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", maxHeight: "90vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>Grocery list &amp; meal prep</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
          Pick your dates, set how many days you&apos;ll eat each option, and we&apos;ll build your shopping list and prep card.
        </p>

        {/* ---- Date range picker ---- */}
        <div className="rounded-xl p-3 mb-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Start</span>
            <input type="date" value={startISO} onChange={e => { if (e.target.value) setStartISO(e.target.value); }}
              className="flex-1 min-w-0 text-sm rounded-lg px-2 py-1.5"
              style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", colorScheme: "dark light" }} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>Days</span>
            {[3, 5, 7].map(n => (
              <button key={n} onClick={() => setNumDays(n)}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold"
                style={numDays === n ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-card)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>{n}</button>
            ))}
            <div className="flex items-center rounded-lg overflow-hidden ml-auto" style={{ border: "1px solid var(--brand-border)" }}>
              <button onClick={() => setNumDays(n => Math.max(1, n - 1))} className="w-8 h-8 text-base font-bold" style={stepBtn}>−</button>
              <span className="w-8 text-center text-sm" style={{ color: "var(--brand-text)" }}>{numDays}</span>
              <button onClick={() => setNumDays(n => Math.min(14, n + 1))} className="w-8 h-8 text-base font-bold" style={stepBtn}>＋</button>
            </div>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--brand-text-secondary)" }}>
            {fmtShort(startISO)} – {fmtShort(endISO)} · {numDays} day{numDays === 1 ? "" : "s"}
          </p>
        </div>

        {/* ---- Per-meal day counts + fresh toggle ---- */}
        {slots.map(s => {
          const total = slotTotal(s);
          return (
            <div key={s.position} className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--brand-text-secondary)" }}>{slotLabel(s)}</p>
                {s.options.length > 1 && (
                  <span className="text-xs" style={{ color: total > numDays ? "#ef4444" : "var(--brand-text-secondary)" }}>{total}/{numDays} days</span>
                )}
              </div>
              <div className="rounded-xl p-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                {s.options.map(opt => {
                  const n = daysFor(opt, s);
                  const isFresh = !!fresh[opt.id];
                  return (
                    <div key={opt.id} className="py-1.5 px-1">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 min-w-0 text-sm truncate" style={{ color: n > 0 ? "var(--brand-text)" : "var(--brand-text-secondary)" }}>{opt.name}</span>
                        <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--brand-border)" }}>
                          <button onClick={() => setDaysOverride(p => ({ ...p, [opt.id]: Math.max(0, daysFor(opt, s) - 1) }))}
                            className="w-8 h-8 text-base font-bold" style={stepBtn}>−</button>
                          <span className="w-8 text-center text-sm" style={{ color: "var(--brand-text)" }}>{n}</span>
                          <button onClick={() => setDaysOverride(p => ({ ...p, [opt.id]: Math.min(numDays, daysFor(opt, s) + 1) }))}
                            className="w-8 h-8 text-base font-bold" style={stepBtn}>＋</button>
                        </div>
                        <span className="text-xs w-9 text-right flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>{n > 0 ? `${n}d` : ""}</span>
                      </div>
                      {n > 0 && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <button onClick={() => setFresh(p => ({ ...p, [opt.id]: false }))}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={!isFresh ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-card)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                            <i className="ti ti-box" /> Prep
                          </button>
                          <button onClick={() => setFresh(p => ({ ...p, [opt.id]: true }))}
                            className="text-xs px-2 py-1 rounded-md font-semibold"
                            style={isFresh ? { background: "var(--brand-primary)", color: "#fff" } : { background: "var(--brand-card)", border: "1px solid var(--brand-border)", color: "var(--brand-text-secondary)" }}>
                            <i className="ti ti-flame" /> Fresh daily
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ---- Grocery list ---- */}
        <div className="mt-4 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>
              <i className="ti ti-shopping-cart" /> Grocery list · {fmtShort(startISO)}–{fmtShort(endISO)}
            </p>
            {anySelected && (
              <button onClick={copyList} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>
                {copied ? "Copied!" : "Copy all"}
              </button>
            )}
          </div>
          {!anySelected ? (
            <p className="text-sm py-2" style={{ color: "var(--brand-text-secondary)" }}>Pick some options above to build your list.</p>
          ) : (
            <div className="space-y-1.5">
              {list.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm" style={{ color: "var(--brand-text)" }}>
                  <span className="min-w-0 truncate mr-2">{r.food}</span>
                  <span className="flex-shrink-0 font-semibold" style={{ color: "var(--brand-text)" }}>{qtyText(r)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ---- Meal prep card ---- */}
        {prepped.length > 0 && (
          <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--brand-text-secondary)" }}>
              <i className="ti ti-box" /> Meal prep card
            </p>
            <div className="space-y-3">
              {prepped.map(p => (
                <div key={p.meal.id} className="rounded-xl p-2.5" style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold min-w-0 truncate mr-2" style={{ color: "var(--brand-text)" }}>{p.meal.name}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: "var(--brand-primary)", color: "#fff" }}>
                      {p.n} container{p.n === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-xs mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>{p.slotName} · batch amounts for {p.n} day{p.n === 1 ? "" : "s"}</p>
                  <div className="space-y-1">
                    {p.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between text-sm" style={{ color: "var(--brand-text)" }}>
                        <span className="min-w-0 truncate mr-2">{it.food}</span>
                        <span className="flex-shrink-0" style={{ color: "var(--brand-text)" }}>{qtyText(it)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ---- Fresh-daily note ---- */}
        {freshRows.length > 0 && (
          <div className="mt-3 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
              <i className="ti ti-flame" /> Made fresh daily
            </p>
            {freshRows.map(p => (
              <div key={p.meal.id} className="flex items-center justify-between text-sm py-0.5" style={{ color: "var(--brand-text)" }}>
                <span className="min-w-0 truncate mr-2">{p.meal.name} <span style={{ color: "var(--brand-text-secondary)" }}>· {p.slotName}</span></span>
                <span className="flex-shrink-0 text-xs" style={{ color: "var(--brand-text-secondary)" }}>{p.n} day{p.n === 1 ? "" : "s"} — ingredients on list</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
