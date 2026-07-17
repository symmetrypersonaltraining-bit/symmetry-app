'use client';

// Results view — chain, per-view keyframe summaries, 5-layer education, COM
// note, and the proposed program. Reads the analysis from sessionStorage
// (just-captured) or is passed a persisted assessment.
import { useEffect, useState } from 'react';

interface AnyResult { [k: string]: unknown }

export default function ResultsClient({ initial }: { initial?: AnyResult | null }) {
  const [data, setData] = useState<AnyResult | null>(initial ?? null);
  useEffect(() => {
    if (!data) {
      const raw = sessionStorage.getItem('symmetry_movement_result');
      if (raw) setData(JSON.parse(raw));
    }
  }, [data]);

  if (!data) return <Empty />;
  const engine = (data.engine ?? {}) as any;
  const program = (data.program ?? {}) as any;
  const edu = (data.education ?? {}) as any;
  const labels = (data.checkpointLabels ?? {}) as Record<string, string>;
  const surface = (data.surfaceLabels ?? {}) as Record<string, { label: string; plain: string }>;
  const chain = (engine.chain ?? []) as any[];
  const keyframes = (engine.keyframes ?? []) as any[];

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '18px 14px 60px', color: '#eaf2ff' }}>
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#67d9ff', letterSpacing: 1.5 }}>YOUR MOVEMENT SCREEN</div>
      <h1 style={{ fontSize: 22, margin: '4px 0 10px' }}>{edu.headline ?? 'Here’s what’s happening'}</h1>

      {/* chain */}
      <Section title="The chain — ground up">
        {chain.filter((n) => n.role !== 'clean').map((n, i) => (
          <div key={i} style={{ display: 'flex', gap: 11, marginBottom: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fff',
              background: n.role === 'root' ? '#c22a4f' : n.role === 'pain_site' ? '#4f46e5' : '#d97a16' }}>
              {n.role === 'root' ? '1' : n.role === 'pain_site' ? '◎' : '·'}
            </div>
            <div>
              <b style={{ fontSize: 13 }}>{labels[n.checkpoint] ?? n.checkpoint} — {n.role === 'root' ? 'the root' : n.role === 'pain_site' ? 'your pain site' : 'compensating'}</b>
              <div style={{ fontSize: 11.5, color: '#9fb0d4', marginTop: 2 }}>{(n.findings ?? []).map((k: string) => surface[k]?.label ?? k).join(', ') || 'reported here'}</div>
            </div>
          </div>
        ))}
      </Section>

      {/* 5-layer education */}
      <Section title="The full explanation">
        {[['What we measured', edu.observed], ['Why this happens', edu.mechanism], ['Why it matters for you', edu.why_you], ['Your fix', edu.the_fix], ['The proof', edu.proof]].map(([t, body], i) => body ? (
          <details key={i} open={i < 2} style={{ border: '1px solid #182742', borderRadius: 12, marginBottom: 8, background: '#0b1326', padding: '10px 12px' }}>
            <summary style={{ fontWeight: 800, fontSize: 12.5, cursor: 'pointer', color: '#dbe8ff' }}><span style={{ color: '#38e1ff' }}>{i + 1}</span> · {t as string}</summary>
            <div style={{ fontSize: 12, color: '#b9c9e8', lineHeight: 1.6, marginTop: 8 }}>{body as string}</div>
          </details>
        ) : null)}
      </Section>

      {/* per-view keyframes */}
      <Section title="What each view showed">
        {keyframes.map((k, i) => (
          <div key={i} style={{ border: '1px solid #182742', borderRadius: 12, padding: 12, marginBottom: 8, background: '#0b1326' }}>
            <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#67d9ff', letterSpacing: 1 }}>{String(k.view).toUpperCase()} · REP {k.repIndex}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '5px 0' }}>{k.headline}</div>
            <div style={{ fontSize: 11.5, color: '#9fb0d4', lineHeight: 1.55 }}>{k.whyItMatters}</div>
          </div>
        ))}
      </Section>

      {/* program */}
      <Section title={`Your program${program.routedProgram ? ' · ' + program.routedProgram : ''}`}>
        {(program.priorities ?? []).map((p: any, i: number) => (
          <div key={i} style={{ border: '1px solid #182742', borderRadius: 12, padding: 12, marginBottom: 8, background: '#0b1326' }}>
            <div style={{ fontWeight: 800, fontSize: 12.5, color: '#7ee8ff', marginBottom: 6 }}>{p.priorityLabel} · {labels[p.checkpoint] ?? p.checkpoint}</div>
            {(p.blocks ?? []).map((b: any, j: number) => (
              <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px dashed #182742' }}>
                <span><b style={{ color: '#dde9ff' }}>{b.label}</b> · {b.exerciseName}<div style={{ fontSize: 10.5, color: '#6fa0d8' }}>{b.rationale}</div></span>
                <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#5a6d95', whiteSpace: 'nowrap' }}>{b.durationS ? `${b.durationS}s` : ''}{b.reps ? `${b.sets}×${b.reps}` : ''}</span>
              </div>
            ))}
          </div>
        ))}
      </Section>

      <p style={{ fontSize: 10, color: '#5a6d95', textAlign: 'center', lineHeight: 1.5, marginTop: 16 }}>
        A movement-optimization screen — not a medical exam and not a diagnosis. If anything feels sharp, numb, or wrong, see a professional.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, fontWeight: 800, color: '#6fa0d8', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div style={{ padding: 40, textAlign: 'center', color: '#9fb0d4' }}>No screen to show yet. Run a movement screen first.</div>;
}
