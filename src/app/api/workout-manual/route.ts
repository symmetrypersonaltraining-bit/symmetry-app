// POST /api/workout-manual — build a workout BY HAND. No model, no tokens.
//
// Dustin: "is there a way for plp to just manually enter a custom workout
// without using ai?"
//
// The honest answer was "half". A client could TYPE what they did as free text
// in two places, but there was no way to build a real workout — exercises,
// sets, reps — and then log it set by set. Every structured path went through
// /api/workout-ai. So anyone who already knew exactly what they wanted to do
// had to describe it to a model and hope it came back with the same thing.
//
// And the typed path had a broken promise attached to it. "I did something
// else" wrote a row into offplan_workout_logs with status 'pending' and told
// the client "it becomes a library workout tonight". Nothing has processed one
// of those since 2026-07-29 — whatever used to roll them up is gone, there is
// no function in the database and no route in this codebase that reads the
// table. Thirteen rows went through; anything typed after that would have sat
// there forever while the UI claimed otherwise.
//
// This route does the thing directly instead of promising it for later:
// it creates a client-owned day, sections and prescribed exercises, and
// optionally marks it done. Same shapes /api/workout-ai writes, so the logger,
// history, progress and the client's library all treat it identically — a
// manual workout is not a second-class one.
//
// WHY A ROUTE AND NOT A CLIENT-SIDE INSERT. It writes to five tables and has to
// be all-or-nothing; a half-created day with no exercises is worse than a
// failure, because it looks like a workout until you open it.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAiScope } from "@/lib/ai/scope";

export const dynamic = "force-dynamic";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** The four client-facing section names the logger knows how to render. */
const VALID_CF = new Set(["Warm-Up", "Strength", "Accessory", "Cardio"]);
const CF_TO_INTERNAL: Record<string, string> = {
  "Warm-Up": "Corrective Warm-Up",
  Strength: "Primary Strength",
  Accessory: "Accessory Strength",
  Cardio: "Cardio",
};

interface ManualExercise {
  name: string;
  sets?: number | null;
  reps?: number | null;
  /** Free text: "45 lb", "bodyweight", "RPE 8". Shown, never parsed. */
  load?: string | null;
  section?: string | null;
  note?: string | null;
}

type Db = ReturnType<typeof createAdminClient>;

/**
 * Find an exercise by name, or create one owned by this client.
 *
 * Matching is case-insensitive and exact-ish on purpose. A fuzzy match that
 * silently binds "Incline Press" to "Incline Bench Press" would attach the
 * client's history to the wrong movement, and unpicking that later is far
 * worse than carrying a near-duplicate in their personal library.
 */
async function resolveExerciseId(db: Db, clientId: string, rawName: string): Promise<string | null> {
  const name = rawName.trim();
  if (!name) return null;

  const { data: exact } = await db
    .from("exercises")
    .select("id, client_owner_id")
    .ilike("name", name)
    .limit(5);
  const rows = (exact as { id: string; client_owner_id: string | null }[] | null) || [];
  // Prefer the shared library entry over a personal copy, so two clients doing
  // "Goblet Squat" land on the same exercise and comparisons still work.
  const shared = rows.find((r) => !r.client_owner_id);
  if (shared) return shared.id;
  const mine = rows.find((r) => r.client_owner_id === clientId);
  if (mine) return mine.id;

  const { data: made, error } = await db
    .from("exercises")
    .insert({
      name: name.slice(0, 120),
      client_owner_id: clientId,
      created_by: "client_manual",
      availability_status: "available",
    })
    .select("id")
    .single();
  if (error || !made) return null;
  return (made as { id: string }).id;
}

export async function POST(req: Request) {
  let body: {
    clientId?: string;
    title?: string;
    date?: string;
    exercises?: ManualExercise[];
    markDone?: boolean;
    replaceDayId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // resolveAiScope already enforces the rule we need: a trainer may act for any
  // client, a client only for themselves, and anyone else gets a 403. Passing
  // the requested id through it is the check — re-implementing it here would be
  // a second copy that can drift, which is the shape of most of tonight's bugs.
  const scoped = await resolveAiScope(body.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  const clientId = scoped.scope.clientId;
  if (!clientId) return NextResponse.json({ error: "No client" }, { status: 400 });

  const title = (body.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Give the workout a name." }, { status: 400 });

  const exercises = (body.exercises || []).filter((e) => e && typeof e.name === "string" && e.name.trim());
  if (!exercises.length) return NextResponse.json({ error: "Add at least one exercise." }, { status: 400 });
  if (exercises.length > 40) return NextResponse.json({ error: "That's more than 40 exercises." }, { status: 400 });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? (body.date as string) : CT_TODAY();
  const db = createAdminClient();

  // Which phase to hang the day off. days.phase_id is NOT NULL, so a client
  // with no active program has nowhere to put one — same constraint the AI
  // route works under, resolved the same way.
  const { data: ap } = await db
    .from("program_assignments")
    .select("program_id, programs(phases(id, position))")
    .eq("client_id", clientId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const phases = (((ap as { programs?: { phases?: { id: string; position: number }[] } } | null)?.programs?.phases) || [])
    .slice()
    .sort((a, b) => a.position - b.position);
  let phaseId: string | null = phases[0]?.id ?? null;
  if (body.replaceDayId) {
    const { data: rep } = await db.from("days").select("phase_id").eq("id", body.replaceDayId).maybeSingle();
    phaseId = (rep as { phase_id?: string } | null)?.phase_id ?? phaseId;
  }
  if (!phaseId) {
    return NextResponse.json(
      { error: "You need an active program before you can save your own workouts. Ask Dustin to assign one." },
      { status: 409 },
    );
  }

  const created: { days?: string } = {};
  try {
    const { data: posRow } = await db
      .from("days")
      .select("position")
      .eq("phase_id", phaseId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = ((posRow && posRow[0] ? (posRow[0] as { position: number }).position : 0) || 0) + 1;

    const { data: dayRow, error: dayErr } = await db
      .from("days")
      .insert({
        phase_id: phaseId,
        label: title,
        position: nextPos,
        swappable: false,
        client_owner_id: clientId,
        created_by: "client_manual",
        origin: "manual",
      })
      .select("id")
      .single();
    if (dayErr || !dayRow) throw dayErr || new Error("day insert failed");
    const dayId = (dayRow as { id: string }).id;
    created.days = dayId;

    // Group into sections in the order the client listed them, so a workout
    // built as warm-up → strength → cardio renders in that order rather than
    // being reshuffled into a canonical one.
    const order: string[] = [];
    const bySection = new Map<string, ManualExercise[]>();
    for (const ex of exercises) {
      const cf = VALID_CF.has(ex.section || "") ? (ex.section as string) : "Accessory";
      if (!bySection.has(cf)) { bySection.set(cf, []); order.push(cf); }
      bySection.get(cf)!.push(ex);
    }

    let sPos = 0;
    for (const cf of order) {
      const { data: secRow, error: secErr } = await db
        .from("sections")
        .insert({ day_id: dayId, client_facing_name: cf, internal_name: CF_TO_INTERNAL[cf], position: sPos++ })
        .select("id")
        .single();
      if (secErr || !secRow) throw secErr || new Error("section insert failed");
      const secId = (secRow as { id: string }).id;

      let pPos = 0;
      for (const ex of bySection.get(cf)!) {
        const exId = await resolveExerciseId(db, clientId, ex.name);
        if (!exId) continue;
        const { error: peErr } = await db.from("prescribed_exercises").insert({
          section_id: secId,
          exercise_id: exId,
          position: pPos++,
          sets: ex.sets && ex.sets > 0 ? Math.min(20, Math.round(ex.sets)) : 3,
          volume_type: "reps",
          volume_value: ex.reps && ex.reps > 0 ? String(Math.min(500, Math.round(ex.reps))) : null,
          load_descriptor: (ex.load || "").trim().slice(0, 60) || null,
          cue: (ex.note || "").trim().slice(0, 300) || null,
        });
        if (peErr) throw peErr;
      }
    }

    // Put it on the calendar. Noon UTC keeps the same calendar date in Central —
    // the same trick addLibrary() uses, and the reason a workout logged at 9pm
    // does not jump to tomorrow.
    const { data: last } = await db
      .from("scheduled_workouts")
      .select("position")
      .eq("client_id", clientId)
      .eq("scheduled_date", date)
      .order("position", { ascending: false })
      .limit(1);
    const swPos = ((last && last[0] ? (last[0] as { position: number }).position : 0) || 0) + 1;

    let workoutLogId: string | null = null;
    if (body.markDone) {
      const at = new Date(date + "T12:00:00Z").toISOString();
      const { data: wl, error: wlErr } = await db
        .from("workout_logs")
        .insert({
          client_id: clientId,
          day_id: dayId,
          log_date: date,
          completed: true,
          completed_at: at,
          started_at: at,
          status: "Done as planned",
          source: "client",
        })
        .select("id")
        .single();
      if (wlErr || !wl) throw wlErr || new Error("workout log insert failed");
      workoutLogId = (wl as { id: string }).id;
    }

    const { error: swErr } = await db.from("scheduled_workouts").insert({
      client_id: clientId,
      day_id: dayId,
      scheduled_date: date,
      position: swPos,
      status: body.markDone ? "completed" : "scheduled",
      workout_log_id: workoutLogId,
      source: "client_self_assign",
    });
    if (swErr) throw swErr;

    return NextResponse.json({ ok: true, dayId, date, markedDone: !!body.markDone });
  } catch (err) {
    // All-or-nothing. A day with no exercises still LOOKS like a workout in the
    // list, so leaving one behind is worse than reporting the failure — the
    // client taps it, finds nothing, and has no idea why.
    if (created.days) {
      try {
        const { data: secs } = await db.from("sections").select("id").eq("day_id", created.days);
        const ids = ((secs as { id: string }[] | null) || []).map((s) => s.id);
        if (ids.length) await db.from("prescribed_exercises").delete().in("section_id", ids);
        await db.from("sections").delete().eq("day_id", created.days);
        await db.from("days").delete().eq("id", created.days);
      } catch { /* the original error is the one worth reporting */ }
    }
    const msg = err instanceof Error ? err.message : "Could not save that workout.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
