'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Movement capture flow (trainer test + client self-serve).
// Front/rear camera · live MoveNet tracking skeleton · quality gate · AI voice
// coach · per-view demo + guided capture · sends keypoints to /movement-analyze.
// The translucent realistic anatomy is a visual layer over the same joints
// (AnatomyRigSlot) — the tracking skeleton is what measures.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import SkeletonOverlay, { AnatomyRigSlot } from '@/components/movement/SkeletonOverlay';
import { createDetector, estimateDistanceFt, keypointQuality, type PoseDetectorHandle } from '@/lib/movement/pose';
import { VIEW_SCRIPTS, MOVEMENT_DEMOS, evaluateGate, gatePassed, nextCoachingCue, speak } from '@/lib/movement/coach';
import type { Frame, Keypoint, ViewCapture, ViewName } from '@/lib/movement/types';

type Phase = 'intro' | 'demo' | 'setup' | 'recording' | 'between' | 'analyzing' | 'done';
const VIEW_SEQUENCE: ViewName[] = ['front', 'side_left', 'side_right', 'wedge'];

export default function CaptureClient({ clientId, clientName, capturedBy }: { clientId: string; clientName: string; capturedBy: 'trainer' | 'client' }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<PoseDetectorHandle | null>(null);
  const rafRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const framesRef = useRef<Frame[]>([]);
  const startRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('intro');
  const [viewIdx, setViewIdx] = useState(0);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment'); // rear default (tripod)
  const [kps, setKps] = useState<Keypoint[]>([]);
  const [dims, setDims] = useState({ w: 360, h: 640 });
  const [distanceFt, setDistanceFt] = useState(0);
  const [gate, setGate] = useState<ReturnType<typeof evaluateGate>>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  const [captured, setCaptured] = useState<ViewCapture[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);

  const view = VIEW_SEQUENCE[viewIdx];
  const script = VIEW_SCRIPTS[view];
  const demo = MOVEMENT_DEMOS.OHSA;

  // ── camera + detector setup ────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setDims({ w: videoRef.current.videoWidth || 720, h: videoRef.current.videoHeight || 1280 });
      }
      if (!detectorRef.current) {
        detectorRef.current = await createDetector('movenet');
      }
      setModelReady(true);
      loop();
    } catch (e) {
      setError('Camera unavailable. Check permissions, then reload. ' + (e instanceof Error ? e.message : ''));
    }
  }, [facing]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const s = videoRef.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach((t) => t.stop());
  }, []);

  // ── live inference loop ─────────────────────────────────────────────────────
  const loop = useCallback(async () => {
    const step = async () => {
      const v = videoRef.current;
      const det = detectorRef.current;
      if (v && det && v.readyState >= 2) {
        try {
          const k = await det.estimate(v);
          setKps(k);
          const dist = estimateDistanceFt(k);
          setDistanceFt(dist);
          const q = keypointQuality(k);
          setGate(evaluateGate(
            { avgKeypointScore: q, framingOk: hasFullBody(k), lightingOk: q > 0.4, levelOk: true, distanceOk: dist >= 8.3 && dist <= 10, singlePerson: true, notes: [] },
            dist, 0,
          ));
          if (capturingRef.current) {
            framesRef.current.push({ t: performance.now() - startRef.current, keypoints: k });
          }
        } catch { /* frame drop ok */ }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // voice coaching on the setup gate (one instruction at a time)
  const lastSpokenRef = useRef('');
  useEffect(() => {
    if (phase !== 'setup' || !voiceOn) return;
    const cue = nextCoachingCue(gate);
    if (cue && cue.spoken !== lastSpokenRef.current) {
      lastSpokenRef.current = cue.spoken;
      speak(cue.spoken);
    }
  }, [gate, phase, voiceOn]);

  // ── flow control ────────────────────────────────────────────────────────────
  const beginScreen = async () => {
    setPhase('demo');
    await startCamera();
    if (voiceOn) speak(demo.spokenWalkthrough);
  };

  const goToSetup = () => {
    setPhase('setup');
    if (voiceOn) speak(script.spokenSetup);
  };

  const startRecording = () => {
    if (!gatePassed(gate)) return;
    framesRef.current = [];
    startRef.current = performance.now();
    capturingRef.current = true;
    setPhase('recording');
    if (voiceOn) speak(script.spokenMovement);
  };

  const finishView = () => {
    capturingRef.current = false;
    const q = keypointQuality(kps);
    const vc: ViewCapture = {
      view,
      assessment: 'OHSA',
      wedge: view === 'wedge',
      frames: framesRef.current,
      fps: 30,
      quality: { avgKeypointScore: q, framingOk: true, lightingOk: true, levelOk: true, distanceOk: true, singlePerson: true, notes: [] },
    };
    const next = [...captured, vc];
    setCaptured(next);
    if (viewIdx < VIEW_SEQUENCE.length - 1) {
      setViewIdx((i) => i + 1);
      setPhase('between');
    } else {
      runAnalysis(next);
    }
  };

  const runAnalysis = async (views: ViewCapture[]) => {
    setPhase('analyzing');
    stopCamera();
    try {
      const standingFrontFrame = views.find((v) => v.view === 'front')?.frames[0] ?? null;
      const standingSideFrame = views.find((v) => v.view === 'side_left')?.frames[0] ?? null;
      const res = await fetch('/api/movement-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          capturedBy,
          painLevel: 5,
          input: {
            assessment: 'OHSA',
            capturedAt: new Date().toISOString(),
            standingFrontFrame,
            standingSideFrame,
            views,
            intakeWords: '',
            painMap: [],
            durationWeeks: null,
          },
        }),
      });
      const data = await res.json();
      sessionStorage.setItem('symmetry_movement_result', JSON.stringify(data));
      setPhase('done');
      window.location.href = `/movement/results?client=${clientId}`;
    } catch (e) {
      setError('Analysis failed: ' + (e instanceof Error ? e.message : ''));
      setPhase('done');
    }
  };

  const flagged = deriveFlags(kps, gate);

  // ── render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#04070f', color: '#eaf2ff', paddingBottom: 24 }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, margin: '0 auto', aspectRatio: '9/16', background: '#02040a', overflow: 'hidden' }}>
        <video ref={videoRef} playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
        {/* translucent realistic anatomy visual layer mounts here (rigged to joints) */}
        <AnatomyRigSlot />
        {/* joint-accurate tracking skeleton (the measuring layer) */}
        {(phase === 'setup' || phase === 'recording' || phase === 'demo') && kps.length > 0 && (
          <SkeletonOverlay keypoints={kps} width={dims.w} height={dims.h} flagged={flagged} />
        )}

        {/* HUD */}
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', gap: 6, fontFamily: 'ui-monospace,monospace', fontSize: 10, fontWeight: 800 }}>
          <span style={chip}>{modelReady ? 'SYM·VISION 30FPS' : 'LOADING MODEL…'}</span>
          <button onClick={() => { setFacing((f) => (f === 'user' ? 'environment' : 'user')); stopCamera(); setTimeout(startCamera, 300); }} style={{ ...chip, cursor: 'pointer' }}>⇄ {facing === 'environment' ? 'REAR' : 'FRONT'} CAM</button>
        </div>

        {/* phase overlays */}
        {phase === 'intro' && (
          <Overlay>
            <h2 style={h2}>Movement Screen</h2>
            <p style={sub}>{clientName ? `For ${clientName}. ` : ''}We&apos;ll film a few squats from the front and side, then build your plan. Takes about 3 minutes.</p>
            <p style={{ ...sub, color: '#7ea2d6' }}>Best setup: phone on a tripod, rear camera, ~9 ft back at hip height so you can see the screen.</p>
            <button onClick={beginScreen} style={btn}>Begin screen →</button>
          </Overlay>
        )}

        {phase === 'demo' && (
          <Overlay align="flex-start">
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#67d9ff', letterSpacing: 1.5 }}>WATCH FIRST · {view.toUpperCase()}</div>
            <h2 style={h2}>{demo.title}</h2>
            <p style={sub}>{demo.summary}</p>
            <ol style={{ paddingLeft: 18, margin: '8px 0', fontSize: 12.5, lineHeight: 1.7, color: '#cfe0fb' }}>
              {demo.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <div style={{ fontSize: 11, color: '#ffc985', lineHeight: 1.6 }}><b>Key points:</b> {demo.keyCues.join(' · ')}</div>
            <div style={{ fontSize: 11, color: '#ff9db1', lineHeight: 1.6, marginTop: 4 }}><b>Avoid:</b> {demo.commonMistakes.join(' · ')}</div>
            <button onClick={goToSetup} style={btn}>I&apos;m ready — set me up →</button>
          </Overlay>
        )}

        {phase === 'setup' && (
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: 'rgba(5,12,26,.9)', border: '1px solid rgba(90,150,230,.3)', borderRadius: 14, padding: 12, backdropFilter: 'blur(6px)' }}>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#67d9ff', letterSpacing: 1.5, marginBottom: 6 }}>{script.title.toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
              {gate.map((g) => (
                <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span>{g.label}</span>
                  <span style={{ fontFamily: 'ui-monospace,monospace', fontWeight: 800, color: g.pass ? '#39e08b' : '#ffb454' }}>{g.pass ? 'PASS' : 'FIX'}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: '#ffd27a', minHeight: 18, marginBottom: 8 }}>{nextCoachingCue(gate)?.text}</div>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#7ea2d6', marginBottom: 8 }}>Distance {distanceFt ? distanceFt.toFixed(1) : '—'} ft</div>
            <button onClick={startRecording} disabled={!gatePassed(gate)} style={{ ...btn, opacity: gatePassed(gate) ? 1 : 0.5, marginTop: 0 }}>
              {gatePassed(gate) ? 'Record 5 reps →' : 'Fix the setup to unlock…'}
            </button>
          </div>
        )}

        {phase === 'recording' && (
          <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: 'rgba(5,12,26,.9)', border: '1px solid rgba(46,242,180,.35)', borderRadius: 14, padding: 12, textAlign: 'center' }}>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#ff5c7a', fontWeight: 800, marginBottom: 4 }}>● REC · {script.title}</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>{script.onScreen[3]}</div>
            <button onClick={finishView} style={{ ...btn, marginTop: 0 }}>Done — next view →</button>
          </div>
        )}

        {phase === 'between' && (
          <Overlay>
            <h2 style={h2}>Nice work</h2>
            <p style={sub}>That view&apos;s captured. Next: {VIEW_SCRIPTS[VIEW_SEQUENCE[viewIdx]].title}.</p>
            <button onClick={() => setPhase('demo')} style={btn}>Continue →</button>
          </Overlay>
        )}

        {phase === 'analyzing' && (
          <Overlay>
            <div className="pulse" style={{ fontSize: 34 }}>◍</div>
            <h2 style={h2}>Reading your movement…</h2>
            <p style={sub}>Fusing your views, checking the chain, finding the driver. A few seconds.</p>
          </Overlay>
        )}

        {error && (
          <Overlay>
            <h2 style={{ ...h2, color: '#ff9db1' }}>Something interrupted the screen</h2>
            <p style={sub}>{error}</p>
          </Overlay>
        )}
      </div>

      <div style={{ maxWidth: 480, margin: '10px auto 0', padding: '0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#7ea2d6' }}>
          View {viewIdx + 1} / {VIEW_SEQUENCE.length}
        </div>
        <label style={{ fontSize: 12, color: '#9fb9e8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} /> AI voice coach
        </label>
      </div>
      <p style={{ maxWidth: 480, margin: '10px auto 0', padding: '0 14px', fontSize: 10, color: '#5a6d95', lineHeight: 1.5, textAlign: 'center' }}>
        Processed on your device. Raw video is never uploaded or stored — only the movement measurements.
      </p>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────
const chip: React.CSSProperties = { background: 'rgba(5,12,26,.8)', border: '1px solid rgba(90,150,230,.3)', borderRadius: 8, color: '#cfe4ff', padding: '4px 8px', fontFamily: 'ui-monospace,monospace' };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 800, margin: '4px 0 6px' };
const sub: React.CSSProperties = { fontSize: 13, color: '#9fb0d4', lineHeight: 1.5, margin: 0 };
const btn: React.CSSProperties = { display: 'block', width: '100%', border: 'none', borderRadius: 13, padding: 13, fontWeight: 800, fontSize: 14, marginTop: 12, color: '#02131a', background: 'linear-gradient(92deg,#38e1ff,#2ef2b4)', cursor: 'pointer' };

function Overlay({ children, align = 'center' }: { children: React.ReactNode; align?: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(4,7,15,.55),rgba(4,7,15,.9))', display: 'flex', flexDirection: 'column', justifyContent: align === 'center' ? 'center' : 'flex-start', gap: 4, padding: 22, overflowY: 'auto' }}>
      {children}
    </div>
  );
}

function hasFullBody(k: Keypoint[]): boolean {
  const need = ['left_shoulder', 'left_hip', 'left_knee', 'left_ankle', 'left_wrist'];
  return need.every((n) => (k.find((p) => p.name === n)?.score ?? 0) > 0.3);
}

function deriveFlags(kps: Keypoint[], gate: ReturnType<typeof evaluateGate>) {
  // Live visual hint only — real findings come from the engine post-capture.
  void gate;
  return kps.length ? [] : [];
}
