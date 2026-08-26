/**
 * Record a client-side write that failed and cost somebody their data.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 *
 * Jennifer, 26 Aug 2026: *"About midway through my workout. It wouldn't let me
 * check a completed set."* She finished a 27-minute session with ZERO rows in
 * set_logs.
 *
 * The logger did the right thing. It refuses to turn a set green on a failed
 * write and it told her something had gone wrong — that guard is the only
 * reason this was noticed at all rather than becoming a workout that quietly
 * recorded nothing. But the error went to her screen and nowhere else. Working
 * out why took an afternoon of inference across six tables and still did not
 * reach a definite cause, because nothing anywhere recorded that a write had
 * been attempted and refused.
 *
 * A guard that can only report to the one person who cannot act on it is half a
 * guard.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * Not general error reporting, and deliberately so. It is for the small set of
 * writes whose failure costs training data — the ones where the difference
 * between "it failed" and "it silently did nothing" is somebody's session.
 * Anything broader turns into a table nobody reads, which is where the
 * integrity checker sat for ten days.
 *
 * Never throws and never blocks. A logger that can be broken by its own error
 * reporting is worse than one that reports nothing.
 */

import { createClient } from "@/lib/supabase/client";

export type ClientErrorScope = "set_log" | "bulk_set_log" | "workout_complete";

export async function logClientError(opts: {
  clientId: string | null | undefined;
  scope: ClientErrorScope;
  error: unknown;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    if (!opts.clientId) return;   // RLS would refuse it, and it would say nothing
    const e = opts.error as { message?: string; code?: string; details?: string; hint?: string } | null;
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    await sb.from("client_error_log").insert({
      client_id: opts.clientId,
      user_id: auth?.user?.id ?? null,
      scope: opts.scope,
      message: (e?.message || String(opts.error) || "unknown").slice(0, 500),
      // The postgrest fields are the whole point: `code` is what separates an
      // RLS refusal from a constraint violation from a dropped request, and
      // that distinction is exactly what could not be recovered after the fact.
      detail: {
        code: e?.code ?? null,
        details: e?.details ?? null,
        hint: e?.hint ?? null,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
        ...(opts.detail || {}),
      },
      path: typeof location !== "undefined" ? location.pathname : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
    });
  } catch {
    /* reporting a failure must never become a second failure */
  }
}
