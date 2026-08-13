// Shared workout-adjustment engine. Used by /api/workout-assist and the
// in-app agent (/api/agent) so a client's SCHEDULED workout can be changed
// (swap / modify / remove / add) without ever touching the master library:
// when the target day is a shared library day it is cloned into a client-owned
// copy (days.client_owner_id) and only that client's scheduled_workouts row(s)
// are repointed at the clone.

import { Db } from "@/lib/ai/scope";
import { findExerciseIdByName } from "@/lib/exerciseLookup";

export const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

export interface Change {
  op: string; // swap | modify | remove | add
  pe_id?: string; section_id?: string;
  to_exercise?: string; exercise?: string; type?: string;
  sets?: number | null; reps?: string | null; load?: string | null; duration?: string | null; note?: string | null;
}
export interface Proposal { scheduled_workout_id: string; reason: string; summary: string; changes: Change[]; }

export interface PeRow { id: string; position: number; sets: number | null; volume_type: string | null; volume_value: string | null; unilateral: boolean | null; tempo: string | null; load_descriptor: string | null; cue: string | null; rest: string | null; superset_group: string | null; tracked_fields: string[] | null; exercise_id: string; exercises?: { name?: string } | null; }
export interface SecRow { id: string; internal_name: string | null; client_facing_name: string | null; position: number; prescribed_exercises: PeRow[]; }
export interface DayRow { id: string; phase_id: string | null; label: string | null; position: number | null; client_owner_id: string | null; sections: SecRow[]; }

export async function loadDayTree(db: Db, dayId: string): Promise<DayRow | null> {
  const { data } = await db.from("days").select(`
    id, phase_id, label, position, client_owner_id,
    sections(id, internal_name, client_facing_name, position,
      prescribed_exercises(id, position, sets, volume_type, volume_value, unilateral, tempo, load_descriptor, cue, rest, superset_group, tracked_fields, exercise_id, exercises(name)))
  `).eq("id", dayId).maybeSingle();
  return (data as unknown as DayRow) || null;
}

export async function resolveExerciseId(db: Db, clientId: string, name: string): Promise<string | null> {
  // Exact name, then aliases. The alias pass is purely additive - it cannot
  // redirect a name that already matched, only stop a duplicate being minted
  // for a movement the library already knows under different wording.
  const existing = await findExerciseIdByName(db, name, clientId);
  if (existing) return existing;
  const { data: ins } = await db.from("exercises").insert({ name, client_owner_id: clientId, created_by: "trainer_ai", availability_status: "available" }).select("id").single();
  if (ins) return (ins as { id: string }).id;
  return await findExerciseIdByName(db, name, clientId);
}

export function trackingFor(type: string | undefined, reps: string | null, duration: string | null): { tracked: string[]; volume_type: string; volume_value: string | null } {
  if (type === "time") return { tracked: ["time"], volume_type: "duration", volume_value: duration || "1 min" };
  if (type === "reps") return { tracked: ["reps"], volume_type: (reps || "").includes("-") ? "rep_range" : "reps", volume_value: reps || "10" };
  return { tracked: ["weight", "reps"], volume_type: (reps || "").includes("-") ? "rep_range" : "reps", volume_value: reps || "8-12" };
}

export async function upcomingSessionsForDay(db: Db, clientId: string, dayId: string): Promise<string[]> {
  const today = CT_TODAY();
  const { data } = await db.from("scheduled_workouts").select("id").eq("client_id", clientId).eq("day_id", dayId).eq("status", "scheduled").is("deleted_at", null).gte("scheduled_date", today);
  return ((data as { id: string }[]) || []).map((s) => s.id);
}

// Apply a proposal, scoped to one session or the whole series. Never edits a
// shared library day: clones it into a client-owned copy first.
/**
 * One reversal step. Replayed newest-first by the agent's undo_action tool.
 *
 * These ARE the backup. Dustin's rule is a bak_* table before any destructive
 * change; a `remove` here deletes a prescribed_exercises row, and the row's
 * full contents ride along in the log entry that records the deletion, which is
 * the same guarantee in one place instead of two.
 */
export type WorkoutUndoStep =
  | { op: "reinsert"; table: string; values: Record<string, unknown> }
  | { op: "restore"; table: string; id: string; values: Record<string, unknown> }
  | { op: "delete"; table: string; id: string }
  | { op: "repoint"; ids: string[]; day_id: string };

export interface ApplyResult { ok: boolean; message: string; undo: { kind: "workout_adjust"; steps: WorkoutUndoStep[] } | null }

/** Fields a `modify`/`swap` can touch — captured before the write so it can go back. */
const PE_MUTABLE = ["exercise_id", "sets", "volume_type", "volume_value", "load_descriptor", "cue"] as const;

export async function applyProposal(db: Db, clientId: string, proposal: Proposal, scope: "one" | "series"): Promise<ApplyResult> {
  // Verify the scheduled workout belongs to this client.
  const { data: swRow } = await db.from("scheduled_workouts").select("id, day_id, client_id").eq("id", proposal.scheduled_workout_id).maybeSingle();
  const sw = swRow as { id: string; day_id: string; client_id: string } | null;
  if (!sw || sw.client_id !== clientId) return { ok: false, message: "That scheduled workout wasn't found for this client.", undo: null };

  const orig = await loadDayTree(db, sw.day_id);
  if (!orig) return { ok: false, message: "Couldn't load the workout to adjust.", undo: null };

  // Which of this client's upcoming sessions should receive the change.
  const seriesIds = await upcomingSessionsForDay(db, clientId, sw.day_id);
  const targetSwIds = scope === "series" ? (seriesIds.length ? seriesIds : [sw.id]) : [sw.id];

  const isLibrary = orig.client_owner_id !== clientId;
  // Clone when the day is a shared library day (never edit it), OR when editing a
  // single session whose (client-owned) day is shared by other upcoming sessions
  // — otherwise an in-place edit would leak into those other sessions.
  const mustClone = isLibrary || (scope === "one" && seriesIds.filter((id) => id !== sw.id).length > 0);

  // Map original section/pe ids → the ids we'll actually edit (identity if editing
  // the day in place; freshly-cloned ids if we cloned it).
  const secMap = new Map<string, string>();
  const peMap = new Map<string, string>();
  let targetDayId = orig.id;

  // How to put it back. Reversing a CLONE is two steps and nothing else: point
  // the sessions at the original day again and drop the copy. Reversing an
  // IN-PLACE edit needs the prior state of every row touched, captured as we go.
  const steps: WorkoutUndoStep[] = [];

  if (mustClone) {
    const { data: dayRow, error: dayErr } = await db.from("days").insert({
      phase_id: orig.phase_id, label: (orig.label || "Workout") + " (adjusted)", position: orig.position ?? 1,
      swappable: false, client_owner_id: clientId, created_by: "trainer_ai", origin: "ai_adjust",
    }).select("id").single();
    if (dayErr || !dayRow) return { ok: false, message: "Couldn't create the client copy to adjust.", undo: null };
    targetDayId = (dayRow as { id: string }).id;
    for (const s of (orig.sections || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
      const { data: secRow } = await db.from("sections").insert({
        day_id: targetDayId, internal_name: s.internal_name, client_facing_name: s.client_facing_name, position: s.position,
      }).select("id").single();
      if (!secRow) continue;
      const newSecId = (secRow as { id: string }).id;
      secMap.set(s.id, newSecId);
      for (const pe of (s.prescribed_exercises || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
        const { data: peRow } = await db.from("prescribed_exercises").insert({
          section_id: newSecId, exercise_id: pe.exercise_id, position: pe.position, sets: pe.sets,
          volume_type: pe.volume_type, volume_value: pe.volume_value, unilateral: pe.unilateral, tempo: pe.tempo,
          load_descriptor: pe.load_descriptor, cue: pe.cue, rest: pe.rest, superset_group: pe.superset_group, tracked_fields: pe.tracked_fields,
        }).select("id").single();
        if (peRow) peMap.set(pe.id, (peRow as { id: string }).id);
      }
    }
    // Repoint the in-scope sessions at the client-owned copy.
    await db.from("scheduled_workouts").update({ day_id: targetDayId }).in("id", targetSwIds);
    steps.push({ op: "repoint", ids: targetSwIds, day_id: orig.id });
    steps.push({ op: "delete", table: "days", id: targetDayId });
  } else {
    // Editing the client-owned day in place already affects every session pointing
    // at it (which, for "series", is exactly the set we want).
    for (const s of orig.sections || []) { secMap.set(s.id, s.id); for (const pe of s.prescribed_exercises || []) peMap.set(pe.id, pe.id); }
  }

  // Apply each change against the target (cloned or in-place) rows.
  let applied = 0;
  for (const ch of proposal.changes) {
    try {
      if (ch.op === "remove" && ch.pe_id) {
        const id = peMap.get(ch.pe_id); if (!id) continue;
        if (!mustClone) {
          // The row IS the backup. Read it whole before it stops existing.
          const { data: before } = await db.from("prescribed_exercises").select("*").eq("id", id).maybeSingle();
          if (before) steps.push({ op: "reinsert", table: "prescribed_exercises", values: before as Record<string, unknown> });
        }
        await db.from("prescribed_exercises").delete().eq("id", id); applied++;
      } else if (ch.op === "modify" && ch.pe_id) {
        const id = peMap.get(ch.pe_id); if (!id) continue;
        const upd: Record<string, unknown> = {};
        if (ch.sets != null) upd.sets = ch.sets;
        if (ch.reps) { upd.volume_value = ch.reps; upd.volume_type = ch.reps.includes("-") ? "rep_range" : "reps"; }
        if (ch.load) upd.load_descriptor = ch.load;
        if (ch.note) upd.cue = ch.note;
        if (Object.keys(upd).length) {
          if (!mustClone) {
            const { data: before } = await db.from("prescribed_exercises").select(PE_MUTABLE.join(",")).eq("id", id).maybeSingle();
            if (before) steps.push({ op: "restore", table: "prescribed_exercises", id, values: before as unknown as Record<string, unknown> });
          }
          await db.from("prescribed_exercises").update(upd).eq("id", id); applied++;
        }
      } else if (ch.op === "swap" && ch.pe_id && ch.to_exercise) {
        const id = peMap.get(ch.pe_id); if (!id) continue;
        const exId = await resolveExerciseId(db, clientId, ch.to_exercise); if (!exId) continue;
        const upd: Record<string, unknown> = { exercise_id: exId };
        if (ch.sets != null) upd.sets = ch.sets;
        if (ch.reps) { upd.volume_value = ch.reps; upd.volume_type = ch.reps.includes("-") ? "rep_range" : "reps"; }
        if (ch.note) upd.cue = ch.note;
        if (!mustClone) {
          const { data: before } = await db.from("prescribed_exercises").select(PE_MUTABLE.join(",")).eq("id", id).maybeSingle();
          if (before) steps.push({ op: "restore", table: "prescribed_exercises", id, values: before as unknown as Record<string, unknown> });
        }
        await db.from("prescribed_exercises").update(upd).eq("id", id); applied++;
      } else if (ch.op === "add" && ch.section_id && ch.exercise) {
        const secId = secMap.get(ch.section_id); if (!secId) continue;
        const exId = await resolveExerciseId(db, clientId, ch.exercise); if (!exId) continue;
        const { data: posRow } = await db.from("prescribed_exercises").select("position").eq("section_id", secId).order("position", { ascending: false }).limit(1);
        const nextPos = ((posRow && posRow[0] ? (posRow[0] as { position: number }).position : 0) || 0) + 1;
        const t = trackingFor(ch.type, ch.reps ?? null, ch.duration ?? null);
        const { data: addedRow } = await db.from("prescribed_exercises")
          .insert({ section_id: secId, exercise_id: exId, position: nextPos, sets: ch.sets ?? 3, volume_type: t.volume_type, volume_value: t.volume_value, tracked_fields: t.tracked, cue: ch.note })
          .select("id").single();
        if (!mustClone && addedRow) steps.push({ op: "delete", table: "prescribed_exercises", id: (addedRow as { id: string }).id });
        applied++;
      }
    } catch (e) { console.error("workout-assist apply change error", e); }
  }
  if (!applied) return { ok: false, message: "No changes could be applied — the workout may have changed. Try again.", undo: null };
  const nSessions = targetSwIds.length;
  const where = scope === "series" && nSessions > 1 ? ` across all ${nSessions} upcoming sessions of this workout` : " for this session";
  return {
    ok: true,
    message: (proposal.summary ? proposal.summary + " —" : `Applied ${applied} change${applied === 1 ? "" : "s"}`) + ` done${where}. The library is untouched.`,
    undo: steps.length ? { kind: "workout_adjust", steps } : null,
  };
}
