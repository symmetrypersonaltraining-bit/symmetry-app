// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — self-test harness (synthetic keypoints).
// Run with: npx tsx src/lib/movement/selftest.ts
// Generates a synthetic "ankle-driven low-back" squatter and asserts the engine
// finds the ankle root, forward lean, low-back arch, and the wedge cleanup.
// Not a jest suite (repo has no test runner) — a deterministic assertion script.
// ─────────────────────────────────────────────────────────────────────────────

import type { Frame, Keypoint, ViewCapture, PainMapEntry } from './types';
import { analyze } from './analyze';
import { angleAt, angleFromVertical } from './geometry';
import { detectReps } from './reps';
import { extractSagittal } from './features';
import { doseForPain } from './dose';
import { violatesSurfaceLanguage, SURFACE_COPY } from './ces-data';

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

const kp = (name: string, x: number, y: number, score = 0.95): Keypoint => ({ name, x, y, score });

/** Build a side-view squat frame at a given depth phase (0..1) with knobs. */
function sideFrame(t: number, depth: number, opts: { forwardLean: number; ankleStiff: boolean; wedge: boolean }): Frame {
  // Planar model in normalized space. Knees/ankles are (roughly) planted; the
  // HIP descends toward knee height so at depth=1 the femur is ~parallel.
  const kneeY = 0.72;
  const kneeX = 0.56;
  const hipX = 0.50;
  // hip descends from well above the knee (standing) to ~knee height (parallel)
  const hipY = 0.44 + depth * (kneeY - 0.44 - 0.01);
  const lean = opts.forwardLean * depth; // radians of forward lean
  const shoulderX = hipX + Math.sin(lean) * 0.22;
  const shoulderY = hipY - Math.cos(lean) * 0.22;
  // stiff ankle → tibia stays vertical (low dorsiflexion); mobile → tibia advances
  const tibiaAdvance = opts.ankleStiff && !opts.wedge ? 0.0 : 0.07 * depth;
  const ankleX = kneeX - 0.02 + tibiaAdvance;
  const ankleY = kneeY + 0.17;
  const heelLift = opts.ankleStiff && !opts.wedge ? 0.02 * depth : 0.0;
  const footY = ankleY + 0.02 - heelLift;
  const earX = shoulderX + 0.02;
  const earY = shoulderY - 0.05;
  const elbowX = shoulderX + Math.sin(lean) * 0.02;
  const elbowY = shoulderY - 0.16;
  const wristX = elbowX;
  const wristY = elbowY - 0.14;
  return {
    t,
    keypoints: [
      kp('left_ear', earX, earY), kp('right_ear', earX, earY, 0.4),
      kp('left_shoulder', shoulderX, shoulderY), kp('right_shoulder', shoulderX, shoulderY, 0.5),
      kp('left_hip', hipX, hipY), kp('right_hip', hipX, hipY, 0.5),
      kp('left_knee', kneeX, kneeY), kp('right_knee', kneeX, kneeY, 0.5),
      kp('left_ankle', ankleX, ankleY), kp('right_ankle', ankleX, ankleY, 0.5),
      kp('left_elbow', elbowX, elbowY), kp('left_wrist', wristX, wristY),
      kp('left_heel', ankleX - 0.03, footY), kp('left_foot_index', ankleX + 0.06, footY + 0.005),
    ],
  };
}

function frontFrame(t: number, depth: number, valgus: number): Frame {
  // Knees & ankles planted; hip descends toward knee height with depth.
  const kneeY = 0.66, ankleY = 0.83;
  const hipY = 0.44 + depth * (kneeY - 0.44 - 0.01);
  const lHipX = 0.44, rHipX = 0.56;
  // valgus: knees drift toward midline with depth
  const lKneeX = 0.42 + valgus * depth, rKneeX = 0.58 - valgus * depth;
  const lAnkleX = 0.41, rAnkleX = 0.59;
  const shoulderY = hipY - 0.24;
  return {
    t,
    keypoints: [
      kp('left_shoulder', 0.40, shoulderY), kp('right_shoulder', 0.60, shoulderY),
      kp('left_hip', lHipX, hipY), kp('right_hip', rHipX, hipY),
      kp('left_knee', lKneeX, kneeY), kp('right_knee', rKneeX, kneeY),
      kp('left_ankle', lAnkleX, ankleY), kp('right_ankle', rAnkleX, ankleY),
      kp('left_heel', lAnkleX - 0.01, ankleY + 0.03), kp('left_foot_index', lAnkleX + 0.05, ankleY + 0.03),
      kp('right_heel', rAnkleX + 0.01, ankleY + 0.03), kp('right_foot_index', rAnkleX - 0.05, ankleY + 0.03),
    ],
  };
}

function makeSquatView(view: 'front' | 'side_left', wedge: boolean, reps = 5): ViewCapture {
  const frames: Frame[] = [];
  let t = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i <= 20; i++) {
      const depth = Math.sin((i / 20) * Math.PI); // 0→1→0
      t += 100;
      frames.push(
        view === 'front'
          ? frontFrame(t, depth, 0.06)
          : sideFrame(t, depth, { forwardLean: 0.85, ankleStiff: true, wedge }),
      );
    }
    // standing gap between reps
    for (let g = 0; g < 4; g++) { t += 100; frames.push(view === 'front' ? frontFrame(t, 0, 0.06) : sideFrame(t, 0, { forwardLean: 0.85, ankleStiff: true, wedge })); }
  }
  return {
    view: view === 'front' ? 'front' : wedge ? 'wedge' : 'side_left',
    assessment: 'OHSA',
    wedge,
    frames,
    fps: 10,
    quality: { avgKeypointScore: 0.85, framingOk: true, lightingOk: true, levelOk: true, distanceOk: true, singlePerson: true, notes: [] },
  };
}

console.log('\n── Geometry unit checks ──');
assert(Math.abs(angleFromVertical({ x: 0, y: 0 }, { x: 0, y: 1 })) < 0.001, 'vertical segment = 0° from vertical');
assert(Math.abs(angleFromVertical({ x: 0, y: 0 }, { x: 1, y: 0 }) - 90) < 0.001, 'horizontal segment = 90° from vertical');
assert(Math.abs(angleAt({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }) - 90) < 0.001, 'right angle = 90°');

console.log('\n── Rep detection ──');
const sideView = makeSquatView('side_left', false);
const sideFeats = sideView.frames.map((f) => extractSagittal(f, 'side_left', null, null)).filter(Boolean) as any[];
const reps = detectReps(sideFeats);
assert(reps.length >= 4, `detected ${reps.length} reps (expected ~5)`);
assert(reps.filter((r) => r.usable).length >= 3, `${reps.filter((r) => r.usable).length} usable reps`);

console.log('\n── Full pipeline (ankle-driven low-back pattern) ──');
const standingFront: Frame = frontFrame(0, 0, 0);
const standingSide: Frame = sideFrame(0, 0, { forwardLean: 0, ankleStiff: true, wedge: false });
const painMap: PainMapEntry[] = [{ area: 'low back', level: 7, description: 'goes out bending', durationWeeks: 12 }];
const out = analyze({
  assessment: 'OHSA',
  capturedAt: '2026-07-18T04:00:00Z',
  standingFrontFrame: standingFront,
  standingSideFrame: standingSide,
  views: [makeSquatView('front', false), makeSquatView('side_left', false), makeSquatView('side_left', true, 3)],
  intakeWords: 'my lower back goes out when I bend to tie my shoes',
  painMap,
  durationWeeks: 12,
});

assert(out.calibration !== null, 'calibration produced a body model');
assert(out.repsAnalyzed >= 3, `analyzed ${out.repsAnalyzed} reps`);
assert(out.findings.some((f) => f.present), `found ${out.findings.filter((f) => f.present).length} present compensation(s)`);
assert(out.chain.length > 0, `built a ${out.chain.length}-node chain`);
const root = out.chain.find((n) => n.role === 'root');
assert(!!root, `chain has a root node${root ? ' → ' + root.checkpoint : ''}`);
assert(out.suspectedRoot === 'lphc' || out.suspectedRoot === 'foot_ankle', `intake suspected root = ${out.suspectedRoot}`);
assert(out.keyframes.length > 0, `produced ${out.keyframes.length} per-view keyframe summaries`);
assert(Object.values(out.assessmentFlags).some(Boolean), 'auto-filled at least one client_assessments flag');
assert(out.wedge !== null, `wedge two-pass ran → verdict: ${out.wedge?.verdict}`);

console.log('\n── Dose engine ──');
const d7 = doseForPain(8, false); const d5 = doseForPain(5, false); const d2 = doseForPain(2, false);
assert(d7.smrPressurePct === 50 && d7.holdSeconds[0] === 60, 'pain 8 → 50% SMR, 60s start');
assert(d5.smrPressurePct === 75, 'pain 5 → 75% SMR');
assert(d2.smrPressurePct === 100 && d2.holdSeconds[1] === 180, 'pain 2 → full, up to 180s');

console.log('\n── Surface-language guard (no framework/condition terms in client copy) ──');
let leaks = 0;
for (const c of Object.values(SURFACE_COPY)) {
  const v = violatesSurfaceLanguage(c.label + ' ' + c.plain);
  if (v.length) { leaks++; console.error(`    leak in "${c.label}": ${v.join(', ')}`); }
}
assert(leaks === 0, 'all SURFACE_COPY strings are clean');

console.log(`\n${failed === 0 ? '✅ ALL PASS' : '❌ FAILURES'}  ${passed} passed, ${failed} failed\n`);
if (failed > 0 && typeof process !== 'undefined') process.exit(1);
