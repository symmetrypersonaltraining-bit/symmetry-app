// Nutrition v3 — printable plan / grocery / meal-prep production sheet.
// Server route rendering clean printable HTML → browser print-to-PDF or the
// native share sheet (Web Share API when available). Reached from the v3
// "⋯" plan menu. Simple + reliable by design: no client bundle, no PDF lib.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PlanMeal, kcalOf } from "@/lib/nutrition/dailyTotals";
import { buildGroceryList, buildPrepCards } from "@/lib/nutrition/groceryEngine";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("clientId") || "";
  const kind = (sp.get("kind") || "plan") as "plan" | "grocery" | "prep";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const start = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("start") || "") ? sp.get("start")! : today;
  const days = Math.max(1, Math.min(14, parseInt(sp.get("days") || "7", 10) || 7));

  // Access: trainer, or the signed-in client viewing their own plan.
  const isTrainer = user.email === TRAINER_EMAIL;
  if (!isTrainer) {
    const { data: c } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!c || (c as { id: string }).id !== clientId) {
      return new NextResponse("Not allowed", { status: 403 });
    }
  }

  const [clientRes, planRes, targetRes] = await Promise.all([
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
    supabase
      .from("meal_plans")
      .select("id, version_number, effective_date, meals(id, name, timing, position, swaps, rotation, meal_items(id, food, amount, unit, is_unlimited, basis, protein, carbs, fats, position))")
      .eq("client_id", clientId).eq("status", "live").lte("effective_date", today)
      .order("effective_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("macro_targets").select("calories, protein, carbs, fats").eq("client_id", clientId)
      .lte("effective_date", today).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const clientName = (clientRes.data as { name?: string } | null)?.name || "Client";
  const plan = planRes.data as { id: string; version_number: number | null; meals: PlanMeal[] } | null;
  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
  const meals: PlanMeal[] = [...(plan?.meals || [])].sort((a, b) => a.position - b.position);
  const range = { startISO: start, days };
  const rangeLabel = `${fmtDay(start)} – ${fmtDay(addDays(start, days - 1))} · ${days} day${days === 1 ? "" : "s"}`;

  let title = "Nutrition Plan";
  let body = "";

  if (kind === "plan") {
    title = "Nutrition Plan";
    body += target
      ? `<div class="targets">Daily targets: <b>${Math.round(target.calories).toLocaleString()} kcal</b> · ${Math.round(target.protein)}P / ${Math.round(target.carbs)}C / ${Math.round(target.fats)}F</div>`
      : "";
    if (!meals.length) body += `<p class="muted">No live plan on file — open logging.</p>`;
    meals.forEach((m, i) => {
      let p = 0, c = 0, f = 0;
      const rowsHtml = (m.meal_items || [])
        .sort((a, b) => a.position - b.position)
        .map((it) => {
          p += Number(it.protein) || 0; c += Number(it.carbs) || 0; f += Number(it.fats) || 0;
          const amt = it.is_unlimited ? "unlimited (free)" : `${it.amount ?? ""}${it.unit ? " " + esc(it.unit) : ""}`;
          const mac = it.is_unlimited ? "—" : `${Math.round(kcalOf(Number(it.protein) || 0, Number(it.carbs) || 0, Number(it.fats) || 0))} kcal · ${Math.round(Number(it.protein) || 0)}P/${Math.round(Number(it.carbs) || 0)}C/${Math.round(Number(it.fats) || 0)}F`;
          return `<div class="row"><span>${esc(it.food)} — ${amt}</span><b>${mac}</b></div>`;
        }).join("");
      body += `<div class="sec">M${i + 1} — ${esc(m.name)}${m.timing ? ` · ${esc(m.timing)}` : ""}</div>${rowsHtml}` +
        `<div class="row total"><span>Meal total</span><b>${Math.round(kcalOf(p, c, f))} kcal · ${Math.round(p)}P/${Math.round(c)}C/${Math.round(f)}F</b></div>` +
        (m.swaps ? `<div class="note">Swaps: ${esc(m.swaps)}</div>` : "");
    });
  } else if (kind === "grocery") {
    title = "Grocery List";
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
    const { cards, fresh } = buildPrepCards(meals, range);
    if (!cards.length && !fresh.length) body += `<p class="muted">No live plan — prep cards generate once a plan is assigned.</p>`;
    body += `<div class="note" style="margin-bottom:8px;">DAILY PRODUCTION SHEET · ${days} DAYS FROM ${fmtDay(start).toUpperCase()} · reads the plan day-by-day — alternations included. Amounts are COOKED (oz first, grams secondary).</div>`;
    for (const card of cards) {
      body += `<div class="sec">${esc(card.mealName)}${card.timing ? ` · ${esc(card.timing)}` : ""}</div>`;
      for (const g of card.groups) {
        if (g.containers <= 0) continue;
        body += `<div class="sub">${g.label ? esc(g.label) + " · " : ""}MAKE ${g.containers} CONTAINER${g.containers === 1 ? "" : "S"} — each container:</div>`;
        body += g.items.map((it) => `<div class="row"><span>${esc(it.food)}${it.free ? " <small>(free)</small>" : ""}</span><b>${esc(it.qty)}</b></div>`).join("");
        body += `<div class="row total"><span>Per container</span><b>${Math.round(g.perContainer.kcal)} kcal · ${Math.round(g.perContainer.p)}P/${Math.round(g.perContainer.c)}C/${Math.round(g.perContainer.f)}F</b></div>`;
        if (g.batch.length) {
          body += `<div class="sub">COOK TOTAL (BATCH):</div>` + g.batch.map((b) => `<div class="cook">${esc(b)}</div>`).join("");
        }
      }
    }
    if (fresh.length) {
      body += `<div class="sec">MADE FRESH DAILY (no containers)</div>` +
        fresh.map((fr) => `<div class="row"><span>${esc(fr.mealName)}</span><b>${fr.days} day${fr.days === 1 ? "" : "s"} — repeat plan amounts each morning</b></div>`).join("");
    }
  }

  const nav = (k: string, lab: string) =>
    `<a href="/nutrition/print?clientId=${esc(clientId)}&kind=${k}&start=${start}&days=${days}" class="${kind === k ? "on" : ""}">${lab}</a>`;
  const dayLink = (n: number) =>
    `<a href="/nutrition/print?clientId=${esc(clientId)}&kind=${kind}&start=${start}&days=${n}" class="${days === n ? "on" : ""}">${n}d</a>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(clientName)} · ${title} · Symmetry</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1b1c20; background: #f2f2f4; margin: 0; }
  .toolbar { position: sticky; top: 0; background: #141418; color: #fff; padding: 10px 14px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar a, .toolbar button { border: 1px solid #3a3a42; background: #1e1e24; color: #cfcfd6; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; text-decoration: none; cursor: pointer; }
  .toolbar a.on { background: #E53935; border-color: #E53935; color: #fff; }
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
  @media print { .toolbar { display: none; } body { background: #fff; } .page { box-shadow: none; margin: 0; max-width: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="toolbar">
    ${nav("plan", "Plan")} ${nav("grocery", "Grocery")} ${nav("prep", "Prep sheet")}
    ${kind !== "plan" ? `${dayLink(3)} ${dayLink(5)} ${dayLink(7)} ${dayLink(14)}` : ""}
    <button class="share" onclick="doShare()">Share / Save PDF</button>
  </div>
  <div class="page">
    <div class="head"><b>SYMMETRY<span>.</span></b><small>${esc(clientName)} · plan ${plan ? "v" + (plan.version_number ?? "—") : "—"}</small></div>
    <h1>${title}</h1>
    <div class="subt">${kind === "plan" ? "Current live plan" : rangeLabel}</div>
    ${body}
    <div class="foot">Generated by Symmetry Corrective · ${fmtDay(today)}</div>
  </div>
  <script>
    async function doShare() {
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url: window.location.href });
          return;
        }
      } catch (e) { /* fall through to print */ }
      window.print();
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const dynamic = "force-dynamic";
