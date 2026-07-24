"use client";

// Shared client bottom-nav renderer used by BOTH the real client BottomNav and
// the trainer Client View nav — so tabs, order, icons, active state AND the
// Messages unread badge can never drift between them. Only the href list
// differs (real routes vs client-preview routes for pages that aren't
// client-mode-aware); everything visual/behavioral is one component.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUnreadCount } from "@/lib/useUnreadCount";

export interface NavItem {
  href: string;
  label: string;
  icon: string;   // tabler icon class, e.g. "ti-home"
  activeMatch?: string; // path prefix that marks this tab active (defaults to href)
  badge?: "messages"; // show the unread badge on this tab
}

export default function AppBottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const unread = useUnreadCount();

  function isActive(item: NavItem) {
    const base = item.activeMatch || item.href;
    if (base === "/home" || base === "/client-preview") return pathname === base || pathname === "/" || pathname === base + "/";
    return pathname === base || pathname.startsWith(base + "/") || pathname === base;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex border-t z-50"
      style={{
        background: "var(--brand-surface)",
        borderColor: "var(--brand-border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((item) => {
        const active = isActive(item);
        const showBadge = item.badge === "messages" && unread > 0;
        const blink = showBadge; // Messages tab blinks (icon + label) on unread — a 2nd, unmissable notification
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative"
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full transition-all" style={{ background: "var(--brand-primary)" }} />
            )}
            <span className="relative">
              <i
                className={`ti ${item.icon} text-xl transition-transform duration-300 ${active ? "scale-110 -translate-y-0.5" : ""}`}
                style={{
                  color: blink ? "#ef4444" : active ? "var(--brand-primary)" : "var(--brand-text-secondary)",
                  animation: blink ? "cw-blink 1s ease-in-out infinite" : undefined,
                }}
              />
              {showBadge && (
                <span
                  aria-label={`${unread} unread messages`}
                  style={{
                    position: "absolute", top: -5, right: -8, minWidth: 15, height: 15, padding: "0 4px",
                    borderRadius: 999, background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 0 0 2px var(--brand-surface)", animation: "cw-pulse 1.3s ease-in-out infinite",
                  }}
                >
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span
              className="text-[10px] font-medium"
              style={{
                color: blink ? "#ef4444" : active ? "var(--brand-primary)" : "var(--brand-text-secondary)",
                animation: blink ? "cw-blink 1s ease-in-out infinite" : undefined,
              }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
