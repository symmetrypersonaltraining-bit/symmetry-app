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
import { isDuplicateScheduleError, duplicateScheduleMessage } from "@/lib/scheduleConflict";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAiScope } from "@/lib/ai/scope";
import { findExerciseIdByName } from "@/lib/exerciseLookup";
import { COACH_FIRST_NAME } from "@/lib/trainer";

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

  // Exact name, then aliases; shared library row preferred over a personal copy
  // so two clients doing "Goblet Squat" land on the same exercise and their
  // comparisons still work. That preference now lives in the shared helper.
  const existing = await findExerciseIdByName(db, name, clientId);
  if (existing) return existing;

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


/**
 * The phase a hand-built workout hangs off, creating one if there isn't one.
 *
 * days.phase_id is NOT NULL, so a workout needs a phase, a phase needs a
 * program, and a client with no active program has none of it. Three clients
 * are in that state right now, and every one of them would have hit a dead end
 * reading "ask Dustin to assign one" — for a feature that has nothing to do
 * with their programming.
 *
 * The answer already exists in the data: 25 clients carry a "Personal Workouts"
 * program (programs.personal_for_client_id), one phase, holding the workouts
 * they scheduled themselves. This makes that pattern on demand instead of
 * assuming someone set it up earlier. Values match the existing rows exactly —
 * status 'live', category 'training layer', structure_type 'single-session',
 * phase 'Personal' — so these are indistinguishable from the ones already
 * there, and nothing downstream has to learn a new shape.
 *
 * The client's REAL programming is preferred whenever they have some, so a
 * manual workout sits alongside their actual block rather than in a sidecar.
 * The personal program is only the fallback.
 */
async function ensurePhaseId(db: Db, clientId: string): Promise<string | null> {
  // 1 · their active program, if they have one
  const { data: ap } = await db
    .from("program_assignments")
    .select("programs(phases(id, position))")
    .eq("client_id", clientId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  const phases = (((ap as { programs?: { phases?: { id: string; position: number }[] } } | null)?.programs?.phases) || [])
    .slice()
    .sort((a, b) => a.position - b.position);
  if (phases[0]) return phases[0].id;

  // 2 · an existing personal program
  const { data: personal } = await db
    .from("programs")
    .select("id, phases(id, position)")
    .eq("personal_for_client_id", clientId)
    .limit(1)
    .maybeSingle();
  const pRow = personal as { id: string; phases?: { id: string; position: number }[] } | null;
  if (pRow) {
    const ph = (pRow.phases || []).slice().sort((a, b) => a.position - b.position);
    if (ph[0]) return ph[0].id;
    const { data: madePhase } = await db
      .from("phases")
      .insert({ program_id: pRow.id, label: "Personal", position: 1, intent: "Client-scheduled library workouts" })
      .select("id")
      .single();
    return (madePhase as { id: string } | null)?.id ?? null;
  }

  // 3 · make one
  const { data: prog, error: progErr } = await db
    .from("programs")
    .insert({
      name: "Personal Workouts",
      status: "live",
      category: "training layer",
      structure_type: "single-session",
      personal_for_client_id: clientId,
    })
    .select("id")
    .single();
  if (progErr || !prog) return null;
  const programId = (prog as { id: string }).id;

  const { data: phase, error: phaseErr } = await db
    .from("phases")
    .insert({ program_id: programId, label: "Personal", position: 1, intent: "Client-scheduled library workouts" })
    .select("id")
    .single();
  if (phaseErr || !phase) return null;

  // Matches the 25 that already exist: the assignment is active, which is what
  // makes the program visible to the client at all. It does not displace real
  // programming — this branch only runs when there is none to displace.
  await db.from("program_assignments").insert({
    client_id: clientId,
    program_id: programId,
    current_phase_id: (phase as { id: string }).id,
    active: true,
  });

  return (phase as { id: string }).id;
}

export async function POST(req: Request) {
  let body: {
    clientId?: string;
    title?: string;
    date?: string;
    exercises?: ManualExercise[];
    markDone?: boolean;
    /** Free text for an already-finished session with no structured exercises. */
    note?: string;
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
  const note = (body.note || "").trim().slice(0, 2000);

  // A FINISHED session may have no structured exercises, and that is the whole
  // point of the "just type what I did" path.
  //
  // Dustin, 14 Aug: "when they add a custom workout it needs to add as logged
  // on schedule. this has been an ongoing issue. if they add a workout through
  // any route it needs to show up period."
  //
  // Free text used to go to offplan_workout_logs, which nothing on the schedule
  // reads and nothing has processed since 2026-07-29. Todd Prine typed a run
  // into it and reasonably concluded it had not saved. Routing that text
  // through HERE instead gives it the same day / workout_log /
  // scheduled_workouts shape as every other way of adding a workout, so it
  // lands on the calendar like anything else.
  //
  // Still required for a workout that has NOT happened yet: a plan with no
  // movements in it is not a plan, and would open to an empty logger.
  if (!exercises.length && !(body.markDone && note)) {
    return NextResponse.json({ error: "Add at least one exercise." }, { status: 400 });
  }
  if (exercises.length > 40) return NextResponse.json({ error: "That's more than 40 exercises." }, { status: 400 });

  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? (body.date as string) : CT_TODAY();
  const db = createAdminClient();

  let phaseId = await ensurePhaseId(db, clientId);
  if (body.replaceDayId) {
    // Replacing a specific day? Put the new one in the same phase so it sits
    // beside what it replaced rather than in a different part of the program.
    const { data: rep } = await db.from("days").select("phase_id").eq("id", body.replaceDayId).maybeSingle();
    phaseId = (rep as { phase_id?: string } | null)?.phase_id ?? phaseId;
  }
  if (!phaseId) {
    return NextResponse.json({ error: `Could not set up a place to save this. Send ${COACH_FIRST_NAME} a message.` }, { status: 500 });
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
          // The client's own words. For a typed session this IS the workout —
          // "Norwegian 4x4 run, 26min, 2.31 miles" is the whole record, and
          // dropping it would leave a bare title on the calendar.
          note: note || null,
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
    // All-or-nothing. A half-created day still LOOKS like a workout in the
    // list, so leaving one behind is worse than reporting the failure — the
    // client taps it, finds nothing, and has no idea why. (A DELIBERATELY
    // exercise-free day from the typed path is a different thing: it is
    // complete, it is marked done, and its record is the note on its log.)
    if (created.days) {
      try {
        const { data: secs } = await db.from("sections").select("id").eq("day_id", created.days);
        const ids = ((secs as { id: string }[] | null) || []).map((s) => s.id);
        if (ids.length) await db.from("prescribed_exercises").delete().in("section_id", ids);
        await db.from("sections").delete().eq("day_id", created.days);
        await db.from("days").delete().eq("id", created.days);
      } catch { /* the original error is the one worth reporting */ }
    }
    // uq_scheduled_workout_one_per_day is not a server fault and must not read
    // like one — that session is simply already on the calendar that day.
    if (isDuplicateScheduleError(err)) {
      return NextResponse.json({ error: duplicateScheduleMessage("add") }, { status: 409 });
    }
    const msg = err instanceof Error ? err.message : "Could not save that workout.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
