// POST /api/weekly-brief
// Body: { clientId: string, ack?: true }
//
// The thirty-second read Dustin gets when he opens a client's FIRST session of
// the week: what's programmed, what changed since last week, what to focus on.
//
// Feedback 117353cd: "Give trainer app a summary on first session of each
// client for the week of what the programming looks like that week, any
// changes, focus on, etc."
//
// TRAINER ONLY. This is a coaching prompt, not a client-facing report — a
// client reading "Cable Row has sat at 90 lb for 4 sessions" on their own
// screen is a different (and worse) product. Same reasoning as /api/plateaus.
//
// The facts are derived in src/lib/weeklyBrief.ts, which is pure and unit
// tested. This file only fetches rows and hands them over. The one Haiku
// sentence added at the end is garnish and uses the celebration posture:
// metered, wrapped, returns null on any failure. The card must read fine with
// `line: null`, because Dustin is standing in front of a client when it opens.
//
// { ack: true } marks the brief read for the current week and returns nothing
// else — that's the only write this route performs.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { Db, enforceMeter, resolveAiScope } from "@/lib/ai/scope";
import {
  addDaysISO,
  buildBrief,
  normaliseProgram,
  todayCT,
  weekStartOf,
  type BriefInput,
  type MovementFact,
  type Track,
  type WeekSession,
} from "@/lib/weeklyBrief";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { COACH_FIRST_NAME } from "@/lib/trainer";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 120; // enough to judge "ever done this" and to spot a stall
const NOTE_DAYS = 14;
const STALL_LOOKBACK = 8; // sessions of a movement to walk when counting a stall

const SYSTEM = `You write ONE sentence for the top of a weekly programming brief in the Symmetry Personal Training trainer app. The reader is ${COACH_FIRST_NAME}, the coach, standing in the gym about to start a session with this client. You are talking to the coach, never to the client.

Respond with ONLY valid JSON, no markdown, no fences:
{"line": string}

Rules:
- ONE sentence, under 120 characters. No emoji. No greeting.
- It must be actionable for the coach: what to watch, cue, or decide today.
- Ground it strictly in the facts given. NEVER invent a number, movement or date.
- Do not simply restate the schedule — the coach can already see it.
- If the facts are thin, say something small and true rather than something grand.
- Never mention body weight, body fat or appearance.
- Never use NASM terminology (inhibit, lengthen, activate, integrate, overactive, underactive).
- "focusTheClientHasBeenShown" is copy the CLIENT has already read on their own screen. Never repeat it back to the coach as if he wrote it, and never address the client. Use it only as context for what they're expecting this week.`;

type Body = { clientId?: string | null; ack?: boolean };

function validate(raw: unknown): { line: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const l = (raw as { line?: unknown }).line;
  if (typeof l !== "string" || !l.trim()) return null;
  return { line: l.trim().slice(0, 200) };
}

export async function POST(req: NextRequest) {
  const body = ((await req.json().catch(() => ({}))) || {}) as Body;
  const scoped = await resolveAiScope(body.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) {
    return NextResponse.json({ error: "Trainer only" }, { status: 403 });
  }
  const clientId = scoped.scope.clientId;
  if (!clientId) return NextResponse.json({ brief: null, line: null, seen: true });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ brief: null, line: null, seen: true });
  const admin = createAdminClient(url, key, { auth: { persistSession: false } }) as unknown as Db;

  const today = todayCT();
  const weekStart = weekStartOf(today);

  // The only write: "I've read this week's brief."
  if (body.ack) {
    try {
      await admin.from("clients").update({ week_brief_seen_week: weekStart }).eq("id", clientId);
    } catch {
      /* the card still collapses locally; worst case it reopens once */
    }
    return NextResponse.json({ ok: true, weekStart });
  }

  const weekEnd = addDaysISO(weekStart, 6);
  const lastWeekStart = addDaysISO(weekStart, -7);
  const lastWeekEnd = addDaysISO(weekStart, -1);
  const historyStart = addDaysISO(today, -HISTORY_DAYS);

  try {
    const [clientRes, assignRes, thisWkRes, lastWkRes, notesRes] = await Promise.all([
      admin.from("clients").select("id, name, weekly_focus, week_brief_seen_week").eq("id", clientId).maybeSingle(),
      admin
        .from("program_assignments")
        .select("id, current_phase_id, programs(name), phases(label)")
        .eq("client_id", clientId)
        .eq("active", true)
        .order("assigned_at", { ascending: false })
        .limit(1),
      admin
        .from("scheduled_workouts")
        .select("id, scheduled_date, status, day_id, days(label, phases(label, programs(name)))")
        .is("deleted_at", null)
        .eq("client_id", clientId)
        .gte("scheduled_date", weekStart)
        .lte("scheduled_date", weekEnd)
        .order("scheduled_date", { ascending: true }),
      admin
        .from("scheduled_workouts")
        .select("status, day_id, days(phases(label, programs(name)))")
        .is("deleted_at", null)
        .eq("client_id", clientId)
        .gte("scheduled_date", lastWeekStart)
        .lte("scheduled_date", lastWeekEnd),
      admin
        .from("trainer_notes")
        .select("note, created_at")
        .eq("client_id", clientId)
        .gte("created_at", addDaysISO(today, -NOTE_DAYS))
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const client = (clientRes.data as { name?: string; weekly_focus?: string | null; week_brief_seen_week?: string | null } | null) || null;
    const seen = client?.week_brief_seen_week === weekStart;

    type SwRow = {
      scheduled_date: string;
      status: string | null;
      day_id: string | null;
      days?: {
        label?: string | null;
        phases?: { label?: string | null; programs?: { name?: string | null } | null } | null;
      } | null;
    };
    const thisWkRows = ((thisWkRes.data as unknown as SwRow[]) || []).filter((r) => r.scheduled_date);

    const thisWeek: WeekSession[] = thisWkRows.map((r) => ({
      date: r.scheduled_date,
      label: (r.days?.label || "Session").trim(),
      done: r.status === "completed",
    }));

    const lastWkRows = ((lastWkRes.data as unknown as SwRow[]) || []);
    const lastWeekScheduled = lastWkRows.length;
    const lastWeekCompleted = lastWkRows.filter((r) => r.status === "completed").length;

    // What the client is running, per program. Read off the calendar rather
    // than the assignment pointer: a phase-up is performed by rebuilding the
    // week, the pointer sometimes trails a day behind it, and it only ever
    // names ONE program while live clients routinely run three at once.
    const thisWeekTracks = tracksOf(thisWkRows, client?.name);
    const lastWeekTracks = tracksOf(lastWkRows, client?.name);

    // Falls back to the assignment only when the calendar is bare, so an
    // otherwise-empty week still says what they're on.
    const assignRow = ((assignRes.data as unknown as {
      programs?: { name?: string } | null;
      phases?: { label?: string } | null;
    }[]) || [])[0];
    if (!thisWeekTracks.length && assignRow?.programs?.name) {
      thisWeekTracks.push({
        program: normaliseProgram(assignRow.programs.name, client?.name),
        phase: assignRow.phases?.label?.trim() || null,
      });
    }

    // ── the movements on this week's sheet, and their history ──
    const dayIds = Array.from(new Set(thisWkRows.map((r) => r.day_id).filter(Boolean))) as string[];
    const movements = dayIds.length
      ? await movementFacts(admin, clientId, dayIds, historyStart, lastWeekStart, lastWeekEnd)
      : [];

    const input: BriefInput = {
      today,
      weekStart,
      clientName: client?.name || "your client",
      thisWeekTracks,
      lastWeekTracks,
      thisWeek,
      lastWeekScheduled,
      lastWeekCompleted,
      movements,
      weeklyFocus: client?.weekly_focus || null,
      recentNotes: ((notesRes.data as { note: string; created_at: string }[]) || []).filter((n) => n?.note),
    };

    const brief = buildBrief(input);

    // ── the AI line. Best-effort from here down. ──
    let line: string | null = null;
    if (!brief.empty && process.env.ANTHROPIC_API_KEY) {
      const gate = await enforceMeter(clientId, "chat");
      if (!gate) {
        try {
          const facts = {
            client: brief.clientName.split(" ")[0],
            programs: brief.tracks.map((t) => (t.phase ? `${t.program} (${t.phase})` : t.program)),
            sessionsThisWeek: brief.days.map((d) => `${d.day}: ${d.labels.join(", ")}`),
            whatChanged: brief.changes.map((c) => c.text),
            // Written to the client, not the coach — the model is told so in
            // SYSTEM so it doesn't parrot it back at ${COACH_FIRST_NAME} as his own note.
            focusTheClientHasBeenShown: input.weeklyFocus,
            newMovements: movements.filter((m) => !m.everLogged).map((m) => m.name),
            lastWeek: { scheduled: lastWeekScheduled, completed: lastWeekCompleted },
          };
          const { value, tokensIn, tokensOut } = await callClaudeJson<{ line: string }>({
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: HAIKU_MODEL,
            system: SYSTEM,
            maxTokens: 200,
            messages: [{ role: "user", content: JSON.stringify(facts) }],
            validate,
          });
          line = value?.line ?? null;
          await logUsage(clientId, "chat", tokensIn, tokensOut, HAIKU_MODEL);
        } catch (e) {
          console.error("weekly-brief: AI line failed (continuing without it)", e);
        }
      }
    }

    return NextResponse.json({ brief, line, seen, weekStart });
  } catch (e) {
    console.error("weekly-brief failed", e);
    return NextResponse.json({ brief: null, line: null, seen: true });
  }
}

type TrackRow = {
  days?: {
    phases?: { label?: string | null; programs?: { name?: string | null } | null } | null;
  } | null;
};

/**
 * The distinct programs on a week's calendar, each with the phase that week's
 * sessions actually sat in. First phase seen per program wins — a week that
 * straddles a phase-up is reported by its earlier phase, which is the one the
 * comparison against next week should be made from.
 */
function tracksOf(rows: TrackRow[], clientName?: string | null): Track[] {
  const byProgram = new Map<string, Track>();
  for (const r of rows) {
    const program = normaliseProgram(r.days?.phases?.programs?.name || "", clientName);
    if (!program) continue;
    if (byProgram.has(program)) continue;
    byProgram.set(program, { program, phase: r.days?.phases?.label?.trim() || null });
  }
  return Array.from(byProgram.values());
}

/**
 * For every movement scheduled this week, the history that decides whether it
 * gets a line: has the client ever done it, did it go up last week, and has it
 * been sitting at the same weight.
 *
 * Keyed on exercise_id, never prescribed_exercise_id — prescriptions are
 * rebuilt every time a program is edited, so the prescribed id would make a
 * long-trained movement look brand new. Rows with weight_lbs = 0 are skipped:
 * roughly half of set_logs were saved with a 0 from an untouched weight box,
 * and treating those as real would report phantom drops.
 */
async function movementFacts(
  admin: Db,
  clientId: string,
  dayIds: string[],
  historyStart: string,
  lastWeekStart: string,
  lastWeekEnd: string
): Promise<MovementFact[]> {
  const secRes = await admin.from("sections").select("id").in("day_id", dayIds);
  const sectionIds = ((secRes.data as { id: string }[]) || []).map((s) => s.id);
  if (!sectionIds.length) return [];

  const peRes = await admin
    .from("prescribed_exercises")
    .select("exercise_id, exercises(name)")
    .in("section_id", sectionIds);

  // exercise_id -> display name, deduped (the same movement appears on several days)
  const wanted = new Map<string, string>();
  for (const row of ((peRes.data as unknown as { exercise_id: string | null; exercises?: { name?: string } | null }[]) || [])) {
    const id = row.exercise_id;
    const name = (row.exercises?.name || "").trim();
    if (id && name && !wanted.has(id)) wanted.set(id, name);
  }
  if (!wanted.size) return [];

  // Every completed session in the history window, so a set_log can be dated.
  const logsRes = await admin
    .from("workout_logs")
    .select("id, log_date")
    .eq("client_id", clientId)
    .eq("completed", true)
    .gte("log_date", historyStart);
  const logs = ((logsRes.data as { id: string; log_date: string }[]) || []);
  const dateOf = new Map(logs.map((l) => [l.id, l.log_date]));
  if (!logs.length) {
    return Array.from(wanted.values()).map((name) => ({
      name, everLogged: false, lastWeekBest: null, priorBest: null, sessionsAtSameWeight: 0,
    }));
  }

  // Chunked .in() so a long-tenured client can't blow the URL length — same
  // shape /api/plateaus uses.
  const ids = logs.map((l) => l.id);
  const exIds = Array.from(wanted.keys());
  const sets: { workout_log_id: string; exercise_id: string; weight_lbs: number | null }[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await admin
      .from("set_logs")
      .select("workout_log_id, exercise_id, weight_lbs")
      .in("workout_log_id", ids.slice(i, i + 100))
      .in("exercise_id", exIds);
    for (const s of ((r.data as Record<string, unknown>[]) || [])) {
      sets.push({
        workout_log_id: s.workout_log_id as string,
        exercise_id: s.exercise_id as string,
        weight_lbs: s.weight_lbs as number | null,
      });
    }
  }

  // exercise_id -> date -> best weight that day
  const byEx = new Map<string, Map<string, number>>();
  const everSeen = new Set<string>();
  for (const s of sets) {
    const d = dateOf.get(s.workout_log_id);
    if (!d) continue;
    everSeen.add(s.exercise_id); // they've done it, even if it was bodyweight
    const w = Number(s.weight_lbs) || 0;
    if (w <= 0) continue; // blank weight box, not a real load
    if (!byEx.has(s.exercise_id)) byEx.set(s.exercise_id, new Map());
    const perDay = byEx.get(s.exercise_id)!;
    if (w > (perDay.get(d) ?? 0)) perDay.set(d, w);
  }

  const out: MovementFact[] = [];
  for (const [exId, name] of wanted) {
    const perDay = byEx.get(exId);
    if (!perDay || !perDay.size) {
      out.push({
        name,
        everLogged: everSeen.has(exId),
        lastWeekBest: null,
        priorBest: null,
        sessionsAtSameWeight: 0,
      });
      continue;
    }
    const dates = Array.from(perDay.keys()).sort();

    let lastWeekBest: number | null = null;
    let priorBest: number | null = null;
    for (const d of dates) {
      const w = perDay.get(d)!;
      if (d >= lastWeekStart && d <= lastWeekEnd) {
        if (lastWeekBest == null || w > lastWeekBest) lastWeekBest = w;
      } else if (d < lastWeekStart) {
        if (priorBest == null || w > priorBest) priorBest = w;
      }
    }

    // How many recent sessions in a row sat at the most recent top weight.
    let sessionsAtSameWeight = 0;
    const recent = dates.slice(-STALL_LOOKBACK).reverse();
    const top = recent.length ? perDay.get(recent[0])! : 0;
    for (const d of recent) {
      if (perDay.get(d) === top) sessionsAtSameWeight++;
      else break;
    }

    out.push({ name, everLogged: true, lastWeekBest, priorBest, sessionsAtSameWeight });
  }
  return out;
}
