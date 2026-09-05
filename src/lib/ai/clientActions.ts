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
      "This client's own workouts in a date range — PAST sessions included, not just upcoming. " +
      "Defaults to the last 14 days through the next 21. Returns the workout id needed to move or swap one. " +
      "Always call this before moving or swapping anything — never guess an id. If the client refers to a " +
      "session you cannot see, widen the range with `from` before concluding anything about it, and if it is " +
      "still not there say so plainly rather than explaining why it might be missing.",
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
      "Move one of this client's workouts to a different date. Use my_schedule first to get the id. " +
      "ANY workout can be moved to ANY date — past or future, scheduled or already completed, logged or not, " +
      "even one they are part-way through, and INCLUDING a supervised session, which they often move because " +
      "the trainer is away and they will do it on their own. There are no restrictions and you must never " +
      "invent one or tell them to ask their coach instead. If you cannot find the workout, say that; do not " +
      "guess at a reason it cannot be moved. " +
      "ONE WORDING RULE: moving a supervised workout moves the WORKOUT, not their appointment with the trainer " +
      "— that time lives in his own calendar, which this app does not touch. The tool result will tell you when " +
      "you have just moved one of those and exactly what to say.",
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
    name: "add_my_workout",
    description:
      "Put an ADDITIONAL session on one of this client's days, keeping whatever is already there. Use for 'add a second walk today' or 'give me an extra session on Saturday'. " +
      "The day_id may come from EITHER my_workout_options OR the [day_id ...] of a session already on their schedule from my_schedule — repeating a session they are already doing is always allowed, and most prescribed days are not in the swappable options list, so do not refuse on those grounds. " +
      "If the client has clearly asked for it, CALL THIS TOOL rather than asking them to confirm which session they mean when there is only one sensible match. Do NOT use this to replace something — that is swap_my_workout.",
    input_schema: {
      type: "object" as const,
      properties: {
        day_id: { type: "string", description: "From my_workout_options." },
        date: { type: "string", description: "YYYY-MM-DD." },
      },
      required: ["day_id", "date"],
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
  {
    name: "my_training_summary",
    description:
      "THE ONLY WAY TO ANSWER A QUESTION ABOUT A TIME PERIOD. Real counts for any date range: how many " +
      "sessions were scheduled, how many were completed, how many were missed, the attendance percentage, " +
      "the longest gap, and when they last trained. " +
      "Call this for ANY question containing a period — 'last 3 weeks', 'this month', 'since I started', " +
      "'how have I been doing', 'am I consistent', 'progress lately'. Resolve the period to `from` and `to` " +
      "dates yourself and pass them; the numbers come back computed, not estimated. " +
      "NEVER judge consistency, attendance or progress from a list of logged sessions: that list contains " +
      "only what they DID and can never show what they missed, so it makes every client look consistent.",
    input_schema: {
      type: "object" as const,
      properties: {
        from: { type: "string", description: "YYYY-MM-DD, first day of the period, inclusive." },
        to: { type: "string", description: "YYYY-MM-DD, last day, inclusive. Defaults to today." },
      },
      required: ["from"],
    },
  },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

/** Bounds so a misheard number cannot land in the metrics table. */
const WEIGHT_RANGE: [number, number] = [60, 600];
const BF_RANGE: [number, number] = [3, 60];
/** How far a workout may be moved in one go, in either direction. */

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
/**
 * The next free slot for a session on a given day.
 *
 * `scheduled_workouts` is unique on (client_id, day_id, scheduled_date,
 * position). That key is what lets a coach deliberately put the same session on
 * a day twice — two walks, a morning and an evening — while still refusing an
 * accidental double-submit, which would land on the identical position.
 *
 * Dustin, 14 Aug, after the coach told him it could not stack two cardio
 * sessions: "fix this restraint. it puts whatever we tell it to put in there
 * period." So the tools no longer refuse; they find the next slot and use it.
 *
 * Returns 1 when nothing is there, otherwise one past the highest in use.
 */
async function nextFreePosition(
  db: Db,
  clientId: string,
  dayId: string,
  date: string,
  excludeId?: string,
): Promise<number> {
  let q = db
    .from("scheduled_workouts")
    .select("position")
    .eq("client_id", clientId)
    .eq("day_id", dayId)
    .eq("scheduled_date", date)
    .is("deleted_at", null);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  const used = ((data as { position: number | null }[] | null) || [])
    .map((r) => r.position ?? 1);
  if (!used.length) return 1;
  return Math.max(...used) + 1;
}

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
    if (name === "my_training_summary") {
      // ── ANSWER THE PERIOD THAT WAS ASKED, WITH REAL NUMBERS ─────────────
      //
      // Dustin, 22 Aug: "the ai needs to answer the time frame that we ask for
      // period." He had asked for a three-week summary of a client who has
      // completed 7 of 45 scheduled sessions in thirty days, and been told
      // "Consistency is solid. You've hit 6 days a week like you're supposed
      // to."
      //
      // Nothing in that reply was invented. The context gave the model the
      // PROGRAMMED frequency and a list headed "what they actually did" — six
      // real sessions, every one a success — and no denominator anywhere. A
      // list of completed sessions cannot show what was missed, so it makes
      // every client look consistent, and the more they miss the more
      // flattering it gets: the misses simply are not in it.
      //
      // Fixed windows were the wrong fix. Pre-baking 7/21/30 answers "last 3
      // weeks" and fails the next question — "since I started", "in August",
      // "the last six weeks". So the range is an argument, and the arithmetic
      // happens here rather than in the model's head.
      const from = ISO.test(str("from")) ? str("from") : shift(today, -20);
      const to = ISO.test(str("to")) ? str("to") : today;
      if (from > to) return JSON.stringify({ error: "`from` is after `to`." });

      const { data: schedRows } = await db
        .from("scheduled_workouts")
        .select("scheduled_date, status, days(label)")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .order("scheduled_date", { ascending: true });

      const rows = (schedRows as { scheduled_date: string; status: string | null; days: { label: string | null } | null }[] | null) || [];

      // Only days that have HAPPENED can be missed. A session scheduled for
      // Friday is not a miss on Wednesday, and counting it as one would make
      // every client look worse the further ahead their coach programmes.
      const past = rows.filter((r) => r.scheduled_date <= today);
      const completed = past.filter((r) => r.status === "completed");
      const missed = past.filter((r) => r.status !== "completed");
      const upcoming = rows.filter((r) => r.scheduled_date > today);

      const doneDates = [...new Set(completed.map((r) => r.scheduled_date))].sort();
      const daysInRange = Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY) + 1;

      // The longest run of days with nothing completed. This is the number that
      // makes a gap visible; an average per week hides a fortnight off.
      let longestGap = 0;
      if (doneDates.length) {
        const edges = [from, ...doneDates, to > today ? today : to];
        for (let i = 1; i < edges.length; i++) {
          const g = Math.round((Date.parse(edges[i] + "T12:00:00Z") - Date.parse(edges[i - 1] + "T12:00:00Z")) / DAY);
          if (g > longestGap) longestGap = g;
        }
      } else {
        longestGap = Math.min(daysInRange, Math.round((Date.parse((to > today ? today : to) + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / DAY) + 1);
      }

      const last = doneDates.length ? doneDates[doneDates.length - 1] : null;

      return JSON.stringify({
        period: { from, to, days: daysInRange },
        scheduled_in_period: past.length,
        completed: completed.length,
        missed: missed.length,
        attendance_pct: past.length ? Math.round((completed.length / past.length) * 100) : null,
        distinct_days_trained: doneDates.length,
        dates_trained: doneDates,
        longest_gap_days: longestGap,
        last_completed: last,
        days_since_last_completed: last
          ? Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(last + "T12:00:00Z")) / DAY)
          : null,
        still_upcoming_in_period: upcoming.length,
        missed_sessions: missed.slice(0, 30).map((r) => ({ date: r.scheduled_date, workout: r.days?.label || "workout" })),
        note:
          past.length === 0
            ? "Nothing was scheduled in this period, so there is no attendance to report."
            : "attendance_pct counts only sessions whose date has passed. missed_sessions are real sessions they did not do — say so plainly rather than describing only what they completed.",
      });
    }

    if (name === "my_schedule") {
      // ── THE DEFAULT WINDOW LOOKS BACKWARDS TOO, AND THAT IS THE FIX ────
      //
      // `from` defaulted to TODAY. So when Bobbie asked on 15 Aug to move her
      // Friday cardio to today, the model called my_schedule, got today
      // forward, and Friday's session was simply not in the list. It could not
      // find the thing she was pointing at.
      //
      // What it did next is the part that matters: instead of saying "I can't
      // see it", it produced a confident story — "you logged the treadmill
      // session on Friday, but the app recorded it as a separate log entry" —
      // which the database flatly contradicts. She has no workout log on 14 Aug
      // at all. A wrong answer delivered warmly, about her own training.
      //
      // Fourteen days back covers "yesterday", "last week", and the backfilling
      // people actually do, and it costs nothing: the same single query, the
      // same 60-row limit.
      const from = ISO.test(str("from")) ? str("from") : shift(today, -14);
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
      // day_id is emitted, not just fetched. It used to be selected and then
      // dropped when formatting, so the model could SEE a session and still not
      // name it: "add a second walk today" ended at "I need the day_id for the
      // 20-minute walk" about a walk that was right there on the schedule it had
      // just read. You cannot duplicate what you cannot refer to.
      return rows
        .map((r) => `[id ${r.id}] [day_id ${r.days?.id || "?"}] ${r.scheduled_date} — ${r.days?.label || "workout"}${r.status && r.status !== "scheduled" ? ` (${r.status})` : ""}`)
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
      // ── NO WINDOW, NO STATUS CHECK. This is deliberate. ───────────────
      //
      // Dustin, 15 Aug: "last time im saying this.. we can all move workouts
      // from anywhere to anywhere period. I don't care if its scheduled, past,
      // future, logged, not logged, mid session. no reason to have any
      // restraint here."
      //
      // Two guards used to live here and both are gone:
      //   · a 60-day window, which refused a date the client meant
      //   · `status === "completed"` → refuse, which meant a session you had
      //     actually done was the one thing you could not put on the right day
      //
      // Bobbie Page, 14 Aug, is what that cost: "It won't let me move my cardio
      // from yesterday (friday) to today. Tried manually and it won't work.
      // Tried ai and i got frustrated because it wasnt working and stopped
      // trying." Moving a session is not a destructive act — moved_from_date
      // records where it came from, so it stays auditable and reversible.
      //
      // Ownership is still checked, because that is not a restraint on Dustin,
      // it is the wall between two clients' data.

      // Ownership re-checked HERE, not at the read. The id came from the model.
      const { data: sw } = await db
        .from("scheduled_workouts")
        .select("id, client_id, status, scheduled_date, deleted_at, day_id, supervised, appointment_id")
        .eq("id", swId)
        .maybeSingle();
      const row = sw as { id: string; client_id: string; status: string | null; scheduled_date: string; deleted_at: string | null; day_id: string | null; supervised: boolean | null; appointment_id: string | null } | null;
      if (!row || row.client_id !== clientId || row.deleted_at) return "That workout isn't on this client's schedule.";

      // The destination may already hold this same session. That is allowed —
      // it just needs its own slot, or the unique key refuses the write and the
      // client is told "the system doesn't allow duplicates", which is the
      // exact refusal this stopped being.
      const movePos = await nextFreePosition(db, clientId, row.day_id ?? "", to, swId);

      const { error } = await db
        .from("scheduled_workouts")
        .update({ scheduled_date: to, moved_from_date: row.scheduled_date, position: movePos, updated_at: new Date().toISOString() })
        .eq("id", swId)
        .eq("client_id", clientId);
      if (error) return `Couldn't move it: ${error.message}`;

      // ── TWO DIFFERENT THINGS SHARE ONE WORD, AND ONLY ONE OF THEM MOVED ──
      //
      // Dustin, 5 Sep 2026, correcting an earlier reading of his own rule:
      //
      //   "They can still move supervised sessions because sometimes if I'm not
      //    here, they have to do that workout on their own... I just want to
      //    make sure the AI does not word it in a way that sounds like they can
      //    move their actual sessions with me. The days they train with me are
      //    part of my calendar, not the calendar in the app."
      //
      // and, on what the rule is actually protecting:
      //
      //   "I dont want them thinking they can change their schedule w me
      //    training them through the ai."
      //
      // Which is a belief, not a permission. Nothing here is blocked; what is
      // prevented is a client coming away from a sentence believing their next
      // session with him is on a different day.
      //
      // So this is NOT a permission. The move goes through, for supervised
      // sessions exactly like any other — if he is away, doing that workout
      // alone on another day is the whole point, and blocking it would be the
      // "ask your coach" refusal that made Bobbie Page give up on 14 Aug.
      //
      // What is wrong is only the SENTENCE. A supervised workout is the app's
      // half of an appointment; the other half is an event in his own calendar,
      // which the app does not own and this write does not touch. "I've moved
      // your session with Dustin to Thursday" is therefore false in the one way
      // that matters — the client turns up on Thursday and he is not there.
      //
      // The model cannot infer this: from its side both rows look identical.
      // So the tool result says which kind it just moved, and what the client
      // must be told about the half that did not move.
      const moved = movePos > 1
        ? `Moved from ${row.scheduled_date} to ${to} — that day now has ${movePos} sessions.`
        : `Moved from ${row.scheduled_date} to ${to}.`;
      if (row.supervised || row.appointment_id) {
        return (
          `${moved}\n\n` +
          `⚠️ WORD THIS CAREFULLY. What moved is the WORKOUT in this app. This one was also a session ` +
          `booked with the trainer, and that booking lives in HIS calendar, which this app does not ` +
          `change — so their appointment with him has NOT moved. Say you have moved the workout, and ` +
          `that the time they train with him is unchanged and his to change. Never say you have moved, ` +
          `rescheduled or changed their session, their appointment, or their time with him. If moving it ` +
          `is because he will not be there, that is fine and normal — they do that workout on their own.`
        );
      }
      return moved;
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

      // Same reason as the move: swapping IN a session the day already has is
      // legitimate, it just needs its own slot.
      const swapPos = await nextFreePosition(db, clientId, dayId, row.scheduled_date, swId);

      const { error } = await db
        .from("scheduled_workouts")
        .update({ day_id: dayId, position: swapPos, updated_at: new Date().toISOString() })
        .eq("id", swId)
        .eq("client_id", clientId);
      if (error) return `Couldn't swap it: ${error.message}`;
      return `Swapped the session on ${row.scheduled_date}.`;
    }

    if (name === "add_my_workout") {
      const dayId = str("day_id");
      const date = str("date");
      if (!dayId || !ISO.test(date)) return "Error: need the day_id and a date as YYYY-MM-DD.";

      // No date window here either — same instruction as move_my_workout above.
      // A client backfilling last month's sessions or planning a block ahead is
      // doing normal work, not something to be talked out of.

      // THE SAME TWO BARRIERS AS A SWAP. Adding a session is exactly as capable
      // of putting a movement in front of somebody as swapping one is, so it is
      // gated identically. A gated client's options were filtered before the
      // model ever saw them; this checks the id again at the moment of writing.
      const pool = await clearedPoolFor(db, clientId);
      if (pool.gated) {
        const allowed = await isDayInPool(db, clientId, dayId);
        if (!allowed) {
          return "That session isn't one of this client's cleared options. Do NOT add it. Tell them which sessions they can have and offer to pass the request to their coach.";
        }
      } else {
        // Swappable, OR something already on their own schedule.
        //
        // The second half matters: a client asking for a SECOND copy of a
        // session they are already doing is not being handed anything new, and
        // most prescribed days are not marked swappable. Without this, "add
        // another walk" was refused for a walk already sitting on the same day.
        // Still their own days only — never another client's, never a master
        // library row.
        const { data: d } = await db
          .from("days").select("id").eq("id", dayId).eq("client_owner_id", clientId).eq("swappable", true).maybeSingle();
        if (!d) {
          const { data: mine } = await db
            .from("scheduled_workouts").select("id")
            .eq("client_id", clientId).eq("day_id", dayId).is("deleted_at", null).limit(1).maybeSingle();
          if (!mine) return "That session isn't one of this client's options.";
        }
      }

      // Its own slot, so putting the same session on twice is a second row
      // rather than a unique-key refusal. This is the whole point: Dustin,
      // 14 Aug — "it puts whatever we tell it to put in there period."
      const pos = await nextFreePosition(db, clientId, dayId, date);

      const { error } = await db.from("scheduled_workouts").insert({
        client_id: clientId,
        day_id: dayId,
        scheduled_date: date,
        position: pos,
        status: "scheduled",
        // NOT "client". That is not a value the column accepts, and this row
        // was the ONLY caller that used it — so every add_my_workout call in
        // existence died at the database with a 23514 the model reported back
        // as "Couldn't add it: new row ... violates check constraint". The tool
        // was reachable, gated and correct right up to the insert, and nothing
        // caught it because nobody had ever successfully run it.
        // scheduled_workouts_source_check allows exactly:
        //   trainer | client_self_assign | claude | migration
        // AddWorkoutButton already used client_self_assign for this same case.
        source: "client_self_assign",
      });
      if (error) return `Couldn't add it: ${error.message}`;
      return pos > 1
        ? `Added — ${date} now has ${pos} sessions.`
        : `Added to ${date}.`;
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
      // NOT "ai_assistant". metrics_source_check allows exactly:
      //   client | trainer_backfill | claude | migration | smart_scale | InBody | caliper
      // so every log_my_weight call returned 23514 and the client was told
      // "Couldn't log that: new row for relation metrics violates check
      // constraint metrics_source_check". Never once succeeded.
      //
      // 'claude' rather than 'client' on purpose: it is the established "an AI
      // wrote this row" marker (metrics already holds four), and it keeps the
      // provenance that a number arrived by talking to the coach rather than
      // being typed into the weigh-in form. Dustin — one word to change if you
      // would rather these read as plain client entries.
      const patch: Record<string, unknown> = { client_id: clientId, metric_date: date, source: "claude" };
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
