"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Program {
  id: string;
  name: string;
  description: string | null;
}

interface Props {
  clientId: string;
  clientName: string;
  programs: Program[];
  currentProgramId?: string;
  onClose: () => void;
}

export default function AssignProgramModal({ clientId, clientName, programs, currentProgramId, onClose }: Props) {
  const [selectedProgramId, setSelectedProgramId] = useState(currentProgramId || "");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleAssign() {
    if (!selectedProgramId) { setError("Please select a program."); return; }
    setSaving(true);
    setError(null);
    try {
      // Deactivate any existing active assignments for this client
      await supabase
        .from("program_assignments")
        .update({ active: false })
        .eq("client_id", clientId)
        .eq("active", true);

      // Create new assignment
      const { error: insertErr } = await supabase
        .from("program_assignments")
        .insert({
          client_id: clientId,
          program_id: selectedProgramId,
          start_date: startDate,
          active: true,
        });

      if (insertErr) throw insertErr;

      router.refresh();
      onClose();
    } catch (e: any) {
      setError(e.message || "Failed to assign program.");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} />
      <div className="relative w-full lg:w-[480px] rounded-t-2xl lg:rounded-2xl overflow-hidden"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b"
          style={{ borderColor: "var(--brand-border)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--brand-text)" }}>Assign Program</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{clientName}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
            <i className="ti ti-x text-sm" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Program selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>
              Program
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {programs.length === 0 && (
                <p className="text-sm py-4 text-center" style={{ color: "var(--brand-text-secondary)" }}>
                  No programs in library yet.
                </p>
              )}
              {programs.map(p => (
                <button key={p.id}
                  onClick={() => setSelectedProgramId(p.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: selectedProgramId === p.id ? "var(--brand-primary)15" : "var(--brand-bg)",
                    border: `1px solid ${selectedProgramId === p.id ? "var(--brand-primary)" : "var(--brand-border)"}`,
                  }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: selectedProgramId === p.id ? "var(--brand-primary)" : "var(--brand-card)" }}>
                    <i className="ti ti-trophy text-base"
                      style={{ color: selectedProgramId === p.id ? "white" : "var(--brand-text-secondary)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--brand-text)" }}>{p.name}</p>
                    {p.description && (
                      <p className="text-xs truncate mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{p.description}</p>
                    )}
                  </div>
                  {selectedProgramId === p.id && (
                    <i className="ti ti-check text-base flex-shrink-0" style={{ color: "var(--brand-primary)" }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Start date */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide block mb-2"
              style={{ color: "var(--brand-text-secondary)" }}>
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              min={today}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm border"
              style={{
                background: "var(--brand-bg)",
                borderColor: "var(--brand-border)",
                color: "var(--brand-text)",
              }}
            />
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "#fef2f220", color: "#ef4444", border: "1px solid #ef444430" }}>
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "var(--brand-card)", color: "var(--brand-text-secondary)" }}>
              Cancel
            </button>
            <button onClick={handleAssign} disabled={saving || !selectedProgramId}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-opacity"
              style={{ background: "var(--brand-primary)", opacity: saving || !selectedProgramId ? 0.6 : 1 }}>
              {saving ? "Assigning\u2026" : "Assign Program"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
