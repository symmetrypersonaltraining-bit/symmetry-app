import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "crypto";

// Proof-of-scheduler for jobs that run from the DATABASE rather than from
// Vercel's own scheduler.
//
// isCronRequest() covers Vercel crons: the platform sets `x-vercel-cron` and
// strips any client-supplied `x-vercel-*` at the edge, so that header cannot be
// forged. It has no answer for anything else, which is why the 15-minute GitHub
// Action that actually drove the calendar sync was calling the endpoint with no
// credentials at all — and started 401ing the day the guard was made to fail
// closed. Roughly ninety-six failure emails a day, and no sync.
//
// The schedule now lives in pg_cron, which is already this project's scheduler.
// It authenticates with a random 32-byte key generated inside the database and
// stored in public.app_scheduler_key, a table with RLS on and no policies, so
// only the service role can read it. That is the same credential this route
// already holds, so restoring the sync needed nothing configured in Vercel or
// GitHub — which matters, because a token with `workflow` scope was not
// available to repair the Action.
//
// This is NOT the anon key and is never shipped to a browser: pg_cron reads it
// server-side, sends it as a header over HTTPS, and we compare it here.

let cached: { key: string; at: number } | null = null;
const TTL_MS = 60_000;

async function loadKey(): Promise<string | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.key;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;

  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await sb.from("app_scheduler_key").select("key").eq("id", 1).maybeSingle();
    const key = (data as { key: string } | null)?.key ?? null;
    if (key) cached = { key, at: Date.now() };
    return key;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  // Compare digests, not the raw strings: timingSafeEqual throws on a length
  // mismatch, and throwing on the wrong length leaks the length.
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/**
 * True when the request carries the database scheduler key.
 *
 * Fails closed on every unhappy path — no key configured, no service role, a
 * missing header, a bad value. A caller that cannot prove it is the scheduler
 * falls through to the normal signed-in-trainer check.
 */
export async function isDbSchedulerRequest(req: {
  headers: { get(name: string): string | null };
}): Promise<boolean> {
  const presented = req.headers.get("x-scheduler-key");
  if (!presented) return false;
  const expected = await loadKey();
  if (!expected) return false;
  return safeEqual(presented, expected);
}
