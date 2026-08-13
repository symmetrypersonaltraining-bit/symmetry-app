// Trainer-only. The review queue for exercise demo videos.
//
// 252 of 847 exercises have no video. Agents searched YouTube and staged 151
// candidates; this is where they become real, one human decision at a time.
// Nothing on this page is automatic — see the header of
// /api/video-candidates/decide for why that is deliberate.

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isTrainerUser } from "@/lib/trainer";
import VideoQueueClient, { type Candidate } from "./VideoQueueClient";

export const dynamic = "force-dynamic";

export default async function VideoQueuePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isTrainerUser(user)) redirect("/home");

  const { data } = await supabase
    .from("exercise_video_candidates")
    .select("id, exercise_id, exercise_name, url, title, channel, duration_sec, confidence, note, status")
    .in("status", ["pending", "too_long"])
    .order("exercise_name");

  const { count: stillMissing } = await supabase
    .from("exercises")
    .select("id", { count: "exact", head: true })
    .or("video_url.is.null,video_url.eq.");

  const { count: unverified } = await supabase
    .from("exercise_video_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("duration_sec", null);

  return (
    <div className="p-4 lg:p-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: "var(--brand-text)" }}>
          Exercise videos
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
          {stillMissing ?? 0} exercises still have no video · {(data || []).length} candidates waiting on you
        </p>
      </div>
      <VideoQueueClient
        candidates={(data || []) as Candidate[]}
        unverifiedCount={unverified ?? 0}
      />
    </div>
  );
}
