// When Supabase Auth is slow, the app must degrade — not die.
//
// 15 Aug 2026, 03:32–04:43 UTC. `GET /user` on Supabase's auth service was
// taking 10 to 65 seconds and returning 504 `context deadline exceeded` for
// roughly half of all calls. Measured from the project's own auth_logs, with
// the database idle, no cron jobs running, and 33 rows in `auth.users` — so
// nothing on our side was making it slow.
//
// The middleware awaited that call on EVERY navigation with no time limit. So a
// slow auth service did not produce a slow page, it produced no page at all:
// Vercel killed the whole invocation and served
// `504 MIDDLEWARE_INVOCATION_TIMEOUT`, a white error screen with no way
// forward. One dependency being unwell took the entire app down.
//
// WHY PASSING THROUGH IS SAFE, which is the only question that matters here.
// The middleware is not the security boundary and never was. `(app)/layout.tsx`
// and every page under it independently call `supabase.auth.getUser()` and
// `redirect("/login")` when there is no user, and every table is behind RLS
// keyed to the JWT. The middleware exists to save a round trip and to route
// first-run clients to /welcome and /onboarding. Skipping it costs those
// conveniences for one request; it grants nothing.
//
// WHY NOT REDIRECT TO /login ON TIMEOUT. Because a timeout is not a signed-out
// user, and treating it as one signs people out at random — the exact
// complaint behind `redirectKeepingSession` in the middleware, arrived at from
// a different direction. Unknown must stay unknown and be passed to the layer
// that can find out.
//
// The cap is deliberately shorter than Supabase's own ~10s deadline: waiting
// for a call that is already going to fail helps nobody, and 4s is far longer
// than the 2–200ms a healthy call takes (measured on the same logs).

/** How long the middleware waits for auth before giving up and passing through. */
export const AUTH_TIMEOUT_MS = 4000;

export interface AuthOutcome<T> {
  /** The value, when the call answered in time. */
  value: T | null;
  /**
   * True when the call did not answer in time, or threw.
   *
   * DISTINCT FROM `value === null`. Null means "answered: nobody". Degraded
   * means "did not answer" — and the two must never be collapsed, because the
   * first is grounds for a redirect and the second is not.
   */
  degraded: boolean;
}

/**
 * Await a promise, but never for longer than `ms`.
 *
 * The timer is always cleared, including on the fast path. An uncleared
 * `setTimeout` keeps the serverless invocation alive to no purpose, which on a
 * per-navigation code path is a slow leak rather than a one-off.
 *
 * A rejection is reported as degraded rather than rethrown. A network error
 * reaching auth is the same situation as a slow one from the caller's point of
 * view, and neither should take the page down.
 */
export async function withAuthTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = AUTH_TIMEOUT_MS
): Promise<AuthOutcome<T>> {
  const TIMED_OUT = Symbol("timed-out");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), ms);
    });
    const raced = await Promise.race([promise, timeout]);
    if (raced === TIMED_OUT) return { value: null, degraded: true };
    return { value: raced as T, degraded: false };
  } catch {
    return { value: null, degraded: true };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
