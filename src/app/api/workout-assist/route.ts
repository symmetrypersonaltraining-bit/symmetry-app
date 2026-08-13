// POST /api/workout-assist — Trainer's in-app AI to review and ADJUST a specific
// client's CURRENTLY SCHEDULED workouts (e.g. when they're in pain), without ever
// touching the master library.
//
// Two phases:
//   1. Propose (body: { clientId, message }): loads the client's upcoming
//      scheduled workouts with their full exercise trees + injuries, and either
//      answers the trainer's question or returns a structured `proposal` of
//      changes to ONE scheduled workout (swap / modify / remove / add).
//   2. Apply (body: { clientId, apply: {...proposal} }): applies the confirmed
//      changes. If the scheduled workout points at a LIBRARY day, it is first
//      CLONED into a client-owned day (days.client_owner_id) and the
//      scheduled_workouts row is repointed at the clone — the shared library day
//      is never modified. If it already points at a client-owned day, the change
//      is applied in place.
//
// Trainer-only, metered. Model: Haiku (structured).

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope, Db } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { findExerciseIdByName } from "@/lib/exerciseLookup";
import { COACH_FIRST_NAME } from "@/lib/trainer";

export const runtime = "nodejs";
const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const CF_TO_INTERNAL: Record<string, string> = { "Warm-Up": "Corrective Warm-Up", "Strength": "Primary Strength", "Accessory": "Accessory Strength", "Cardio": "Cardio" };

const SYSTEM_PROMPT = `You are ${COACH_FIRST_NAME}'s in-app programming partner for Symmetry Personal Training (corrective + physique coaching). ${COACH_FIRST_NAME} (the trainer) works with you exactly like he would in a normal programming chat — the difference is you can also WRITE the change straight into a client's scheduled workouts. You only ever change THIS client's scheduled sessions; you never touch a shared template/library.

You have the SAME capabilities as chatting through programming with him:
- Answer questions about what the client is doing.
- Diagnose a problem (pain, a plateau, a limitation) and TALK THROUGH reprogramming ideas — offer 1-3 concrete options in the reply, with your reasoning, before/besides proposing the write.
- Swap or regress a movement to a pain-free / better-fit alternative that keeps the session's intent.
- Adjust sets, reps, load, tempo, rest, or cues.
- ADD extra rehab / mobility / corrective work (e.g. a corrective warm-up drill, band work, a mobility hold) into the appropriate section — program it just like ${COACH_FIRST_NAME} would.
- Remove a movement that's causing a problem.

You are given the client's upcoming scheduled workouts. Each workout has an id (SW-id), each section a section_id, each exercise a pe_id. When you propose changes you MUST reference those exact ids. Put a change into a sensible section (rehab/mobility/corrective → the Warm-Up section; strength work → Strength/Accessory).

Return one of:
- {"reply": string} — for a question or when you're just talking through ideas and want ${COACH_FIRST_NAME} to steer before you write.
- {"reply": string, "proposal": {...}} — when you're proposing a concrete write. Lead the reply with your reasoning / options, THEN the proposal is the change to commit. ${COACH_FIRST_NAME} will choose whether it applies to just that one session or all upcoming sessions of that workout, so write the change to make sense either way.

When the client has pain or a limitation: name the likely culprit, give the fix, and (when useful) suggest rehab/mobility to add alongside the swap.

HARD RULES (never violate):
- NEVER program Olympic or power lifts (cleans, snatches, jerks, high pulls, push press) or strongman.
- Pull-ups are ALWAYS "Machine Assisted Pull Up" (progress by reducing assist) — never weighted pull-ups/chin-ups.
- Barbell hip thrust → use "Hip Thrust Machine".
- Sevens Gym equipment ONLY: cable rig, dumbbells, barbells + racks, leg press, GHD, Smith, kettlebells, pendulum squat, belt squat, battle ropes, treadmill, plyo boxes, bands, med/stability balls, pull-up bar, hip thrust machine, machine assisted pull up. NOT available: rower/erg, elliptical, cable fly machine.
- Use exact, common exercise names so they map to the library + demo videos.

Respond with ONLY valid JSON — no markdown, no fences — one of:
{"reply": string}
{"reply": string, "proposal": {
  "scheduled_workout_id": string,
  "reason": string,
  "summary": string,
  "changes": [
    {"op":"swap","pe_id":string,"to_exercise":string,"sets":number|null,"reps":string|null,"note":string|null},
    {"op":"modify","pe_id":string,"sets":number|null,"reps":string|null,"load":string|null,"note":string|null},
    {"op":"remove","pe_id":string},
    {"op":"add","section_id":string,"exercise":string,"type":"weight"|"reps"|"time","sets":number,"reps":string|null,"duration":string|null,"note":string|null}
  ]
}}
- "summary": one plain-English sentence describing the change, for ${COACH_FIRST_NAME} to confirm.
- Keep changes minimal and targeted to what ${COACH_FIRST_NAME} asked.`;

interface Change { op: string; pe_id?: string; section_id?: string; to_exercise?: string; exercise?: string; type?: string; sets?: number | null; reps?: string | null; load?: string | null; duration?: string | null; note?: string | null; }
interface Proposal { scheduled_workout_id: string; reason: string; summary: string; changes: Change[]; }
interface Reply { reply: string; proposal?: Proposal; }

function validateReply(raw: unknown): Reply | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply.trim() : "";
  if (!reply) return null;
  const out: Reply = { reply: reply.slice(0, 1200) };
  if (o.proposal && typeof o.proposal === "object") {
    const p = o.proposal as Record<string, unknown>;
    const swId = typeof p.scheduled_workout_id === "string" ? p.scheduled_workout_id : "";
    const changesRaw = Array.isArray(p.changes) ? p.changes : [];
    const changes: Change[] = [];
    for (const c of changesRaw) {
      if (!c || typeof c !== "object") continue;
      const co = c as Record<string, unknown>;
      const op = co.op;
      if (op !== "swap" && op !== "modify" && op !== "remove" && op !== "add") continue;
      changes.push({
        op,
        pe_id: typeof co.pe_id === "string" ? co.pe_id : undefined,
        section_id: typeof co.section_id === "string" ? co.section_id : undefined,
        to_exercise: typeof co.to_exercise === "string" ? co.to_exercise.slice(0, 80) : undefined,
        exercise: typeof co.exercise === "string" ? co.exercise.slice(0, 80) : undefined,
        type: co.type === "weight" || co.type === "reps" || co.type === "time" ? co.type : undefined,
        sets: co.sets == null ? null : Math.max(1, Math.min(10, Math.round(Number(co.sets) || 3))),
        reps: typeof co.reps === "string" ? co.reps.slice(0, 24) : null,
        load: typeof co.load === "string" ? co.load.slice(0, 40) : null,
        duration: typeof co.duration === "string" ? co.duration.slice(0, 24) : null,
        note: typeof co.note === "string" ? co.note.slice(0, 200) : null,
      });
    }
    if (swId && changes.length) {
      out.proposal = { scheduled_workout_id: swId, reason: typeof p.reason === "string" ? p.reason.slice(0, 300) : "", summary: typeof p.summary === "string" ? p.summary.slice(0, 300) : "", changes };
    }
  }
  return out;
}

// ── exercise resolve (library match, else client-owned) — mirrors workout-ai ──
async function resolveExerciseId(db: Db, clientId: string, name: string): Promise<string | null> {
  // Exact name, then aliases. The alias pass is purely additive - it cannot
  // redirect a name that already matched, only stop a duplicate being minted
  // for a movement the library already knows under different wording.
  const existing = await findExerciseIdByName(db, name, clientId);
  if (existing) return existing;
  const { data: ins } = await db.from("exercises").insert({ name, client_owner_id: clientId, created_by: "trainer_ai", availability_status: "available" }).select("id").single();
  if (ins) return (ins as { id: string }).id;
  return await findExerciseIdByName(db, name, clientId);
}
function trackingFor(type: string | undefined, reps: string | null, duration: string | null): { tracked: string[]; volume_type: string; volume_value: string | null } {
  if (type === "time") return { tracked: ["time"], volume_type: "duration", volume_value: duration || "1 min" };
  if (type === "reps") return { tracked: ["reps"], volume_type: (reps || "").includes("-") ? "rep_range" : "reps", volume_value: reps || "10" };
  return { tracked: ["weight", "reps"], volume_type: (reps || "").includes("-") ? "rep_range" : "reps", volume_value: reps || "8-12" };
}

interface PeRow { id: string; position: number; sets: number | null; volume_type: string | null; volume_value: string | null; unilateral: boolean | null; tempo: string | null; load_descriptor: string | null; cue: string | null; rest: string | null; superset_group: string | null; tracked_fields: string[] | null; exercise_id: string; exercises?: { name?: string } | null; }
interface SecRow { id: string; internal_name: string | null; client_facing_name: string | null; position: number; prescribed_exercises: PeRow[]; }
interface DayRow { id: string; phase_id: string | null; label: string | null; position: number | null; client_owner_id: string | null; sections: SecRow[]; }

async function loadDayTree(db: Db, dayId: string): Promise<DayRow | null> {
  const { data } = await db.from("days").select(`
    id, phase_id, label, position, client_owner_id,
    sections(id, internal_name, client_facing_name, position,
      prescribed_exercises(id, position, sets, volume_type, volume_value, unilateral, tempo, load_descriptor, cue, rest, superset_group, tracked_fields, exercise_id, exercises(name)))
  `).eq("id", dayId).maybeSingle();
  return (data as unknown as DayRow) || null;
}

async function buildContext(db: Db, clientId: string, focusSwId?: string | null): Promise<string> {
  const today = CT_TODAY();
  const [clientRes, swRes] = await Promise.all([
    db.from("clients").select("name, primary_goal, injuries_limitations, injuries").eq("id", clientId).maybeSingle(),
    db.from("scheduled_workouts").select("id, scheduled_date, status, day_id").eq("client_id", clientId).is("deleted_at", null).eq("status", "scheduled").gte("scheduled_date", today).order("scheduled_date").limit(8),
  ]);
  const c = clientRes.data as { name?: string; primary_goal?: string; injuries_limitations?: string; injuries?: string } | null;
  let sws = (swRes.data as { id: string; scheduled_date: string; day_id: string }[]) || [];

  // The workout Dustin is currently viewing — pull it in even if it isn't in the
  // upcoming window (e.g. today's in-progress session), and float it to the top.
  if (focusSwId) {
    if (!sws.some((s) => s.id === focusSwId)) {
      const { data: f } = await db.from("scheduled_workouts").select("id, scheduled_date, status, day_id").eq("id", focusSwId).eq("client_id", clientId).maybeSingle();
      if (f) sws.unshift(f as { id: string; scheduled_date: string; day_id: string });
    }
    sws = [...sws.filter((s) => s.id === focusSwId), ...sws.filter((s) => s.id !== focusSwId)];
  }

  const lines: string[] = [`Today: ${today}`];
  if (c?.name) lines.push(`Client: ${c.name}${c.primary_goal ? ` — goal: ${c.primary_goal}` : ""}`);
  const inj = [c?.injuries_limitations, c?.injuries].filter(Boolean).join("; ");
  if (inj) lines.push(`Known injuries/limitations: ${inj}`);
  if (focusSwId) lines.push(`${COACH_FIRST_NAME} is CURRENTLY VIEWING the workout marked 👉 below — default to acting on THAT workout unless he says otherwise.`);
  if (!sws.length) { lines.push("No upcoming scheduled workouts on file."); return lines.join("\n"); }

  lines.push("\nSCHEDULED WORKOUTS (reference these exact ids in any proposal):");
  for (const sw of sws) {
    const day = await loadDayTree(db, sw.day_id);
    lines.push(`\n${sw.id === focusSwId ? "👉 CURRENTLY VIEWING — " : ""}[SW-id ${sw.id}] ${sw.scheduled_date} — ${day?.label || "workout"}`);
    const secs = (day?.sections || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
    for (const s of secs) {
      lines.push(`  Section "${s.client_facing_name || s.internal_name}" (section_id ${s.id}):`);
      const pes = (s.prescribed_exercises || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
      for (const pe of pes) {
        const vol = pe.volume_value ? `${pe.sets ?? ""}x${pe.volume_value}` : (pe.sets ? `${pe.sets} sets` : "");
        lines.push(`    - [pe_id ${pe.id}] ${pe.exercises?.name || "exercise"} ${vol}${pe.load_descriptor ? ` (${pe.load_descriptor})` : ""}${pe.cue ? ` — cue: ${pe.cue}` : ""}`);
      }
    }
  }
  return lines.join("\n");
}

// Count / list this client's upcoming sessions that use a given day (the "series").
async function upcomingSessionsForDay(db: Db, clientId: string, dayId: string): Promise<string[]> {
  const today = CT_TODAY();
  const { data } = await db.from("scheduled_workouts").select("id").eq("client_id", clientId).eq("day_id", dayId).eq("status", "scheduled").is("deleted_at", null).gte("scheduled_date", today);
  return ((data as { id: string }[]) || []).map((s) => s.id);
}

// ── APPLY: clone-if-needed then apply changes, scoped to one session or the series ──
async function applyProposal(db: Db, clientId: string, proposal: Proposal, scope: "one" | "series"): Promise<{ ok: boolean; message: string }> {
  // Verify the scheduled workout belongs to this client.
  const { data: swRow } = await db.from("scheduled_workouts").select("id, day_id, client_id").eq("id", proposal.scheduled_workout_id).maybeSingle();
  const sw = swRow as { id: string; day_id: string; client_id: string } | null;
  if (!sw || sw.client_id !== clientId) return { ok: false, message: "That scheduled workout wasn't found for this client." };

  const orig = await loadDayTree(db, sw.day_id);
  if (!orig) return { ok: false, message: "Couldn't load the workout to adjust." };

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

  if (mustClone) {
    const { data: dayRow, error: dayErr } = await db.from("days").insert({
      phase_id: orig.phase_id, label: (orig.label || "Workout") + " (adjusted)", position: orig.position ?? 1,
      swappable: false, client_owner_id: clientId, created_by: "trainer_ai", origin: "ai_adjust",
    }).select("id").single();
    if (dayErr || !dayRow) return { ok: false, message: "Couldn't create the client copy to adjust." };
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
        await db.from("prescribed_exercises").delete().eq("id", id); applied++;
      } else if (ch.op === "modify" && ch.pe_id) {
        const id = peMap.get(ch.pe_id); if (!id) continue;
        const upd: Record<string, unknown> = {};
        if (ch.sets != null) upd.sets = ch.sets;
        if (ch.reps) { upd.volume_value = ch.reps; upd.volume_type = ch.reps.includes("-") ? "rep_range" : "reps"; }
        if (ch.load) upd.load_descriptor = ch.load;
        if (ch.note) upd.cue = ch.note;
        if (Object.keys(upd).length) { await db.from("prescribed_exercises").update(upd).eq("id", id); applied++; }
      } else if (ch.op === "swap" && ch.pe_id && ch.to_exercise) {
        const id = peMap.get(ch.pe_id); if (!id) continue;
        const exId = await resolveExerciseId(db, clientId, ch.to_exercise); if (!exId) continue;
        const upd: Record<string, unknown> = { exercise_id: exId };
        if (ch.sets != null) upd.sets = ch.sets;
        if (ch.reps) { upd.volume_value = ch.reps; upd.volume_type = ch.reps.includes("-") ? "rep_range" : "reps"; }
        if (ch.note) upd.cue = ch.note;
        await db.from("prescribed_exercises").update(upd).eq("id", id); applied++;
      } else if (ch.op === "add" && ch.section_id && ch.exercise) {
        const secId = secMap.get(ch.section_id); if (!secId) continue;
        const exId = await resolveExerciseId(db, clientId, ch.exercise); if (!exId) continue;
        const { data: posRow } = await db.from("prescribed_exercises").select("position").eq("section_id", secId).order("position", { ascending: false }).limit(1);
        const nextPos = ((posRow && posRow[0] ? (posRow[0] as { position: number }).position : 0) || 0) + 1;
        const t = trackingFor(ch.type, ch.reps ?? null, ch.duration ?? null);
        await db.from("prescribed_exercises").insert({ section_id: secId, exercise_id: exId, position: nextPos, sets: ch.sets ?? 3, volume_type: t.volume_type, volume_value: t.volume_value, tracked_fields: t.tracked, cue: ch.note });
        applied++;
      }
    } catch (e) { console.error("workout-assist apply change error", e); }
  }
  if (!applied) return { ok: false, message: "No changes could be applied — the workout may have changed. Try again." };
  const nSessions = targetSwIds.length;
  const where = scope === "series" && nSessions > 1 ? ` across all ${nSessions} upcoming sessions of this workout` : " for this session";
  return { ok: true, message: (proposal.summary ? proposal.summary + " —" : `Applied ${applied} change${applied === 1 ? "" : "s"}`) + ` done${where}. The library is untouched.` };
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return missingKeyResponse();

  let body: { clientId?: string | null; message?: string; apply?: Proposal; applyScope?: "one" | "series"; focusWorkoutId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const scoped = await resolveAiScope(body.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  const { scope } = scoped;
  if (!scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  // Writes use the admin client (RLS-exempt), scoped explicitly to this client.
  const admin = createAdminClient() as unknown as Db;
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  // When the trainer is viewing a specific workout (header AI on /workout/<id>),
  // derive the client from that scheduled workout so no client picker is needed.
  let clientId = scope.clientId;
  if (body.focusWorkoutId) {
    const { data: fsw } = await admin.from("scheduled_workouts").select("client_id").eq("id", body.focusWorkoutId).maybeSingle();
    const fc = (fsw as { client_id?: string } | null)?.client_id;
    if (fc) clientId = fc;
  }
  if (!clientId) return NextResponse.json({ error: "Pick a client first — or open a client's workout so I know who this is for." }, { status: 400 });

  // ── Apply phase ──
  if (body.apply && body.apply.scheduled_workout_id && Array.isArray(body.apply.changes)) {
    const res = await applyProposal(admin, clientId, body.apply, body.applyScope === "series" ? "series" : "one");
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  }

  // ── Propose / answer phase ──
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Ask a question or describe the adjustment." }, { status: 400 });

  const metered = await enforceMeter(clientId, "workout_assist");
  if (metered) return metered;

  const context = await buildContext(admin, clientId, body.focusWorkoutId ?? null);
  const result = await callClaudeJson({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: HAIKU_MODEL,
    system: SYSTEM_PROMPT,
    maxTokens: 1100,
    messages: [{ role: "user", content: `CLIENT'S SCHEDULED WORKOUTS (server-assembled, trusted):\n${context}\n\nDUSTIN'S REQUEST:\n${message}` }],
    validate: validateReply,
  });
  await logUsage(clientId, "workout_assist", result.tokensIn, result.tokensOut, HAIKU_MODEL);

  if (!result.value) return NextResponse.json({ error: "Couldn't process that — try rephrasing." }, { status: 502 });

  // If the AI proposed a write, tell the UI how many upcoming sessions use this
  // same workout so Dustin can choose "just this session" vs "all upcoming ones".
  const out = result.value as Reply & { series?: { count: number; label: string; date: string } };
  if (out.proposal?.scheduled_workout_id) {
    const { data: swRow } = await admin.from("scheduled_workouts").select("day_id, scheduled_date, days(label)").eq("id", out.proposal.scheduled_workout_id).maybeSingle();
    const sw = swRow as { day_id: string; scheduled_date: string; days?: { label?: string } } | null;
    if (sw) {
      const ids = await upcomingSessionsForDay(admin, clientId, sw.day_id);
      out.series = { count: ids.length || 1, label: sw.days?.label || "this workout", date: sw.scheduled_date };
    }
  }
  return NextResponse.json(out);
}

export const dynamic = "force-dynamic";
