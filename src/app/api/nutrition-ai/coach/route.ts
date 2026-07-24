// POST /api/nutrition-ai/coach
// Body: { question?: string, context?: "auto", clientId?: string }
// The server assembles the client's nutrition context (last 14 days of daily
// totals from meal_adherence_logs, current macro targets, latest weight /
// body-fat) and answers either the client's question or — with no question —
// produces a proactive insight for the coach card.
// Returns { message, suggestions?: [{ label, delta: { p, c, f, kcal } }] }.
// Auth-checked, client-scoped, metered (feature 'chat', default 15/day), Haiku.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { validateCoachReply } from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { Db, enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { computeDayTotals, LogRow, PlanMeal } from "@/lib/nutrition/dailyTotals";

const SYSTEM_PROMPT = `You are the nutrition coach assistant inside the Symmetry Personal Training app (physique coaching, trainer: Dustin). You speak directly to the client: encouraging, honest, specific, brief — no fluff, no lecture. Ground every statement in the context data provided; never invent numbers. If the data is sparse (few logged days), say so and keep advice modest. You may suggest small macro adjustments, but frame them as suggestions for the client to discuss with Dustin — plan changes are his call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"suggestions":[{"label":string,"delta":{"p":number,"c":number,"f":number,"kcal":number}}]}

Rules:
- "message": 2-5 sentences max, plain text.
- "suggestions": 0-3 concrete, actionable tweaks (e.g. {"label":"Add a scoop of whey at breakfast","delta":{"p":25,"c":2,"f":1,"kcal":117}}). deltas are the daily macro change in grams / kcal (negative = reduce). Omit the array or leave it empty when nothing concrete applies.`;

interface DayTotal {
  date: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  logged: number;
}

// Daily totals through the canonical shared calculator (dailyTotals module) —
// the same numbers the macro bar, charts and averages strip show. Historical
// logs may reference archived plan versions, so plan items are fetched per
// meal_id (same pattern as AveragesStrip).
async function fetchDailyTotals(db: Db, clientId: string, days: number): Promise<DayTotal[]> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const start = startDate.toISOString().slice(0, 10);

  const { data: logs } = await db
    .from("meal_adherence_logs")
    .select("*")
    .eq("client_id", clientId)
    .gte("log_date", start)
    .lte("log_date", end);
  const rows = ((logs as (LogRow & { log_date: string })[]) || []);
  if (!rows.length) return [];

  const mealIds = Array.from(new Set(rows.map((r) => r.meal_id).filter((x): x is string => !!x)));
  const pseudoMeals: PlanMeal[] = [];
  if (mealIds.length) {
    const { data: items } = await db
      .from("meal_items")
      .select("id, meal_id, food, amount, unit, is_unlimited, protein, carbs, fats, position")
      .in("meal_id", mealIds);
    const byMeal: Record<string, PlanMeal> = {};
    for (const it of ((items as Record<string, unknown>[]) || [])) {
      const mid = String(it.meal_id);
      if (!byMeal[mid]) byMeal[mid] = { id: mid, name: "", timing: null, position: 0, meal_items: [] };
      byMeal[mid].meal_items.push({
        id: String(it.id), food: String(it.food || ""), amount: it.amount as number | null,
        unit: it.unit as string | null, is_unlimited: !!it.is_unlimited,
        protein: it.protein as number | null, carbs: it.carbs as number | null,
        fats: it.fats as number | null, position: Number(it.position) || 0,
      });
    }
    pseudoMeals.push(...Object.values(byMeal));
  }

  const byDate: Record<string, (LogRow & { log_date: string })[]> = {};
  for (const l of rows) (byDate[l.log_date] ||= []).push(l);
  return Object.keys(byDate)
    .sort()
    .map((date) => {
      const t = computeDayTotals(byDate[date], pseudoMeals);
      return { date, kcal: Math.round(t.kcal), p: Math.round(t.protein), c: Math.round(t.carbs), f: Math.round(t.fats), logged: t.loggedCount };
    })
    // Days holding only placeholder rows (__unlogged / __removed edits) aren't
    // logged days — don't show the model a fake 0-kcal day.
    .filter((d) => d.logged > 0);
}

async function assembleContext(db: Db, clientId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const [dailyTotals, targetRes, metricsRes] = await Promise.all([
    fetchDailyTotals(db, clientId, 14),
    db
      .from("macro_targets")
      .select("calories, protein, carbs, fats, effective_date")
      .eq("client_id", clientId)
      .lte("effective_date", today)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("metrics")
      .select("metric_date, weight, body_fat_pct")
      .eq("client_id", clientId)
      .order("metric_date", { ascending: false })
      .limit(10),
  ]);

  const target = targetRes.data as { calories: number; protein: number; carbs: number; fats: number } | null;
  const metrics = (metricsRes.data as { metric_date: string; weight: number | null; body_fat_pct: number | null }[]) || [];
  const latestWeight = metrics.find((m) => m.weight != null);
  const latestBf = metrics.find((m) => m.body_fat_pct != null);

  const lines: string[] = [`Today's date: ${today}`];
  lines.push(
    target
      ? `Daily macro targets: ${target.calories} kcal, ${target.protein}g protein, ${target.carbs}g carbs, ${target.fats}g fat.`
      : "No macro targets set (open plan — awareness/baseline logging)."
  );
  if (latestWeight) lines.push(`Latest weight: ${latestWeight.weight} lbs (${latestWeight.metric_date}).`);
  if (latestBf) lines.push(`Latest body fat: ${latestBf.body_fat_pct}% (${latestBf.metric_date}).`);
  lines.push(
    dailyTotals.length
      ? `Daily totals for the last 14 days (only days with logs; "logged" = meals logged that day):\n${JSON.stringify(dailyTotals)}`
      : "No meals logged in the last 14 days."
  );
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (question.length > 1500) {
      return NextResponse.json({ error: "That question is too long — keep it under 1500 characters." }, { status: 400 });
    }

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;
    if (!clientId) {
      return NextResponse.json({ error: "Pick a client first — the coach needs a client's data." }, { status: 400 });
    }

    const metered = await enforceMeter(clientId, "chat");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    const context = await assembleContext(supabase, clientId);
    const userText = question
      ? `CONTEXT (server-assembled, trusted):\n${context}\n\nCLIENT QUESTION:\n${question}`
      : `CONTEXT (server-assembled, trusted):\n${context}\n\nNo question was asked. Produce ONE proactive insight for the client's coach card: the single most useful observation from the data right now (trend, gap vs targets, consistency win worth reinforcing), with suggestions only if clearly warranted.`;

    const result = await callClaudeJson({
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      maxTokens: 700,
      messages: [{ role: "user", content: userText }],
      validate: validateCoachReply,
    });

    await logUsage(clientId, "chat", result.tokensIn, result.tokensOut, HAIKU_MODEL);

    if (!result.value) {
      // Salvage: a plain-text reply is still useful for a chat surface.
      const fallback = result.rawText.replace(/```(?:json)?|```/g, "").trim();
      if (fallback) return NextResponse.json({ message: fallback.slice(0, 1200) });
      return NextResponse.json({ error: "The coach couldn't answer right now — try again in a moment." }, { status: 502 });
    }
    return NextResponse.json(result.value);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/coach failed:", msg);
    return NextResponse.json({ error: `Coach failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
