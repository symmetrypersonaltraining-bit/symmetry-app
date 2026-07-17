'use client';

// ─────────────────────────────────────────────────────────────────────────────
// SkeletonOverlay — draws the JOINT-ACCURATE tracking skeleton over the video.
// This is the FUNCTIONAL layer: it renders exactly the tracked joints/segments
// the engine measures. A realistic anatomy model (bones + muscle) is a separate
// VISUAL layer that rigs to these same joints — see <AnatomyRigSlot/> below.
// ─────────────────────────────────────────────────────────────────────────────

import type { Keypoint } from '@/lib/movement/types';

const EDGES: [string, string][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'], ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'], ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'], ['right_knee', 'right_ankle'],
];

export interface FlaggedJoint {
  name: string;
  level: 'warn' | 'bad';
  label?: string;
}

export default function SkeletonOverlay({
  keypoints,
  width,
  height,
  flagged = [],
  showSpine = true,
  minScore = 0.3,
}: {
  keypoints: Keypoint[];
  width: number;
  height: number;
  flagged?: FlaggedJoint[];
  showSpine?: boolean;
  minScore?: number;
}) {
  const at = (n: string) => {
    const k = keypoints.find((p) => p.name === n);
    return k && k.score >= minScore ? { x: k.x * width, y: k.y * height, s: k.score } : null;
  };
  const mid = (a: string, b: string) => {
    const p = at(a); const q = at(b);
    return p && q ? { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } : null;
  };
  const flagOf = (n: string) => flagged.find((f) => f.name === n);

  const shoulderMid = mid('left_shoulder', 'right_shoulder');
  const hipMid = mid('left_hip', 'right_hip');
  const neck = shoulderMid;
  const nose = at('nose');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      <defs>
        <filter id="skGlow"><feGaussianBlur stdDeviation="2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <linearGradient id="spineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38e1ff" /><stop offset="55%" stopColor="#8b7bff" /><stop offset="100%" stopColor="#ffb454" />
        </linearGradient>
      </defs>

      {/* segments */}
      {EDGES.map(([a, b], i) => {
        const p = at(a); const q = at(b);
        if (!p || !q) return null;
        return (
          <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            stroke="#2ef2b4" strokeWidth={3} strokeLinecap="round" opacity={0.9} filter="url(#skGlow)" />
        );
      })}

      {/* spine spline neck→hip (visual continuity of the trunk) */}
      {showSpine && neck && hipMid && (
        <path
          d={`M ${neck.x} ${neck.y} Q ${(neck.x + hipMid.x) / 2 + 6} ${(neck.y + hipMid.y) / 2} ${hipMid.x} ${hipMid.y}`}
          stroke="url(#spineGrad)" strokeWidth={3.4} fill="none" filter="url(#skGlow)" />
      )}
      {/* head */}
      {nose && neck && (
        <>
          <line x1={neck.x} y1={neck.y} x2={nose.x} y2={nose.y} stroke="#2ef2b4" strokeWidth={3} strokeLinecap="round" opacity={0.9} />
          <circle cx={nose.x} cy={nose.y} r={12} fill="none" stroke="#2ef2b4" strokeWidth={2.4} />
        </>
      )}

      {/* joints */}
      {keypoints.filter((k) => k.score >= minScore && k.name !== 'nose' && !k.name.includes('eye') && !k.name.includes('ear')).map((k, i) => {
        const f = flagOf(k.name);
        const color = f?.level === 'bad' ? '#ff5c7a' : f?.level === 'warn' ? '#ffb454' : '#f2fffd';
        return (
          <g key={i}>
            <circle cx={k.x * width} cy={k.y * height} r={4} fill={color} stroke="rgba(46,242,180,.55)" strokeWidth={3} />
            {f && (
              <circle cx={k.x * width} cy={k.y * height} r={9} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7}>
                <animate attributeName="r" values="7;15;7" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".8;0;.8" dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AnatomyRigSlot — the VISUAL anatomy layer mount point.
// A realistic rigged anatomy asset (3D GLB posed by joints, or a layered 2D
// anatomy puppet) renders HERE, driven by the SAME keypoints. Left as a slot so
// the photoreal asset (licensed/generated) drops in without touching tracking.
// ─────────────────────────────────────────────────────────────────────────────
export function AnatomyRigSlot({ children }: { children?: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{children}</div>;
}
