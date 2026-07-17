// ─────────────────────────────────────────────────────────────────────────────
// Shared processing for the loaded Z-Anatomy GLB: hide the thin ligament/
// membrane "spike" meshes, color muscle vs bone, and return the bounding box of
// what remains so callers can center/scale cleanly. Name-based (the GLB nodes
// carry anatomical names). Used by the live capture shell + the public preview.
// ─────────────────────────────────────────────────────────────────────────────

import type * as ThreeNS from 'three';

// Thin connective-tissue meshes that render as ugly spikes — hide these.
const HIDE = [
  'ligament', 'membrane', 'capsule', 'labrum', 'tendon', 'fascia', 'retinacul',
  'aponeuros', 'zona', 'frenula', 'meniscus', 'raphe', 'sheath', 'septum',
  'cartilage', 'bursa', 'cord', 'ligamentum', 'interosseous', 'plica', 'fold',
];
// Muscle meshes → reddish translucent.
const MUSCLE = [
  'muscle', 'muscul', 'biceps', 'triceps', 'deltoid', 'pector', 'trapez', 'glute',
  'quadric', 'rectus', 'obliqu', 'latissim', 'soleus', 'gastrocn', 'sartor',
  'gracil', 'brachi', 'femoris', 'tibialis', 'peroneus', 'fibularis', 'sternocleido',
  'scalene', 'iliopsoas', 'psoas', 'adductor', 'abductor', 'vastus', 'semitendin',
  'semimembran', 'infraspinatus', 'supraspinatus', 'subscapularis', 'teres',
  'rhomboid', 'serratus', 'levator', 'splenius', 'erector', 'multifidus', 'flexor',
  'extensor', 'lumbric', 'interossei', 'masseter', 'temporalis', 'oris', 'oculi',
];

const has = (name: string, list: string[]) => {
  const l = name.toLowerCase();
  return list.some((k) => l.includes(k));
};

export interface AnatomyMats {
  bone: ThreeNS.Material;
  muscle: ThreeNS.Material;
}

/** Hide spikes, assign materials, and return the box of the VISIBLE meshes. */
export function processAnatomy(
  THREE: typeof ThreeNS,
  root: ThreeNS.Object3D,
  mats: AnatomyMats,
): { box: ThreeNS.Box3; visible: number; hidden: number } {
  let visible = 0;
  let hidden = 0;
  const box = new THREE.Box3();
  box.makeEmpty();
  root.traverse((o) => {
    const mesh = o as ThreeNS.Mesh;
    if (!mesh.isMesh) return;
    const nm = mesh.name || '';
    if (has(nm, HIDE) && !has(nm, MUSCLE)) {
      mesh.visible = false;
      hidden++;
      return;
    }
    mesh.material = has(nm, MUSCLE) ? mats.muscle : mats.bone;
    mesh.frustumCulled = false;
    visible++;
    // union this mesh into the visible-box
    mesh.geometry.computeBoundingBox();
    const gb = mesh.geometry.boundingBox;
    if (gb) {
      const b = gb.clone().applyMatrix4(mesh.matrixWorld);
      box.union(b);
    }
  });
  return { box, visible, hidden };
}
