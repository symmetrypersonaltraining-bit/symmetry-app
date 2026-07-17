// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — per-frame kinematic feature extraction.
// Works with MoveNet (17 kp) and BlazePose (33 kp incl. heels/feet — preferred).
// Every feature maps to a checkpoint compensation in ces-data.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { Calibration, Frame, FrameFeatures, Keypoint, ViewName } from './types';
import { angleAt, angleFromHorizontal, angleFromVertical, comX, dist, kp, mid, signedAngleFromVertical, type Pt } from './geometry';

const need = (...ks: (Keypoint | null)[]) => ks.every((k) => k && k.score > 0.3);
const pt = (k: Keypoint): Pt => ({ x: k.x, y: k.y });

/** Calibration from a still standing frame (front view, T-pose or neutral). */
export function calibrateFromStanding(frame: Frame): Calibration | null {
  const ks = frame.keypoints;
  const ls = kp(ks, 'left_shoulder'); const rs = kp(ks, 'right_shoulder');
  const lh = kp(ks, 'left_hip'); const rh = kp(ks, 'right_hip');
  const lk = kp(ks, 'left_knee'); const rk = kp(ks, 'right_knee');
  const la = kp(ks, 'left_ankle'); const ra = kp(ks, 'right_ankle');
  const le = kp(ks, 'left_ear'); const re = kp(ks, 'right_ear');
  if (!need(ls, rs, lh, rh, lk, rk, la, ra)) return null;
  const shoulderMid = mid(pt(ls!), pt(rs!));
  const hipMid = mid(pt(lh!), pt(rh!));
  const torsoLen = dist(shoulderMid, hipMid);
  const femurLen = (dist(pt(lh!), pt(lk!)) + dist(pt(rh!), pt(rk!))) / 2;
  const tibiaLen = (dist(pt(lk!), pt(la!)) + dist(pt(rk!), pt(ra!))) / 2;
  const earMid = need(le, re) ? mid(pt(le!), pt(re!)) : null;
  return {
    torsoLen,
    femurLen,
    tibiaLen,
    shoulderWidth: dist(pt(ls!), pt(rs!)),
    hipWidth: dist(pt(lh!), pt(rh!)),
    standingPelvisTilt: 0, // sagittal baseline captured on side calibration pass
    standingTrunkAngle: angleFromVertical(hipMid, shoulderMid),
    standingShoulderDelta: signedAngleFromVertical(pt(ls!), pt(rs!)) - 90 > 0 ? 0 : Math.abs(angleFromHorizontal(pt(ls!), pt(rs!))),
    standingForwardHead: earMid && torsoLen > 0 ? Math.abs(earMid.x - shoulderMid.x) / torsoLen : 0,
  };
}

/** Sagittal baseline (side standing): pelvis tilt proxy + forward head. */
export function calibrateSagittal(frame: Frame, cal: Calibration): Calibration {
  const f = extractSagittal(frame, 'side_left', cal, null);
  return {
    ...cal,
    standingPelvisTilt: f?.pelvisTilt ?? 0,
    standingForwardHead: f?.forwardHead ?? cal.standingForwardHead,
  };
}

/** FRONT view features (frontal plane). */
export function extractFrontal(frame: Frame, cal: Calibration | null): FrameFeatures | null {
  const ks = frame.keypoints;
  const lh = kp(ks, 'left_hip'); const rh = kp(ks, 'right_hip');
  const lk = kp(ks, 'left_knee'); const rk = kp(ks, 'right_knee');
  const la = kp(ks, 'left_ankle'); const ra = kp(ks, 'right_ankle');
  const ls = kp(ks, 'left_shoulder'); const rs = kp(ks, 'right_shoulder');
  if (!need(lh, rh, lk, rk, la, ra, ls, rs)) return null;

  const hipMid = mid(pt(lh!), pt(rh!));
  const shoulderMid = mid(pt(ls!), pt(rs!));
  const midlineX = hipMid.x;

  // Knee frontal deviation (valgus +) — screen left/right resolved by x position:
  // the subject faces the camera, so their LEFT leg appears on screen RIGHT.
  const leftIsScreenRight = pt(la!).x > pt(ra!).x;
  const devL = kneeDev(pt(lh!), pt(lk!), pt(la!), leftIsScreenRight ? 'right' : 'left', midlineX);
  const devR = kneeDev(pt(rh!), pt(rk!), pt(ra!), leftIsScreenRight ? 'left' : 'right', midlineX);

  // Foot turnout (needs foot_index — BlazePose; fallback null on MoveNet)
  const lfi = kp(ks, 'left_foot_index'); const rfi = kp(ks, 'right_foot_index');
  const lheel = kp(ks, 'left_heel'); const rheel = kp(ks, 'right_heel');
  let footTurnoutL: number | undefined;
  let footTurnoutR: number | undefined;
  if (need(lfi, lheel)) footTurnoutL = Math.abs(90 - angleFromHorizontal(pt(lheel!), pt(lfi!)));
  if (need(rfi, rheel)) footTurnoutR = Math.abs(90 - angleFromHorizontal(pt(rheel!), pt(rfi!)));

  // Pelvis frontal obliquity (+ = right hip lower)
  const pelvisObliquity = signedFrontalTilt(pt(lh!), pt(rh!));
  const shoulderElevation = Math.abs(signedFrontalTilt(pt(ls!), pt(rs!)));

  // Weight shift: COM x vs ankle midpoint, fraction of hip width
  const ankleMid = mid(pt(la!), pt(ra!));
  const cX = comX({
    trunk: mid(shoulderMid, hipMid),
    thighL: mid(pt(lh!), pt(lk!)),
    thighR: mid(pt(rh!), pt(rk!)),
    shankL: mid(pt(lk!), pt(la!)),
    shankR: mid(pt(rk!), pt(ra!)),
    armL: pt(ls!),
    armR: pt(rs!),
  });
  const hipW = cal?.hipWidth || dist(pt(lh!), pt(rh!)) || 1e-9;
  const weightShift = (cX - ankleMid.x) / hipW;

  const depthFrac = depthFraction(hipMid.y, pt(lk!).y, pt(rk!).y, cal);

  return {
    t: frame.t,
    view: 'front',
    kneeValgusL: devL,
    kneeValgusR: devR,
    footTurnoutL,
    footTurnoutR,
    pelvisObliquity,
    shoulderElevation,
    weightShift,
    comX: cX,
    depthFrac,
  };
}

/** SIDE view features (sagittal plane). Works for either profile direction. */
export function extractSagittal(frame: Frame, view: ViewName, cal: Calibration | null, wedgeHeelY: number | null): FrameFeatures | null {
  const ks = frame.keypoints;
  // Use the camera-side landmarks (higher score side)
  const side = pickProfileSide(ks);
  const S = (n: string) => kp(ks, `${side}_${n}`);
  const shoulder = S('shoulder'); const hip = S('hip'); const knee = S('knee'); const ankle = S('ankle');
  const ear = S('ear'); const elbow = S('elbow'); const wrist = S('wrist');
  if (!need(shoulder, hip, knee, ankle)) return null;

  const trunkLean = angleFromVertical(pt(hip!), pt(shoulder!));
  const tibiaAngle = angleFromVertical(pt(knee!), pt(ankle!));
  const trunkTibiaDelta = Math.abs(trunkLean - tibiaAngle);

  // Femur vs horizontal → depth
  const femurAngle = angleFromHorizontal(pt(hip!), pt(knee!));

  // Ankle dorsiflexion: shank vs foot. With BlazePose feet use heel/foot_index;
  // fallback: shank angle from vertical at depth approximates DF demand.
  const heel = S('heel'); const foot = S('foot_index');
  let ankleDorsiflexion: number | undefined;
  if (need(heel, foot)) {
    ankleDorsiflexion = 90 - angleAt(pt(knee!), pt(ankle!), pt(foot!)) + 90 - 90; // shank–foot interior minus neutral
    ankleDorsiflexion = Math.max(0, 90 - angleAt(pt(knee!), pt(ankle!), pt(foot!)) + 0) + tibiaAngle * 0.35;
    // Robust proxy: tibia advance angle + foot line correction
    ankleDorsiflexion = Math.round((tibiaAngle + Math.max(0, 12 - angleFromHorizontal(pt(heel!), pt(foot!)))) * 10) / 10;
  } else {
    ankleDorsiflexion = tibiaAngle; // MoveNet fallback: tibia advance ≈ DF at depth
  }

  // Heel rise (BlazePose only): heel y above foot_index baseline
  let heelRise: number | undefined;
  if (need(heel, foot) && cal?.tibiaLen) {
    const base = wedgeHeelY ?? pt(foot!).y;
    heelRise = Math.max(0, (base - pt(heel!).y) / cal.tibiaLen);
  }

  // Pelvis tilt proxy (sagittal): torso-femur hinge sharing.
  // APT proxy = trunk lean beyond what hip flexion accounts for, expressed at pelvis.
  const hipFlex = angleAt(pt(shoulder!), pt(hip!), pt(knee!)); // interior hip angle
  const pelvisTilt = Math.max(0, 180 - hipFlex - femurAngle) * 0.35 + trunkLean * 0.25;

  const baseTilt = cal?.standingPelvisTilt ?? 0;
  const lumbarExt = pelvisTilt - baseTilt; // + = arch vs baseline, − = rounding

  // Arms fall forward: upper arm vs trunk line (overhead should align)
  let armsForward: number | undefined;
  if (need(elbow, wrist)) {
    const trunkAng = signedAngleFromVertical(pt(hip!), pt(shoulder!));
    const armAng = signedAngleFromVertical(pt(shoulder!), pt(elbow!));
    armsForward = Math.abs(armAng - trunkAng);
  }

  // Forward head: ear forward of shoulder along movement axis / torso length
  let forwardHead: number | undefined;
  if (need(ear) && cal?.torsoLen) {
    forwardHead = Math.abs(pt(ear!).x - pt(shoulder!).x) / cal.torsoLen - (cal.standingForwardHead || 0);
  }

  // Depth from femur angle vs horizontal, mapped LINEARLY (0 = shank/femur
  // vertical/standing, 1 = femur parallel to floor). A sinusoidal mapping is
  // far too peaked and hides all but the deepest frame, so rep detection misses.
  const depthFrac = Math.min(1.1, Math.max(0, 1 - femurAngle / 90));

  return {
    t: frame.t,
    view,
    trunkLean,
    tibiaAngle,
    trunkTibiaDelta,
    femurAngle,
    ankleDorsiflexion,
    heelRise,
    pelvisTilt,
    lumbarExt,
    armsForward,
    forwardHead,
    depthFrac,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function kneeDev(hip: Pt, knee: Pt, ankle: Pt, side: 'left' | 'right', midlineX: number): number {
  // Deviation angle of knee from the hip–ankle line; + toward midline (valgus)
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y || 1e-9;
  const t = (knee.y - hip.y) / dy;
  const lineX = hip.x + dx * t;
  const legLen = (dist(hip, knee) + dist(knee, ankle)) / 2 || 1e-9;
  const off = knee.x - lineX;
  const angle = (Math.atan2(Math.abs(off), legLen) * 180) / Math.PI;
  const medial = side === 'left' ? off < 0 : off > 0; // screen-left leg: medial = toward +x? resolved by caller mapping
  // Caller passes side as the SCREEN side of that leg; medial = toward midline:
  const towardMid = (lineX < midlineX && off > 0) || (lineX > midlineX && off < 0);
  return towardMid ? angle : -angle;
}

function signedFrontalTilt(l: Pt, r: Pt): number {
  const dx = r.x - l.x || 1e-9;
  return (Math.atan2(r.y - l.y, Math.abs(dx)) * 180) / Math.PI; // + = right lower
}

function depthFraction(hipY: number, lkY: number, rkY: number, cal: Calibration | null): number {
  const kneeY = (lkY + rkY) / 2;
  if (!cal?.femurLen) return 0;
  // standing: hip ≈ kneeY − femurLen; parallel: hipY ≈ kneeY
  return Math.min(1.15, Math.max(0, 1 - (kneeY - hipY) / cal.femurLen));
}

function pickProfileSide(ks: Keypoint[]): 'left' | 'right' {
  const score = (side: string) =>
    ['shoulder', 'hip', 'knee', 'ankle'].reduce((s, j) => s + (kp(ks, `${side}_${j}`)?.score ?? 0), 0);
  return score('left') >= score('right') ? 'left' : 'right';
}
