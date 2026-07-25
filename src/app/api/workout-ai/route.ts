// POST /api/workout-ai  — AI "Create / Replace Workout" for a client.
// Modes:
//   replace   → design a substitute for today's (missed / traveling) workout
//   equipment → design a workout around what's available (photo and/or text)
//   activity  → record an extra activity they did (volleyball, yoga…) as a completed session
//
// The AI is PROGRAMMING-AWARE: it reads the client's active program/phase, what's scheduled
// coming up, recent history and the trainer's programming notes, so the workout complements
// what Dustin has them doing and doesn't clash with an upcoming day.
//
// Everything is persisted to the CLIENT'S OWN library (days.client_owner_id), never the main
// app library. Generated workouts count toward training (a scheduled_workouts row is created;
// an activity is logged completed immediately). The trainer is notified via the message inbox.
// Auth-checked, client-scoped, metered (feature 'workout_build').

import { NextRequest, NextResponse } from "next/server";
import { SONNET_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope, TRAINER_EMAIL, Db } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// ─── section constraint maps (DB CHECK constraints) ───
const CF_TO_INTERNAL: Record<string, string> = {
  "Warm-Up": "Corrective Warm-Up",
  "Strength": "Primary Strength",
  "Accessory": "Accessory Strength",
  "Cardio": "Cardio",
};
const VALID_CF = new Set(Object.keys(CF_TO_INTERNAL));

type AiExercise = { name: string; type: "weight" | "reps" | "time"; sets: number; reps: string | null; duration: string | null; note: string | null };
type AiSection = { name: string; exercises: AiExercise[] };
type AiWorkout = { title: string; focus: string; rationale: string; duration_min: number | null; sections: AiSection[] };

function validateWorkout(raw: unknown): AiWorkout | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 80) : null;
  if (!title) return null;
  const secsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections: AiSection[] = [];
  for (const s of secsRaw) {
    if (!s || typeof s !== "object") continue;
    const so = s as Record<string, unknown>;
    let name = typeof so.name === "string" ? so.name.trim() : "";
    if (!VALID_CF.has(name)) name = "Accessory"; // coerce to a valid section
    const exRaw = Array.isArray(so.exercises) ? so.exercises : [];
    const exercises: AiExercise[] = [];
    for (const e of exRaw) {
      if (!e || typeof e !== "object") continue;
      const eo = e as Record<string, unknown>;
      const nm = typeof eo.name === "string" ? eo.name.trim().slice(0, 80) : "";
      if (!nm) continue;
      const type = eo.type === "weight" || eo.type === "reps" || eo.type === "time" ? eo.type : "reps";
      const sets = Math.max(1, Math.min(10, Math.round(Number(eo.sets) || 3)));
      const reps = typeof eo.reps === "string" && eo.reps.trim() ? eo.reps.trim().slice(0, 24) : null;
      const duration = typeof eo.duration === "string" && eo.duration.trim() ? eo.duration.trim().slice(0, 24) : null;
      const note = typeof eo.note === "string" && eo.note.trim() ? eo.note.trim().slice(0, 200) : null;
      exercises.push({ name: nm, type, sets, reps, duration, note });
    }
    if (exercises.length) sections.push({ name, exercises });
  }
  if (!sections.length) return null;
  return {
    title,
    focus: typeof o.focus === "string" ? o.focus.trim().slice(0, 160) : "",
    rationale: typeof o.rationale === "string" ? o.rationale.trim().slice(0, 400) : "",
    duration_min: Number.isFinite(Number(o.duration_min)) ? Math.round(Number(o.duration_min)) : null,
    sections,
  };
}

// ─── programming context the AI must respect ───
async function buildContext(db: Db, clientId: string, dayId: string | null): Promise<{ text: string; phaseId: string | null }> {
  const today = CT_TODAY();
  const [clientRes, apRes, upcomingRes, recentRes, notesRes, replacingRes] = await Promise.all([
    db.from("clients").select("name, primary_goal").eq("id", clientId).maybeSingle(),
    db.from("program_assignments").select("program_id, programs(name, phases(id, label, position))").eq("client_id", clientId).eq("active", true).limit(1).maybeSingle(),
    (db as Db).from("scheduled_workouts").select("scheduled_date, status, days(label)").eq("client_id", clientId).gte("scheduled_date", today).is("deleted_at", null).order("scheduled_date").limit(12),
    db.from("workout_logs").select("log_date, day_id, days(label)").eq("client_id", clientId).order("log_date", { ascending: false }).limit(6),
    db.from("trainer_notes").select("note, created_at, exercises(name)").eq("client_id", clientId).order("created_at", { ascending: false }).limit(12),
    dayId ? db.from("days").select("label, phase_id").eq("id", dayId).maybeSingle() : Promise.resolve({ data: null } as { data: null }),
  ]);
  const client = clientRes.data as { name: string | null; primary_goal: string | null } | null;
  const ap = apRes.data as { programs?: { name?: string; phases?: { id: string; label: string; position: number }[] } } | null;
  const replacing = replacingRes.data as { label?: string; phase_id?: string } | null;

  // phase to attach the new workout to: the replaced day's phase, else the active program's first phase
  let phaseId: string | null = replacing?.phase_id ?? null;
  const phases = (ap?.programs?.phases || []).slice().sort((a, b) => a.position - b.position);
  if (!phaseId && phases.length) phaseId = phases[0].id;

  const lines: string[] = [];
  lines.push(`Client: ${client?.name || "(unknown)"}${client?.primary_goal ? ` — goal: ${client.primary_goal}` : ""}`);
  if (ap?.programs?.name) lines.push(`Active program: ${ap.programs.name}${phases[0] ? ` (current phase: ${phases[0].label})` : ""}`);
  if (replacing?.label) lines.push(`Replacing today's scheduled workout: "${replacing.label}"`);
  const upcoming = ((upcomingRes as { data?: unknown }).data as { scheduled_date: string; status: string; days?: { label?: string } }[] | null) || [];
  const upc = upcoming.filter((u) => u.status === "scheduled").slice(0, 8).map((u) => `${u.scheduled_date}: ${u.days?.label || "workout"}`);
  if (upc.length) lines.push(`Upcoming scheduled workouts (do NOT clash / over-fatigue these muscle groups the day before):\n  - ${upc.join("\n  - ")}`);
  const recent = (recentRes.data as { log_date: string; days?: { label?: string } }[] | null) || [];
  const rec = recent.slice(0, 5).map((r) => `${r.log_date}: ${r.days?.label || "workout"}`);
  if (rec.length) lines.push(`Recent sessions done:\n  - ${rec.join("\n  - ")}`);
  const notes = (notesRes.data as { note: string; exercises?: { name?: string } }[] | null) || [];
  const nt = notes.slice(0, 10).map((n) => `- ${n.exercises?.name ? `[${n.exercises.name}] ` : ""}${n.note}`);
  if (nt.length) lines.push(`Trainer's programming notes for this client (honor these):\n${nt.join("\n")}`);
  return { text: lines.join("\n"), phaseId };
}

function systemPrompt(mode: string): string {
  const base = `You are the workout designer for Symmetry Personal Training (corrective + physique coach Dustin Gautreaux). You create ONE workout for a specific client that COMPLEMENTS Dustin's current programming for them and does NOT clash with what's scheduled next (e.g. don't hammer legs the day before a programmed leg day; keep corrective clients within safe patterns). Prefer common, well-known exercises so they map to the app's library and have demo videos.

Respond with ONLY valid JSON — no markdown, no fences, no prose — exactly this shape:
{"title":string,"focus":string,"rationale":string,"duration_min":number|null,"sections":[{"name":"Warm-Up"|"Strength"|"Accessory"|"Cardio","exercises":[{"name":string,"type":"weight"|"reps"|"time","sets":number,"reps":string|null,"duration":string|null,"note":string|null}]}]}

Rules:
- "name" of each section MUST be one of exactly: Warm-Up, Strength, Accessory, Cardio.
- type "weight" = load-based (barbell/dumbbell/machine/cable) → set "reps" like "8-12", leave "duration" null.
- type "reps" = bodyweight/reps → set "reps", leave "duration" null.
- type "time" = timed/cardio/holds → set "duration" like "20 min" or "45 sec", leave "reps" null.
- "title" is a short reusable name (e.g. "Hotel Upper Body A", "Beach Conditioning").
- "rationale" (2-3 sentences): explain how this fits their current program and avoids clashing with upcoming days.
- Keep it realistic and appropriately dosed for one session.`;
  if (mode === "activity") {
    return `You log an EXTRA activity a Symmetry client already did (e.g. volleyball, soccer, yoga, a hike) as a single completed session for their history. Do not invent a full program — capture what they did.

Respond with ONLY valid JSON — no markdown, no fences — exactly this shape:
{"title":string,"focus":string,"rationale":string,"duration_min":number|null,"sections":[{"name":"Cardio"|"Accessory","exercises":[{"name":string,"type":"time"|"reps","sets":number,"reps":string|null,"duration":string|null,"note":string|null}]}]}

Rules:
- "title" = the activity, nicely cased (e.g. "Beach Volleyball", "Vinyasa Yoga").
- Usually ONE section with ONE entry: type "time", duration = what they said (e.g. "60 min"), sets 1.
- "rationale" (1-2 sentences): note how it complements their training. Keep it simple.`;
  }
  if (mode === "equipment") {
    return base + `\n\nThe client described (and may have photographed) the equipment they have available. Use ONLY equipment that is available to them. If it's bodyweight-only, design a great bodyweight/travel session.`;
  }
  return base + `\n\nThe client missed today's workout or is traveling. Design a substitute session for the SAME general focus where sensible, using commonly-available gym equipment unless they said otherwise.`;
}

// map an AI exercise → tracked_fields + volume_type/value
function mapTracking(ex: AiExercise): { tracked: string[]; volume_type: string; volume_value: string | null } {
  if (ex.type === "time") return { tracked: ["time"], volume_type: "duration", volume_value: ex.duration || "1 min" };
  if (ex.type === "reps") return { tracked: ["reps"], volume_type: (ex.reps || "").includes("-") ? "rep_range" : "reps", volume_value: ex.reps || "10" };
  return { tracked: ["weight", "reps"], volume_type: (ex.reps || "").includes("-") ? "rep_range" : "reps", volume_value: ex.reps || "8-12" };
}

async function resolveExerciseId(db: Db, clientId: string, name: string): Promise<string | null> {
  // Prefer an existing library exercise (reuses demo videos); else create a CLIENT-OWNED one
  // so it never pollutes the main app library.
  const { data: found } = await db.from("exercises").select("id").ilike("name", name).limit(1);
  if (found && found[0]) return (found[0] as { id: string }).id;
  const { data: ins, error } = await db.from("exercises")
    .insert({ name, client_owner_id: clientId, created_by: "client_ai", availability_status: "available" })
    .select("id").single();
  if (!error && ins) return (ins as { id: string }).id;
  // unique-name race: re-select
  const { data: again } = await db.from("exercises").select("id").ilike("name", name).limit(1);
  return again && again[0] ? (again[0] as { id: string }).id : null;
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return missingKeyResponse();

  let body: { clientId?: string | null; mode?: string; dayId?: string | null; prompt?: string; image?: { data: string; media_type: string } | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const mode = body.mode === "equipment" || body.mode === "activity" ? body.mode : "replace";

  const scoped = await resolveAiScope(body.clientId ?? null);
  if (!scoped.ok) return scoped.response;
  const { scope } = scoped;
  if (!scope.clientId) return NextResponse.json({ error: "No client selected" }, { status: 400 });
  const clientId = scope.clientId;

  // Server-side feature gate. The workout_ai flag was checked ONLY in the UI (OffPlanBanner),
  // so this route would build and persist a workout for any authenticated client regardless -
  // i.e. turning the flag off could not actually turn the feature off. Fails open when the
  // settings row is unreadable so a settings hiccup can't lock anyone out mid-workout.
  {
    const { data: flagRow, error: flagErr } = await (createAdminClient() as unknown as Db)
      .from("client_app_settings").select("workout_ai").eq("client_id", clientId).maybeSingle();
    if (!flagErr && flagRow && (flagRow as { workout_ai: boolean | null }).workout_ai === false) {
      return NextResponse.json({ error: "This feature isn't enabled for your account yet." }, { status: 403 });
    }
  }

  const gate = await enforceMeter(clientId, "workout_build");
  if (gate) return gate;

  const admin = createAdminClient() as unknown as Db;
  const { text: context, phaseId } = await buildContext(admin, clientId, body.dayId ?? null);
  if (!phaseId) return NextResponse.json({ error: "This client has no active program to attach a workout to yet." }, { status: 400 });

  const userText = (body.prompt || "").trim().slice(0, 1500);
  const userContent: Anthropic.ContentBlockParam[] = [];
  if (mode === "equipment" && body.image?.data && body.image?.media_type) {
    userContent.push({ type: "image", source: { type: "base64", media_type: body.image.media_type as "image/jpeg", data: body.image.data } });
  }
  userContent.push({
    type: "text",
    text: `CLIENT PROGRAMMING CONTEXT:\n${context}\n\nCLIENT REQUEST (${mode}):\n${userText || "(none provided)"}\n\nDesign the workout now as strict JSON.`,
  });

  const { value: workout, tokensIn, tokensOut } = await callClaudeJson<AiWorkout>({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: SONNET_MODEL,
    system: systemPrompt(mode),
    maxTokens: 1600,
    messages: [{ role: "user", content: userContent }],
    validate: validateWorkout,
  });
  await logUsage(clientId, "workout_build", tokensIn, tokensOut, SONNET_MODEL);

  if (!workout) return NextResponse.json({ error: "The AI couldn't design a workout from that — try adding a bit more detail." }, { status: 502 });

  // ─── persist as a CLIENT-OWNED library day (+ sections + prescribed_exercises) ───
  const today = CT_TODAY();
  const originMap: Record<string, string> = { replace: "ai_replace", equipment: "ai_equipment", activity: "ai_activity" };
  let dayIdNew: string;
  try {
    const { data: posRow } = await admin.from("days").select("position").eq("phase_id", phaseId).order("position", { ascending: false }).limit(1);
    const nextPos = ((posRow && posRow[0] ? (posRow[0] as { position: number }).position : 0) || 0) + 1;
    const { data: dayRow, error: dayErr } = await admin.from("days").insert({
      phase_id: phaseId, label: workout.title, position: nextPos, swappable: false,
      client_owner_id: clientId, created_by: "client_ai", origin: originMap[mode] || "ai",
    }).select("id").single();
    if (dayErr || !dayRow) throw dayErr || new Error("day insert failed");
    dayIdNew = (dayRow as { id: string }).id;

    let sPos = 0;
    for (const sec of workout.sections) {
      const cf = VALID_CF.has(sec.name) ? sec.name : "Accessory";
      const { data: secRow, error: secErr } = await admin.from("sections").insert({
        day_id: dayIdNew, client_facing_name: cf, internal_name: CF_TO_INTERNAL[cf], position: sPos++,
      }).select("id").single();
      if (secErr || !secRow) throw secErr || new Error("section insert failed");
      const secId = (secRow as { id: string }).id;
      let pPos = 0;
      for (const ex of sec.exercises) {
        const exId = await resolveExerciseId(admin, clientId, ex.name);
        if (!exId) continue;
        const t = mapTracking(ex);
        await admin.from("prescribed_exercises").insert({
          section_id: secId, exercise_id: exId, position: pPos++, sets: ex.sets,
          volume_type: t.volume_type, volume_value: t.volume_value, tracked_fields: t.tracked,
          cue: ex.note, load_descriptor: null,
        });
      }
    }
  } catch (e) {
    console.error("workout-ai persist error", e);
    return NextResponse.json({ error: "Designed the workout but couldn't save it — please try again." }, { status: 500 });
  }

  // ─── scheduling / counting ───
  let logged = false;
  try {
    if (mode === "activity") {
      // Already done → log a COMPLETED session so it counts immediately.
      // The insert error MUST be read. It used to be discarded and `logged` set true
      // unconditionally, so a failed insert still told the client "Logged - it counts toward
      // your training" while leaving a completed scheduled_workouts row pointing at no log.
      // Streaks and session counts read workout_logs; the weekly done-count reads
      // scheduled_workouts - so the two disagreed permanently with nothing surfaced.
      const { data: wl, error: wlErr } = await admin.from("workout_logs").insert({
        client_id: clientId, day_id: dayIdNew, log_date: today, started_at: new Date().toISOString(),
        completed: true, completed_at: new Date().toISOString(), status: "Done as planned", source: "client",
        note: workout.focus || null,
      }).select("id").single();
      if (wlErr) throw wlErr;
      await admin.from("scheduled_workouts").insert({
        client_id: clientId, day_id: dayIdNew, scheduled_date: today, status: "completed",
        workout_log_id: wl ? (wl as { id: string }).id : null, source: "client_self_assign",
      });
      logged = true;
    } else {
      // Replacement → schedule the new workout for today so it appears + counts when logged,
      // and mark the original scheduled workout as skipped (replaced).
      // Retire any AI replacement already scheduled for today. Generating a second one (the
      // client taps Back and tries again, or the request retries after a timeout) used to
      // leave every previous one scheduled: 3 attempts + 1 completed read as 1/4 = 25%
      // adherence for the week instead of 1/1.
      const { data: priorAiDays } = await admin.from("days")
        .select("id").eq("client_owner_id", clientId).neq("id", dayIdNew);
      const priorAiDayIds = ((priorAiDays as { id: string }[] | null) || []).map((d) => d.id);
      if (priorAiDayIds.length) {
        await admin.from("scheduled_workouts").update({ status: "skipped" })
          .eq("client_id", clientId).eq("scheduled_date", today).eq("status", "scheduled")
          .eq("source", "client_self_assign").is("deleted_at", null)
          .in("day_id", priorAiDayIds);
      }
      await admin.from("scheduled_workouts").insert({
        client_id: clientId, day_id: dayIdNew, scheduled_date: today, status: "scheduled", source: "client_self_assign",
      });
      if (body.dayId) {
        // deleted_at guard: never resurrect a workout the client already deleted.
        await admin.from("scheduled_workouts").update({ status: "skipped" })
          .eq("client_id", clientId).eq("day_id", body.dayId).eq("scheduled_date", today).eq("status", "scheduled")
          .is("deleted_at", null);
      }
    }
  } catch (e) { console.error("workout-ai schedule error", e); }

  // ─── notify the trainer (self-serve + notified) ───
  try {
    const { data: tr } = await admin.from("clients").select("auth_user_id").or(`email.eq.${TRAINER_EMAIL},name.ilike.%Dustin%`).not("auth_user_id", "is", null).limit(1).maybeSingle();
    const trainerAuth = (tr as { auth_user_id: string } | null)?.auth_user_id;
    if (trainerAuth && scope.userId && trainerAuth !== scope.userId) {
      const verb = mode === "activity" ? "logged an extra activity" : mode === "equipment" ? "AI-built a workout from available equipment" : "AI-replaced today's workout";
      await admin.from("messages").insert({
        from_id: scope.userId, to_id: trainerAuth, client_id: clientId, is_group: false,
        body: `🤖 [AI Workout] ${verb}: "${workout.title}". ${workout.rationale || workout.focus || ""}`.trim().slice(0, 500),
      });
    }
  } catch (e) { console.error("workout-ai notify error", e); }

  return NextResponse.json({
    ok: true, dayId: dayIdNew, mode, logged,
    workout: { title: workout.title, focus: workout.focus, rationale: workout.rationale, duration_min: workout.duration_min, sections: workout.sections },
  });
}
