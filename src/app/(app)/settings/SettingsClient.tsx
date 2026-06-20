"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTheme, THEMES } from "@/components/ThemeProvider";

interface Props {
  userEmail: string;
  userName: string;
  isTrainer: boolean;
}

export default function SettingsClient({ userEmail, userName, isTrainer }: Props) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [gcalSync] = useState(false); // OFF by default — activate manually when ready
  const [autoReminders] = useState(false); // OFF by default

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="space-y-8">

      {/* ── Profile ── */}
      <section>
        <p className="section-header">Profile</p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="client-avatar"
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: "var(--brand-primary)",
                fontSize: 18,
              }}
            >
              {userName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?"}
            </div>
            <div>
              <p className="font-semibold" style={{ color: "var(--brand-text)" }}>{userName || "—"}</p>
              <p className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>{userEmail}</p>
            </div>
            {isTrainer && (
              <span className="badge badge-primary ml-auto">Trainer</span>
            )}
          </div>
        </div>
      </section>

      {/* ── Color Theme ── */}
      <section>
        <p className="section-header">App Color Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="rounded-xl p-3 text-left transition-all"
              style={{
                background: t.bg,
                border: `2px solid ${theme === t.id ? t.primary : "transparent"}`,
                boxShadow: theme === t.id ? `0 0 0 3px ${t.primary}30, 0 2px 8px rgba(0,0,0,0.08)` : "0 1px 3px rgba(0,0,0,0.06)",
                transform: theme === t.id ? "scale(1.03)" : "scale(1)",
              }}
            >
              <div className="w-8 h-8 rounded-lg mb-2" style={{ background: t.primary }} />
              <div className="text-xs font-semibold" style={{ color: t.primary }}>{t.label}</div>
              {theme === t.id && (
                <div className="text-[10px] mt-0.5 font-medium" style={{ color: t.primary }}>
                  ✓ Active
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── Trainer-only: Integrations ── */}
      {isTrainer && (
        <section>
          <p className="section-header">Integrations</p>
          <div className="card p-4 space-y-4">
            {/* GCal Sync */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                  <i className="ti ti-brand-google mr-1.5" style={{ color: "#4285F4" }} />
                  Google Calendar Sync
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  2-way sync between app calendar and Google Calendar
                </p>
              </div>
              <div
                className="w-11 h-6 rounded-full relative transition-colors"
                style={{ background: gcalSync ? "var(--brand-primary)" : "var(--brand-border)", cursor: "not-allowed" }}
                title="Toggle when ready to activate sync"
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: gcalSync ? "calc(100% - 20px)" : "4px" }}
                />
              </div>
            </div>
            <div className="divider" />
            {/* Auto Reminders */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
                  <i className="ti ti-mail mr-1.5" style={{ color: "var(--brand-accent)" }} />
                  Automatic Payment Reminders
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                  Send email reminders automatically on due date
                </p>
              </div>
              <div
                className="w-11 h-6 rounded-full relative transition-colors"
                style={{ background: autoReminders ? "var(--brand-primary)" : "var(--brand-border)", cursor: "not-allowed" }}
                title="Set to Automatic — coming soon"
              >
                <div
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all"
                  style={{ left: autoReminders ? "calc(100% - 20px)" : "4px" }}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── App Info ── */}
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
            <span className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>Symmetry PT × Claude AI</span>
          </div>
        </div>
      </section>

      {/* ── Sign Out ── */}
      <section>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="btn btn-danger w-full"
          style={{ justifyContent: "center" }}
        >
          {signingOut ? (
            <>
              <i className="ti ti-loader animate-spin" />
              Signing out...
            </>
          ) : (
            <>
              <i className="ti ti-logout" />
              Sign Out
            </>
          )}
        </button>
      </section>

    </div>
  );
}
