// ─────────────────────────────────────────────────────────────────────────────
// Symmetry Movement Engine — capture protocol coach + quality gate + AI voice.
// Coaches the client into the exact setup (per §18) and REFUSES to record until
// every check passes. Emits clear on-screen instructions + spoken lines
// (Web Speech API) per view. Same setup every time = reliable reassessment.
// ─────────────────────────────────────────────────────────────────────────────

import type { CaptureQuality, ViewName } from './types';

export interface GateCheck {
  id: string;
  label: string;
  pass: boolean;
  fixPrompt: string;
  fixSpoken: string;
}

export interface ViewScript {
  view: ViewName;
  title: string;
  onScreen: string[];      // step-by-step visual checklist
  spokenSetup: string;     // AI voice: how to get into position
  spokenMovement: string;  // AI voice: the movement cue
  reps: number;
  cameraHint: string;
}

/** Per-view instructions — clear text + spoken lines. Rear camera + tripod default. */
export const VIEW_SCRIPTS: Record<Exclude<ViewName, 'back'> | 'back', ViewScript> = {
  front: {
    view: 'front',
    title: 'View 1 — Facing the camera',
    onScreen: [
      'Face the camera squarely, toes on the floor mark.',
      'Feet shoulder-width, pointing straight ahead.',
      'Arms straight overhead, elbows locked, biceps by your ears.',
      'Squat to chair-seat height — 2 seconds down, 2 seconds up.',
      'Five smooth reps, no pausing.',
    ],
    spokenSetup: 'Face me square-on and put your toes on the line. Feet about shoulder-width, pointing straight ahead. Reach both arms straight overhead and lock your elbows — biceps by your ears.',
    spokenMovement: 'When you\'re ready, squat down to about chair height, two seconds down and two seconds up. Give me five smooth reps — I\'m watching your knees and feet.',
    reps: 5,
    cameraHint: 'Rear camera on a tripod at hip height works best — you can watch the screen.',
  },
  side_left: {
    view: 'side_left',
    title: 'View 2 — Side on (left)',
    onScreen: [
      'Turn 90° so your left side faces the camera.',
      'Toes back on the mark, arms overhead, elbows locked.',
      'Same squat — chair height, 2 seconds down, 2 up.',
      'Five reps. Keep your heels down.',
    ],
    spokenSetup: 'Now turn ninety degrees to your right so your left side is facing me. Line your toes up on the mark again and reach your arms back overhead.',
    spokenMovement: 'Same squat — chair height, slow and controlled, five reps. Do your best to keep your heels flat on the floor.',
    reps: 5,
    cameraHint: 'I need a clean profile — your whole side in frame from your hands to your feet.',
  },
  side_right: {
    view: 'side_right',
    title: 'View 3 — Side on (right)',
    onScreen: [
      'Turn so your right side faces the camera.',
      'Toes on the mark, arms overhead, elbows locked.',
      'Same squat — five reps, heels down.',
    ],
    spokenSetup: 'Great. Now turn the other way so your right side faces me, toes on the mark, arms overhead.',
    spokenMovement: 'Same five reps, slow and smooth, heels down. Almost there.',
    reps: 5,
    cameraHint: 'Full profile in frame, hands to feet.',
  },
  wedge: {
    view: 'wedge',
    title: 'View 4 — Heels raised (the wedge test)',
    onScreen: [
      'Put your heels up on the wedge or plates (about 1–2 inches).',
      'Stay side-on to the camera, toes on the mark.',
      'Arms overhead, same squat — three reps this time.',
      'This one test tells us where the problem really starts.',
    ],
    spokenSetup: 'Last one — this is the important one. Put your heels up on the wedge, stay side-on to me, arms overhead.',
    spokenMovement: 'Give me three squats with your heels raised. This takes your ankles out of the equation so I can see exactly what\'s driving everything.',
    reps: 3,
    cameraHint: 'Same profile framing as the side view so I can compare them.',
  },
  back: {
    view: 'back',
    title: 'View 5 — Back to camera (optional)',
    onScreen: [
      'Turn your back to the camera, toes on the mark.',
      'Arms overhead, same squat, five reps.',
    ],
    spokenSetup: 'Turn your back to me, toes on the mark, arms overhead.',
    spokenMovement: 'Five smooth squats — I\'m checking your heels and whether you shift to one side.',
    reps: 5,
    cameraHint: 'Whole body in frame.',
  },
};

// ── Movement demonstrations (shown BEFORE guided capture, per assessment) ────
// A looping model demo + numbered how-to + common mistakes + spoken walkthrough,
// so the client sees exactly how to perform the movement before they do it.
export interface MovementDemo {
  assessment: string;
  title: string;
  summary: string;
  steps: string[];             // numbered how-to shown beside the demo model
  keyCues: string[];           // the make-or-break points
  commonMistakes: string[];    // what NOT to do (shown as red callouts on the model)
  spokenWalkthrough: string;   // AI voice narrates the demo
  depthCue: string;
  demoLoopMs: number;          // demo animation loop length
}

export const MOVEMENT_DEMOS: Record<string, MovementDemo> = {
  OHSA: {
    assessment: 'OHSA',
    title: 'Overhead Squat — how to do it',
    summary: 'A slow bodyweight squat with your arms locked straight overhead. This one movement shows us your whole chain — ankles, knees, hips, back, and shoulders.',
    steps: [
      'Stand tall, feet about shoulder-width, toes pointing straight ahead.',
      'Raise both arms straight overhead — elbows locked, upper arms right beside your ears.',
      'Keeping your arms up, sit back and down like you\'re reaching for a chair.',
      'Go until your thighs are about parallel to the floor (chair-seat height).',
      'Stand back up smoothly. Two seconds down, two seconds up.',
      'Repeat for five smooth reps without pausing.',
    ],
    keyCues: [
      'Arms stay locked overhead the whole time — don\'t let them drift forward.',
      'Heels stay flat on the floor.',
      'Knees track over your toes, not caving inward.',
      'Move slow and controlled — this isn\'t for speed.',
    ],
    commonMistakes: [
      'Letting the arms fall forward as you descend.',
      'Coming up onto your toes / heels lifting.',
      'Not squatting deep enough — get to chair height.',
      'Rushing the reps.',
    ],
    spokenWalkthrough:
      'Here\'s the movement. Stand with your feet about shoulder-width, toes forward. Reach both arms straight overhead and lock your elbows, upper arms by your ears. Now sit back and down like you\'re reaching for a chair behind you, all the way to about parallel, keeping your arms up and your heels down. Then stand back up, nice and slow — about two seconds down and two seconds up. You\'ll do five of these. Watch the demo a couple of times, then we\'ll set you up.',
    depthCue: 'Thighs parallel to the floor — chair-seat height.',
    demoLoopMs: 4000,
  },
  BOX_SQUAT: {
    assessment: 'BOX_SQUAT',
    title: 'Box Squat — how to do it',
    summary: 'A squat down to a box or chair at about knee height. It reads your ankles, hips, and spine in one clean movement.',
    steps: [
      'Set a box or chair behind you at about knee height.',
      'Stand just in front of it, feet shoulder-width, toes forward.',
      'Arms out in front for balance (or overhead if we ask).',
      'Sit back and down until you lightly touch the box — don\'t flop onto it.',
      'Stand back up under control. Five smooth reps.',
    ],
    keyCues: ['Sit back to the box, not straight down.', 'Heels stay down.', 'Control the descent — touch, don\'t drop.'],
    commonMistakes: ['Dropping onto the box.', 'Heels lifting.', 'Knees caving in.'],
    spokenWalkthrough:
      'For this one, set a box or chair behind you at about knee height. Stand just in front of it, feet shoulder-width. Sit back and down until you lightly touch the box, then stand back up. Control it the whole way — touch the box, don\'t drop onto it. Five smooth reps. Watch the demo, then we\'ll get you set up.',
    depthCue: 'Light touch on the box at about knee height.',
    demoLoopMs: 4000,
  },
  SLS: {
    assessment: 'SLS',
    title: 'Single-Leg Squat — how to do it',
    summary: 'A small squat balanced on one leg. It shows us side-to-side differences and hip control.',
    steps: [
      'Stand on one leg, hands on your hips.',
      'Lift the other foot slightly off the floor.',
      'Bend the standing knee and lower a few inches under control.',
      'Push back up to standing. Five reps, then switch legs.',
    ],
    keyCues: ['Keep your hips level — don\'t let one side drop.', 'Knee tracks over your toes.', 'Only go as deep as you can control.'],
    commonMistakes: ['Hip dropping on the free-leg side.', 'Knee caving inward.', 'Losing balance / rushing.'],
    spokenWalkthrough:
      'Stand on one leg with your hands on your hips and lift the other foot just off the floor. Bend your standing knee and lower a few inches, keeping your hips level, then push back up. Five reps on this leg, then we\'ll switch. Go slow and only as deep as you can stay in control.',
    depthCue: 'A few inches — quality over depth.',
    demoLoopMs: 4200,
  },
  PUSH: {
    assessment: 'PUSH',
    title: 'Pushing Assessment — how to do it',
    summary: 'A slow standing press away from your body. It shows how your shoulders and mid-back behave under a push.',
    steps: ['Stand tall in a split stance.', 'Press your hands forward and away, slow and controlled.', 'Return under control. About twenty smooth reps.'],
    keyCues: ['Shoulders stay down, not shrugging up.', 'Head stays stacked, not jutting forward.', 'Low back stays neutral.'],
    commonMistakes: ['Shoulders shrugging toward the ears.', 'Head poking forward.', 'Low back arching.'],
    spokenWalkthrough: 'Stand tall in a split stance and press your hands slowly forward and away from you, then bring them back under control. Keep your shoulders down and your head stacked over your shoulders. About twenty smooth reps.',
    depthCue: 'Full controlled press and return.',
    demoLoopMs: 3600,
  },
  PULL: {
    assessment: 'PULL',
    title: 'Pulling Assessment — how to do it',
    summary: 'A slow standing row toward your body. It shows how your shoulder blades and mid-back work under a pull.',
    steps: ['Stand tall, feet shoulder-width.', 'Pull your hands toward your ribs, squeezing the shoulder blades.', 'Return slowly. About twenty smooth reps.'],
    keyCues: ['Shoulders stay down as you pull.', 'Head stays stacked.', 'Squeeze the shoulder blades together at the end.'],
    commonMistakes: ['Shoulders shrugging up.', 'Head jutting forward.', 'Low back arching.'],
    spokenWalkthrough: 'Stand tall, feet shoulder-width, and pull your hands toward your ribs, squeezing your shoulder blades together, then return slowly. Keep your shoulders down and your head stacked. About twenty smooth reps.',
    depthCue: 'Full squeeze at the shoulder blades.',
    demoLoopMs: 3600,
  },
};

/** Quality gate — ALL must pass before recording unlocks. */
export function evaluateGate(q: CaptureQuality, distanceFt: number, levelDeg: number): GateCheck[] {
  return [
    {
      id: 'distance',
      label: 'Distance (~9 ft)',
      pass: distanceFt >= 8.3 && distanceFt <= 10,
      fixPrompt: distanceFt < 8.3 ? `Step back — you're at ${distanceFt.toFixed(1)} ft` : `Step in — you're at ${distanceFt.toFixed(1)} ft`,
      fixSpoken: distanceFt < 8.3 ? 'Take a step back for me.' : 'Come forward just a little.',
    },
    {
      id: 'framing',
      label: 'Full body + wrists in frame',
      pass: q.framingOk,
      fixPrompt: 'Get your whole body — including your hands overhead and both feet — in the frame.',
      fixSpoken: 'I need your whole body in view, from your hands overhead down to your feet.',
    },
    {
      id: 'level',
      label: 'Phone level & hip height',
      pass: q.levelOk && Math.abs(levelDeg) <= 3,
      fixPrompt: `Level the phone (${levelDeg.toFixed(1)}°) and set it at hip height.`,
      fixSpoken: 'Straighten the phone up so it\'s level, about hip height.',
    },
    {
      id: 'lighting',
      label: 'Even front lighting',
      pass: q.lightingOk,
      fixPrompt: 'Brighten the room and avoid a window behind you.',
      fixSpoken: 'Let\'s get more light on you — and no bright window behind you.',
    },
    {
      id: 'single',
      label: 'One person only',
      pass: q.singlePerson,
      fixPrompt: 'Make sure only you are in the frame.',
      fixSpoken: 'I can only have you in the frame — clear anyone else out.',
    },
    {
      id: 'confidence',
      label: 'Joints clearly visible',
      pass: q.avgKeypointScore >= 0.55,
      fixPrompt: 'Wear fitted clothes and shoes off so I can see your joints clearly.',
      fixSpoken: 'Fitted clothes and shoes off help me see your joints — go ahead and adjust.',
    },
  ];
}

export function gatePassed(checks: GateCheck[]): boolean {
  return checks.every((c) => c.pass);
}

/** First failing check → the single instruction to speak/show (one at a time). */
export function nextCoachingCue(checks: GateCheck[]): { text: string; spoken: string } | null {
  const fail = checks.find((c) => !c.pass);
  if (!fail) return { text: 'Perfect — hold still, we\'re ready.', spoken: 'Perfect. Hold still, we\'re ready to record.' };
  return { text: fail.fixPrompt, spoken: fail.fixSpoken };
}

/** Browser TTS helper — clear, calm, one instruction at a time. */
export function speak(line: string, opts?: { rate?: number; pitch?: number }) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(line);
  u.rate = opts?.rate ?? 0.98;
  u.pitch = opts?.pitch ?? 1.0;
  u.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
