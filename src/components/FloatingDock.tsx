"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

export default function FloatingDock() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isTrainer, setIsTrainer] = useState(false);
  const [clientMode, setClientMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<"like" | "change" | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [listening, setListening] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const d = useRef({ active: false, moved: false, offX: 0, offY: 0, hold: 0 as any });

  const buzz = (m: number | number[]) => { try { (navigator as any).vibrate && (navigator as any).vibrate(m as any); } catch {} };

  useEffect(() => {
    try { const p = localStorage.getItem("symmetry_dock_pos"); if (p) setPos(JSON.parse(p)); } catch {}
    (async () => { try { const sb: any = createClient(); const { data } = await sb.auth.getUser(); if (data?.user?.email === TRAINER_EMAIL) setIsTrainer(true); } catch {} })();
    const checkClientMode = () => {
      try {
        const cookieOn = document.cookie.includes("symmetry_client_mode=1");
        const previewPath = window.location.pathname.startsWith("/client-preview");
        setClientMode(cookieOn || previewPath);
      } catch {}
    };
    checkClientMode();
    const t = setInterval(checkClientMode, 2000);
    return () => clearInterval(t);
  }, []);

  function clamp(x: number, y: number) {
    const w = dockRef.current?.offsetWidth || 120;
    const h = dockRef.current?.offsetHeight || 56;
    return { x: Math.max(6, Math.min(window.innerWidth - w - 6, x)), y: Math.max(6, Math.min(window.innerHeight - h - 6, y)) };
  }
  function start(cx: number, cy: number) {
    const r = dockRef.current!.getBoundingClientRect();
    d.current.offX = cx - r.left; d.current.offY = cy - r.top; d.current.active = true;
    setDragging(true); buzz(15);
  }
  function move(cx: number, cy: number) {
    if (!d.current.active) return;
    d.current.moved = true;
    setPos(clamp(cx - d.current.offX, cy - d.current.offY));
  }
  function end() {
    if (d.current.active) { setPos((p) => { if (p) { try { localStorage.setItem("symmetry_dock_pos", JSON.stringify(p)); } catch {} } return p; }); }
    d.current.active = false; setDragging(false); clearTimeout(d.current.hold);
  }
  function onTouchStart(e: any) { d.current.moved = false; const t = e.touches[0]; d.current.hold = setTimeout(() => start(t.clientX, t.clientY), 260); }
  function onTouchMove(e: any) { const t = e.touches[0]; if (d.current.active) { e.preventDefault(); move(t.clientX, t.clientY); } else { clearTimeout(d.current.hold); } }
  function onTouchEnd() { clearTimeout(d.current.hold); end(); }
  function onMouseDown(e: any) {
    d.current.moved = false;
    d.current.hold = setTimeout(() => start(e.clientX, e.clientY), 260);
    const mm = (ev: MouseEvent) => { if (d.current.active) move(ev.clientX, ev.clientY); };
    const mu = () => { clearTimeout(d.current.hold); end(); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  }

  function startVoice() {
    try {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SR) { alert("Voice input is not supported on this browser."); return; }
      const rec = new SR();
      rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      rec.onresult = (e: any) => { const t = e.results[0][0].transcript; setMsg((m) => (m ? m + " " : "") + t); };
      rec.start();
    } catch { setListening(false); }
  }
  async function submit() {
    if (!msg.trim() && !sentiment) return;
    setSending(true); buzz([10, 40, 10]);
    try {
      const sb: any = createClient();
      let source = "app";
      try { const m = localStorage.getItem("symmetry_view_mode"); if (m) source = m + "-app"; } catch {}
      const tag = sentiment === "like" ? "[LIKE] " : sentiment === "change" ? "[CHANGE] " : "";
      await sb.from("app_feedback").insert({ source, client_context: typeof window !== "undefined" ? window.location.pathname : null, transcript: tag + msg.trim(), status: "new" });
      setDone(true); setMsg(""); setSentiment(null);
      setTimeout(() => { setDone(false); setOpen(false); }, 1700);
    } catch {} finally { setSending(false); }
  }

  const dockStyle: CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 1000 }
    : { position: "fixed", right: 14, bottom: 18, zIndex: 1000 };
  const btn: CSSProperties = { width: 52, height: 52, borderRadius: 16, border: "none", background: "var(--brand-primary)", color: "#fff", boxShadow: "0 8px 24px rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", touchAction: "none" };

  return (
    <>
      <div ref={dockRef} style={{ ...dockStyle, display: "flex", gap: 8, touchAction: dragging ? "none" : "auto", transform: dragging ? "scale(1.04)" : "none", transition: dragging ? "none" : "transform .15s ease" }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onMouseDown={onMouseDown}>
        {isTrainer && !clientMode && (
          <button aria-label="AI assistant" style={{ ...btn, fontSize: 13, fontWeight: 700 }}
            onClick={() => { if (d.current.moved) return; buzz(12); window.dispatchEvent(new CustomEvent("symmetry:open-ai")); }}>AI</button>
        )}
        <button aria-label="Send feedback" style={{ ...btn, fontSize: 22 }}
          onClick={() => { if (d.current.moved) return; buzz(12); setOpen((o) => !o); }}>{open ? "\u00d7" : "\u2728"}</button>
      </div>

      {open && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 96, zIndex: 1001, width: 290, maxWidth: "calc(100vw - 28px)", background: "var(--brand-card, #1b1f2a)", color: "var(--brand-text, #fff)", border: "1px solid var(--brand-border, rgba(255,255,255,.12))", borderRadius: 18, padding: 16, boxShadow: "0 16px 48px rgba(0,0,0,.5)" }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "18px 6px", fontWeight: 600 }}>Sent &mdash; thanks, I&apos;m on it.</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Send feedback</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button onClick={() => { buzz(12); setSentiment("like"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 11, cursor: "pointer", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: sentiment === "like" ? "var(--brand-primary)" : "transparent", color: sentiment === "like" ? "#fff" : "inherit", fontWeight: 600 }}>Like</button>
                <button onClick={() => { buzz(12); setSentiment("change"); }} style={{ flex: 1, padding: "9px 0", borderRadius: 11, cursor: "pointer", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: sentiment === "change" ? "var(--brand-primary)" : "transparent", color: sentiment === "change" ? "#fff" : "inherit", fontWeight: 600 }}>Change</button>
              </div>
              <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="What do you like, or what should change?" style={{ width: "100%", resize: "vertical", borderRadius: 11, padding: "9px 10px", fontSize: 14, background: "var(--brand-surface, rgba(0,0,0,.25))", color: "inherit", border: "1px solid var(--brand-border, rgba(255,255,255,.15))", boxSizing: "border-box" }} />
              <button type="button" onClick={startVoice} style={{ marginTop: 8, width: "100%", padding: "9px 0", borderRadius: 11, border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: listening ? "var(--brand-primary)" : "transparent", color: listening ? "#fff" : "inherit", fontWeight: 600, cursor: "pointer" }}>{listening ? "Listening, tap to stop" : "Dictate with voice"}</button>
              <button onClick={submit} disabled={sending} style={{ marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: sending ? 0.6 : 1 }}>{sending ? "Sending..." : "Send to Coach Claude"}</button>
              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6, textAlign: "center" }}>Tip: press &amp; hold the buttons to drag them anywhere.</div>
            </>
          )}
        </div>
      )}
    </>
  );
}
