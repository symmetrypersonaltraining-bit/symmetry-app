"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

interface SidebarItem {
  href?: string;
  label: string;
  icon: string;
  children?: { href: string; label: string; icon?: string }[];
}

const TRAINER_NAV: SidebarItem[] = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/schedule", label: "Schedule", icon: "ti-calendar" },
  { href: "/clients", label: "Clients", icon: "ti-users" },
  { href: "/messages", label: "Messages", icon: "ti-message-circle" },
  {
    label: "Library",
    icon: "ti-books",
    children: [
      { href: "/library/exercises", label: "Exercise Library", icon: "ti-barbell" },
      { href: "/library/workouts", label: "Workouts", icon: "ti-list-check" },
      { href: "/library/programs", label: "Programs", icon: "ti-trophy" },
    ],
  },
  { href: "/nutrition", label: "Nutrition", icon: "ti-salad" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/payments", label: "Payments", icon: "ti-credit-card" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

function isChildActive(children: { href: string }[], pathname: string) {
  return children.some((c) => pathname.startsWith(c.href));
}

interface Props {
  clientMode?: boolean;
  onToggleClientMode?: () => void;
  userName?: string;
  userInitials?: string;
}

export default function TrainerSidebar({
  clientMode = false,
  onToggleClientMode,
  userName = "Dustin",
  userInitials = "DG",
}: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  useEffect(() => {
    for (const item of TRAINER_NAV) {
      if (item.children && isChildActive(item.children, pathname)) {
        setOpenAccordion(item.label);
        break;
      }
    }
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href?: string) {
    if (!href) return false;
    if (href === "/home") return pathname === "/home" || pathname === "/";
    return pathname.startsWith(href);
  }

  function toggleAccordion(label: string) {
    setOpenAccordion((prev) => (prev === label ? null : label));
  }

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: "linear-gradient(180deg, #0D3F6E 0%, #0F4C81 40%, #0A3A6B 100%)", color: "white" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(0,0,0,0.15)" }}>
        <Link href="/home" className="flex items-center gap-2 flex-1 min-w-0">
          <Logo size={collapsed ? 36 : 40} color="white" className="flex-shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-white font-semibold text-sm leading-tight">Symmetry</div>
              <div className="text-white/60 text-[10px] tracking-widest uppercase">Personal Training</div>
            </div>
          )}
        </Link>
        <button onClick={() => setCollapsed((v) => !v)}
          className="hidden lg:flex w-7 h-7 rounded items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.1)" }}>
          <i className={`ti ${collapsed ? "ti-chevron-right" : "ti-chevron-left"} text-sm text-white/70`} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {TRAINER_NAV.map((item) => {
          if (item.children) {
            const expanded = openAccordion === item.label;
            const childActive = isChildActive(item.children, pathname);
            return (
              <div key={item.label}>
                <button
                  onClick={() => { toggleAccordion(item.label); if (collapsed) setCollapsed(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all text-left"
                  style={{ background: childActive || expanded ? "rgba(255,255,255,0.15)" : "transparent" }}>
                  <i className={`ti ${item.icon} text-lg flex-shrink-0`}
                    style={{ color: childActive ? "white" : "rgba(255,255,255,0.7)" }} />
                  {!collapsed && (
                    <span className="flex-1 flex items-center">
                      <span className="flex-1 text-sm font-medium"
                        style={{ color: childActive ? "white" : "rgba(255,255,255,0.85)" }}>
                        {item.label}
                      </span>
                      <i className={`ti ${expanded ? "ti-chevron-down" : "ti-chevron-right"} text-xs`}
                        style={{ color: "rgba(255,255,255,0.4)" }} />
                    </span>
                  )}
                </button>
                {!collapsed && expanded && (
                  <div className="ml-4 mb-1 border-l pl-3" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
                    {item.children.map((child) => (
                      <Link key={child.href} href={child.href}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 transition-all text-sm"
                        style={{
                          background: pathname.startsWith(child.href) ? "rgba(255,255,255,0.18)" : "transparent",
                          color: pathname.startsWith(child.href) ? "white" : "rgba(255,255,255,0.7)",
                          fontWeight: pathname.startsWith(child.href) ? 500 : 400,
                        }}>
                        {child.icon && <i className={`ti ${child.icon} text-base`} />}
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link key={item.href} href={item.href!}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all"
              style={{
                background: isActive(item.href) ? "rgba(255,255,255,0.18)" : "transparent",
                borderLeft: isActive(item.href) ? "3px solid white" : "3px solid transparent",
                boxShadow: isActive(item.href) ? "inset 0 0 20px rgba(255,255,255,0.05)" : "none",
              }}>
              <i className={`ti ${item.icon} text-lg flex-shrink-0`}
                style={{ color: isActive(item.href) ? "white" : "rgba(255,255,255,0.65)", filter: isActive(item.href) ? "drop-shadow(0 0 6px rgba(255,255,255,0.4))" : "none" }} />
              {!collapsed && (
                <span className="text-sm font-semibold"
                  style={{ color: isActive(item.href) ? "white" : "rgba(255,255,255,0.82)" }}>
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
        {onToggleClientMode && (
          <button onClick={onToggleClientMode}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-2 transition-all"
            style={{ background: clientMode ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.1)" }}>
            <i className={`ti ${clientMode ? "ti-user-bolt" : "ti-transfer"} text-lg flex-shrink-0 text-white`} />
            {!collapsed && (
              <div className="flex-1 text-left">
                <div className="text-xs font-semibold text-white">{clientMode ? "Client View" : "Trainer View"}</div>
                <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {clientMode ? "Tap to switch to Trainer" : "Tap to see your client app"}
                </div>
              </div>
            )}
          </button>
        )}
        <Link href="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg"
          style={{ background: isActive("/profile") ? "rgba(255,255,255,0.15)" : "transparent" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>
            {userInitials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{userName}</div>
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>Trainer</div>
            </div>
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <div>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 flex items-center px-4 gap-3"
        style={{ paddingTop: "calc(12px + env(safe-area-inset-top))", paddingBottom: "12px", background: "linear-gradient(135deg, #0D3F6E, #0F4C81)" }}>
        <button onClick={() => setMobileOpen(true)}
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.15)" }}>
          <i className="ti ti-menu-2 text-xl text-white" />
        </button>
        <Logo size={32} color="white" className="flex-shrink-0" />
        <div className="flex-1">
          <div className="text-white font-semibold text-sm">Symmetry</div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setMobileOpen(false)} />
          <div className="relative w-72 max-w-[85vw] h-full overflow-y-auto shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-200 h-screen sticky top-0"
        style={{ width: collapsed ? 64 : 240 }}>
        {sidebarContent}
      </div>
    </div>
  );
}
