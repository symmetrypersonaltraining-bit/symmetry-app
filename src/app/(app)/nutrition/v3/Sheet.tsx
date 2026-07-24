"use client";

// Nutrition v3 — generic bottom sheet (backdrop + slide-up), house style.

import { useEffect, useState } from "react";

export default function Sheet({
  title,
  subtitle,
  onClose,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-end"
      style={{ background: shown ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0)", transition: "background 0.2s" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-3xl"
        style={{
          background: "var(--brand-surface)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid var(--brand-border)",
          transform: shown ? "translateY(0)" : "translateY(102%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <span style={{ width: 38, height: 4, borderRadius: 2, background: "var(--brand-border)", display: "block" }} />
        </div>
        <div className="flex items-center justify-between px-5 pb-2">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} aria-label="Back" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)", fontSize: 16 }}>
                ‹
              </button>
            )}
            <div className="min-w-0">
              <h3 className="font-extrabold text-base truncate" style={{ color: "var(--brand-text)" }}>{title}</h3>
              {subtitle && <p className="text-xs truncate" style={{ color: "var(--brand-text-secondary)" }}>{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--brand-bg)", color: "var(--brand-text-secondary)", fontSize: 13 }}>
            ✕
          </button>
        </div>
        <div className="px-5 pb-7" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
