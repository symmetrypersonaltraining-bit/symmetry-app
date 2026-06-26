"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      <Link href="/home" className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
        <i className="ti ti-home text-xl"
          style={{ color: isActive("/home") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }} />
        <span className="text-[10px] font-medium"
          style={{ color: isActive("/home") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>Home</span>
      </Link>

      <Link href="/workout" className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
        <i className="ti ti-barbell text-xl"
          style={{ color: isActive("/workout") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }} />
        <span className="text-[10px] font-medium"
          style={{ color: isActive("/workout") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>Workout</span>
      </Link>

      <Link href="/nutrition" className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
        <i className="ti ti-salad text-xl"
          style={{ color: isActive("/nutrition") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }} />
        <span className="text-[10px] font-medium"
          style={{ color: isActive("/nutrition") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>Nutrition</span>
      </Link>

      <Link href="/progress" className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors">
        <i className="ti ti-chart-line text-xl"
          style={{ color: isActive("/progress") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }} />
        <span className="text-[10px] font-medium"
          style={{ color: isActive("/progress") ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>Progress</span>
      </Link>
    </nav>
  );
}
