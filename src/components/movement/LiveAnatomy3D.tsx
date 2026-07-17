'use client';

// ─────────────────────────────────────────────────────────────────────────────
// LiveAnatomy3D — the translucent 3D anatomy VISUAL shell, posed by the live
// tracked joints (2.5D: limb segments orient to the on-screen joint vectors, so
// the body mirrors the client in the camera plane — exactly what a single phone
// camera gives). Mounts in AnatomyRigSlot. OPT-IN + off by default; loads Three
// dynamically so it never affects the base capture bundle.
//
// This procedural translucent body is the STAND-IN. When the rigged Z-Anatomy
// GLB is dropped in, we load it here and drive its armature from the same joints
// — the shell/materials/rig/coloring stay identical.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import type * as ThreeNS from 'three'; // types only — erased at build, no bundle cost
import type { Keypoint } from '@/lib/movement/types';

interface Props {
  keypoints: Keypoint[];
  width: number;
  height: number;
  /** muscle flags from the engine: e.g. { calf:'bad', quad:'warn' } */
  muscleFlags?: Record<string, 'ok' | 'warn' | 'bad'>;
}

export default function LiveAnatomy3D({ keypoints, width, height, muscleFlags }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const kpRef = useRef<Keypoint[]>(keypoints);
  const flagsRef = useRef(muscleFlags);
  kpRef.current = keypoints;
  flagsRef.current = muscleFlags;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      if (disposed || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 6);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      mountRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x2a3a66, 0.7));
      const key = new THREE.DirectionalLight(0x8fd8ff, 1.0); key.position.set(3, 5, 4); scene.add(key);
      const rimL = new THREE.PointLight(0x38e1ff, 1.2, 30); rimL.position.set(-4, 2, 2); scene.add(rimL);
      const rimR = new THREE.PointLight(0x8b7bff, 1.0, 30); rimR.position.set(4, 1, 2); scene.add(rimR);

      const flesh = new THREE.MeshPhysicalMaterial({ color: 0x2f6fb0, transparent: true, opacity: 0.24, roughness: 0.35, transmission: 0.5, thickness: 0.5, emissive: 0x0a2f4a, emissiveIntensity: 0.5, side: THREE.DoubleSide });
      const bone = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.5, emissive: 0x244a6a, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
      const muscleMat = (lvl?: 'ok' | 'warn' | 'bad') => new THREE.MeshPhysicalMaterial({
        color: lvl === 'bad' ? 0xef475f : lvl === 'warn' ? 0xf4952e : 0x22c9a4,
        transparent: true, opacity: lvl === 'bad' ? 0.4 : 0.3, transmission: 0.4, roughness: 0.4,
        emissive: lvl === 'bad' ? 0x6a1020 : lvl === 'warn' ? 0x6a3a08 : 0x0e5a4a, emissiveIntensity: 0.6,
      });

      // A limb rendered as a group we position+orient between two screen joints.
      function limb(fleshR: number, muscle?: 'ok' | 'warn' | 'bad') {
        const g = new THREE.Group();
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(fleshR, 1, 5, 12), flesh);
        f.position.y = -0.5; g.add(f);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(fleshR * 0.4, fleshR * 0.42, 1, 8), bone);
        b.position.y = -0.5; g.add(b);
        if (muscle) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(fleshR * 0.8, 0.85, 4, 10), muscleMat(muscle)); m.position.set(0, -0.5, fleshR * 0.2); g.add(m); }
        g.userData.mesh = f; g.userData.boneMesh = b;
        return g;
      }

      const parts = {
        torso: limb(0.34),
        head: (() => { const g = new THREE.Group(); const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), flesh); g.add(h); const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), bone); g.add(s); return g; })(),
        upperArmL: limb(0.09, 'warn'), foreArmL: limb(0.07, 'ok'),
        upperArmR: limb(0.09, 'warn'), foreArmR: limb(0.07, 'ok'),
        thighL: limb(0.14, 'warn'), shankL: limb(0.11, 'bad'),
        thighR: limb(0.14, 'warn'), shankR: limb(0.11, 'bad'),
      };
      Object.values(parts).forEach((p) => scene.add(p));
      const pelvisRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), bone); pelvisRing.rotation.x = Math.PI / 2; scene.add(pelvisRing);

      // map a normalized screen point (0..1) → world space in the camera plane
      const toWorld = (k: Keypoint | undefined) => {
        if (!k) return null;
        const x = (k.x - 0.5) * 6.2;      // spread across view
        const y = -(k.y - 0.5) * 6.2 * (height / width);
        return new THREE.Vector3(x, y, 0);
      };
      const at = (n: string) => { const k = kpRef.current.find((p) => p.name === n); return k && k.score > 0.3 ? k : undefined; };

      // orient a limb group from joint A(top)→B(bottom), scaling to their distance
      function poseLimb(g: ThreeNS.Group, a: ThreeNS.Vector3 | null, b: ThreeNS.Vector3 | null, thickness = 1) {
        if (!a || !b) { g.visible = false; return; }
        g.visible = true;
        g.position.copy(a);
        const dir = new THREE.Vector3().subVectors(b, a);
        const len = dir.length();
        g.scale.set(thickness, len, thickness);
        // default limb points -Y; rotate to match dir
        const up = new THREE.Vector3(0, -1, 0);
        g.quaternion.setFromUnitVectors(up, dir.clone().normalize());
      }

      let raf = 0;
      const loop = () => {
        const lsh = toWorld(at('left_shoulder')), rsh = toWorld(at('right_shoulder'));
        const lh = toWorld(at('left_hip')), rh = toWorld(at('right_hip'));
        const shMid = lsh && rsh ? lsh.clone().add(rsh).multiplyScalar(0.5) : null;
        const hipMid = lh && rh ? lh.clone().add(rh).multiplyScalar(0.5) : null;

        poseLimb(parts.torso, shMid, hipMid, 1);
        if (shMid) { parts.head.visible = true; const n = toWorld(at('nose')); parts.head.position.copy(n || shMid.clone().add(new THREE.Vector3(0, 0.5, 0))); } else parts.head.visible = false;
        if (hipMid) { pelvisRing.visible = true; pelvisRing.position.copy(hipMid); } else pelvisRing.visible = false;

        poseLimb(parts.upperArmL, toWorld(at('left_shoulder')), toWorld(at('left_elbow')), 1);
        poseLimb(parts.foreArmL, toWorld(at('left_elbow')), toWorld(at('left_wrist')), 1);
        poseLimb(parts.upperArmR, toWorld(at('right_shoulder')), toWorld(at('right_elbow')), 1);
        poseLimb(parts.foreArmR, toWorld(at('right_elbow')), toWorld(at('right_wrist')), 1);
        poseLimb(parts.thighL, toWorld(at('left_hip')), toWorld(at('left_knee')), 1);
        poseLimb(parts.shankL, toWorld(at('left_knee')), toWorld(at('left_ankle')), 1);
        poseLimb(parts.thighR, toWorld(at('right_hip')), toWorld(at('right_knee')), 1);
        poseLimb(parts.shankR, toWorld(at('right_knee')), toWorld(at('right_ankle')), 1);

        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (mountRef.current && renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
      };
    })();
    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />;
}
