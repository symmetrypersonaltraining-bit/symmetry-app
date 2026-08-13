// POST /api/video-candidates/decide
// Body: { id: string, action: "approve" | "reject" }
//
// The one route in the video pipeline that changes what a client sees.
//
// Everything upstream of this — the searches, the duration checks — writes only
// to exercise_video_candidates, a staging table nobody but Dustin ever reads.
// That is on purpose. The candidates came out of a web search run by an agent,
// which is a perfectly good way to find a demo of a Romanian deadlift and a
// perfectly good way to find a fourteen-minute critique of one. Nothing found
// that way goes in front of a client without a human looking at it first.
//
// So: approve writes exercises.video_url and nothing else does.
//
// Approving is REVERSIBLE and the route makes sure of it. The exercise's
// previous video_url is stashed on the candidate row before the write, so a bad
// approval can be undone from the same screen rather than needing the old URL
// dug out of a backup. Most of the 252 have no video at all, so usually the
// stash is empty — but the ones that DO have a video are exactly the ones where
// overwriting silently would be expensive.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrainerUser } from "@/lib/trainer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isTrainerUser(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || (action !== "approve" && action !== "reject" && action !== "undo")) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: cand } = await db
    .from("exercise_video_candidates")
    .select("id, exercise_id, url, duration_sec, status, previous_video_url")
    .eq("id", id)
    .maybeSingle();
  if (!cand) return NextResponse.json({ error: "No such candidate" }, { status: 404 });

  const c = cand as {
    id: string;
    exercise_id: string;
    url: string;
    duration_sec: number | null;
    status: string;
    previous_video_url: string | null;
  };

  if (action === "reject") {
    await db
      .from("exercise_video_candidates")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "undo") {
    if (c.status !== "approved") {
      return NextResponse.json({ error: "That one was never approved" }, { status: 400 });
    }
    // Back to whatever was there before — usually null, which is correct: an
    // exercise with no video is the state we started from, not an error state.
    await db.from("exercises").update({ video_url: c.previous_video_url }).eq("id", c.exercise_id);
    await db
      .from("exercise_video_candidates")
      .update({ status: "pending", reviewed_at: null })
      .eq("id", id);
    return NextResponse.json({ ok: true, status: "pending" });
  }

  // approve
  //
  // A candidate with no verified duration cannot be approved, full stop. This
  // is the guard that makes the whole "under thirty seconds" rule real rather
  // than aspirational — without it the queue would happily hand over the rows
  // whose length could not be read, which are precisely the ones nobody has
  // checked. 'too_long' IS approvable: Dustin overriding his own rule for the
  // only decent demo of a movement is a judgement call, and he can see the
  // number when he makes it. Never verifying is not a judgement call.
  if (c.duration_sec == null) {
    return NextResponse.json(
      { error: "That one has no verified length yet — run the duration check first" },
      { status: 400 },
    );
  }

  const { data: ex } = await db
    .from("exercises")
    .select("video_url")
    .eq("id", c.exercise_id)
    .maybeSingle();
  const previous = (ex as { video_url: string | null } | null)?.video_url ?? null;

  const { error: exErr } = await db
    .from("exercises")
    .update({ video_url: c.url, video_status: "ok", video_checked_at: new Date().toISOString() })
    .eq("id", c.exercise_id);
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  await db
    .from("exercise_video_candidates")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      previous_video_url: previous,
    })
    .eq("id", id);

  // The others for this exercise are moot the moment one is chosen. Left
  // pending they would sit in the queue forever asking about a job already
  // done, which is how a review queue stops being read.
  await db
    .from("exercise_video_candidates")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("exercise_id", c.exercise_id)
    .neq("id", id)
    .in("status", ["pending", "too_long"]);

  return NextResponse.json({ ok: true, status: "approved", replaced: previous });
}
