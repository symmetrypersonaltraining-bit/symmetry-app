// What the client ACTUALLY LIFTED. The thing the AI could not see.
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
//
// Dustin, 15 Aug: the AI "should know everything about every client and be able
// to respond appropriately to any request or question a client has... cut back
// massive amounts of busy work for me answering questions the ai could just
// answer using the real data in the system."
//
// Audited that same night. Every client-facing AI surface knew the programme,
// the plan, the targets and the goal — and NOT ONE of them could see a single
// logged set. The database holds 8,406 of them, 5,524 in the last thirty days,
// across 29 clients. So "what did I press last time?" — the most ordinary
// question anybody asks in a gym, and one the app already knows the answer to —
// could not be answered by the assistant standing right there on the screen.
// It had to say it did not know, or it had to be asked of Dustin. Every time.
//
// ── THE SHAPE, AND WHY IT IS TWO BLOCKS ────────────────────────────────────
//
// Two different questions need two different answers:
//
//   "What did I do last session?"      → chronological, whole sessions
//   "What did I use on X last time?"   → per movement, most recent load
//
// The second cannot be derived from a short window of the first: someone might
// last have squatted three weeks ago. So the per-movement view looks back
// further and keeps only one line each.
//
// ── DATA NOTES THAT COST TIME TO LEARN ─────────────────────────────────────
//
// `set_logs.weight` is ALWAYS NULL — 0 rows of 8,397 populated. The real column
// is `weight_lbs` (5,631 rows). Reading the obvious one returns nothing, and it
// returns nothing quietly.
//
// A set can carry reps, a load, a duration, a distance or several. Bands and
// bodyweight work have reps and no load; cardio has a duration and neither.
// Rendering "0 lb" for a band pull-apart would be a small lie that the model
// will happily repeat, so absent stays absent.

import type { Db } from "@/lib/ai/scope";

/** Sessions to describe in full. About a fortnight for most people. */
const RECENT_SESSIONS = 6;
/** How far back the per-movement view looks. */
const MOVEMENT_WINDOW_DAYS = 90;
/** Movements listed in the per-movement view, most recent first. */
const MAX_MOVEMENTS = 30;
/** Hard cap on rows pulled, so a very active client cannot blow the context. */
const MAX_ROWS = 400;

interface SetRow {
  logged_at: string;
  set_number: number | null;
  reps: number | null;
  weight_lbs: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  exercises: { name: string | null } | null;
}

/** "185 lb × 8", "20 reps", "2:30", "3 × 12 @ RPE 8" — whatever the set has. */
function describeSet(s: SetRow): string {
  const bits: string[] = [];
  if (s.weight_lbs != null && s.reps != null) bits.push(`${s.weight_lbs} lb × ${s.reps}`);
  else if (s.weight_lbs != null) bits.push(`${s.weight_lbs} lb`);
  else if (s.reps != null) bits.push(`${s.reps} reps`);
  if (s.duration_seconds != null) {
    const m = Math.floor(s.duration_seconds / 60);
    const sec = s.duration_seconds % 60;
    bits.push(m ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`);
  }
  if (s.distance_meters != null) bits.push(`${s.distance_meters}m`);
  if (s.rpe != null) bits.push(`RPE ${s.rpe}`);
  return bits.join(" · ") || "logged";
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The training-history block for a client's AI context, or "" if they have
 * never logged a set.
 *
 * Never throws. An AI answer that is missing this is worse than one without it,
 * but an AI answer that never arrives because a history query failed is worse
 * than both.
 */
export async function trainingHistoryBlock(db: Db, clientId: string): Promise<string> {
  try {
    const since = new Date(Date.now() - MOVEMENT_WINDOW_DAYS * 86400_000)
      .toISOString()
      .slice(0, 10);

    const { data } = await db
      .from("set_logs")
      .select("logged_at, set_number, reps, weight_lbs, duration_seconds, distance_meters, rpe, exercises(name)")
      .eq("client_id", clientId)
      .eq("completed", true)
      .gte("logged_at", since)
      .order("logged_at", { ascending: false })
      .limit(MAX_ROWS);

    const rows = ((data as unknown as SetRow[] | null) || []).filter((r) => r.exercises?.name && r.logged_at);
    if (!rows.length) return "";

    // ── per session ────────────────────────────────────────────────────────
    const byDay = new Map<string, SetRow[]>();
    for (const r of rows) {
      const d = dayOf(r.logged_at);
      const list = byDay.get(d);
      if (list) list.push(r);
      else byDay.set(d, [r]);
    }

    const sessionLines: string[] = [];
    for (const [day, sets] of [...byDay.entries()].slice(0, RECENT_SESSIONS)) {
      // Group by movement so a five-set exercise reads as one entry rather
      // than five, which is both shorter and how a person would say it.
      const byEx = new Map<string, SetRow[]>();
      for (const s of sets) {
        const n = s.exercises!.name as string;
        const l = byEx.get(n);
        if (l) l.push(s);
        else byEx.set(n, [s]);
      }
      const parts = [...byEx.entries()].map(([name, ss]) => {
        const ordered = ss.slice().sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0));
        return `${name} ${ordered.map(describeSet).join(", ")}`;
      });
      sessionLines.push(`· ${day} — ${parts.join(" | ")}`);
    }

    // ── per movement, most recent load ─────────────────────────────────────
    // Answers "what did I use on X last time", which is the question this whole
    // file exists for. Heaviest completed set of that movement's most recent
    // day, because "what did I use" means the working set, not the warm-up.
    const lastByMovement = new Map<string, { day: string; best: SetRow }>();
    for (const r of rows) {
      const name = r.exercises!.name as string;
      const day = dayOf(r.logged_at);
      const seen = lastByMovement.get(name);
      if (!seen) {
        lastByMovement.set(name, { day, best: r });
        continue;
      }
      if (day > seen.day) {
        lastByMovement.set(name, { day, best: r });
      } else if (day === seen.day) {
        const a = r.weight_lbs ?? -1;
        const b = seen.best.weight_lbs ?? -1;
        if (a > b) seen.best = r;
      }
    }

    const movementLines = [...lastByMovement.entries()]
      .sort((x, y) => (x[1].day < y[1].day ? 1 : x[1].day > y[1].day ? -1 : 0))
      .slice(0, MAX_MOVEMENTS)
      .map(([name, v]) => `· ${name} — ${describeSet(v.best)} (${v.day})`);

    return [
      "RECENT SESSIONS (what they actually did, from their own logs):",
      ...sessionLines,
      "",
      "LAST LOGGED SET PER MOVEMENT — use this when they ask what they used last time:",
      ...movementLines,
      "",
      "These are logged facts, not estimates. If a movement is not listed here, they have not logged it in the last " +
        MOVEMENT_WINDOW_DAYS +
        " days — say so rather than guessing a number.",
    ].join("\n");
  } catch {
    return "";
  }
}
