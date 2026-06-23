"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import MetricCards from "@/components/MetricCards";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default function ClientPreviewProgressPage() {
  const supabase = createClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("Dustin");
  const [showLogModal, setShowLogModal] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = "/login"; return; }

      let cr: { id: string; name: string } | null = null;
      if (user.email === TRAINER_EMAIL) {
        const { data } = await supabase.from("clients").select("id, name").ilike("name", "%Dustin%").maybeSingle();
        cr = data;
      } else {
        const { data } = await supabase.from("clients").select("id, name").eq("auth_user_id", user.id).maybeSingle();
        cr = data;
      }
      if (!cr) return;
      setClientId(cr.id);
      setClientName(cr.name || "Dustin");
    };
    init();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--brand-bg)" }}>
      <div style={{ background: "#0F4C81" }} className="px-4 py-4">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 className="text-white font-medium text-lg">Progress</h1>
            <p className="text-white/60 text-sm">{clientName}</p>
          </div>
          <button
            onClick={() => setShowLogModal(true)}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 10,
              color: "white", fontWeight: 700, fontSize: 13, padding: "8px 14px",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}>
            <i className="ti ti-plus text-sm" />
            Log
          </button>
        </div>
      </div>

      <div style={{ padding: "12px 16px 24px" }}>
        {clientId && (
          <MetricCards clientId={clientId} isTrainer={false} />
        )}
        {!clientId && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--brand-text-secondary)" }}>Loading...</div>
        )}
      </div>

      {/* Quick log modal (bottom sheet) */}
      {showLogModal && clientId && (
        <LogModal
          clientId={clientId}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}

function LogModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const supabase = createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!weight && !bodyFat) return;
    setSaving(true);
    const w = weight ? parseFloat(weight) : null;
    const bf = bodyFat ? parseFloat(bodyFat) : null;
    const lean = w !== null && bf !== null ? w * (1 - bf / 100) : null;
    const fat = w !== null && bf !== null ? w * (bf / 100) : null;

    await supabase.from("metrics").upsert({
      client_id: clientId,
      metric_date: date,
      ...(w !== null && { weight: w }),
      ...(bf !== null && { body_fat_pct: bf }),
      ...(lean !== null && { lean_mass: lean }),
      ...(fat !== null && { fat_mass: fat }),
      source: "client_app",
    }, { onConflict: "client_id,metric_date" });

    setSaving(false);
    setSuccess(true);
    setTimeout(() => { onClose(); }, 900);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--brand-surface)", borderRadius: "16px 16px 0 0", padding: "24px 20px 40px", width: "100%", maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--brand-text)" }}>Log Measurements</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brand-text-secondary)", fontSize: 20 }}>\u00d7</button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Weight (lbs)</label>
          <input type="number" step="0.1" placeholder="e.g. 185.5" value={weight} onChange={e => setWeight(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 600 }}>Body Fat % (optional)</label>
          <input type="number" step="0.1" placeholder="e.g. 18.5" value={bodyFat} onChange={e => setBodyFat(e.target.value)}
            style={{ width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--brand-border)", background: "var(--brand-bg)", color: "var(--brand-text)", fontSize: 14 }} />
        </div>
        <button onClick={handleSave} disabled={saving || success || (!weight && !bodyFat)}
          style={{ width: "100%", padding: "13px", borderRadius: 10, border: "none", background: success ? "#22c55e" : "var(--brand-primary)", color: "white", fontWeight: 700, fontSize: 15, cursor: "pointer", opacity: (!weight && !bodyFat) ? 0.5 : 1 }}>
          {success ? "\u2713 Saved!" : saving ? "Saving..." : "Save Measurement"}
        </button>
      </div>
    </div>
  );
}
