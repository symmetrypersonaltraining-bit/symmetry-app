"use client";
import { useEffect, useState } from "react";

export default function VideoZoom() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-zoom-overlay]")) return;
      const v = t.closest("video") as HTMLVideoElement | null;
      if (!v) return;
      const url = v.currentSrc || v.getAttribute("src") || v.querySelector("source")?.getAttribute("src") || "";
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      try { v.pause(); } catch {}
      try { (navigator as any).vibrate && (navigator as any).vibrate(12); } catch {}
      setSrc(url);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSrc(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hardware/browser Back closes the enlarged video instead of leaving the page.
  useEffect(() => {
    if (!src) return;
    try { history.pushState({ ...(history.state || {}), __symZoom: true }, ""); } catch { /* noop */ }
    const onPop = () => setSrc(null);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      try { if (history.state && (history.state as { __symZoom?: boolean }).__symZoom) history.back(); } catch { /* noop */ }
    };
  }, [src]);

  if (!src) return null;
  return (
    <div data-zoom-overlay onClick={() => setSrc(null)} style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, cursor: "zoom-out", animation: "symm-rise .18s ease both" }}>
      <video src={src} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} style={{ width: "96vw", maxWidth: 760, maxHeight: "86vh", borderRadius: 14, background: "#000", boxShadow: "0 24px 70px rgba(0,0,0,.6)" }} />
      <button aria-label="Close video" onClick={() => setSrc(null)} style={{ position: "fixed", top: 16, right: 16, width: 42, height: 42, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontSize: 22, cursor: "pointer", zIndex: 2001 }}>{"\u00d7"}</button>
    </div>
  );
}
