// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — INTERNAL clinical knowledge base.
// Encodes the complete current corrective-exercise protocol (CES 2nd edition):
// assessment tiers, every compensation → overactive/underactive table (incl.
// varus, heel rise, asymmetric-shift side logic, push/pull, posture syndromes),
// mobility normative values, modification logic, continuum acute variables,
// regional-interdependence ordering, and the Symmetry Dose-Scaling Engine.
//
// ⚠ EVERYTHING in this file is INTERNAL. User-facing copy comes ONLY from
//   SURFACE_COPY at the bottom — Symmetry language, no framework names, no
//   condition names, no diagnostic labels.
// ─────────────────────────────────────────────────────────────────────────────

import type { Checkpoint, CompensationKey } from './types';

export interface MuscleMap {
  checkpoint: Checkpoint;
  view: 'anterior' | 'lateral' | 'posterior';
  overactive: string[];    // inhibit + lengthen (assessment-confirmed short)
  underactive: string[];   // activate
}

/** The master compensation → muscle table (current-edition solutions tables). */
export const COMPENSATION_MUSCLES: Record<CompensationKey, MuscleMap> = {
  feet_turn_out: {
    checkpoint: 'foot_ankle', view: 'anterior',
    overactive: ['soleus', 'lateral gastrocnemius', 'biceps femoris (short head)', 'TFL'],
    underactive: ['medial gastrocnemius', 'medial hamstrings', 'gracilis', 'sartorius', 'popliteus', 'gluteus medius/maximus'],
  },
  feet_flatten: {
    checkpoint: 'foot_ankle', view: 'posterior',
    overactive: ['peroneals (fibularis)', 'lateral gastrocnemius', 'biceps femoris (short head)', 'TFL'],
    underactive: ['anterior tibialis', 'posterior tibialis', 'medial gastrocnemius', 'gluteus medius', 'intrinsic foot muscles'],
  },
  heel_rise: {
    checkpoint: 'foot_ankle', view: 'posterior',
    overactive: ['soleus', 'gastrocnemius'],
    underactive: ['anterior tibialis'],
  },
  knees_cave_in: {
    checkpoint: 'knee', view: 'anterior',
    overactive: ['adductor complex', 'biceps femoris (short head)', 'TFL', 'vastus lateralis', 'lateral gastrocnemius'],
    underactive: ['gluteus medius', 'gluteus maximus', 'VMO', 'medial hamstrings', 'medial gastrocnemius'],
  },
  knees_bow_out: {
    checkpoint: 'knee', view: 'anterior',
    overactive: ['piriformis', 'biceps femoris (long head)', 'TFL', 'gluteus minimus/medius'],
    underactive: ['adductor complex', 'medial hamstrings', 'gluteus maximus'],
  },
  excessive_forward_lean: {
    checkpoint: 'lphc', view: 'lateral',
    overactive: ['soleus', 'gastrocnemius', 'hip flexor complex', 'abdominal complex'],
    underactive: ['anterior tibialis', 'gluteus maximus', 'erector spinae'],
  },
  low_back_arch: {
    checkpoint: 'lphc', view: 'lateral',
    overactive: ['hip flexor complex', 'erector spinae', 'latissimus dorsi'],
    underactive: ['gluteus maximus', 'hamstring complex', 'intrinsic core stabilizers'],
  },
  low_back_rounds: {
    checkpoint: 'lphc', view: 'lateral',
    overactive: ['hamstrings', 'adductor magnus', 'rectus abdominis', 'external obliques'],
    underactive: ['gluteus maximus', 'erector spinae', 'intrinsic core stabilizers'],
  },
  arms_fall_forward: {
    checkpoint: 'shoulder', view: 'lateral',
    overactive: ['latissimus dorsi', 'teres major', 'pectoralis major', 'pectoralis minor', 'coracobrachialis'],
    underactive: ['mid trapezius', 'lower trapezius', 'rhomboids', 'rotator cuff', 'posterior deltoid'],
  },
  forward_head: {
    checkpoint: 'head', view: 'lateral',
    overactive: ['upper trapezius', 'sternocleidomastoid', 'levator scapulae', 'scalenes'],
    underactive: ['deep cervical flexors'],
  },
  shoulder_elevation: {
    checkpoint: 'shoulder', view: 'anterior',
    overactive: ['upper trapezius', 'sternocleidomastoid', 'levator scapulae'],
    underactive: ['mid trapezius', 'lower trapezius', 'rhomboids', 'rotator cuff'],
  },
  scapular_winging: {
    checkpoint: 'shoulder', view: 'posterior',
    overactive: ['pectoralis minor'],
    underactive: ['serratus anterior'],
  },
  lateral_asymmetry: {
    checkpoint: 'lphc', view: 'posterior',
    // side logic applied in code: SHIFT-side overactive = adductors, TFL;
    // OPPOSITE side overactive = gastroc/soleus, piriformis, biceps femoris, glute med;
    // SHIFT-side underactive = glute med; OPPOSITE underactive = adductors.
    overactive: ['adductor complex (shift side)', 'TFL (shift side)', 'gastrocnemius/soleus (opposite)', 'piriformis (opposite)', 'biceps femoris (opposite)'],
    underactive: ['gluteus medius (shift side)', 'adductor complex (opposite)'],
  },
  balance_deficits: {
    checkpoint: 'lphc', view: 'anterior',
    overactive: [],
    underactive: ['gluteus medius', 'ankle stabilizers', 'intrinsic core stabilizers'],
  },
};

/** Loaded push/pull assessment compensation table (current edition). */
export const PUSH_PULL_MAP = {
  push: [
    { compensation: 'shoulder_elevation', overactive: ['upper trapezius'], underactive: ['lower trapezius'] },
    { compensation: 'forward_head', overactive: ['sternocleidomastoid'], underactive: ['deep cervical flexors'] },
    { compensation: 'low_back_arch', overactive: ['erector spinae'], underactive: ['intrinsic core stabilizers'] },
  ],
  pull: [
    { compensation: 'low_back_arch', overactive: ['hip flexors', 'erector spinae'], underactive: ['intrinsic core stabilizers'] },
    { compensation: 'shoulder_elevation', overactive: ['upper trapezius', 'SCM', 'levator scapulae'], underactive: ['mid/lower trapezius'] },
    { compensation: 'forward_head', overactive: ['upper trapezius', 'SCM', 'levator scapulae'], underactive: ['deep cervical flexors'] },
    { compensation: 'scapular_winging', overactive: ['pectoralis minor'], underactive: ['serratus anterior'] },
  ],
} as const;

/** Static-posture distortion syndromes (internal names only — never surfaced). */
export const POSTURE_SYNDROMES = {
  lower_crossed: {
    signs: ['anterior pelvic tilt', 'increased lumbar extension'],
    overactive: ['hip flexor complex', 'rectus femoris', 'erector spinae', 'latissimus dorsi'],
    underactive: ['gluteus maximus', 'gluteus medius', 'hamstrings', 'intrinsic core stabilizers'],
  },
  upper_crossed: {
    signs: ['forward head', 'rounded shoulders', 'increased thoracic kyphosis'],
    overactive: ['SCM', 'levator scapulae', 'upper trapezius', 'pectoralis major/minor', 'scalenes'],
    underactive: ['deep cervical flexors', 'mid/lower trapezius', 'rhomboids', 'serratus anterior'],
  },
  pes_planus_chain: {
    signs: ['foot pronation', 'tibial internal rotation', 'knee valgus'],
    overactive: ['peroneals', 'lateral gastrocnemius', 'biceps femoris (short head)', 'TFL', 'adductors'],
    underactive: ['anterior/posterior tibialis', 'medial gastrocnemius', 'gluteus medius/maximus', 'intrinsic foot muscles'],
  },
} as const;

// ── Mobility / ROM normative values (current edition, deg) ──────────────────
export const ROM_NORMS = {
  ankleDorsiflexionKneeFlexed: 30,     // knee-to-wall — limited → soleus
  ankleDorsiflexionKneeExtended: 30,   // limited → gastrocnemius
  activeKneeExtensionFromFull: 10,     // ≥10° short of full → hamstrings/gastroc
  modifiedThomasHipExtension: 10,      // <0–10° → hip flexor complex
  modifiedThomasKneeFlexion: 90,       // <90° → rectus femoris
  hipInternalRotation: 42,             // 40–45
  hipExternalRotation: 47,             // 45–50
  shoulderFlexion: 165,                // 150–180 — limited → lats/teres major/pec
  thoracicRotationPerSide: 35,
} as const;

// ── Detection thresholds (starting values; calibration-scaled; tune with data)
export const THRESHOLDS = {
  kneeValgusMildDeg: 5,           // frontal-plane projection deviation
  kneeValgusModerateDeg: 8,
  kneeValgusSevereDeg: 13,
  kneeVarusDeg: 6,
  footTurnoutDeg: 13,             // 12–15 flag
  trunkLeanFlagDeg: 45,           // AND not parallel to tibia
  trunkTibiaParallelTolDeg: 10,
  pelvisTiltArchDeltaDeg: 6,      // vs standing baseline → low_back_arch
  pelvisTiltRoundDeltaDeg: -6,    // posterior shift → low_back_rounds
  armsForwardDeg: 22,             // 20–30 flag
  forwardHeadFrac: 0.06,          // ear-forward offset / torso length vs baseline
  shoulderElevationDeg: 5,
  asymShiftFrac: 0.08,            // weight-shift fraction of hip width
  pelvisObliquityDeg: 4,
  heelRiseFrac: 0.035,            // of tibia length
  ankleDorsiflexionLowDeg: 25,    // <25 at depth = restricted (norm 30)
  depthFemurTolDeg: 8,            // within 8° of parallel = depth reached
  repMinDepthFrac: 0.75,
  minKeypointScore: 0.35,
  wedgeCleanupPct: 0.4,           // ≥40% improvement with wedge → ankle-driven
} as const;

// ── Continuum acute variables (current edition) — internal engine constants ──
export const CONTINUUM_ACUTE = {
  inhibit: { setsPerMuscle: 1, holdTenderS: [30, 120], perMuscleS: [90, 120], freq: 'daily' },
  // Symmetry override: static holds 1–3 min (start 1 min), NOT book 20–30s.
  lengthen: { holdS: [60, 180], reps: [1, 4], freq: 'daily', symmetryOverride: true },
  activate: { sets: [1, 2], reps: [10, 15], tempo: '4/2/1', freqPerWeek: [3, 5] },
  integrate: { sets: [1, 3], reps: [10, 15], tempo: 'slow/controlled', freqPerWeek: [3, 5] },
  reassessWeeks: [4, 6],
} as const;

/** SMR / static-stretch contraindications → engine must flag, never prescribe. */
export const CONTRAINDICATIONS = {
  smr: ['osteoporosis', 'DVT', 'blood clot', 'fracture', 'bleeding disorder', 'cancer', 'malignancy', 'recent surgery', 'acute injury'],
  smrCaution: ['hypertension', 'diabetes', 'osteopenia', 'pregnancy', 'varicose veins', 'fibromyalgia'],
  stretch: ['acute injury', 'recent surgery', 'acute rheumatoid arthritis', 'osteoporosis'],
} as const;

// ── Regional interdependence: ground-up checkpoint order ─────────────────────
export const CHECKPOINT_ORDER: Checkpoint[] = ['foot_ankle', 'knee', 'lphc', 'shoulder', 'head'];

/** Intake pattern library (Pillar 1) — description → suspected root. */
export const PAIN_PATTERNS: { match: RegExp; area: string; suspectedRoot: Checkpoint; internalNote: string }[] = [
  { match: /back.*(goes out|out of nowhere|barely|spasm)|(goes out).*back/i, area: 'low back', suspectedRoot: 'lphc', internalNote: 'short/overactive hip flexors & quads chronically straining lumbar; check ankle root below' },
  { match: /shoulder|reach(ing)? overhead|down my arm/i, area: 'shoulder', suspectedRoot: 'shoulder', internalNote: 'short pecs/lats (desk pattern); confirm thoracic contribution' },
  { match: /can'?t squat|knees? hurt|hips? (feel )?tight/i, area: 'knees/hips', suspectedRoot: 'foot_ankle', internalNote: 'layered: ankle ROM restriction → hip compensation → pelvic tilt' },
  { match: /sciatic|hamstring/i, area: 'hamstring/sciatic', suspectedRoot: 'lphc', internalNote: 'often hip impingement/piriformis, felt in hamstring — deceptive presentation' },
  { match: /elbow/i, area: 'elbow', suspectedRoot: 'shoulder', internalNote: 'deceptive: often referred from teres minor' },
];

// ── Red flags (two-tier; flag + recommend, NEVER lock) ───────────────────────
export const RED_FLAGS = {
  tier1: [
    { match: /bladder|bowel|incontinen/i, trigger: 'loss of bladder/bowel control' },
    { match: /groin numb|saddle|inner thigh.*numb/i, trigger: 'saddle-area numbness' },
    { match: /sudden.*(numb|weak)|(numb|weak).*spread/i, trigger: 'sudden/spreading numbness or weakness' },
    { match: /chest pain|short(ness)? of breath|faint|dizzy/i, trigger: 'chest pain / breathing / fainting with activity' },
    { match: /fall|accident|trauma|car wreck|crash/i, trigger: 'pain after significant trauma' },
    { match: /unrelenting|nothing (helps|eases)|constant severe/i, trigger: 'severe unrelenting pain' },
  ],
  tier2: [
    { match: /numb|tingl/i, trigger: 'numbness/tingling' },
    { match: /radiat|shoot(s|ing)? down/i, trigger: 'radiating pain' },
    { match: /wakes me|worse at rest|at night/i, trigger: 'night pain / worse at rest' },
    { match: /weight loss/i, trigger: 'unexplained weight loss with pain' },
    { match: /fever/i, trigger: 'fever with pain' },
    { match: /swollen|red|hot joint/i, trigger: 'swollen/hot joint' },
    { match: /locks|gives way|unstable/i, trigger: 'joint locking / instability' },
    { match: /cancer|osteoporosis/i, trigger: 'history of cancer/osteoporosis with new pain' },
  ],
} as const;

// ── Existing program routing (mirrors assessment-recommend/route.ts) ─────────
export const PROGRAM_ROUTING: { keys: CompensationKey[]; program: string }[] = [
  { keys: ['low_back_arch'], program: 'APT Correction Program' },
  { keys: ['arms_fall_forward', 'forward_head', 'shoulder_elevation', 'scapular_winging'], program: 'Scapular Precision Program' },
  { keys: ['knees_cave_in', 'knees_bow_out'], program: 'Knee Stability & Strength Program' },
  { keys: ['feet_turn_out', 'excessive_forward_lean', 'heel_rise', 'feet_flatten'], program: 'Foundation + Ankle & Posterior Chain' },
  { keys: ['lateral_asymmetry'], program: 'Asymmetrical Weight Shift & Lumbar Decompression' },
  { keys: ['balance_deficits'], program: 'Neurological Rehab & Balance Program' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SURFACE_COPY — the ONLY approved user-facing vocabulary.
// Symmetry method language. No framework names. No condition names.
// No "diagnosis", "abnormal", "dysfunction", "syndrome" in client copy.
// ─────────────────────────────────────────────────────────────────────────────
export const SURFACE_COPY: Record<CompensationKey, { label: string; plain: string }> = {
  feet_turn_out: { label: 'Feet turn out', plain: 'Your feet angle outward as you squat — usually the ankles asking for help.' },
  feet_flatten: { label: 'Arches drop', plain: 'Your arches roll in and flatten under load.' },
  heel_rise: { label: 'Heels lift', plain: 'Your heels want to leave the floor — the ankles are running out of motion.' },
  knees_cave_in: { label: 'Knees drift in', plain: 'Your knees drift toward each other instead of tracking over your toes.' },
  knees_bow_out: { label: 'Knees push out', plain: 'Your knees push outside your toe line as you descend.' },
  excessive_forward_lean: { label: 'Torso tips forward', plain: 'Your torso leans further forward than your shins — you’re balancing, not squatting.' },
  low_back_arch: { label: 'Lower back over-arches', plain: 'Your pelvis tips forward and your lower back over-arches to keep you upright.' },
  low_back_rounds: { label: 'Lower back rounds', plain: 'Your lower back rounds under at the bottom of the movement.' },
  arms_fall_forward: { label: 'Arms drift forward', plain: 'Your arms can’t stay overhead — the back of your shoulders and mid-back give up the position.' },
  forward_head: { label: 'Head drifts forward', plain: 'Your head sits ahead of your shoulders instead of stacked over them.' },
  shoulder_elevation: { label: 'Shoulders creep up', plain: 'Your shoulders shrug toward your ears under load.' },
  scapular_winging: { label: 'Shoulder blade lifts off', plain: 'One shoulder blade tips off your ribcage instead of gliding flat.' },
  lateral_asymmetry: { label: 'Weight shifts to one side', plain: 'You quietly load one leg more than the other.' },
  balance_deficits: { label: 'Balance wobbles', plain: 'Single-leg control isn’t where it should be yet.' },
};

export const SURFACE_PHASE_LABELS = {
  inhibit: 'Release',
  lengthen: 'Lengthen',
  activate: 'Wake up',
  integrate: 'Re-pattern',
} as const;

export const CHECKPOINT_LABELS: Record<Checkpoint, string> = {
  foot_ankle: 'Ankles & feet',
  knee: 'Knees',
  lphc: 'Hips & lower back',
  shoulder: 'Shoulders & mid-back',
  head: 'Head & neck',
};

/** Words banned from any user-facing string this engine emits. */
export const BANNED_USER_TERMS = [
  'NASM', 'CES', 'OHSA', 'diagnosis', 'diagnose', 'abnormal', 'pathological',
  'syndrome', 'lower crossed', 'upper crossed', 'pes planus', 'Janda',
  'Trendelenburg', 'dysfunction', 'valgus', 'varus', 'kyphosis', 'lordosis',
  'anterior pelvic tilt', 'treatment', 'therapy', 'rehab',
];

export function violatesSurfaceLanguage(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_USER_TERMS.filter((t) => lower.includes(t.toLowerCase()));
}
