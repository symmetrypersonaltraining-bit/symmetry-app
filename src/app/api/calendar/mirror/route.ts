// POST /api/calendar/mirror  →  publish this trainer's sessions to their
//                               dedicated Google calendar
//
// The write half of the PushPress answer. See src/lib/sessionMirror.ts for why
// it is a separate calendar and not his own.
//
// Callable three ways, which is the same set /api/gcal-sync accepts: Vercel's
// cron, the database scheduler, or a signed-in trainer pressing the button.
// A trainer can only ever mirror THEIR OWN sessions — the trainer is resolved
// from the session and there is no parameter that could name another.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/gcal";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { mirrorSessions, MirrorSession } from "@/lib/sessionMirror";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS_BACK = 14;
const DAYS_AHEAD = 120;

type TrainerRow = {
  id: string;
  name: string | null;
  auth_user_id: string | null;
  session_mirror_enabled: boolean;
  session_mirror_calendar_id: string | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = createAdminClient();
  const { data } = await db
    .from("trainers")
    .select("id, name, auth_user_id, session_mirror_enabled, session_mirror_calendar_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const trainer = data as TrainerRow | null;
  if (!trainer) return NextResponse.json({ error: "Not a trainer" }, { status: 403 });
  if (!trainer.session_mirror_enabled) {
    return NextResponse.json({ skipped: true, reason: "The mirrored calendar is switched off." });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() - DAYS_BACK * 86400000);
  const windowEnd = new Date(now.getTime() + DAYS_AHEAD * 86400000);

  try {
    // COMPLETE, not merely large. mirrorSessions() treats anything of ours that
    // is missing from this list as a session that no longer exists and deletes
    // the event — so a read truncated at PostgREST's 1,000-row cap would not
    // under-publish, it would wipe most of the gym's view of his week.
    const sessions = await fetchAllRows<MirrorSession>(
      () =>
        db.rpc("trainer_session_rows", {
          p_trainer_id: trainer.id,
          p_days_back: DAYS_BACK,
          p_days_ahead: DAYS_AHEAD,
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
    });

    // CHECKED, and the result is reported. If this write is lost the calendar
    // id is not remembered, and the NEXT run cannot find the calendar it just
    // made — so it creates a second one, and the gym ends up subscribed to a
    // calendar nothing is publishing to any more.
    const { error: saveErr } = await db
      .from("trainers")
      .update({
        session_mirror_calendar_id: result.calendarId,
        session_mirror_synced_at: new Date().toISOString(),
        // The last run's errors are kept rather than cleared on a partial
        // success. A mirror that quietly half-works is the thing that makes the
        // gym's calendar wrong without anybody being told.
        session_mirror_error: result.errors.length ? result.errors.slice(0, 5).join(" | ") : null,
      })
      .eq("id", trainer.id);

    return NextResponse.json({
      ok: true,
      saveError: saveErr ? saveErr.message : null,
      calendarId: result.calendarId,
      createdCalendar: result.createdCalendar,
      published: result.written,
      removed: result.removed,
      total: sessions.length,
      errors: result.errors.slice(0, 10),
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    // Best effort, and said so: the run already failed, and failing to record
    // WHY it failed must not replace the reason with a different one.
    const { error: noteErr } = await db
      .from("trainers")
      .update({ session_mirror_error: msg.slice(0, 500) })
      .eq("id", trainer.id);
    return NextResponse.json(
      { error: msg, noteError: noteErr ? noteErr.message : null },
      { status: 500 },
    );
  }
}
