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

const SYSTEM_PROMPT = `You are the nutrition coach assistant inside the Symmetry Personal Training app (physique coaching, trainer: Dustin). You speak directly to the client: encouraging, honest, specific, brief — no fluff, no lecture. Ground every statement in the context data provided; never invent numbers. If the data is sparse (few logged days), say so and keep advice modest. You may suggest small macro adjustments, but frame them as suggestions for the client to discuss with Dustin — plan changes are his call.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"message":string,"suggestions":[{"label":string,"delta":{"p":number,"c":number,"f":number,"kcal":number}}]}

Rules:
- "message": 2-5 sentences max, plain text.
- "suggestions": 0-3 concrete, actionable tweaks (e.g. {"label":"Add a scoop of whey at breakfast","delta":{"p":25,"c":2,"f":1,"kcal":117}}). deltas are the daily macro change in grams / kcal (negative = reduce). Omit the array or leave it empty when nothing concrete applies.`;

// Adherence → fraction of the planned meal's macros consumed (matches the
// logger UI; "Partial" is a legacy/rollup value treated as half).
const ADHERENCE_PCT: Record<string, number | null> = {
  Full: 1,
  "3/4": 0.75,
  "1/2": 0.5,
  Partial: 0.5,
  "1/4": 0.25,
  Skipped: 0,
  "Off-plan": null, // uses est_* instead
};

interface DayTotal {
  date: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  logged: number;
}

// Direct-query fallback for daily totals (the canonical shared module is being
// built in parallel; this mirrors the NutritionAverages computation: plan meals
// prorated by adherence + off-plan est_* fields).
async function fetchDailyTotals(db: Db, clientId: string, days: number): Promise<DayTotal[]> {
  const end = new Date().toISOString().slice(0, 10);
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  const start = startDate.toISOString().slice(0, 10);

  const { data: logs } = await db
    .from("meal_adherence_logs")
    .select("log_date, meal_id, adherence, est_kcal, est_protein, est_carbs, est_fats")
    .eq("client_id", clientId)
    .gte("log_date", start)
    .lte("log_date", end);
  const rows = (logs as {
    log_date: string;
    meal_id: string | null;
    adherence: string;
    est_kcal: number | null;
    est_protein: number | null;
    est_carbs: number | null;
    est_fats: number | null;
  }[]) || [];
  if (!rows.length) return [];

  const mealIds = Array.from(new Set(rows.map((r) => r.meal_id).filter(Boolean))) as string[];
  const perMeal: Record<string, { p: number; c: number; f: number }> = {};
  if (mealIds.length) {
    const { data: items } = await db
      .from("meal_items")
      .select("meal_id, protein, carbs, fats")
      .in("meal_id", mealIds);
    for (const it of (items as { meal_id: string; protein: number | null; carbs: number | null; fats: number | null }[]) || []) {
      const m = (perMeal[it.meal_id] ||= { p: 0, c: 0, f: 0 });
      m.p += it.protein || 0;
      m.c += it.carbs || 0;
      m.f += it.fats || 0;
    }
  }

  const byDate: Record<string, DayTotal> = {};
  for (const log of rows) {
    const d = (byDate[log.log_date] ||= { date: log.log_date, kcal: 0, p: 0, c: 0, f: 0, logged: 0 });
    d.logged++;
    const pct = ADHERENCE_PCT[log.adherence] ?? null;
    if (log.adherence === "Off-plan" || pct === null) {
      d.kcal += log.est_kcal || 0;
      d.p += log.est_protein || 0;
      d.c += log.est_carbs || 0;
      d.f += log.est_fats || 0;
    } else if (log.meal_id && perMeal[log.meal_id]) {
      const m = perMeal[log.meal_id];
      d.p += m.p * pct;
      d.c += m.c * pct;
      d.f += m.f * pct;
      d.kcal += (m.p * 4 + m.c * 4 + m.f * 9) * pct;
    }
  }
  return Object.values(byDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, kcal: Math.round(d.kcal), p: Math.round(d.p), c: Math.round(d.c), f: Math.round(d.f) }));
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
