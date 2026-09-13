/**
 * THE ONE PLACE A HAND-BUILT WORKOUT IS WRITTEN.
 *
 * Lifted out of /api/workout-manual on 13 Sep 2026, unchanged, because a second
 * caller arrived and copying it was not an option.
 *
 * ── WHY THERE IS A SECOND CALLER ─────────────────────────────────────────────
 *
 * Dustin, 3:12pm Central, to the ✦ Coach: *"log a 3 mile hike for my cardio
 * today"*. It answered "Done." and wrote nothing, because none of its nine
 * client tools can record a workout the client ACTUALLY DID — they move, swap,
 * add-from-library, mark a SCHEDULED session complete, log a weigh-in and look
 * up a movement. A hike is none of those.
 *
 * The "+ Add workout" button has been able to do it since 14 Aug. It posts to
 * /api/workout-manual, which writes the full shape — a client-owned day, a
 * completed workout_log carrying the client's own words, and a
 * scheduled_workouts row — so a typed session lands on the calendar like any
 * other. The coach needed exactly that and had no way to reach it.
 *
 * ── WHY EXTRACTED RATHER THAN REIMPLEMENTED ──────────────────────────────────
 *
 * Because the history of this table says so. Free text used to go to
 * offplan_workout_logs, which nothing on the schedule reads and nothing has
 * processed since 2026-07-29; Todd Prine typed a run into it and reasonably
 * concluded it had not saved. A second copy of "how a typed workout is stored"
 * is how the two paths end up disagreeing about what a logged session is, and
 * one of them silently stops showing up. Same reason priceNamedFoods is not in
 * a route.
 *
 * The rollback is the load-bearing part and the reason this is all-or-nothing:
 * a half-created day still LOOKS like a workout in the list, so leaving one
 * behind is worse than reporting the failure.
 */

import { isDuplicateScheduleError, duplicateScheduleMessage } from "@/lib/scheduleConflict";
import { createAdminClient } from "@/lib/supabase/admin";
import { findExerciseIdByName } from "@/lib/exerciseLookup";
import { pickPhases, type ActiveAssignment } from "@/lib/pickProgramPhase";

export type ManualDb = ReturnType<typeof createAdminClient>;

export type ManualWorkoutResult =
  | { ok: true; dayId: string; date: string; markedDone: boolean }
  | { ok: false; error: string; status: number };

export const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

/** The four client-facing section names the logger knows how to render. */
const VALID_CF = new Set(["Warm-Up", "Strength", "Accessory", "Cardio"]);
const CF_TO_INTERNAL: Record<string, string> = {
  "Warm-Up": "Corrective Warm-Up",
  Strength: "Primary Strength",
  Accessory: "Accessory Strength",
  Cardio: "Cardio",
};

export interface ManualExercise {
  name: string;
  sets?: number | null;
  reps?: number | null;
  /** Free text: "45 lb", "bodyweight", "RPE 8". Shown, never parsed. */
  load?: string | null;
  section?: string | null;
  note?: string | null;
}

type Db = ManualDb;

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
  //
  // MORE THAN ONE IS NORMAL, so this must not pick arbitrarily. 26 of 35
  // clients carry two or more active assignments: their real block plus the
  // "Personal Workouts" fallback this function creates, and five carry several
  // real programs at once because that is how a corrective track plus a
  // training layer plus cardio is expressed.
  //
  // This used to be `.limit(1).maybeSingle()` with no ORDER BY, so Postgres
  // returned whichever row it felt like. The same client adding the same
  // workout twice could land it in their real block one time and in their
  // personal sidecar the next — and a hand-built session appearing inside a
  // prescribed programme is exactly the shape Claudine reported.
  //
  // Deterministic order, most-preferred first:
  //   1. a REAL program over the personal sidecar — a manual workout should sit
  //      beside actual programming, which is what the sidecar exists to avoid
  //      being needed for
  //   2. the most recently assigned, because that is the block they are on now
  //   3. id, so a tie can never come out two different ways
  const { data: aps } = await db
    .from("program_assignments")
    .select("id, assigned_at, programs(id, personal_for_client_id, phases(id, position))")
    .eq("client_id", clientId)
    .eq("active", true);
  const phases = pickPhases((aps as ActiveAssignment[] | null) || []);
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
  //
  // Checked, because the comment above says exactly why it matters: the
  // assignment is what makes the programme visible to the client AT ALL.
  // Unchecked, this helper returned the phase id as success while the client
  // could not see the programme, and the workout saved into it looked to them
  // like a workout that simply never appeared. Returning null puts the caller
  // on its existing failure path, which says "Could not set up a place to save
  // this" — true, and better than a silent success.
  const { error: asgErr } = await db.from("program_assignments").insert({
    client_id: clientId,
    program_id: programId,
    current_phase_id: (phase as { id: string }).id,
    active: true,
  });
  if (asgErr) return null;

  return (phase as { id: string }).id;
}

/**
 * Create the day, its exercises, and the schedule row — all of it or none.
 *
 * `exercises` may be empty ONLY for a session that already happened and carries
 * the client's own text: that text IS the workout. A future plan with no
 * movements opens to an empty logger, which the caller must reject before
 * getting here.
 */
export async function createManualWorkout(
  db: ManualDb,
  clientId: string,
  opts: {
    title: string;
    date: string;
    exercises: ManualExercise[];
    markDone?: boolean;
    /** Free text for an already-finished session. Lands on the workout log. */
    note?: string;
    replaceDayId?: string | null;
  },
): Promise<ManualWorkoutResult> {
  const { title, date, exercises, note } = opts;
  const markDone = !!opts.markDone;

  let phaseId = await ensurePhaseId(db, clientId);
  if (opts.replaceDayId) {
    // Replacing a specific day? Put the new one in the same phase so it sits
    // beside what it replaced rather than in a different part of the program.
    const { data: rep } = await db.from("days").select("phase_id").eq("id", opts.replaceDayId).maybeSingle();
    phaseId = (rep as { phase_id?: string } | null)?.phase_id ?? phaseId;
  }
  if (!phaseId) {
    return { ok: false, error: "Could not set up a place to save this. Send your coach a message.", status: 500 };
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
    if (markDone) {
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
      status: markDone ? "completed" : "scheduled",
      workout_log_id: workoutLogId,
      source: "client_self_assign",
    });
    if (swErr) throw swErr;

    return { ok: true as const, dayId, date, markedDone: !!markDone };
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
        // Each step checked, and a failure ABANDONS the rest rather than
        // pressing on: deleting a day whose sections are still there is how you
        // get orphans, and PostgREST returns its error rather than throwing, so
        // the catch below has never seen one of these. The comment above says a
        // half-created day is worse than a reported failure — that was true and
        // the cleanup could not tell anyone when it left one.
        const step1 = ids.length
          ? await db.from("prescribed_exercises").delete().in("section_id", ids)
          : { error: null };
        const step2 = step1.error ? { error: step1.error } : await db.from("sections").delete().eq("day_id", created.days);
        const step3 = step2.error ? { error: step2.error } : await db.from("days").delete().eq("id", created.days);
        const cleanupErr = step1.error || step2.error || step3.error;
        if (cleanupErr) {
          console.error(
            `manual workout: rollback incomplete, day ${created.days} may be half-created —`,
            cleanupErr.message,
          );
        }
      } catch { /* the original error is the one worth reporting */ }
    }
    // uq_scheduled_workout_one_per_day is not a server fault and must not read
    // like one — that session is simply already on the calendar that day.
    if (isDuplicateScheduleError(err)) {
      return { ok: false as const, error: duplicateScheduleMessage("add"), status: 409 };
    }
    const msg = err instanceof Error ? err.message : "Could not save that workout.";
    return { ok: false as const, error: msg, status: 500 };
  }
}
