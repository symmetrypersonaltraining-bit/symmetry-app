"use client";

// A collapsible group of settings sections.
//
// Dustin, 22 Aug: "clean up the settings in trainer app. it's waaaay too much.
// i need you to organize and consolidate and categorize the full menu to make
// it easier to navigate and simplify it."
//
// Settings had grown to ten flat sections — Profile, Payments, Billing,
// Experience, Notifications, Security, Theme, Integrations, Setup guide, AI,
// Client setup, Help, About — every one of them fully expanded, all the time,
// on one scroll. Nothing was hidden and nothing could be found.
//
// A wrapper rather than a rewrite, on purpose. Each section's markup is
// untouched and appears exactly once; this only decides whether the sections
// are drawn inside a collapsible card or straight onto the page as before.
// That is what makes "revert it in the morning" a real option rather than a
// promise — `classic` renders the original layout from the same source.
//
// Open/closed is remembered per person, per group, in localStorage: a setting
// you visit often should not need two taps every time.

import { useEffect, useState } from "react";

const KEY = "symmetry_settings_open_v1";

function readOpen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function SettingsGroup({
  id,
  title,
  sub,
  icon,
  defaultOpen = false,
  classic = false,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  icon: string;
  defaultOpen?: boolean;
  classic?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readOpen();
    if (typeof saved[id] === "boolean") setOpen(saved[id]);
    setReady(true);
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [id]: next }));
    } catch {
      /* private window — it just will not be remembered */
    }
  }

  // The old layout, from the same markup. No second copy to drift.
  if (classic) return <>{children}</>;

  return (
    <section>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-4 rounded-2xl text-left"
        style={{
          background: "var(--brand-surface)",
          border: "1px solid var(--brand-border)",
          borderBottomLeftRadius: open ? 0 : 16,
          borderBottomRightRadius: open ? 0 : 16,
        }}
      >
        <i className={`ti ${icon} text-xl`} style={{ color: "var(--brand-primary)" }} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold" style={{ color: "var(--brand-text)" }}>{title}</span>
          {sub ? (
            <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{sub}</span>
          ) : null}
        </span>
        <i
          className={`ti ti-chevron-${open ? "up" : "down"} text-sm`}
          style={{ color: "var(--brand-text-secondary)" }}
        />
      </button>

      {/* Rendered only when open. Kept out of the DOM rather than hidden with
          CSS so a closed group cannot run its own queries — several of these
          sections fetch on mount, and Settings was firing all of them at once
          on every visit. */}
      {ready && open ? (
        <div
          className="space-y-6 p-4 pt-5"
          style={{
            background: "var(--brand-bg)",
            border: "1px solid var(--brand-border)",
            borderTop: "none",
            borderBottomLeftRadius: 16,
            borderBottomRightRadius: 16,
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
