// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — deterministic compensation detection.
// Rules layer of the ensemble: measured kinematics vs thresholds, aggregated
// across every usable rep (temporal fusion) and across views, with severity
// + confidence. Maps 1:1 onto client_assessments booleans.
// ─────────────────────────────────────────────────────────────────────────────

import type { Calibration, CompensationKey, Finding, FrameFeatures, Rep, Severity, ViewName } from './types';
import { THRESHOLDS as T } from './ces-data';
import { median } from './geometry';
import { bottomWindow, repWindow } from './reps';

interface Agg {
  key: CompensationKey;
  checkpoint: Finding['checkpoint'];
  perRepValues: number[];      // magnitude per usable rep
  flaggedReps: number;
  side: Finding['side'];
  views: Set<ViewName>;
  metricFmt: (v: number) => string;
  sevBands: [number, number, number]; // mild, moderate, severe cutoffs
}

function severity(v: number, bands: [number, number, number]): Severity | null {
  if (v >= bands[2]) return 'severe';
  if (v >= bands[1]) return 'moderate';
  if (v >= bands[0]) return 'mild';
  return null;
}

/** Aggregate one metric across reps into a Finding. */
function toFinding(a: Agg, totalUsableReps: number, qualityScore: number): Finding {
  const val = median(a.perRepValues);
  const repAgreement = totalUsableReps > 0 ? a.flaggedReps / totalUsableReps : 0;
  const present = repAgreement >= 0.5 && severity(val, a.sevBands) !== null;
  const sev = present ? severity(val, a.sevBands) : null;
  // Confidence: rep agreement × capture quality, damped near threshold
  const margin = a.sevBands[0] > 0 ? Math.min(1, val / (a.sevBands[0] * 1.6)) : 0.5;
  const confidence = Math.round(Math.min(0.98, repAgreement * 0.55 + qualityScore * 0.25 + margin * 0.2) * 100) / 100;
  return {
    key: a.key,
    present,
    checkpoint: a.checkpoint,
    severity: sev,
    confidence: present ? confidence : Math.round((1 - repAgreement) * 100) / 100,
    side: a.side,
    metric: a.metricFmt(val),
    value: Math.round(val * 10) / 10,
    repAgreement: Math.round(repAgreement * 100) / 100,
    views: Array.from(a.views),
  };
}

const d1 = (v: number) => Math.round(v * 10) / 10;

/** FRONT-view rules (frontal plane). */
export function frontalFindings(frames: FrameFeatures[], reps: Rep[], qualityScore: number): Finding[] {
  const usableReps = reps.filter((r) => r.usable);
  const out: Finding[] = [];
  if (!usableReps.length) return out;

  const collect = (
    key: CompensationKey,
    checkpoint: Finding['checkpoint'],
    pick: (f: FrameFeatures) => number | undefined,
    bands: [number, number, number],
    metricFmt: (v: number) => string,
    side: Finding['side'] = null,
    useWholeRep = false,
  ) => {
    const perRep: number[] = [];
    let flagged = 0;
    for (const rep of usableReps) {
      const win = useWholeRep ? repWindow(frames, rep) : bottomWindow(frames, rep);
      const vals = win.map(pick).filter((v): v is number => typeof v === 'number');
      if (!vals.length) continue;
      const v = median(vals);
      perRep.push(v);
      if (v >= bands[0]) flagged++;
    }
    if (!perRep.length) return;
    out.push(
      toFinding(
        { key, checkpoint, perRepValues: perRep, flaggedReps: flagged, side, views: new Set(['front']), metricFmt, sevBands: bands },
        usableReps.length,
        qualityScore,
      ),
    );
  };

  // Knee valgus — whole-rep max matters (ascent valgus is common); per side then merge
  const valgusBands: [number, number, number] = [T.kneeValgusMildDeg, T.kneeValgusModerateDeg, T.kneeValgusSevereDeg];
  const perRepL: number[] = []; const perRepR: number[] = [];
  let flaggedLR = 0;
  for (const rep of usableReps) {
    const win = repWindow(frames, rep);
    const l = win.map((f) => f.kneeValgusL).filter((v): v is number => typeof v === 'number');
    const r = win.map((f) => f.kneeValgusR).filter((v): v is number => typeof v === 'number');
    if (l.length) perRepL.push(Math.max(...l));
    if (r.length) perRepR.push(Math.max(...r));
    if ((l.length && Math.max(...l) >= valgusBands[0]) || (r.length && Math.max(...r) >= valgusBands[0])) flaggedLR++;
  }
  const mL = median(perRepL); const mR = median(perRepR);
  if (perRepL.length || perRepR.length) {
    const worst = Math.max(mL, mR);
    const side: Finding['side'] = mL >= valgusBands[0] && mR >= valgusBands[0] ? 'bilateral' : mL > mR ? 'left' : 'right';
    out.push(
      toFinding(
        {
          key: 'knees_cave_in', checkpoint: 'knee', perRepValues: [worst], flaggedReps: flaggedLR, side,
          views: new Set(['front']),
          metricFmt: () => `knee drift ${d1(mR)}°R / ${d1(mL)}°L`,
          sevBands: valgusBands,
        },
        usableReps.length,
        qualityScore,
      ),
    );
    // Varus (negative deviation)
    const varusL = median(perRepL.map((v) => -v).filter((v) => v > 0));
    const varusR = median(perRepR.map((v) => -v).filter((v) => v > 0));
    const varusWorst = Math.max(varusL || 0, varusR || 0);
    if (varusWorst >= T.kneeVarusDeg) {
      out.push({
        key: 'knees_bow_out', present: true, checkpoint: 'knee', severity: severity(varusWorst, [T.kneeVarusDeg, T.kneeVarusDeg + 4, T.kneeVarusDeg + 8]),
        confidence: 0.7 * qualityScore + 0.2, side: (varusL || 0) > (varusR || 0) ? 'left' : 'right',
        metric: `outward drift ${d1(varusWorst)}°`, value: d1(varusWorst), repAgreement: 0.5, views: ['front'],
      });
    }
  }

  collect('feet_turn_out', 'foot_ankle', (f) => Math.max(f.footTurnoutL ?? 0, f.footTurnoutR ?? 0) || undefined,
    [T.footTurnoutDeg, T.footTurnoutDeg + 6, T.footTurnoutDeg + 14], (v) => `turnout ${d1(v)}°`);

  collect('lateral_asymmetry', 'lphc', (f) => (typeof f.weightShift === 'number' ? Math.abs(f.weightShift) : undefined),
    [T.asymShiftFrac, T.asymShiftFrac * 1.8, T.asymShiftFrac * 3], (v) => `shift ${Math.round(v * 100)}% of hip width`,
    null, true);
  // annotate shift side
  const shiftVals = usableReps.flatMap((rep) => bottomWindow(frames, rep).map((f) => f.weightShift ?? 0));
  const shiftMed = median(shiftVals);
  const asym = out.find((f) => f.key === 'lateral_asymmetry');
  if (asym) asym.side = shiftMed > 0 ? 'right' : 'left';

  collect('shoulder_elevation', 'shoulder', (f) => f.shoulderElevation,
    [T.shoulderElevationDeg, T.shoulderElevationDeg * 1.8, T.shoulderElevationDeg * 3], (v) => `elevation ${d1(v)}°`);

  return out;
}

/** SIDE-view rules (sagittal plane). */
export function sagittalFindings(frames: FrameFeatures[], reps: Rep[], cal: Calibration | null, qualityScore: number, view: ViewName): Finding[] {
  const usableReps = reps.filter((r) => r.usable);
  const out: Finding[] = [];
  if (!usableReps.length) return out;

  const agg = (pick: (f: FrameFeatures) => number | undefined, whole = false) => {
    const perRep: number[] = [];
    for (const rep of usableReps) {
      const win = whole ? repWindow(frames, rep) : bottomWindow(frames, rep);
      const vals = win.map(pick).filter((v): v is number => typeof v === 'number');
      if (vals.length) perRep.push(median(vals));
    }
    return perRep;
  };
  const flaggedCount = (perRep: number[], thr: number) => perRep.filter((v) => v >= thr).length;

  // Excessive forward lean: trunk lean high AND trunk–tibia not parallel
  const lean = agg((f) => f.trunkLean);
  const delta = agg((f) => f.trunkTibiaDelta);
  if (lean.length) {
    const leanMed = median(lean);
    const deltaMed = median(delta);
    const flagged = usableReps.filter((_, i) => (lean[i] ?? 0) >= T.trunkLeanFlagDeg && (delta[i] ?? 0) >= T.trunkTibiaParallelTolDeg).length;
    const present = flagged / usableReps.length >= 0.5;
    out.push({
      key: 'excessive_forward_lean', present, checkpoint: 'lphc',
      severity: present ? severity(leanMed, [T.trunkLeanFlagDeg, T.trunkLeanFlagDeg + 8, T.trunkLeanFlagDeg + 16]) : null,
      confidence: Math.min(0.97, (flagged / usableReps.length) * 0.6 + qualityScore * 0.3),
      side: null, metric: `trunk ${d1(leanMed)}° vs tibia Δ${d1(deltaMed)}°`, value: d1(leanMed),
      repAgreement: usableReps.length ? flagged / usableReps.length : 0, views: [view],
    });
  }

  // Low back arch / rounds vs standing baseline
  const lumbar = agg((f) => f.lumbarExt);
  if (lumbar.length) {
    const v = median(lumbar);
    if (v >= 0) {
      out.push({
        key: 'low_back_arch', present: v >= T.pelvisTiltArchDeltaDeg && flaggedCount(lumbar, T.pelvisTiltArchDeltaDeg) / usableReps.length >= 0.5,
        checkpoint: 'lphc',
        severity: v >= T.pelvisTiltArchDeltaDeg ? severity(v, [T.pelvisTiltArchDeltaDeg, T.pelvisTiltArchDeltaDeg * 1.7, T.pelvisTiltArchDeltaDeg * 2.6]) : null,
        confidence: Math.min(0.95, 0.5 + qualityScore * 0.3),
        side: null, metric: `pelvis +${d1(v)}° vs your baseline`, value: d1(v),
        repAgreement: flaggedCount(lumbar, T.pelvisTiltArchDeltaDeg) / usableReps.length, views: [view],
      });
    } else {
      out.push({
        key: 'low_back_rounds', present: v <= T.pelvisTiltRoundDeltaDeg && flaggedCount(lumbar.map((x) => -x), -T.pelvisTiltRoundDeltaDeg) / usableReps.length >= 0.5,
        checkpoint: 'lphc',
        severity: v <= T.pelvisTiltRoundDeltaDeg ? severity(-v, [-T.pelvisTiltRoundDeltaDeg, -T.pelvisTiltRoundDeltaDeg * 1.7, -T.pelvisTiltRoundDeltaDeg * 2.6]) : null,
        confidence: Math.min(0.95, 0.5 + qualityScore * 0.3),
        side: null, metric: `pelvis ${d1(v)}° (rounding) vs baseline`, value: d1(v),
        repAgreement: flaggedCount(lumbar.map((x) => -x), -T.pelvisTiltRoundDeltaDeg) / usableReps.length, views: [view],
      });
    }
  }

  // Arms fall forward
  const arms = agg((f) => f.armsForward);
  if (arms.length) {
    const v = median(arms);
    out.push({
      key: 'arms_fall_forward', present: v >= T.armsForwardDeg && flaggedCount(arms, T.armsForwardDeg) / usableReps.length >= 0.5,
      checkpoint: 'shoulder',
      severity: v >= T.armsForwardDeg ? severity(v, [T.armsForwardDeg, T.armsForwardDeg + 10, T.armsForwardDeg + 20]) : null,
      confidence: Math.min(0.95, 0.5 + qualityScore * 0.3),
      side: null, metric: `arms drift ${d1(v)}° from overhead`, value: d1(v),
      repAgreement: flaggedCount(arms, T.armsForwardDeg) / usableReps.length, views: [view],
    });
  }

  // Forward head
  const fh = agg((f) => f.forwardHead);
  if (fh.length) {
    const v = median(fh);
    out.push({
      key: 'forward_head', present: v >= T.forwardHeadFrac && flaggedCount(fh, T.forwardHeadFrac) / usableReps.length >= 0.5,
      checkpoint: 'head',
      severity: v >= T.forwardHeadFrac ? severity(v, [T.forwardHeadFrac, T.forwardHeadFrac * 1.8, T.forwardHeadFrac * 3]) : null,
      confidence: Math.min(0.9, 0.45 + qualityScore * 0.3),
      side: null, metric: `head forward ${Math.round(v * 100)}% of torso`, value: d1(v * 100),
      repAgreement: flaggedCount(fh, T.forwardHeadFrac) / usableReps.length, views: [view],
    });
  }

  // Ankle restriction (the root signal) — measured at squat depth.
  // Two evidences: low dorsiflexion (tibia can't advance) and, when BlazePose
  // foot landmarks exist, an actual heel lift. Either raises the flag; both
  // together raise confidence. Keyed 'heel_rise' = the ankle checkpoint.
  const df = agg((f) => f.ankleDorsiflexion);
  if (df.length) {
    const dfV = median(df);
    const restricted = dfV < T.ankleDorsiflexionLowDeg;
    const hr = agg((f) => f.heelRise);
    const hrV = hr.length ? median(hr) : 0;
    const hrPresent = hrV >= T.heelRiseFrac;
    const present = hrPresent || restricted;
    out.push({
      key: 'heel_rise',
      checkpoint: 'foot_ankle',
      present,
      severity: hrPresent
        ? severity(hrV, [T.heelRiseFrac, T.heelRiseFrac * 2, T.heelRiseFrac * 3.2])
        : restricted
          ? (dfV < 18 ? 'moderate' : 'mild')
          : null,
      confidence: Math.min(0.95, 0.5 + qualityScore * 0.3 + (hr.length ? 0.1 : 0)),
      side: null,
      metric: hrPresent
        ? `heel lift ${Math.round(hrV * 100)}% tibia · dorsiflexion ${d1(dfV)}°`
        : `dorsiflexion ${d1(dfV)}° (target ≥30°)`,
      value: d1(dfV),
      repAgreement: hrPresent ? 0.8 : restricted ? 0.7 : 0,
      views: [view],
    });
  }

  return out;
}

/** Merge findings for the same key across views (e.g., side L + side R). */
export function mergeFindings(all: Finding[]): Finding[] {
  const byKey = new Map<CompensationKey, Finding>();
  for (const f of all) {
    const prev = byKey.get(f.key);
    if (!prev) {
      byKey.set(f.key, { ...f });
      continue;
    }
    const both = prev.present && f.present;
    const either = prev.present || f.present;
    const stronger = (f.value ?? 0) > (prev.value ?? 0) ? f : prev;
    byKey.set(f.key, {
      ...stronger,
      present: either,
      confidence: Math.min(0.98, both ? Math.max(prev.confidence, f.confidence) + 0.08 : Math.max(prev.confidence, f.confidence)),
      views: Array.from(new Set([...prev.views, ...f.views])),
      side: prev.side === f.side ? prev.side : prev.side && f.side ? 'bilateral' : prev.side || f.side,
    });
  }
  return Array.from(byKey.values());
}
