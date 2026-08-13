// POST /api/video-candidates/verify — put a real duration on each candidate.
//
// 252 of the 847 exercises in the library have no demo video. A client who taps
// play on one of those gets nothing, mid-set, and the app looks half-finished
// at exactly the moment it is meant to be useful.
//
// Dustin, 2026-08-13: "We have a ton of exercises in the library that do not
// have videos... All videos need to be under thirty seconds, preferably under
// twenty seconds."
//
// The search half of that is done — 151 candidates are staged in
// exercise_video_candidates. The DURATION half could not be: the sandbox those
// searches ran in has no route to youtube.com at all (every request dies at the
// proxy), so not one of the 151 has a verified length. A "demo video" that
// turns out to be an eleven-minute talking-head review is worse than no video,
// because it ships looking fine and only fails in front of a client.
//
// So the check runs HERE, on Vercel, where the network is real. This route is
// the same trick as /api/cron/check-videos: no API key, no quota, no Google
// project to set up and no key for Dustin to rotate later.
//
//   oEmbed  → does it exist at all (404 = removed/private/account gone)
//   watch page → "lengthSeconds":"NN" out of ytInitialPlayerResponse
//
// The watch-page regex is the fragile part and it is treated as fragile: a page
// that does not yield a length is recorded as 'unverified', NEVER as a pass.
// Nothing reaches a client's screen off the back of a guess — a candidate has
// to have a number on it before it can be approved.
//
// Batched, because 151 sequential page fetches do not fit in a function
// timeout. Call it until `remaining` comes back 0.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTrainerUser } from "@/lib/trainer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 30;
const CONCURRENCY = 6;

/** Dustin's ceiling. Anything longer is not a demo, it is a video. */
export const MAX_SECONDS = 30;
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

export async function POST(req: NextRequest) {
  // Trainer-only, and checked against the session rather than anything in the
  // body. This route makes outbound requests in a loop; it is not something a
  // client account should be able to spin.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const authedAsTrainer = isTrainerUser(user);
  const authedAsCron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authedAsTrainer && !authedAsCron) {
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

  const { count } = await db
    .from("exercise_video_candidates")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("duration_sec", null);

  return NextResponse.json({ checked: rows.length, ...tally, remaining: count ?? 0 });
}
