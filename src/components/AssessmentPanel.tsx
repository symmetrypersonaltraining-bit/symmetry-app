"use client";

// Assessment panel — read-only view of the client's latest movement assessment
// (client_assessments) inside the trainer profile Info tab. Self-contained and
// crash-safe: fetches its own data, renders nothing if no assessment exists.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Assessment = Record<string, unknown> & {
  assessed_at?: string | null;
  ai_assessment_summary?: string | null;
  ai_program_recommendation?: string | null;
  trainer_notes?: string | null;
};

const MOVEMENT_FLAGS: [string, string][] = [
  ["feet_turn_out", "Feet turn out"],
  ["excessive_forward_lean", "Forward lean"],
  ["knees_cave_in", "Knees cave in"],
  ["low_back_arch", "Low back arch"],
  ["arms_fall_forward", "Arms fall forward"],
  ["forward_head", "Forward head"],
  ["lateral_asymmetry", "Lateral asymmetry"],
  ["balance_deficits", "Balance deficits"],
];

const DETAIL_FIELDS: [string, string][] = [
  ["current_injuries", "Current injuries"],
  ["chronic_conditions", "Chronic conditions"],
  ["medications", "Medications"],
  ["pain_location", "Pain location"],
  ["hip_issues", "Hip issues"],
  ["prior_surgeries", "Prior surgeries"],
  ["ohsa_notes", "OHSA notes"],
  ["primary_goal", "Primary goal"],
  ["secondary_goal", "Secondary goal"],
  ["goal_timeline", "Goal timeline"],
  ["experience_level", "Experience"],
  ["days_per_week", "Days/week"],
  ["sleep_hours", "Sleep (hrs)"],
  ["stress_level", "Stress"],
  ["nutrition_notes", "Nutrition notes"],
];

export default function AssessmentPanel({ clientId }: { clientId: string }) {
  const [a, setA] = useState<Assessment | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from("client_assessments")
          .select("*")
          .eq("client_id", clientId)
          .order("assessed_at", { ascending: false })
          .limit(1);
        if (on && data && data[0]) setA(data[0] as Assessment);
      } catch { /* no assessment — render nothing */ }
    })();
    return () => { on = false; };
  }, [clientId]);

  if (!a) return null;

  const flags = MOVEMENT_FLAGS.filter(([k]) => a[k] === true).map(([, label]) => label);
  const details = DETAIL_FIELDS.map(([k, label]) => {
    const v = a[k];
    return v != null && String(v).trim() !== "" ? { label, value: String(v) } : null;
  }).filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        <div className="flex items-center gap-2">
          <i className="ti ti-clipboard-check text-base" style={{ color: "var(--brand-primary)" }} />
          <span className="font-semibold text-sm" style={{ color: "var(--brand-text)" }}>Assessment</span>
          {a.assessed_at ? (
            <span className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>
              {new Date(String(a.assessed_at)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          ) : null}
        </div>
        <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"} text-sm`} style={{ color: "var(--brand-text-secondary)" }} />
      </button>

      {flags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-3">
          {flags.map(f => (
            <span key={f} className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "#e84e4e18", color: "#e84e4e", border: "1px solid #e84e4e30" }}>{f}</span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          {a.ai_assessment_summary ? (
            <div className="text-xs rounded-xl px-3 py-2" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
              <span className="font-semibold" style={{ color: "var(--brand-primary)" }}>AI summary: </span>{String(a.ai_assessment_summary)}
            </div>
          ) : null}
          {details.map(d => (
            <div key={d.label} className="flex gap-2 text-xs">
              <span className="flex-shrink-0 font-semibold" style={{ color: "var(--brand-text-secondary)", minWidth: 110 }}>{d.label}</span>
              <span style={{ color: "var(--brand-text)" }}>{d.value}</span>
            </div>
          ))}
          {a.trainer_notes ? (
            <div className="text-xs rounded-xl px-3 py-2" style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
              <span className="font-semibold" style={{ color: "var(--brand-text-secondary)" }}>Trainer notes: </span>{String(a.trainer_notes)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
