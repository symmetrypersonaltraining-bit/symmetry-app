// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — shared types
// Internal logic follows the current corrective-exercise protocol (CES 2nd ed.)
// as the private backbone. NOTHING in user-facing copy may reference NASM,
// condition names, or diagnostic language. See ces-data.ts SURFACE_COPY.
// ─────────────────────────────────────────────────────────────────────────────

export type ViewName = 'front' | 'side_left' | 'side_right' | 'back' | 'wedge';

export type AssessmentType = 'OHSA' | 'BOX_SQUAT' | 'SLS' | 'SPLIT_SQUAT' | 'PUSH' | 'PULL' | 'POSTURE';

/** Normalized 2D keypoint (0..1 in video space) with confidence. */
export interface Keypoint {
  name: string;
  x: number;
  y: number;
  z?: number;            // BlazePose provides rough depth
  score: number;         // 0..1 visibility/confidence
}

export interface Frame {
  t: number;             // ms since capture start
  keypoints: Keypoint[];
}

/** One recorded view (e.g. front pass, side pass, wedge pass). */
export interface ViewCapture {
  view: ViewName;
  assessment: AssessmentType;
  wedge: boolean;                 // heels elevated pass
  handsOnHips?: boolean;          // modification pass (removes lat/shoulder demand)
  frames: Frame[];
  fps: number;
  quality: CaptureQuality;
}

export interface CaptureQuality {
  avgKeypointScore: number;       // mean visibility across key joints
  framingOk: boolean;
  lightingOk: boolean;
  levelOk: boolean;
  distanceOk: boolean;
  singlePerson: boolean;
  notes: string[];
}

/** Calibration from the 2s standing hold — scales thresholds to THIS body. */
export interface Calibration {
  torsoLen: number;               // shoulderMid→hipMid, normalized units
  femurLen: number;
  tibiaLen: number;
  shoulderWidth: number;
  hipWidth: number;
  standingPelvisTilt: number;     // deg, sagittal baseline
  standingTrunkAngle: number;     // deg from vertical
  standingShoulderDelta: number;  // L/R height diff (frontal), deg
  standingForwardHead: number;    // ear→shoulder horizontal offset / torsoLen
}

/** Per-frame kinematic features. Angles in degrees. */
export interface FrameFeatures {
  t: number;
  view: ViewName;
  // frontal
  kneeValgusL?: number;           // + = knee medial to hip–ankle line (valgus), − = varus
  kneeValgusR?: number;
  footTurnoutL?: number;
  footTurnoutR?: number;
  pelvisObliquity?: number;       // frontal pelvis drop, + = right low
  weightShift?: number;           // + = shift right, fraction of hip width
  shoulderElevation?: number;     // deg asymmetric elevation
  // sagittal
  trunkLean?: number;             // deg from vertical
  tibiaAngle?: number;            // deg from vertical
  trunkTibiaDelta?: number;       // |trunk − tibia| (should be ~parallel)
  pelvisTilt?: number;            // anterior +, deg (proxy)
  lumbarExt?: number;             // + arch (extension), − rounding, vs calibration
  thoracicKyphosis?: number;      // curve proxy
  armsForward?: number;           // deg arm falls from trunk-line overhead
  forwardHead?: number;           // normalized ear-forward offset vs calibration
  ankleDorsiflexion?: number;     // deg at squat depth
  femurAngle?: number;            // deg from horizontal (0 = parallel = depth)
  heelRise?: number;              // heel lift, fraction of tibia length
  comX?: number;                  // center-of-mass x (normalized)
  depthFrac?: number;             // 0 standing → 1 at parallel
}

export type RepPhase = 'descent' | 'bottom' | 'ascent';

export interface Rep {
  index: number;
  startT: number;
  bottomT: number;
  endT: number;
  usable: boolean;
  reachedDepth: boolean;
  tempoOk: boolean;
  notes: string[];
}

// ── Compensations (internal keys mirror client_assessments where they exist) ──
export type CompensationKey =
  | 'feet_turn_out'
  | 'feet_flatten'
  | 'heel_rise'
  | 'knees_cave_in'         // valgus
  | 'knees_bow_out'         // varus
  | 'excessive_forward_lean'
  | 'low_back_arch'
  | 'low_back_rounds'
  | 'arms_fall_forward'
  | 'forward_head'
  | 'shoulder_elevation'
  | 'scapular_winging'
  | 'lateral_asymmetry'     // asymmetric weight shift
  | 'balance_deficits';

export type Severity = 'mild' | 'moderate' | 'severe';
export type Side = 'left' | 'right' | 'bilateral' | null;
export type Checkpoint = 'foot_ankle' | 'knee' | 'lphc' | 'shoulder' | 'head';

export interface Finding {
  key: CompensationKey;
  present: boolean;
  checkpoint: Checkpoint;
  severity: Severity | null;
  confidence: number;             // 0..1 ensemble confidence
  side: Side;
  metric: string;                 // human-readable measurement, e.g. "valgus 9.2°R / 5.8°L"
  value: number | null;           // primary magnitude (deg or normalized)
  repAgreement: number;           // fraction of usable reps showing it
  views: ViewName[];              // views that evidenced it
}

export interface WedgeCompare {
  performed: boolean;
  verdict: 'ankle_driven' | 'hip_spine' | 'mixed' | 'inconclusive';
  confidence: number;
  deltas: { metric: string; flat: number; wedge: number; delta: number }[];
  explanation: string;            // internal
}

export interface ChainNode {
  role: 'root' | 'compensation' | 'pain_site' | 'clean';
  checkpoint: Checkpoint;
  findings: CompensationKey[];
  priority: number;               // 1 = address first
  rationale: string;              // internal reasoning (regional interdependence)
}

export interface PainMapEntry {
  area: string;                   // e.g. 'low back', 'right knee'
  level: number;                  // 0–10
  description?: string;
  durationWeeks?: number | null;
}

export interface AnalysisResult {
  assessment: AssessmentType;
  capturedAt: string;
  repsAnalyzed: number;
  totalFrames: number;
  calibration: Calibration | null;
  findings: Finding[];
  cleanCheckpoints: Checkpoint[];
  wedge: WedgeCompare | null;
  chain: ChainNode[];
  hypothesisConfirmed: boolean | null;  // vs intake suspected root
  overallConfidence: number;
  quality: CaptureQuality;
  acuteFlag: boolean;                   // pain ≤6 weeks
  /** 1:1 auto-fill for the existing client_assessments booleans */
  assessmentFlags: Record<string, boolean>;
  redFlags: { tier: 1 | 2; trigger: string }[];
}

export interface DosePrescription {
  painLevel: number;
  smrPressurePct: number;         // % of full pressure
  stretchTensionPct: number;
  activationRomPct: number;
  holdSeconds: [number, number];  // range within 60–180s (Symmetry 1–3 min standard)
  note: string;
}

export interface ProgramBlock {
  phase: 'inhibit' | 'lengthen' | 'activate' | 'integrate';
  /** user-facing phase label — Symmetry language, never continuum jargon */
  label: string;
  exerciseName: string;
  exerciseId?: string | null;
  targets: string[];              // muscles (internal)
  sets: number;
  reps?: number | null;
  durationS?: number | null;
  tempo?: string | null;
  rationale: string;              // user-facing "why this move"
}

export type SkeletonStyle = 'xray_dials' | 'wireframe' | 'mesh' | 'capsule' | 'particle';
