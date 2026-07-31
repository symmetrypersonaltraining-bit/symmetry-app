// One place that decides "did this request come from a scheduler?"
//
// There were four cron-gated routes and four different answers to that
// question, two of them wrong in opposite directions:
//
//   /api/cron/weekly-ai  `if (!secret) return false` — fails CLOSED, which 401s
//                        Vercel's own scheduler when CRON_SECRET is unset. The
//                        Sunday sweep silently never ran.
//   /api/gcal-sync       `if (SECRET && auth !== ...)` — fails OPEN. With the
//                        variable unset the guard is skipped entirely and the
//                        route is callable by anyone.
//   /api/reminders/send  `auth !== "Bearer " + process.env.CRON_SECRET` — with
//                        the variable unset that compares against the literal
//                        string "Bearer undefined", so anyone sending exactly
//                        that header authenticates.
//   /api/ai-nudges       correct, but on its own header name.
//
// CRON_SECRET is not set on this project and may never be, so the rule has to
// be right in that state rather than assume someone remembers.
//
// Vercel strips client-supplied `x-vercel-*` headers at the edge, so
// `x-vercel-cron` is only present on invocations from the platform's own
// scheduler and cannot be forged from outside. That is the primary signal. The
// secret, when set, is an additional accepted proof — never a required one, and
// never a bypass when it is missing.

export interface CronRequestLike {
  headers: { get(name: string): string | null };
  url: string;
}

/**
 * True when the request is a genuine scheduler invocation.
 *
 * Fails CLOSED when nothing proves it: an unset CRON_SECRET grants nothing, and
 * "Bearer undefined" / "undefined" never authenticate.
 */
export function isCronRequest(req: CronRequestLike): boolean {
  if (req.headers.get("x-vercel-cron")) return true;

  const secret = process.env.CRON_SECRET;
  // No secret configured → the header above is the only way in.
  if (!secret || secret === "undefined") return false;

  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;

  // Query form, for a manual curl where setting a header is awkward.
  try {
    return new URL(req.url).searchParams.get("secret") === secret;
  } catch {
    return false;
  }
}
