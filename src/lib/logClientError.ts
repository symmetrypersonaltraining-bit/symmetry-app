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
 * ── WHAT CHANGED, 10 Sep 2026 ────────────────────────────────────────────────
 *
 * This used to insert into client_error_log straight from the browser. Two
 * things were wrong with that, and the second one silenced it in the case that
 * mattered most:
 *
 *   THE TABLE NEVER FIRED. Not because nothing failed — the write path really
 *   has not missed in 60 days — but it could only ever have caught three
 *   writes. Every other failure in the app went to console.error, which on a
 *   phone is a hidden console and then nothing.
 *
 *   IT COULD NOT RECORD A SESSION DUSTIN LOGGED. The insert policy was
 *   `client_id = my_client_id()`, which resolves the LOGGED-IN user's client
 *   row. Logging a client's session at /workout?forClient=<id> he has no client
 *   row, so every insert was refused by RLS and swallowed by the catch below —
 *   correctly, since this must never throw. The one case most likely to be
 *   noticed and reported was the one guaranteed to leave no trace.
 *
 * Both are fixed by the same move: the write goes through /api/log-error, which
 * runs under the service role and authorises the caller itself. THE CALL SITES
 * IN THE WORKOUT LOGGER ARE UNCHANGED — they were always passing the right
 * client id; only RLS disagreed.
 *
 * This wrapper is kept rather than folded into logAppError so those call sites
 * stay untouched. The workout logger is off limits without per-item
 * permission, and a rename that reaches into it to gain nothing is exactly the
 * kind of drive-by that rule exists to stop.
 */

import { logAppError } from "@/lib/logAppError";

export type ClientErrorScope = "set_log" | "bulk_set_log" | "workout_complete";

export async function logClientError(opts: {
  clientId: string | null | undefined;
  scope: ClientErrorScope;
  error: unknown;
  detail?: Record<string, unknown>;
}): Promise<void> {
  // NO EARLY RETURN ON A MISSING clientId ANY MORE.
  //
  // It used to bail out, because RLS would have refused the row and said
  // nothing. The server route has no such constraint: an error with no client
  // attached is still worth having, and a set that failed to save is worth
  // having whether or not we can say whose it was.
  logAppError({
    clientId: opts.clientId ?? null,
    scope: opts.scope,
    error: opts.error,
    detail: opts.detail,
  });
}
