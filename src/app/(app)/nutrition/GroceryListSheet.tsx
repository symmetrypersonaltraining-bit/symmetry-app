"use client";

import { useMemo, useState } from "react";

interface GItem { id: string; food: string; amount: number | null; unit: string | null; is_unlimited: boolean; position: number; }
interface GMeal { id: string; name: string; timing: string | null; position: number; meal_items: GItem[]; }
interface GPlan { id: string; meals: GMeal[]; }

// Weekly grocery-list generator (app-wide for any meal plan). The client marks how many
// days this week they'll eat each option; we sum the plan's meal_items × days into one list.
export default function GroceryListSheet({ plan, onClose }: { plan: GPlan; onClose: () => void }) {
  // Group meals into slots by position (options share a position).
  const slots = useMemo(() => {
    const byPos: Record<number, GMeal[]> = {};
    for (const m of [...(plan.meals || [])].sort((a, b) => a.position - b.position)) {
      (byPos[m.position] ||= []).push(m);
    }
    return Object.keys(byPos).map(Number).sort((a, b) => a - b).map((position) => ({ position, options: byPos[position] }));
  }, [plan]);

  const slotLabel = (s: { position: number; options: GMeal[] }) =>
    (s.options[0].timing && s.options[0].timing.length <= 24 ? s.options[0].timing : null) || `Meal ${s.position}`;

  // days[mealId] = how many days this week they'll eat that option.
  // Default: single-option slots pre-filled to 7; multi-option start at 0 so the client chooses.
  const [days, setDays] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {};
    for (const s of slots) {
      if (s.options.length === 1) d[s.options[0].id] = 7;
    }
    return d;
  });
  const [copied, setCopied] = useState(false);

  const list = useMemo(() => {
    const agg: Record<string, { food: string; unit: string | null; total: number; unlimited: boolean }> = {};
    for (const s of slots) {
      for (const opt of s.options) {
        const n = days[opt.id] || 0;
        if (n <= 0) continue;
        for (const it of opt.meal_items || []) {
          const key = (it.food || "").toLowerCase() + "||" + (it.unit || "");
          if (!agg[key]) agg[key] = { food: it.food, unit: it.unit, total: 0, unlimited: false };
          if (it.is_unlimited || it.amount == null) { agg[key].unlimited = true; }
          else agg[key].total += (Number(it.amount) || 0) * n;
        }
      }
    }
    return Object.values(agg).sort((a, b) => a.food.localeCompare(b.food));
  }, [slots, days]);

  const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
  const anySelected = list.length > 0;

  function copyList() {
    const text = "Grocery list — this week\n" + list.map(r => {
      const qty = r.unlimited && r.total === 0 ? "as needed" : `${fmt(r.total)}${r.unit ? " " + r.unit : ""}${r.unlimited ? " + as needed" : ""}`;
      return `• ${r.food} — ${qty}`;
    }).join("\n");
    try {
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    } catch { /* noop */ }
  }

  return (
    <div className="fixed inset-0 z-[1200] flex items-end" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="w-full rounded-t-3xl p-5" style={{ background: "var(--brand-surface)", maxHeight: "90vh", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }} onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--brand-border)" }} />
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base" style={{ color: "var(--brand-text)" }}>Weekly grocery list</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
          Set how many days this week you&apos;ll eat each option — we&apos;ll total up everything you need to buy.
        </p>

        {slots.map(s => (
          <div key={s.position} className="mb-3">
            <p className="text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>{slotLabel(s)}</p>
            <div className="rounded-xl p-2" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              {s.options.map(opt => {
                const n = days[opt.id] || 0;
                return (
                  <div key={opt.id} className="flex items-center gap-2 py-1.5 px-1">
                    <span className="flex-1 min-w-0 text-sm truncate" style={{ color: n > 0 ? "var(--brand-text)" : "var(--brand-text-secondary)" }}>{opt.name}</span>
                    <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid var(--brand-border)" }}>
                      <button onClick={() => setDays(p => ({ ...p, [opt.id]: Math.max(0, (p[opt.id] || 0) - 1) }))}
                        className="w-8 h-8 text-base font-bold" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>−</button>
                      <span className="w-8 text-center text-sm" style={{ color: "var(--brand-text)" }}>{n}</span>
                      <button onClick={() => setDays(p => ({ ...p, [opt.id]: Math.min(7, (p[opt.id] || 0) + 1) }))}
                        className="w-8 h-8 text-base font-bold" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>＋</button>
                    </div>
                    <span className="text-xs w-9 text-right flex-shrink-0" style={{ color: "var(--brand-text-secondary)" }}>{n > 0 ? `${n}d` : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="mt-4 rounded-2xl p-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>Shopping list</p>
            {anySelected && (
              <button onClick={copyList} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-card)", color: "var(--brand-primary)" }}>
                {copied ? "Copied!" : "Copy"}
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
                  <span className="flex-shrink-0 font-semibold" style={{ color: "var(--brand-text)" }}>
                    {r.unlimited && r.total === 0 ? "as needed" : `${fmt(r.total)}${r.unit ? " " + r.unit : ""}${r.unlimited ? " + as needed" : ""}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
