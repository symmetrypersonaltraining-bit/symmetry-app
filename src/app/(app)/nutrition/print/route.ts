// Nutrition v3 — printable plan / grocery / meal-prep production sheet.
// Server route rendering clean printable HTML → browser print-to-PDF or the
// native share sheet. The in-app Grocery & Prep sheet is now the primary path
// (inline content + iframe-printed PDFs, no navigation); this route stays as a
// shareable-URL fallback and for direct/deep links. It ALWAYS renders a
// prominent Back button + tab nav so it is never a dead-end screen. Uses the
// same shared renderer (printHtml) as the in-app sheet so output matches.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PlanMeal } from "@/lib/nutrition/dailyTotals";
import { buildPrintDocument, PrintKind, esc } from "@/lib/nutrition/printHtml";
import { resolveLivePlanForDate } from "@/lib/nutrition/resolvePlan";
import { isTrainerEmail } from "@/lib/trainer";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const sp = req.nextUrl.searchParams;
  const clientId = sp.get("clientId") || "";
  const kind = ((["plan", "grocery", "prep"].includes(sp.get("kind") || "") ? sp.get("kind") : "plan") as PrintKind);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const start = /^\d{4}-\d{2}-\d{2}$/.test(sp.get("start") || "") ? sp.get("start")! : today;
  const days = Math.max(1, Math.min(14, parseInt(sp.get("days") || "7", 10) || 7));

  // Access: trainer, or the signed-in client viewing their own plan.
  const isTrainer = isTrainerEmail(user.email);
  if (!isTrainer) {
    const { data: c } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!c || (c as { id: string }).id !== clientId) {
      return new NextResponse("Not allowed", { status: 403 });
    }
  }

  // DAY-GROUP: resolve the menu governing the sheet's start date. For a client
  // with a single null-day_group plan this is unchanged. (Multi-menu week
  // grocery/prep spanning several day-groups is a documented follow-up.)
  const [clientRes, plan, targetRes] = await Promise.all([
    supabase.from("clients").select("name").eq("id", clientId).maybeSingle(),
    resolveLivePlanForDate(supabase, clientId, start),
    supabase.from("macro_targets").select("calories, protein, carbs, fats").eq("client_id", clientId)
      .lte("effective_date", today).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const clientName = (clientRes.data as { name?: string } | null)?.name || "Client";
  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
  const meals: PlanMeal[] = [...((plan?.meals || []) as PlanMeal[])].sort((a, b) => a.position - b.position);

  // Toolbar: prominent Back + tab nav + day-range links + Share — never a dead end.
  const nav = (k: string, lab: string) =>
    `<a href="/nutrition/print?clientId=${esc(clientId)}&kind=${k}&start=${start}&days=${days}" class="${kind === k ? "on" : ""}">${lab}</a>`;
  const dayLink = (n: number) =>
    `<a href="/nutrition/print?clientId=${esc(clientId)}&kind=${kind}&start=${start}&days=${n}" class="${days === n ? "on" : ""}">${n}d</a>`;
  const toolbarInner =
    `<button class="back" onclick="goBack()">‹ Back</button>` +
    `${nav("plan", "Plan")} ${nav("grocery", "Grocery")} ${nav("prep", "Prep sheet")}` +
    `${kind !== "plan" ? `${dayLink(3)} ${dayLink(5)} ${dayLink(7)} ${dayLink(14)}` : ""}` +
    `<button class="share" onclick="doShare()">Share / Save PDF</button>`;

  const html = buildPrintDocument(
    { kind, clientName, planLabel: plan ? `plan v${plan.version_number ?? "—"}` : "—", meals, target, startISO: start, days, todayISO: today },
    { toolbar: { innerHtml: toolbarInner } }
  );

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export const dynamic = "force-dynamic";
