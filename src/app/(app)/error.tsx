"use client";

// WHAT A CLIENT SEES WHEN A SCREEN CRASHES.
//
// Until now: Next's own error page in development, and in production a blank
// white screen. Neither records anything, and neither tells the person holding
// the phone whether their data survived — which is the only question they
// actually have. Jennifer's report was "it wouldn't let me check a set"; the
// version of that with no error boundary is "the app went white."
//
// Two jobs, in this order:
//
//   1. RECORD IT. This runs on the client, so it is the last place the real
//      error object exists before it is gone.
//   2. Offer the one action that usually works — reset() re-renders the route
//      without a full reload, so a transient failure costs a tap rather than a
//      cold start and a lost scroll position.
//
// It does NOT promise the data is safe, because it does not know. The workout
// logger's own guard is what refuses to tick a set green on a failed write, and
// saying "don't worry" over the top of a failure that may have eaten a set
// would be the app lying to the person best placed to notice.

import { useEffect } from "react";
import { logAppError } from "@/lib/logAppError";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logAppError({
      scope: "render",
      error,
      // The digest is how a minified production stack is matched back to the
      // server-side log entry; without it a client crash and its server trace
      // cannot be tied together.
      detail: { digest: error.digest ?? null },
    });
  }, [error]);

  return (
    <div className="sym-page" style={{ padding: 16 }}>
      <div className="sym-tile">
        <div className="sym-tile-head">
          <span className="sym-tile-lbl">Something went wrong</span>
        </div>
        <p style={{ margin: "10px 0 4px", lineHeight: 1.5 }}>
          This screen hit an error and stopped. It has been reported
          automatically — you do not need to send anything.
        </p>
        <p style={{ margin: "0 0 14px", lineHeight: 1.5, opacity: 0.8 }}>
          If you were part-way through logging something, check it saved before
          carrying on.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={reset} className="sym-bt">
            Try again
          </button>
          <button
            type="button"
            onClick={() => { location.href = "/home"; }}
            className="sym-bt"
            style={{ opacity: 0.75 }}
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}
