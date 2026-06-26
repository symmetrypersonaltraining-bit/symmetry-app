"use client";
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";

export default function Movable({ storageKey, children, defaultStyle }: { storageKey: string; children: ReactNode; defaultStyle?: CSSProperties }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const d = useRef({ active: false, moved: false, offX: 0, offY: 0, hold: 0 as any });

  useEffect(() => { try { const p = localStorage.getItem(storageKey); if (p) setPos(JSON.parse(p)); } catch {} }, [storageKey]);

  function clamp(x: number, y: number) {
    const w = ref.current?.offsetWidth || 240;
    const h = ref.current?.offsetHeight || 90;
    return { x: Math.max(6, Math.min(window.innerWidth - w - 6, x)), y: Math.max(6, Math.min(window.innerHeight - h - 6, y)) };
  }
  function start(cx: number, cy: number) { const r = ref.current!.getBoundingClientRect(); d.current.offX = cx - r.left; d.current.offY = cy - r.top; d.current.active = true; setDragging(true); try { (navigator as any).vibrate && (navigator as any).vibrate(15); } catch {} }
  function move(cx: number, cy: number) { if (!d.current.active) return; d.current.moved = true; setPos(clamp(cx - d.current.offX, cy - d.current.offY)); }
  function end() { if (d.current.active) { setPos((p) => { if (p) { try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch {} } return p; }); } d.current.active = false; setDragging(false); clearTimeout(d.current.hold); }
  function ts(e: any) { d.current.moved = false; const t = e.touches[0]; d.current.hold = setTimeout(() => start(t.clientX, t.clientY), 300); }
  function tm(e: any) { const t = e.touches[0]; if (d.current.active) { e.preventDefault(); move(t.clientX, t.clientY); } else { clearTimeout(d.current.hold); } }
  function te() { clearTimeout(d.current.hold); end(); }
  function md(e: any) {
    d.current.moved = false;
    d.current.hold = setTimeout(() => start(e.clientX, e.clientY), 300);
    const mm = (ev: any) => { if (d.current.active) move(ev.clientX, ev.clientY); };
    const mu = () => { clearTimeout(d.current.hold); end(); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  }

  const base: CSSProperties = { ...(defaultStyle || {}), position: "fixed", zIndex: 900 };
  if (pos) { base.left = pos.x; base.top = pos.y; base.right = "auto"; base.bottom = "auto"; }
  return (
    <div ref={ref} onTouchStart={ts} onTouchMove={tm} onTouchEnd={te} onMouseDown={md}
      style={{ ...base, touchAction: dragging ? "none" : "auto", boxShadow: dragging ? "0 14px 44px rgba(0,0,0,.55)" : undefined, transition: dragging ? "none" : "box-shadow .2s", cursor: dragging ? "grabbing" : "grab" }}>
      {children}
    </div>
  );
}
