"use client";

import { useTheme, THEMES } from "@/components/ThemeProvider";

export default function SettingsClient() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-6">
      {/* Color Theme */}
      <section>
        <p className="label mb-3">App Color Theme</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="rounded-xl p-3 border-2 transition-all text-left"
              style={{
                background: t.bg,
                borderColor: theme === t.id ? t.primary : "transparent",
                boxShadow: theme === t.id ? `0 0 0 2px ${t.primary}40` : "none",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg mb-2"
                style={{ background: t.primary }}
              />
              <div className="text-xs font-medium" style={{ color: t.primary }}>
                {t.label}
              </div>
              {theme === t.id && (
                <div className="text-[10px] mt-0.5" style={{ color: t.primary }}>
                  ✓ Active
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Notifications placeholder */}
      <section>
        <p className="label mb-3">Notifications</p>
        <div className="card">
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--brand-text)" }}>
                Client activity alerts
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Notify when clients log workouts
              </div>
            </div>
            <div
              className="w-10 h-6 rounded-full relative cursor-pointer"
              style={{ background: "var(--brand-primary)" }}
            >
              <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white shadow" />
            </div>
          </div>
        </div>
      </section>

      {/* Account */}
      <section>
        <p className="label mb-3">Account</p>
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--brand-text)" }}>Email</span>
            <span className="text-sm" style={{ color: "var(--brand-text-secondary)" }}>
              symmetrypersonaltraining@gmail.com
            </span>
          </div>
          <div
            className="border-t"
            style={{ borderColor: "var(--brand-border)" }}
          />
          <a
            href="/api/auth/signout"
            className="text-sm font-medium"
            style={{ color: "#EF4444" }}
          >
            Sign Out
          </a>
        </div>
      </section>
    </div>
  );
}
