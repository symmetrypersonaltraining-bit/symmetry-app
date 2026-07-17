'use client';

// Public preview — loads the real Z-Anatomy skeleton GLB and renders it in the
// Symmetry translucent/glowing tech style, slowly rotating. No auth, no camera —
// just so you can SEE the anatomy visual on any device.
import { useEffect, useRef, useState } from 'react';
import type * as ThreeNS from 'three';
import { processAnatomy } from '@/lib/movement/anatomyModel';

export default function AnatomyPreview() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading your skeleton…');

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
      if (disposed || !mountRef.current) return;

      const W = () => mountRef.current!.clientWidth || window.innerWidth;
      const H = () => mountRef.current!.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 100);
      camera.position.set(0, 0, 6);
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(W(), H()); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      mountRef.current.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x2a3a66, 0.85));
      const key = new THREE.DirectionalLight(0x8fd8ff, 1.2); key.position.set(3, 5, 4); scene.add(key);
      const rimL = new THREE.PointLight(0x38e1ff, 1.6, 40); rimL.position.set(-5, 2, 3); scene.add(rimL);
      const rimR = new THREE.PointLight(0x8b7bff, 1.3, 40); rimR.position.set(5, 1, 3); scene.add(rimR);
      const under = new THREE.PointLight(0x2ef2b4, 0.8, 30); under.position.set(0, -3, 3); scene.add(under);

      const boneMat = new THREE.MeshStandardMaterial({
        color: 0xeaf6ff, roughness: 0.4, metalness: 0.0, transparent: true, opacity: 0.6,
        emissive: 0x2a6a9a, emissiveIntensity: 0.45, side: THREE.DoubleSide,
      });
      const muscleMat = new THREE.MeshStandardMaterial({
        color: 0xff5a6e, roughness: 0.5, metalness: 0.0, transparent: true, opacity: 0.34,
        emissive: 0x7a1524, emissiveIntensity: 0.5, side: THREE.DoubleSide,
      });

      const holder = new THREE.Group(); scene.add(holder);
      const loader = new GLTFLoader();
      const draco = new DRACOLoader(); draco.setDecoderPath('/draco/'); loader.setDRACOLoader(draco);

      loader.load('/symmetry-anatomy.glb',
        (gltf: { scene: ThreeNS.Object3D }) => {
          if (disposed) return;
          const model = gltf.scene;
          holder.add(model);
          model.updateMatrixWorld(true);
          const { box } = processAnatomy(THREE, model, { bone: boneMat, muscle: muscleMat });
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          const fit = 3.9 / (size.y || 1);        // fit the whole body in view
          holder.scale.setScalar(fit);
          // negate the visible-center (post-scale) so the body sits dead-center
          holder.position.set(-center.x * fit, -center.y * fit, -center.z * fit);
          setStatus('');
        },
        (p: { loaded: number; total: number }) => { if (p.total) setStatus(`Loading your skeleton… ${Math.round((p.loaded / p.total) * 100)}%`); },
        () => setStatus('Could not load the model.'),
      );

      let raf = 0, t = 0;
      const loop = () => {
        holder.rotation.y = Math.sin(t * 0.35) * 0.7; t += 0.016;
        rimL.position.x = Math.sin(t * 0.5) * -5; rimR.position.x = Math.cos(t * 0.5) * 5;
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      const onResize = () => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); };
      window.addEventListener('resize', onResize);

      // drag to spin
      let down = false, lx = 0;
      renderer.domElement.addEventListener('pointerdown', (e) => { down = true; lx = e.clientX; });
      window.addEventListener('pointerup', () => (down = false));
      window.addEventListener('pointermove', (e) => { if (down) { holder.rotation.y += (e.clientX - lx) * 0.01; lx = e.clientX; } });

      cleanup = () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); draco.dispose(); renderer.dispose(); if (mountRef.current && renderer.domElement.parentNode === mountRef.current) mountRef.current.removeChild(renderer.domElement); };
    })();
    return () => { disposed = true; cleanup(); };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(600px 500px at 50% 34%, #0d1a33 0%, transparent 70%), linear-gradient(180deg,#070d1c,#02050c)', overflow: 'hidden' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
        <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, letterSpacing: 2, color: '#67d9ff', fontWeight: 800 }}>SYMMETRY · MOVEMENT ENGINE</div>
        <div style={{ fontSize: 13, color: '#9fb0d4', marginTop: 4 }}>your real anatomy model, in the Symmetry style · drag to spin</div>
      </div>
      {status && <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, textAlign: 'center', color: '#7ea2d6', fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{status}</div>}
      <div style={{ position: 'absolute', bottom: 14, right: 14, fontFamily: 'ui-monospace,monospace', fontSize: 9, color: '#4b628c' }}>skeleton first · muscle + live tracking next</div>
    </div>
  );
}
