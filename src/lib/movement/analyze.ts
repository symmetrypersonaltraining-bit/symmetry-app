// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — master analysis pipeline.
// Orchestrates: calibrate → per-view features → rep detect → rules (temporal
// fusion) → merge across views → wedge two-pass → chain builder → dose →
// program → per-view keyframe summaries → assessment-flag auto-fill.
// This is the deterministic core; the AI vision cross-check + narrative run in
// the API route (movement-analyze) and adjust confidence + write the education.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnalysisResult, Calibration, Checkpoint, Finding, Frame, FrameFeatures, PainMapEntry, ViewCapture, ViewName,
} from './types';
import { calibrateFromStanding, calibrateSagittal, extractFrontal, extractSagittal } from './features';
import { detectReps, bottomWindow } from './reps';
import { frontalFindings, sagittalFindings, mergeFindings } from './rules';
import { buildChain, compareWedge } from './chain';
import { screenIntake } from './intake';
import { CHECKPOINT_LABELS, SURFACE_COPY } from './ces-data';
import { median } from './geometry';

export interface KeyframeSummary {
  view: ViewName;
  repIndex: number;
  tMs: number;                   // timestamp of the still to grab
  findingsHere: { key: string; label: string; plain: string; metric: string }[];
  headline: string;              // plain-language "what's happening in this shot"
  whyItMatters: string;          // full explanation of why it's a problem
}

export interface EngineOutput extends AnalysisResult {
  keyframes: KeyframeSummary[];
  suspectedRoot: Checkpoint | null;
  intakeNote: string | null;
}

export interface AnalyzeInput {
  assessment: AnalysisResult['assessment'];
  capturedAt: string;
  standingFrontFrame: Frame | null;
  standingSideFrame: Frame | null;
  views: ViewCapture[];
  intakeWords: string;
  painMap: PainMapEntry[];
  durationWeeks: number | null;
}

export function analyze(input: AnalyzeInput): EngineOutput {
  // 1. Calibration (personal biomechanical model)
  let cal: Calibration | null = input.standingFrontFrame ? calibrateFromStanding(input.standingFrontFrame) : null;
  if (cal && input.standingSideFrame) cal = calibrateSagittal(input.standingSideFrame, cal);

  // 2. Intake hypothesis + red flags
  const intake = screenIntake(input.intakeWords, input.painMap, input.durationWeeks);

  // 3. Per-view feature extraction + rep detection + rules
  const allFindings: Finding[] = [];
  const keyframes: KeyframeSummary[] = [];
  let totalFrames = 0;
  let repsAnalyzed = 0;
  const qualityScores: number[] = [];

  // hold flat sagittal for wedge compare
  let flatSideFeatures: FrameFeatures[] = [];
  let flatSideReps: ReturnType<typeof detectReps> = [];
  let wedgeSideFeatures: FrameFeatures[] = [];
  let wedgeSideReps: ReturnType<typeof detectReps> = [];

  for (const v of input.views) {
    totalFrames += v.frames.length;
    const q = v.quality.avgKeypointScore || 0.6;
    qualityScores.push(q);

    const feats: FrameFeatures[] = [];
    for (const fr of v.frames) {
      const f =
        v.view === 'front'
          ? extractFrontal(fr, cal)
          : extractSagittal(fr, v.view, cal, v.wedge ? wedgeHeelBaseline(fr) : null);
      if (f) feats.push(f);
    }
    const reps = detectReps(feats);
    repsAnalyzed = Math.max(repsAnalyzed, reps.filter((r) => r.usable).length);

    let viewFindings: Finding[] = [];
    if (v.view === 'front') {
      viewFindings = frontalFindings(feats, reps, q);
    } else {
      viewFindings = sagittalFindings(feats, reps, cal, q, v.view);
      if (v.wedge) {
        wedgeSideFeatures = feats;
        wedgeSideReps = reps;
      } else {
        flatSideFeatures = feats;
        flatSideReps = reps;
      }
    }
    allFindings.push(...viewFindings);

    // 3b. Per-view keyframe summaries (still shots + explanations)
    keyframes.push(...buildKeyframes(v.view, feats, reps, viewFindings));
  }

  // 4. Merge findings across views (front + both sides)
  const merged = mergeFindings(allFindings);

  // 5. Wedge two-pass differential
  const wedge =
    flatSideReps.length && wedgeSideReps.length
      ? compareWedge(flatSideFeatures, flatSideReps, wedgeSideFeatures, wedgeSideReps)
      : null;

  // 6. Ground-up chain builder (regional interdependence + wedge arbitration)
  const { chain, hypothesisConfirmed, cleanCheckpoints } = buildChain(merged, wedge, input.painMap, intake.suspectedRoot);

  // 7. Assessment-flag auto-fill (1:1 with client_assessments booleans)
  const assessmentFlags = fillAssessmentFlags(merged);

  const overallConfidence =
    merged.filter((f) => f.present).length
      ? Math.round((merged.filter((f) => f.present).reduce((s, f) => s + f.confidence, 0) / merged.filter((f) => f.present).length) * 100) / 100
      : 0.5;

  const quality = {
    avgKeypointScore: qualityScores.length ? median(qualityScores) : 0.6,
    framingOk: input.views.every((v) => v.quality.framingOk),
    lightingOk: input.views.every((v) => v.quality.lightingOk),
    levelOk: input.views.every((v) => v.quality.levelOk),
    distanceOk: input.views.every((v) => v.quality.distanceOk),
    singlePerson: input.views.every((v) => v.quality.singlePerson),
    notes: input.views.flatMap((v) => v.quality.notes),
  };

  return {
    assessment: input.assessment,
    capturedAt: input.capturedAt,
    repsAnalyzed,
    totalFrames,
    calibration: cal,
    findings: merged,
    cleanCheckpoints,
    wedge,
    chain,
    hypothesisConfirmed,
    overallConfidence,
    quality,
    acuteFlag: intake.acuteFlag,
    assessmentFlags,
    redFlags: intake.redFlags,
    keyframes,
    suspectedRoot: intake.suspectedRoot,
    intakeNote: intake.internalNote,
  };
}

// ── per-view keyframe builder ────────────────────────────────────────────────
function buildKeyframes(view: ViewName, feats: FrameFeatures[], reps: ReturnType<typeof detectReps>, findings: Finding[]): KeyframeSummary[] {
  const usable = reps.filter((r) => r.usable);
  if (!usable.length) return [];
  // Represent each view by its most-informative rep (deepest / clearest bottom)
  const rep = usable[Math.floor(usable.length / 2)];
  const present = findings.filter((f) => f.present && f.views.includes(view));
  if (!present.length) {
    return [{
      view, repIndex: rep.index, tMs: rep.bottomT, findingsHere: [],
      headline: viewLabel(view) + ': this checkpoint looked clean.',
      whyItMatters: 'Nothing here needed correcting — the movement stayed in a good position through the range.',
    }];
  }
  const findingsHere = present.map((f) => ({
    key: f.key,
    label: SURFACE_COPY[f.key]?.label ?? f.key,
    plain: SURFACE_COPY[f.key]?.plain ?? '',
    metric: f.metric,
  }));
  return [{
    view,
    repIndex: rep.index,
    tMs: rep.bottomT,
    findingsHere,
    headline: `${viewLabel(view)}, bottom of rep ${rep.index}: ${findingsHere.map((f) => f.label.toLowerCase()).join(', ')}.`,
    whyItMatters: present
      .map((f) => `${SURFACE_COPY[f.key]?.plain ?? ''} We measured it at ${f.metric}.`)
      .join(' '),
  }];
}

function viewLabel(v: ViewName): string {
  return {
    front: 'Front view', side_left: 'Side view (left)', side_right: 'Side view (right)',
    wedge: 'Wedge test (heels raised)', back: 'Back view',
  }[v];
}

// ── assessment-flag auto-fill ────────────────────────────────────────────────
export function fillAssessmentFlags(findings: Finding[]): Record<string, boolean> {
  const has = (k: string) => findings.some((f) => f.key === k && f.present);
  return {
    feet_turn_out: has('feet_turn_out'),
    excessive_forward_lean: has('excessive_forward_lean'),
    knees_cave_in: has('knees_cave_in'),
    low_back_arch: has('low_back_arch'),
    arms_fall_forward: has('arms_fall_forward'),
    forward_head: has('forward_head'),
    lateral_asymmetry: has('lateral_asymmetry'),
    balance_deficits: has('balance_deficits'),
  };
}

function wedgeHeelBaseline(_frame: Frame): number | null {
  return null; // heel baseline resolved per-frame in features; wedge offset handled by rig
}

export { CHECKPOINT_LABELS };
