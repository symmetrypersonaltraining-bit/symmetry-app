// Trainer-only. What the video fill actually did, and what it could not do.
//
// This started life as an approval queue — 151 candidates, two buttons each.
// Dustin killed that: "you put all videos in the app that are currently there
// without my checking every one why cant you do it now?" The 553 videos already
// in the library went in unreviewed, so making the next 250 the only ones that
// needed sign-off was holding them to a standard nothing else met, and the
// queue would simply have sat there.
//
// So the videos fill themselves in and this page inverts: it shows what went
// in, newest first, with one-tap undo on anything wrong. Checking is now
// optional and cheap instead of mandatory and expensive — which is the only
// version of it that actually happens.

import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/serverUser";
import { redirect } from "next/navigation";
import { isTrainerUser } from "@/lib/trainer";
import VideoQueueClient, { type Candidate } from "./VideoQueueClient";

export const dynamic = "force-dynamic";

export default async function VideoQueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");
  if (!isTrainerUser(user)) redirect("/home");

  const cols =
    "id, exercise_id, exercise_name, url, title, channel, duration_sec, confidence, note, status, applied_at";

  const [{ data: applied }, { data: waiting }, { count: stillMissing }, { count: unverified }] =
    await Promise.all([
      supabase
        .from("exercise_video_candidates")
        .select(cols)
        .eq("status", "approved")
        .not("applied_at", "is", null)
        .order("exercise_name")
        .limit(400),
      // Measured, under the ceiling, but their exercise already had a video —
      // or too long, which is a judgement call rather than a rejection.
      supabase
        .from("exercise_video_candidates")
        .select(cols)
        .in("status", ["pending", "too_long"])
        .not("duration_sec", "is", null)
        .order("exercise_name")
        .limit(400),
      supabase
        .from("exercises")
        .select("id", { count: "exact", head: true })
        .or("video_url.is.null,video_url.eq."),
      supabase
        .from("exercise_video_candidates")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("duration_sec", null),
    ]);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>
          Exercise videos
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
          {(applied || []).length} filled in automatically · {stillMissing ?? 0} exercises still
          have none
        </p>
      </div>
      <VideoQueueClient
        applied={(applied || []) as Candidate[]}
        waiting={(waiting || []) as Candidate[]}
        unverifiedCount={unverified ?? 0}
      />
    </div>
  );
}
