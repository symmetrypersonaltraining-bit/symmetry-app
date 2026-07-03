/**
 * Route-level loading skeleton for the (app) segment. Renders shimmering
 * placeholders (`.cw-skeleton`, defined in globals.css) while the server
 * component streams, then Next.js swaps in the real content — matching
 * visual-polish mockup #6. Purely additive: shows only during navigation
 * loading and cannot affect resolved page rendering.
 */
export default function Loading() {
  const card: React.CSSProperties = {
    background: "var(--brand-surface)",
    border: "1px solid var(--brand-border)",
    borderRadius: 20,
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      style={{
        maxWidth: 480,
        margin: "0 auto",
        padding: "20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div className="cw-skeleton" style={{ height: 16, width: "40%" }} />
      <div className="cw-skeleton" style={{ height: 30, width: "65%" }} />

      <div style={card}>
        <div className="cw-skeleton" style={{ height: 14, width: "55%" }} />
        <div className="cw-skeleton" style={{ height: 10, width: "80%" }} />
        <div className="cw-skeleton" style={{ height: 44, width: "100%", borderRadius: 12 }} />
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="cw-skeleton"
            style={{ height: 70, flex: 1, borderRadius: 14 }}
          />
        ))}
      </div>

      <div style={card}>
        <div className="cw-skeleton" style={{ height: 14, width: "45%" }} />
        <div className="cw-skeleton" style={{ height: 10, width: "70%" }} />
        <div className="cw-skeleton" style={{ height: 10, width: "60%" }} />
      </div>
    </div>
  );
}
