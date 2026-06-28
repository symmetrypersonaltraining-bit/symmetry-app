'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type TodaySession = { id: string; clientId: string; clientName: string; workoutLabel: string; status: string; };
type Client = { id: string; name: string };
type Reminder = { id: string; clientName: string; dueDate: string; amountDue: number; };
interface Props { clients: Client[]; todaySessions: TodaySession[]; loggedTodayCount: number; reminders: Reminder[]; notifCount: number; }

const AVATAR_COLORS = ['#7c9cf5','#5ec9a3','#a78bfa','#f59e5a','#f472b6','#34d399'];
function initials(name: string) { return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase(); }

export default function TrainerHomeClient({ clients, todaySessions, loggedTodayCount, reminders, notifCount }: Props) {
  const router = useRouter();
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || '');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const clusterRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, sx: 0, sy: 0, or: 0, ob: 0 });

  useEffect(() => {
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drag.current.on) return;
      const el = clusterRef.current; if (!el) return;
      const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const cy = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const dx = cx - drag.current.sx, dy = cy - drag.current.sy;
      const nr = Math.max(4, Math.min(drag.current.or - dx, window.innerWidth - el.offsetWidth - 4));
      const nb = Math.max(4, Math.min(drag.current.ob - dy, window.innerHeight - el.offsetHeight - 4));
      el.style.right = nr + 'px'; el.style.bottom = nb + 'px';
    };
    const up = () => { drag.current.on = false; if (clusterRef.current) clusterRef.current.style.cursor = 'grab'; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move as EventListener, { passive: false });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move as EventListener);
      window.removeEventListener('touchend', up);
    };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const el = clusterRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    drag.current = { on: true, sx: cx, sy: cy, or: window.innerWidth - rect.right, ob: window.innerHeight - rect.bottom };
    el.style.cursor = 'grabbing'; e.preventDefault();
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : 'Good evening,';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const avatarColor = (cid: string) => { const i = clients.findIndex(c => c.id === cid); return AVATAR_COLORS[Math.max(0,i) % AVATAR_COLORS.length]; };
  const paymentTotal = reminders.reduce((a, r) => a + r.amountDue, 0);

  const card: React.CSSProperties = { background: 'var(--brand-card)', borderRadius: 24, padding: '16px 18px', boxShadow: '0 6px 20px rgba(20,30,55,.07)', marginBottom: 14 };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, marginBottom: 10 };

  return (
    <div style={{ background: 'var(--brand-bg)', minHeight: '100vh', padding: '20px 16px', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--brand-text-secondary)', fontWeight: 600 }}>{greeting}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-text)', lineHeight: 1.2 }}>Dustin</div>
          <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)', marginTop: 2 }}>{dateStr}</div>
        </div>
        <button onClick={() => {}} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand-card)', border: 'none', boxShadow: '0 2px 8px rgba(20,30,55,.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <i className="ti ti-bell" style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
        </button>
      </div>

      {/* 4 stat cards 2x2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { num: String(clients.length), label: 'Active clients', color: 'var(--brand-primary)', dot: false },
          { num: String(todaySessions.length), label: 'Sessions today', color: '#5ec9a3', dot: false },
          { num: `${loggedTodayCount}/${clients.length}`, label: 'Logged today', color: '#34d399', dot: false },
          { num: String(notifCount), label: 'Notifications', color: '#f59e5a', dot: notifCount > 0 },
        ].map((s, i) => (
          <div key={i} style={{ background: 'var(--brand-card)', borderRadius: 20, padding: '13px 16px', boxShadow: '0 4px 14px rgba(20,30,55,.07)', position: 'relative' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.num}</div>
            <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, marginTop: 3 }}>{s.label}</div>
            {s.dot && <div style={{ position: 'absolute', top: 10, right: 12, width: 8, height: 8, borderRadius: '50%', background: '#f59e5a' }} />}
          </div>
        ))}
      </div>

      {/* Today Sessions */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={lbl}>{"Today's sessions"}</div>
          <button onClick={() => router.push('/schedule')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', background: 'rgba(124,156,245,.1)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>Full schedule →</button>
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {todaySessions.length === 0 ? (
            <div style={{ color: 'var(--brand-text-secondary)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No sessions scheduled today</div>
          ) : todaySessions.map((s, idx) => {
            const color = avatarColor(s.clientId);
            const done = s.status === 'completed';
            const isCardio = /cardio|treadmill|run|stair|walk/i.test(s.workoutLabel);
            return (
              <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14, flexShrink: 0, paddingTop: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  {idx < todaySessions.length - 1 && <div style={{ width: 2, flex: 1, background: color + '30', minHeight: 28 }} />}
                </div>
                <div style={{ flex: 1, background: color + '12', borderRadius: 13, padding: '9px 11px', borderLeft: `3px solid ${color}`, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, color: '#fff', flexShrink: 0 }}>{initials(s.clientName)}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{s.clientName}</div>
                    {done ? (
                      <button onClick={() => router.push(`/clients/${s.clientId}`)} style={{ padding: '4px 10px', borderRadius: 10, background: 'rgba(94,201,163,.12)', border: 'none', color: '#2ea87c', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>View log</button>
                    ) : (
                      <button onClick={() => router.push(`/clients/${s.clientId}`)} style={{ padding: '4px 10px', borderRadius: 10, background: 'var(--brand-primary)', border: 'none', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="ti ti-player-play" style={{ fontSize: 11 }} />Start
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>
                    <i className={`ti ${isCardio ? 'ti-run' : 'ti-barbell'}`} style={{ fontSize: 12, marginRight: 4 }} />{s.workoutLabel || 'Workout'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {todaySessions.length > 3 && <div style={{ textAlign: 'center', paddingTop: 6, color: '#c5ccdb', fontSize: 10, fontWeight: 600 }}>↕ scroll for full day</div>}
      </div>

      {/* Needs Attention */}
      {reminders.length > 0 && (
        <div style={card}>
          <div style={lbl}>Needs attention</div>
          <div onClick={() => router.push('/payments')} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: 12, background: 'rgba(251,191,36,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-credit-card" style={{ fontSize: 18, color: '#b07c0a' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{reminders.length} payment{reminders.length !== 1 ? 's' : ''} due</div>
              <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>${paymentTotal} · review drafts to send</div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#c5ccdb' }} />
          </div>
        </div>
      )}

      {/* Client Quick Access */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={lbl}>Client quick access</div>
          <button onClick={() => router.push('/clients')} style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-primary)', background: 'rgba(124,156,245,.1)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>All clients →</button>
        </div>
        <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', marginBottom: 12 }}>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.push(`/clients/${selectedClientId}?tab=progress`)}
            style={{ flex: 1, padding: '14px 10px', borderRadius: 14, border: 'none', background: 'rgba(124,156,245,.1)', color: '#5a7ddf', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-chart-line" style={{ fontSize: 22 }} />Progress charts
          </button>
          <button onClick={() => router.push(`/clients/${selectedClientId}?tab=nutrition`)}
            style={{ flex: 1, padding: '14px 10px', borderRadius: 14, border: 'none', background: 'rgba(94,201,163,.1)', color: '#2ea87c', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <i className="ti ti-salad" style={{ fontSize: 22 }} />Meal plan &amp; log
          </button>
        </div>
      </div>

      {/* Feedback modal */}
      {feedbackOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,30,55,.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--brand-card)', borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4, color: 'var(--brand-text)' }}>App Feedback</div>
            <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)', marginBottom: 14 }}>{"What's working, what needs fixing?"}</div>
            {feedbackSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#5ec9a3', fontWeight: 700, fontSize: 16 }}>✓ Thanks! Sent.</div>
            ) : (
              <>
                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} placeholder="Describe what you noticed..." rows={4}
                  style={{ width: '100%', border: '1.5px solid var(--brand-border)', borderRadius: 12, padding: 12, fontSize: 14, background: 'var(--brand-bg)', color: 'var(--brand-text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setFeedbackOpen(false); setFeedbackText(''); }}
                    style={{ flex: 1, padding: 12, borderRadius: 12, border: '1.5px solid var(--brand-border)', background: 'transparent', color: 'var(--brand-text-secondary)', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={async () => {
                    if (!feedbackText.trim()) return;
                    try { await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: feedbackText, source: 'trainer_home' }) }); } catch {}
                    setFeedbackSent(true);
                    setTimeout(() => { setFeedbackOpen(false); setFeedbackSent(false); setFeedbackText(''); }, 1500);
                  }} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--brand-primary)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Send</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating AI + Feedback — trainer only, draggable pair */}
      <div ref={clusterRef} onMouseDown={startDrag} onTouchStart={startDrag}
        style={{ position: 'fixed', bottom: 24, right: 20, display: 'flex', gap: 8, zIndex: 200, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}>
        <button onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          onClick={() => window.dispatchEvent(new Event('symmetry:open:ai'))}
          title="AI Assistant"
          style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand-primary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(124,156,245,.4)' }}>
          <i className="ti ti-sparkles" style={{ fontSize: 20, color: '#fff' }} />
        </button>
        <button onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}
          onClick={() => setFeedbackOpen(true)} title="App Feedback"
          style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand-card)', border: '1.5px solid var(--brand-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(20,30,55,.10)' }}>
          <i className="ti ti-message-2" style={{ fontSize: 18, color: 'var(--brand-text-secondary)' }} />
        </button>
      </div>
    </div>
  );
}