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
import { viewerIsTrainer } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await viewerIsTrainer(supabase, user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    const { error } = await db
      .from("exercise_video_candidates")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    // A rejection that did not land leaves the candidate in the queue, and the
    // screen says rejected — so the same clip comes back tomorrow and the queue
    // stops being read.
    if (error) return NextResponse.json({ error: `Not rejected — ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (action === "undo") {
    if (c.status !== "approved") {
      return NextResponse.json({ error: "That one was never approved" }, { status: 400 });
    }
    // Back to whatever was there before — usually null, which is correct: an
    // exercise with no video is the state we started from, not an error state.
    //
    // This is the write that IS the undo. Unchecked, a failure left the bad
    // video in front of clients while the queue said pending — the one state
    // that reads as "handled" and is not.
    const { error: restoreErr } = await db
      .from("exercises")
      .update({ video_url: c.previous_video_url })
      .eq("id", c.exercise_id);
    if (restoreErr) {
      return NextResponse.json(
        { error: `Not undone — the video is still live on that exercise. ${restoreErr.message}` },
        { status: 500 },
      );
    }
    const { error: markErr } = await db
      .from("exercise_video_candidates")
      .update({ status: "pending", reviewed_at: null })
      .eq("id", id);
    if (markErr) {
      // The video IS off the exercise, which is what mattered. The candidate
      // still reads approved, so say so rather than let the queue disagree
      // with what clients see.
      return NextResponse.json(
        { error: `Video removed, but the candidate still shows as approved — ${markErr.message}`, restored: true },
        { status: 500 },
      );
    }
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

  // THE write that makes an approval reversible. This file opens by promising
  // "Approving is REVERSIBLE and the route makes sure of it" — and that promise
  // lived entirely in this one unchecked call. If it failed, the candidate
  // stayed `pending`, so the undo path refuses outright ("That one was never
  // approved"), and `previous_video_url` was never stashed, so the old URL is
  // gone. The video is live in front of clients and cannot be taken back from
  // the screen that put it there.
  const { error: markErr } = await db
    .from("exercise_video_candidates")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      previous_video_url: previous,
    })
    .eq("id", id);
  if (markErr) {
    // Put the exercise back rather than leave an un-undoable approval standing.
    const { error: rollbackErr } = await db
      .from("exercises")
      .update({ video_url: previous })
      .eq("id", c.exercise_id);
    if (!rollbackErr) {
      return NextResponse.json(
        { error: `Not approved — nothing changed. ${markErr.message}` },
        { status: 500 },
      );
    }
    // Both failed. Hand back the previous URL, because it exists nowhere else
    // now and it is the only thing that makes this recoverable by hand.
    return NextResponse.json(
      {
        error:
          `The video is now live on that exercise but the approval could not be recorded, ` +
          `so it cannot be undone from here. Previous video: ${previous ?? "none"}. ${markErr.message}`,
        live: true,
        previous,
      },
      { status: 500 },
    );
  }

  // The others for this exercise are moot the moment one is chosen. Left
  // pending they would sit in the queue forever asking about a job already
  // done, which is how a review queue stops being read.
  //
  // Not fatal — the approval stands either way — but it must be capable of
  // saying so, or the queue quietly regrows.
  const { error: supErr } = await db
    .from("exercise_video_candidates")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("exercise_id", c.exercise_id)
    .neq("id", id)
    .in("status", ["pending", "too_long"]);
  if (supErr) console.error("video-candidates/decide: could not supersede siblings —", supErr.message);

  return NextResponse.json({ ok: true, status: "approved", replaced: previous });
}
