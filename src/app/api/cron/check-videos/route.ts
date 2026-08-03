// GET /api/cron/check-videos — find the demo videos that no longer play.
//
// Jennifer Day, mid-workout: "Video unavailable — this video is no longer
// available because the YouTube account associated with this video has been
// terminated." A terminated ACCOUNT takes every video from that channel with
// it, so that report is not one broken link. There are 553 YouTube URLs in the
// exercise library and no way to know how many came from the same uploader.
//
// Before this, the only detection mechanism was a client tapping play in the
// middle of a set, getting an error, and caring enough to report it. Jennifer
// does. Most people will silently decide the app is broken and stop tapping.
//
// HOW IT CHECKS. YouTube's oEmbed endpoint needs no API key and no quota, and
// returns 404 for a video that is removed, private, or whose account is gone —
// which is exactly the set we care about. Embeddability is not tested
// separately: if oEmbed answers, the thumbnail and title resolve, which is what
// the logger shows.
//
// A FAILED CHECK IS NOT A DEAD VIDEO. Network errors and rate limits record
// 'error', never 'dead'. Conflating them would let one bad run hide hundreds of
// working demos from every client at once — a far worse outcome than the bug
// this fixes.
//
// Batched and oldest-first so a run stays inside the function timeout and
// successive runs sweep the whole library. Nothing here writes to a client's
// data; the worst case is a stale status column.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 60;
const CONCURRENCY = 6;

/** The 11-character id out of any YouTube URL shape we store. */
function videoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/embed\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function checkOne(url: string): Promise<"ok" | "dead" | "error"> {
  const id = videoId(url);
  if (!id) return "error"; // not a shape we recognise — not evidence it is dead
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (res.status === 404 || res.status === 400) return "dead";
    if (!res.ok) return "error";
    return "ok";
  } catch {
    return "error";
  }
}

export async function GET(req: Request) {
  const authed =
    (await isDbSchedulerRequest(req)) ||
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = createAdminClient();

  // Oldest check first, unchecked before that. Successive runs sweep everything
  // rather than re-testing the same 60 rows forever.
  const { data, error } = await db
    .from("exercises")
    .select("id, name, video_url, video_checked_at")
    .not("video_url", "is", null)
    .neq("video_url", "")
    .order("video_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as { id: string; name: string; video_url: string }[] | null) || [];
  const dead: string[] = [];
  let ok = 0;
  let errored = 0;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((r) => checkOne(r.video_url)));
    await Promise.all(
      slice.map((r, j) => {
        const status = results[j];
        if (status === "dead") dead.push(r.name);
        else if (status === "ok") ok += 1;
        else errored += 1;
        return db
          .from("exercises")
          .update({ video_status: status, video_checked_at: new Date().toISOString() })
          .eq("id", r.id);
      }),
    );
  }

  // Dead videos are worth surfacing, not just recording. One row per sweep,
  // only when something was actually found — a log that fires every run stops
  // being read.
  if (dead.length) {
    try {
      await db.from("app_feedback").insert({
        source: "system",
        client_context: "/library/exercises",
        transcript:
          `[VIDEO CHECK] ${dead.length} exercise video${dead.length === 1 ? "" : "s"} no longer play: ` +
          dead.slice(0, 25).join(", ") +
          (dead.length > 25 ? `, and ${dead.length - 25} more` : ""),
        status: "new",
      });
    } catch { /* the statuses are recorded either way */ }
  }

  return NextResponse.json({ checked: rows.length, ok, dead: dead.length, errored, deadNames: dead });
}
