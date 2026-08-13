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
import { COACH_FIRST_NAME } from "../trainer";

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
  { name: "send_message", description: `Send a message as ${COACH_FIRST_NAME} — to one client, or to the whole group. Say what you are about to send and get his go-ahead first unless he has clearly already asked for it.`, input_schema: { type: "object", properties: {
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

async function logAction(db: Db, action: string, clientId: string | null, summary: string, undo: UndoPayload | null): Promise<void> {
  try {
    await db.from("ai_action_log").insert({ action, client_id: clientId, summary, undo });
  } catch (e) {
    // Never fail a completed write because the audit row did not land. The
    // change already happened; losing the undo record is bad, pretending the
    // change failed is worse.
    console.error("agent: action log failed", e);
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

export async function execTrainerTool(db: Db, name: string, input: Record<string, unknown>): Promise<string> {
  const str = (k: string): string => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const num = (k: string): number | null => (input[k] == null || input[k] === "" ? null : Number(input[k]));

  try {
    // ── reads ───────────────────────────────────────────────────────────────
    if (name === "find_clients") {
      const q = str("query");
      let query = db.from("clients").select("id, name, primary_goal").is("archived_at", null).order("name").limit(60);
      if (q) query = db.from("clients").select("id, name, primary_goal").ilike("name", `%${q}%`).is("archived_at", null).order("name").limit(60);
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
      const { data: sws } = await db.from("scheduled_workouts").select("id, scheduled_date, status, day_id").eq("client_id", clientId).is("deleted_at", null).eq("status", "scheduled").gte("scheduled_date", today).order("scheduled_date").limit(10);
      const out: string[] = [];
      for (const sw of ((sws as { id: string; scheduled_date: string; day_id: string }[]) || [])) {
        const day = await loadDayTree(db, sw.day_id);
        out.push(`[SW-id ${sw.id}] ${sw.scheduled_date} — ${day?.label || "workout"}`);
        for (const s of (day?.sections || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
          out.push(`  Section "${s.client_facing_name || s.internal_name}" (section_id ${s.id}):`);
          for (const pe of (s.prescribed_exercises || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
            out.push(`    - [pe_id ${pe.id}] ${pe.exercises?.name || "exercise"} ${pe.sets ?? ""}x${pe.volume_value ?? ""}${pe.load_descriptor ? ` (${pe.load_descriptor})` : ""}${pe.cue ? ` — ${pe.cue}` : ""}`);
          }
        }
      }
      return out.length ? out.join("\n") : "No upcoming scheduled workouts.";
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

      const { data: ts } = await db.from("trainer_settings").select("user_id").limit(1).maybeSingle();
      const trainerUid = (ts as { user_id: string } | null)?.user_id;
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
      const { token } = await getValidAccessToken();
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

    if (name === "move_session") {
      const eventId = str("gcal_event_id");
      const date = str("date");
      const time = str("start_time");
      if (!eventId || !date || !time) return "Error: gcal_event_id, date and start_time are required.";
      const { token } = await getValidAccessToken();
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
      const { token } = await getValidAccessToken();
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
      const { data: prev } = await db.from("program_assignments").select("id, program_id, current_phase_id, active").eq("client_id", clientId).eq("active", true).maybeSingle();
      await db.from("program_assignments").update({ active: false }).eq("client_id", clientId).eq("active", true);
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
      const { data: asg } = await db.from("program_assignments").select("id, program_id, current_phase_id").eq("client_id", clientId).eq("active", true).maybeSingle();
      const a = asg as { id: string; program_id: string; current_phase_id: string | null } | null;
      if (!a) return "That client has no active program.";
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
        if (u.kind === "message") {
          await db.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", u.message_id as string);
        } else if (u.kind === "delete_row") {
          await db.from(u.table as string).delete().eq("id", u.id as string);
        } else if (u.kind === "restore_row") {
          await db.from(u.table as string).update(u.values as Record<string, unknown>).eq("id", u.id as string);
        } else if (u.kind === "macro_targets") {
          if (u.inserted_id) await db.from("macro_targets").delete().eq("id", u.inserted_id as string);
        } else if (u.kind === "reassign_program") {
          if (u.new_id) await db.from("program_assignments").update({ active: false }).eq("id", u.new_id as string);
          const prev = u.previous as { id: string } | null;
          if (prev?.id) await db.from("program_assignments").update({ active: true }).eq("id", prev.id);
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
              if (st.op === "reinsert") await db.from(st.table).insert(st.values);
              else if (st.op === "restore") await db.from(st.table).update(st.values).eq("id", st.id);
              else if (st.op === "delete") await db.from(st.table).delete().eq("id", st.id);
              else if (st.op === "repoint") await db.from("scheduled_workouts").update({ day_id: st.day_id }).in("id", st.ids);
            } catch (e) { failures.push(`${st.op}: ${(e as Error).message}`); }
          }
          if (failures.length === steps.length) throw new Error(failures[0] || "nothing could be reversed");
          if (failures.length) {
            await db.from("ai_action_log").update({ undo_error: failures.join("; ").slice(0, 300) }).eq("id", row.id);
          }
        } else if (u.kind === "gcal_delete") {
          const { token } = await getValidAccessToken();
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, { method: "DELETE" });
        } else if (u.kind === "gcal_restore_time") {
          const { token } = await getValidAccessToken();
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, {
            method: "PATCH", body: JSON.stringify({ start: u.start, end: u.end }),
          });
        } else if (u.kind === "gcal_restore_color") {
          const { token } = await getValidAccessToken();
          await gcalFetch(token, `/calendars/primary/events/${encodeURIComponent(u.gcal_event_id as string)}`, {
            method: "PATCH", body: JSON.stringify({ colorId: u.colorId ?? null }),
          });
        } else {
          return `Don't know how to undo "${row.action}".`;
        }
      } catch (e) {
        const msg = (e as Error).message;
        await db.from("ai_action_log").update({ undo_error: msg.slice(0, 300) }).eq("id", row.id);
        return `Couldn't undo that: ${msg}`;
      }
      await db.from("ai_action_log").update({ undone_at: new Date().toISOString() }).eq("id", row.id);
      return `Undone: ${row.summary}`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${(e as Error).message}`;
  }
}
