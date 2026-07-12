'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricCardsProps {
  clientId: string;
  isTrainer?: boolean;
}

interface MetricRow {
  id: string;
  client_id: string;
  metric_date: string;
  weight: number | null;
  body_fat_pct: number | null;
  lean_mass: number | null;
  fat_mass: number | null;
}

interface DataPoint {
  date: string;
  value: number;
}

interface DailyMacro {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  color: string;
  lowerIsBetter: boolean;
  canLog: boolean;
}

const METRIC_CONFIGS: MetricConfig[] = [
  { key: 'weight',       label: 'Weight',    unit: 'lbs', color: 'var(--brand-primary)', lowerIsBetter: true,  canLog: true  },
  { key: 'body_fat_pct', label: 'Body Fat',  unit: '%',   color: '#e87c3e', lowerIsBetter: true,  canLog: true  },
  { key: 'lean_mass',    label: 'Lean Mass', unit: 'lbs', color: '#22c55e', lowerIsBetter: false, canLog: false },
  { key: 'fat_mass',     label: 'Fat Mass',  unit: 'lbs', color: '#e84e4e', lowerIsBetter: true,  canLog: false },
  { key: 'workouts',     label: 'Workouts',  unit: '',    color: '#8b5cf6', lowerIsBetter: false, canLog: false },
  { key: 'streak',       label: 'Streak',    unit: 'days',color: '#f59e0b', lowerIsBetter: false, canLog: false },
];

const MACRO_SERIES = [
  { key: 'kcal',    label: 'Calories', unit: '',  color: 'var(--brand-primary)' },
  { key: 'protein', label: 'Protein',  unit: 'g', color: '#22c55e' },
  { key: 'carbs',   label: 'Carbs',    unit: 'g', color: '#f59e0b' },
  { key: 'fats',    label: 'Fat',      unit: 'g', color: '#e84e4e' },
] as const;

const RANGES = [
  { label: '1w',  days: 7  },
  { label: '2w',  days: 14 },
  { label: '4w',  days: 28 },
  { label: '8w',  days: 56 },
];

// ─── Date helpers (America/Chicago) ───────────────────────────────────────────

function centralToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

function isoDaysAgo(base: string, n: number): string {
  const d = new Date(base + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}

// ─── Animated SVG Sparkline ───────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!pathRef.current || !mounted || data.length < 2) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = String(len);
    pathRef.current.style.strokeDashoffset = String(len);
    requestAnimationFrame(() => {
      if (pathRef.current) {
        pathRef.current.style.transition = 'stroke-dashoffset 0.9s ease';
        pathRef.current.style.strokeDashoffset = '0';
      }
    });
  }, [mounted, data.length]);

  if (data.length < 2) {
    return (
      <svg width="120" height="40" viewBox="0 0 120 40">
        <line x1="0" y1="20" x2="120" y2="20" stroke={color} strokeWidth="1.5" strokeDasharray="4,4" opacity="0.3" />
      </svg>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 120, H = 40, PAD = 4;

  const points = data.map((v, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - PAD * 2),
    y: H - PAD - ((v - min) / range) * (H - PAD * 2),
  }));

  // Smooth quadratic bezier path
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` Q ${cpx.toFixed(1)} ${prev.y.toFixed(1)} ${cpx.toFixed(1)} ${((prev.y + curr.y) / 2).toFixed(1)}`;
    d += ` Q ${cpx.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
  }

  const gradId = `g${color.replace('#', '')}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`}
        fill={`url(#${gradId})`}
      />
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3"
        fill={color}
      />
    </svg>
  );
}

// ─── Expanded Panel with Chart.js ─────────────────────────────────────────────

function MacroLine({ values, color, index, width, height }: { values: number[]; color: string; index: number; width: number; height: number }) {
  const pathRef = useRef<SVGPathElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!pathRef.current || !mounted || values.length < 2) return;
    const len = pathRef.current.getTotalLength();
    pathRef.current.style.strokeDasharray = String(len);
    pathRef.current.style.strokeDashoffset = String(len);
    requestAnimationFrame(() => {
      if (pathRef.current) {
        pathRef.current.style.transition = 'stroke-dashoffset 1s ease ' + (index * 0.12) + 's';
        pathRef.current.style.strokeDashoffset = '0';
      }
    });
  }, [mounted, values.length, index]);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const PAD = 6;
  const pts = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * (width - PAD * 2),
    y: height - PAD - ((v - min) / range) * (height - PAD * 2),
  }));

  let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ' Q ' + cpx.toFixed(1) + ' ' + prev.y.toFixed(1) + ' ' + cpx.toFixed(1) + ' ' + ((prev.y + curr.y) / 2).toFixed(1);
    d += ' Q ' + cpx.toFixed(1) + ' ' + curr.y.toFixed(1) + ' ' + curr.x.toFixed(1) + ' ' + curr.y.toFixed(1);
  }

  return (
    <>
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill={color} />
    </>
  );
}

function RingGauge({ value, goal, color, label, unit }: { value: number; goal: number; color: string; label: string; unit: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);
  const R = 30;
  const CIRC = 2 * Math.PI * R;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const pctLabel = goal > 0 ? Math.round((value / goal) * 100) + '%' : '—';
  const offset = mounted ? CIRC * (1 - pct) : CIRC;
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 68 }}>
      <svg width="74" height="74" viewBox="0 0 74 74" style={{ display: 'block', margin: '0 auto' }}>
        <circle cx="37" cy="37" r={R} fill="none" stroke="var(--brand-bg)" strokeWidth="7" />
        <circle cx="37" cy="37" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: '37px 37px' }} />
        <text x="37" y="42" textAnchor="middle" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--brand-text)' }}>{pctLabel}</text>
      </svg>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-text)', marginTop: 4 }}>{Math.round(value)} / {Math.round(goal)}{unit}</div>
      <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>{label}</div>
    </div>
  );
}

function MacrosCard({ data, onClose, targets }: { data: DailyMacro[]; onClose: () => void; targets: { kcal: number; protein: number; carbs: number; fats: number } | null }) {

  const avg = (k: keyof DailyMacro) =>
    data.length ? data.reduce((acc, d) => acc + (d[k] as number), 0) / data.length : 0;

  const hasData = data.length >= 1;

  return (
    <div style={{
      background: 'var(--brand-surface)',
      borderRadius: 14,
      padding: 16,
      border: '1.5px solid #0EA5E9',
      borderTop: '3px solid #0EA5E9',
      marginBottom: 10,
      animationName: 'mcFadeUp',
      animationDuration: '0.4s',
      animationTimingFunction: 'ease',
      animationFillMode: 'both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-text)' }}>Calories &amp; Macros</span>
        <span style={{ fontSize: 11, color: 'var(--brand-text-secondary)' }}>
          {hasData ? (data.length + ' day' + (data.length === 1 ? '' : 's') + ' logged · daily avg') : 'No nutrition logged this range'}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--brand-text-secondary)', lineHeight: 1, padding: 4 }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-around' }}>
        <RingGauge value={avg('kcal')} goal={targets ? targets.kcal : 0} color="#0EA5E9" label="Calories" unit="" />
        <RingGauge value={avg('protein')} goal={targets ? targets.protein : 0} color="#22c55e" label="Protein" unit="g" />
        <RingGauge value={avg('carbs')} goal={targets ? targets.carbs : 0} color="#f59e0b" label="Carbs" unit="g" />
        <RingGauge value={avg('fats')} goal={targets ? targets.fats : 0} color="#e84e4e" label="Fat" unit="g" />
      </div>
    </div>
  );
}

function ExpandedPanel({
  cfg,
  allData,
  clientId,
  onClose,
  onLogged,
}: {
  cfg: MetricConfig;
  allData: DataPoint[];
  clientId: string;
  onClose: () => void;
  onLogged: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [rangeIdx, setRangeIdx] = useState(2);
  const [showLog, setShowLog] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [logDate, setLogDate] = useState(centralToday());
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const supabase = createClient();

  const filteredData = (() => {
    const cutoffStr = isoDaysAgo(centralToday(), RANGES[rangeIdx].days);
    return allData.filter(d => d.date >= cutoffStr);
  })();

  const chartData = filteredData.length >= 2 ? filteredData : allData.slice(-10);

  const current = allData.length > 0 ? allData[allData.length - 1].value : null;
  const startVal = filteredData.length > 1 ? filteredData[0].value : null;
  const delta = current != null && startVal != null ? current - startVal : null;
  const deltaSign = delta != null ? (delta >= 0 ? '+' : '') : '';
  const deltaGood = delta != null ? (cfg.lowerIsBetter ? delta < 0 : delta > 0) : null;

  useEffect(() => {
    if (!canvasRef.current) return;

    const load = async () => {
      const { Chart, registerables } = await import('chart.js');
      Chart.register(...registerables);

      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      if (chartData.length === 0) return;

      const labels = chartData.map(d => {
        const dt = new Date(d.date + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

      chartRef.current = new Chart(canvasRef.current!, {
        type: 'line',
        plugins: [{
          id: 'cwCrosshair',
          afterDatasetsDraw(chart: any) {
            const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
            if (!act || !act.length) return;
            const x = act[0].element.x;
            const area = chart.chartArea; const c2 = chart.ctx;
            c2.save(); c2.beginPath(); c2.moveTo(x, area.top); c2.lineTo(x, area.bottom);
            c2.lineWidth = 1; c2.strokeStyle = 'rgba(128,128,128,0.45)'; c2.setLineDash([4,4]); c2.stroke(); c2.restore();
          },
        }],
        data: {
          labels,
          datasets: [{
            data: chartData.map(d => d.value),
            borderColor: cfg.color,
            backgroundColor: cfg.color + '18',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: cfg.color,
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
            tension: 0.4,
            fill: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false, axis: 'x' },
          hover: { mode: 'index', intersect: false },
          animation: { duration: 600 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => ` ${ctx.parsed.y.toFixed(1)}${cfg.unit}`,
              },
            },
          },
          scales: {
            x: {
              grid: { color: 'rgba(128,128,128,0.1)' },
              ticks: { color: '#888', font: { size: 10 } },
            },
            y: {
              grid: { color: 'rgba(128,128,128,0.1)' },
              ticks: {
                color: '#888',
                font: { size: 10 },
                callback: (v: any) => `${v}${cfg.unit}`,
              },
            },
          },
        },
      });
    };

    load();

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeIdx, cfg.color, cfg.unit]);

  const handleLog = async () => {
    if (!logValue || !logDate) return;
    setSaving(true);
    const val = parseFloat(logValue);
    await supabase.from('metrics').upsert(
      { client_id: clientId, metric_date: logDate, [cfg.key]: val },
      { onConflict: 'client_id,metric_date' }
    );
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => { setSaveSuccess(false); setShowLog(false); setLogValue(''); onLogged(); }, 800);
  };

  return (
    <div style={{
      background: 'var(--brand-surface)',
      border: `1.5px solid ${cfg.color}`,
      borderRadius: 16,
      marginBottom: 10,
      padding: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-text)' }}>{cfg.label}</span>
          {current != null && (
            <span style={{ fontSize: 22, fontWeight: 800, color: cfg.color }}>
              {current.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 500, marginLeft: 2, color: 'var(--brand-text-secondary)' }}>{cfg.unit}</span>
            </span>
          )}
          {delta != null && (
            <span style={{ fontSize: 12, fontWeight: 600, color: deltaGood ? '#22c55e' : '#ef4444' }}>
              {deltaSign}{delta.toFixed(1)}{cfg.unit}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--brand-text-secondary)', lineHeight: 1, padding: 4 }}>
          ✕
        </button>
      </div>

      {/* Range buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {RANGES.map((r, i) => (
          <button key={r.label} onClick={() => setRangeIdx(i)} style={{
            padding: '5px 12px', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 12, cursor: 'pointer',
            background: rangeIdx === i ? cfg.color : 'var(--brand-bg)',
            color: rangeIdx === i ? 'white' : 'var(--brand-text-secondary)',
            transition: 'all 0.15s',
          }}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ height: 200, position: 'relative', marginBottom: 14 }}>
        {chartData.length >= 2
          ? <canvas ref={canvasRef} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--brand-text-secondary)', fontSize: 13 }}>
              Not enough data for this range
            </div>
        }
      </div>

      {/* Log entry */}
      {cfg.canLog && (
        !showLog
          ? <button onClick={() => (cfg.key === "body_fat_pct" ? (window.location.href = "/log-bodyfat?clientId=" + clientId) : setShowLog(true))} style={{
              width: '100%', padding: '10px', borderRadius: 10,
              border: `1.5px dashed ${cfg.color}`, background: cfg.color + '10',
              color: cfg.color, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              + Log {cfg.label}
            </button>
          : <div style={{ background: 'var(--brand-bg)', borderRadius: 12, padding: 14, border: '1px solid var(--brand-border)' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                    {cfg.label} ({cfg.unit || 'value'})
                  </label>
                  <input type="number" step="0.1"
                    placeholder={cfg.key === 'body_fat_pct' ? 'e.g. 18.5' : 'e.g. 185.0'}
                    value={logValue} onChange={e => setLogValue(e.target.value)}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontSize: 14 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                  <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 8px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontSize: 13 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowLog(false); setLogValue(''); }} style={{
                  flex: 1, padding: 9, borderRadius: 9, border: '1px solid var(--brand-border)',
                  background: 'transparent', color: 'var(--brand-text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={handleLog} disabled={saving || saveSuccess || !logValue} style={{
                  flex: 2, padding: 9, borderRadius: 9, border: 'none',
                  background: saveSuccess ? '#22c55e' : cfg.color,
                  color: 'white', fontWeight: 700, fontSize: 13, cursor: !logValue ? 'default' : 'pointer',
                  opacity: !logValue ? 0.5 : 1, transition: 'background 0.2s',
                }}>
                  {saveSuccess ? '✓ Saved!' : saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MetricCards({ clientId }: MetricCardsProps) {
  const [allMetrics, setAllMetrics] = useState<MetricRow[]>([]);
  const [dailyMacros, setDailyMacros] = useState<DailyMacro[]>([]);
  const [targets, setTargets] = useState<{ kcal: number; protein: number; carbs: number; fats: number } | null>(null);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const supabase = createClient();

  const [rangeMode, setRangeMode] = useState(3);
  const [customStart, setCustomStart] = useState(isoDaysAgo(centralToday(), 28));
  const [customEnd, setCustomEnd] = useState(centralToday());

  const today = centralToday();
  const startDate = rangeMode < 4 ? isoDaysAgo(today, RANGES[rangeMode].days) : customStart;
  const endDate = rangeMode < 4 ? today : customEnd;
  const inWindow = (dateStr: string) => dateStr >= startDate && dateStr <= endDate;

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);

    const wideSince = isoDaysAgo(centralToday(), 180);

    const [
      { data: mData },
      { count: wCount },
      { data: wDates },
      { data: logData },
    ] = await Promise.all([
      supabase.from('metrics')
        .select('id, client_id, metric_date, weight, body_fat_pct, lean_mass, fat_mass')
        .eq('client_id', clientId)
        .gte('metric_date', wideSince)
        .order('metric_date', { ascending: true }),
      supabase.from('workout_logs')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .gte('log_date', wideSince + 'T00:00:00'),
      supabase.from('workout_logs')
        .select('log_date, completed, status')
        .eq('client_id', clientId)
        .order('log_date', { ascending: false }),
      supabase.from('meal_adherence_logs')
        .select('log_date, adherence, meal_id, est_kcal, est_protein, est_carbs, est_fats, trainer_macro_override')
        .eq('client_id', clientId)
        .gte('log_date', wideSince)
        .order('log_date', { ascending: true }),
    ]);

    setAllMetrics(mData || []);
    setWorkoutCount(wCount || 0);

    if (wDates && wDates.length > 0) {
      const uniqueDates = [
        ...new Set((wDates as any[]).filter((w: any) => w.completed || w.status).map((w: any) => w.log_date).filter(Boolean)),
      ].sort().reverse() as string[];
      let streak = 0;
      for (let i = 0; i < uniqueDates.length; i++) {
        const expected = isoDaysAgo(centralToday(), i);
        if (uniqueDates[i] === expected) streak++;
        else break;
      }
      setStreakDays(streak);
    } else {
      setStreakDays(0);
    }

    const logs = (logData as any[]) || [];
    const mealIds = [...new Set(logs.map(l => l.meal_id).filter(Boolean))] as string[];

    const plannedByMeal: Record<string, { kcal: number; protein: number; carbs: number; fats: number }> = {};
    if (mealIds.length > 0) {
      const { data: items } = await supabase
        .from('meal_items')
        .select('meal_id, protein, carbs, fats')
        .in('meal_id', mealIds);
      for (const it of (items as any[]) || []) {
        const p = Number(it.protein) || 0, c = Number(it.carbs) || 0, f = Number(it.fats) || 0;
        const cur = plannedByMeal[it.meal_id] || { kcal: 0, protein: 0, carbs: 0, fats: 0 };
        cur.protein += p; cur.carbs += c; cur.fats += f; cur.kcal += 4 * p + 4 * c + 9 * f;
        plannedByMeal[it.meal_id] = cur;
      }
    }

    const macroForLog = (l: any) => {
      const ov = l.trainer_macro_override;
      if (ov && (ov.protein != null || ov.carbs != null || ov.fats != null || ov.kcal != null)) {
        const p = Number(ov.protein) || 0, c = Number(ov.carbs) || 0, f = Number(ov.fats) || 0;
        return { kcal: ov.kcal != null ? Number(ov.kcal) : 4 * p + 4 * c + 9 * f, protein: p, carbs: c, fats: f };
      }
      const hasEst = l.est_protein != null || l.est_carbs != null || l.est_fats != null || l.est_kcal != null;
      if (hasEst) {
        const p = Number(l.est_protein) || 0, c = Number(l.est_carbs) || 0, f = Number(l.est_fats) || 0;
        return { kcal: l.est_kcal != null ? Number(l.est_kcal) : 4 * p + 4 * c + 9 * f, protein: p, carbs: c, fats: f };
      }
      const frac = (() => {
        switch (String(l.adherence || '').toLowerCase()) {
          case 'full': return 1;
          case '3/4': return 0.75;
          case '1/2': return 0.5;
          case 'partial': return 0.5;
          case 'skipped': return 0;
          case 'off-plan': return 0;
          default: return 1;
        }
      })();
      if (frac > 0 && l.meal_id && plannedByMeal[l.meal_id]) {
        const pl = plannedByMeal[l.meal_id];
        const p = pl.protein * frac, c = pl.carbs * frac, f = pl.fats * frac;
        return { kcal: 4 * p + 4 * c + 9 * f, protein: p, carbs: c, fats: f };
      }
      return { kcal: 0, protein: 0, carbs: 0, fats: 0 };
    };

    const byDate: Record<string, DailyMacro> = {};
    for (const l of logs) {
      const dt = l.log_date;
      if (!dt) continue;
      const m = macroForLog(l);
      const cur = byDate[dt] || { date: dt, kcal: 0, protein: 0, carbs: 0, fats: 0 };
      cur.kcal += m.kcal; cur.protein += m.protein; cur.carbs += m.carbs; cur.fats += m.fats;
      byDate[dt] = cur;
    }
    const daily = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    daily.forEach(dd => {
      dd.kcal = Math.round(dd.kcal);
      dd.protein = Math.round(dd.protein);
      dd.carbs = Math.round(dd.carbs);
      dd.fats = Math.round(dd.fats);
    });
    setDailyMacros(daily);

    const { data: tgt } = await supabase
      .from('macro_targets')
      .select('calories, protein, carbs, fats, effective_date')
      .eq('client_id', clientId)
      .lte('effective_date', centralToday())
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    setTargets(tgt ? { kcal: Number(tgt.calories) || 0, protein: Number(tgt.protein) || 0, carbs: Number(tgt.carbs) || 0, fats: Number(tgt.fats) || 0 } : null);

    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const getDataPoints = (key: string): DataPoint[] => {
    if (key === 'workouts' || key === 'streak') return [];
    return allMetrics
      .filter(m => m[key as keyof MetricRow] != null && inWindow(m.metric_date))
      .map(m => ({ date: m.metric_date, value: Number(m[key as keyof MetricRow]) }));
  };

  const getSummary = (key: string) => {
    if (key === 'workouts') return { current: String(workoutCount), change: null as string | null, changeNum: null as number | null };
    if (key === 'streak') return { current: streakDays > 0 ? String(streakDays) : '—', change: null as string | null, changeNum: null as number | null };
    const pts = getDataPoints(key);
    if (pts.length === 0) return { current: '—', change: null as string | null, changeNum: null as number | null };
    const cur = pts[pts.length - 1].value;
    const start = pts[0].value;
    const diff = cur - start;
    return { current: cur.toFixed(1), change: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`, changeNum: diff };
  };

  if (loading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {METRIC_CONFIGS.map((_, i) => (
          <div key={i} style={{ background: 'var(--brand-surface)', borderRadius: 12, height: 110, border: '1px solid var(--brand-border)', opacity: 0.4 }} />
        ))}
      </div>
    );
  }

  const macrosInWindow = dailyMacros.filter(d => inWindow(d.date));

  return (
    <>
      <style>{`
        @keyframes mcFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Global range control — drives every chart at once */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {RANGES.map((r, i) => (
            <button key={r.label} onClick={() => setRangeMode(i)} style={{
              padding: '6px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              background: rangeMode === i ? 'var(--brand-primary)' : 'var(--brand-bg)',
              color: rangeMode === i ? 'white' : 'var(--brand-text-secondary)',
              transition: 'all 0.15s',
            }}>
              {r.label}
            </button>
          ))}
          <button onClick={() => setRangeMode(4)} style={{
            padding: '6px 14px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            background: rangeMode === 4 ? 'var(--brand-primary)' : 'var(--brand-bg)',
            color: rangeMode === 4 ? 'white' : 'var(--brand-text-secondary)',
            transition: 'all 0.15s',
          }}>
            Custom
          </button>
        </div>

        {rangeMode === 4 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>From</label>
              <input type="date" value={customStart} max={customEnd} onChange={e => setCustomStart(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, display: 'block', marginBottom: 4 }}>To</label>
              <input type="date" value={customEnd} min={customStart} max={today} onChange={e => setCustomEnd(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--brand-border)', background: 'var(--brand-surface)', color: 'var(--brand-text)', fontSize: 13 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Expanded panel */}
      {expandedKey === 'macros' && (
        <MacrosCard data={macrosInWindow} onClose={() => setExpandedKey(null)} targets={targets} />
      )}
      {expandedKey && expandedKey !== 'macros' && (() => {
        const cfg = METRIC_CONFIGS.find(c => c.key === expandedKey);
        if (!cfg) return null;
        return (
          <ExpandedPanel
            cfg={cfg}
            allData={getDataPoints(expandedKey)}
            clientId={clientId}
            onClose={() => setExpandedKey(null)}
            onLogged={() => setRefreshKey(k => k + 1)}
          />
        );
      })()}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {macrosInWindow.length > 0 && (
          <div
            onClick={() => setExpandedKey(expandedKey === 'macros' ? null : 'macros')}
            style={{
              background: 'var(--brand-surface)',
              borderRadius: 12,
              padding: '12px 14px',
              borderTop: '3px solid #0EA5E9',
              border: expandedKey === 'macros' ? '1.5px solid #0EA5E9' : '1.5px solid #0EA5E966',
              borderTopWidth: 3,
              cursor: 'pointer',
              transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
              animationName: 'mcFadeUp',
              animationDuration: '0.4s',
              animationTimingFunction: 'ease',
              animationFillMode: 'both',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, marginBottom: 4 }}>
              Calories
            </div>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {([
                { k: 'kcal', label: 'Cal', color: '#0EA5E9', unit: '' },
                { k: 'protein', label: 'P', color: '#22c55e', unit: 'g' },
                { k: 'carbs', label: 'C', color: '#f59e0b', unit: 'g' },
                { k: 'fats', label: 'F', color: '#e84e4e', unit: 'g' },
              ] as const).map(b => {
                const avgv = macrosInWindow.length ? macrosInWindow.reduce((s, dm) => s + (dm[b.k] as number), 0) / macrosInWindow.length : 0;
                const tgt = targets ? (targets[b.k as 'kcal' | 'protein' | 'carbs' | 'fats'] || 0) : 0;
                const pct = tgt > 0 ? avgv / tgt : 0;
                return (
                  <div key={b.k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 22, fontSize: 9, fontWeight: 700, color: b.color }}>{b.label}</span>
                    <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'var(--brand-bg)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.min(100, Math.round(pct * 100)) + '%', background: b.color, borderRadius: 7, transition: 'width 0.6s ease' }} />
                      <span style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'var(--brand-text)' }}>{tgt > 0 ? Math.round(pct * 100) + '%' : '—'}</span>
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 600, color: 'var(--brand-text-secondary)', minWidth: 42, textAlign: 'right' }}>{Math.round(avgv)}/{Math.round(tgt)}{b.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {METRIC_CONFIGS.map((cfg, idx) => {
          const { current, change, changeNum } = getSummary(cfg.key);
          const sparkData = getDataPoints(cfg.key).map(d => d.value);
          const isActive = expandedKey === cfg.key;
          const deltaGood = changeNum != null ? (cfg.lowerIsBetter ? changeNum < 0 : changeNum > 0) : null;

          return (
            <div
              key={cfg.key}
              onClick={() => setExpandedKey(isActive ? null : cfg.key)}
              style={{
                background: 'var(--brand-surface)',
                borderRadius: 12,
                padding: '12px 14px',
                borderTop: `3px solid ${cfg.color}`,
                border: isActive ? `1.5px solid ${cfg.color}` : `1.5px solid ${cfg.color}66`,
                borderTopWidth: 3,
                cursor: 'pointer',
                transform: isActive ? 'scale(1.01)' : undefined,
                transition: 'transform 0.15s, border-color 0.15s, box-shadow 0.15s',
                boxShadow: isActive ? `0 4px 20px ${cfg.color}25` : undefined,
                animationName: 'mcFadeUp',
                animationDuration: '0.4s',
                animationTimingFunction: 'ease',
                animationFillMode: 'both',
                animationDelay: `${idx * 0.05}s`,
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--brand-text-secondary)', fontWeight: 600, marginBottom: 4 }}>
                {cfg.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--brand-text)', lineHeight: 1.1 }}>
                {current}
                {cfg.unit && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--brand-text-secondary)', marginLeft: 2 }}>{cfg.unit}</span>
                )}
              </div>
              {change && changeNum != null && (
                <div style={{ fontSize: 11, fontWeight: 600, marginTop: 3, color: deltaGood ? '#22c55e' : '#ef4444' }}>
                  {change}{cfg.unit ? ' ' + cfg.unit : ''}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Sparkline data={sparkData} color={cfg.color} />
              </div>
            </div>
          );
        })}

      </div>
    </>
  );
}
