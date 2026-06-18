"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/workout", label: "Workout", icon: "ti-barbell" },
  { href: "/schedule", label: "Schedule", icon: "ti-calendar" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/profile", label: "Profile", icon: "ti-user" },
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
        background: "white",
        borderColor: "#C8D8EC",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
          >
            <i
              className={`ti ${item.icon} text-xl`}
              style={{ color: active ? "#0F4C81" : "#4E6080" }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: active ? "#0F4C81" : "#4E6080" }}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
