// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — geometry & signal utilities
// Pure functions, unit-tested via selftest.ts. All angles in degrees.
// Coordinates: normalized video space (x right, y DOWN — screen convention).
// ─────────────────────────────────────────────────────────────────────────────

import type { Keypoint } from './types';

export interface Pt { x: number; y: number }

export const deg = (rad: number) => (rad * 180) / Math.PI;

export function kp(frameKps: Keypoint[], name: string): Keypoint | null {
  const k = frameKps.find((p) => p.name === name);
  return k && k.score > 0 ? k : null;
}

export function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interior angle at vertex b of triangle a-b-c (0..180). */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = v1.x * v2.x + v1.y * v2.y;
  const m = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (m === 0) return 0;
  return deg(Math.acos(Math.min(1, Math.max(-1, d / m))));
}

/** Angle of segment a→b measured from vertical (0 = plumb, 90 = horizontal). */
export function angleFromVertical(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return deg(Math.atan2(Math.abs(dx), Math.abs(dy)));
}

/** Signed angle of segment a→b from vertical; + when b is right of a. */
export function signedAngleFromVertical(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return deg(Math.atan2(dx, Math.abs(dy) === 0 ? 1e-9 : Math.abs(dy)));
}

/** Angle of segment a→b from horizontal (0 = flat/parallel to floor). */
export function angleFromHorizontal(a: Pt, b: Pt): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx === 0 && dy === 0) return 0;
  return deg(Math.atan2(dy, dx));
}

/**
 * Frontal-plane projection deviation at the knee:
 * + = knee medial to the hip→ankle line (valgus for that leg), − = lateral (varus).
 * `side` flips the medial direction (medial = toward body midline).
 */
export function frontalKneeDeviation(hip: Pt, knee: Pt, ankle: Pt, side: 'left' | 'right', midlineX: number): number {
  // Perpendicular distance of knee from hip–ankle line, signed toward midline.
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const len = Math.hypot(dx, dy) || 1e-9;
  // signed perpendicular distance (screen coords)
  const cross = (knee.x - hip.x) * dy - (knee.y - hip.y) * dx;
  const perp = cross / len;
  // Convert to an angle at the knee for scale-independence
  const legLen = (dist(hip, knee) + dist(knee, ankle)) / 2 || 1e-9;
  const angle = deg(Math.atan2(Math.abs(perp), legLen));
  // Medial = toward midline: for LEFT leg (screen: typically left of midline)
  // medial means knee.x > line (toward center) → perp sign depends on geometry;
  // simpler robust check: compare knee.x to line-x at knee.y, relative to midline.
  const t = dy === 0 ? 0 : (knee.y - hip.y) / dy;
  const lineXAtKnee = hip.x + dx * t;
  const towardMidline = side === 'left' ? knee.x > lineXAtKnee : knee.x < lineXAtKnee;
  const isMedial =
    (side === 'left' && knee.x > lineXAtKnee && lineXAtKnee < midlineX + 1) ||
    (side === 'right' && knee.x < lineXAtKnee && lineXAtKnee > midlineX - 1)
      ? true
      : towardMidline;
  return isMedial ? angle : -angle;
}

/** Exponential moving average smoother for keypoint streams. */
export class EmaSmoother {
  private prev: Map<string, { x: number; y: number }> = new Map();
  constructor(private alpha = 0.5) {}
  smooth(kps: Keypoint[]): Keypoint[] {
    return kps.map((p) => {
      const last = this.prev.get(p.name);
      const x = last ? this.alpha * p.x + (1 - this.alpha) * last.x : p.x;
      const y = last ? this.alpha * p.y + (1 - this.alpha) * last.y : p.y;
      this.prev.set(p.name, { x, y });
      return { ...p, x, y };
    });
  }
  reset() {
    this.prev.clear();
  }
}

/** Simple median for robust aggregation across reps. */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Segment-mass-weighted center of mass X (frontal), standard anthropometric
 * fractions (Dempster): trunk+head ≈ .578, thighs .2, shanks+feet .12, arms .1.
 */
export function comX(parts: { trunk: Pt; thighL: Pt; thighR: Pt; shankL: Pt; shankR: Pt; armL: Pt; armR: Pt }): number {
  return (
    parts.trunk.x * 0.578 +
    (parts.thighL.x + parts.thighR.x) * 0.1 +
    (parts.shankL.x + parts.shankR.x) * 0.06 +
    (parts.armL.x + parts.armR.x) * 0.05
  );
}

/**
 * Fit a quadratic spine curve through neck→midSpine→pelvis and return
 * sampled points + a curvature proxy (bow depth as fraction of chord).
 */
export function spineCurve(neck: Pt, pelvis: Pt, midOffsetFrac: number, samples = 12): { pts: Pt[]; bowFrac: number } {
  const chord = dist(neck, pelvis) || 1e-9;
  // control point offset perpendicular to the chord
  const mx = (neck.x + pelvis.x) / 2;
  const my = (neck.y + pelvis.y) / 2;
  const nx = -(pelvis.y - neck.y) / chord;
  const ny = (pelvis.x - neck.x) / chord;
  const cx = mx + nx * midOffsetFrac * chord;
  const cy = my + ny * midOffsetFrac * chord;
  const pts: Pt[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = (1 - t) * (1 - t) * neck.x + 2 * (1 - t) * t * cx + t * t * pelvis.x;
    const y = (1 - t) * (1 - t) * neck.y + 2 * (1 - t) * t * cy + t * t * pelvis.y;
    pts.push({ x, y });
  }
  return { pts, bowFrac: midOffsetFrac };
}
