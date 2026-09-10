// HOW AN ERROR BECOMES A ROW. One implementation, both callers.
//
// Two things write to app_error_log: /api/log-error (relaying a browser report)
// and logServerError (an API route or cron reporting its own failure). The
// grouping is the interesting part — read the existing row, bump the count,
// push the occurrence, cap the list — and two copies of it would drift.
//
// That is not a hypothetical here. `priceNamedFoods` exists because "how a
// described food becomes a number" had been written twice and the copies were
// about to disagree about the same dinner. Same shape, same fix, done up front
// this time.
//
// SERVER ONLY. It uses the service role key, which must never reach a browser.

import { createAdminClient } from "@/lib/supabase/admin";
import { errorFingerprint } from "@/lib/errorFingerprint";
import type { Json } from "@/lib/database.types";

/**
 * Anything → something jsonb can actually hold.
 *
 * Not a cast dressed up as a function. Three things genuinely need doing, and
 * skipping them is how the error reporter becomes its own error:
 *
 *   - A CIRCULAR OBJECT THROWS. `error.detail` here is whatever a caller
 *     handed us, and a React/DOM object with a parent pointer is circular.
 *     JSON.stringify throws on it; the postgrest client would too, from inside
 *     a catch block, on the error path.
 *   - `undefined` IS NOT JSON. It vanishes silently in a round trip, which is
 *     what we want — a key with no value should not become `null` and read as
 *     "we looked and there was nothing there".
 *   - Functions and symbols go the same way.
 *
 * A detail we cannot serialise becomes null rather than losing the whole row:
 * the message, scope, path and time are the parts that matter most.
 */
function toJson(value: unknown): Json {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as Json;
  } catch {
    return null;
  }
}

/** Occurrences kept in full on the row. The count keeps rising past this. */
export const KEEP_RECENT = 10;

/**
 * The ceiling on DISTINCT faults. A fingerprint that somehow stays unique per
 * occurrence — a message shape the normaliser does not cover — would otherwise
 * fill the table, and the disk is 1 GB. Past this, known faults still count up;
 * only genuinely new rows stop being created.
 */
export const MAX_DISTINCT = 5000;

export interface RecordErrorInput {
  scope: string;
  message: string;
  detail?: Record<string, unknown> | null;
  path?: string | null;
  clientId?: string | null;
  userId?: string | null;
  userAgent?: string | null;
  source: "client" | "server";
}

export type RecordErrorResult =
  | { ok: true; grouped: boolean }
  | { ok: false; reason: "distinct-cap" | "failed" };

export async function recordError(input: RecordErrorInput): Promise<RecordErrorResult> {
  try {
    const scope = String(input.scope || "unknown").slice(0, 60);
    const message = String(input.message || "unknown").slice(0, 500);
    const path = input.path ? String(input.path).slice(0, 200) : null;
    const clientId = input.clientId ?? null;
    const fingerprint = errorFingerprint({ scope, message, path });
    const now = new Date().toISOString();

    const occurrence = toJson({
      at: now,
      client_id: clientId,
      path,
      message,
      detail: input.detail ?? null,
    });
    const detail = toJson(input.detail ?? null);

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("app_error_log")
      .select("id, occurrences, recent")
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    // BOTH WRITES BELOW ARE CHECKED, and the reason is the shape of every
    // incident in docs/UNCHECKED-WRITES-INVENTORY.md: supabase-js RESOLVES with
    // { error } — it does not throw — so the try/catch around this function
    // would catch nothing, and a refused write would return { ok: true }. The
    // route would then tell the browser its report was recorded when it was
    // not, which is the one lie an error log cannot afford.
    if (existing) {
      const prior = Array.isArray(existing.recent) ? existing.recent : [];
      const { error: updateErr } = await admin
        .from("app_error_log")
        .update({
          occurrences: (existing.occurrences ?? 0) + 1,
          last_seen_at: now,
          // Newest first, capped: the row stays a fixed size however often the
          // fault fires.
          recent: [occurrence, ...prior].slice(0, KEEP_RECENT),
          message,
          path,
          client_id: clientId,
          user_id: input.userId ?? null,
          user_agent: input.userAgent ?? null,
          // A FAULT THAT COMES BACK IS NOT RESOLVED. Ticking it off and then
          // leaving it ticked is how the same bug gets missed twice.
          resolved_at: null,
        })
        .eq("id", existing.id);
      if (updateErr) return { ok: false, reason: "failed" };
      return { ok: true, grouped: true };
    }

    const { count } = await admin
      .from("app_error_log")
      .select("id", { count: "exact", head: true });
    if ((count ?? 0) >= MAX_DISTINCT) {
      // Refused rather than written, and it SAYS SO. Silence here would look
      // identical to a working log with nothing to report.
      return { ok: false, reason: "distinct-cap" };
    }

    const { error: insertErr } = await admin.from("app_error_log").insert({
      fingerprint,
      client_id: clientId,
      user_id: input.userId ?? null,
      scope,
      message,
      detail,
      path,
      user_agent: input.userAgent ?? null,
      source: input.source,
      occurrences: 1,
      last_seen_at: now,
      recent: [occurrence],
    });
    if (insertErr) return { ok: false, reason: "failed" };

    return { ok: true, grouped: false };
  } catch {
    // Recording a failure must never become a second failure.
    return { ok: false, reason: "failed" };
  }
}

/**
 * Report a failure from a server route or cron job.
 *
 * Fire-and-forget by design: `void logServerError(...)` in a catch block, so
 * reporting can never delay or fail the response the user is waiting on.
 */
export async function logServerError(opts: {
  scope: string;
  error: unknown;
  route?: string;
  clientId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const e = (opts.error || {}) as {
    message?: string; code?: string; details?: string; hint?: string; stack?: string; name?: string;
  };
  await recordError({
    scope: opts.scope,
    message: e.message || String(opts.error) || "unknown",
    path: opts.route ?? null,
    clientId: opts.clientId ?? null,
    source: "server",
    detail: {
      name: e.name ?? null,
      code: e.code ?? null,
      details: e.details ?? null,
      hint: e.hint ?? null,
      stack: typeof e.stack === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : null,
      ...(opts.detail || {}),
    },
  });
}
