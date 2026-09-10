"use client";

// THE LAST RESORT: an error thrown by the ROOT LAYOUT itself.
//
// (app)/error.tsx catches a crash inside a screen, but it renders *inside* the
// root layout — so if the root layout is what threw, it never gets the chance.
// This replaces the whole document instead, which is why it has to supply its
// own <html> and <body>.
//
// That is also why it is styled inline. globals.css is imported by the root
// layout, and the root layout is the thing that failed, so no class in this app
// is guaranteed to exist here. Every rule this needs is written out, and the
// colours are literals rather than theme tokens for the same reason.
//
// This should effectively never render. It exists so that when it does, the
// event is recorded rather than being a white screen nobody can explain.

import { useEffect } from "react";
import { logAppError } from "@/lib/logAppError";

export default function GlobalError({
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
      detail: { digest: error.digest ?? null, boundary: "global" },
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          background: "#0F1520",
          color: "#E8ECF3",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 10px" }}>The app couldn&apos;t start</h1>
          <p style={{ lineHeight: 1.5, margin: "0 0 6px" }}>
            Something failed before any screen could load. It has been reported
            automatically.
          </p>
          <p style={{ lineHeight: 1.5, margin: "0 0 16px", opacity: 0.75 }}>
            Nothing you logged has been lost — this happened before the app
            opened, not while it was saving.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              appearance: "none",
              border: "1px solid #2C3A4F",
              background: "#16202E",
              color: "inherit",
              borderRadius: 12,
              padding: "11px 18px",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
