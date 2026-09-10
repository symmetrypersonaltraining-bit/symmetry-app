// Report an error from the browser. One function, every surface.
//
// THE THREE THINGS THAT MAKE THIS DIFFERENT FROM AN ORDINARY POST
//
// 1. IT MUST SURVIVE THE NAVIGATION THAT FOLLOWS. A crash is very often
//    followed by a reload, a back-tap or the page being thrown away, and an
//    in-flight fetch dies with it -- so the report about the worst failures is
//    the one most likely to be lost. navigator.sendBeacon exists exactly for
//    this: the browser owns the request and finishes it after the page is gone.
//    fetch with keepalive is the fallback.
//
// 2. IT MUST NOT LOOP. An error inside a React render can fire on every render,
//    and a reporter that posts each time turns one bug into a network flood on
//    a client's phone data. The same fingerprint is sent at most once a minute
//    from one page, and the server counts occurrences anyway -- so the count
//    stays honest while the traffic does not.
//
// 3. IT MUST NEVER THROW. A reporter that can be broken by its own failure is
//    worse than one that reports nothing: it turns a handled error into an
//    unhandled one, inside the handler that was meant to contain it.

import { errorFingerprint } from "@/lib/errorFingerprint";
import { getPageContext } from "@/lib/pageContext";

export type AppErrorScope =
  // pre-existing, from the workout logger
  | "set_log"
  | "bulk_set_log"
  | "workout_complete"
  // the broad net
  | "render"          // a React error boundary caught it
  | "unhandled"       // window.onerror
  | "rejection"       // an unhandled promise rejection
  | "server";         // an API route reported its own failure

/** fingerprint → last time it was sent from this page. */
const sentAt = new Map<string, number>();
const THROTTLE_MS = 60_000;

function messageOf(error: unknown): string {
  if (!error) return "unknown";
  if (typeof error === "string") return error;
  const e = error as { message?: string; toString?: () => string };
  return e.message || (typeof e.toString === "function" ? e.toString() : "unknown");
}

/**
 * Everything a postgrest error carries that says WHICH kind of failure it was.
 * `code` is what separates an RLS refusal from a constraint violation from a
 * dropped request, and that distinction is the one that could not be recovered
 * after Jennifer's lost session.
 */
function detailOf(error: unknown, extra?: Record<string, unknown>): Record<string, unknown> {
  const e = (error || {}) as {
    code?: string; details?: string; hint?: string; stack?: string; name?: string;
  };
  return {
    name: e.name ?? null,
    code: e.code ?? null,
    details: e.details ?? null,
    hint: e.hint ?? null,
    // The top of the stack only. A full React stack is kilobytes and the rows
    // are meant to stay readable.
    stack: typeof e.stack === "string" ? e.stack.split("\n").slice(0, 6).join("\n") : null,
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    // Which tutorial step / sub-screen, when a pathname cannot say it.
    page_context: getPageContext(),
    ...(extra || {}),
  };
}

export function logAppError(opts: {
  scope: AppErrorScope;
  error: unknown;
  /** The client this concerns, when the screen knows it. */
  clientId?: string | null;
  detail?: Record<string, unknown>;
}): void {
  try {
    if (typeof window === "undefined") return;

    const message = messageOf(opts.error).slice(0, 500);
    const path = location.pathname;
    const fp = errorFingerprint({ scope: opts.scope, message, path });

    const now = Date.now();
    const last = sentAt.get(fp);
    if (last != null && now - last < THROTTLE_MS) return;
    sentAt.set(fp, now);

    const payload = JSON.stringify({
      scope: opts.scope,
      message,
      path,
      clientId: opts.clientId ?? null,
      detail: detailOf(opts.error, opts.detail),
      source: "client",
    });

    // sendBeacon takes a Blob; the type is what makes it arrive as JSON rather
    // than as text/plain, which req.json() would still parse but which reads as
    // a mistake to anyone looking at the request later.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(
        "/api/log-error",
        new Blob([payload], { type: "application/json" }),
      );
      if (ok) return;
      // sendBeacon returns false when the payload is over the browser's queue
      // limit — fall through rather than losing the report.
    }

    void fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      /* reporting a failure must never become a second failure */
    });
  } catch {
    /* likewise */
  }
}
