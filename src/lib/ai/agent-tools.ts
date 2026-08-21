// The trainer agent's tools.
//
// Split out of the route because the route was 211 lines with six tools and is
// now carrying eighteen. The route owns the conversation loop and the metering;
// this file owns what the agent can actually see and do.
//
// THE RULES EVERY WRITE TOOL FOLLOWS
//
// 1. Go through the app's own safe paths, never straight at the tables. The
//    workout writer clones a library day into a client-owned copy before
//    editing so the master library cannot be corrupted; macro targets are a new
//    dated row so history survives; messages go through the same insert shape
//    the messaging UI uses.
//
// 2. Anything the calendar owns is written to GOOGLE, not to `appointments`.
//    The sync treats Google as the source of truth and reconciles away future
//    rows whose event has vanished, so an appointment written straight to the
//    table would be deleted by the next sync — silently, and after Dustin had
//    been told it was booked. Payments are computed from those rows. This is
//    the single most dangerous thing in the app to get wrong.
//
// 3. Every write logs to ai_action_log with what it would take to reverse it.
//    The agent executes without a confirmation step, which is right when Dustin
//    is between clients — but only if a mistake is cheap to take back.

import Anthropic from "@anthropic-ai/sdk";
import { Db } from "@/lib/ai/scope";
import { applyProposal, loadDayTree, CT_TODAY, Proposal, type WorkoutUndoStep } from "@/lib/ai/workoutAdjust";
import { assembleCoachContext, assembleTrainingContext } from "@/lib/ai/coach-context";
import { getValidAccessToken, gcalFetch } from "@/lib/gcal";
import { ownerAuthUid, inboxAuthUidForClient } from "@/lib/trainerResolve";

// ── Read-only surface for the general query tool ────────────────────────────
//
// Not raw SQL. A SQL tool on a service-role connection is one hallucinated
// `delete from clients` away from a very bad afternoon, and no amount of prompt
// instruction makes that safe. This is a fixed allow-list of tables the agent
// may SELECT from, so the worst case is reading something dull.
//
// Everything sensitive is absent by construction: no trainer_settings (Google
// refresh tokens), no app_scheduler_key, no auth schema, no device_tokens.
const READABLE = new Set([
  "clients", "appointments", "scheduled_workouts", "workout_logs", "set_logs",
  "metrics", "skinfold_logs", "macro_targets", "meal_adherence_logs",
  "daily_logs", "cardio_logs", "exercise_notes", "programs", "phases", "days",
  "program_assignments", "exercises", "prescribed_exercises", "sections",
  "payment_reminders", "calendar_payments", "billing_adjustments",
  "group_challenges", "challenge_participants", "client_app_settings",
  "client_program_feedback", "schedule_change_proposals", "messages",
  "ai_usage_daily", "ai_usage_monthly", "ai_action_log", "food_catalog",
]);

export const TRAINER_TOOLS: Anthropic.Tool[] = [
  // ── read ──────────────────────────────────────────────────────────────────
  { name: "find_clients", description: "Find clients by name (partial, case-insensitive). Omit query to list all clients. Returns id, name, primary_goal.", input_schema: { type: "object", properties: { query: { type: "string" } } } },
  { name: "client_overview", description: "Full snapshot of one client: profile, goals, injuries, latest weight/body-fat + trend, active program + phase, macro targets, adherence/streak.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "client_workouts", description: "Upcoming scheduled workouts with full exercise detail — includes the SW-id, section_id and pe_id needed to adjust them.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "client_nutrition", description: "Live meal plan, macro targets, recent daily totals and averages vs targets.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "client_schedule", description: "A client's appointments (from Google Calendar) in a date range. Returns the appointment id and gcal_event_id needed to move or cancel.", input_schema: { type: "object", properties: { client_id: { type: "string" }, from: { type: "string", description: "YYYY-MM-DD, default today" }, to: { type: "string", description: "YYYY-MM-DD, default +28 days" } }, required: ["client_id"] } },
  { name: "read_messages", description: "Read message threads. With client_id: that conversation. With scope 'group': the group chat. With neither: the newest message from every thread, newest first.", input_schema: { type: "object", properties: { client_id: { type: "string" }, scope: { type: "string", enum: ["client", "group", "inbox"] }, limit: { type: "number" } } } },
  { name: "query_table", description: "Read any row from an allow-listed table with simple equality filters. Use when no other tool answers the question. Returns at most 200 rows.", input_schema: { type: "object", properties: {
    table: { type: "string", description: "table name; ask query_tables if unsure" },
    columns: { type: "string", description: "comma-separated, or * for all" },
    where: { type: "object", description: "column → value equality filters", additionalProperties: true },
    order_by: { type: "string" }, descending: { type: "boolean" }, limit: { type: "number" },
  }, required: ["table"] } },
  { name: "query_tables", description: "List the tables query_table is allowed to read.", input_schema: { type: "object", properties: {} } },

  // ── write ─────────────────────────────────────────────────────────────────
  { name: "adjust_workout", description: "Change a client's scheduled workout (swap/modify/remove/add exercises). Clones a library day into a client-owned copy — never edits the master library.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, scheduled_workout_id: { type: "string" },
    scope: { type: "string", enum: ["one", "series"] }, summary: { type: "string" },
    changes: { type: "array", items: { type: "object", properties: {
      op: { type: "string", enum: ["swap", "modify", "remove", "add"] },
      pe_id: { type: "string" }, section_id: { type: "string" },
      to_exercise: { type: "string" }, exercise: { type: "string" },
      type: { type: "string", enum: ["weight", "reps", "time"] },
      sets: { type: "number" }, reps: { type: "string" }, load: { type: "string" }, duration: { type: "string" }, note: { type: "string" },
    }, required: ["op"] } },
  }, required: ["client_id", "scheduled_workout_id", "scope", "changes", "summary"] } },
  { name: "set_macro_targets", description: "Set a client's daily macro targets. Creates a new dated version effective today; history is kept.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, calories: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fats: { type: "number" }, rationale: { type: "string" },
  }, required: ["client_id", "calories", "protein", "carbs", "fats"] } },
  { name: "send_message", description: "Send a message as the trainer using this app — to one of their clients, or to the whole group. Say what you are about to send and get their go-ahead first unless they have clearly already asked for it.", input_schema: { type: "object", properties: {
    client_id: { type: "string", description: "omit for the group" },
    body: { type: "string" },
    group: { type: "boolean", description: "true = group chat" },
    announcement: { type: "boolean", description: "group only: mark as a broadcast, which gives every client a full-screen takeover once" },
  }, required: ["body"] } },
  { name: "book_session", description: "Book a new training session. Writes the event to GOOGLE CALENDAR (the source of truth) — the next sync brings it into the app. Times are America/Chicago.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" },
    start_time: { type: "string", description: "HH:MM, 24h, Central" }, duration_minutes: { type: "number", description: "default 60" },
    title: { type: "string", description: "defaults to the client's name" },
  }, required: ["client_id", "date", "start_time"] } },
  { name: "move_workout", description: `Move a client's WORKOUT to a different date (not a calendar appointment — that is move_session). ANY workout can go to ANY date: past or future, scheduled or completed, logged or not, even one in progress. There are NO restrictions — never refuse one or tell them to do it by hand. Use client_workouts for the SW-id.`, input_schema: { type: "object", properties: {
    scheduled_workout_id: { type: "string" },
    to_date: { type: "string", description: "YYYY-MM-DD" },
  }, required: ["scheduled_workout_id", "to_date"] } },
  { name: "move_session", description: "Move an existing session to a new date/time. Edits the GOOGLE event; the sync follows. Use client_schedule to get gcal_event_id.", input_schema: { type: "object", properties: {
    gcal_event_id: { type: "string" }, date: { type: "string" }, start_time: { type: "string" }, duration_minutes: { type: "number" },
  }, required: ["gcal_event_id", "date", "start_time"] } },
  { name: "cancel_session", description: "Cancel a session. Colours the GOOGLE event orange (the app's cancelled marker) rather than deleting it, so the cancellation stays visible and billing can see it.", input_schema: { type: "object", properties: {
    gcal_event_id: { type: "string" }, reason: { type: "string" },
  }, required: ["gcal_event_id"] } },
  { name: "record_metric", description: "Record a weigh-in / body composition entry for a client on a date.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD, default today" },
    weight: { type: "number" }, body_fat_pct: { type: "number" }, lean_mass: { type: "number" }, fat_mass: { type: "number" },
  }, required: ["client_id"] } },
  { name: "update_client", description: "Update a client's profile fields. Only the fields you pass are changed.", input_schema: { type: "object", properties: {
    client_id: { type: "string" },
    primary_goal: { type: "string" }, secondary_goals: { type: "string" }, injuries: { type: "string" },
    injuries_limitations: { type: "string" }, medical_notes: { type: "string" }, notes: { type: "string" },
    append_note: { type: "string", description: "append a dated line to notes instead of replacing them — usually what you want" },
    experience_level: { type: "string" }, days_per_week: { type: "number" }, training_frequency: { type: "string" },
    session_rate: { type: "number" }, weekly_focus: { type: "string" },
  }, required: ["client_id"] } },
  { name: "assign_program", description: "Assign a program to a client, optionally starting at a named phase. Deactivates their current assignment.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, program_id: { type: "string" }, phase_id: { type: "string" },
  }, required: ["client_id", "program_id"] } },
  { name: "advance_phase", description: "Move a client to the next phase of their current program, or to a named phase.", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, phase_id: { type: "string", description: "omit to advance to the next phase by position" },
  }, required: ["client_id"] } },
  { name: "list_programs", description: "Programs and their phases, with the ids assign_program and advance_phase need.", input_schema: { type: "object", properties: { query: { type: "string" } } } },

  // ── undo ──────────────────────────────────────────────────────────────────
  { name: "recent_actions", description: "What the agent has changed recently, newest first, with ids for undo.", input_schema: { type: "object", properties: { limit: { type: "number" } } } },
  { name: "undo_action", description: "Reverse a previous action. Omit action_id to undo the most recent one that has not already been undone.", input_schema: { type: "object", properties: { action_id: { type: "string" } } } },
];

// ── helpers ─────────────────────────────────────────────────────────────────

interface UndoPayload { kind: string; [k: string]: unknown }

/**
 * Run a write and THROW when it fails.
 *
 * A PostgREST call RETURNS its error; it does not throw. So a try/catch wrapped
 * around one catches nothing, and the code inside reads as guarded while being
 * completely unguarded. That is not hypothetical here: the entire undo block
 * below is written as a try/catch over these calls, so every failed undo fell
 * out of the bottom and answered "Undone: …" — the agent telling Dustin a
 * change had been reversed when nothing had happened. This file's own comment,
 * three branches into that block, says the quiet part: "the undo would silently
 * do nothing and report success — which is worse than not offering undo at all."
 *
 * Rather than rewrite every branch to destructure and return, this makes the
 * calls behave the way the surrounding code already assumes they behave.
 */
async function must<T extends { error: { message: string } | null }>(
  q: PromiseLike<T>,
  what: string,
): Promise<T> {
  const r = await q;
  if (r.error) throw new Error(`${what} — ${r.error.message}`);
  return r;
}

async function logAction(db: Db, action: string, clientId: string | null, summary: string, undo: UndoPayload | null): Promise<void> {
  try {
    // Captured, not merely wrapped: the catch below could never see a failed
    // insert, so the console line it exists to produce has never once fired.
    // The consequence is specific — no row means `undo_action` can never
    // reverse this change, and nobody finds out until they try to.
    const { error } = await db.from("ai_action_log").insert({ action, client_id: clientId, summary, undo });
    if (error) console.error("agent: action log failed —", error.message);
  } catch (e) {
    // Never fail a completed write because the audit row did not land. The
    // change already happened; losing the undo record is bad, pretending the
    // change failed is worse.
    console.error("agent: action log threw", e);
  }
}

const COLOR_CANCELLED = "6"; // orange — the app reads this as cancelled_client

function ctIso(date: string, time: string, minutes: number): { start: string; end: string } {
  // Central offset without a tz library: America/Chicago is -05:00 on CDT and
  // -06:00 on CST. Ask the runtime which one applies on THAT date rather than
  // hardcoding, or every booking in the wrong half of the year lands an hour out.
  const probe = new Date(`${date}T12:00:00Z`);
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "short" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value;
  const offset = tzName === "CDT" ? "-05:00" : "-06:00";
  const start = `${date}T${time.length === 5 ? time : time.slice(0, 5)}:00${offset}`;
  const endMs = Date.parse(start) + Math.max(15, minutes) * 60000;
  const end = new Date(endMs).toISOString();
  return { start, end };
}

// ── executor ────────────────────────────────────────────────────────────────

// ── WHOSE AGENT IS THIS ─────────────────────────────────────────────────────
//
// `execTrainerTool` runs on the SERVICE ROLE, which bypasses row-level security
// completely, and its only gate was `scope.isTrainer` — a boolean. With one
// trainer that was the same question as "is this Dustin". With two it means any
// trainer can ask the agent to list `payment_reminders` and get the other
// trainer's entire book, RLS or no RLS. Dustin, 20 Aug: "there can be no
// crossover on payments and payment reminders."
//
// So the caller has to say who they are. Required, not optional: an optional
// parameter here is a parameter somebody forgets, and forgetting it would
// restore the exact hole this closes.
export interface ToolCaller {
  /** The caller's row in `trainers`. Null only if they are not a trainer at all. */
  trainerId: string | null;
  /** Their auth account — this decides WHOSE Google Calendar the agent books on. */
  authUserId: string;
  /** The owner runs the business and sees all of it. */
  isOwner: boolean;
}

// Tables in READABLE that carry a client_id, and are therefore filterable to a
// trainer's own roster. Verified against information_schema, not assumed.
const CLIENT_SCOPED_TABLES = new Set([
  "appointments", "scheduled_workouts", "workout_logs", "set_logs", "metrics",
  "skinfold_logs", "macro_targets", "meal_adherence_logs", "daily_logs",
  "cardio_logs", "exercise_notes", "program_assignments", "payment_reminders",
  "calendar_payments", "billing_adjustments", "challenge_participants",
  "client_app_settings", "client_program_feedback", "schedule_change_proposals",
  "messages", "ai_usage_daily", "ai_action_log",
]);

// Tables with no client dimension at all: the shared exercise library, the
// programme skeleton, the food catalogue, the group challenges. Shared on
// purpose — Dustin, 20 Aug, on the library: "yes same library".
const SHARED_TABLES = new Set([
  "programs", "phases", "days", "exercises", "prescribed_exercises", "sections",
  "group_challenges", "food_catalog", "ai_usage_monthly",
]);

export async function execTrainerTool(db: Db, name: string, input: Record<string, unknown>, caller: ToolCaller): Promise<string> {
  const str = (k: string): string => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const num = (k: string): number | null => (input[k] == null || input[k] === "" ? null : Number(input[k]));

  // The caller's own roster, fetched at most once per tool call.
  let rosterIds: string[] | null = null;
  async function myClientIds(): Promise<string[]> {
    if (rosterIds) return rosterIds;
    const { data } = await db.from("clients").select("id").eq("trainer_id", caller.trainerId);
    rosterIds = ((data as { id: string }[] | null) || []).map((c) => c.id);
    return rosterIds;
  }

  try {
    // ── reads ───────────────────────────────────────────────────────────────
    if (name === "find_clients") {
      const q = str("query");
      let query = db.from("clients").select("id, name, primary_goal").is("archived_at", null).order("name").limit(60);
      if (q) query = db.from("clients").select("id, name, primary_goal").ilike("name", `%${q}%`).is("archived_at", null).order("name").limit(60);
      // A trainer's roster is their own. The owner's is the whole business.
      if (!caller.isOwner) query = query.eq("trainer_id", caller.trainerId);
      const { data } = await query;
      return JSON.stringify(data || []);
    }

    if (name === "query_tables") {
      return JSON.stringify([...READABLE].sort());
    }

    if (name === "query_table") {
      const table = str("table");
      if (!READABLE.has(table)) {
        return `Error: "${table}" is not readable. Allowed: ${[...READABLE].sort().join(", ")}`;
      }
      const cols = str("columns") || "*";
      let q = db.from(table).select(cols);
      // The scope, applied before any caller-supplied filter so nothing they
      // pass can widen it. Refuses rather than guessing on an unclassified
      // table: a new table added to READABLE and forgotten here must fail
      // closed, not quietly return the whole business.
      if (!caller.isOwner) {
        if (table === "clients") {
          q = q.eq("trainer_id", caller.trainerId);
        } else if (CLIENT_SCOPED_TABLES.has(table)) {
          q = q.in("client_id", await myClientIds());
        } else if (!SHARED_TABLES.has(table)) {
          return `Error: "${table}" is not readable from your account.`;
        }
      }
      const where = (input.where && typeof input.where === "object" ? input.where : {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(where)) {
        if (v === null) q = q.is(k, null);
        else q = q.eq(k, v as string | number | boolean);
      }
      const orderBy = str("order_by");
      if (orderBy) q = q.order(orderBy, { ascending: input.descending !== true });
      const lim = Math.min(200, Math.max(1, Number(input.limit) || 50));
      const { data, error } = await q.limit(lim);
      if (error) return `Query error: ${error.message}`;
      return JSON.stringify(data || []);
    }

    if (name === "read_messages") {
      const scope = str("scope") || (str("client_id") ? "client" : "inbox");
      const lim = Math.min(100, Math.max(1, Number(input.limit) || 25));

      if (scope === "group") {
        const { data } = await db.from("messages").select("id, from_id, body, created_at, is_broadcast")
          .eq("is_group", true).is("deleted_at", null).order("created_at", { ascending: false }).limit(lim);
        return JSON.stringify(data || []);
      }
      if (scope === "client") {
        const cid = str("client_id");
        if (!cid) return "Error: client_id required for scope 'client'.";
        const { data } = await db.from("messages").select("id, from_id, to_id, body, created_at, read_at")
          .eq("client_id", cid).eq("is_group", false).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(lim);
        return JSON.stringify(data || []);
      }
      // inbox: newest message per client thread
      const { data: rows } = await db.from("messages")
        .select("id, client_id, body, created_at, read_at, clients(name)")
        .eq("is_group", false).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(300);
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const m of ((rows as { client_id: string | null }[]) || [])) {
        const key = m.client_id || "none";
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
        if (out.length >= lim) break;
      }
      return JSON.stringify(out);
    }

    if (name === "client_schedule") {
      const cid = str("client_id");
      if (!cid) return "Error: client_id required.";
      const from = str("from") || CT_TODAY();
      const to = str("to") || new Date(Date.parse(from) + 28 * 86400000).toISOString().slice(0, 10);
      const { data } = await db.from("appointments")
        .select("id, scheduled_at, ends_at, status, title, gcal_event_id, gcal_recurring_id")
        .eq("client_id", cid).gte("scheduled_at", from).lte("scheduled_at", to + "T23:59:59")
        .order("scheduled_at").limit(60);
      return JSON.stringify(data || []);
    }

    const clientId = str("client_id");
    // One guard for every tool that names a client. Placed here rather than
    // repeated per tool so a new tool cannot be added without it.
    if (clientId && !caller.isOwner) {
      const mine = await myClientIds();
      if (!mine.includes(clientId)) return "Error: that client is not on your roster.";
    }

    if (name === "client_overview") {
      if (!clientId) return "Error: client_id required.";
      const [profRes, mRes, apRes, mtRes] = await Promise.all([
        db.from("clients").select("name, email, date_of_birth, experience_level, primary_goal, secondary_goals, training_frequency, days_per_week, injuries_limitations, injuries, current_weight, current_body_fat_pct, notes, start_date, session_rate").eq("id", clientId).maybeSingle(),
        db.from("metrics").select("metric_date, weight, body_fat_pct").eq("client_id", clientId).order("metric_date", { ascending: false }).limit(6),
        db.from("program_assignments").select("program_id, current_phase_id, programs(name, phases(id, label, position))").eq("client_id", clientId).eq("active", true).limit(1).maybeSingle(),
        db.from("macro_targets").select("calories, protein, carbs, fats, effective_date").eq("client_id", clientId).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const training = await assembleTrainingContext(db, clientId);
      return JSON.stringify({ profile: profRes.data, recent_metrics: mRes.data, active_program: apRes.data, macro_targets: mtRes.data, training_context: training });
    }

    if (name === "client_workouts") {
      if (!clientId) return "Error: client_id required.";
      const today = CT_TODAY();
      // PAST AND EVERY STATUS. It used to be `.eq("status","scheduled")` and
      // `.gte(today)`, which meant a session from yesterday — finished or not —
      // did not exist as far as the assistant was concerned. That is how you get
      // an assistant that cannot act on "move Bobbie's Friday cardio", and,
      // worse, one that explains its way around the gap instead of naming it.
      const from = new Date(Date.parse(`${today}T12:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10);
      const { data: sws } = await db.from("scheduled_workouts").select("id, scheduled_date, status, day_id").eq("client_id", clientId).is("deleted_at", null).gte("scheduled_date", from).order("scheduled_date").limit(30);
      const out: string[] = [];
      for (const sw of ((sws as { id: string; scheduled_date: string; status: string | null; day_id: string }[]) || [])) {
        const day = await loadDayTree(db, sw.day_id);
        out.push(`[SW-id ${sw.id}] ${sw.scheduled_date} — ${day?.label || "workout"}${sw.status && sw.status !== "scheduled" ? ` (${sw.status})` : ""}`);
        for (const s of (day?.sections || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
          out.push(`  Section "${s.client_facing_name || s.internal_name}" (section_id ${s.id}):`);
          for (const pe of (s.prescribed_exercises || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
            out.push(`    - [pe_id ${pe.id}] ${pe.exercises?.name || "exercise"} ${pe.sets ?? ""}x${pe.volume_value ?? ""}${pe.load_descriptor ? ` (${pe.load_descriptor})` : ""}${pe.cue ? ` — ${pe.cue}` : ""}`);
          }
        }
      }
      return out.length ? out.join("\n") : "No workouts in the last 14 days or scheduled ahead.";
    }

    if (name === "client_nutrition") {
      if (!clientId) return "Error: client_id required.";
      return await assembleCoachContext(db, clientId);
    }

    if (name === "list_programs") {
      const q = str("query");
      let sel = db.from("programs").select("id, name, category, status, phases(id, label, position)").order("name").limit(60);
      if (q) sel = db.from("programs").select("id, name, category, status, phases(id, label, position)").ilike("name", `%${q}%`).order("name").limit(60);
      const { data } = await sel;
      return JSON.stringify(data || []);
    }

    if (name === "recent_actions") {
      const lim = Math.min(50, Math.max(1, Number(input.limit) || 10));
      const { data } = await db.from("ai_action_log")
        .select("id, created_at, action, summary, undone_at, clients(name)")
        .order("created_at", { ascending: false }).limit(lim);
      return JSON.stringify(data || []);
    }

    // ── writes ──────────────────────────────────────────────────────────────
    if (name === "adjust_workout") {
      if (!clientId) return "Error: client_id required.";
      const proposal: Proposal = {
        scheduled_workout_id: str("scheduled_workout_id"),
        reason: "", summary: str("summary"),
        changes: Array.isArray(input.changes) ? (input.changes as Proposal["changes"]) : [],
      };
      const scope = input.scope === "series" ? "series" : "one";
      const res = await applyProposal(db, clientId, proposal, scope);
      // Workout edits used to be the one thing here with no way back — "there
      // is no faithful inverse". There is: applyProposal now records the prior
      // state of every row it touches, or, when it cloned the day, the two
      // steps that put the sessions back on the original and drop the copy.
      // Dustin's first requirement of this agent was "anything you can do in
      // the app, with undo on all of it"; programming was the gap in "all".
      await logAction(db, "adjust_workout", clientId, `${proposal.summary} (${scope})`, res.undo);
      return res.message + (res.undo ? " Say \"undo that\" if it is not right." : "");
    }

    if (name === "set_macro_targets") {
      if (!clientId) return "Error: client_id required.";
      const today = CT_TODAY();
      const { data: prev } = await db.from("macro_targets").select("id, calories, protein, carbs, fats, effective_date")
        .eq("client_id", clientId).order("effective_date", { ascending: false }).limit(1).maybeSingle();
      const row = {
        client_id: clientId,
        calories: Math.round(Number(input.calories) || 0),
        protein: Math.round(Number(input.protein) || 0),
        carbs: Math.round(Number(input.carbs) || 0),
        fats: Math.round(Number(input.fats) || 0),
        effective_date: today,
        rationale: str("rationale") || null,
      };
      const { data: inserted, error } = await db.from("macro_targets").insert(row).select("id").maybeSingle();
      if (error) return `Error setting macro targets: ${error.message}`;
      await logAction(db, "set_macro_targets", clientId,
        `Macros → ${row.calories} kcal, ${row.protein}P/${row.carbs}C/${row.fats}F`,
        { kind: "macro_targets", inserted_id: (inserted as { id: string } | null)?.id, previous: prev });
      return `Set macro targets effective ${today}: ${row.calories} kcal, ${row.protein}P / ${row.carbs}C / ${row.fats}F.`;
    }

    if (name === "send_message") {
      const body = str("body");
      if (!body) return "Error: body required.";
      const isGroup = input.group === true || (!clientId && input.group !== false);

      // WHOSE account this is sent from. It used to be
      // `trainer_settings.select("user_id").limit(1)` for both branches, which
      // is one row only while one trainer has a calendar connected.
      //
      // The two branches want different answers. The group chat is shared by
      // decision, so it posts as the OWNER. A direct message is from that
      // client's own coach — sending it from the other trainer's account puts a
      // stranger's name on it and files the thread in the wrong inbox.
      //
      // Written as an if/else rather than a ternary: the conditional form made
      // tsc give up with "type instantiation is excessively deep", because both
      // arms carry the full generic supabase client type through inference.
      //
      // Written as an if/else rather than a ternary: the conditional form made
      // tsc give up with "type instantiation is excessively deep", because both
      // arms carry the full generic supabase client type through inference.
      let trainerUid: string | null;
      if (isGroup) trainerUid = await ownerAuthUid(db);
      else trainerUid = await inboxAuthUidForClient(db, clientId);
      if (!trainerUid) return "Error: trainer account not found.";

      if (isGroup) {
        const announcement = input.announcement === true;
        const { data: m, error } = await db.from("messages")
          .insert({ from_id: trainerUid, to_id: trainerUid, client_id: null, body, is_group: true, is_broadcast: announcement })
          .select("id").maybeSingle();
        if (error) return `Error sending: ${error.message}`;
        await logAction(db, "send_message", null, `Group${announcement ? " announcement" : ""}: ${body.slice(0, 80)}`,
          { kind: "message", message_id: (m as { id: string } | null)?.id });
        return `Sent to the group${announcement ? " as an announcement (every client gets a full-screen takeover once)" : ""}.`;
      }

      if (!clientId) return "Error: client_id required for a direct message.";
      const { data: c } = await db.from("clients").select("name, auth_user_id").eq("id", clientId).maybeSingle();
      const to = (c as { auth_user_id: string | null } | null)?.auth_user_id;
      if (!to) return "Error: that client has no app account yet, so they cannot receive a message.";
      const { data: m, error } = await db.from("messages")
        .insert({ from_id: trainerUid, to_id: to, client_id: clientId, body, is_group: false, is_broadcast: false })
        .select("id").maybeSingle();
      if (error) return `Error sending: ${error.message}`;
      await logAction(db, "send_message", clientId,
        `DM to ${(c as { name: string }).name}: ${body.slice(0, 80)}`,
        { kind: "message", message_id: (m as { id: string } | null)?.id });
      return `Sent to ${(c as { name: string }).name}.`;
    }

    if (name === "book_session") {
      if (!clientId) return "Error: client_id required.";
      const date = str("date");
      const time = str("start_time");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}/.test(time)) return "Error: date must be YYYY-MM-DD and start_time HH:MM.";
      const { data: c } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
      const clientName = (c as { name: string } | null)?.name;
      if (!clientName) return "Error: client not found.";

      const { start, end } = ctIso(date, time, Number(input.duration_minutes) || 60);
      const { token } = await getValidAccessToken(caller.authUserId);
      const created = await gcalFetch(token, "/calendars/primary/events", {
        method: "POST",
        body: JSON.stringify({
          // The title MUST contain the client's name — that is how the sync
          // matches an event back to a client. An event it cannot match is an
          // unbilled session.
          summary: str("title") || clientName,
          start: { dateTime: start, timeZone: "America/Chicago" },
          end: { dateTime: end, timeZone: "America/Chicago" },
        }),
      });
      await logAction(db, "book_session", clientId, `Booked ${clientName} ${date} ${time}`,
        { kind: "gcal_delete", gcal_event_id: created?.id });
      return `Booked ${clientName} on ${date} at ${time} Central. It's on the Google calendar now; the app picks it up on the next sync (or tap Sync Now).`;
    }

    if (name === "move_workout") {
      // Dustin, 15 Aug: "last time im saying this.. we can all move workouts
      // from anywhere to anywhere period. I don't care if its scheduled, past,
      // future, logged, not logged, mid session. no reason to have any
      // restraint here. we can move workouts where ever we want period."
      //
      // So this checks that the row exists and nothing else. moved_from_date
      // records the origin, and logAction registers an undo, so the move stays
      // reversible without anything having to be forbidden.
      const swId = str("scheduled_workout_id");
      const date = str("to_date");
      if (!swId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Error: scheduled_workout_id and to_date (YYYY-MM-DD) are required.";
      const { data: before } = await db
        .from("scheduled_workouts")
        .select("id, client_id, scheduled_date, status, day_id, position")
        .eq("id", swId)
        .maybeSingle();
      const row = before as { id: string; client_id: string; scheduled_date: string; status: string | null; day_id: string | null; position: number | null } | null;
      if (!row) return "No workout with that id. Call client_workouts and use an SW-id from it — do not guess why it might be missing.";

      // Land it after anything already on the destination day so two sessions
      // on one date do not collide on the unique key.
      const { data: onDay } = await db
        .from("scheduled_workouts")
        .select("position")
        .eq("client_id", row.client_id)
        .eq("scheduled_date", date)
        .is("deleted_at", null)
        .order("position", { ascending: false })
        .limit(1);
      const taken = ((onDay as { position: number | null }[] | null) || [])[0];
      const pos = taken && taken.position ? taken.position + 1 : 1;

      const { error } = await db
        .from("scheduled_workouts")
        .update({ scheduled_date: date, moved_from_date: row.scheduled_date, position: pos, updated_at: new Date().toISOString() })
        .eq("id", swId);
      if (error) return `Couldn't move it: ${error.message}`;

      await logAction(db, "move_workout", row.client_id, `Moved a workout from ${row.scheduled_date} to ${date}`,
        { kind: "sw_restore_date", id: swId, scheduled_date: row.scheduled_date, position: row.position });
      const note = row.status && row.status !== "scheduled" ? ` It stays marked ${row.status}.` : "";
      return `Moved from ${row.scheduled_date} to ${date}.${note}`;
    }

    if (name === "move_session") {
      const eventId = str("gcal_event_id");
      const date = str("date");
      const time = str("start_time");
      if (!eventId || !date || !time) return "Error: gcal_event_id, date and start_time are required.";
      const { token } = await getValidAccessToken(caller.authUserId);
      const before = await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`);
      const { start, end } = ctIso(date, time, Number(input.duration_minutes) || 60);
      await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body: JSON.stringify({ start: { dateTime: start, timeZone: "America/Chicago" }, end: { dateTime: end, timeZone: "America/Chicago" } }),
      });
      await logAction(db, "move_session", null, `Moved "${before?.summary || "session"}" to ${date} ${time}`,
        { kind: "gcal_restore_time", gcal_event_id: eventId, start: before?.start, end: before?.end });
      return `Moved "${before?.summary || "that session"}" to ${date} at ${time} Central. The app follows on the next sync.`;
    }

    if (name === "cancel_session") {
      const eventId = str("gcal_event_id");
      if (!eventId) return "Error: gcal_event_id required.";
      const { token } = await getValidAccessToken(caller.authUserId);
      const before = await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`);
      await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        // Colour, not delete. Deleting loses the record that the session was
        // ever booked, and billing counts cancellations.
        body: JSON.stringify({ colorId: COLOR_CANCELLED }),
      });
      await logAction(db, "cancel_session", null, `Cancelled "${before?.summary || "session"}"${str("reason") ? " — " + str("reason") : ""}`,
        { kind: "gcal_restore_color", gcal_event_id: eventId, colorId: before?.colorId ?? null });
      return `Marked "${before?.summary || "that session"}" cancelled (orange on the calendar, so it stays visible for billing). The app follows on the next sync.`;
    }

    if (name === "record_metric") {
      if (!clientId) return "Error: client_id required.";
      const date = str("date") || CT_TODAY();
      const row: Record<string, unknown> = { client_id: clientId, metric_date: date, source: "ai_agent" };
      for (const f of ["weight", "body_fat_pct", "lean_mass", "fat_mass"]) {
        const v = num(f);
        if (v != null && !Number.isNaN(v)) row[f] = v;
      }
      if (Object.keys(row).length <= 3) return "Error: give at least one of weight, body_fat_pct, lean_mass, fat_mass.";
      const { data: m, error } = await db.from("metrics").insert(row).select("id").maybeSingle();
      if (error) return `Error recording metric: ${error.message}`;
      await logAction(db, "record_metric", clientId, `Metric on ${date}: ${JSON.stringify(row)}`,
        { kind: "delete_row", table: "metrics", id: (m as { id: string } | null)?.id });
      return `Recorded on ${date}.`;
    }

    if (name === "update_client") {
      if (!clientId) return "Error: client_id required.";
      const FIELDS = ["primary_goal", "secondary_goals", "injuries", "injuries_limitations", "medical_notes", "notes", "experience_level", "training_frequency", "weekly_focus"];
      const patch: Record<string, unknown> = {};
      for (const f of FIELDS) if (typeof input[f] === "string" && (input[f] as string).trim()) patch[f] = (input[f] as string).trim();
      if (num("days_per_week") != null) patch.days_per_week = num("days_per_week");
      if (num("session_rate") != null) patch.session_rate = num("session_rate");

      const appendNote = str("append_note");
      // Literal select: a computed column list makes the typed client fall back
      // to an error union, and casting through that hides real mistakes.
      const { data: beforeRow } = await db.from("clients")
        .select("name, primary_goal, secondary_goals, injuries, injuries_limitations, medical_notes, notes, experience_level, training_frequency, weekly_focus, days_per_week, session_rate")
        .eq("id", clientId).maybeSingle();
      const before = beforeRow as unknown as (Record<string, unknown> & { name: string }) | null;
      if (!before) return "Error: client not found.";

      if (appendNote) {
        const stamp = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" });
        const existing = before.notes as string | null;
        patch.notes = existing ? `${existing}\n\n[${stamp}] ${appendNote}` : `[${stamp}] ${appendNote}`;
      }
      if (!Object.keys(patch).length) return "Error: nothing to update.";

      const { error } = await db.from("clients").update(patch).eq("id", clientId);
      if (error) return `Error updating client: ${error.message}`;
      // Undo restores exactly the fields this call touched, not the whole row —
      // so an undo cannot revert a change somebody else made in between.
      const restore: Record<string, unknown> = {};
      for (const k of Object.keys(patch)) restore[k] = before[k] ?? null;
      await logAction(db, "update_client", clientId,
        `Updated ${before.name}: ${Object.keys(patch).join(", ")}`,
        { kind: "restore_row", table: "clients", id: clientId, values: restore });
      return `Updated ${before.name} — ${Object.keys(patch).join(", ")}.`;
    }

    if (name === "assign_program") {
      if (!clientId) return "Error: client_id required.";
      const programId = str("program_id");
      if (!programId) return "Error: program_id required.";
      // NOT maybeSingle(). More than one ACTIVE assignment is the normal state
      // here — measured 15 Aug, 26 of 35 clients have two or more: their real
      // block plus the auto-created "Personal Workouts" sidecar, and five carry
      // several real programmes at once because that is how a corrective track
      // plus a training layer plus cardio is expressed.
      //
      // maybeSingle() raises PGRST116 on more than one row, and only `data` was
      // destructured — so the error was dropped and `prev` came back null
      // exactly as if the client had NO active programme. The undo record for
      // this action has therefore been silently empty for most of the roster.
      // Same fault, worse consequence, in advance_phase below.
      const { data: prevRows } = await db
        .from("program_assignments")
        .select("id, program_id, current_phase_id, active")
        .eq("client_id", clientId)
        .eq("active", true);
      // All of them, so the undo can put back everything this deactivates.
      const prev = (prevRows as unknown[] | null) || [];
      // A failure here must STOP the assignment, not precede it. Unchecked, the
      // insert below still ran and the client ended up with TWO active
      // assignments — which is exactly the state the comment in advance_phase
      // records breaking on ("she has TWO, PGRST116 was raised"). The write
      // that prevents it was the one write nobody was checking.
      const { error: deactErr } = await db
        .from("program_assignments")
        .update({ active: false })
        .eq("client_id", clientId)
        .eq("active", true);
      if (deactErr) {
        return `Couldn't close the current programme, so nothing was assigned: ${deactErr.message}`;
      }
      const phaseId = str("phase_id") || null;
      const { data: created, error } = await db.from("program_assignments")
        .insert({ client_id: clientId, program_id: programId, current_phase_id: phaseId, active: true })
        .select("id").maybeSingle();
      if (error) return `Error assigning program: ${error.message}`;
      const { data: p } = await db.from("programs").select("name").eq("id", programId).maybeSingle();
      await logAction(db, "assign_program", clientId, `Assigned program "${(p as { name: string } | null)?.name || programId}"`,
        { kind: "reassign_program", new_id: (created as { id: string } | null)?.id, previous: prev });
      return `Assigned "${(p as { name: string } | null)?.name || programId}".`;
    }

    if (name === "advance_phase") {
      if (!clientId) return "Error: client_id required.";
      // See assign_program above for why maybeSingle() is wrong here. The
      // consequence in THIS tool is the visible one: ask the assistant to
      // advance Claudine a phase and it answered "that client has no active
      // program" — because she has TWO, PGRST116 was raised, the error was
      // dropped, and no rows and too many rows produced the same null.
      //
      // Ordering is the real fix, not just the row count. A manual workout in
      // the personal sidecar must never be what gets phase-advanced, so a real
      // programme wins, then the most recently assigned. Same preference as
      // src/lib/pickProgramPhase.ts, which exists for the same reason.
      const { data: asgRows } = await db
        .from("program_assignments")
        .select("id, program_id, assigned_at, programs(personal_for_client_id)")
        .eq("client_id", clientId)
        .eq("active", true);
      const candidates = (asgRows as {
        id: string;
        program_id: string;
        assigned_at: string | null;
        current_phase_id?: string | null;
        programs?: { personal_for_client_id?: string | null } | null;
      }[] | null) || [];
      const ranked = candidates.slice().sort((x, y) => {
        const xp = x.programs?.personal_for_client_id ? 1 : 0;
        const yp = y.programs?.personal_for_client_id ? 1 : 0;
        if (xp !== yp) return xp - yp;
        const xt = x.assigned_at ? Date.parse(x.assigned_at) : NaN;
        const yt = y.assigned_at ? Date.parse(y.assigned_at) : NaN;
        const xr = Number.isFinite(xt) ? -xt : Number.POSITIVE_INFINITY;
        const yr = Number.isFinite(yt) ? -yt : Number.POSITIVE_INFINITY;
        if (xr !== yr) return xr < yr ? -1 : 1;
        return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
      });
      const chosen = ranked[0];
      if (!chosen) return "That client has no active program.";
      // current_phase_id is not in the select above (the join changed the shape),
      // so read it back for the one row we actually chose.
      const { data: chosenRow } = await db
        .from("program_assignments")
        .select("id, program_id, current_phase_id")
        .eq("id", chosen.id)
        .maybeSingle();
      const a = chosenRow as { id: string; program_id: string; current_phase_id: string | null } | null;
      if (!a) return "That client has no active program.";
      if (candidates.length > 1) {
        // Say so rather than picking quietly. The trainer is the one who knows
        // whether advancing the chosen block is what he meant.
        console.warn(`advance_phase: ${candidates.length} active assignments for ${clientId}; chose ${a.program_id}`);
      }
      let target = str("phase_id");
      if (!target) {
        const { data: phases } = await db.from("phases").select("id, label, position").eq("program_id", a.program_id).order("position");
        const list = (phases as { id: string; label: string; position: number }[]) || [];
        const idx = list.findIndex((p) => p.id === a.current_phase_id);
        const next = idx >= 0 ? list[idx + 1] : list[0];
        if (!next) return "They're already on the last phase of that program.";
        target = next.id;
      }
      const { error } = await db.from("program_assignments").update({ current_phase_id: target }).eq("id", a.id);
      if (error) return `Error advancing phase: ${error.message}`;
      const { data: ph } = await db.from("phases").select("label").eq("id", target).maybeSingle();
      await logAction(db, "advance_phase", clientId, `Phase → ${(ph as { label: string } | null)?.label || target}`,
        { kind: "restore_row", table: "program_assignments", id: a.id, values: { current_phase_id: a.current_phase_id } });
      return `Moved to phase "${(ph as { label: string } | null)?.label || target}".`;
    }

    if (name === "undo_action") {
      const id = str("action_id");
      let q = db.from("ai_action_log").select("id, action, summary, undo, undone_at").is("undone_at", null).order("created_at", { ascending: false }).limit(1);
      if (id) q = db.from("ai_action_log").select("id, action, summary, undo, undone_at").eq("id", id).limit(1);
      const { data } = await q;
      const row = ((data as { id: string; action: string; summary: string; undo: UndoPayload | null; undone_at: string | null }[]) || [])[0];
      if (!row) return "Nothing to undo.";
      if (row.undone_at) return "That one has already been undone.";
      if (!row.undo) return `"${row.summary}" cannot be undone automatically.`;

      const u = row.undo;
      try {
        // Every write below goes through must(), so a refusal reaches the catch
        // instead of falling out of the bottom into "Undone: …".
        if (u.kind === "message") {
          await must(
            db.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", u.message_id as string),
            "could not withdraw the message",
          );
        } else if (u.kind === "delete_row") {
          await must(
            db.from(u.table as string).delete().eq("id", u.id as string),
            `could not remove the ${u.table} row`,
          );
        } else if (u.kind === "sw_restore_date") {
          // Put a moved workout back on the date it came from. Without this
          // branch the undo would silently do nothing and report success —
          // which is worse than not offering undo at all.
          await must(
            db.from("scheduled_workouts")
              .update({ scheduled_date: u.scheduled_date as string, position: (u.position as number) ?? 1, updated_at: new Date().toISOString() })
              .eq("id", u.id as string),
            "could not move the workout back",
          );
        } else if (u.kind === "restore_row") {
          await must(
            db.from(u.table as string).update(u.values as Record<string, unknown>).eq("id", u.id as string),
            `could not restore the ${u.table} row`,
          );
        } else if (u.kind === "macro_targets") {
          if (u.inserted_id) {
            await must(
              db.from("macro_targets").delete().eq("id", u.inserted_id as string),
              "could not remove the new macro targets",
            );
          }
        } else if (u.kind === "reassign_program") {
          // Order matters and BOTH halves matter: deactivating the new one
          // without reactivating the old leaves the client on no programme,
          // and reactivating the old without deactivating the new leaves them
          // on two — which is the state advance_phase already breaks on.
          if (u.new_id) {
            await must(
              db.from("program_assignments").update({ active: false }).eq("id", u.new_id as string),
              "could not deactivate the new programme",
            );
          }
          const prev = u.previous as { id: string } | null;
          if (prev?.id) {
            await must(
              db.from("program_assignments").update({ active: true }).eq("id", prev.id),
              "could not put the previous programme back",
            );
          }
        } else if (u.kind === "workout_adjust") {
          // Newest-first: a later change can depend on an earlier one, so the
          // reversal has to run backwards through the list. A step that fails
          // because the row is already gone is not a reason to abandon the
          // rest — half-undone is worse than fully undone with one no-op.
          const steps = (u.steps as WorkoutUndoStep[]) || [];
          const failures: string[] = [];
          for (let i = steps.length - 1; i >= 0; i--) {
            const st = steps[i];
            try {
              // must() again: without it this loop collected no failures at
              // all, so `failures.length === steps.length` never fired and a
              // wholly failed reversal reported itself as a clean undo.
              if (st.op === "reinsert") await must(db.from(st.table).insert(st.values), "reinsert");
              else if (st.op === "restore") await must(db.from(st.table).update(st.values).eq("id", st.id), "restore");
              else if (st.op === "delete") await must(db.from(st.table).delete().eq("id", st.id), "delete");
              else if (st.op === "repoint") await must(db.from("scheduled_workouts").update({ day_id: st.day_id }).in("id", st.ids), "repoint");
            } catch (e) { failures.push(`${st.op}: ${(e as Error).message}`); }
          }
          if (failures.length === steps.length) throw new Error(failures[0] || "nothing could be reversed");
          if (failures.length) {
            // Deliberately unchecked: this is a note about a partial reversal
            // that has already been decided. Dustin is told about the partial
            // undo through the return value either way, so a failure to record
            // it changes nothing he sees and must not derail the undo.
            await db.from("ai_action_log").update({ undo_error: failures.join("; ").slice(0, 300) }).eq("id", row.id);
          }
        } else if (u.kind === "gcal_delete") {
          const { token } = await getValidAccessToken(caller.authUserId);
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, { method: "DELETE" });
        } else if (u.kind === "gcal_restore_time") {
          const { token } = await getValidAccessToken(caller.authUserId);
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, {
            method: "PATCH", body: JSON.stringify({ start: u.start, end: u.end }),
          });
        } else if (u.kind === "gcal_restore_color") {
          const { token } = await getValidAccessToken(caller.authUserId);
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, {
            method: "PATCH", body: JSON.stringify({ colorId: u.colorId ?? null }),
          });
        } else {
          return `Don't know how to undo "${row.action}".`;
        }
      } catch (e) {
        const msg = (e as Error).message;
        // Deliberately unchecked, same reasoning: the failure is already being
        // reported to Dustin on the next line. Recording it is a nicety.
        await db.from("ai_action_log").update({ undo_error: msg.slice(0, 300) }).eq("id", row.id);
        return `Couldn't undo that: ${msg}`;
      }
      // The change IS reversed by this point, so this cannot fail the undo. But
      // an unmarked row stays in the "not yet undone" list, and a second undo
      // would apply the reversal twice — reinserting rows, deleting a message
      // again. Worth saying out loud rather than swallowing.
      const { error: markErr } = await db
        .from("ai_action_log")
        .update({ undone_at: new Date().toISOString() })
        .eq("id", row.id);
      if (markErr) {
        console.error("agent: undo succeeded but could not be marked —", markErr.message);
        return `Undone: ${row.summary} — but I couldn't mark it as undone, so don't undo it again.`;
      }
      return `Undone: ${row.summary}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${(e as Error).message}`;
  }
}
