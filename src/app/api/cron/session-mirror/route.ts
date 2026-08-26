/**
 * GET/POST /api/cron/session-mirror — publish the gym's copy of the sessions.
 *
 * ── WHY THIS IS ITS OWN SCHEDULE ─────────────────────────────────────────────
 *
 * It used to run at the tail of /api/gcal-sync, on the reasoning that the
 * appointment rows are freshest right after the sync writes them, so publishing
 * there added no latency. That reasoning was fine. Putting it INSIDE the same
 * request was not.
 *
 * What actually happened, 25 Aug 2026: gcal-sync already used ~55 of its 60
 * seconds. The mirror was hung on the end, it created events with PUT (which
 * does not create — Google answers 404), every write failed, nothing was ever
 * marked published, and so all 200 writes were retried on the following hour.
 * Two hundred doomed Google calls an hour, inside a budget that had five
 * seconds of headroom. The calendar sync — billing, appointments, payment
 * reminders, the thing the whole business runs on — timed out every hour for a
 * day and a half because of a nice-to-have that publishes a read-only copy for
 * another trainer to glance at.
 *
 * The lesson is not "fix the PUT". It is that the mirror must not be able to
 * spend the sync's time at all. It has its own request, its own 60 seconds and
 * its own wall-clock deadline inside that, so the worst thing a broken mirror
 * can do is fail to mirror.
 *
 * Latency cost of the split: it runs at :40, the sync at :25. A cancellation
 * reaches the gym within the hour either way.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron-auth";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { runSessionMirror, MirrorTrainer, MIRROR_TRAINER_COLS } from "@/lib/runSessionMirror";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Leaves ~12s of the 60 for the trainers still to come and for the response
 * itself. runSessionMirror stops writing at this instant and reports itself
 * capped, which is the honest outcome — the next run finishes the job.
 */
const BUDGET_MS = 48_000;

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  const deadlineMs = startedAt + BUDGET_MS;
  const db = createAdminClient();

  const { data: rows, error } = await db
    .from("trainers")
    .select(MIRROR_TRAINER_COLS)
    .eq("session_mirror_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const trainers = (rows || []) as unknown as MirrorTrainer[];
  const mirrors: Record<string, unknown>[] = [];

  for (const t of trainers) {
    // Out of time before this trainer even started. Reported rather than
    // attempted — a mirror pass begun with two seconds left publishes almost
    // nothing and still costs a full listing of the calendar.
    if (Date.now() > deadlineMs) {
      mirrors.push({ trainer_id: t.id, skipped: "out of time — next run" });
      continue;
    }
    try {
      const out = await runSessionMirror(db, t, { deadlineMs });
      if ("skipped" in out) { mirrors.push({ trainer_id: t.id, skipped: out.skipped }); continue; }
      mirrors.push({
        trainer_id: t.id,
        published: out.written,
        unchanged: out.unchanged,
        removed: out.removed,
        capped: out.cappedAt,
        errors: out.errors.slice(0, 5),
      });
    } catch (e) {
      // One trainer's dead Google credential must not stop the next one's
      // mirror. The reason is recorded on the trainer row by runSessionMirror
      // where it can be; here it is at least in the response.
      mirrors.push({ trainer_id: t.id, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, ms: Date.now() - startedAt, trainers: trainers.length, mirrors });
}
