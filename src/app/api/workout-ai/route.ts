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
import { modelFor, callClaudeJson } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope, Db } from "@/lib/ai/scope";
import { inboxAuthUidForClient, trainerForClient } from "@/lib/trainerResolve";
import { createAdminClient } from "@/lib/supabase/admin";
import type Anthropic from "@anthropic-ai/sdk";
import { findExerciseIdByName } from "@/lib/exerciseLookup";
import { COACH_FIRST_NAME, COACH_NAME } from "@/lib/trainer";

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
  const [clientRes, apRes, upcomingRes, recentRes, notesRes, exNotesRes, replacingRes] = await Promise.all([
    db.from("clients").select("name, primary_goal").eq("id", clientId).maybeSingle(),
    db.from("program_assignments").select("program_id, programs(name, phases(id, label, position))").eq("client_id", clientId).eq("active", true).limit(1).maybeSingle(),
    (db as Db).from("scheduled_workouts").select("scheduled_date, status, days(label)").eq("client_id", clientId).gte("scheduled_date", today).is("deleted_at", null).order("scheduled_date").limit(12),
    db.from("workout_logs").select("log_date, day_id, days(label)").eq("client_id", clientId).order("log_date", { ascending: false }).limit(6),
    db.from("trainer_notes").select("note, created_at, exercises(name)").eq("client_id", clientId).order("created_at", { ascending: false }).limit(12),
    // THE CLIENT'S OWN NOTES ON MOVEMENTS.
    //
    // Dustin, 14 Aug: these "should go in as notes to the ai to see when we
    // program". They were not. This function read trainer_notes — his notes —
    // and never exercise_notes, so a client writing "went up to 110, felt
    // easy" or "this one bothers my shoulder" was writing into a table the
    // programming AI could not see. The note was stored, surfaced in his
    // inbox, and then had no effect on the next workout designed for them.
    //
    // author='client' specifically: a trainer-authored exercise note is
    // already covered by trainer_notes above, and including both would feed
    // the same guidance twice and weight it double.
    db.from("exercise_notes").select("note, created_at, author, exercises(name)").eq("client_id", clientId).eq("author", "client").order("created_at", { ascending: false }).limit(12),
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

  // The client's own words about specific movements. Kept in a SEPARATE block
  // from the trainer's notes, and explicitly labelled as reports rather than
  // instructions: "this one bothers my shoulder" is evidence the designer
  // should act on, but it is not the coach prescribing, and collapsing the two
  // would let a client's passing comment outrank Dustin's programming.
  const exNotes = (exNotesRes.data as { note: string; exercises?: { name?: string } }[] | null) || [];
  const ex = exNotes.slice(0, 10).map((n) => `- ${n.exercises?.name ? `[${n.exercises.name}] ` : ""}${n.note}`);
  if (ex.length) {
    lines.push(
      `The CLIENT's own notes on movements (their words, from the logger — treat as reports of how it felt, not as instructions; ` +
      `a movement they say hurts should be worked around, a weight they say was easy should progress):\n${ex.join("\n")}`,
    );
  }
  return { text: lines.join("\n"), phaseId };
}

// The coach whose programming this must COMPLEMENT — so it has to be the
// client's own coach, not the owner. Named the wrong trainer, the instruction
// is not merely mislabelled: it tells the model to work around a programme that
// does not exist for this client.
function systemPrompt(mode: string, coachFirstName: string, coachFullName: string): string {
  const base = `You are the workout designer for Symmetry Personal Training (corrective + physique coach ${coachFullName}). You create ONE workout for a specific client that COMPLEMENTS ${coachFirstName}'s current programming for them and does NOT clash with what's scheduled next (e.g. don't hammer legs the day before a programmed leg day; keep corrective clients within safe patterns). Prefer common, well-known exercises so they map to the app's library and have demo videos.

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
  // Exact name, then aliases. The alias pass is purely additive - it cannot
  // redirect a name that already matched, only stop a duplicate being minted
  // for a movement the library already knows under different wording.
  const existing = await findExerciseIdByName(db, name, clientId);
  if (existing) return existing;
  const { data: ins, error } = await db.from("exercises")
    .insert({ name, client_owner_id: clientId, created_by: "client_ai", availability_status: "available" })
    .select("id").single();
  if (!error && ins) return (ins as { id: string }).id;
  // unique-name race: re-select
  return await findExerciseIdByName(db, name, clientId);
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return missingKeyResponse();

  let body: { clientId?: string | null; mode?: string; dayId?: string | null;
    /** The day this workout is FOR. Omitted means today. Validated below. */
    date?: string | null; prompt?: string; image?: { data: string; media_type: string } | null };
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

  // Tier-aware. "Across the entire app" means this surface too — a client who
  // gets the higher model in the coach chat and the standard one here
  // experiences an assistant that is inconsistently clever, which is more
  // confusing than one that is consistently ordinary.
  const buildModel = modelFor("coach", await aiTierFor(admin, clientId));
  const buildCoach = await trainerForClient(admin, clientId);
  const { value: workout, tokensIn, tokensOut } = await callClaudeJson<AiWorkout>({
    meter: { clientId: clientId, feature: "workout_build" },
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: buildModel,
    system: systemPrompt(mode, buildCoach?.firstName || COACH_FIRST_NAME, buildCoach?.name || COACH_NAME),
    maxTokens: 1600,
    messages: [{ role: "user", content: userContent }],
    validate: validateWorkout,
  });
  await logUsage(clientId, "workout_build", tokensIn, tokensOut, buildModel);

  if (!workout) return NextResponse.json({ error: "The AI couldn't design a workout from that — try adding a bit more detail." }, { status: 502 });

  // ─── persist as a CLIENT-OWNED library day (+ sections + prescribed_exercises) ───
  //
  // `today` below is the day this workout is FOR, which is not always the day
  // it is being built on. The client sends the session it is logging; when it
  // sends nothing, today is right.
  //
  // Dustin, 22 Aug: "I was trying to replace yesterday's cardio w a walk thats
  // all." Every write in this block read the clock, so replacing a past
  // session scheduled the replacement on TODAY and skipped today's planned
  // work instead of that day's. He ended up with the walk and the cardio both
  // showing on the wrong days, plus a workout on his rest day.
  //
  // Bounded deliberately. A date is only honoured if it is a real ISO day, not
  // in the future, and within the last 30 days — the window the client's own
  // board shows. Anything else falls back to today rather than being trusted,
  // because this is a body field and the writes below are unsupervised.
  const clockToday = CT_TODAY();
  const today = ((): string => {
    const raw = typeof body.date === "string" ? body.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return clockToday;
    if (raw > clockToday) return clockToday;
    const floor = new Date(Date.parse(clockToday + "T12:00:00Z") - 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    if (raw < floor) return clockToday;
    return raw;
  })();
  const originMap: Record<string, string> = { replace: "ai_replace", equipment: "ai_equipment", activity: "ai_activity" };
  /**
   * How long after logging an activity a second call still counts as fixing the
   * first one rather than logging a new one.
   *
   * Jennifer's correction came 52 seconds later. Twenty minutes is generous
   * enough to cover somebody re-reading it, deciding the number is wrong and
   * saying so — and far short of the gap between two activities anyone would
   * actually do in one day.
   */
  const EDIT_WINDOW_MIN = 20;
  let dayIdNew: string;
  // BUG A — CORRECTING A LOGGED ACTIVITY USED TO LOG IT TWICE.
  //
  // Jennifer Day, 30 Jul: two complete days + scheduled_workouts + workout_logs
  // triples, 52 SECONDS apart, both marked completed — "Baby Stroller Walk"
  // 45 min and "Baby Stroller Walk" 120 min. She logged 45, realised it was
  // wrong, and said 120. Her day now reads 165 minutes across two sessions.
  // She did one walk.
  //
  // There is no edit endpoint and there never was: correcting an activity means
  // re-running this route, and this route only ever inserted. So every
  // correction anybody has made since the feature shipped is sitting in the
  // data as a second session, quietly inflating their adherence and volume.
  //
  // WHEN IS A SECOND CALL A CORRECTION, AND WHEN IS IT A SECOND WALK? That is
  // the whole question, and getting it wrong in the permissive direction
  // deletes a real session. Two signals, either one is enough:
  //
  //   · the SAME activity name on the same day — "I said 45, I meant 120"; the
  //     title matching is what makes it the same thing rather than a new one;
  //   · anything logged within EDIT_WINDOW_MIN — a correction made while the
  //     screen is still open, whatever the model chose to call it. Dustin's
  //     6 Aug case needed this one: his edit changed the movement name too
  //     (Outdoor Walk → Walk (2 Miles)), so a title match alone would have
  //     missed it.
  //
  // Two genuinely different activities — a morning walk and an evening bike —
  // have different names and are hours apart, so they still get their own row.
  let reusedDayId: string | null = null;
  if (mode === "activity") {
    try {
      const { data: prior } = await admin
        .from("days")
        .select("id, label, created_at")
        .eq("client_owner_id", clientId)
        .eq("origin", "ai_activity")
        .order("created_at", { ascending: false })
        .limit(12);
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const cutoff = Date.now() - EDIT_WINDOW_MIN * 60_000;
      for (const p of ((prior as { id: string; label: string | null; created_at: string }[] | null) || [])) {
        // Only rows already scheduled for TODAY are candidates. Yesterday's
        // walk is not a draft of today's.
        const { data: sw } = await admin
          .from("scheduled_workouts")
          .select("id")
          .eq("client_id", clientId)
          .eq("day_id", p.id)
          .eq("scheduled_date", today)
          .is("deleted_at", null)
          .limit(1);
        if (!sw || !sw.length) continue;
        const sameName = norm(p.label || "") === norm(workout.title);
        const justNow = Date.parse(p.created_at) >= cutoff;
        if (sameName || justNow) { reusedDayId = p.id; break; }
      }
    } catch {
      // Never block a client's log over the de-duplication. Worst case is the
      // old behaviour, which is a duplicate — recoverable. A thrown error here
      // would lose the session entirely, which is not.
    }
  }
  try {
    if (reusedDayId) {
      // Rewrite the contents in place. sections cascade-delete their
      // prescribed_exercises, and activity days carry no set_logs (verified:
      // zero across every ai_activity day), so nothing logged is lost.
      dayIdNew = reusedDayId;
      const { error: labelErr } = await admin.from("days").update({ label: workout.title }).eq("id", dayIdNew);
      if (labelErr) throw labelErr;
      // The clear-before-rewrite. This one is not cosmetic: unchecked, a failed
      // delete followed by successful inserts leaves the OLD sections AND the
      // new ones on the same day, and the client opens a doubled workout that
      // the response has just told them was created. Both errors now reach the
      // catch below, which is the path that already exists and already says
      // "Designed the workout but couldn't save it".
      const { error: clearErr } = await admin.from("sections").delete().eq("day_id", dayIdNew);
      if (clearErr) throw clearErr;
    } else {
    const { data: posRow } = await admin.from("days").select("position").eq("phase_id", phaseId).order("position", { ascending: false }).limit(1);
    const nextPos = ((posRow && posRow[0] ? (posRow[0] as { position: number }).position : 0) || 0) + 1;
    const { data: dayRow, error: dayErr } = await admin.from("days").insert({
      phase_id: phaseId, label: workout.title, position: nextPos, swappable: false,
      client_owner_id: clientId, created_by: "client_ai", origin: originMap[mode] || "ai",
    }).select("id").single();
    if (dayErr || !dayRow) throw dayErr || new Error("day insert failed");
    dayIdNew = (dayRow as { id: string }).id;
    }

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
        // Checked like its two parents. Unchecked, an exercise the AI designed
        // and the RESPONSE still describes — the reply hands back every section
        // and exercise verbatim — simply is not in the workout the client
        // opens. Nothing about a short workout looks wrong.
        const { error: peErr } = await admin.from("prescribed_exercises").insert({
          section_id: secId, exercise_id: exId, position: pPos++, sets: ex.sets,
          volume_type: t.volume_type, volume_value: t.volume_value, tracked_fields: t.tracked,
          cue: ex.note, load_descriptor: null,
        });
        if (peErr) throw peErr;
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
      // A CORRECTION UPDATES THE EXISTING LOG. It does not add a second one.
      // This is the half of Bug A that actually corrupts the numbers: streaks
      // and session counts read workout_logs, so a duplicate row is a session
      // the client did not do, counted forever. Jennifer's 30 Jul reads 165
      // minutes across two walks; she took one.
      let existingLogId: string | null = null;
      if (reusedDayId) {
        const { data: prevLog } = await admin
          .from("workout_logs")
          .select("id")
          .eq("client_id", clientId)
          .eq("day_id", dayIdNew)
          .eq("log_date", today)
          .order("started_at", { ascending: true })
          .limit(1);
        existingLogId = ((prevLog as { id: string }[] | null) || [])[0]?.id ?? null;
      }

      let wl: { id: string } | null = null;
      if (existingLogId) {
        const { error: upErr } = await admin
          .from("workout_logs")
          .update({
            completed: true, completed_at: new Date().toISOString(),
            status: "Done as planned", note: workout.focus || null,
          })
          .eq("id", existingLogId);
        if (upErr) throw upErr;
        wl = { id: existingLogId };
      } else {
        const { data: inserted, error: wlErr } = await admin.from("workout_logs").insert({
          client_id: clientId, day_id: dayIdNew, log_date: today, started_at: new Date().toISOString(),
          completed: true, completed_at: new Date().toISOString(), status: "Done as planned", source: "client",
          note: workout.focus || null,
        }).select("id").single();
        if (wlErr) throw wlErr;
        wl = inserted as { id: string } | null;
      }
      // Same for the schedule row. A second insert here would also violate
      // uq_scheduled_workout_one_per_day (client_id, day_id, scheduled_date)
      // WHERE deleted_at IS NULL — so on a reuse this is an update by
      // necessity as well as by correctness.
      //
      // NOT converted to a throw, deliberately. The workout_logs write above
      // has already landed by this point, so failing the request here would
      // tell the client nothing was logged when a completed session exists —
      // swapping one wrong answer for another. What these needed was to be
      // CAPABLE of reporting: a PostgREST call returns its error rather than
      // throwing, so the catch on this block has never seen one of these and
      // the console line it exists to produce has never fired.
      //
      // This is the unfixed half of the bug described at the top of this
      // block. Streaks and session counts read workout_logs; the weekly
      // done-count reads scheduled_workouts. That half was fixed; this half
      // can still leave the two disagreeing — now at least it says so in the
      // log. Making it right needs a decision about what to tell the client
      // when only half landed, and this file is a workout surface, so that is
      // Dustin's call, not a 3am one. Written up in the overnight doc.
      if (reusedDayId) {
        const { error: schedErr } = await admin.from("scheduled_workouts")
          .update({ status: "completed", workout_log_id: wl?.id ?? null, updated_at: new Date().toISOString() })
          .eq("client_id", clientId).eq("day_id", dayIdNew).eq("scheduled_date", today)
          .is("deleted_at", null);
        if (schedErr) console.error("workout-ai: log landed but schedule row not completed —", schedErr.message);
      } else {
        const { error: schedErr } = await admin.from("scheduled_workouts").insert({
          client_id: clientId, day_id: dayIdNew, scheduled_date: today, status: "completed",
          workout_log_id: wl ? (wl as { id: string }).id : null, source: "client_self_assign",
        });
        if (schedErr) console.error("workout-ai: log landed but no schedule row —", schedErr.message);
      }
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
        // This retirement IS the adherence-denominator fix described above. If
        // it fails quietly the "3 attempts + 1 completed reads as 25% instead
        // of 1/1" bug comes straight back with nothing to show for it, which is
        // how it went unnoticed the first time.
        const { error: retireErr } = await admin.from("scheduled_workouts").update({ status: "skipped" })
          .eq("client_id", clientId).eq("scheduled_date", today).eq("status", "scheduled")
          .eq("source", "client_self_assign").is("deleted_at", null)
          .in("day_id", priorAiDayIds);
        if (retireErr) console.error("workout-ai: earlier AI attempts NOT retired, adherence will read low —", retireErr.message);
      }
      const { error: schedErr } = await admin.from("scheduled_workouts").insert({
        client_id: clientId, day_id: dayIdNew, scheduled_date: today, status: "scheduled", source: "client_self_assign",
      });
      if (schedErr) console.error("workout-ai: replacement built but not scheduled —", schedErr.message);
      if (body.dayId) {
        // deleted_at guard: never resurrect a workout the client already deleted.
        const { error: skipErr } = await admin.from("scheduled_workouts").update({ status: "skipped" })
          .eq("client_id", clientId).eq("day_id", body.dayId).eq("scheduled_date", today).eq("status", "scheduled")
          .is("deleted_at", null);
        if (skipErr) console.error("workout-ai: original workout NOT marked replaced —", skipErr.message);
      }
    }
  } catch (e) { console.error("workout-ai schedule error", e); }

  // ─── notify the trainer (self-serve + notified) ───
  try {
    // THIS client's coach. It used to search the CLIENTS table for
    // `email = TRAINER_EMAIL OR name ILIKE '%Dustin%'` — two owner-shaped
    // guesses, both of which send Stephanie's client's "I built my own workout"
    // notice to Dustin instead of to her.
    const trainerAuth = await inboxAuthUidForClient(admin, clientId);
    if (trainerAuth && scope.userId && trainerAuth !== scope.userId) {
      const verb = mode === "activity" ? "logged an extra activity" : mode === "equipment" ? "AI-built a workout from available equipment" : "AI-replaced today's workout";
      const { error: notifyErr } = await admin.from("messages").insert({
        from_id: scope.userId, to_id: trainerAuth, client_id: clientId, is_group: false,
        // The app wrote this, not the client whose id is on from_id. It only
        // goes to Dustin so the stakes are lower than the client nudges — but
        // it is the same rule, and an exception is how a rule erodes.
        sender_kind: "coachbot",
        body: `🤖 [AI Workout] ${verb}: "${workout.title}". ${workout.rationale || workout.focus || ""}`.trim().slice(0, 500),
      });
      // Best-effort by design — a client's workout must not fail because the
      // trainer's inbox did. But it has to be able to SAY so: this insert
      // returns its error rather than throwing, so the catch below has never
      // seen a failed notification and "Dustin was told" was an assumption,
      // never a fact.
      if (notifyErr) console.error("workout-ai: trainer NOT notified —", notifyErr.message);
    }
  } catch (e) { console.error("workout-ai notify threw", e); }

  return NextResponse.json({
    ok: true, dayId: dayIdNew, mode, logged,
    workout: { title: workout.title, focus: workout.focus, rationale: workout.rationale, duration_min: workout.duration_min, sections: workout.sections },
  });
}
