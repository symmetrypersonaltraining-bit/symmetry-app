"use client";

import { useState } from "react";

const GOALS = [
  "Fat Loss", "Muscle Gain", "Body Recomposition", "Strength",
  "Endurance", "General Health", "Athletic Performance", "Maintenance",
];
const EXPERIENCE_LEVELS = [
  { val: "beginner", label: "Beginner", desc: "New to structured training" },
  { val: "intermediate", label: "Intermediate", desc: "1\u20133 years consistent training" },
  { val: "advanced", label: "Advanced", desc: "3+ years, strong foundation" },
  { val: "athlete", label: "Athlete", desc: "Competitive / high performance" },
];

interface Props {
  clientId: string;
  prefill: {
    name: string;
    phone: string;
    date_of_birth: string;
    primary_goal: string;
    injuries_limitations: string;
    experience_level: string;
    training_frequency: string | number;
  };
}

const STEPS = ["Welcome", "Goals", "Experience", "Body Stats", "Health", "Done"];

export default function OnboardingWizard({ clientId, prefill }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    phone: prefill.phone || "",
    date_of_birth: prefill.date_of_birth || "",
    primary_goal: prefill.primary_goal || "",
    experience_level: prefill.experience_level || "",
    training_frequency: prefill.training_frequency ? String(prefill.training_frequency) : "",
    injuries_limitations: prefill.injuries_limitations || "",
    current_weight: "",
    current_body_fat_pct: "",
  });

  function set(field: string, val: string) {
    setForm(f => ({ ...f, [field]: val }));
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const res = await fetch("/api/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      window.location.href = "/home";
    } catch {
      setSaving(false);
    }
  }

  const firstName = prefill.name.split(" ")[0];
  const progress = Math.round((step / (STEPS.length - 1)) * 100);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--brand-bg)" }}>
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "var(--brand-primary)" }}>
            <i className="ti ti-barbell text-white text-lg" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--brand-primary)" }}>Symmetry</p>
            <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Personal Training</p>
          </div>
        </div>

        {/* Progress bar */}
        {step < 5 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--brand-text-secondary)" }}>
                Step {step + 1} of {STEPS.length - 1}
              </span>
              <span className="text-xs font-semibold" style={{ color: "var(--brand-primary)" }}>
                {STEPS[step]}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "var(--brand-border)" }}>
              <div className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%`, background: "var(--brand-primary)" }} />
            </div>
          </div>
        )}
      </div>

      {/* Step content */}
      <div className="flex-1 px-5 pb-8">

        {/* Step 0 \u2014 Welcome */}
        {step === 0 && (
          <div className="pt-4">
            <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-text)" }}>
              Welcome, {firstName}! \ud83d\udc4b
            </h1>
            <p className="text-sm mb-8 leading-relaxed" style={{ color: "var(--brand-text-secondary)" }}>
              Let&apos;s take 2 minutes to set up your profile. This helps Dustin customize your training and track your progress accurately.
            </p>

            <div className="space-y-3 mb-8">
              {[
                { icon: "ti-target", text: "Set your goals" },
                { icon: "ti-barbell", text: "Tell us your experience level" },
                { icon: "ti-chart-line", text: "Log your starting stats" },
                { icon: "ti-heart-rate-monitor", text: "Note any injuries or limitations" },
              ].map(item => (
                <div key={item.icon} className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--brand-primary)22" }}>
                    <i className={`ti ${item.icon} text-sm`} style={{ color: "var(--brand-primary)" }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>{item.text}</span>
                </div>
              ))}
            </div>

            {/* Contact info */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Phone Number
                </label>
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Date of Birth
                </label>
                <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)}
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>

            <button onClick={() => setStep(1)}
              className="w-full py-3.5 rounded-xl text-white font-bold text-sm"
              style={{ background: "var(--brand-primary)" }}>
              Let&apos;s Go {'→'}
            </button>
          </div>
        )}

        {/* Step 1 \u2014 Goals */}
        {step === 1 && (
          <div className="pt-4">
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>What&apos;s your main goal?</h2>
            <p className="text-sm mb-6" style={{ color: "var(--brand-text-secondary)" }}>Pick the one that matters most right now.</p>
            <div className="grid grid-cols-2 gap-2.5 mb-8">
              {GOALS.map(g => (
                <button key={g} onClick={() => set("primary_goal", g)}
                  className="p-3.5 rounded-xl text-sm font-medium text-left transition-all"
                  style={{
                    background: form.primary_goal === g ? "var(--brand-primary)" : "var(--brand-surface)",
                    border: `1.5px solid ${form.primary_goal === g ? "var(--brand-primary)" : "var(--brand-border)"}`,
                    color: form.primary_goal === g ? "white" : "var(--brand-text)",
                  }}>
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                Back
              </button>
              <button onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-xl text-white font-bold text-sm"
                style={{ background: "var(--brand-primary)" }}>
                Next {'→'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2 \u2014 Experience */}
        {step === 2 && (
          <div className="pt-4">
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>Training experience</h2>
            <p className="text-sm mb-6" style={{ color: "var(--brand-text-secondary)" }}>Be honest \u2014 this shapes your program design.</p>
            <div className="space-y-2.5 mb-6">
              {EXPERIENCE_LEVELS.map(lvl => (
                <button key={lvl.val} onClick={() => set("experience_level", lvl.val)}
                  className="w-full p-4 rounded-xl text-left transition-all"
                  style={{
                    background: form.experience_level === lvl.val ? "var(--brand-primary)15" : "var(--brand-surface)",
                    border: `1.5px solid ${form.experience_level === lvl.val ? "var(--brand-primary)" : "var(--brand-border)"}`,
                  }}>
                  <p className="text-sm font-bold" style={{ color: form.experience_level === lvl.val ? "var(--brand-primary)" : "var(--brand-text)" }}>
                    {lvl.label}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{lvl.desc}</p>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                How many days / week are you training?
              </label>
              <div className="flex gap-2">
                {[1,2,3,4,5,6].map(n => (
                  <button key={n} onClick={() => set("training_frequency", String(n))}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: form.training_frequency === String(n) ? "var(--brand-primary)" : "var(--brand-surface)",
                      border: `1.5px solid ${form.training_frequency === String(n) ? "var(--brand-primary)" : "var(--brand-border)"}`,
                      color: form.training_frequency === String(n) ? "white" : "var(--brand-text)",
                    }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                Back
              </button>
              <button onClick={() => setStep(3)}
                className="flex-1 py-3 rounded-xl text-white font-bold text-sm"
                style={{ background: "var(--brand-primary)" }}>
                Next {'→'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 \u2014 Body Stats */}
        {step === 3 && (
          <div className="pt-4">
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>Starting stats</h2>
            <p className="text-sm mb-6" style={{ color: "var(--brand-text-secondary)" }}>
              These create your baseline. Skip if you don&apos;t know \u2014 you can log them anytime.
            </p>
            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Current Weight (lbs)
                </label>
                <input type="number" value={form.current_weight} onChange={e => set("current_weight", e.target.value)}
                  placeholder="e.g. 175"
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Body Fat % (if known)
                </label>
                <input type="number" value={form.current_body_fat_pct} onChange={e => set("current_body_fat_pct", e.target.value)}
                  placeholder="e.g. 22" min="3" max="60"
                  className="w-full rounded-xl px-4 py-3 text-sm"
                  style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                Back
              </button>
              <button onClick={() => setStep(4)}
                className="flex-1 py-3 rounded-xl text-white font-bold text-sm"
                style={{ background: "var(--brand-primary)" }}>
                Next {'→'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4 \u2014 Health / Injuries */}
        {step === 4 && (
          <div className="pt-4">
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--brand-text)" }}>Injuries & limitations</h2>
            <p className="text-sm mb-6" style={{ color: "var(--brand-text-secondary)" }}>
              Any pain, past surgeries, movements to avoid? Dustin needs to know this to train you safely.
            </p>
            <textarea value={form.injuries_limitations} onChange={e => set("injuries_limitations", e.target.value)}
              rows={5} placeholder="e.g. Lower back tightness, left shoulder impingement from old rotator cuff tear, avoid overhead pressing for now..."
              className="w-full rounded-xl px-4 py-3 text-sm resize-none mb-3"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            <p className="text-xs mb-8" style={{ color: "var(--brand-text-secondary)" }}>
              Leave blank if none.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setStep(3)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                Back
              </button>
              <button onClick={handleFinish} disabled={saving}
                className="flex-1 py-3 rounded-xl text-white font-bold text-sm"
                style={{ background: "var(--brand-primary)", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Saving..." : "Finish Setup \u2713"}
              </button>
            </div>
          </div>
        )}

        {/* Step 5 \u2014 Done */}
        {step === 5 && (
          <div className="pt-8 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: "#dcfce7" }}>
              <i className="ti ti-check text-4xl" style={{ color: "#16a34a" }} />
            </div>
            <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--brand-text)" }}>You&apos;re all set!</h2>
            <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              Taking you to your dashboard...
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
