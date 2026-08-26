// POST /api/calendar/mirror  →  publish this trainer's sessions to their
//                               dedicated Google calendar
//
// The manual half. The automatic half is /api/cron/session-mirror, on its own
// schedule, through the same runSessionMirror(). It used to run at the tail of
// the Google Calendar sync; see that cron route for why that was a mistake.
//
// A trainer can only ever mirror THEIR OWN sessions: the trainer is resolved
// from the session and there is no parameter that could name another.
//
// Body: { full?: true } rewrites every event rather than only what changed.
// For the first publish, or after somebody has edited the mirror by hand.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSessionMirror, MirrorTrainer, MIRROR_TRAINER_COLS } from "@/lib/runSessionMirror";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}) as { full?: boolean });

  const db = createAdminClient();
  const { data } = await db
    .from("trainers")
    .select(MIRROR_TRAINER_COLS)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const trainer = data as unknown as MirrorTrainer | null;
  if (!trainer) return NextResponse.json({ error: "Not a trainer" }, { status: 403 });

  try {
    const out = await runSessionMirror(db, trainer, { full: body?.full === true });
    if ("skipped" in out) return NextResponse.json({ skipped: true, reason: out.skipped });
    return NextResponse.json({ ok: true, ...out });
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
