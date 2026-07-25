"use client";

/**
 * ClientSparkline — eight weeks of training at a glance. 2026-07-25. (#81)
 *
 * Sits on each row of the clients list so a trend is visible without opening
 * anybody. Purely presentational: the caller does the one query and hands over
 * a bucket per week, oldest first.
 *
 * Bars, not a line. At 46px wide a line chart of eight points is a squiggle
 * nobody can read; eight bars are unambiguous, and a zero week reads as a
 * visible gap rather than a dip you have to interpret.
 *
 * The last bar is the current, incomplete week — it is drawn lighter, because
 * comparing a half-finished Tuesday against seven full weeks would make every
 * client look like they are falling off every Monday.
 */

export default function ClientSparkline({
  weeks,
  width = 46,
  height = 18,
}: {
  weeks: number[];
  width?: number;
  height?: number;
}) {
  if (!weeks || weeks.length === 0) return null;

  const max = Math.max(1, ...weeks);
  const n = weeks.length;
  const gap = 1.5;
  const barW = Math.max(1.5, (width - gap * (n - 1)) / n);

  // Trend is judged on COMPLETE weeks only, for the same reason the current
  // week is drawn faded — a partial week is not evidence of anything yet.
  const done = weeks.slice(0, -1);
  const half = Math.floor(done.length / 2);
  const early = done.slice(0, half).reduce((a, b) => a + b, 0);
  const late = done.slice(half).reduce((a, b) => a + b, 0);
  const color = late > early ? "#22c55e" : late < early ? "#f59e0b" : "var(--brand-primary)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", flex: "0 0 auto" }}
      aria-label={`Training trend, last ${n} weeks`}
    >
      {weeks.map((v, i) => {
        const h = v === 0 ? 1.5 : Math.max(2.5, (v / max) * height);
        const isCurrent = i === n - 1;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={Math.min(1.2, barW / 2)}
            fill={v === 0 ? "var(--brand-border)" : color}
            opacity={v === 0 ? 1 : isCurrent ? 0.45 : 1}
          />
        );
      })}
    </svg>
  );
}
