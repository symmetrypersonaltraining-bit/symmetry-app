'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

interface Appointment {
  id: string;
  client_id: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  title?: string;
  color?: string;
  recurrence_group?: string;
  gcal_event_id?: string;
}

interface Client {
  id: string;
  full_name: string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#2563eb',
  completed: '#16a34a',
  cancelled: '#ea580c',
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 5);

function getWeekDays(base: Date): Date[] {
  const day = base.getDay();
  const monday = new Date(base);
  monday.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function fmtTime(dt: string) {
  const d = new Date(dt);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${ampm}`;
}

export default function HomePage() {
  const [weekBase, setWeekBase] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [actionAppt, setActionAppt] = useState<Appointment | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ day: string; hour: number } | null>(null);
  const [newClientId, setNewClientId] = useState('');
  const [newDate, setNewDate] = useState(fmtDate(new Date()));
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('10:00');
  const [newRepeat, setNewRepeat] = useState('none');
  const [newUntil, setNewUntil] = useState('4wk');
  const [saving, setSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const supabase = createClient();
  const weekDays = getWeekDays(weekBase);
  const weekStart = fmtDate(weekDays[0]);
  const weekEnd = fmtDate(weekDays[6]);

  const fetchAppointments = async () => {
    const [{ data: apts }, { data: cls }] = await Promise.all([
      supabase.from('appointments').select('*').gte('start_time', weekStart + 'T00:00:00').lte('start_time', weekEnd + 'T23:59:59').order('start_time'),
      supabase.from('clients').select('id, full_name').order('full_name'),
    ]);
    setAppointments(apts || []);
    setClients(cls || []);
  };

  useEffect(() => {
    fetchAppointments();
  }, [weekStart, weekEnd]);

  const getApptForSlot = (dayStr: string, hour: number) =>
    appointments.filter(a => {
      const d = new Date(a.start_time);
      return fmtDate(d) === dayStr && d.getHours() === hour;
    });

  const saveAppointment = async () => {
    if (!newClientId || !newDate || !newStart || !newEnd) return;
    setSaving(true);
    const startDt = `${newDate}T${newStart}:00`;
    const endDt = `${newDate}T${newEnd}:00`;
    const client = clients.find(c => c.id === newClientId);
    await supabase.from('appointments').insert({ client_id: newClientId, start_time: startDt, end_time: endDt, status: 'scheduled' });
    // Push to Google Calendar
    try {
      await fetch('/api/gcal-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          event: {
            title: client?.full_name || 'Session',
            start: startDt,
            end: endDt,
            client_name: client?.full_name || 'Session',
          },
        }),
      });
    } catch {}
    setSaving(false);
    setShowAddModal(false);
    setWeekBase(new Date(weekBase));
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('appointments').update({ status }).eq('id', id);
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: status as Appointment['status'] } : a));
    setActionAppt(null);
  };

  const cancelAppt = async (id: string, mode: 'single' | 'following' | 'all') => {
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;
    if (mode === 'single') {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
      // Delete from Google Calendar
      if (appt.gcal_event_id) {
        try {
          await fetch('/api/gcal-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', event: { gcal_event_id: appt.gcal_event_id } }),
          });
        } catch {}
      }
    } else if (mode === 'all' && appt.recurrence_group) {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('recurrence_group', appt.recurrence_group);
    } else if (mode === 'following' && appt.recurrence_group) {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('recurrence_group', appt.recurrence_group).gte('start_time', appt.start_time);
    } else {
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id);
      if (appt.gcal_event_id) {
        try {
          await fetch('/api/gcal-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', event: { gcal_event_id: appt.gcal_event_id } }),
          });
        } catch {}
      }
    }
    setAppointments(prev => prev.map(a => a.id === id || (mode !== 'single' && a.recurrence_group === appt.recurrence_group) ? { ...a, status: 'cancelled' } : a));
    setActionAppt(null);
  };

  const handleGCalSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/gcal-sync', { method: 'POST' });
      const data = await res.json();
      if (data.synced !== undefined) {
        toast.success(`Synced ${data.synced} sessions from Google Calendar`);
        await fetchAppointments();
      } else {
        toast.error('Sync failed: ' + (data.error || 'Unknown error'));
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = fmtDate(new Date());

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)' }}>
      <div className="page-header page-header-home" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>📅</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>Schedule</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleGCalSync}
            disabled={isSyncing}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 10px', color: 'white', fontWeight: 600, fontSize: 12, cursor: isSyncing ? 'default' : 'pointer', opacity: isSyncing ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 4 }}
            title="Sync from Google Calendar"
          >
            <i className={`ti ti-refresh${isSyncing ? ' spin' : ''}`} style={{ fontSize: 14 }}></i>
            {isSyncing ? ' Syncing...' : ' Sync GCal'}
          </button>
          <button onClick={() => setShowAddModal(true)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 12px', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            + Add Session
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <button onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--brand-text)' }}>&#8249;</button>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand-text)' }}>
          {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} &#8211; {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <button onClick={() => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--brand-text)' }}>&#8250;</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 600 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', borderBottom: '1px solid var(--brand-border)' }}>
            <div />
            {weekDays.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '4px 2px', fontSize: 11, fontWeight: 600,
                color: fmtDate(d) === today ? 'var(--brand-primary)' : 'var(--brand-text-secondary)' }}>
                <div>{DAY_LABELS[i]}</div>
                <div style={{ fontSize: 14, fontWeight: fmtDate(d) === today ? 800 : 400 }}>{d.getDate()}</div>
              </div>
            ))}
          </div>
          <div style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
            {HOURS.map(hour => (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', borderBottom: '1px solid var(--brand-border)', minHeight: 56 }}>
                <div style={{ fontSize: 10, color: 'var(--brand-text-secondary)', padding: '4px 4px 0', textAlign: 'right' }}>
                  {hour % 12 || 12}{hour < 12 ? 'a' : 'p'}
                </div>
                {weekDays.map((d, di) => {
                  const dayStr = fmtDate(d);
                  const slotApts = getApptForSlot(dayStr, hour);
                  const isHovered = hoveredSlot?.day === dayStr && hoveredSlot?.hour === hour;
                  return (
                    <div key={di} style={{ borderLeft: '1px solid var(--brand-border)', padding: 2, position: 'relative', minHeight: 56 }}
                      onMouseEnter={() => setHoveredSlot({ day: dayStr, hour })}
                      onMouseLeave={() => setHoveredSlot(null)}
                      onClick={() => { if (slotApts.length === 0) { setNewDate(dayStr); setNewStart(`${String(hour).padStart(2,'0')}:00`); setNewEnd(`${String(hour+1).padStart(2,'0')}:00`); setShowAddModal(true); } }}>
                      {slotApts.length === 0 && isHovered && (
                        <div style={{ position: 'absolute', inset: 2, border: '1.5px dashed #2563eb', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#2563eb', cursor: 'pointer', background: 'rgba(37,99,235,0.04)' }}>
                          + Add
                        </div>
                      )}
                      {slotApts.map(apt => (
                        <div key={apt.id} onClick={e => { e.stopPropagation(); setActionAppt(apt); }}
                          style={{ background: STATUS_COLORS[apt.status] || '#2563eb', borderRadius: 5, padding: '2px 5px', fontSize: 10, color: 'white', fontWeight: 600, cursor: 'pointer', marginBottom: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {apt.title || fmtTime(apt.start_time)} {clients.find(c => c.id === apt.client_id)?.full_name?.split(' ')[0] || ''}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {actionAppt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setActionAppt(null)}>
          <div style={{ background: 'var(--brand-surface)', borderRadius: '18px 18px 0 0', width: '100%', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--brand-border)', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ fontWeight: 700, color: 'var(--brand-text)', marginBottom: 12 }}>
              {fmtTime(actionAppt.start_time)} &#8212; {clients.find(c => c.id === actionAppt.client_id)?.full_name || 'Session'}
            </div>
            {['scheduled', 'completed', 'cancelled'].map(s => (
              <button key={s} onClick={() => updateStatus(actionAppt.id, s)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', color: STATUS_COLORS[s], fontWeight: actionAppt.status === s ? 700 : 400, fontSize: 14, borderBottom: '1px solid var(--brand-border)' }}>
                Mark as {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--brand-text-secondary)', marginBottom: 6 }}>Cancel:</div>
            {(['single', 'following', 'all'] as const).map((mode, i) => (
              <button key={mode} onClick={() => cancelAppt(actionAppt.id, mode)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}>
                {['This session only', 'This + following', 'Entire series'][i]}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          onClick={() => setShowAddModal(false)}>
          <div style={{ background: 'var(--brand-surface)', borderRadius: '18px 18px 0 0', width: '100%', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, background: 'var(--brand-border)', borderRadius: 2, margin: '0 auto 14px' }} />
            <div style={{ fontWeight: 700, color: 'var(--brand-text)', fontSize: 15, marginBottom: 14 }}>Add Session</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <select value={newClientId} onChange={e => setNewClientId(e.target.value)}
                style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input type="time" value={newStart} onChange={e => setNewStart(e.target.value)}
                  style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }} />
                <input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)}
                  style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }} />
              </div>
              <select value={newRepeat} onChange={e => setNewRepeat(e.target.value)}
                style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }}>
                <option value="none">No repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
              </select>
              {newRepeat !== 'none' && (
                <select value={newUntil} onChange={e => setNewUntil(e.target.value)}
                  style={{ padding: '9px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-bg)', color: 'var(--brand-text)', fontSize: 13 }}>
                  <option value="4wk">4 weeks</option>
                  <option value="8wk">8 weeks</option>
                  <option value="indefinite">Indefinitely</option>
                </select>
              )}
              <button onClick={saveAppointment} disabled={saving}
                style={{ padding: 11, borderRadius: 10, background: 'var(--brand-primary)', color: 'white', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : 'Save Session'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
