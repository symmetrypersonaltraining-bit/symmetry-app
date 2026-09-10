"use client";

// The broad net: everything React's error boundaries never see.
//
// An error boundary catches errors thrown while RENDERING. It does not catch an
// error inside an event handler, inside a setTimeout, or a promise nobody
// awaited — and those are most of them. A tap handler that throws leaves the
// screen looking fine and does nothing, which is precisely the report that
// arrives as "I pressed it and nothing happened" with no evidence attached.
//
// Two listeners cover that gap:
//
//   error              — anything thrown and not caught, plus resource load
//                        failures (a script or image that 404s)
//   unhandledrejection — an async call whose promise rejected with no catch,
//                        the shape of every failed fetch in this codebase
//
// Mounted once in the root layout, so it is running before any screen renders
// and stays mounted across every navigation.

import { useEffect } from "react";
import { logAppError } from "@/lib/logAppError";

export default function ErrorReporter() {
  useEffect(() => {
    // BOTH HANDLERS ARE WRAPPED, and the `error` one especially.
    //
    // logAppError guards itself, but these run BEFORE it: reading ev.target,
    // ev.error or a property off a dead element can throw on its own. A
    // window `error` listener that throws re-enters the same listener with the
    // error it just produced — one dead image becomes an infinite loop on a
    // client's phone. There is nowhere left to report that to, which is
    // precisely why it must not be allowed to happen.
    function onError(ev: ErrorEvent) {
      try {
        // A failed <img>/<script> fires an `error` event that bubbles to window
        // with no `error` property. Worth recording — a dead CDN is exactly the
        // kind of fault that looks like "the app is broken" — but it is not an
        // exception and must not be read as one.
        if (!ev.error && ev.target && ev.target !== window) {
          const el = ev.target as HTMLElement & { src?: string; href?: string };
          const url = el.src || el.href;
          if (url) {
            logAppError({
              scope: "unhandled",
              error: new Error(`failed to load ${el.tagName?.toLowerCase?.() || "resource"}`),
              detail: { resource: String(url).slice(0, 300) },
            });
          }
          return;
        }
        logAppError({
          scope: "unhandled",
          error: ev.error || new Error(ev.message || "unknown error"),
          detail: {
            // Where in the bundle. Minified, but it separates two faults that
            // share a message.
            source: ev.filename ? String(ev.filename).slice(-120) : null,
            line: ev.lineno ?? null,
            col: ev.colno ?? null,
          },
        });
      } catch {
        /* see above: this handler must never feed itself */
      }
    }

    function onRejection(ev: PromiseRejectionEvent) {
      try {
        logAppError({
          scope: "rejection",
          error: ev.reason ?? new Error("promise rejected with no reason"),
        });
      } catch {
        /* likewise */
      }
    }

    // Capture phase for `error`: resource failures do not bubble, so a
    // listener on window only sees them on the way down.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
