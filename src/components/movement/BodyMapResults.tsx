'use client';

// ─────────────────────────────────────────────────────────────────────────────
// BodyMapResults — the results-screen anatomy visual. Shows a translucent
// full-body anatomy image with the chain findings pinned onto the right body
// regions (root / compensation / pain-site), glowing by severity. Works with a
// dropped free-for-commercial anatomy image at /anatomy-body.png; until that
// exists it renders a styled translucent-body placeholder so the layout is live.
// Region positions are percentages of a standing front-facing body, so they line
// up with any full-body anatomy image.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import type { Checkpoint } from '@/lib/movement/types';

interface ChainNode { role: string; checkpoint: Checkpoint; findings: string[] }

// vertical % from top for each checkpoint on a standing front-facing body
const REGION_Y: Record<Checkpoint, number> = {
  head: 8, shoulder: 26, lphc: 50, knee: 74, foot_ankle: 92,
};
const ROLE_COLOR: Record<string, string> = {
  root: '#ff5c7a', compensation: '#ffb454', pain_site: '#8b7bff', clean: '#39e08b',
};

export default function BodyMapResults({
  chain,
  labels,
  imageSrc = '/anatomy-body.png',
}: {
  chain: ChainNode[];
  labels: Record<string, string>;
  imageSrc?: string;
}) {
  const [hasImg, setHasImg] = useState(true);
  const active = chain.filter((n) => n.role === 'root' || n.role === 'compensation' || n.role === 'pain_site');

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 320, margin: '0 auto', aspectRatio: '9/19', borderRadius: 18, overflow: 'hidden', background: 'radial-gradient(220px 260px at 50% 32%, #0d1a33 0%, transparent 70%), linear-gradient(180deg,#070d1c,#02050c)', border: '1px solid #14233f' }}>
      {/* the anatomy image (or a styled placeholder body) */}
      {hasImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="anatomy" onError={() => setHasImg(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.92 }} />
      ) : (
        <PlaceholderBody />
      )}
      {/* scan sweep */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 2, background: 'rgba(56,225,255,.5)', animation: 'sbScan 4.5s ease-in-out infinite' }} />
      <style>{`@keyframes sbScan{0%,100%{top:10%}50%{top:88%}}@keyframes sbPulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(1.25);opacity:.4}}`}</style>

      {/* finding pins */}
      {active.map((n, i) => {
        const y = REGION_Y[n.checkpoint] ?? 50;
        const color = ROLE_COLOR[n.role] ?? '#39e08b';
        const side = i % 2 === 0 ? 'left' : 'right';
        return (
          <div key={i} style={{ position: 'absolute', top: `${y}%`, left: 0, right: 0 }}>
            {/* marker on the body midline */}
            <div style={{ position: 'absolute', left: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 14px ${color}`, animation: 'sbPulse 1.8s ease-in-out infinite' }} />
            {/* label to the side */}
            <div style={{ position: 'absolute', [side]: 8, top: -10, maxWidth: 120,
              background: 'rgba(5,12,26,.85)', border: `1px solid ${color}66`, borderRadius: 8, padding: '4px 7px', backdropFilter: 'blur(4px)' }}>
              <div style={{ font: '800 8px ui-monospace,monospace', color, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {n.role === 'root' ? 'Root' : n.role === 'pain_site' ? 'Your pain' : 'Compensating'}
              </div>
              <div style={{ fontSize: 10, color: '#dbe8ff', fontWeight: 700, lineHeight: 1.2 }}>{labels[n.checkpoint] ?? n.checkpoint}</div>
            </div>
            {/* connector line from label to midline */}
            <div style={{ position: 'absolute', top: 0, [side]: 130, width: `calc(50% - 130px)`, height: 1, background: `${color}55` }} />
          </div>
        );
      })}

      {!hasImg && (
        <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', font: '600 8.5px ui-monospace,monospace', color: '#5a6d95' }}>
          drop a translucent-anatomy image at /public/anatomy-body.png
        </div>
      )}
    </div>
  );
}

// Simple translucent standing-body placeholder (until the real image is dropped)
function PlaceholderBody() {
  return (
    <svg viewBox="0 0 120 260" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs>
        <linearGradient id="pbBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f6fb0" stopOpacity="0.28" /><stop offset="100%" stopColor="#1a3a5a" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g fill="url(#pbBody)" stroke="rgba(120,200,255,.35)" strokeWidth="0.6">
        <circle cx="60" cy="20" r="12" />
        <path d="M52,32 C44,34 42,42 42,52 L40,110 C40,120 46,126 52,128 L52,150 L46,220 L54,222 L60,150 L66,222 L74,220 L68,150 L68,128 C74,126 80,120 80,110 L78,52 C78,42 76,34 68,32 Z" />
        <path d="M43,50 L26,58 L24,66 L42,62 Z" /><path d="M77,50 L94,58 L96,66 L78,62 Z" />
      </g>
      {/* faint skeleton hint */}
      <g stroke="rgba(210,235,255,.4)" strokeWidth="1" fill="none">
        <line x1="60" y1="34" x2="60" y2="120" /><line x1="52" y1="128" x2="50" y2="220" /><line x1="68" y1="128" x2="70" y2="220" />
        <line x1="46" y1="54" x2="26" y2="62" /><line x1="74" y1="54" x2="94" y2="62" />
      </g>
    </svg>
  );
}
