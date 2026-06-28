'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { pausePaymentReminder } from './actions';

type TodaySession = { id: string; clientId: string; clientName: string; workoutLabel: string; dayId: string; status: string; };
type Client = { id: string; name: string };
type Reminder = { id: string; clientId: string; clientName: string; dueDate: string; amountDue: number; };
interface Props { clients: Client[]; todaySessions: TodaySession[]; loggedTodayCount: number; reminders: Reminder[]; notifCount: number; }

const AVATAR_COLORS = ['#7c9cf5','#5ec9a3','#a78bfa','#f59e5a','#f472b6','#34d399'];
function initials(name: string) { return name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase(); }
function avatarColor(cid: string, clients: Client[]) { const i = clients.findIndex((c: Client) => c.id === cid); return AVATAR_COLORS[Math.max(0,i) % AVATAR_COLORS.length]; }

export default function TrainerHomeClient({ clients, todaySessions, loggedTodayCount, reminders, notifCount }: Props) {
  const router = useRouter();
  const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id ?? '');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const clusterRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ on: false, sx: 0, sy: 0, or: 0, ob: 0 });

  useEffect(() => {
    const now = new Date();
    const h = now.getHours();
    setGreeting(h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,');
    setDateStr(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
  }, []);

  useEffect(() => {
    const el = clusterRef.current;
    if (!el) return;
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drag.current.on) return;
      const cx = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const cy = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const dx = cx - drag.current.sx;
      const dy = cy - drag.current.sy;
      const nr = Math.max(4, Math.min(drag.current.or - dx, window.innerWidth - 100));
      const nb = Math.max(4, Math.min(drag.current.ob - dy, window.innerHeight - 60));
      el.style.right = nr + 'px';
      el.style.bottom = nb + 'px';
    };
    const up = () => { drag.current.on = false; if (el) el.style.cursor = 'grab'; };
    window.addEventListener('mousemove', move);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, []);

  const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const el = clusterRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const cy = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    drag.current = { on: true, sx: cx, sy: cy, or: window.innerWidth - rect.right, ob: window.innerHeight - rect.bottom };
    el.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const handlePause = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set([...prev, id]));
    await pausePaymentReminder(id);
  };

  const visibleReminders = reminders.filter((r: Reminder) => !dismissedIds.has(r.id));

  const card: React.CSSProperties = { background: 'var(--brand-card)', borderRadius: 24, padding: '16px 18px', boxShadow: '0 6px 20px rgba(20,30,55,.07)', marginBottom: 14 };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, marginBottom: 10 };
  const statCard: React.CSSProperties = { ...card, marginBottom: 0, cursor: 'pointer' };

  return (
    <div style={{ background: 'var(--brand-bg)', minHeight: '100vh', padding: '20px 16px', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--brand-text-secondary)', fontWeight: 600 }}>{greeting}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-text)', lineHeight: 1.2 }}>Dustin</div>
          <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)', marginTop: 2 }}>{dateStr}</div>
        </div>
        <button onClick={() => router.push('/payments')} style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand-card)', border: 'none', boxShadow: '0 2px 8px rgba(20,30,55,.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <i className='ti ti-bell' style={{ fontSize: 18, color: 'var(--brand-primary)' }} />
          {notifCount > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />}
        </button>
      </div>

      {/* 4 Stat cards -- all clickable */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={statCard} onClick={() => router.push('/clients')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }}>Active clients</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--brand-primary)', lineHeight: 1 }}>{clients.length}</div>
        </div>
        <div style={statCard} onClick={() => router.push('/schedule')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }}>Sessions today</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#5ec9a3', lineHeight: 1 }}>{todaySessions.length}</div>
        </div>
        <div style={statCard} onClick={() => router.push('/schedule')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }}>Logged today</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#34d399', lineHeight: 1 }}>{loggedTodayCount}</div>
        </div>
        <div style={statCard} onClick={() => router.push('/payments')}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '.07em' }}>Notifications</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: notifCount > 0 ? '#fbbf24' : 'var(--brand-text-secondary)', lineHeight: 1 }}>{notifCount}</div>
        </div>
      </div>

      {/* Today's Sessions */}
      <div style={card}>
        <div style={lbl}>Today&apos;s Sessions</div>
        {todaySessions.length === 0 ? (
          <div style={{ color: 'var(--brand-text-secondary)', fontSize: 14 }}>No supervised sessions today</div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: 280 }}>
            {todaySessions.map((s: TodaySession) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--brand-border)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: avatarColor(s.clientId, clients), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{initials(s.clientName)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--brand-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.clientName}</div>
                  <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)' }}>{s.workoutLabel}</div>
                </div>
                {s.status === 'completed' ? (
                  <button onClick={() => router.push('/clients/' + s.clientId)} style={{ fontSize: 12, fontWeight: 600, color: '#34d399', background: 'rgba(52,211,153,.1)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>View log</button>
                ) : (
                  <button onClick={() => router.push('/workout/' + s.dayId + '?forClient=' + s.clientId)} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--brand-primary)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Start</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Needs Attention */}
      {visibleReminders.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={lbl}>Needs Attention</div>
            <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)' }}>{visibleReminders.length} due</div>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 320 }}>
            {visibleReminders.map((r: Reminder) => (
              <div key={r.id} onClick={() => router.push('/payments')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--brand-border)', cursor: 'pointer' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--brand-text)' }}>{r.clientName}</div>
                  <div style={{ fontSize: 12, color: 'var(--brand-text-secondary)' }}>Due {r.dueDate}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#f87171' }}>${r.amountDue}</div>
                  <button onClick={(e: React.MouseEvent) => handlePause(e, r.id)} title='Pause reminder' style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(251,191,36,.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className='ti ti-player-pause' style={{ fontSize: 14, color: '#fbbf24' }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Quick Access */}
      <div style={card}>
        <div style={lbl}>Client Quick Access</div>
        <select value={selectedClientId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedClientId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: '1.5px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 14, fontWeight: 600, marginBottom: 12, cursor: 'pointer' }}>
          {clients.map((c: Client) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button onClick={() => router.push('/clients/' + selectedClientId)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Progress charts</button>
          <button onClick={() => router.push('/nutrition?clientId=' + selectedClientId)} style={{ flex: 1, padding: '10px 0', borderRadius: 12, background: '#5ec9a3', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Meal plan &amp; log</button>
        </div>
        <button onClick={() => router.push('/clients')} style={{ width: '100%', padding: '8px 0', borderRadius: 12, background: 'transparent', color: 'var(--brand-primary)', border: '1.5px solid var(--brand-primary)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>All clients</button>
      </div>

      {/* Floating AI + Feedback cluster */}
      <div ref={clusterRef} onMouseDown={startDrag} onTouchStart={startDrag} style={{ position: 'fixed', bottom: 24, right: 20, display: 'flex', gap: 8, zIndex: 200, cursor: 'grab', userSelect: 'none', touchAction: 'none' }}>
        <button onClick={() => window.dispatchEvent(new Event('symmetry:open:ai'))} title='AI assistant' style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand-primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 14px rgba(124,156,245,.35)' }}>
          <i className='ti ti-sparkles' style={{ fontSize: 20, color: '#fff' }} />
        </button>
        <button onClick={() => setFeedbackOpen(true)} title='App Feedback' style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--brand-card)', border: '1.5px solid var(--brand-border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(20,30,55,.10)' }}>
          <i className='ti ti-message-2' style={{ fontSize: 18, color: 'var(--brand-text-secondary)' }} />
        </button>
      </div>

      {/* Feedback modal */}
      {feedbackOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 300, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setFeedbackOpen(false)}>
          <div style={{ background: 'var(--brand-card)', borderRadius: '20px 20px 0 0', padding: 24, width: '100%', maxWidth: 480 }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: 'var(--brand-text)' }}>App Feedback</div>
            {feedbackSent ? (
              <div style={{ color: '#34d399', fontWeight: 600, textAlign: 'center', padding: '20px 0' }}>Thank you! Feedback sent.</div>
            ) : (
              <>
                <textarea value={feedbackText} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedbackText(e.target.value)} placeholder='What can be improved?' rows={4} style={{ width: '100%', borderRadius: 12, border: '1.5px solid var(--brand-border)', padding: 12, fontSize: 14, resize: 'none', fontFamily: 'inherit', background: 'var(--brand-bg)', color: 'var(--brand-text)', boxSizing: 'border-box' as const }} />
                <button onClick={async () => { setFeedbackSent(true); setTimeout(() => { setFeedbackOpen(false); setFeedbackText(''); setFeedbackSent(false); }, 1800); }} style={{ marginTop: 10, width: '100%', padding: '12px 0', borderRadius: 12, background: 'var(--brand-primary)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Send Feedback</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}