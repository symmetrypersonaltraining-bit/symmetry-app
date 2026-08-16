// POST /api/video-candidates/verify — measure each candidate, then FILL IT IN.
//
// 252 of the 847 exercises in the library have no demo video. A client who taps
// play on one of those gets nothing, mid-set, and the app looks half-finished
// at exactly the moment it is meant to be useful.
//
// Dustin, 2026-08-13: "We have a ton of exercises in the library that do not
// have videos... All videos need to be under thirty seconds, preferably under
// twenty seconds."
//
// This route first shipped as measurement only, with every candidate parked in
// a 151-item review queue for Dustin to approve one at a time. He pushed back,
// correctly: "you put all videos in the app that are currently there without my
// checking every one why cant you do it now? find vidoes for each movement and
// make sure they are under 30 second videos then put them in there."
//
// He is right, and the reason is worth keeping. The 553 videos ALREADY in the
// library went in without anyone reviewing them one by one. Holding the next
// 250 to a stricter standard than the 553 they sit beside is not caution, it is
// just the job not getting done — and the queue would have sat there.
//
// So a measured candidate under the ceiling now applies itself, and the review
// screen becomes "here is what went in, undo anything wrong" rather than
// "approve 151 things". `applied_at` marks them so that screen can exist.
//
// WHAT IS STILL GATED, and this part does not move: the LENGTH. A candidate
// whose duration could not be read is never applied. That is the entire point
// of measuring — an eleven-minute talking-head review of a movement is worse
// than no video, because it ships looking fine and only fails in front of a
// client mid-set. Unmeasured means unknown, and unknown does not go in.
//
// The check runs HERE, on Vercel, where the network is real. The sandbox this
// was built in has no route to youtube.com at all — every request dies at the
// proxy, curl included. Same trick as /api/cron/check-videos: no API key, no
// quota, no Google project to stand up, nothing to rotate later.
//
//   oEmbed  → does it exist at all (404 = removed/private/account gone)
//   watch page → "lengthSeconds":"NN" out of ytInitialPlayerResponse
//
// Batched, because 151 sequential page fetches do not fit in a function
// timeout. Call it until `remaining` comes back 0.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrainerUser } from "@/lib/trainer";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 30;
const CONCURRENCY = 6;

/**
 * Dustin's ceiling. Anything longer is not a demo, it is a video.
 *
 * Raised 30 → 60 on 14 Aug, by him, on numbers rather than taste.
 *
 * 119 exercises had no video and it read like a search problem — it was not.
 * Only FOUR of the 119 had never been searched. The other 112 already had a
 * video found and sitting in `too_long`, because the shortest clip anyone could
 * find for them was 31 seconds and the ceiling was 30. One second.
 *
 * What the whole pile looked like, by the shortest candidate per exercise:
 *
 *     ceiling   exercises that gain a video   still without
 *        30s              0                        119
 *        45s             33                         86
 *        60s             67                         52     ← chosen
 *        90s             83                         36
 *       180s            106                         13
 *
 * 60 is where the curve bends: 30→60 buys 67 exercises, 60→90 buys 16 more for
 * triple the length. A minute is still short enough to watch between sets,
 * which is the only thing the ceiling is really protecting.
 *
 * IDEAL_SECONDS is untouched at 20 — the queue still sorts toward short, so a
 * better clip surfacing later still wins. This raises what is ACCEPTABLE, not
 * what is preferred.
 */
export const MAX_SECONDS = 60;
/** What he actually wants. Used for sorting the review queue, not for rejecting. */
export const IDEAL_SECONDS = 20;

/** The 11-character id out of any YouTube URL shape the agents recorded. */
export function videoId(url: string): string | null {
  const m =
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/embed\/([A-Za-z0-9_-]{11})/) ||
    url.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/**
 * Pull the length out of a watch page.
 *
 * Exported so it can be tested against captured HTML rather than the live site
 * — the day YouTube renames this field, the test tells us, instead of every
 * candidate silently becoming 'unverified' and the queue quietly emptying.
 */
export function lengthFromHtml(html: string): number | null {
  // Which field matched has to be tracked explicitly rather than guessed from
  // the magnitude: 19000 is a plausible number of seconds (five hours) AND the
  // millisecond form of a nineteen-second demo, so no threshold can tell them
  // apart. Guessing here would round every good short clip up into 'too_long'.
  const secs = html.match(/"lengthSeconds"\s*:\s*"?(\d+)"?/);
  if (secs) {
    const n = Number(secs[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const ms = html.match(/"approxDurationMs"\s*:\s*"?(\d+)"?/);
  if (ms) {
    const n = Number(ms[1]);
    if (Number.isFinite(n) && n > 0) return Math.round(n / 1000);
  }
  return null;
}

type Verdict =
  | { status: "ok"; seconds: number; title: string | null; channel: string | null }
  | { status: "too_long"; seconds: number; title: string | null; channel: string | null }
  | { status: "dead" }
  | { status: "unverified" };

async function verifyOne(url: string): Promise<Verdict> {
  const id = videoId(url);
  if (!id) return { status: "unverified" };

  let title: string | null = null;
  let channel: string | null = null;

  // Does it exist? A 404 here is the one unambiguous answer we get.
  try {
    const o = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (o.status === 404 || o.status === 400) return { status: "dead" };
    if (o.ok) {
      const j = (await o.json()) as { title?: string; author_name?: string };
      title = j.title ?? null;
      channel = j.author_name ?? null;
    }
  } catch {
    // A network wobble is not evidence of anything. Fall through and try the
    // watch page; if that fails too the row stays unverified and is retried.
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        // Without a browser-shaped UA the response is often a consent
        // interstitial with no player payload in it.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return { status: "unverified" };
    const seconds = lengthFromHtml(await res.text());
    if (seconds == null) return { status: "unverified" };
    return { status: seconds <= MAX_SECONDS ? "ok" : "too_long", seconds, title, channel };
  } catch {
    return { status: "unverified" };
  }
}

// CONF_RANK and the Cand type used to live here, feeding applyMeasured()'s
// choice of which candidate to publish. They moved with the ranking into
// VideoQueueClient, which now sorts the review queue by the same rule — highest
// confidence, then shortest — so the judgement survives and a person makes the
// call. Left as a note rather than deleted silently: the next person to read
// this file will wonder where the ranking went.

/**
 * REMOVED, 16 Aug: this used to fill in every exercise that had a measured
 * candidate under the ceiling. It published to clients without anyone looking.
 *
 * ── What was measured ──────────────────────────────────────────────────────
 *
 *   select count(*) filter (where status='approved' and applied_at is not null),
 *          count(*) filter (where status='approved' and applied_at is null)
 *   from exercise_video_candidates;
 *   → 179 applied by automation, 0 by a person.
 *
 * `applied_at` is only ever set by automation — this function and the database's
 * `measure_video_durations()`, which had the identical loop with a 30-second
 * ceiling instead of 60. The human path, `/api/video-candidates/decide`, does
 * not set it. So that query is the whole answer: **there was no such thing in
 * this database as a video a person had approved.**
 *
 * ── Why it had to go ───────────────────────────────────────────────────────
 *
 * `decide/route.ts` states the rule this pipeline is built around: "The
 * candidates came out of a web search run by an agent, which is a perfectly
 * good way to find a demo of a Romanian deadlift and a perfectly good way to
 * find a fourteen-minute critique of one. Nothing found that way goes in front
 * of a client without a human looking at it first."
 *
 * The staging table, the review screen, the approve/reject/undo route and the
 * previous_video_url stash all exist to enforce that sentence, and both
 * auto-appliers reached straight past them. Removing only the database one
 * would have been half a fix: the next verify run would republish.
 *
 * The care taken here was real and is worth recording, because none of it was
 * the problem — an exercise that already had a video was never touched, the
 * best candidate was highest-confidence-then-shortest, and runners-up were
 * superseded so the video could not flip back and forth. It was good code doing
 * a thing it should not have been doing at all. That ranking now lives where it
 * belongs: the review screen sorts by it, and a person presses the button.
 *
 * `applied` stays in the response shape reporting 0, so the queue screen and
 * anything else reading this endpoint keep working and can see it has stopped.
 *
 * MAX_SECONDS is still exported and still used to CLASSIFY (ok vs too_long).
 * Only the publishing is gone.
 */
async function applyMeasured(_db: ReturnType<typeof createAdminClient>) {
  return { applied: 0, skippedHadVideo: 0 };
}

export async function POST(req: NextRequest) {
  // Trainer, Vercel cron, or the database scheduler. The last one matters: it
  // is what lets this be driven to completion without a human holding a button
  // down for 151 candidates.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authed =
    isTrainerUser(user) ||
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` ||
    (await isDbSchedulerRequest(req));
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  // Only rows nobody has decided about yet, oldest first, and only those
  // without a number already on them. Re-running is therefore free and
  // idempotent — it picks up exactly what the last run could not finish.
  const { data, error } = await db
    .from("exercise_video_candidates")
    .select("id, url")
    .eq("status", "pending")
    .is("duration_sec", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as { id: string; url: string }[] | null) || [];
  const tally = { ok: 0, too_long: 0, dead: 0, unverified: 0 };

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const slice = rows.slice(i, i + CONCURRENCY);
    const verdicts = await Promise.all(slice.map((r) => verifyOne(r.url)));
    await Promise.all(
      slice.map((r, j) => {
        const v = verdicts[j];
        tally[v.status] += 1;
        // 'unverified' writes nothing at all, deliberately: leaving
        // duration_sec null is what makes the next run retry the row. Marking
        // it would bury a video that is probably fine behind a transient fetch.
        if (v.status === "unverified") return Promise.resolve();
        const patch =
          v.status === "dead"
            ? { status: "dead" as const }
            : {
                duration_sec: v.seconds,
                // 'too_long' is a status, not a rejection — it stays visible in
                // the queue so Dustin can take one anyway if it is the only
                // decent demo of a movement.
                status: v.status === "ok" ? ("pending" as const) : ("too_long" as const),
                ...(v.title ? { title: v.title } : {}),
                ...(v.channel ? { channel: v.channel } : {}),
              };
        return db.from("exercise_video_candidates").update(patch).eq("id", r.id);
      }),
    );
  }

  // Fill in whatever this batch just made eligible. Runs every call rather than
  // once at the end, so a run that dies half way still leaves real videos on
  // real exercises instead of a table full of measurements and nothing to show.
  const { applied } = await applyMeasured(db);

  const [{ count: remaining }, { count: stillEmpty }] = await Promise.all([
    db
      .from("exercise_video_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("duration_sec", null),
    db
      .from("exercises")
      .select("id", { count: "exact", head: true })
      .or("video_url.is.null,video_url.eq."),
  ]);

  return NextResponse.json({
    checked: rows.length,
    ...tally,
    applied,
    remaining: remaining ?? 0,
    exercisesStillWithoutVideo: stillEmpty ?? 0,
  });
}
