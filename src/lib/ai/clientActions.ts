// WHAT A CLIENT'S AI IS ALLOWED TO DO ON THEIR BEHALF.
//
// Dustin, 13 Aug, on his parents Gerard (71) and Sharon:
//
//   "I need their AI to be able to do anything they need to do in that app for
//    them so they don't have to figure it out... basic functions where it makes
//    sense but I need to stay under that $95 a month cap."
//
// ── WHY THIS IS A SEPARATE, MUCH SMALLER TOOLSET ───────────────────────────
//
// There is already a full agent toolset (lib/ai/agent-tools.ts) with twenty-odd
// tools including send_message, set_macro_targets and assign_program. Not one of
// those may be reachable from a client's chat box, and the safe way to
// guarantee that is not a permission check inside a shared list — it is a
// separate list that never contained them. A tool a route cannot name is a tool
// no prompt injection can talk it into calling.
//
// So there are five, and each one is something a person would otherwise do with
// their thumbs on a screen they can already reach.
//
// ── THE THREE INVARIANTS ────────────────────────────────────────────────────
//
// 1. THE CLIENT ID NEVER COMES FROM THE MODEL. It is resolved from the session
//    by the route and passed in here as an argument. No tool takes a client_id
//    parameter — there is nothing for a model to get wrong or a user to talk it
//    into changing.
//
// 2. EVERY WRITE RE-CHECKS OWNERSHIP AT THE MOMENT OF WRITING. The row ids come
//    from the model, which got them from a read that was correct at the time. A
//    stale id, an id echoed out of an earlier turn's context, or an id pasted
//    from somewhere else all have to fail at the write, not at the read.
//
// 3. A GATED CLIENT'S SWAP IS CHECKED AGAINST THE POOL AT WRITE TIME TOO —
//    isDayInPool, immediately before the update, on top of the model only ever
//    having been shown the cleared list. Two independent barriers, because the
//    consequence of one failing is a movement Gerard's rebuilt pelvis or
//    Sharon's shoulders cannot take.
//
// Nothing here deletes anything. The most destructive thing available is moving
// a workout to a different date, which the client can move back.

import type { Db } from "@/lib/ai/scope";
import { isDayInPool, clearedPoolFor } from "@/lib/ai/workoutPool";

export const CLIENT_TOOLS = [
  {
    name: "my_schedule",
    description:
      "This client's own scheduled workouts in a date range. Returns the workout id needed to move or swap one. Always call this before moving or swapping anything — never guess an id.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
        to: { type: "string", description: "YYYY-MM-DD. Defaults to 21 days out." },
      },
    },
  },
  {
    name: "my_workout_options",
    description:
      "The sessions this client can be given, with the movements in each. For clients whose programme is individually cleared by their coach, this is the ONLY set that exists for them — nothing outside it may be suggested, described or swapped in.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "move_my_workout",
    description:
      "Move one of this client's scheduled workouts to a different date. Use my_schedule first to get the id. Cannot move a workout that is already completed.",
    input_schema: {
      type: "object" as const,
      properties: {
        scheduled_workout_id: { type: "string" },
        to_date: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["scheduled_workout_id", "to_date"],
    },
  },
  {
    name: "swap_my_workout",
    description:
      "Change WHICH session is scheduled on a day, keeping the date. Use my_schedule for the scheduled workout id and my_workout_options for the session to swap in. Cannot change a completed workout.",
    input_schema: {
      type: "object" as const,
      properties: {
        scheduled_workout_id: { type: "string" },
        to_day_id: { type: "string", description: "From my_workout_options." },
      },
      required: ["scheduled_workout_id", "to_day_id"],
    },
  },
  {
    name: "log_my_weight",
    description:
      "Record a weigh-in for this client. Only ever call this with a number the client has actually told you in this conversation — never a guess, never one carried over from their history.",
    input_schema: {
      type: "object" as const,
      properties: {
        weight: { type: "number", description: "Pounds." },
        body_fat_pct: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD. Defaults to today." },
      },
    },
  },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/** Bounds so a misheard number cannot land in the metrics table. */
const WEIGHT_RANGE: [number, number] = [60, 600];
const BF_RANGE: [number, number] = [3, 60];
/** How far a workout may be moved in one go, in either direction. */
const MAX_MOVE_DAYS = 60;

function shift(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/**
 * Run one tool call for a client.
 *
 * `clientId` comes from the SESSION, never from the model. Returns a string the
 * model reads back — errors are returned as sentences rather than thrown,
 * because the model needs to be able to explain the refusal to the person
 * rather than the request simply dying.
 */
export async function runClientTool(
  db: Db,
  clientId: string,
  name: string,
  input: Record<string, unknown>,
  today: string,
): Promise<string> {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const num = (k: string) => (typeof input[k] === "number" ? (input[k] as number) : Number.NaN);

  try {
    if (name === "my_schedule") {
      const from = ISO.test(str("from")) ? str("from") : today;
      const to = ISO.test(str("to")) ? str("to") : shift(today, 21);
      const { data } = await db
        .from("scheduled_workouts")
        .select("id, scheduled_date, status, days(id, label)")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_date")
        .limit(60);
      const rows = (data as { id: string; scheduled_date: string; status: string | null; days: { id: string; label: string | null } | null }[] | null) || [];
      if (!rows.length) return "Nothing scheduled in that range.";
      return rows
        .map((r) => `[id ${r.id}] ${r.scheduled_date} — ${r.days?.label || "workout"}${r.status && r.status !== "scheduled" ? ` (${r.status})` : ""}`)
        .join("\n");
    }

    if (name === "my_workout_options") {
      const pool = await clearedPoolFor(db, clientId);
      if (pool.gated) {
        if (!pool.workouts.length) {
          return "Their cleared list could not be loaded. Do NOT suggest, describe or swap in any workout or movement at all — tell them their options aren't loading right now and to check with their coach.";
        }
        return [
          "CLEARED OPTIONS — the only sessions this client may be given. Nothing outside this list exists for them:",
          ...pool.workouts.map((w) => `[day_id ${w.dayId}] ${w.label} — ${w.exercises.join(", ")}`),
        ].join("\n");
      }
      const { data } = await db
        .from("days")
        .select("id, label, sections(position, prescribed_exercises(position, exercises(name)))")
        .eq("client_owner_id", clientId)
        .eq("swappable", true)
        .limit(40);
      type Row = { id: string; label: string | null; sections: { position: number; prescribed_exercises: { position: number; exercises: { name: string } | null }[] }[] | null };
      const rows = (data as Row[] | null) || [];
      if (!rows.length) return "No alternative sessions are set up for this client — a swap would have to come from their coach.";
      // Same content de-duplication the pool does: the days table has twice
      // been filled by a loop that inserts one row per scheduled date, and
      // seven identical options is not a menu.
      const seen = new Set<string>();
      const out: string[] = [];
      for (const d of rows) {
        const names = (d.sections || [])
          .slice().sort((a, b) => a.position - b.position)
          .flatMap((s) => (s.prescribed_exercises || []).slice().sort((a, b) => a.position - b.position).map((p) => p.exercises?.name).filter(Boolean) as string[]);
        const sig = `${(d.label || "").trim().toLowerCase()}::${names.join("|")}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(`[day_id ${d.id}] ${d.label || "Workout"} — ${names.join(", ")}`);
      }
      return out.join("\n");
    }

    if (name === "move_my_workout") {
      const swId = str("scheduled_workout_id");
      const to = str("to_date");
      if (!swId || !ISO.test(to)) return "Error: need the workout id and a date as YYYY-MM-DD.";
      const days = Math.abs((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY);
      if (!Number.isFinite(days) || days > MAX_MOVE_DAYS) {
        return `That date is more than ${MAX_MOVE_DAYS} days away. Check it with them — if it is right, their coach can make the change.`;
      }

      // Ownership re-checked HERE, not at the read. The id came from the model.
      const { data: sw } = await db
        .from("scheduled_workouts")
        .select("id, client_id, status, scheduled_date, deleted_at")
        .eq("id", swId)
        .maybeSingle();
      const row = sw as { id: string; client_id: string; status: string | null; scheduled_date: string; deleted_at: string | null } | null;
      if (!row || row.client_id !== clientId || row.deleted_at) return "That workout isn't on this client's schedule.";
      if (row.status === "completed") return "That one is already logged as done, so it can't be moved. Say so rather than moving a different one.";

      const { error } = await db
        .from("scheduled_workouts")
        .update({ scheduled_date: to, moved_from_date: row.scheduled_date, updated_at: new Date().toISOString() })
        .eq("id", swId)
        .eq("client_id", clientId);
      if (error) return `Couldn't move it: ${error.message}`;
      return `Moved from ${row.scheduled_date} to ${to}.`;
    }

    if (name === "swap_my_workout") {
      const swId = str("scheduled_workout_id");
      const dayId = str("to_day_id");
      if (!swId || !dayId) return "Error: need the scheduled workout id and the day_id to swap in.";

      const { data: sw } = await db
        .from("scheduled_workouts")
        .select("id, client_id, status, scheduled_date, deleted_at")
        .eq("id", swId)
        .maybeSingle();
      const row = sw as { id: string; client_id: string; status: string | null; scheduled_date: string; deleted_at: string | null } | null;
      if (!row || row.client_id !== clientId || row.deleted_at) return "That workout isn't on this client's schedule.";
      if (row.status === "completed") return "That one is already logged as done, so it can't be swapped.";

      // BARRIER TWO. The model was only ever shown the cleared list, and this
      // checks the id against the pool anyway, at the moment of writing. The
      // cost of these two disagreeing is a movement somebody's body cannot
      // take, so one barrier is not enough.
      const pool = await clearedPoolFor(db, clientId);
      if (pool.gated) {
        const allowed = await isDayInPool(db, clientId, dayId);
        if (!allowed) {
          return "That session isn't one of this client's cleared options. Do NOT swap it in. Tell them which sessions they can have and offer to pass the request to their coach.";
        }
      } else {
        // Ungated clients still may not be given another client's day, or a
        // master library row.
        const { data: d } = await db
          .from("days").select("id").eq("id", dayId).eq("client_owner_id", clientId).eq("swappable", true).maybeSingle();
        if (!d) return "That session isn't one of this client's options.";
      }

      const { error } = await db
        .from("scheduled_workouts")
        .update({ day_id: dayId, updated_at: new Date().toISOString() })
        .eq("id", swId)
        .eq("client_id", clientId);
      if (error) return `Couldn't swap it: ${error.message}`;
      return `Swapped the session on ${row.scheduled_date}.`;
    }

    if (name === "log_my_weight") {
      const w = num("weight");
      const bf = num("body_fat_pct");
      const date = ISO.test(str("date")) ? str("date") : today;
      if (date > today) return "That date is in the future — ask them which day they mean.";
      const hasW = Number.isFinite(w);
      const hasBf = Number.isFinite(bf);
      if (!hasW && !hasBf) return "Error: need a weight or a body fat percentage.";
      if (hasW && (w < WEIGHT_RANGE[0] || w > WEIGHT_RANGE[1])) {
        return `${w} lb doesn't look right — read it back to them and ask before logging anything.`;
      }
      if (hasBf && (bf < BF_RANGE[0] || bf > BF_RANGE[1])) {
        return `${bf}% doesn't look right — read it back to them and ask before logging anything.`;
      }

      // One reading per client per day. metrics already carries a unique index
      // on (client_id, metric_date); upserting rather than inserting is what
      // stops "actually it was 188.6" creating a second row for the same day.
      const patch: Record<string, unknown> = { client_id: clientId, metric_date: date, source: "ai_assistant" };
      if (hasW) patch.weight = Math.round(w * 10) / 10;
      if (hasBf) patch.body_fat_pct = Math.round(bf * 10) / 10;
      const { error } = await db.from("metrics").upsert(patch, { onConflict: "client_id,metric_date" });
      if (error) return `Couldn't log that: ${error.message}`;
      return `Logged for ${date}${hasW ? `: ${patch.weight} lb` : ""}${hasBf ? `${hasW ? "," : ":"} ${patch.body_fat_pct}% body fat` : ""}.`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `That didn't work: ${(e as Error).message || "unexpected error"}. Tell them plainly rather than trying something else.`;
  }
}
