// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — corrective program builder.
// Turns the chain + findings + pain dose into ONE integrated program, built
// ground-up (root first), continuum-ordered (Inhibit→Lengthen→Activate→Integrate),
// with a plain-language rationale per block. Lengthen ONLY the assessment-
// confirmed overactive muscles. Maps to the existing routing for v1.
// ─────────────────────────────────────────────────────────────────────────────

import type { ChainNode, Checkpoint, CompensationKey, DosePrescription, Finding, ProgramBlock } from './types';
import { COMPENSATION_MUSCLES, PROGRAM_ROUTING, SURFACE_PHASE_LABELS } from './ces-data';

/** Exercise picks per checkpoint (map exercise_id from the 845-row library later). */
const EX_LIBRARY: Record<Checkpoint, { inhibit: string; lengthen: string; activate: string; integrate: string }> = {
  foot_ankle: {
    inhibit: 'SMR calves (gastrocnemius/soleus)',
    lengthen: 'Wall ankle dorsiflexion stretch',
    activate: 'Standing anterior tibialis raises',
    integrate: 'Wedge squat → flat squat progression',
  },
  knee: {
    inhibit: 'SMR adductors / TFL / lateral quad',
    lengthen: 'Adductor & TFL static stretch',
    activate: 'Lateral band walks + glute med / VMO',
    integrate: 'Ball squat, knees tracking over toes',
  },
  lphc: {
    inhibit: 'SMR hip flexors & quads',
    lengthen: 'Hip-flexor / quad static stretch',
    activate: 'Floor glute bridge (pelvic control)',
    integrate: 'Bodyweight squat re-pattern → sit-to-stand',
  },
  shoulder: {
    inhibit: 'SMR lats / pecs / teres major',
    lengthen: 'Lat & pec static stretch',
    activate: 'Prone scapular retraction + serratus punch',
    integrate: 'Row pattern → squat-to-row',
  },
  head: {
    inhibit: 'SMR upper trap / levator (gentle)',
    lengthen: 'Upper trap / scalene stretch',
    activate: 'Deep cervical flexor chin nods',
    integrate: 'Postural bracing in the squat pattern',
  },
};

const PHASE_RATIONALE: Record<Checkpoint, Record<ProgramBlock['phase'], string>> = {
  foot_ankle: {
    inhibit: 'Quiets the calf so it can lengthen — the calf is holding your ankle stiff.',
    lengthen: 'Rebuilds the ankle bend you’re missing so your hips and back stop covering for it.',
    activate: 'Strengthens the shin muscle that actively pulls you into that new range.',
    integrate: 'Teaches the squat with the ankle doing its own job again.',
  },
  knee: {
    inhibit: 'Releases the inner-thigh and outer-hip muscles pulling your knee off track.',
    lengthen: 'Lengthens those same muscles so the knee can line up over the foot.',
    activate: 'Wakes up the outer-hip and inner-knee muscles that keep the knee tracking.',
    integrate: 'Grooves a clean squat with the knee tracking over the toes.',
  },
  lphc: {
    inhibit: 'Releases the short, busy front-of-hip muscles driving the tilt.',
    lengthen: 'Lengthens the front line so the pelvis can sit neutral.',
    activate: 'Re-teaches pelvis control and fires the glutes — this eases the back fast.',
    integrate: 'Puts the new pelvis control into real movement — sitting, lifting, squatting.',
  },
  shoulder: {
    inhibit: 'Releases the chest and lat that pull the shoulders forward.',
    lengthen: 'Opens the front of the shoulder so it can sit back and down.',
    activate: 'Rebuilds the mid-back muscles that hold the shoulder in place.',
    integrate: 'Embeds the corrected shoulder position into pulling and pressing.',
  },
  head: {
    inhibit: 'Eases the neck muscles that hold your head forward.',
    lengthen: 'Lengthens them so your head can stack over your shoulders.',
    activate: 'Strengthens the deep neck muscles that hold that stacked position.',
    integrate: 'Keeps the head stacked while you move.',
  },
};

export interface GeneratedProgram {
  name: string;
  weeks: number;
  reassessInWeeks: [number, number];
  routedProgram: string;         // maps to existing prebuilt program (v1)
  dose: DosePrescription;
  priorities: {
    checkpoint: Checkpoint;
    priorityLabel: string;
    blocks: ProgramBlock[];
    overactiveTargets: string[]; // internal
    underactiveTargets: string[];
  }[];
  dailyMobilityNote: string;
  scheduleDaysPerWeek: number;
}

/** Route to an existing prebuilt program (v1 reuse of assessment-recommend map). */
export function routeToProgram(findings: Finding[]): string {
  const present = new Set(findings.filter((f) => f.present).map((f) => f.key));
  const hits = PROGRAM_ROUTING.filter((r) => r.keys.some((k) => present.has(k)));
  if (!hits.length) return 'Foundation';
  // ankle-root back-pain combination
  const names = hits.map((h) => h.program);
  if (present.has('low_back_arch') && (present.has('feet_turn_out') || present.has('heel_rise') || present.has('excessive_forward_lean'))) {
    return 'Foundation + Ankle & Posterior Chain (combined with APT Correction)';
  }
  return names[0];
}

export function buildProgram(
  chain: ChainNode[],
  findings: Finding[],
  dose: DosePrescription,
): GeneratedProgram {
  const active = chain
    .filter((n) => n.role === 'root' || n.role === 'compensation')
    .sort((a, b) => a.priority - b.priority);

  const priorities = active.map((node, idx) => {
    const overactive = new Set<string>();
    const underactive = new Set<string>();
    for (const key of node.findings) {
      const m = COMPENSATION_MUSCLES[key as CompensationKey];
      if (!m) continue;
      m.overactive.forEach((x) => overactive.add(x));
      m.underactive.forEach((x) => underactive.add(x));
    }
    const ex = EX_LIBRARY[node.checkpoint];
    const rat = PHASE_RATIONALE[node.checkpoint];
    const [holdLo, holdHi] = dose.holdSeconds;
    const blocks: ProgramBlock[] = [
      {
        phase: 'inhibit', label: SURFACE_PHASE_LABELS.inhibit, exerciseName: ex.inhibit,
        targets: Array.from(overactive), sets: 1, durationS: 90, tempo: null, rationale: rat.inhibit,
      },
      {
        phase: 'lengthen', label: SURFACE_PHASE_LABELS.lengthen, exerciseName: ex.lengthen,
        // Lengthen ONLY assessment-confirmed overactive muscles.
        targets: Array.from(overactive), sets: 1, durationS: Math.round((holdLo + holdHi) / 2), tempo: null, rationale: rat.lengthen,
      },
      {
        phase: 'activate', label: SURFACE_PHASE_LABELS.activate, exerciseName: ex.activate,
        targets: Array.from(underactive), sets: 2, reps: node.checkpoint === 'foot_ankle' ? 20 : 15, tempo: '4/2/1', rationale: rat.activate,
      },
      {
        phase: 'integrate', label: SURFACE_PHASE_LABELS.integrate, exerciseName: ex.integrate,
        targets: [], sets: 2, reps: 12, tempo: 'slow', rationale: rat.integrate,
      },
    ];
    return {
      checkpoint: node.checkpoint,
      priorityLabel: node.role === 'root' ? `Priority 1 · The root` : `Priority ${idx + 1}`,
      blocks,
      overactiveTargets: Array.from(overactive),
      underactiveTargets: Array.from(underactive),
    };
  });

  return {
    name: `${active[0] ? checkpointName(active[0].checkpoint) : 'Corrective'}-led program`,
    weeks: 4,
    reassessInWeeks: [4, 6],
    routedProgram: routeToProgram(findings),
    dose,
    priorities,
    dailyMobilityNote:
      'Release + Lengthen + Wake-up every day; Re-pattern every other day. Consistency is the #1 driver — if progress stalls and days were skipped, that gets named honestly before the plan changes.',
    scheduleDaysPerWeek: 7,
  };
}

function checkpointName(c: Checkpoint): string {
  return { foot_ankle: 'Ankle', knee: 'Knee', lphc: 'Hip', shoulder: 'Shoulder', head: 'Neck' }[c];
}
