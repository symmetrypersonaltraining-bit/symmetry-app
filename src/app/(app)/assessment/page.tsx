'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { startDictation } from '@/lib/dictation';

// \u2500\u2500\u2500 Types \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

interface AssessmentData {
  // Personal Info
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;

  // Medical
  medical_clearance: boolean;
  has_pain: boolean;
  current_injuries: string;
  chronic_conditions: string;
  medications: string;
  pain_location: string;
  pain_onset: string;
  hip_issues: boolean;
  prior_surgeries: string;

  // OHSA
  feet_turn_out: boolean;
  excessive_forward_lean: boolean;
  knees_cave_in: boolean;
  low_back_arch: boolean;
  arms_fall_forward: boolean;
  forward_head: boolean;
  lateral_asymmetry: boolean;
  balance_deficits: boolean;
  ohsa_notes: string;

  // Training Profile
  experience_level: string;
  years_training: string;
  activity_level: string;
  days_per_week: number;
  preferred_time: string;
  training_days: string[];
  payment_rate: string;
  billing_cadence: string;
  first_payment_date: string;

  // Goals
  primary_goal: string;
  secondary_goal: string;
  goal_timeline: string;
  target_weight: string;
  goal_notes: string;

  // Lifestyle
  occupation_type: string;
  stress_level: number;
  sleep_hours: string;
  nutrition_notes: string;
}

const defaultData: AssessmentData = {
  first_name: '', last_name: '', email: '', phone: '', date_of_birth: '',
  emergency_contact_name: '', emergency_contact_phone: '',
  medical_clearance: false, has_pain: false, current_injuries: '',
  chronic_conditions: '', medications: '', pain_location: '',
  pain_onset: '', hip_issues: false, prior_surgeries: '',
  feet_turn_out: false, excessive_forward_lean: false, knees_cave_in: false,
  low_back_arch: false, arms_fall_forward: false, forward_head: false,
  lateral_asymmetry: false, balance_deficits: false, ohsa_notes: '',
  experience_level: '', years_training: '', activity_level: '',
  days_per_week: 3, preferred_time: '',
  training_days: [], payment_rate: '', billing_cadence: 'monthly', first_payment_date: '',
  primary_goal: '', secondary_goal: '', goal_timeline: '',
  target_weight: '', goal_notes: '',
  occupation_type: '', stress_level: 5, sleep_hours: '', nutrition_notes: '',
};

const SECTIONS = [
  'Personal Info',
  'Medical History',
  'Movement Screen',
  'Training Profile',
  'Goals',
  'Lifestyle',
  'AI Recommendation',
];

// \u2500\u2500\u2500 Toggle Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/10">
      <span className="text-sm font-medium" style={{ color: 'var(--brand-text-secondary)' }}>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{
          backgroundColor: value ? '#7c3aed' : 'var(--brand-bg)',
        }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"
          style={{ transform: value ? 'translateX(24px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// \u2500\u2500\u2500 Field Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

function Field({
  label, children, className = ''
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--brand-text-secondary)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 transition-all"
  + " bg-[var(--brand-surface)] border-[var(--brand-border)] text-[var(--brand-text)] placeholder-[var(--brand-text-secondary)] focus:ring-purple-500/50 focus:border-purple-500/50";

// \u2500\u2500\u2500 Main Component \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export default function AssessmentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<AssessmentData>(defaultData);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [listenField, setListenField] = useState<string | null>(null);

  const set = (field: keyof AssessmentData, value: any) =>
    setData(prev => ({ ...prev, [field]: value }));

  // \u2500\u2500\u2500 Voice Input \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const startVoice = (field: keyof AssessmentData) => {
    // Unified dictation: native app (Capacitor) + browser.
    startDictation({
      onStart: () => setListenField(field),
      onEnd: () => setListenField(null),
      onResult: (transcript) => { set(field, transcript); setListenField(null); },
      onUnavailable: () => { setListenField(null); alert("Voice input isn't available here."); },
    });
  };

  const MicBtn = ({ field }: { field: keyof AssessmentData }) => (
    <button
      type="button"
      onClick={() => startVoice(field)}
      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors"
      style={{
        backgroundColor: listenField === field ? 'rgba(168,85,247,0.3)' : 'var(--brand-bg)',
        color: listenField === field ? '#7c3aed' : 'var(--brand-text-secondary)',
      }}
      title="Voice input"
    >
      <i className={`ti ti-${listenField === field ? 'loader-2 animate-spin' : 'microphone'} text-sm`} />
    </button>
  );

  function VoiceInput({ field, placeholder, multiline }: {
    field: keyof AssessmentData; placeholder?: string; multiline?: boolean;
  }) {
    if (multiline) {
      return (
        <div className="relative">
          <textarea
            value={data[field] as string}
            onChange={e => set(field, e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={inputClass + ' pr-10 resize-none'}
          />
          <div className="absolute right-2 top-2">
            <button
              type="button"
              onClick={() => startVoice(field)}
              className="p-1.5 rounded-full transition-colors"
              style={{
                backgroundColor: listenField === field ? 'rgba(168,85,247,0.3)' : 'var(--brand-bg)',
                color: listenField === field ? '#7c3aed' : 'var(--brand-text-secondary)',
              }}
            >
              <i className={`ti ti-${listenField === field ? 'loader-2 animate-spin' : 'microphone'} text-sm`} />
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="relative">
        <input
          type="text"
          value={data[field] as string}
          onChange={e => set(field, e.target.value)}
          placeholder={placeholder}
          className={inputClass + ' pr-10'}
        />
        <MicBtn field={field} />
      </div>
    );
  }

  // \u2500\u2500\u2500 AI Recommendation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const getAIRecommendation = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/assessment-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      setAiResult(result);
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  // \u2500\u2500\u2500 Save \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const saveAssessment = async (createAccount: boolean) => {
    setSaving(true);
    try {
      if (createAccount) {
        // Full onboarding (server route, needs admin): saves the assessment,
        // creates the client profile with all info, creates their login with a
        // temp password (client resets on first login), links the assessment to
        // the profile, and emails the APK invite.
        const res = await fetch('/api/create-client-from-assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, aiResult }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create client');
        router.push('/clients');
        return;
      }

      // Archive only — save the assessment without creating an account.
      const supabase = createClient();
      const assessmentPayload = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        date_of_birth: data.date_of_birth || null,
        emergency_contact_name: data.emergency_contact_name,
        emergency_contact_phone: data.emergency_contact_phone,
        medical_clearance: data.medical_clearance,
        current_injuries: data.current_injuries,
        chronic_conditions: data.chronic_conditions,
        medications: data.medications,
        pain_location: data.has_pain ? data.pain_location : null,
        pain_onset: data.has_pain ? data.pain_onset : null,
        hip_issues: data.hip_issues,
        prior_surgeries: data.prior_surgeries,
        feet_turn_out: data.feet_turn_out,
        excessive_forward_lean: data.excessive_forward_lean,
        knees_cave_in: data.knees_cave_in,
        low_back_arch: data.low_back_arch,
        arms_fall_forward: data.arms_fall_forward,
        forward_head: data.forward_head,
        lateral_asymmetry: data.lateral_asymmetry,
        balance_deficits: data.balance_deficits,
        ohsa_notes: data.ohsa_notes,
        experience_level: data.experience_level,
        years_training: data.years_training ? parseInt(data.years_training) : null,
        activity_level: data.activity_level,
        days_per_week: data.days_per_week,
        preferred_time: data.preferred_time,
        primary_goal: data.primary_goal,
        secondary_goal: data.secondary_goal,
        goal_timeline: data.goal_timeline,
        target_weight: data.target_weight ? parseFloat(data.target_weight) : null,
        goal_notes: data.goal_notes,
        occupation_type: data.occupation_type,
        stress_level: data.stress_level,
        sleep_hours: data.sleep_hours ? parseFloat(data.sleep_hours) : null,
        nutrition_notes: data.nutrition_notes,
        ai_program_recommendation: aiResult ? JSON.stringify(aiResult) : null,
        ai_assessment_summary: aiResult?.assessment_summary || null,
        status: 'pending_signup',
      };
      const { error: assessErr } = await supabase
        .from('client_assessments')
        .insert(Object.fromEntries(Object.entries(assessmentPayload as any).map(([k, v]) => [k, v === '' ? null : v])) as any);
      if (assessErr) throw assessErr;
      router.push('/clients');
    } catch (e: any) {
      console.error('Save error:', e);
      alert(e?.message || 'Error saving assessment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // \u2500\u2500\u2500 Progress Bar \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const progress = ((step + 1) / SECTIONS.length) * 100;

  // \u2500\u2500\u2500 Render Sections \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  const renderSection = () => {
    switch (step) {
      case 0: // Personal Info
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="First Name">
              {VoiceInput({ field: "first_name", placeholder: "Jane" })}
            </Field>
            <Field label="Last Name">
              {VoiceInput({ field: "last_name", placeholder: "Smith" })}
            </Field>
            <Field label="Email">
              <div className="relative">
                <input
                  type="email"
                  value={data.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="jane@example.com"
                  className={inputClass}
                />
              </div>
            </Field>
            <Field label="Phone">
              {VoiceInput({ field: "phone", placeholder: "(555) 000-0000" })}
            </Field>
            <Field label="Date of Birth">
              <input
                type="date"
                value={data.date_of_birth}
                onChange={e => set('date_of_birth', e.target.value)}
                className={inputClass}
              />
            </Field>
            <div />
            <Field label="Emergency Contact Name">
              {VoiceInput({ field: "emergency_contact_name", placeholder: "John Smith" })}
            </Field>
            <Field label="Emergency Contact Phone">
              {VoiceInput({ field: "emergency_contact_phone", placeholder: "(555) 000-0001" })}
            </Field>
          </div>
        );

      case 1: // Medical History
        return (
          <div className="space-y-4">
            <Toggle
              value={data.medical_clearance}
              onChange={v => set('medical_clearance', v)}
              label="Medical clearance obtained"
            />
            <Toggle
              value={data.hip_issues}
              onChange={v => set('hip_issues', v)}
              label="Hip issues / replacement"
            />
            <Toggle
              value={data.has_pain}
              onChange={v => set('has_pain', v)}
              label="Currently experiencing pain"
            />
            {data.has_pain && (
              <div className="pl-4 border-l-2 border-purple-500/40 space-y-3">
                <Field label="Pain Location">
                  {VoiceInput({ field: "pain_location", placeholder: "e.g., lower back, left knee" })}
                </Field>
                <Field label="Pain Onset">
                  <div className="flex gap-2">
                    {[
                      { value: 'acute', label: 'Acute (< 6 weeks)' },
                      { value: 'chronic', label: 'Chronic (> 6 weeks)' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => set('pain_onset', opt.value)}
                        className="flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-all"
                        style={{
                          backgroundColor: data.pain_onset === opt.value ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                          borderColor: data.pain_onset === opt.value ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                          color: data.pain_onset === opt.value ? '#7c3aed' : 'var(--brand-text-secondary)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}
            <Field label="Current Injuries">
              {VoiceInput({ field: "current_injuries", placeholder: "Describe any current injuries...", multiline: true })}
            </Field>
            <Field label="Chronic Conditions">
              {VoiceInput({ field: "chronic_conditions", placeholder: "e.g., diabetes, hypertension...", multiline: true })}
            </Field>
            <Field label="Medications">
              {VoiceInput({ field: "medications", placeholder: "List any relevant medications...", multiline: true })}
            </Field>
            <Field label="Prior Surgeries">
              {VoiceInput({ field: "prior_surgeries", placeholder: "e.g., ACL repair 2019, hip replacement 2022...", multiline: true })}
            </Field>
          </div>
        );

      case 2: { // OHSA
        const compensations = [
          { key: 'feet_turn_out', icon: 'ti-rotate', label: 'Feet turn out' },
          { key: 'excessive_forward_lean', icon: 'ti-trending-up', label: 'Excessive forward lean' },
          { key: 'knees_cave_in', icon: 'ti-arrows-join', label: 'Knees cave in (valgus)' },
          { key: 'low_back_arch', icon: 'ti-arch', label: 'Low back arches (APT)' },
          { key: 'arms_fall_forward', icon: 'ti-arrows-down', label: 'Arms fall forward / rounded shoulders' },
          { key: 'forward_head', icon: 'ti-arrow-forward', label: 'Forward head position' },
          { key: 'lateral_asymmetry', icon: 'ti-scale', label: 'Lateral asymmetry (single-leg screen)' },
          { key: 'balance_deficits', icon: 'ti-brain', label: 'Balance / coordination deficits' },
        ] as const;

        const findingsCount = compensations.filter(c => data[c.key as keyof AssessmentData]).length;

        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: findingsCount === 0 ? 'rgba(34,197,94,0.15)' : findingsCount <= 2 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                  color: findingsCount === 0 ? '#4ade80' : findingsCount <= 2 ? '#facc15' : '#f87171',
                }}>
                {findingsCount} finding{findingsCount !== 1 ? 's' : ''} identified
              </div>
            </div>
            {compensations.map(({ key, icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => set(key as keyof AssessmentData, !data[key as keyof AssessmentData])}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left card-hover"
                style={{
                  backgroundColor: data[key as keyof AssessmentData] ? 'rgba(239,68,68,0.12)' : 'var(--brand-bg)',
                  borderColor: data[key as keyof AssessmentData] ? 'rgba(239,68,68,0.4)' : 'var(--brand-border)',
                }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: data[key as keyof AssessmentData] ? 'rgba(239,68,68,0.2)' : 'var(--brand-bg)',
                  }}>
                  <i className={`${icon} text-sm`} style={{ color: data[key as keyof AssessmentData] ? '#f87171' : 'var(--brand-text-secondary)' }} />
                </div>
                <span className="text-sm flex-1" style={{ color: 'var(--brand-text)' }}>{label}</span>
                <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: data[key as keyof AssessmentData] ? '#f87171' : 'var(--brand-border)',
                    backgroundColor: data[key as keyof AssessmentData] ? 'rgba(239,68,68,0.2)' : 'transparent',
                  }}>
                  {data[key as keyof AssessmentData] && <i className="ti ti-check text-xs" style={{ color: '#f87171' }} />}
                </div>
              </button>
            ))}
            <Field label="OHSA Notes" className="mt-4">
              {VoiceInput({ field: "ohsa_notes", placeholder: "Additional movement observations...", multiline: true })}
            </Field>
          </div>
        );
      }

      case 3: // Training Profile
        return (
          <div className="space-y-6">
            <Field label="Experience Level">
              <div className="grid grid-cols-3 gap-2">
                {['beginner', 'intermediate', 'advanced'].map(lvl => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => set('experience_level', lvl)}
                    className="py-3 rounded-xl border text-sm font-medium capitalize transition-all"
                    style={{
                      backgroundColor: data.experience_level === lvl ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                      borderColor: data.experience_level === lvl ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                      color: data.experience_level === lvl ? '#7c3aed' : 'var(--brand-text-secondary)',
                    }}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Years Training">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={data.years_training}
                  onChange={e => set('years_training', e.target.value)}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </Field>

            <Field label="Activity Level">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'sedentary', label: 'Sedentary', desc: 'Little to no exercise' },
                  { value: 'lightly_active', label: 'Lightly Active', desc: '1\u20133 days/week' },
                  { value: 'active', label: 'Active', desc: '3\u20135 days/week' },
                  { value: 'very_active', label: 'Very Active', desc: '6\u20137 days/week' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('activity_level', opt.value)}
                    className="p-3 rounded-xl border text-left transition-all"
                    style={{
                      backgroundColor: data.activity_level === opt.value ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                      borderColor: data.activity_level === opt.value ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                    }}
                  >
                    <div className="text-sm font-medium" style={{ color: data.activity_level === opt.value ? '#7c3aed' : 'var(--brand-text)' }}>
                      {opt.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--brand-text-secondary)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Days Per Week: ${data.days_per_week}`}>
              <input
                type="range"
                min="1"
                max="7"
                value={data.days_per_week}
                onChange={e => set('days_per_week', parseInt(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--brand-text-secondary)' }}>
                {[1,2,3,4,5,6,7].map(n => <span key={n}>{n}</span>)}
              </div>
            </Field>

            <Field label="Training Days">
              <div className="grid grid-cols-7 gap-1">
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
                  const on = data.training_days.includes(d);
                  return (
                    <button key={d} type="button"
                      onClick={() => set('training_days', on ? data.training_days.filter(x => x !== d) : [...data.training_days, d])}
                      className="py-2 rounded-lg border text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: on ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                        borderColor: on ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                        color: on ? '#7c3aed' : 'var(--brand-text-secondary)',
                      }}>
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>

            <div className="pt-4 mt-2 border-t space-y-6" style={{ borderColor: 'var(--brand-border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--brand-text)' }}>Billing</p>
              <Field label="Payment Rate ($ per cycle)">
                <input type="number" min="0" step="1" inputMode="decimal"
                  value={data.payment_rate}
                  onChange={e => set('payment_rate', e.target.value)}
                  placeholder="e.g. 990" className={inputClass} />
              </Field>
              <Field label="Billing Cycle">
                <div className="grid grid-cols-4 gap-2">
                  {['weekly','biweekly','monthly','quarterly'].map(c => (
                    <button key={c} type="button" onClick={() => set('billing_cadence', c)}
                      className="py-2.5 rounded-lg border text-xs font-medium capitalize transition-all"
                      style={{
                        backgroundColor: data.billing_cadence === c ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                        borderColor: data.billing_cadence === c ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                        color: data.billing_cadence === c ? '#7c3aed' : 'var(--brand-text-secondary)',
                      }}>
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="First Payment Date">
                <input type="date" value={data.first_payment_date}
                  onChange={e => set('first_payment_date', e.target.value)} className={inputClass} />
              </Field>
              <p className="text-xs" style={{ color: 'var(--brand-text-secondary)' }}>
                A payment reminder is created for this date the moment you create the client. You can edit the amount, date, and everything else afterward on the Payments page.
              </p>
            </div>

            <Field label="Preferred Training Time">
              <div className="grid grid-cols-3 gap-2">
                {['morning', 'afternoon', 'evening'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('preferred_time', t)}
                    className="py-3 rounded-xl border text-sm font-medium capitalize transition-all"
                    style={{
                      backgroundColor: data.preferred_time === t ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                      borderColor: data.preferred_time === t ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                      color: data.preferred_time === t ? '#7c3aed' : 'var(--brand-text-secondary)',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        );

      case 4: { // Goals
        const goals = [
          { value: 'fat_loss', label: 'Fat Loss', icon: 'ti-flame' },
          { value: 'muscle_gain', label: 'Muscle Gain', icon: 'ti-barbell' },
          { value: 'performance', label: 'Performance', icon: 'ti-trophy' },
          { value: 'rehab', label: 'Rehabilitation', icon: 'ti-first-aid-kit' },
          { value: 'general_health', label: 'General Health', icon: 'ti-heart-rate-monitor' },
          { value: 'longevity', label: 'Longevity', icon: 'ti-clock-heart' },
        ];

        return (
          <div className="space-y-6">
            <Field label="Primary Goal">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {goals.map(g => (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => set('primary_goal', g.value)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all"
                    style={{
                      backgroundColor: data.primary_goal === g.value ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                      borderColor: data.primary_goal === g.value ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                    }}
                  >
                    <i className={`${g.icon} text-xl`} style={{ color: data.primary_goal === g.value ? '#7c3aed' : 'var(--brand-text-secondary)' }} />
                    <span className="text-xs font-medium text-center" style={{ color: data.primary_goal === g.value ? '#7c3aed' : 'var(--brand-text-secondary)' }}>
                      {g.label}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Secondary Goal (Optional)">
              <select
                value={data.secondary_goal}
                onChange={e => set('secondary_goal', e.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {goals.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>

            <Field label="Goal Timeline">
              {VoiceInput({ field: "goal_timeline", placeholder: "e.g., 3 months, 1 year, ongoing..." })}
            </Field>

            <Field label="Target Weight (lbs, optional)">
              <input
                type="number"
                value={data.target_weight}
                onChange={e => set('target_weight', e.target.value)}
                placeholder="e.g., 160"
                className={inputClass}
              />
            </Field>

            <Field label="Goal Notes">
              {VoiceInput({ field: "goal_notes", placeholder: "Any additional context about their goals...", multiline: true })}
            </Field>
          </div>
        );
      }

      case 5: // Lifestyle
        return (
          <div className="space-y-6">
            <Field label="Occupation Type">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'sedentary', label: 'Sedentary', desc: 'Desk job' },
                  { value: 'active', label: 'Active', desc: 'On feet often' },
                  { value: 'physical', label: 'Physical', desc: 'Manual labor' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('occupation_type', opt.value)}
                    className="p-3 rounded-xl border text-center transition-all"
                    style={{
                      backgroundColor: data.occupation_type === opt.value ? 'rgba(168,85,247,0.2)' : 'var(--brand-bg)',
                      borderColor: data.occupation_type === opt.value ? 'rgba(168,85,247,0.6)' : 'var(--brand-border)',
                    }}
                  >
                    <div className="text-sm font-medium" style={{ color: data.occupation_type === opt.value ? '#7c3aed' : 'var(--brand-text)' }}>
                      {opt.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--brand-text-secondary)' }}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            <Field label={`Stress Level: ${data.stress_level}/10`}>
              <input
                type="range"
                min="1"
                max="10"
                value={data.stress_level}
                onChange={e => set('stress_level', parseInt(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--brand-text-secondary)' }}>
                <span>1 - Very Low</span>
                <span>10 - Very High</span>
              </div>
            </Field>

            <Field label="Sleep Hours Per Night">
              <input
                type="number"
                min="3"
                max="12"
                step="0.5"
                value={data.sleep_hours}
                onChange={e => set('sleep_hours', e.target.value)}
                placeholder="e.g., 7.5"
                className={inputClass}
              />
            </Field>

            <Field label="Nutrition / Dietary Notes">
              {VoiceInput({ field: "nutrition_notes", placeholder: "Dietary restrictions, eating habits, supplements...", multiline: true })}
            </Field>
          </div>
        );

      case 6: // AI Recommendation
        if (aiLoading) {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin" />
              <p className="text-sm" style={{ color: 'var(--brand-text-secondary)' }}>Analyzing assessment data...</p>
            </div>
          );
        }

        if (!aiResult) {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)' }}>
                <i className="ti ti-robot text-4xl" style={{ color: '#7c3aed' }} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">Ready for AI Analysis</h3>
                <p className="text-sm" style={{ color: 'var(--brand-text-secondary)' }}>
                  Generate a program recommendation based on the completed assessment
                </p>
              </div>
              <button
                type="button"
                onClick={getAIRecommendation}
                className="px-6 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                <i className="ti ti-sparkles mr-2" />
                Generate Recommendation
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {/* Program Badge */}
            <div className="p-4 rounded-xl border" style={{ backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)' }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(168,85,247,0.2)' }}>
                  <i className="ti ti-award text-lg" style={{ color: '#7c3aed' }} />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'rgba(168,85,247,0.8)' }}>
                    Recommended Program
                  </div>
                  <div className="text-lg font-bold text-white">{aiResult.recommended_program}</div>
                  <div className="text-sm mt-0.5" style={{ color: 'var(--brand-text-secondary)' }}>
                    Starting at {aiResult.recommended_phase}
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Finding */}
            {aiResult.primary_corrective_finding && (
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'rgba(239,68,68,0.7)' }}>
                  Primary Finding
                </div>
                <p className="text-sm" style={{ color: 'var(--brand-text)' }}>{aiResult.primary_corrective_finding}</p>
              </div>
            )}

            {/* Rationale */}
            <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
              <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--brand-text-secondary)' }}>
                Program Rationale
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--brand-text-secondary)' }}>{aiResult.program_rationale}</p>
            </div>

            {/* Key Considerations */}
            {aiResult.key_considerations?.length > 0 && (
              <div className="p-4 rounded-xl" style={{ backgroundColor: 'var(--brand-bg)', border: '1px solid var(--brand-border)' }}>
                <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--brand-text-secondary)' }}>
                  Key Considerations
                </div>
                <ul className="space-y-2">
                  {aiResult.key_considerations.map((c: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--brand-text-secondary)' }}>
                      <i className="ti ti-point-filled mt-1 flex-shrink-0" style={{ color: '#a855f7' }} />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Assessment Summary (editable) */}
            <Field label="Assessment Summary (Client-Facing \u2014 Editable)">
              <textarea
                value={aiResult.assessment_summary || ''}
                onChange={e => setAiResult((prev: any) => ({ ...prev, assessment_summary: e.target.value }))}
                rows={4}
                className={inputClass + ' resize-none'}
              />
            </Field>

            <button
              type="button"
              onClick={getAIRecommendation}
              className="flex items-center gap-2 text-sm py-2 px-3 rounded-lg transition-colors"
              style={{ color: 'var(--brand-text-secondary)', backgroundColor: 'var(--brand-bg)' }}
            >
              <i className="ti ti-refresh" />
              Regenerate
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // \u2500\u2500\u2500 Main Render \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--brand-bg, #0f0f1a)' }}>
      {/* Header */}
      <div className="px-6 py-5" style={{ background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #a855f7 100%)' }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            >
              <i className="ti ti-arrow-left text-white" />
            </button>
            <h1 className="text-xl font-bold text-white">Client Assessment</h1>
          </div>
          <p className="text-sm ml-8" style={{ color: 'var(--brand-text-secondary)' }}>
            {data.first_name ? `${data.first_name} ${data.last_name}`.trim() : 'New Client'}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 w-full" style={{ backgroundColor: 'var(--brand-bg)' }}>
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
          }}
        />
      </div>

      {/* Section Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 px-4 py-3 min-w-max mx-auto max-w-2xl">
          {SECTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => i <= step && setStep(i)}
              className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
              style={{
                backgroundColor: i === step ? 'rgba(168,85,247,0.25)' : i < step ? 'rgba(168,85,247,0.1)' : 'var(--brand-bg)',
                color: i === step ? '#7c3aed' : i < step ? 'rgba(168,85,247,0.7)' : 'var(--brand-text-secondary)',
                border: `1px solid ${i === step ? 'rgba(168,85,247,0.5)' : 'transparent'}`,
                cursor: i <= step ? 'pointer' : 'default',
              }}
            >
              {i < step && <i className="ti ti-check mr-1 text-xs" />}
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-32 max-w-2xl mx-auto">
        {/* Section Header */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">{SECTIONS[step]}</h2>
          {step === 2 && (
            <p className="text-sm mt-1" style={{ color: 'var(--brand-text-secondary)' }}>
              Overhead Squat Assessment \u2014 check each compensation observed
            </p>
          )}
        </div>

        {/* Section Content */}
        <div className="transition-all duration-300">
          {renderSection()}
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 p-4 border-t"
        style={{
          backgroundColor: 'rgba(15,15,26,0.95)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--brand-border)',
        }}>
        <div className="max-w-2xl mx-auto">
          {step < SECTIONS.length - 1 ? (
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(s => s - 1)}
                  className="flex-1 py-3 rounded-xl font-semibold border transition-all"
                  style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-secondary)' }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const next = step + 1;
                  setStep(next);
                  if (next === SECTIONS.length - 1) {
                    setTimeout(getAIRecommendation, 300);
                  }
                }}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                {step === SECTIONS.length - 2 ? 'Get AI Recommendation' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => saveAssessment(false)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-semibold border transition-all"
                style={{ borderColor: 'var(--brand-border)', color: 'var(--brand-text-secondary)' }}
              >
                {saving ? 'Saving...' : 'Archive Records'}
              </button>
              <button
                type="button"
                onClick={() => saveAssessment(true)}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
              >
                {saving ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
