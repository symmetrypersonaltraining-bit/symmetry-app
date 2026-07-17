'use client';

// Trainer tester cockpit — per-client toggle that unlocks the self-serve
// Movement Screen in that client's app, plus a "run it yourself" trainer mode.
import { useEffect, useState } from 'react';

interface Row { id: string; name: string; enabled: boolean; queued: number }

export default function TestersClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/movement-access')
      .then((r) => r.json())
      .then((d) => { if (d.clients) setRows(d.clients); else setErr(d.error || 'Failed to load'); })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (id: string, enabled: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await fetch('/api/movement-access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: id, enabled }),
    });
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '4px 4px 40px', color: '#eaf2ff' }}>
      <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 10, color: '#67d9ff', letterSpacing: 1.5 }}>MOVEMENT SCREEN · TESTER ACCESS</div>
      <h1 style={{ fontSize: 21, margin: '4px 0 4px' }}>Who can run the screen</h1>
      <p style={{ fontSize: 12.5, color: '#9fb0d4', lineHeight: 1.5, marginTop: 0 }}>
        Flip a client on and they&apos;ll see <b style={{ color: '#dbe8ff' }}>Movement Screen</b> in their app — the exact self-serve flow the paid app will ship. Every run lands in your review queue before anything schedules.
      </p>

      <a href="/movement" style={{ display: 'block', textAlign: 'center', border: 'none', borderRadius: 13, padding: 13, fontWeight: 800, fontSize: 14, margin: '10px 0 16px', color: '#02131a', textDecoration: 'none', background: 'linear-gradient(92deg,#38e1ff,#2ef2b4)' }}>
        Run a screen now (trainer mode) →
      </a>

      {loading && <div style={{ color: '#9fb0d4' }}>Loading clients…</div>}
      {err && <div style={{ color: '#ff9db1' }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 4px', borderBottom: '1px dashed #182742' }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.name}</div>
              <div style={{ fontFamily: 'ui-monospace,monospace', fontSize: 9.5, color: r.queued ? '#ffc985' : r.enabled ? '#39e08b' : '#4b628c' }}>
                {r.queued ? `${r.queued} IN QUEUE` : r.enabled ? 'ENABLED' : 'OFF'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {r.enabled && (
                <a href={`/movement?client=${r.id}`} style={{ fontSize: 11, color: '#7ee8ff', textDecoration: 'none', fontWeight: 700 }}>run →</a>
              )}
              <button
                onClick={() => toggle(r.id, !r.enabled)}
                aria-label="toggle"
                style={{
                  width: 44, height: 24, borderRadius: 999, border: '1px solid ' + (r.enabled ? 'rgba(46,242,180,.5)' : '#22345c'),
                  background: r.enabled ? 'linear-gradient(90deg,rgba(56,225,255,.35),rgba(46,242,180,.35))' : '#13223f',
                  position: 'relative', cursor: 'pointer', flex: 'none',
                }}>
                <span style={{ position: 'absolute', top: 2, left: r.enabled ? 22 : 2, width: 18, height: 18, borderRadius: '50%', background: r.enabled ? 'linear-gradient(135deg,#38e1ff,#2ef2b4)' : '#4b628c', transition: '.15s' }} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 10, color: '#5a6d95', lineHeight: 1.5, marginTop: 16, textAlign: 'center' }}>
        Nothing reaches a client without your approval — and every edit you make teaches the engine your eye.
      </p>
    </div>
  );
}
