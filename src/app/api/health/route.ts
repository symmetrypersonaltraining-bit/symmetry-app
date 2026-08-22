import { NextResponse } from "next/server";
import { probe } from "@/lib/health";

/**
 * The endpoint an EXTERNAL monitor points at.
 *
 * Written the morning after the 15 Aug outage. From the incident write-up:
 *
 *   "Dustin found it, not the monitoring, because there is no monitoring."
 *
 * That outage ran from at least 03:32 UTC and was found at 23:00 CT by Dustin
 * opening the app on his phone. Had it started at 5am, the first person to know
 * would have been a client standing in the gym at 6am.
 *
 * The probe itself — and the reason it treats SLOW as a failure — is in
 * `src/lib/health.ts`. That is the part that matters; this file just wires two
 * of them to the two dependencies that fell over.
 *
 * ── Why raw fetch and not the supabase client ─────────────────────────────
 *
 * A health check must not be able to hang, and must not depend on the same
 * client-library retry and refresh machinery whose behaviour under a sick
 * dependency is exactly what is in question. Two plain fetches, an abort signal
 * each. Nothing shared, nothing cached, no session.
 *
 * ── What it does not do ───────────────────────────────────────────────────
 *
 * It does not read client data. The database probe asks the `clients` table for
 * one `id` and throws the body away unread — it is proving the round trip, not
 * fetching anything. Nothing identifying is in the response, because this URL
 * is public (middleware allowlists all of `/api/`) and a status page may end up
 * pointing at it.
 *
 * ── Reading it ────────────────────────────────────────────────────────────
 *
 *   200 + ok:true                       everything answered, and answered fast
 *   200 + ok:true  + slow:true on a leg  answered, but slower than it should —
 *                                        amber on a status page, not a page-out
 *   503 + ok:false                       something failed or blew its deadline
 *
 * Point the monitor at the STATUS CODE, and set it to alert after two
 * consecutive failures rather than one, so a single blip stays quiet.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  const headers = { "Cache-Control": "no-store, max-age=0" };

  // Missing configuration is a real outage, not a special case to shrug at: a
  // deploy that lost its env vars serves errors to every client. Fail it.
  if (!url || !anon || !service) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anon && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      !service && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean);
    return NextResponse.json(
      { ok: false, sha, error: `missing env: ${missing.join(", ")}` },
      { status: 503, headers }
    );
  }

  // Both at once. Run serially, two 5s deadlines make a 10s health check — and
  // a monitor with a 10s timeout of its own would then report an outage that
  // the check itself caused.
  const [auth, db] = await Promise.all([
    // GoTrue's own health route — the service that actually fell over.
    probe((signal) =>
      fetch(`${url}/auth/v1/health`, {
        signal,
        cache: "no-store",
        headers: { apikey: anon },
      })
    ),
    // Smallest honest round trip through PostgREST. Body deliberately unread.
    // Service key, not anon: anon would meet RLS and fail for a reason that has
    // nothing to do with whether the database is well.
    probe((signal) =>
      fetch(`${url}/rest/v1/clients?select=id&limit=1`, {
        signal,
        cache: "no-store",
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
          Accept: "application/json",
        },
      })
    ),
  ]);

  const ok = auth.ok && db.ok;

  // ── Optional configuration, reported but never failed ────────────────────
  //
  // Dustin, 22 Aug, the night before four trainers get invited: "for api key
  // give me direct links and exact step by step to quickly check". Opening a
  // URL beats hunting through a dashboard, and a boolean here is the whole
  // answer.
  //
  // PRESENCE ONLY. Never the value, never a prefix, never a length — this
  // route is public (middleware allowlists all of /api/) and may end up on a
  // status page.
  //
  // These do NOT affect `ok`. Mail being unconfigured is not an outage: every
  // invite screen shows the credentials on screen precisely so a missing key
  // costs a copy-and-paste rather than a blocked signup.
  const config = {
    email_sending: !!process.env.RESEND_API_KEY,
    android_apk_url: !!process.env.NEXT_PUBLIC_ANDROID_APK_URL,
    ai: !!process.env.ANTHROPIC_API_KEY,
    push: !!process.env.FIREBASE_SERVICE_ACCOUNT || !!process.env.FCM_SERVER_KEY,
  };

  return NextResponse.json(
    { ok, sha, checks: { auth, db }, config, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers }
  );
}
