"use client";
import { useEffect } from "react";

export default function HapticTap() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('button, [role="button"], a, [data-haptic], input[type="checkbox"], label')) {
        try { (navigator as any).vibrate && (navigator as any).vibrate(12); } catch {}
      }
    };
    document.addEventListener("click", onClick, { passive: true } as any);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
