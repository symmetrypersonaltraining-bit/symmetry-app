"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/workout", label: "Workout", icon: "ti-barbell" },
  { href: "/nutrition", label: "Nutrition", icon: "ti-salad" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/messages", label: "Messages", icon: "ti-message-circle" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  // Poll this client's unread message count (~20s) for the Messages badge.
  useEffect(() => {
    let on = true;
    const supabase = createClient();
    async function load() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const isClientMode = typeof document !== "undefined" && document.cookie.split("; ").some((x) => x === "symmetry_client_mode=1");
        let scopeId: string | null = null;
        if (isClientMode) {
          const { data: myClient } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
          scopeId = myClient ? (myClient as { id: string }).id : null;
        }
        // Client badge INCLUDES broadcasts (announcements to them); excludes only
        // group (whose to_id is the sender, so it's never per-recipient unread).
        // BottomNav is client-only, so trainer self-broadcast copies never apply.
        let q = supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("to_id", user.id).is("read_at", null).is("deleted_at", null)
          .eq("is_group", false);
        if (scopeId) q = q.eq("client_id", scopeId);
        const { count } = await q;
        if (on) setUnread(count || 0);
      } catch { /* noop */ }
    }
    load();
    const iv = setInterval(load, 20000);
    return () => { on = false; clearInterval(iv); };
  }, [pathname]);

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
        const showBadge = item.href === "/messages" && unread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors relative"
          >
            {active && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-8 rounded-full transition-all" style={{ background: "var(--brand-primary)" }} />
            )}
            <span className="relative">
              <i
                className={`ti ${item.icon} text-xl transition-transform duration-300 ${active ? "scale-110 -translate-y-0.5" : ""}`}
                style={{ color: active ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}
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
