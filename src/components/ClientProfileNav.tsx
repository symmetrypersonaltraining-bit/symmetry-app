"use client";

import Link from "next/link";

// Additive, presentational-only nav for moving between one client's profile
// sections without backing all the way out. Crash-safe: no hooks, no data
// fetching, pure props. Renders nothing if clientId is missing.
export default function ClientProfileNav({
  clientId,
  active,
}: {
  clientId: string;
  active?: "profile" | "training" | "program" | "progress" | "nutrition";
}) {
  if (!clientId) return null;

  const items = [
    { key: "profile",   label: "Profile",   icon: "ti-user",       href: `/clients/${clientId}` },
    { key: "training",  label: "Training",  icon: "ti-calendar",   href: `/clients/${clientId}?tab=training` },
    { key: "program",   label: "Program",   icon: "ti-barbell",    href: `/clients/${clientId}/program` },
    { key: "progress",  label: "Progress",  icon: "ti-chart-line", href: `/clients/${clientId}?tab=metrics` },
    { key: "nutrition", label: "Nutrition", icon: "ti-salad",      href: `/nutrition?clientId=${clientId}` },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b"
      style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)", flexShrink: 0 }}>
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <Link key={it.key} href={it.href}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors"
            style={{
              background: isActive ? "var(--brand-primary)" : "var(--brand-bg)",
              color: isActive ? "white" : "var(--brand-text-secondary)",
              border: `1px solid ${isActive ? "var(--brand-primary)" : "var(--brand-border)"}`,
            }}>
            <i className={`ti ${it.icon} text-sm`} />
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}
