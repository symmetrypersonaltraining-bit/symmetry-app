"use client";

// The assessment, on the profile, readable and editable at any time.
//
// It used to be write-once and invisible. Sariah Duncan's wrist surgery, frozen
// shoulder and severely restricted external rotation were recorded the day she
// signed up and surfaced nowhere, so a programme was built without them.
//
// Clinical findings are pinned to the top and highlighted, because that is the
// part someone needs to see in the four seconds before they start programming.
// Saving writes to client_assessments; a database trigger mirrors the clinical
// fields onto the client record, so the two can never drift apart again.

import { useEffect, useState } from "react";
import { getAssessment, saveAssessment, type AssessmentFields } from "./assessmentActions";

type Row = Record<string, unknown>;

const OHSA_FLAGS: { key: string; label: string }[] = [
  { key: "feet_turn_out",          label: "Feet turn out" },
  { key: "knees_cave_in",          label: "Knees cave in" },
  { key: "excessive_forward_lean", label: "Excessive forward lean" },
  { key: "low_back_arch",          label: "Low back arches" },
  { key: "arms_fall_forward",      label: "Arms fall forward" },
  { key: "forward_head",           label: "Forward head" },
  { key: "lateral_asymmetry",      label: "Lateral asymmetry" },
  { key: "balance_deficits",       label: "Balance deficits" },
  { key: "hip_issues",             label: "Hip issues" },
];

const CLINICAL: { key: string; label: string; hint?: string }[] = [
  { key: "current_injuries",         label: "Current injuries" },
  { key: "prior_surgeries",          label: "Prior surgeries" },
  { key: "pain_location",            label: "Pain location" },
  { key: "pain_onset",               label: "Pain onset" },
  { key: "chronic_conditions",       label: "Chronic conditions" },
  { key: "medications",              label: "Medications" },
  { key: "contraindicated_movements",label: "Contraindicated movements", hint: "Anything that must never be programmed" },
];

const CONTEXT: { key: string; label: string }[] = [
  { key: "experience_level",       label: "Experience level" },
  { key: "activity_level",         label: "Activity level" },
  { key: "primary_goal",           label: "Primary goal" },
  { key: "secondary_goal",         label: "Secondary goal" },
  { key: "goal_timeline",          label: "Goal timeline" },
  { key: "session_length_minutes", label: "Session length (min)" },
  { key: "training_location",      label: "Training location" },
  { key: "equipment_access",       label: "Equipment access" },
];

export default function AssessmentTab({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<AssessmentFields>({});

  const load = async () => {
    setLoading(true);
    const res = await getAssessment(clientId);
    if (res.ok) setRow(res.assessment as Row | null);
    else setMsg(res.error);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clientId]);

  const startEdit = () => {
    const f: AssessmentFields = {};
    [...CLINICAL, ...CONTEXT].forEach(({ key }) => {
      (f as Record<string, unknown>)[key] = (row?.[key] as string | number | null) ?? "";
    });
    (f as Record<string, unknown>).ohsa_notes = (row?.ohsa_notes as string) ?? "";
    (f as Record<string, unknown>).goal_notes = (row?.goal_notes as string) ?? "";
    (f as Record<string, unknown>).trainer_notes = (row?.trainer_notes as string) ?? "";
    OHSA_FLAGS.forEach(({ key }) => { (f as Record<string, unknown>)[key] = row?.[key] === true; });
    setForm(f);
    setEditing(true);
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    const res = await saveAssessment(clientId, form);
    setSaving(false);
    if (res.ok) {
      setMsg("Saved — the client's injuries and medical notes were updated automatically.");
      setEditing(false);
      await load();
    } else {
      setMsg("Could not save: " + res.error);
    }
  };

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const txt = (k: string) => (row?.[k] ? String(row[k]) : null);

  if (loading) return <div className="p-4 text-sm" style={{ color: "var(--brand-text-secondary)" }}>Loading assessment…</div>;

  const hasClinical = CLINICAL.some(({ key }) => txt(key)) || txt("ohsa_notes");
  const flagsOn = OHSA_FLAGS.filter(({ key }) => row?.[key] === true);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Assessment</h3>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            {row?.assessed_at
              ? "Assessed " + new Date(String(row.assessed_at)).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })
              : "No assessment on file yet"}
          </p>
        </div>
        {!editing && (
          <button onClick={startEdit} className="text-sm font-bold px-3 py-2 rounded-xl"
            style={{ background: "var(--brand-primary)", color: "#fff" }}>
            {row ? "Edit" : "Add assessment"}
          </button>
        )}
      </div>

      {msg && (
        <div className="rounded-2xl p-3 text-xs"
          style={{ background: msg.startsWith("Could not") ? "#ef444414" : "#22c55e14",
                   color: msg.startsWith("Could not") ? "#ef4444" : "var(--brand-text)",
                   border: "1px solid " + (msg.startsWith("Could not") ? "#ef444440" : "#22c55e40") }}>
          {msg}
        </div>
      )}

      {/* Clinical first, and loud. This is what someone needs before programming. */}
      {!editing && (
        <>
          {hasClinical ? (
            <div className="rounded-3xl p-4 space-y-2"
              style={{ background: "#ef44440c", border: "1px solid #ef444440" }}>
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>
                Read before programming
              </div>
              {CLINICAL.map(({ key, label }) => txt(key) && (
                <div key={key} className="text-sm" style={{ color: "var(--brand-text)" }}>
                  <span className="font-semibold">{label}: </span>{txt(key)}
                </div>
              ))}
              {txt("ohsa_notes") && (
                <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--brand-text)" }}>
                  <span className="font-semibold">Movement screen: </span>{txt("ohsa_notes")}
                </div>
              )}
              {row?.medical_clearance === false && (
                <div className="text-sm font-semibold" style={{ color: "#ef4444" }}>⚠️ No medical clearance on file</div>
              )}
            </div>
          ) : (
            <div className="rounded-3xl p-4 text-sm"
              style={{ background: "var(--brand-surface)", border: "1px dashed var(--brand-border)", color: "var(--brand-text-secondary)" }}>
              No injuries, surgeries or movement-screen findings recorded for {clientName}. If that is wrong, add them — anything here is
              copied onto the client record automatically and is what programming reads.
            </div>
          )}

          {flagsOn.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {flagsOn.map(({ key, label }) => (
                <span key={key} className="text-xs font-semibold px-2 py-1 rounded-full"
                  style={{ background: "#f59e0b22", color: "#f59e0b" }}>{label}</span>
              ))}
            </div>
          )}

          <div className="rounded-3xl p-4 grid grid-cols-2 gap-3"
            style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
            {CONTEXT.map(({ key, label }) => (
              <div key={key} className="text-xs">
                <div style={{ color: "var(--brand-text-secondary)" }}>{label}</div>
                <div style={{ color: "var(--brand-text)" }}>{txt(key) ?? "—"}</div>
              </div>
            ))}
          </div>

          {(txt("goal_notes") || txt("trainer_notes")) && (
            <div className="rounded-3xl p-4 space-y-2"
              style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
              {txt("goal_notes") && <div className="text-sm" style={{ color: "var(--brand-text)" }}>
                <span className="font-semibold">Goal notes: </span>{txt("goal_notes")}</div>}
              {txt("trainer_notes") && <div className="text-sm whitespace-pre-wrap" style={{ color: "var(--brand-text)" }}>
                <span className="font-semibold">Trainer notes: </span>{txt("trainer_notes")}</div>}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="rounded-3xl p-4 space-y-3"
          style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
          {CLINICAL.map(({ key, label, hint }) => (
            <label key={key} className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {label}{hint && <span style={{ opacity: 0.7 }}> — {hint}</span>}
              <textarea rows={2} value={String((form as Record<string, unknown>)[key] ?? "")}
                onChange={e => set(key, e.target.value)}
                className="w-full rounded-xl p-2 mt-1 text-sm"
                style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
            </label>
          ))}

          <label className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            Movement screen (OHSA) notes
            <textarea rows={4} value={String((form as Record<string, unknown>).ohsa_notes ?? "")}
              onChange={e => set("ohsa_notes", e.target.value)}
              className="w-full rounded-xl p-2 mt-1 text-sm"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            {OHSA_FLAGS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs" style={{ color: "var(--brand-text)" }}>
                <input type="checkbox" checked={(form as Record<string, unknown>)[key] === true}
                  onChange={e => set(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CONTEXT.map(({ key, label }) => (
              <label key={key} className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>
                {label}
                <input value={String((form as Record<string, unknown>)[key] ?? "")}
                  onChange={e => set(key, e.target.value)}
                  className="w-full rounded-xl p-2 mt-1 text-sm"
                  style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
              </label>
            ))}
          </div>

          <label className="block text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            Trainer notes
            <textarea rows={3} value={String((form as Record<string, unknown>).trainer_notes ?? "")}
              onChange={e => set("trainer_notes", e.target.value)}
              className="w-full rounded-xl p-2 mt-1 text-sm"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} />
          </label>

          <div className="flex gap-2 pt-1">
            <button disabled={saving} onClick={save}
              className="flex-1 text-sm font-bold py-2 rounded-xl"
              style={{ background: "#22c55e", color: "#fff", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save assessment"}
            </button>
            <button disabled={saving} onClick={() => { setEditing(false); setMsg(null); }}
              className="flex-1 text-sm font-bold py-2 rounded-xl"
              style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
              Cancel
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
            Saving writes to the assessment. The client&apos;s injuries and medical notes update automatically — you never have to type it twice.
          </p>
        </div>
      )}
    </div>
  );
}
