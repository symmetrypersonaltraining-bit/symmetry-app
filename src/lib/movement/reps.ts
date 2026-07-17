// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — rep detection & segmentation.
// Finds squat reps from the hip-height (or depth-fraction) time series,
// classifies descent/bottom/ascent, validates depth + tempo per rep.
// ─────────────────────────────────────────────────────────────────────────────

import type { FrameFeatures, Rep } from './types';
import { THRESHOLDS } from './ces-data';

const MIN_REP_MS = 1200;   // < this = bounce, not a rep
const MAX_REP_MS = 12000;
const TARGET_TEMPO_MS = 2000; // ~2s down / 2s up

/** Detect reps from a depth-fraction series (0 standing → 1 parallel). */
export function detectReps(frames: FrameFeatures[]): Rep[] {
  const usable = frames.filter((f) => typeof f.depthFrac === 'number');
  if (usable.length < 10) return [];

  // Light smoothing
  const depth: number[] = [];
  for (let i = 0; i < usable.length; i++) {
    const w = [usable[i - 1]?.depthFrac, usable[i].depthFrac, usable[i + 1]?.depthFrac]
      .filter((v): v is number => typeof v === 'number');
    depth.push(w.reduce((a, b) => a + b, 0) / w.length);
  }

  const STAND = 0.22;  // below = standing
  const DOWN = 0.5;    // above = clearly descending into a rep

  const reps: Rep[] = [];
  let state: 'standing' | 'in_rep' = 'standing';
  let startI = 0;
  let bottomI = 0;
  let bottomVal = 0;

  for (let i = 1; i < depth.length; i++) {
    if (state === 'standing') {
      if (depth[i] > DOWN && depth[i] > depth[i - 1]) {
        state = 'in_rep';
        // walk back to the true start (last standing frame)
        let j = i;
        while (j > 0 && depth[j - 1] > STAND && depth[j - 1] < depth[j]) j--;
        startI = j;
        bottomI = i;
        bottomVal = depth[i];
      }
    } else {
      if (depth[i] > bottomVal) {
        bottomVal = depth[i];
        bottomI = i;
      }
      if (depth[i] < STAND) {
        const startT = usable[startI].t;
        const endT = usable[i].t;
        const durMs = endT - startT;
        if (durMs >= MIN_REP_MS && durMs <= MAX_REP_MS) {
          const reachedDepth = bottomVal >= THRESHOLDS.repMinDepthFrac;
          const downMs = usable[bottomI].t - startT;
          const upMs = endT - usable[bottomI].t;
          const tempoOk = downMs > TARGET_TEMPO_MS * 0.4 && upMs > TARGET_TEMPO_MS * 0.3;
          const notes: string[] = [];
          if (!reachedDepth) notes.push('depth_short');
          if (!tempoOk) notes.push('tempo_fast');
          reps.push({
            index: reps.length + 1,
            startT,
            bottomT: usable[bottomI].t,
            endT,
            usable: reachedDepth,
            reachedDepth,
            tempoOk,
            notes,
          });
        }
        state = 'standing';
      }
    }
  }
  return reps;
}

/** Frames in the bottom window of a rep (±ms around bottomT). */
export function bottomWindow(frames: FrameFeatures[], rep: Rep, windowMs = 350): FrameFeatures[] {
  return frames.filter((f) => Math.abs(f.t - rep.bottomT) <= windowMs);
}

/** Frames across a whole rep (descent → ascent) for temporal analysis. */
export function repWindow(frames: FrameFeatures[], rep: Rep): FrameFeatures[] {
  return frames.filter((f) => f.t >= rep.startT && f.t <= rep.endT);
}
