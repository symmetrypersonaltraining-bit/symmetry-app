'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import ClientDashboard from '../home/ClientDashboard';

const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';

function MacroRing({ pct, color }: { pct: number; color: string }) {
  const r = 54, cx = 64, cy = 64;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct, 1) * circ;
  return (
    <svg width={128} height={128}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--brand-border)" strokeWidth={10} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 1s ease' }} />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontWeight={800} fill="var(--brand-text)">{Math.round(pct * 100)}%</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="var(--brand-text-secondary)">calories</text>
    </svg>
  );
}

function MacroSection({ clientId }: { clientId: string }) {
  const [macros, setMacros] = useState<{ calories: number; protein: number; carbs: number; fats: number } | null>(null);
  const [targets, setTargets] = useState<{ calories: number; protein: number; carbs: number; fats: number } | null>(null);
  const [meals, setMeals] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().split('T')[0];
      const [{ data: mData }, { data: tData }, { count }] = await Promise.all([
        supabase.from('macro_logs').select('calories,protein,carbs,fats').eq('client_id', clientId).eq('log_date', today).maybeSingle(),
        supabase.from('macro_targets').select('calories,protein,carbs,fats').eq('client_id', clientId).maybeSingle(),
        supabase.from('meal_adherence_logs').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('log_date', today),
      ]);
      if (mData) setMacros(mData);
      if (tData) setTargets(tData);
      setMeals(count || 0);
    };
    load();
  }, [clientId]);

  const calPct = (macros?.calories || 0) / (targets?.calories || 2000);

  return (
    <div style={{ padding: '0 16px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-text)', marginBottom: 12 }}>Today&apos;s Nutrition</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        <MacroRing pct={calPct} color="#0F4C81" />
        <div>
          <div style={{ fontSize: 13, color: 'var(--brand-text)', fontWeight: 600 }}>{macros?.calories || 0} / {targets?.calories || '—'} kcal</div>
          <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>calories today</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {[
          { label: 'Protein', value: macros?.protein || 0, target: targets?.protein, unit: 'g', color: '#0F4C81' },
          { label: 'Carbs', value: macros?.carbs || 0, target: targets?.carbs, unit: 'g', color: '#f59e0b' },
          { label: 'Fats', value: macros?.fats || 0, target: targets?.fats, unit: 'g', color: '#ef4444' },
          { label: 'Meals', value: meals, target: null, unit: '', color: '#22c55e' },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--brand-surface)', borderRadius: 10, padding: '10px 12px', borderLeft: `3px solid ${item.color}` }}>
            <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--brand-text)' }}>
              {item.value}{item.unit && <span style={{ fontSize: 10, fontWeight: 500 }}> {item.unit}</span>}
            </div>
            {item.target && <div style={{ fontSize: 10, color: 'var(--brand-text-secondary)' }}>of {item.target}{item.unit}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ClientPreviewPage() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [clientRecord, setClientRecord] = useState<{ id: string; name: string } | null>(null);
  const [todayWorkout, setTodayWorkout] = useState<any>(null);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalScheduled, setTotalScheduled] = useState(0);
  const [recentWorkouts, setRecentWorkouts] = useState<any[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [weekWorkouts, setWeekWorkouts] = useState<{ date: string; completed: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser || authUser.email !== TRAINER_EMAIL) {
        window.location.href = '/home';
        return;
      }
      setUser(authUser);
      const { data: cr } = await supabase.from('clients').select('id, name').ilike('name', '%Dustin%').maybeSingle();
      setClientRecord(cr);
      if (!cr) { setLoading(false); return; }
      const today = new Date().toISOString().split('T')[0];
      const [{ data: tw }, { data: rs }, { data: mh }, { data: rw }] = await Promise.all([
        supabase.from('scheduled_workouts').select('id, status, days(label, phase_id, phases(label, programs(name)))').eq('client_id', cr.id).eq('scheduled_date', today).maybeSingle(),
        supabase.from('scheduled_workouts').select('id, scheduled_date, status').eq('client_id', cr.id).gte('scheduled_date', (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]; })()).lte('scheduled_date', today).order('scheduled_date', { ascending: false }),
        supabase.from('metrics').select('metric_date, weight, body_fat_pct, lean_mass, fat_mass').eq('client_id', cr.id).order('metric_date', { ascending: false }).limit(10),
        supabase.from('scheduled_workouts').select('id, scheduled_date, status, days(label)').eq('client_id', cr.id).eq('status', 'completed').order('scheduled_date', { ascending: false }).limit(5),
      ]);
      setTodayWorkout(tw); setMetrics((mh || []).reverse()); setRecentWorkouts(rw || []);
      const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
      const thirtyStr = thirtyAgo.toISOString().split('T')[0];
      const recent30 = (rs || []).filter((w: any) => w.scheduled_date >= thirtyStr);
      setTotalScheduled(recent30.length);
      setCompletedCount(recent30.filter((w: any) => w.status === 'completed').length);
      const sorted = [...(rs || [])].sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));
      const seenDates = new Set<string>();
      for (const w of sorted) { if (w.status === 'completed') seenDates.add(w.scheduled_date); }
      const completedDates = Array.from(seenDates).sort().reverse() as string[];
      let streak = 0;
      if (completedDates.length > 0) {
        const daysDiff = Math.floor((new Date(today).getTime() - new Date(completedDates[0]).getTime()) / 86400000);
        if (daysDiff <= 1) {
          for (const d of completedDates) {
            const expected = new Date(completedDates[0]); expected.setDate(expected.getDate() - streak);
            if (streak === 0) { streak++; } else if (d === expected.toISOString().split('T')[0]) { streak++; } else break;
          }
        }
      }
      setStreakDays(streak);
      const todayDow = new Date().getDay(); const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - todayDow);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const weekEndStr = new Date(weekStart.getTime() + 6 * 86400000).toISOString().split('T')[0];
      setWeekWorkouts((rs || []).filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr).map((w: any) => ({ date: w.scheduled_date, completed: w.status === 'completed' })));
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--brand-text-secondary)' }}>Loading preview...</div>;
  if (!clientRecord) return <div className="p-6 text-center"><p style={{ color: 'var(--brand-text-secondary)' }}>No client record found for your account. Ask Claude to create one.</p></div>;

  const firstName = (clientRecord.name || '').split(' ')[0];
  return (
    <div>
      <ClientDashboard firstName={firstName} todayWorkout={todayWorkout} metrics={metrics} completedCount={completedCount} totalScheduled={totalScheduled} recentWorkouts={recentWorkouts} streakDays={streakDays} weekWorkouts={weekWorkouts} basePath="/client-preview" />
      <MacroSection clientId={user?.id || ''} />
    </div>
  );
}
