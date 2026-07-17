// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — regional-interdependence chain builder + wedge
// two-pass differential + intake hypothesis arbitration.
// Root = lowest restricted checkpoint (ground-up). Compensations stack above.
// Pain site woven in as its own node. The wedge pass arbitrates ankle-driven
// vs true hip/spine when both are flagged.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChainNode, Checkpoint, Finding, PainMapEntry, WedgeCompare } from './types';
import { CHECKPOINT_ORDER, THRESHOLDS } from './ces-data';
import { median } from './geometry';
import type { FrameFeatures, Rep } from './types';
import { bottomWindow } from './reps';

/** Compare flat vs wedge (heels-elevated) passes on the shared sagittal metrics. */
export function compareWedge(
  flatFrames: FrameFeatures[], flatReps: Rep[],
  wedgeFrames: FrameFeatures[], wedgeReps: Rep[],
): WedgeCompare {
  const metric = (frames: FrameFeatures[], reps: Rep[], pick: (f: FrameFeatures) => number | undefined) => {
    const vals = reps.filter((r) => r.usable).flatMap((r) =>
      bottomWindow(frames, r).map(pick).filter((v): v is number => typeof v === 'number'),
    );
    return vals.length ? median(vals) : null;
  };

  const pairs: { name: string; pick: (f: FrameFeatures) => number | undefined }[] = [
    { name: 'trunk_lean', pick: (f) => f.trunkLean },
    { name: 'trunk_tibia_delta', pick: (f) => f.trunkTibiaDelta },
    { name: 'lumbar_ext', pick: (f) => f.lumbarExt },
    { name: 'heel_rise', pick: (f) => f.heelRise },
  ];

  const deltas: WedgeCompare['deltas'] = [];
  let improved = 0;
  let measured = 0;
  for (const p of pairs) {
    const flat = metric(flatFrames, flatReps, p.pick);
    const wedge = metric(wedgeFrames, wedgeReps, p.pick);
    if (flat === null || wedge === null) continue;
    measured++;
    const delta = flat - wedge;
    deltas.push({ metric: p.name, flat: r1(flat), wedge: r1(wedge), delta: r1(delta) });
    if (flat > 0 && delta / Math.max(Math.abs(flat), 1e-6) >= THRESHOLDS.wedgeCleanupPct) improved++;
  }

  if (!measured || !wedgeReps.some((r) => r.usable)) {
    return { performed: wedgeReps.length > 0, verdict: 'inconclusive', confidence: 0.3, deltas, explanation: 'wedge pass unusable or missing' };
  }

  const frac = improved / measured;
  let verdict: WedgeCompare['verdict'];
  if (frac >= 0.6) verdict = 'ankle_driven';
  else if (frac <= 0.25) verdict = 'hip_spine';
  else verdict = 'mixed';
  const confidence = Math.round(Math.min(0.95, 0.55 + Math.abs(frac - 0.42) * 0.9) * 100) / 100;
  return {
    performed: true,
    verdict,
    confidence,
    deltas,
    explanation:
      verdict === 'ankle_driven'
        ? `${improved}/${measured} sagittal faults cleaned up ≥${THRESHOLDS.wedgeCleanupPct * 100}% with heels elevated → ankle restriction is the driver`
        : verdict === 'hip_spine'
          ? 'compensations persisted with the ankle removed → true hip/spine pattern underneath'
          : 'partial cleanup → ankle restriction plus an independent hip/spine component',
  };
}

/** Build the ground-up chain from merged findings + wedge verdict + pain map. */
export function buildChain(
  findings: Finding[],
  wedge: WedgeCompare | null,
  painMap: PainMapEntry[],
  suspectedRoot: Checkpoint | null,
): { chain: ChainNode[]; hypothesisConfirmed: boolean | null; cleanCheckpoints: Checkpoint[] } {
  const present = findings.filter((f) => f.present);
  const byCheckpoint = new Map<Checkpoint, Finding[]>();
  for (const f of present) {
    byCheckpoint.set(f.checkpoint, [...(byCheckpoint.get(f.checkpoint) ?? []), f]);
  }

  const flagged = CHECKPOINT_ORDER.filter((c) => byCheckpoint.has(c));
  const clean = CHECKPOINT_ORDER.filter((c) => !byCheckpoint.has(c));

  // Root selection: lowest flagged checkpoint (ground-up), arbitrated by wedge.
  let root: Checkpoint | null = flagged[0] ?? null;
  if (wedge?.performed && wedge.verdict === 'hip_spine' && root === 'foot_ankle' && flagged.includes('lphc')) {
    root = 'lphc'; // ankle cleaned up ≠ driver → true hip/spine root
  }
  if (wedge?.performed && wedge.verdict === 'ankle_driven' && flagged.includes('foot_ankle')) {
    root = 'foot_ankle';
  }

  // Pain site → checkpoint mapping (plain heuristics; trainer can override)
  const painCheckpoint = (area: string): Checkpoint | null => {
    const a = area.toLowerCase();
    if (/(low(er)? )?back|lumbar/.test(a)) return 'lphc';
    if (/hip|glute|pelvis/.test(a)) return 'lphc';
    if (/knee/.test(a)) return 'knee';
    if (/ankle|foot|heel|calf/.test(a)) return 'foot_ankle';
    if (/shoulder|arm|scap/.test(a)) return 'shoulder';
    if (/neck|head/.test(a)) return 'head';
    return null;
  };
  const painSites = new Set(painMap.filter((p) => p.level > 0).map((p) => painCheckpoint(p.area)).filter(Boolean) as Checkpoint[]);

  const chain: ChainNode[] = [];
  let priority = 1;
  for (const cp of CHECKPOINT_ORDER) {
    const fs = byCheckpoint.get(cp) ?? [];
    const isPain = painSites.has(cp);
    if (!fs.length && !isPain) continue;
    const role: ChainNode['role'] = cp === root && fs.length ? 'root' : fs.length ? 'compensation' : 'pain_site';
    chain.push({
      role: isPain && role !== 'root' ? (fs.length ? 'compensation' : 'pain_site') : role,
      checkpoint: cp,
      findings: fs.map((f) => f.key),
      priority: role === 'root' ? 1 : ++priority,
      rationale:
        role === 'root'
          ? `lowest restricted checkpoint (ground-up) — everything above adapts around it${wedge?.performed ? `; wedge verdict: ${wedge.verdict} (${wedge.confidence})` : ''}`
          : fs.length
            ? `flagged above the root — treated as adaptation until the root clears`
            : `reported pain site with no independent movement fault — symptom, not source; woven in for the early win`,
    });
    // ensure pain-site checkpoint that also has findings still notes the pain
    if (isPain && fs.length) {
      const node = chain[chain.length - 1];
      node.rationale += ' · client-reported pain here — quick-win work woven in';
    }
  }

  // clean nodes for the education layer
  for (const cp of clean) {
    if (painSites.has(cp)) continue;
    chain.push({ role: 'clean', checkpoint: cp, findings: [], priority: 99, rationale: 'no fault detected' });
  }

  const hypothesisConfirmed = suspectedRoot ? (root ? root === suspectedRoot : null) : null;
  return { chain, hypothesisConfirmed, cleanCheckpoints: clean };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
