"use client";
import { useEffect, useState } from "react";

export default function ChartZoom() {
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-zoom-overlay]")) return;
      if (target.closest('button, a, input, textarea, select, [role="button"], [data-no-zoom]')) return;
      const svg = target.closest("svg") as SVGSVGElement | null;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      if (r.width < 150 || r.height < 90) return;
      e.preventDefault();
      e.stopPropagation();
      try { (navigator as any).vibrate && (navigator as any).vibrate(12); } catch {}
      const inner = svg.outerHTML.replace(/<svg /, '<svg style="width:100%;height:auto;max-height:74vh;display:block" ');
      setMarkup(inner);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMarkup(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Hardware/browser Back closes the enlarged chart instead of leaving the page.
  useEffect(() => {
    if (!markup) return;
    try { history.pushState({ ...(history.state || {}), __symZoom: true }, ""); } catch { /* noop */ }
    const onPop = () => setMarkup(null);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      try { if (history.state && (history.state as { __symZoom?: boolean }).__symZoom) history.back(); } catch { /* noop */ }
    };
  }, [markup]);

  if (!markup) return null;
  return (
    <div
      data-zoom-overlay
      onClick={() => setMarkup(null)}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, cursor: "zoom-out", animation: "symm-rise .18s ease both" }}
    >
      <div
        className="symm-pop"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "96vw", maxWidth: 720, background: "var(--brand-card, #11161f)", border: "1px solid var(--brand-border, rgba(255,255,255,.12))", borderRadius: 16, padding: 16, boxShadow: "0 24px 70px rgba(0,0,0,.6)" }}
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      <button aria-label="Close enlarged chart" onClick={() => setMarkup(null)} style={{ position: "fixed", top: 16, right: 16, width: 42, height: 42, borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontSize: 22, cursor: "pointer", zIndex: 2001 }}>{"\u00d7"}</button>
    </div>
  );
}
