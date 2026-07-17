// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — Dose-Scaling Engine.
// Pain scales the DOSE, never the structure. Continuum order is immutable.
// Symmetry standard: static holds 1–3 min, everyone starts at 1 min.
// High 7–10 → ~50% SMR / backed-off stretch / partial ROM / ~1 min
// Mod  4–6 → ~75% across the board / 1.5–2 min
// Low  1–3 → full pressure/tension/ROM / 2–3 min
// Restricted ROM override: push past gradually, ZERO compensation, quality>range.
// ─────────────────────────────────────────────────────────────────────────────

import type { DosePrescription } from './types';

export function doseForPain(painLevel: number, acute: boolean): DosePrescription {
  let d: DosePrescription;
  if (painLevel >= 7) {
    d = {
      painLevel,
      smrPressurePct: 50,
      stretchTensionPct: 60,
      activationRomPct: 50,
      holdSeconds: [60, 75],
      note: 'High pain: ease the pressure, breathe into the stretch, partial range with an isolation focus. Start at 1-minute holds.',
    };
  } else if (painLevel >= 4) {
    d = {
      painLevel,
      smrPressurePct: 75,
      stretchTensionPct: 75,
      activationRomPct: 75,
      holdSeconds: [90, 120],
      note: 'Moderate pain: ~75% pressure and tension, controlled range. Holds 1.5–2 minutes.',
    };
  } else {
    d = {
      painLevel,
      smrPressurePct: 100,
      stretchTensionPct: 100,
      activationRomPct: 100,
      holdSeconds: [120, 180],
      note: 'Low pain: full pressure, full tension, full range with progression. Holds 2–3 minutes.',
    };
  }
  if (acute) {
    d.smrPressurePct = Math.min(d.smrPressurePct, 60);
    d.stretchTensionPct = Math.min(d.stretchTensionPct, 70);
    d.note += ' Recent flare-up: everything gentler — never push into sharp pain.';
  }
  return d;
}

/** Restricted-ROM override text (applies at any pain level). */
export const RESTRICTED_ROM_NOTE =
  'Where range is restricted: work gradually past the restriction with ZERO compensation to get there. Quality of movement always beats range. Many sessions of small gains beat forcing it once.';
