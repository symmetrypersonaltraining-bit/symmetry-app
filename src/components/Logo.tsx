// Symmetry Personal Training — Vitruvian Man Seal
// Replace <image> src with real logo file once added to /public

interface LogoProps {
  size?: number;
  color?: string;
  className?: string;
}

export default function Logo({
  size = 40,
  color = "#0F4C81",
  className = "",
}: LogoProps) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const outerR = s / 2 - 1;
  const innerR = outerR * 0.74;

  return (
    <svg
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      className={className}
      aria-label="Symmetry Personal Training"
    >
      {/* Outer ring */}
      <circle
        cx={cx}
        cy={cy}
        r={outerR}
        fill="none"
        stroke={color}
        strokeWidth={s * 0.04}
      />
      {/* Inner ring */}
      <circle
        cx={cx}
        cy={cy}
        r={innerR}
        fill="none"
        stroke={color}
        strokeWidth={s * 0.018}
      />

      {/* Curved text paths */}
      <defs>
        <path
          id={`top-arc-${s}`}
          d={`M ${cx - outerR * 0.82},${cy} A ${outerR * 0.82},${outerR * 0.82} 0 1,1 ${cx + outerR * 0.82},${cy}`}
        />
        <path
          id={`bot-arc-${s}`}
          d={`M ${cx + outerR * 0.78},${cy} A ${outerR * 0.78},${outerR * 0.78} 0 0,1 ${cx - outerR * 0.78},${cy}`}
        />
      </defs>

      <text
        fill={color}
        fontSize={s * 0.12}
        fontWeight="500"
        letterSpacing={s * 0.045}
      >
        <textPath href={`#top-arc-${s}`} startOffset="18%">
          SYMMETRY
        </textPath>
      </text>

      <text
        fill={color}
        fontSize={s * 0.092}
        letterSpacing={s * 0.025}
        opacity="0.85"
      >
        <textPath href={`#bot-arc-${s}`} startOffset="5%">
          PERSONAL TRAINING
        </textPath>
      </text>

      {/* Vitruvian figure */}
      {/* Small inner circle and square for Da Vinci reference */}
      <circle
        cx={cx}
        cy={cy * 1.1}
        r={s * 0.175}
        fill="none"
        stroke={color}
        strokeWidth={s * 0.012}
      />
      <rect
        x={cx - s * 0.145}
        y={cy * 0.67}
        width={s * 0.29}
        height={s * 0.28}
        fill="none"
        stroke={color}
        strokeWidth={s * 0.012}
      />

      {/* Head */}
      <circle cx={cx} cy={cy * 0.75} r={s * 0.055} fill={color} />
      {/* Body */}
      <line
        x1={cx}
        y1={cy * 0.8}
        x2={cx}
        y2={cy * 1.24}
        stroke={color}
        strokeWidth={s * 0.022}
        strokeLinecap="round"
      />
      {/* Arms horizontal */}
      <line
        x1={cx - s * 0.2}
        y1={cy * 1.0}
        x2={cx + s * 0.2}
        y2={cy * 1.0}
        stroke={color}
        strokeWidth={s * 0.022}
        strokeLinecap="round"
      />
      {/* Legs spread */}
      <line
        x1={cx}
        y1={cy * 1.24}
        x2={cx - s * 0.115}
        y2={cy * 1.46}
        stroke={color}
        strokeWidth={s * 0.022}
        strokeLinecap="round"
      />
      <line
        x1={cx}
        y1={cy * 1.24}
        x2={cx + s * 0.115}
        y2={cy * 1.46}
        stroke={color}
        strokeWidth={s * 0.022}
        strokeLinecap="round"
      />
    </svg>
  );
}
