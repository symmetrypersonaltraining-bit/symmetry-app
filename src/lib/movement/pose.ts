// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — pose-detection client wrapper (browser only).
// MoveNet (default) via TF.js; BlazePose optional for feet/heels + rough 3D.
// Normalizes to the engine's Keypoint[] naming. Runs on-device; no upload.
// ─────────────────────────────────────────────────────────────────────────────

import type { Keypoint } from './types';

export type PoseModel = 'movenet' | 'blazepose';

// COCO-17 (MoveNet) already uses the names the engine expects. BlazePose uses
// its own set incl. heel/foot_index which the engine prefers — pass through.
const MOVENET_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
];

export interface PoseDetectorHandle {
  estimate: (video: HTMLVideoElement) => Promise<Keypoint[]>;
  dispose: () => void;
  model: PoseModel;
}

/**
 * Lazily import TF.js + pose-detection and create a detector.
 * Kept dynamic so the heavy libs only load on the capture screen.
 */
export async function createDetector(preferred: PoseModel = 'movenet'): Promise<PoseDetectorHandle> {
  const tf = await import('@tensorflow/tfjs');
  await tf.ready();
  const poseDetection = await import('@tensorflow-models/pose-detection');

  if (preferred === 'blazepose') {
    const detector = await poseDetection.createDetector(poseDetection.SupportedModels.BlazePose, {
      runtime: 'tfjs',
      modelType: 'full',
    } as unknown as Parameters<typeof poseDetection.createDetector>[1]);
    return {
      model: 'blazepose',
      dispose: () => detector.dispose(),
      estimate: async (video) => {
        const poses = await detector.estimatePoses(video, { flipHorizontal: false });
        return normalize(poses?.[0]?.keypoints ?? [], video, true);
      },
    };
  }

  const detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER, // accuracy over speed
  });
  return {
    model: 'movenet',
    dispose: () => detector.dispose(),
    estimate: async (video) => {
      const poses = await detector.estimatePoses(video, { flipHorizontal: false });
      return normalize(poses?.[0]?.keypoints ?? [], video, false);
    },
  };
}

interface RawKp { x: number; y: number; z?: number; score?: number; name?: string }

function normalize(raw: RawKp[], video: HTMLVideoElement, blaze: boolean): Keypoint[] {
  const w = video.videoWidth || 1;
  const h = video.videoHeight || 1;
  return raw.map((k, i) => ({
    name: k.name ?? (blaze ? `kp_${i}` : MOVENET_NAMES[i] ?? `kp_${i}`),
    x: k.x / w,             // normalize to 0..1
    y: k.y / h,
    z: k.z,
    score: k.score ?? 0,
  }));
}

/** Estimate camera distance (ft) from the subject's pixel height vs frame. */
export function estimateDistanceFt(keypoints: Keypoint[]): number {
  const ys = keypoints.filter((k) => k.score > 0.3).map((k) => k.y);
  if (ys.length < 4) return 0;
  const span = Math.max(...ys) - Math.min(...ys); // 0..1 of frame height
  // Calibrated heuristic: subject filling ~0.8 of frame ≈ 9 ft with a phone.
  if (span <= 0) return 0;
  return Math.round((9 * (0.82 / span)) * 10) / 10;
}

/** Mean visibility of the joints the engine cares about. */
export function keypointQuality(keypoints: Keypoint[]): number {
  const key = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_ankle', 'right_ankle'];
  const scores = key.map((n) => keypoints.find((k) => k.name === n)?.score ?? 0);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
