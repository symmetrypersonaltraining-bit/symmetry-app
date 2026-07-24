"use client";

// Real client bottom nav — thin wrapper over the shared AppBottomNav so it can
// never drift from the trainer Client View nav (both use AppBottomNav).

import AppBottomNav, { NavItem } from "./AppBottomNav";

const ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: "ti-home" },
  { href: "/workout", label: "Workout", icon: "ti-barbell" },
  { href: "/nutrition", label: "Nutrition", icon: "ti-salad" },
  { href: "/progress", label: "Progress", icon: "ti-chart-line" },
  { href: "/messages", label: "Messages", icon: "ti-message-circle", badge: "messages" },
  { href: "/settings", label: "Settings", icon: "ti-settings" },
];

export default function BottomNav() {
  return <AppBottomNav items={ITEMS} />;
}
