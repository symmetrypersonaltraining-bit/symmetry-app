// "We could not reach the server" — which is not the same as "log in again".
//
// Reached only from requireUser() when auth came back degraded: the call timed
// out, or the network dropped it. The session cookies are untouched and still
// valid; nothing here signs anybody out, and there is deliberately no login
// form on this page to tempt anyone into thinking they need one.
//
// See src/lib/auth/serverUser.ts for the incident. Jenn, on gym wi-fi, was
// being shown /login at random and then finding herself already signed in.

export const dynamic = "force-static";

export default function Reconnecting() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "var(--brand-bg, #0b1220)",
        color: "var(--brand-text, #e9eef6)",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 34, marginBottom: 10 }} aria-hidden="true">📡</div>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 8px" }}>
          Can&rsquo;t reach the server
        </h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: "0 0 6px", opacity: 0.9 }}>
          Your connection dropped for a moment. <strong>You are still signed in</strong> —
          nothing has been lost.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 20px", opacity: 0.65 }}>
          If you were logging a workout, your sets are saved on this phone and will go up
          when you are back.
        </p>

        {/* A plain form, so this page needs no JavaScript to work — the one
            situation where the network is already misbehaving. */}
        <form action="/home">
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 12,
              border: "none",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              background: "var(--brand-primary, #4f7cf7)",
              color: "#fff",
            }}
          >
            Try again
          </button>
        </form>
      </div>
    </main>
  );
}
