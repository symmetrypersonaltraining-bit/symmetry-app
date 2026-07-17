'use client';

// ─────────────────────────────────────────────────────────────────────────────
// LiveAnatomy3D — the translucent 3D anatomy VISUAL shell.
// Loads the real Z-Anatomy skeleton GLB (Draco), applies the translucent glowing
// "Symmetry" material, and follows the tracked body in the camera plane
// (positions to the hip center, scales to the shoulder→hip span, leans with the
// trunk). Falls back to a procedural body if the GLB fails to load.
// OPT-IN + off by default; three + loaders imported dynamically.
//
// Per-joint articulation is the next step (needs a rigged model); this already
// shows the real anatomy tracking the client's position, scale, and lean.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import type * as ThreeNS from 'three';
import type { Keypoint } from '@/lib/movement/types';
import { processAnatomy } from '@/lib/movement/anatomyModel';

interface Props {
  keypoints: Keypoint[];
  width: number;
  height: number;
  muscleFlags?: Record<string, 'ok' | 'warn' | 'bad'>;
}

export default function LiveAnatomy3D({ keypoints, width, height }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const kpRef = useRef<Keypoint[]>(keypoints);
  kpRef.current = keypoints;

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      if (disposed || !mountRef.current) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
      camera.position.set(0, 0, 6);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      mountRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x2a3a66, 0.8));
      const key = new THREE.DirectionalLight(0x8fd8ff, 1.1); key.position.set(3, 5, 4); scene.add(key);
      const rimL = new THREE.PointLight(0x38e1ff, 1.4, 40); rimL.position.set(-4, 2, 3); scene.add(rimL);
      const rimR = new THREE.PointLight(0x8b7bff, 1.1, 40); rimR.position.set(4, 1, 3); scene.add(rimR);

      // translucent glowing materials — glass bone + red muscle
      const boneMat = new THREE.MeshStandardMaterial({
        color: 0xeaf6ff, roughness: 0.4, metalness: 0.0,
        transparent: true, opacity: 0.55,
        emissive: 0x2a6a9a, emissiveIntensity: 0.45, side: THREE.DoubleSide,
      });
      const muscleMat = new THREE.MeshStandardMaterial({
        color: 0xff5a6e, roughness: 0.5, metalness: 0.0,
        transparent: true, opacity: 0.3,
        emissive: 0x7a1524, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      });

      const holder = new THREE.Group();      // whole body, we position/scale this
      scene.add(holder);
      let model: ThreeNS.Object3D | null = null;
      let modelH = 1; // model native height (shoulder→hip proxy) for scaling

      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      loader.setDRACOLoader(draco);

      loader.load(
        '/symmetry-anatomy.glb',
        (gltf: { scene: ThreeNS.Object3D }) => {
          if (disposed) return;
          model = gltf.scene;
          model.updateMatrixWorld(true);
          const { box } = processAnatomy(THREE, model, { bone: boneMat, muscle: muscleMat });
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          model.position.sub(center);      // center visible anatomy at origin
          modelH = size.y || 1;
          holder.add(model);
        },
        undefined,
        () => { buildFallback(THREE, holder, boneMat); }, // GLB failed → procedural body
      );

      const at = (n: string) => { const k = kpRef.current.find((p) => p.name === n); return k && k.score > 0.3 ? k : undefined; };
      const world = (k?: { x: number; y: number }) => k ? new THREE.Vector3((k.x - 0.5) * 6.4, -(k.y - 0.5) * 6.4 * (height / width), 0) : null;

      let raf = 0;
      const loop = () => {
        const ls = world(at('left_shoulder')), rs = world(at('right_shoulder'));
        const lh = world(at('left_hip')), rh = world(at('right_hip'));
        if (holder.children.length && ls && rs && lh && rh) {
          const shMid = ls.clone().add(rs).multiplyScalar(0.5);
          const hipMid = lh.clone().add(rh).multiplyScalar(0.5);
          const torso = shMid.clone().sub(hipMid);
          const torsoLen = torso.length() || 1;
          // scale so the model's torso matches the person's; position at mid-torso
          const s = (torsoLen * 2.4) / modelH;
          holder.scale.setScalar(s);
          holder.position.copy(hipMid.clone().add(shMid).multiplyScalar(0.5));
          // lean: rotate around Z so the body axis matches shoulder→hip vector
          const lean = Math.atan2(torso.x, torso.y);
          holder.rotation.z = -lean;
        }
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        draco.dispose();
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

// Procedural fallback body (if the GLB can't load) so the toggle never blanks.
function buildFallback(THREE: typeof ThreeNS, holder: ThreeNS.Group, mat: ThreeNS.Material) {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 6, 14), mat); g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat); head.position.y = 0.7; g.add(head);
  holder.add(g);
}
