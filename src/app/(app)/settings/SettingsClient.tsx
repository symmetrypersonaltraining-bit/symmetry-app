"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme, THEMES } from "@/components/ThemeProvider";

interface Props {
  userEmail: string;
  userName: string;
  isTrainer: boolean;
  isInClientMode: boolean;
  userId: string;
  gcalSyncEnabled?: boolean;
  gcalConnected?: boolean;
  gcalStatus?: string | null;
}

export default function SettingsClient({ userEmail, userName, isTrainer,
  isInClientMode, userId, gcalSyncEnabled, gcalConnected, gcalStatus }: Props) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [gcalSync, setGcalSync] = useState(gcalSyncEnabled ?? false);
  const [autoReminders, setAutoReminders] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [gcalBanner, setGcalBanner] = useState<string | null>(gcalStatus ?? null);

  useEffect(() => {
    if (gcalBanner) {
      const t = setTimeout(() => setGcalBanner(null), 5000);
      return () => clearTimeout(t);
    }
  }, [gcalBanner]);

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
    if (newPassword.length < 6) { setPasswordError("Password must be at least 6 characters"); return; }
    setUpdatingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) { setPasswordError(error.message); }
    else { setPasswordSuccess(true); setNewPassword(""); setConfirmPassword(""); setShowChangePassword(false); setTimeout(() => setPasswordSuccess(false), 3000); }
  }

  async function toggleGcalSync(val: boolean) {
    setGcalSync(val);
    const supabase = createClient();
    await supabase.from("trainer_settings").upsert({ user_id: userId, gcal_sync_enabled: val }, { onConflict: "user_id" });
  }

  const ACCENT_MAP: Record<string, string> = {
    pastel: "#5ec9a3", navy: "#0EA5E9", charcoal: "#555555", forest: "#43A047",
    gunmetal: "#607D8B", purple: "#7B1FA2", orange: "#E64A19", rose: "#E91E63",
    blush: "#FF4D8D", lagoon: "#FF7A59", orchid: "#00B295", berry: "#5A4FCF",
    slatepop: "#FF6B6B", plumdusk: "#E0568A", carbonneon: "#FF5DA2", midnight: "#79C0FF",
  };

  return (
    <div className="space-y-8">

      {gcalBanner && (
        <div style={{ background: gcalBanner === 'connected' ? 'rgba(94,201,163,.15)' : 'rgba(248,113,113,.15)', border: '1px solid ' + (gcalBanner === 'connected' ? '#5ec9a3' : '#f87171'), borderRadius: 12, padding: '12px 16px', color: gcalBanner === 'connected' ? '#5ec9a3' : '#f87171', fontWeight: 600, fontSize: 14 }}>
          {gcalBanner === 'connected' ? 'Google Calendar connected successfully!' : 'Google Calendar connection failed. Please try again.'}
        </div>
      )}

      <section>
        <p className="section-header">Profile</p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="client-avatar flex-shrink-0" style={{ width: 48, height: 48, borderRadius: 14, background: "var(--brand-primary)", fontSize: 18 }}>
              {userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate" style={{ color: "var(--brand-text)" }}>{userName || "—"}</p>
              <p className="text-sm truncate" style={{ color: "var(--brand-text-secondary)" }}>{userEmail}</p>
            </div>
            {isTrainer && <span className="badge badge-primary ml-auto flex-shrink-0">Trainer</span>}
          </div>
        </div>
      </section>

      <section>
        <p className="section-header">Security</p>
        <div className="card p-4">
          <button onClick={() => { setShowChangePassword(!showChangePassword); setPasswordError(""); }} className="flex items-center gap-2 text-sm font-semibold w-full text-left" style={{ color: "var(--brand-text)" }}>
            <i className="ti ti-lock" style={{ color: "var(--brand-primary)" }} />
            Change Password
            <i className={"ti ti-chevron-" + (showChangePassword ? "up" : "down") + " ml-auto text-xs"} style={{ color: "var(--brand-text-secondary)" }} />
          </button>
          {showChangePassword && (
            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              <input type="password" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} required />
              <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }} required />
              {passwordError && <p className="text-xs font-medium" style={{ color: "#ef4444" }}>{passwordError}</p>}
              <button type="submit" disabled={updatingPassword} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--brand-primary), var(--brand-accent))" }}>{updatingPassword ? "Updating..." : "Update Password"}</button>
            </form>
          )}
          {passwordSuccess && <p className="mt-3 text-xs font-semibold" style={{ color: "#22c55e" }}>Password updated successfully!</p>}
        </div>
      </section>

      <section>
        <p className="section-header">App Color Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => setTheme(t.id)} className="rounded-xl p-3 text-left transition-all" style={{ background: t.bg, border: "2px solid " + (theme === t.id ? t.primary : "transparent"), boxShadow: theme === t.id ? "0 0 0 3px " + t.primary + "30, 0 2px 8px rgba(0,0,0,0.08)" : "0 1px 3px rgba(0,0,0,0.06)", transform: theme === t.id ? "scale(1.03)" : "scale(1)" }}>
              <div className="w-8 h-8 rounded-lg mb-2 overflow-hidden flex">
                <div className="flex-1" style={{ background: t.bg }} />
                <div className="flex-1" style={{ background: t.primary }} />
                <div className="flex-1" style={{ background: ACCENT_MAP[t.id] ?? t.primary }} />
              </div>
              <div className="text-xs font-semibold" style={{ color: t.primary }}>{t.label}</div>
              {theme === t.id && <div className="text-[10px] mt-0.5 font-medium" style={{ color: t.primary }}>✓ Active</div>}
            </button>
          ))}
        </div>
      </section>

      {isTrainer && (
        <section>
          <p className="section-header">Integrations</p>
          <div className="card p-4 space-y-5">

            <div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                    <i className="ti ti-brand-google mr-1.5" style={{ color: "#4285F4" }} />
                    Google Calendar Sync
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                    {gcalConnected ? "Connected — 2-way sync active" : "Not connected — click to authorize"}
                  </p>
                </div>
                {gcalConnected ? (
                  <div className="w-11 h-6 rounded-full relative transition-colors" style={{ background: gcalSync ? "var(--brand-primary)" : "var(--brand-border)", cursor: "pointer" }} onClick={() => toggleGcalSync(!gcalSync)}>
                    <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: gcalSync ? "calc(100% - 20px)" : "4px" }} />
                  </div>
                ) : (
                  <a href="/api/auth/google" className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "#4285F4", textDecoration: "none" }}>
                    Connect
                  </a>
                )}
              </div>
              {gcalConnected && gcalSync && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={async () => {
                      const res = await fetch('/api/gcal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                      const j = await res.json();
                      alert('Sync complete: ' + (j.synced ?? 0) + ' sessions, ' + (j.payments ?? 0) + ' payments synced.');
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", cursor: "pointer" }}
                  >
                    Sync Now
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm('This will delete all app calendar events and re-sync from Google Calendar. Continue?')) return;
                      const res = await fetch('/api/gcal-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reset: true }) });
                      const j = await res.json();
                      alert('Reset sync complete: ' + (j.synced ?? 0) + ' sessions, ' + (j.payments ?? 0) + ' payments synced.');
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(248,113,113,.1)", border: "1px solid #f87171", color: "#f87171", cursor: "pointer" }}
                  >
                    Reset &amp; Re-sync
                  </button>
                </div>
              )}
            </div>

            <div className="divider" />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                  <i className="ti ti-bell mr-1.5" style={{ color: "var(--brand-accent)" }} />
                  Payment Reminder Notifications
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Notify clients in-app 1 week before payment due
                </p>
              </div>
              <div className="w-11 h-6 rounded-full relative transition-colors" style={{ background: autoReminders ? "var(--brand-primary)" : "var(--brand-border)", cursor: "pointer" }} onClick={() => setAutoReminders(!autoReminders)}>
                <div className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: autoReminders ? "calc(100% - 20px)" : "4px" }} />
              </div>
            </div>

          </div>
        </section>
      )}

      <section>
        <p className="section-header">About</p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>App Version</span>
            <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>1.0.0-beta</span>
          </div>
          <div className="divider" />
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>Built by</span>
            <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Symmetry PT x Claude AI</span>
          </div>
        </div>
      </section>

      <section>
        <button onClick={handleSignOut} disabled={signingOut} className="btn btn-danger w-full" style={{ justifyContent: "center" }}>
          {signingOut ? <><i className="ti ti-loader animate-spin" />Signing out...</> : <><i className="ti ti-logout" />Sign Out</>}
        </button>
      </section>

    </div>
  );
}
