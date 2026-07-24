// ============================================================================
// Nutrition v3 — real client-side PDF generation (jsPDF).
//
// The in-app Grocery & Prep sheet uses these to produce a genuinely sendable
// PDF that works INSIDE the Capacitor Android/iOS WebView — window.print() is
// a silent no-op there, so we build the bytes ourselves and hand them to the
// native share sheet (or a download fallback). Same groceryEngine data as the
// on-screen list, so the PDF matches exactly.
//
// Pure of React/DOM except sharePdf() (which is guarded + dependency-injectable
// for tests). jsPDF runs fine in the WebView and in node.
// ============================================================================

import { jsPDF } from "jspdf";
import { PlanMeal, kcalOf } from "./dailyTotals";
import { buildGroceryList, buildPrepCards, RangeSpec } from "./groceryEngine";

export interface PdfCtx {
  clientName: string;
  planLabel: string;
  meals: PlanMeal[];
  target: { calories: number; protein: number; carbs: number; fats: number } | null;
  startISO: string;
  days: number;
  todayISO: string;
}

const RED: [number, number, number] = [229, 57, 53];
const INK: [number, number, number] = [27, 28, 32];
const GRAY: [number, number, number] = [120, 120, 128];
const GREEN: [number, number, number] = [46, 125, 50];
const LIGHT: [number, number, number] = [150, 150, 158];

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const rnd = (n: number) => Math.round(Number(n) || 0);

// A tiny cursor-based document builder over jsPDF (letter, points).
class Doc {
  doc: jsPDF;
  y: number;
  readonly ml = 48;
  readonly mr = 48;
  readonly mt = 54;
  readonly mb = 54;
  readonly w: number;
  readonly h: number;

  constructor() {
    this.doc = new jsPDF({ unit: "pt", format: "letter" });
    this.w = this.doc.internal.pageSize.getWidth();
    this.h = this.doc.internal.pageSize.getHeight();
    this.y = this.mt;
  }
  private ensure(space: number) {
    if (this.y + space > this.h - this.mb) { this.doc.addPage(); this.y = this.mt; }
  }
  private color(c: [number, number, number]) { this.doc.setTextColor(c[0], c[1], c[2]); }
  private contentW() { return this.w - this.ml - this.mr; }

  header(clientName: string, planLabel: string) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(15);
    this.color(INK);
    this.doc.text("SYMMETRY", this.ml, this.y);
    const wm = this.doc.getTextWidth("SYMMETRY");
    this.color(RED);
    this.doc.text(".", this.ml + wm + 1, this.y);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9);
    this.color(GRAY);
    this.doc.text(`${clientName} · ${planLabel}`, this.w - this.mr, this.y, { align: "right" });
    this.y += 8;
    this.doc.setDrawColor(INK[0], INK[1], INK[2]);
    this.doc.setLineWidth(1.2);
    this.doc.line(this.ml, this.y, this.w - this.mr, this.y);
    this.y += 18;
  }
  title(t: string, subt: string) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(18);
    this.color(INK);
    this.doc.text(t, this.ml, this.y);
    this.y += 15;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(9.5);
    this.color(GRAY);
    this.doc.text(subt, this.ml, this.y);
    this.y += 16;
  }
  section(label: string) {
    this.ensure(26);
    this.y += 6;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8.5);
    this.color(GRAY);
    this.doc.text(label.toUpperCase(), this.ml, this.y);
    this.y += 4;
    this.doc.setDrawColor(225, 225, 228);
    this.doc.setLineWidth(0.6);
    this.doc.line(this.ml, this.y, this.w - this.mr, this.y);
    this.y += 11;
  }
  sub(label: string, color: [number, number, number] = GREEN) {
    this.ensure(18);
    this.y += 3;
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(8.5);
    this.color(color);
    this.doc.text(label.toUpperCase(), this.ml, this.y);
    this.y += 12;
  }
  // left label (wraps) + right value (bold). Returns nothing.
  row(left: string, right: string, opts: { bold?: boolean; rightColor?: [number, number, number]; small?: string } = {}) {
    this.doc.setFontSize(10);
    this.doc.setFont("helvetica", "normal");
    const rightW = right ? this.doc.getTextWidth(right) + 8 : 0;
    const leftMax = this.contentW() - rightW;
    const lines = this.doc.splitTextToSize(left, leftMax) as string[];
    const smallLines = opts.small ? (this.doc.splitTextToSize(opts.small, leftMax) as string[]) : [];
    const blockH = lines.length * 12 + smallLines.length * 9 + 4;
    this.ensure(blockH);
    const startY = this.y;
    this.color(INK);
    this.doc.setFont("helvetica", "normal");
    lines.forEach((ln, i) => this.doc.text(ln, this.ml, startY + i * 12));
    if (smallLines.length) {
      this.doc.setFontSize(8);
      this.color(LIGHT);
      smallLines.forEach((ln, i) => this.doc.text(ln, this.ml, startY + lines.length * 12 + i * 9));
      this.doc.setFontSize(10);
    }
    if (right) {
      this.doc.setFont("helvetica", opts.bold ? "bold" : "bold");
      this.color(opts.rightColor || INK);
      this.doc.text(right, this.w - this.mr, startY, { align: "right" });
    }
    this.y = startY + blockH;
    // hairline separator
    this.doc.setDrawColor(238, 238, 240);
    this.doc.setLineWidth(0.4);
    this.doc.line(this.ml, this.y - 3, this.w - this.mr, this.y - 3);
  }
  cook(line: string) {
    this.doc.setFontSize(9);
    this.doc.setFont("helvetica", "normal");
    const lines = this.doc.splitTextToSize(line, this.contentW() - 12) as string[];
    this.ensure(lines.length * 11 + 2);
    this.color([70, 70, 74]);
    lines.forEach((ln, i) => this.doc.text(ln, this.ml + 12, this.y + i * 11));
    this.y += lines.length * 11 + 2;
  }
  note(t: string) {
    this.doc.setFontSize(8.5);
    this.doc.setFont("helvetica", "normal");
    const lines = this.doc.splitTextToSize(t, this.contentW()) as string[];
    this.ensure(lines.length * 11 + 8);
    this.y += 6;
    this.color(GRAY);
    lines.forEach((ln, i) => this.doc.text(ln, this.ml, this.y + i * 11));
    this.y += lines.length * 11;
  }
  muted(t: string) {
    this.doc.setFontSize(11);
    this.color(LIGHT);
    this.doc.text(t, this.ml, this.y + 10);
    this.y += 24;
  }
  footer(todayISO: string) {
    const pages = this.doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      this.doc.setPage(p);
      this.doc.setFontSize(8);
      this.color(LIGHT);
      this.doc.text(`Generated by Symmetry Corrective · ${fmtDay(todayISO)}`, this.w / 2, this.h - 28, { align: "center" });
    }
  }
}

const GROUP_ORDER: [string, string][] = [
  ["protein", "Protein — buy RAW · meat in lb + oz"],
  ["carbs", "Carbs"],
  ["fats", "Fats"],
  ["other", "Other"],
  ["free", "Free / unlimited"],
];

export function buildGroceryPdf(ctx: PdfCtx): jsPDF {
  const { meals, startISO, days } = ctx;
  const range: RangeSpec = { startISO, days };
  const d = new Doc();
  d.header(ctx.clientName, ctx.planLabel);
  d.title("Grocery List", `${fmtDay(startISO)} – ${fmtDay(addDays(startISO, days - 1))} · ${days} day${days === 1 ? "" : "s"}`);
  const list = buildGroceryList(meals, range);
  if (!list.length) {
    d.muted("No live plan — grocery list generates once a plan is assigned.");
  } else {
    const groups: Record<string, typeof list> = {};
    for (const l of list) (groups[l.group] ||= [] as typeof list).push(l);
    for (const [g, lab] of GROUP_ORDER) {
      const items = groups[g];
      if (!items?.length) continue;
      d.section(lab);
      for (const l of items) d.row(l.food, l.qty, { small: l.detail || undefined });
    }
    d.note("Grocery amounts are RAW (what to buy): cooked meat ×4/3 · grains → dry · potatoes ×1.2. Alternating meals are read day-by-day across the window.");
  }
  d.footer(ctx.todayISO);
  return d.doc;
}

export function buildPrepPdf(ctx: PdfCtx): jsPDF {
  const { meals, startISO, days } = ctx;
  const range: RangeSpec = { startISO, days };
  const d = new Doc();
  d.header(ctx.clientName, ctx.planLabel);
  d.title("Meal-Prep Production Sheet", `${fmtDay(startISO)} – ${fmtDay(addDays(startISO, days - 1))} · ${days} day${days === 1 ? "" : "s"}`);
  const { cards, fresh } = buildPrepCards(meals, range);
  if (!cards.length && !fresh.length) {
    d.muted("No live plan — prep cards generate once a plan is assigned.");
  } else {
    d.note(`DAILY PRODUCTION SHEET · ${days} DAYS FROM ${fmtDay(startISO).toUpperCase()} · reads the plan day-by-day — alternations included. Amounts are COOKED (oz first, grams secondary).`);
    for (const card of cards) {
      d.section(card.mealName + (card.timing ? ` · ${card.timing}` : ""));
      for (const g of card.groups) {
        if (g.containers <= 0) continue;
        d.sub(`${g.label ? g.label + " · " : ""}MAKE ${g.containers} CONTAINER${g.containers === 1 ? "" : "S"} — each container:`);
        for (const it of g.items) d.row(it.food + (it.free ? "  (free)" : ""), it.qty);
        d.row("Per container", `${rnd(g.perContainer.kcal)} kcal · ${rnd(g.perContainer.p)}P/${rnd(g.perContainer.c)}C/${rnd(g.perContainer.f)}F`, { rightColor: RED });
        if (g.batch.length) {
          d.sub("Cook total (batch):");
          for (const b of g.batch) d.cook(b);
        }
      }
    }
    if (fresh.length) {
      d.section("Made fresh daily (no containers)");
      for (const fr of fresh) d.row(fr.mealName, `${fr.days} day${fr.days === 1 ? "" : "s"} — repeat plan amounts`);
    }
  }
  d.footer(ctx.todayISO);
  return d.doc;
}

// Optional plan-summary PDF (kept for completeness / deep-link parity).
export function buildPlanPdf(ctx: PdfCtx): jsPDF {
  const { meals, target } = ctx;
  const d = new Doc();
  d.header(ctx.clientName, ctx.planLabel);
  d.title("Nutrition Plan", "Current live plan");
  if (target) d.note(`Daily targets: ${rnd(target.calories).toLocaleString()} kcal · ${rnd(target.protein)}P / ${rnd(target.carbs)}C / ${rnd(target.fats)}F`);
  if (!meals.length) d.muted("No live plan on file — open logging.");
  meals.forEach((m, i) => {
    d.section(`M${i + 1} — ${m.name}${m.timing ? ` · ${m.timing}` : ""}`);
    let p = 0, c = 0, f = 0;
    for (const it of (m.meal_items || []).slice().sort((a, b) => a.position - b.position)) {
      p += Number(it.protein) || 0; c += Number(it.carbs) || 0; f += Number(it.fats) || 0;
      const amt = it.is_unlimited ? "unlimited (free)" : `${it.amount ?? ""}${it.unit ? " " + it.unit : ""}`;
      const mac = it.is_unlimited ? "—" : `${rnd(kcalOf(Number(it.protein) || 0, Number(it.carbs) || 0, Number(it.fats) || 0))} kcal`;
      d.row(`${it.food} — ${amt}`, mac);
    }
    d.row("Meal total", `${rnd(kcalOf(p, c, f))} kcal · ${rnd(p)}P/${rnd(c)}C/${rnd(f)}F`, { rightColor: RED });
  });
  d.footer(ctx.todayISO);
  return d.doc;
}

// Generate → native share (with the PDF file) → download fallback. Guarded and
// dependency-injectable so it can be unit-tested. Returns which path ran.
export async function sharePdf(
  doc: jsPDF,
  filename: string,
  title: string,
  text: string,
  deps?: {
    nav?: { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
    docObj?: Document;
    urlObj?: { createObjectURL: (b: unknown) => string; revokeObjectURL: (u: string) => void };
    FileCtor?: typeof File;
  }
): Promise<"shared" | "downloaded"> {
  const nav = (deps?.nav ?? (typeof navigator !== "undefined" ? navigator : undefined)) as
    | { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> } | undefined;
  const documentObj = deps?.docObj ?? (typeof document !== "undefined" ? document : undefined);
  const URLObj = deps?.urlObj ?? (typeof URL !== "undefined" ? URL : undefined);
  const FileCtor = deps?.FileCtor ?? (typeof File !== "undefined" ? File : undefined);

  const blob = doc.output("blob");
  const file = FileCtor ? new FileCtor([blob], filename, { type: "application/pdf" }) : null;

  if (file && nav?.canShare && nav.canShare({ files: [file] }) && nav.share) {
    await nav.share({ files: [file], title, text });
    return "shared";
  }
  // Fallback: trigger a download of the blob.
  if (URLObj && documentObj) {
    const url = URLObj.createObjectURL(blob);
    const a = documentObj.createElement("a");
    a.href = url;
    a.download = filename;
    documentObj.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URLObj.revokeObjectURL(url), 4000);
  }
  return "downloaded";
}
