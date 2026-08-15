/**
 * The probe behind `/api/health`.
 *
 * It lives here rather than in the route file for two reasons: a Next route
 * module is only supposed to export route handlers, and a health check nobody
 * can unit-test is a health check nobody should trust.
 *
 * ── The one design decision that matters ──────────────────────────────────
 *
 * SLOW IS A FAILURE.
 *
 * During the 15 Aug outage nothing returned an error. Auth returned the CORRECT
 * answer, 10–65 seconds late. The database answered every query it was given,
 * having taken 4.6s to plan a 31-page index scan. Clients got 504s the whole
 * time. A check that asks only "did it answer" would have been green all night.
 *
 * So every probe has a hard deadline, and blowing it is a failure carrying the
 * same weight as a refused connection.
 */

/** Blowing this is a failure. On the night, auth was taking 10–65s. */
export const PROBE_TIMEOUT_MS = 5_000;

/** Answered, but not with a straight face. Healthy is comfortably under this. */
export const PROBE_SLOW_MS = 1_500;

export type ProbeResult = {
  ok: boolean;
  ms: number;
  slow?: boolean;
  error?: string;
};

/**
 * Run one probe under a hard deadline.
 *
 * Always resolves. A health check that throws is a health check that hands the
 * monitor a 500 and a stack trace instead of an answer.
 */
export async function probe(
  run: (signal: AbortSignal) => Promise<Response>,
  now: () => number = () => Date.now(),
  timeoutMs: number = PROBE_TIMEOUT_MS,
  slowMs: number = PROBE_SLOW_MS
): Promise<ProbeResult> {
  const started = now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await run(controller.signal);
    const ms = now() - started;
    if (!res.ok) return { ok: false, ms, error: `http ${res.status}` };
    return ms >= slowMs ? { ok: true, ms, slow: true } : { ok: true, ms };
  } catch (e) {
    const ms = now() - started;
    // An abort here is our own deadline, not a network fault. Say which —
    // "timeout" and "connection refused" send you to different places.
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      ms,
      error: aborted ? `timeout after ${timeoutMs}ms` : String((e as Error)?.message || e),
    };
  } finally {
    clearTimeout(timer);
  }
}
