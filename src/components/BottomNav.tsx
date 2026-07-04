"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/workout", label: "Workout", icon: "ti-barbell" },
  { href: "/nutrition", label: "Nutrition", icon: "ti-salad" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname.startsWith(href);
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
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative"
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full transition-all" style={{ background: "var(--brand-primary)" }} />
            )}
            <i
              className={`ti ${item.icon} text-xl transition-transform duration-300 ${active ? "scale-110 -translate-y-0.5" : ""}`}
              style={{ color: active ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: active ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
