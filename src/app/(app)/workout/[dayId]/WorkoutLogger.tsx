'use client';
import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

// ─── Types ───────────────────────────────────────────────────────────────────

type SetData = { weight: string; reps: string; time: string; done: boolean };

interface Exercise {
  id: string;
  name: string;
  modality?: string | null;
  muscle_group?: string | null;
  equipment_required?: string[] | null;
  video_url?: string | null;
}

interface PrescribedExercise {
  id: string;
  sets: number;
  reps?: number | null;
  volume_value?: number | null;
  volume_unit?: string | null;
  rest_seconds?: number | null;
  notes?: string | null;
  exercises: Exercise;
}

interface Section {
  id: string;
  label: string;
  prescribed_exercises: PrescribedExercise[];
}

interface ExistingSetLog {
  prescribed_exercise_id: string;
  set_number: number;
  weight_lbs?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  completed?: boolean;
}

interface Props {
  day: { id: string; label: string };
  phase?: { id: string; label: string; program_id?: string } | null;
  program?: { id: string; name: string } | null;
  sections: Section[];
  clientId: string;
  clientName?: string | null;
  isTrainerSession?: boolean;
  existingLogId: string | null;
  existingSetLogs: ExistingSetLog[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
}

function parseSecs(str: string): number | null {
  const t = str.trim();
  if (!t) return null;
  const p = t.split(':');
  if (p.length === 2) return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1]) || 0);
  const n = parseInt(t);
  return isNaN(n) ? null : n;
}

function getYtId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  return m ? m[1] : null;
}

function todayCT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// ─── VideoLightbox ────────────────────────────────────────────────────────────

function VideoLightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const ytId = getYtId(url);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-lg px-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white font-semibold text-sm truncate flex-1 mr-3">{name}</span>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" style={{ color: 'white' }} />
          </button>
        </div>
        {ytId ? (
          <div style={{ position: 'relative', paddingTop: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full rounded-2xl"
              src={'https://www.youtube.com/embed/' + ytId + '?autoplay=1'}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          </div>
        ) : (
          <video src={url} controls className="w-full rounded-2xl" />
        )}
      </div>
    </div>
  );
}

// ─── WorkoutLogger ────────────────────────────────────────────────────────────

export default function WorkoutLogger({
  day, phase, program, sections, clientId, clientName, isTrainerSession, existingLogId, existingSetLogs,
}: Props) {
  const params = useParams();
  const scheduledWorkoutId = params.dayId as string;
  const supabase = createClient();

  const allExercises = sections.flatMap(sec =>
    sec.prescribed_exercises.map(pe => ({ ...pe, sectionLabel: sec.label }))
  );

  const [currentIdx, setCurrentIdx] = useState(0);
  const [logId, setLogId] = useState<string | null>(existingLogId);
  const [saving, setSaving] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [videoEx, setVideoEx] = useState<{ url: string; name: string } | null>(null);

  const [sets, setSets] = useState<Record<string, SetData[]>>(() => {
    const out: Record<string, SetData[]> = {};
    for (const sec of sections) {
      for (const pe of sec.prescribed_exercises) {
        const logs = existingSetLogs.filter(l => l.prescribed_exercise_id === pe.id);
        const n = Math.max(pe.sets || 1, 1);
        out[pe.id] = Array.from({ length: n }, (_, i) => {
          const ex = logs.find(l => l.set_number === i + 1);
          return {
            weight: ex?.weight_lbs?.toString() ?? '',
            reps: ex?.reps?.toString() ?? '',
            time: ex?.duration_seconds != null ? fmtTime(ex.duration_seconds) : '',
            done: ex?.completed ?? false,
          };
        });
      }
    }
    return out;
  });

  const [trackW, setTrackW] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const sec of sections)
      for (const pe of sec.prescribed_exercises) {
        const logs = existingSetLogs.filter(l => l.prescribed_exercise_id === pe.id);
        out[pe.id] = logs.length > 0 ? logs.some(l => l.weight_lbs != null) : true;
      }
    return out;
  });

  const [trackR, setTrackR] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const sec of sections)
      for (const pe of sec.prescribed_exercises) {
        const logs = existingSetLogs.filter(l => l.prescribed_exercise_id === pe.id);
        out[pe.id] = logs.length > 0 ? logs.some(l => l.reps != null) : true;
      }
    return out;
  });

  const [trackT, setTrackT] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const sec of sections)
      for (const pe of sec.prescribed_exercises) {
        const logs = existingSetLogs.filter(l => l.prescribed_exercise_id === pe.id);
        out[pe.id] = logs.length > 0 ? logs.some(l => l.duration_seconds != null) : false;
      }
    return out;
  });

  const updateSet = useCallback((peId: string, si: number, field: keyof SetData, val: string | boolean) => {
    setSets(prev => ({
      ...prev,
      [peId]: prev[peId].map((s, i) => (i === si ? { ...s, [field]: val } : s)),
    }));
  }, []);

  const ensureLog = async (): Promise<string | null> => {
    if (logId) return logId;
    const today = todayCT();
    const { data, error } = await supabase
      .from('workout_logs')
      .insert({
        day_id: day.id,
        client_id: clientId,
        log_date: today,
        started_at: new Date().toISOString(),
        status: 'in_progress',
        completed: false,
      })
      .select('id')
      .single();
    if (!error && data?.id) { setLogId(data.id); return data.id; }
    const { data: existing } = await supabase
      .from('workout_logs')
      .select('id')
      .eq('day_id', day.id)
      .eq('client_id', clientId)
      .eq('log_date', today)
      .maybeSingle();
    const id = existing?.id ?? null;
    if (id) setLogId(id);
    return id;
  };

  const logSet = async (peId: string, si: number) => {
    const wid = await ensureLog();
    if (!wid) return;
    const s = sets[peId][si];
    const usingTime = trackT[peId];
    await supabase.from('set_logs').upsert({
      workout_log_id: wid, prescribed_exercise_id: peId, client_id: clientId,
      set_number: si + 1,
      weight_lbs: trackW[peId] && s.weight ? parseFloat(s.weight) : null,
      reps: usingTime ? null : (trackR[peId] && s.reps ? parseInt(s.reps) : null),
      duration_seconds: usingTime ? parseSecs(s.time) : null,
      completed: true, logged_at: new Date().toISOString(),
    }, { onConflict: 'workout_log_id,prescribed_exercise_id,set_number' });
    updateSet(peId, si, 'done', true);
  };

  const completeWorkout = async () => {
    setSaving(true);
    const wid = await ensureLog();
    if (wid) {
      await supabase.from('workout_logs').update({
        status: 'completed', completed: true, completed_at: new Date().toISOString(),
      }).eq('id', wid);
    }
    await supabase.from('scheduled_workouts').update({ status: 'completed' }).eq('id', scheduledWorkoutId);
    setSaving(false);
    setSessionDone(true);
  };

  const totalSets = allExercises.reduce((sum, pe) => sum + (pe.sets || 1), 0);
  const doneSets = allExercises.reduce((sum, pe) => sum + ((sets[pe.id] ?? []).filter(s => s.done).length), 0);
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  if (sessionDone) {
    return (
      <div style={{ height: '100dvh', background: 'var(--brand-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand-text)', marginBottom: 8 }}>Session Complete!</h1>
        <p style={{ color: 'var(--brand-text-secondary)', fontSize: 14, marginBottom: 32 }}>
          {doneSets} sets logged · {program?.name ?? day.label}
        </p>
        <Link href={isTrainerSession ? '/clients/' + clientId : '/home'}
          style={{ display: 'block', padding: '14px 32px', borderRadius: 12, background: 'var(--brand-primary)', color: 'white', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
          Back to {isTrainerSession ? (clientName ?? 'Client') : 'Home'}
        </Link>
      </div>
    );
  }

  if (allExercises.length === 0) {
    return <div style={{ padding: 24, color: 'var(--brand-text)' }}>No exercises found for this workout.</div>;
  }

  const cur = allExercises[currentIdx];
  const peId = cur.id;
  const ytId = getYtId(cur.exercises?.video_url);
  const tW = trackW[peId] ?? true;
  const tR = trackR[peId] ?? true;
  const tT = trackT[peId] ?? false;
  const curSets = sets[peId] ?? [];

  const gridParts: string[] = ['22px'];
  if (tW) gridParts.push('1fr');
  if (tR) gridParts.push('1fr');
  if (tT) gridParts.push('1fr');
  gridParts.push('36px');
  const gridCols = gridParts.join(' ');

  return (
    <div style={{ height: '100dvh', background: 'var(--brand-bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {videoEx && <VideoLightbox url={videoEx.url} name={videoEx.name} onClose={() => setVideoEx(null)} />}

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 8px', borderBottom: '1px solid var(--brand-border)', flexShrink: 0 }}>
        <Link href={isTrainerSession ? '/clients/' + clientId : '/home'} style={{ fontSize: 13, color: 'var(--brand-text-secondary)', textDecoration: 'none' }}>← Back</Link>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--brand-text-secondary)' }}>{program?.name ?? day.label}</span>
        <span style={{ fontSize: 12, color: 'var(--brand-text-secondary)' }}>{currentIdx + 1} / {allExercises.length}</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: 'var(--brand-border)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: pct + '%', background: pct === 100 ? '#22c55e' : 'var(--brand-primary)', transition: 'width 0.3s' }} />
      </div>

      {/* Exercise header */}
      <div style={{ padding: '10px 16px 8px', borderBottom: '1px solid var(--brand-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {ytId ? (
            <button onClick={() => setVideoEx({ url: cur.exercises.video_url!, name: cur.exercises.name })}
              style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, overflow: 'hidden', position: 'relative', border: '1px solid var(--brand-border)', background: 'none', padding: 0, cursor: 'pointer' }}>
              <img src={'https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="ti ti-player-play-filled" style={{ color: 'white', fontSize: 11 }} />
              </div>
            </button>
          ) : (
            <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 10, background: 'var(--brand-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="ti ti-barbell" style={{ color: 'var(--brand-primary)', fontSize: 20 }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--brand-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur.exercises.name}</p>
            <p style={{ fontSize: 11, color: 'var(--brand-text-secondary)', marginTop: 1 }}>
              {cur.sets} sets{cur.volume_value ? ' · ' + cur.volume_value + (cur.volume_unit ?? '') : ''}{cur.exercises.muscle_group ? ' · ' + cur.exercises.muscle_group : ''}
            </p>
          </div>
          {/* W / R / T toggles */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {[
              { label: 'W', active: tW, onToggle: () => setTrackW(p => ({ ...p, [peId]: !p[peId] })) },
              { label: 'R', active: tR, onToggle: () => setTrackR(p => ({ ...p, [peId]: !p[peId] })) },
              { label: 'T', active: tT, onToggle: () => setTrackT(p => ({ ...p, [peId]: !p[peId] })) },
            ].map(({ label, active, onToggle }) => (
              <button key={label} onClick={onToggle}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11, background: active ? 'var(--brand-primary)' : 'var(--brand-card)', color: active ? 'white' : 'var(--brand-text-secondary)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sets area — no scroll, all visible */}
      <div style={{ flex: 1, padding: '6px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4, marginBottom: 5, padding: '0 2px' }}>
          <div />
          {tW && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--brand-text-secondary)', textAlign: 'center', letterSpacing: '0.06em' }}>WEIGHT</div>}
          {tR && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--brand-text-secondary)', textAlign: 'center', letterSpacing: '0.06em' }}>REPS</div>}
          {tT && <div style={{ fontSize: 9, fontWeight: 700, color: '#0EA5E9', textAlign: 'center', letterSpacing: '0.06em' }}>TIME</div>}
          <div />
        </div>
        {curSets.map((se, si) => (
          <div key={si} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 4, alignItems: 'center', marginBottom: 7, padding: '6px 8px', background: se.done ? 'rgba(34,197,94,0.07)' : 'var(--brand-card)', borderRadius: 10, border: '1px solid ' + (se.done ? 'rgba(34,197,94,0.25)' : 'var(--brand-border)') }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-text-secondary)', textAlign: 'center' }}>{si + 1}</span>
            {tW && (
              <input type="number" inputMode="decimal" placeholder="lb" value={se.weight}
                onChange={e => updateSet(peId, si, 'weight', e.target.value)}
                style={{ textAlign: 'center', width: '100%', minWidth: 0, border: '1px solid ' + (se.done ? 'rgba(34,197,94,0.25)' : 'var(--brand-border)'), borderRadius: 7, background: 'transparent', padding: '5px 2px', color: se.done ? '#22c55e' : 'var(--brand-text)', fontSize: 14, fontWeight: 600, outline: 'none' }} />
            )}
            {tR && (
              <input type="number" inputMode="numeric" placeholder="reps" value={se.reps}
                onChange={e => updateSet(peId, si, 'reps', e.target.value)}
                style={{ textAlign: 'center', width: '100%', minWidth: 0, border: '1px solid ' + (se.done ? 'rgba(34,197,94,0.25)' : 'var(--brand-border)'), borderRadius: 7, background: 'transparent', padding: '5px 2px', color: se.done ? '#22c55e' : 'var(--brand-text)', fontSize: 14, fontWeight: 600, outline: 'none' }} />
            )}
            {tT && (
              <input type="text" placeholder="0:00" value={se.time}
                onChange={e => updateSet(peId, si, 'time', e.target.value)}
                style={{ textAlign: 'center', width: '100%', minWidth: 0, border: '1px solid ' + (se.done ? 'rgba(34,197,94,0.25)' : 'rgba(14,165,233,0.4)'), borderRadius: 7, background: 'transparent', padding: '5px 2px', color: se.done ? '#22c55e' : '#0EA5E9', fontSize: 14, fontWeight: 600, outline: 'none' }} />
            )}
            <button onClick={() => logSet(peId, si)}
              style={{ width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0, background: se.done ? '#22c55e' : 'var(--brand-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className={'ti ' + (se.done ? 'ti-check' : 'ti-player-play-filled')} style={{ color: se.done ? 'white' : 'var(--brand-text-secondary)', fontSize: 14 }} />
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 16px 20px', borderTop: '1px solid var(--brand-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
          {allExercises.map((ex, i) => {
            const exAllDone = (sets[ex.id] ?? []).every(s => s.done);
            return (
              <button key={i} onClick={() => setCurrentIdx(i)}
                style={{ height: 8, width: i === currentIdx ? 20 : 8, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0, background: exAllDone ? '#22c55e' : i === currentIdx ? 'var(--brand-primary)' : 'var(--brand-border)', transition: 'all 0.2s' }} />
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <button onClick={() => setCurrentIdx(i => Math.max(0, i - 1))} disabled={currentIdx === 0}
            style={{ padding: '9px 0', borderRadius: 10, border: '1px solid var(--brand-border)', background: 'var(--brand-card)', color: 'var(--brand-text)', fontWeight: 600, fontSize: 14, cursor: currentIdx === 0 ? 'default' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1 }}>
            ← Prev
          </button>
          <button onClick={() => setCurrentIdx(i => Math.min(allExercises.length - 1, i + 1))} disabled={currentIdx === allExercises.length - 1}
            style={{ padding: '9px 0', borderRadius: 10, border: '1px solid var(--brand-border)', background: 'var(--brand-card)', color: 'var(--brand-text)', fontWeight: 600, fontSize: 14, cursor: currentIdx === allExercises.length - 1 ? 'default' : 'pointer', opacity: currentIdx === allExercises.length - 1 ? 0.4 : 1 }}>
            Next →
          </button>
        </div>
        <button onClick={completeWorkout} disabled={saving}
          style={{ width: '100%', padding: '12px 0', borderRadius: 12, border: 'none', background: pct === 100 ? '#22c55e' : 'var(--brand-primary)', color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : pct === 100 ? '✓ Complete Workout' : 'Complete Workout (' + pct + '%)'}
        </button>
      </div>
    </div>
  );
}
