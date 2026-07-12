"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import TrainerSidebar from "./TrainerSidebar";
import AIAssistant from "./AIAssistant";
import Logo from "./Logo";
import HeaderAssist from "./HeaderAssist";
import SessionDock from "./SessionDock";

interface Props {
  children: React.ReactNode;
}

// Client-mode bottom nav tabs
const CLIENT_NAV = [
  { href: "/client-preview", label: "Home",      icon: "ti-home" },
  { href: "/client-preview/nutrition",  label: "Nutrition", icon: "ti-salad" },
  { href: "/client-preview/progress",   label: "Progress",  icon: "ti-chart-line" },
  { href: "/workout",                   label: "Workout",   icon: "ti-barbell" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

export default function TrainerLayoutWrapper({ children }: Props) {
  const [clientMode, setClientMode] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = localStorage.getItem("symmetry_view_mode");
    if (stored === "client") setClientMode(true);
  }, []);

  function handleToggleMode() {
    const next = !clientMode;
    setClientMode(next);
    localStorage.setItem("symmetry_view_mode", next ? "client" : "trainer");
    if (next) {
      document["cookie"] = "symmetry_client_mode=1; path=/; max-age=86400";
    } else {
      document["cookie"] = "symmetry_client_mode=; path=/; max-age=0";
    }
    router.push(next ? "/client-preview" : "/home");
  }

  // ── CLIENT MODE ───────────────────────────────────────────────────────────
  if (clientMode) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: "var(--brand-bg)" }}>

        {/* Top bar — mirrors what a client would see on mobile */}
        <div className="flex items-center gap-3 px-4 pb-3 sticky top-0 z-40 shadow-sm"
          style={{ background: "var(--brand-primary)", paddingTop: "calc(12px + env(safe-area-inset-top))" }}>
          <Logo size={28} color="white" className="flex-shrink-0" />
          <div className="flex-1">
            <span className="text-white font-semibold text-sm">Symmetry</span>
            <span className="text-white/50 text-xs ml-2">· My Training</span>
          </div>
          <HeaderAssist />
        <button
            onClick={handleToggleMode}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.15)", color: "white" }}>
            <i className="ti ti-layout-dashboard text-sm" />
            Trainer View
          </button>
        </div>

        {/* Page content */}
        <div className="flex-1 pb-20 overflow-y-auto">
          {children}
        </div>

        <SessionDock />

        {/* Client bottom nav */}
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-end"
          style={{ background: "var(--brand-surface)", borderTop: "1px solid var(--brand-border)", paddingBottom: "env(safe-area-inset-bottom)" }}>
          {CLIENT_NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors"
                style={{ color: active ? "var(--brand-primary)" : "var(--brand-text-secondary)" }}>
                <i className={`ti ${item.icon} text-xl`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

      </div>
    );
  }

  // ── TRAINER MODE ───────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen" style={{ background: "var(--brand-bg)" }}>
      <TrainerSidebar
        clientMode={clientMode}
        onToggleClientMode={handleToggleMode}
        userName="Dustin Gautreaux"
        userInitials="DG"
      />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="lg:hidden h-14" />
        {/* Docked strip: reserves its own row, so these buttons never cover content */}
        <div style={{ position: "sticky", top: 0, zIndex: 40, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "8px 14px 6px", background: "var(--brand-bg)" }}>
          <button onClick={handleToggleMode} aria-label="Switch to client view" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "var(--brand-primary)", color: "white", border: "none", cursor: "pointer" }}><i className="ti ti-user text-sm" /> Client View</button>
          <HeaderAssist solid />
        </div>
        {children}
      </div>
      <SessionDock />
      <AIAssistant />
    </div>
  );
}
