// GET /api/plateaus?clientId=<uuid>
//
// Plateau spotter — lifts that have not gone up in a month.
//
// TRAINER ONLY, by design. A client seeing "you have been stuck for 6 weeks"
// on their own screen is discouraging and, worse, it is often wrong-headed:
// a lift holding steady during a cut or a rehab block is correct programming.
// This is a programming prompt for Dustin, not a verdict for the client.
//
// Definition used: walk every completed set of a movement in date order and
// track the running best weight. The last date that running best went UP is
// the last real progression. If that was 28+ days ago AND they have trained
// the movement at least twice since, it is flagged.
//
// Read-only. Writes nothing, messages nobody.

import { NextRequest, NextResponse } from "next/server";
import { TRAINER_EMAIL, Db } from "@/lib/ai/scope";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 112; // 16 weeks of history to judge against
const STALE_DAYS = 28; // "hasn't moved in a month"
const MIN_SESSIONS_SINCE = 2; // they've actually trained it since, so it's real
const MIN_TOTAL_SESSIONS = 4; // enough history to call it a plateau at all
const RECENT_DAYS = 28; // still in the current program, not abandoned

function ctToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function shiftDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

export interface PlateauRow {
  exercise: string;
  best: number;
  reps: number;
  lastIncrease: string | null;
  daysStuck: number;
  sessionsSince: number;
  totalSessions: number;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== TRAINER_EMAIL) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ rows: [] });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ rows: [] });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const today = ctToday();
  const since = shiftDays(today, -WINDOW_DAYS);

  try {
    const logsRes = await admin
      .from("workout_logs")
      .select("id, log_date")
      .eq("client_id", clientId)
      .eq("completed", true)
      .gte("log_date", since)
      .lte("log_date", today);

    const logs = ((logsRes.data as { id: string; log_date: string }[]) || []);
    if (logs.length < MIN_TOTAL_SESSIONS) return NextResponse.json({ rows: [], reason: "not enough history" });

    const dateOf = new Map<string, string>();
    for (const l of logs) dateOf.set(l.id, l.log_date);

    // Chunked so a long-tenured client can't blow the URL length on .in().
    const ids = logs.map((l) => l.id);
    const setRows: { workout_log_id: string; weight_lbs: number | null; reps: number | null; exercises: { name?: string } | null }[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const slice = ids.slice(i, i + 100);
      const r = await admin
        .from("set_logs")
        .select("workout_log_id, weight_lbs, reps, exercise_id, completed, exercises(name)")
        .in("workout_log_id", slice)
        .eq("completed", true);
      for (const s of ((r.data as Record<string, unknown>[]) || [])) {
        setRows.push({
          workout_log_id: s.workout_log_id as string,
          weight_lbs: s.weight_lbs as number | null,
          reps: s.reps as number | null,
          exercises: (s.exercises as { name?: string } | null) || null,
        });
      }
    }

    // exercise name -> date -> best { weight, reps }
    const byEx = new Map<string, Map<string, { w: number; r: number }>>();
    for (const s of setRows) {
      const name = (s.exercises?.name || "").trim();
      const w = Number(s.weight_lbs) || 0;
      const r = Number(s.reps) || 0;
      if (!name || w <= 0) continue; // bodyweight / cardio can't plateau on load
      const d = dateOf.get(s.workout_log_id);
      if (!d) continue;
      if (!byEx.has(name)) byEx.set(name, new Map());
      const perDay = byEx.get(name)!;
      const cur = perDay.get(d);
      if (!cur || w > cur.w) perDay.set(d, { w, r });
    }

    const rows: PlateauRow[] = [];

    for (const [name, perDay] of byEx) {
      const dates = Array.from(perDay.keys()).sort();
      if (dates.length < MIN_TOTAL_SESSIONS) continue;

      const lastSeen = dates[dates.length - 1];
      if (daysBetween(lastSeen, today) > RECENT_DAYS) continue; // dropped from the program

      let runningBest = 0;
      let lastIncrease: string | null = null;
      let bestReps = 0;
      for (const d of dates) {
        const e = perDay.get(d)!;
        if (e.w > runningBest) {
          runningBest = e.w;
          bestReps = e.r;
          lastIncrease = d;
        }
      }
      if (!lastIncrease) continue;

      const daysStuck = daysBetween(lastIncrease, today);
      if (daysStuck < STALE_DAYS) continue;

      const sessionsSince = dates.filter((d) => d > lastIncrease!).length;
      if (sessionsSince < MIN_SESSIONS_SINCE) continue;

      rows.push({
        exercise: name,
        best: runningBest,
        reps: bestReps,
        lastIncrease,
        daysStuck,
        sessionsSince,
        totalSessions: dates.length,
      });
    }

    // Longest stuck first, then the ones they keep repeating.
    rows.sort((a, b) => b.daysStuck - a.daysStuck || b.sessionsSince - a.sessionsSince);
    return NextResponse.json({ rows: rows.slice(0, 12), generatedAt: today });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
