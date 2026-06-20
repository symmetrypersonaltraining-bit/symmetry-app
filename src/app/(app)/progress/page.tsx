'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface MetricRow {
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

const RANGES = [
  { label: '1wk', days: 7 },
  { label: '2wk', days: 14 },
  { label: '4wk', days: 28 },
  { label: '8wk', days: 56 },
];

const METRIC_CONFIGS = [
  { key: 'weight', label: 'Weight', unit: 'lbs', color: '#0F4C81', border: '#0F4C81' },
  { key: 'body_fat_pct', label: 'Body Fat', unit: '%', color: '#e87c3e', border: '#e87c3e' },
  { key: 'lean_mass', label: 'Lean Mass', unit: 'lbs', color: '#22c55e', border: '#22c55e' },
  { key: 'fat_mass', label: 'Fat Mass', unit: 'lbs', color: '#e84e4e', border: '#e84e4e' },
  { key: 'workouts', label: 'Workouts', unit: '', color: '#8b5cf6', border: '#8b5cf6' },
  { key: 'streak', label: 'Streak', unit: 'days', color: '#f59e0b', border: '#f59e0b' },
  { key: 'avg_cardio', label: 'Avg Cardio', unit: 'min', color: '#06b6d4', border: '#06b6d4' },
];

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <svg width="80" height="30" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FullChart({ data, color, label, unit, onClose }: {
  data: { date: string; value: number }[];
  color: string; label: string; unit: string; onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; value: number } | null>(null);
  
  if (data.length < 2) return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--brand-surface)',borderRadius:16,padding:24,minWidth:320}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:'center',color:'var(--brand-text-secondary)'}}>Not enough data</div>
        <button onClick={onClose} style={{marginTop:12,width:'100%',padding:8,borderRadius:8,border:'1px solid var(--brand-border)',background:'transparent',color:'var(--brand-text)',cursor:'pointer'}}>Close</button>
      </div>
    </div>
  );

  const W = 320, H = 160, PAD = 24;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const toX = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const pts = data.map((d, i) => `${toX(i)},${toY(d.value)}`).join(' ');

  const handleMouse = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const idx = Math.round(((mx - PAD) / (W - PAD * 2)) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setTooltip({ x: toX(clamped), y: toY(data[clamped].value), date: data[clamped].date, value: data[clamped].value });
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={onClose}>
      <div style={{background:'var(--brand-surface)',borderRadius:16,padding:20,minWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <span style={{fontWeight:700,color:'var(--brand-text)',fontSize:16}}>{label}</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'var(--brand-text-secondary)'}}>✕</button>
        </div>
        <svg ref={svgRef} width={W} height={H} onMouseMove={handleMouse} onMouseLeave={() => setTooltip(null)} style={{cursor:'crosshair'}}>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {tooltip && <>
            <circle cx={tooltip.x} cy={tooltip.y} r={5} fill={color} />
            <line x1={tooltip.x} y1={PAD} x2={tooltip.x} y2={H - PAD} stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
          </>}
          <text x={PAD} y={PAD - 6} fontSize={10} fill="var(--brand-text-secondary)">{max.toFixed(1)}{unit}</text>
          <text x={PAD} y={H - PAD + 14} fontSize={10} fill="var(--brand-text-secondary)">{min.toFixed(1)}{unit}</text>
        </svg>
        {tooltip && (
          <div style={{textAlign:'center',fontSize:12,color:'var(--brand-text-secondary)'}}>
            {tooltip.date}: <strong style={{color:'var(--brand-text)'}}>{tooltip.value.toFixed(1)}{unit}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const [rangeIdx, setRangeIdx] = useState(2);
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [workoutCounts, setWorkoutCounts] = useState<number>(0);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const days = RANGES[rangeIdx].days;
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString().split('T')[0];

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const [{ data: mData }, { count: wCount }] = await Promise.all([
        supabase.from('metrics').select('metric_date,weight,body_fat_pct,lean_mass,fat_mass')
          .eq('client_id', user.id).gte('metric_date', sinceStr).order('metric_date'),
        supabase.from('workout_logs').select('id', { count: 'exact', head: true })
          .eq('client_id', user.id).gte('logged_at', sinceStr),
      ]);

      setMetrics(mData || []);
      setWorkoutCounts(wCount || 0);
      setLoading(false);
    };
    load();
  }, [rangeIdx]);

  const getMetricData = (key: string): { date: string; value: number }[] => {
    if (key === 'workouts' || key === 'streak' || key === 'avg_cardio') return [];
    return metrics
      .filter(m => m[key as keyof MetricRow] != null)
      .map(m => ({ date: m.metric_date, value: Number(m[key as keyof MetricRow]) }));
  };

  const getCurrentAndChange = (key: string): { current: string; change: string } => {
    const data = getMetricData(key);
    if (key === 'workouts') return { current: String(workoutCounts), change: '' };
    if (key === 'streak' || key === 'avg_cardio') return { current: '—', change: '' };
    if (data.length === 0) return { current: '—', change: '' };
    const cur = data[data.length - 1].value;
    const start = data[0].value;
    const diff = cur - start;
    const sign = diff >= 0 ? '+' : '';
    return { current: cur.toFixed(1), change: `${sign}${diff.toFixed(1)}` };
  };

  const expandedConfig = expandedMetric ? METRIC_CONFIGS.find(m => m.key === expandedMetric) : null;
  const expandedData = expandedMetric ? getMetricData(expandedMetric) : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-bg)' }}>
      <div className="page-header page-header-progress">
        <span style={{ fontSize: 20 }}>📈</span>
        <span style={{ fontWeight: 700, fontSize: 17 }}>Progress</span>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
        {RANGES.map((r, i) => (
          <button key={r.label} onClick={() => setRangeIdx(i)}
            style={{
              flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontWeight: 600,
              fontSize: 12, cursor: 'pointer',
              background: rangeIdx === i ? 'var(--brand-primary)' : 'var(--brand-surface)',
              color: rangeIdx === i ? 'white' : 'var(--brand-text-secondary)',
            }}>
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--brand-text-secondary)' }}>Loading...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '0 16px 20px' }}>
          {METRIC_CONFIGS.map((cfg, idx) => {
            const { current, change } = getCurrentAndChange(cfg.key);
            const sparkData = getMetricData(cfg.key).map(d => d.value);
            const isPositive = change.startsWith('+');
            return (
              <div key={cfg.key} className="card-hover card-animate"
                style={{
                  background: 'var(--brand-surface)', borderRadius: 12, padding: '12px 14px',
                  borderTop: `3px solid ${cfg.border}`, cursor: 'pointer',
                  animationDelay: `${idx * 0.05}s`,
                }}
                onClick={() => setExpandedMetric(cfg.key)}>
                <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, marginBottom: 4 }}>{cfg.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-text)', lineHeight: 1.1 }}>
                  {current}<span style={{ fontSize: 11, fontWeight: 500, color: 'var(--brand-text-secondary)', marginLeft: 2 }}>{cfg.unit}</span>
                </div>
                {change && (
                  <div style={{ fontSize: 11, color: isPositive ? '#22c55e' : '#ef4444', fontWeight: 600, marginTop: 2 }}>
                    {change} {cfg.unit}
                  </div>
                )}
                <div style={{ marginTop: 8 }}>
                  <Sparkline data={sparkData} color={cfg.color} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expandedMetric && expandedConfig && (
        <FullChart
          data={expandedData}
          color={expandedConfig.color}
          label={expandedConfig.label}
          unit={expandedConfig.unit}
          onClose={() => setExpandedMetric(null)}
        />
      )}
    </div>
  );
}
