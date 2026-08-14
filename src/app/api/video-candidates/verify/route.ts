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

/** high beats medium beats low. Anything unlabelled sorts last. */
const CONF_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

type Cand = {
  id: string;
  exercise_id: string;
  url: string;
  duration_sec: number | null;
  confidence: string | null;
};

/**
 * Fill in every exercise that now has a measured candidate under the ceiling.
 *
 * Only touches exercises with NO video — an exercise that already has one is
 * left completely alone, because replacing a demo Dustin chose (or that has
 * been working for months) with a search result is not an improvement, it is a
 * regression nobody would notice until a client did.
 *
 * Best candidate per exercise = highest confidence, then shortest. Shortest
 * because his actual preference is "preferably under twenty seconds", and among
 * two equally-good matches the shorter one is the better demo every time.
 */
async function applyMeasured(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from("exercise_video_candidates")
    .select("id, exercise_id, url, duration_sec, confidence")
    .eq("status", "pending")
    .not("duration_sec", "is", null)
    .lte("duration_sec", MAX_SECONDS);

  const cands = (data as Cand[] | null) || [];
  if (!cands.length) return { applied: 0, skippedHadVideo: 0 };

  // Which of those exercises are actually empty right now.
  const ids = [...new Set(cands.map((c) => c.exercise_id))];
  const { data: exRows } = await db
    .from("exercises")
    .select("id, video_url")
    .in("id", ids);
  const empty = new Set(
    ((exRows as { id: string; video_url: string | null }[] | null) || [])
      .filter((e) => !e.video_url)
      .map((e) => e.id),
  );

  const best = new Map<string, Cand>();
  for (const c of cands) {
    if (!empty.has(c.exercise_id)) continue;
    const cur = best.get(c.exercise_id);
    if (!cur) { best.set(c.exercise_id, c); continue; }
    const a = [CONF_RANK[c.confidence ?? ""] ?? 3, c.duration_sec ?? 9999];
    const b = [CONF_RANK[cur.confidence ?? ""] ?? 3, cur.duration_sec ?? 9999];
    if (a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) best.set(c.exercise_id, c);
  }

  const now = new Date().toISOString();
  let applied = 0;
  for (const c of best.values()) {
    const { error } = await db
      .from("exercises")
      .update({ video_url: c.url, video_status: "ok", video_checked_at: now })
      .eq("id", c.exercise_id);
    if (error) continue;
    applied += 1;
    await db
      .from("exercise_video_candidates")
      .update({ status: "approved", applied_at: now, reviewed_at: now, previous_video_url: null })
      .eq("id", c.id);
    // The runners-up for that exercise are moot now. Left pending they would
    // re-apply on the next run and quietly flip the video back and forth.
    await db
      .from("exercise_video_candidates")
      .update({ status: "superseded", reviewed_at: now })
      .eq("exercise_id", c.exercise_id)
      .neq("id", c.id)
      .in("status", ["pending", "too_long"]);
  }

  return { applied, skippedHadVideo: ids.length - empty.size };
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
