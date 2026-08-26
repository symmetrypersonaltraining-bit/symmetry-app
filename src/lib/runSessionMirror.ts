/**
 * Running the mirror — the one path, used by both callers.
 *
 * The button in Settings and the tail of every Google Calendar sync do exactly
 * the same thing, so they call exactly the same function. Two copies of "what
 * publishing means" would drift, and the drift would show as the gym's calendar
 * being right after a manual publish and wrong after an automatic one, with
 * nothing on screen to say which had last run.
 *
 * ── WHY IT HAS ITS OWN SCHEDULE ──────────────────────────────────────────────
 *
 * The chain from Dustin turning a session orange to another trainer seeing it:
 *
 *     his Google  →  gcal-sync  →  appointments  →  mirror  →  the gym
 *
 * This used to run at the tail of gcal-sync, so the mirror was current the
 * moment the appointment row was. That saved fifteen minutes of latency and
 * cost a day and a half of outage: the mirror failed every write, retried all
 * of them hourly, and did it inside a sync that had five seconds of headroom.
 * See /api/cron/session-mirror for the full account. It now runs at :40 against
 * rows the sync wrote at :25, which is close enough for a read-only copy and
 * cannot take billing down.
 */

import { getValidAccessToken } from "@/lib/gcal";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { mirrorSessions, MirrorSession, MirrorResult } from "@/lib/sessionMirror";

export const MIRROR_DAYS_BACK = 14;
export const MIRROR_DAYS_AHEAD = 120;

/**
 * A first publish is ~721 events and cannot fit in one request. It is capped,
 * SAID to be capped, and finished by the next pass — which, hanging off the
 * hourly sync, is within the hour. The alternative is a request that times out
 * halfway and reports nothing at all.
 */
export const MIRROR_MAX_WRITES_PER_RUN = 200;

export type MirrorTrainer = {
  id: string;
  auth_user_id: string | null;
  session_mirror_enabled: boolean;
  session_mirror_calendar_id: string | null;
  session_mirror_synced_at: string | null;
};

export const MIRROR_TRAINER_COLS =
  "id, auth_user_id, session_mirror_enabled, session_mirror_calendar_id, session_mirror_synced_at";

export type RunMirrorOutcome =
  | { skipped: string }
  | (MirrorResult & { total: number; saveError: string | null });

/**
 * `db` is a service-role client. `full` forces a rewrite of every event rather
 * than only what changed — the first run, or after somebody has edited the
 * mirror by hand and it needs putting back. `deadlineMs` is a wall-clock stop:
 * the pass gives up writing at that instant and reports itself capped, which is
 * what keeps a slow Google from consuming the whole request.
 */
export async function runSessionMirror(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  trainer: MirrorTrainer,
  opts: { full?: boolean; deadlineMs?: number } = {},
): Promise<RunMirrorOutcome> {
  if (!trainer.session_mirror_enabled) {
    return { skipped: "The mirrored calendar is switched off." };
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - MIRROR_DAYS_BACK * 86400000);
  const windowEnd = new Date(now.getTime() + MIRROR_DAYS_AHEAD * 86400000);

  // COMPLETE, not merely large. mirrorSessions() treats anything of ours that
  // is missing from this list as a session that no longer exists and deletes
  // the event — so a read truncated at PostgREST's 1,000-row cap would not
  // under-publish, it would wipe most of the gym's view of his week.
  const sessions = await fetchAllRows<MirrorSession>(
    () =>
      db.rpc("trainer_session_rows", {
        p_trainer_id: trainer.id,
        p_days_back: MIRROR_DAYS_BACK,
        p_days_ahead: MIRROR_DAYS_AHEAD,
      }),
    { label: "sessionMirror", orderedBy: "trainer_session_rows() ORDER BY scheduled_at, id" },
  );

  const { token } = await getValidAccessToken(trainer.auth_user_id ?? undefined);

  const result = await mirrorSessions({
    token,
    calendarId: trainer.session_mirror_calendar_id,
    sessions,
    windowStart,
    windowEnd,
    since:
      opts.full || !trainer.session_mirror_synced_at
        ? null
        : new Date(trainer.session_mirror_synced_at),
    maxWrites: MIRROR_MAX_WRITES_PER_RUN,
    deadlineMs: opts.deadlineMs,
  });

  // THE WATERMARK ONLY MOVES ON A CLEAN, COMPLETE PASS. Advancing it after a
  // capped or partly-failed run would mark the sessions it never wrote as
  // already published, and they would never be written again — the gym would
  // be permanently missing a block of his week with nothing reporting a fault.
  const clean = result.cappedAt === null && result.errors.length === 0;

  const { error: saveErr } = await db
    .from("trainers")
    .update({
      session_mirror_calendar_id: result.calendarId,
      ...(clean ? { session_mirror_synced_at: now.toISOString() } : {}),
      session_mirror_error: clean
        ? null
        : [
            result.cappedAt ? `stopped after ${result.cappedAt} — finishing next run` : null,
            ...result.errors.slice(0, 4),
          ]
            .filter(Boolean)
            .join(" | "),
    })
    .eq("id", trainer.id);

  return { ...result, total: sessions.length, saveError: saveErr ? saveErr.message : null };
}
