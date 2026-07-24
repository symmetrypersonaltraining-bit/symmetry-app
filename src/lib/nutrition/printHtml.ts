// ============================================================================
// Nutrition v3 — shared print/PDF HTML renderer (isomorphic).
//
// Used by BOTH the client-side Grocery & Prep sheet (printed via a hidden
// iframe → native "Save as PDF / Share" — no navigation, no trap screen) and
// the server /nutrition/print route. ONE renderer so the PDF Dustin sends to
// clients matches what he sees in-app exactly.
//
// Pure — only imports the isomorphic calc modules.
// ============================================================================

import { PlanMeal, kcalOf } from "./dailyTotals";
import { buildGroceryList, buildPrepCards, RangeSpec } from "./groceryEngine";

export type PrintKind = "plan" | "grocery" | "prep";

export interface PrintCtx {
  kind: PrintKind;
  clientName: string;
  planLabel: string;      // e.g. "Peak Week v2" or "plan v2"
  meals: PlanMeal[];
  target: { calories: number; protein: number; carbs: number; fats: number } | null;
  startISO: string;
  days: number;
  todayISO: string;
}

export function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
const rnd = (n: number) => Math.round(Number(n) || 0);

// ---- body renderers --------------------------------------------------------

export function renderBody(ctx: PrintCtx): { title: string; subt: string; body: string } {
  const { kind, meals, target, startISO, days } = ctx;
  const range: RangeSpec = { startISO, days };
  const rangeLabel = `${fmtDay(startISO)} – ${fmtDay(addDays(startISO, days - 1))} · ${days} day${days === 1 ? "" : "s"}`;
  let title = "Nutrition Plan", subt = "", body = "";

  if (kind === "plan") {
    title = "Nutrition Plan";
    subt = "Current live plan";
    if (target) body += `<div class="targets">Daily targets: <b>${rnd(target.calories).toLocaleString()} kcal</b> · ${rnd(target.protein)}P / ${rnd(target.carbs)}C / ${rnd(target.fats)}F</div>`;
    if (!meals.length) body += `<p class="muted">No live plan on file — open logging.</p>`;
    meals.forEach((m, i) => {
      let p = 0, c = 0, f = 0;
      const rowsHtml = (m.meal_items || [])
        .slice().sort((a, b) => a.position - b.position)
        .map((it) => {
          p += Number(it.protein) || 0; c += Number(it.carbs) || 0; f += Number(it.fats) || 0;
          const amt = it.is_unlimited ? "unlimited (free)" : `${it.amount ?? ""}${it.unit ? " " + esc(it.unit) : ""}`;
          const mac = it.is_unlimited ? "—" : `${rnd(kcalOf(Number(it.protein) || 0, Number(it.carbs) || 0, Number(it.fats) || 0))} kcal · ${rnd(it.protein || 0)}P/${rnd(it.carbs || 0)}C/${rnd(it.fats || 0)}F`;
          return `<div class="row"><span>${esc(it.food)} — ${amt}</span><b>${mac}</b></div>`;
        }).join("");
      body += `<div class="sec">M${i + 1} — ${esc(m.name)}${m.timing ? ` · ${esc(m.timing)}` : ""}</div>${rowsHtml}` +
        `<div class="row total"><span>Meal total</span><b>${rnd(kcalOf(p, c, f))} kcal · ${rnd(p)}P/${rnd(c)}C/${rnd(f)}F</b></div>` +
        (m.swaps ? `<div class="note">Swaps: ${esc(m.swaps)}</div>` : "");
    });
  } else if (kind === "grocery") {
    title = "Grocery List";
    subt = rangeLabel;
    const list = buildGroceryList(meals, range);
    if (!list.length) body += `<p class="muted">No live plan — grocery list generates once a plan is assigned.</p>`;
    const groups: Record<string, typeof list> = {};
    for (const l of list) (groups[l.group] ||= [] as typeof list).push(l);
    const order: [string, string][] = [["protein", "PROTEIN — buy RAW · meat in lb + oz"], ["carbs", "CARBS"], ["fats", "FATS"], ["other", "OTHER"], ["free", "FREE / UNLIMITED"]];
    for (const [g, lab] of order) {
      const items = groups[g];
      if (!items?.length) continue;
      body += `<div class="sec">${lab}</div>` + items.map((l) =>
        `<div class="row"><span>${esc(l.food)}${l.detail ? `<small> · ${esc(l.detail)}</small>` : ""}</span><b>${esc(l.qty)}</b></div>`
      ).join("");
    }
    body += `<div class="note">Grocery amounts are RAW (what to buy): cooked meat ×4/3 · grains → dry · potatoes ×1.2. Alternating meals are read day-by-day across the window.</div>`;
  } else {
    title = "Meal-Prep Production Sheet";
    subt = rangeLabel;
    const { cards, fresh } = buildPrepCards(meals, range);
    if (!cards.length && !fresh.length) body += `<p class="muted">No live plan — prep cards generate once a plan is assigned.</p>`;
    body += `<div class="note" style="margin-bottom:8px;">DAILY PRODUCTION SHEET · ${days} DAYS FROM ${esc(fmtDay(startISO).toUpperCase())} · reads the plan day-by-day — alternations included. Amounts are COOKED (oz first, grams secondary).</div>`;
    for (const card of cards) {
      body += `<div class="sec">${esc(card.mealName)}${card.timing ? ` · ${esc(card.timing)}` : ""}</div>`;
      for (const g of card.groups) {
        if (g.containers <= 0) continue;
        body += `<div class="sub">${g.label ? esc(g.label) + " · " : ""}MAKE ${g.containers} CONTAINER${g.containers === 1 ? "" : "S"} — each container:</div>`;
        body += g.items.map((it) => `<div class="row"><span>${esc(it.food)}${it.free ? " <small>(free)</small>" : ""}</span><b>${esc(it.qty)}</b></div>`).join("");
        body += `<div class="row total"><span>Per container</span><b>${rnd(g.perContainer.kcal)} kcal · ${rnd(g.perContainer.p)}P/${rnd(g.perContainer.c)}C/${rnd(g.perContainer.f)}F</b></div>`;
        if (g.batch.length) body += `<div class="sub">COOK TOTAL (BATCH):</div>` + g.batch.map((b) => `<div class="cook">${esc(b)}</div>`).join("");
      }
    }
    if (fresh.length) {
      body += `<div class="sec">MADE FRESH DAILY (no containers)</div>` +
        fresh.map((fr) => `<div class="row"><span>${esc(fr.mealName)}</span><b>${fr.days} day${fr.days === 1 ? "" : "s"} — repeat plan amounts each morning</b></div>`).join("");
    }
  }
  return { title, subt, body };
}

const DOC_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1b1c20; background: #f2f2f4; margin: 0; }
  .toolbar { position: sticky; top: 0; background: #141418; color: #fff; padding: 10px 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; z-index: 5; }
  .toolbar a, .toolbar button { border: 1px solid #3a3a42; background: #1e1e24; color: #cfcfd6; border-radius: 8px; padding: 8px 13px; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; }
  .toolbar a.on { background: #E53935; border-color: #E53935; color: #fff; }
  .toolbar .back { background: #1e1e24; border-color: #565660; color: #fff; }
  .toolbar .share { background: #E53935; border-color: #E53935; color: #fff; margin-left: auto; }
  .page { max-width: 700px; margin: 18px auto 40px; background: #fff; border-radius: 10px; padding: 22px 24px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1b1c20; padding-bottom: 8px; margin-bottom: 10px; }
  .head b { font-size: 15px; letter-spacing: 2px; }
  .head b span { color: #E53935; }
  .head small { color: #666; font-size: 11px; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .subt { color: #666; font-size: 11px; margin-bottom: 10px; }
  .targets { font-size: 12px; background: #f6f6f8; border: 1px solid #e4e4e8; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
  .sec { font-size: 10px; font-weight: 800; letter-spacing: 1px; color: #888; margin: 14px 0 4px; text-transform: uppercase; border-bottom: 1px solid #e2e2e2; padding-bottom: 3px; }
  .sub { font-size: 10px; font-weight: 800; letter-spacing: 0.8px; color: #2e7d32; margin: 8px 0 3px; }
  .row { display: flex; justify-content: space-between; gap: 12px; padding: 3.5px 0; border-bottom: 1px dotted #eee; font-size: 12px; }
  .row span { color: #333; }
  .row small { color: #999; font-size: 10px; }
  .row b { color: #111; text-align: right; white-space: nowrap; font-size: 11.5px; }
  .row.total { border-bottom: none; padding-top: 6px; }
  .row.total b { color: #E53935; }
  .cook { font-size: 11px; color: #444; padding: 3px 0 3px 12px; border-left: 2px solid #ddd; margin: 3px 0; }
  .note { margin-top: 10px; color: #777; font-size: 10.5px; }
  .muted { color: #999; font-size: 13px; }
  .foot { margin-top: 16px; color: #999; font-size: 9.5px; text-align: center; }
  @media print { .toolbar { display: none !important; } body { background: #fff; } .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; } }
`;

// Full standalone HTML document. `toolbar`:
//   "none"   → print-only doc (used when we print via a hidden iframe — the
//              toolbar would never show anyway; keeps the file clean to share).
//   "screen" → a Close + Share bar (screen-only, hidden in print) so a
//              full-page open is NEVER a dead end.
//   custom   → caller-provided toolbar inner HTML (server route: nav tabs + back).
export function buildPrintDocument(
  ctx: PrintCtx,
  opts: { toolbar?: "none" | "screen" | { innerHtml: string } } = {}
): string {
  const { clientName, planLabel, todayISO } = ctx;
  const { title, subt, body } = renderBody(ctx);
  const tb = opts.toolbar ?? "screen";
  let toolbarHtml = "";
  if (tb === "screen") {
    toolbarHtml = `<div class="toolbar"><button class="back" onclick="goBack()">‹ Close</button><button class="share" onclick="doShare()">Share / Save PDF</button></div>`;
  } else if (typeof tb === "object") {
    toolbarHtml = `<div class="toolbar">${tb.innerHtml}</div>`;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(clientName)} · ${esc(title)} · Symmetry</title>
<style>${DOC_STYLE}</style>
</head>
<body>
  ${toolbarHtml}
  <div class="page">
    <div class="head"><b>SYMMETRY<span>.</span></b><small>${esc(clientName)} · ${esc(planLabel)}</small></div>
    <h1>${esc(title)}</h1>
    <div class="subt">${esc(subt)}</div>
    ${body}
    <div class="foot">Generated by Symmetry Corrective · ${esc(fmtDay(todayISO))}</div>
  </div>
  <script>
    function goBack(){ try { if (window.opener) { window.close(); return; } } catch(e){} if (history.length > 1) history.back(); else location.href = '/nutrition'; }
    async function doShare(){ try { if (navigator.share) { await navigator.share({ title: document.title, url: window.location.href }); return; } } catch(e){} window.print(); }
  </script>
</body>
</html>`;
}
