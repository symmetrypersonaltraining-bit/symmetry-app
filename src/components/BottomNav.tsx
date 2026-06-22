"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/workout", label: "Workout", icon: "ti-barbell" },
  { href: "/nutrition", label: "Nutrition", icon: "ti-salad" },
  { href: "/log", label: "Log", icon: "ti-circle-plus" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "var(--brand-surface)",
        borderTop: "1px solid var(--brand-border)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.08)",
        backdropFilter: "blur(12px)",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-around px-2 pt-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-1 min-w-[44px]"
              style={{
                color: active
                  ? "var(--brand-primary)"
                  : "var(--brand-text-secondary)",
              }}
            >
              <div
                className="flex items-center justify-center rounded-xl transition-all duration-200"
                style={{
                  width: 36,
                  height: 36,
                  background: active
                    ? "color-mix(in srgb, var(--brand-primary) 12%, transparent)"
                    : "transparent",
                  transform: active ? "scale(1.1)" : "scale(1)",
                }}
              >
                <i
                  className={`ti ${item.icon}`}
                  style={{ fontSize: 22, lineHeight: 1 }}
                />
              </div>
              <span className="text-[10px] font-medium leading-none">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
