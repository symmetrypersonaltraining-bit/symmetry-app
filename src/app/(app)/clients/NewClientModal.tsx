"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced", "Athlete"];
const GOALS = [
  "Fat Loss", "Muscle Gain", "Body Recomposition", "Strength", "Endurance",
  "General Health", "Athletic Performance", "Injury Rehab", "Maintenance",
];

interface Props {
  onClose: () => void;
}

export default function NewClientModal({ onClose }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    start_date: new Date().toISOString().split("T")[0],
    experience_level: "",
    primary_goal: "",
    injuries_limitations: "",
    training_frequency: "",
    current_fees: "",
    notes: "",
    send_invite: true,
  });

  function set(field: string, val: string | boolean) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create client");
      setSuccess(
        data.invited
          ? `${data.name} created! Invite email sent to ${form.email}.`
          : `${data.name} created! No invite sent \u2014 link their account later.`
      );
      setTimeout(() => {
        onClose();
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "var(--brand-card)", border: "1px solid var(--brand-border)", maxHeight: "90vh" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--brand-border)", background: "var(--brand-surface)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>New Client</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
              Fill in what you know \u2014 client will complete the rest on first login
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 120px)" }}>
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

            {/* Success / Error */}
            {success && (
              <div className="rounded-xl px-4 py-3 text-sm font-medium"
                style={{ background: "#dcfce7", color: "#16a34a" }}>
                <i className="ti ti-circle-check mr-2" />{success}
              </div>
            )}
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{ background: "#fee2e2", color: "#dc2626" }}>
                <i className="ti ti-alert-circle mr-2" />{error}
              </div>
            )}

            {/* Name + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Full Name *
                </label>
                <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="Jane Smith" required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Email *
                </label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                  placeholder="jane@example.com" required
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>

            {/* Phone + DOB */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Phone</label>
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Date of Birth</label>
                <input type="date" value={form.date_of_birth} onChange={e => set("date_of_birth", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>

            {/* Start Date + Fees */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Start Date</label>
                <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Monthly Fees ($)</label>
                <input type="number" value={form.current_fees} onChange={e => set("current_fees", e.target.value)}
                  placeholder="300"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </div>
            </div>

            {/* Experience + Frequency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Experience Level</label>
                <select value={form.experience_level} onChange={e => set("experience_level", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                  <option value="">Select...</option>
                  {EXPERIENCE_LEVELS.map(l => <option key={l} value={l.toLowerCase()}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Days / Week</label>
                <select value={form.training_frequency} onChange={e => set("training_frequency", e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                  <option value="">Select...</option>
                  {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}x / week</option>)}
                </select>
              </div>
            </div>

            {/* Primary Goal */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Primary Goal</label>
              <div className="flex flex-wrap gap-2">
                {GOALS.map(g => (
                  <button key={g} type="button"
                    onClick={() => set("primary_goal", form.primary_goal === g ? "" : g)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: form.primary_goal === g ? "var(--brand-primary)" : "var(--brand-bg)",
                      color: form.primary_goal === g ? "white" : "var(--brand-text-secondary)",
                      border: `1px solid ${form.primary_goal === g ? "var(--brand-primary)" : "var(--brand-border)"}`,
                    }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Injuries */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>
                Injuries / Limitations
              </label>
              <textarea value={form.injuries_limitations} onChange={e => set("injuries_limitations", e.target.value)}
                rows={2} placeholder="Lower back issue, left knee pain..."
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--brand-text-secondary)" }}>Notes</label>
              <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
                rows={2} placeholder="Anything else to note about this client..."
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            </div>

            {/* Send Invite toggle */}
            <div className="flex items-start gap-3 rounded-xl p-3"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              <button type="button" onClick={() => set("send_invite", !form.send_invite)}
                className="mt-0.5 w-10 h-6 rounded-full flex-shrink-0 transition-all relative"
                style={{ background: form.send_invite ? "var(--brand-primary)" : "var(--brand-border)" }}>
                <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: form.send_invite ? "calc(100% - 20px)" : "4px" }} />
              </button>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Send invite email</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Client receives a link to set their password and complete their profile
                </p>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={saving || !!success}
              className="w-full py-3 rounded-xl text-sm font-bold text-white transition-opacity"
              style={{ background: "var(--brand-primary)", opacity: saving || !!success ? 0.6 : 1 }}>
              {saving ? "Creating..." : success ? "Done!" : "Create Client"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
