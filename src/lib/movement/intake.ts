// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — intake (Pillar 1) + red-flag safety screening.
// Maps the client's own words → suspected root hypothesis (tells the screen
// what to look hardest for) and screens for two-tier red flags.
// Safety = flag + recommend, NEVER lock.
// ─────────────────────────────────────────────────────────────────────────────

import type { Checkpoint, PainMapEntry } from './types';
import { PAIN_PATTERNS, RED_FLAGS } from './ces-data';

export interface IntakeResult {
  suspectedRoot: Checkpoint | null;
  area: string | null;
  internalNote: string | null;
  acuteFlag: boolean;                 // ≤6 weeks
  redFlags: { tier: 1 | 2; trigger: string }[];
}

export function screenIntake(
  words: string,
  painMap: PainMapEntry[],
  durationWeeks: number | null,
): IntakeResult {
  const text = `${words} ${painMap.map((p) => `${p.area} ${p.description ?? ''}`).join(' ')}`;

  // Suspected root from the pain-pattern library
  let suspectedRoot: Checkpoint | null = null;
  let area: string | null = null;
  let internalNote: string | null = null;
  for (const p of PAIN_PATTERNS) {
    if (p.match.test(text)) {
      suspectedRoot = p.suspectedRoot;
      area = p.area;
      internalNote = p.internalNote;
      break;
    }
  }

  // Acute vs chronic (NASM convention ~6 weeks)
  const minDuration = painMap.reduce<number | null>((min, p) => {
    if (typeof p.durationWeeks === 'number') return min === null ? p.durationWeeks : Math.min(min, p.durationWeeks);
    return min;
  }, durationWeeks);
  const acuteFlag = minDuration !== null && minDuration <= 6;

  // Two-tier red flags — flag + recommend, never lock
  const redFlags: { tier: 1 | 2; trigger: string }[] = [];
  for (const rf of RED_FLAGS.tier1) if (rf.match.test(text)) redFlags.push({ tier: 1, trigger: rf.trigger });
  for (const rf of RED_FLAGS.tier2) if (rf.match.test(text)) redFlags.push({ tier: 2, trigger: rf.trigger });

  return { suspectedRoot, area, internalNote, acuteFlag, redFlags };
}
