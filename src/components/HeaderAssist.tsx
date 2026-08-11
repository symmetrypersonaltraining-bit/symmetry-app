"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { startDictation, type DictationHandle } from "@/lib/dictation";
import { createClient } from "@/lib/supabase/client";
import { submitFeedback } from "@/lib/feedback";
import NotificationCenter from "@/components/NotificationCenter";
import { isTrainerEmail } from "@/lib/trainer";
/**
 * HeaderAssist — feedback (all users) + AI assistant (trainer only) buttons
 * living in the AppHeader top-right corner. Replaces the floating dock.
 * Self-contained: detects trainer + client-mode itself, writes feedback to
 * app_feedback, opens the AI panel via the existing "symmetry:open-ai" event.
 */

/**
 * Does this read like somebody logging a meal into the wrong box?
 *
 * Gerard, 1 Aug: logged M1 at 4:10pm, then at 4:14 and 4:20 typed "Had 1 cup
 * cream of wheat, fruit, and 2 eggs for breakfast" and "Had 4 protein pancakes
 * with pecans, blueberries, butter, milk and 1 egg with coconut water for
 * lunch" into the FEEDBACK box. Both landed in Dustin's bug list; neither
 * landed in his day. He had already done the hard part — writing the food out
 * — and the app filed it where nothing would ever count it.
 *
 * Deliberately narrow: past-tense eating language plus a meal name. It is
 * better to miss a few than to nag somebody writing a genuine bug report about
 * breakfast.
 */
export function looksLikeAMealLog(text: string): boolean {
  const t = (text || "").toLowerCase().trim();
  if (t.length < 12) return false;
  // A real bug report about food says something is wrong with the app.
  if (/\b(bug|broken|wrong|won'?t|can'?t|doesn'?t|error|crash|fix|issue|should be|not working)\b/.test(t)) return false;
  // Talking ABOUT the app is a bug report, however much food it mentions.
  // "App automatically doubling the value of the meal I logged for breakfast"
  // is a real report that this rule used to flag.
  if (/\b(app|screen|button|tab|page|log|logs|logged|logging|shows?|says?|macros|database|serving size|swap|doubl\w*)\b/.test(t)) return false;
  const ate = /\b(had|ate|eating|drank|just finished|for breakfast|for lunch|for dinner|as a snack)\b/.test(t);
  const meal = /\b(breakfast|lunch|dinner|snack|meal|shake|smoothie)\b/.test(t);
  const food = /\b(eggs?|oats?|rice|chicken|beef|steak|pancakes?|yogurt|protein|fruit|toast|coffee|salad|potato|cereal|wheat|milk|banana|apple|sandwich)\b/.test(t);
  return ate && (meal || food);
}

export default function HeaderAssist({ solid = false }: { solid?: boolean }) {
  const [isTrainer, setIsTrainer] = useState(false);
  const [clientMode, setClientMode] = useState(false);
  const [open, setOpen] = useState(false);
  const [sentiment, setSentiment] = useState<"like" | "change" | null>(null);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [listening, setListening] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const dictRef = useRef<DictationHandle | null>(null);

  const buzz = (m: number | number[]) => { try { (navigator as any).vibrate && (navigator as any).vibrate(m as any); } catch {} };

  useEffect(() => {
    (async () => { try { const sb: any = createClient(); const { data } = await sb.auth.getUser(); if (isTrainerEmail(data?.user?.email)) setIsTrainer(true); } catch {} })();
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

  function startVoice() {
    if (listening) { dictRef.current?.stop(); setListening(false); return; }
    dictRef.current = startDictation({
      onResult: (t) => setMsg((m) => (m ? m + " " : "") + t),
      onStart: () => setListening(true),
      onEnd: () => setListening(false),
      onUnavailable: (reason) => { setListening(false); console.error("dictation unavailable:", reason); alert("Voice input couldn't start — " + reason + "\n\nTap the mic again; if it keeps failing, tell Dustin this message."); },
    });
  }

  async function submit() {
    if (!msg.trim() && !sentiment && !file) return;
    setSending(true); buzz([10, 40, 10]);
    try {
      const sb: any = createClient();
      let source = "app";
      try { const m = localStorage.getItem("symmetry_view_mode"); if (m) source = m + "-app"; } catch {}
      const tag = sentiment === "like" ? "[LIKE] " : sentiment === "change" ? "[CHANGE] " : "";
      let photo_url: string | null = null;
      if (file) {
        try {
          const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
          const path = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const up = await sb.storage.from("feedback").upload(path, file, { upsert: false, contentType: file.type });
          if (!up.error) { const { data: pub } = sb.storage.from("feedback").getPublicUrl(path); photo_url = pub?.publicUrl || null; }
        } catch {}
      }
      // submitFeedback stamps WHO filed it and kicks off reading the
      // screenshot — see src/lib/feedback.ts. This path is the one that takes
      // photos, and every one of Jennifer's ten reports came through it.
      await submitFeedback(sb, { source, transcript: tag + msg.trim(), imageUrl: photo_url });
      setDone(true); setMsg(""); setSentiment(null); setFile(null);
      setTimeout(() => { setDone(false); setOpen(false); }, 1700);
    } catch {} finally { setSending(false); }
  }

  const hBtn: CSSProperties = { width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.3)", background: solid ? "var(--brand-primary)" : "rgba(255,255,255,0.12)", boxShadow: solid ? "0 4px 14px rgba(20,30,55,.3)" : "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <NotificationCenter solid={solid} />
        {isTrainer && !clientMode && (
          <button aria-label="AI assistant" style={{ ...hBtn, fontSize: 11, fontWeight: 700 }}
            onClick={() => { buzz(12); window.dispatchEvent(new CustomEvent("symmetry:open-ai")); }}>AI</button>
        )}
        <button aria-label="Send feedback" style={{ ...hBtn, fontSize: 16 }}
          onClick={() => { buzz(12); setOpen((o) => !o); }}>{open ? "\u00d7" : "\u2728"}</button>
      </div>

      {open && (
        <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", top: 64, zIndex: 1001, width: 290, maxWidth: "calc(100vw - 28px)", background: "var(--brand-card, #1b1f2a)", color: "var(--brand-text, #fff)", border: "1px solid var(--brand-border, rgba(255,255,255,.12))", borderRadius: 18, padding: 16, boxShadow: "0 16px 48px rgba(0,0,0,.5)" }}>
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
              {looksLikeAMealLog(msg) && (
                <div style={{ marginTop: 8, padding: "9px 11px", borderRadius: 11, border: "1px solid #e0a83e", background: "rgba(224,168,62,0.12)", fontSize: 12.5, lineHeight: 1.45 }}>
                  That reads like a meal. This box goes to Dustin as feedback — it will <b>not</b> count toward your day.
                  <a href="/nutrition" style={{ display: "block", marginTop: 6, fontWeight: 800, color: "var(--brand-primary)", textDecoration: "none" }}>
                    Log it in Nutrition instead →
                  </a>
                  <span style={{ opacity: 0.75 }}>Or send it anyway if you meant to.</span>
                </div>
              )}
              <button type="button" onClick={startVoice} style={{ marginTop: 8, width: "100%", padding: "9px 0", borderRadius: 11, border: "1px solid var(--brand-border, rgba(255,255,255,.15))", background: listening ? "var(--brand-primary)" : "transparent", color: listening ? "#fff" : "inherit", fontWeight: 600, cursor: "pointer" }}>{listening ? "Listening, tap to stop" : "Dictate with voice"}</button>
              <label style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "9px 10px", borderRadius: 11, border: "1px solid var(--brand-border, rgba(255,255,255,.15))", cursor: "pointer", fontSize: 13, boxSizing: "border-box" }}>
                <span style={{ fontWeight: 600 }}>{file ? "🖼️ " + file.name.slice(0, 22) : "📎 Attach image"}</span>
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} style={{ display: "none" }} />
              </label>
              {file && (
                <button type="button" onClick={() => setFile(null)} style={{ marginTop: 6, width: "100%", padding: "7px 0", borderRadius: 10, border: "none", background: "transparent", color: "var(--brand-text-secondary, #aab)", fontSize: 12, cursor: "pointer" }}>Remove image</button>
              )}
              <button onClick={submit} disabled={sending} style={{ marginTop: 10, width: "100%", padding: "11px 0", borderRadius: 12, border: "none", background: "var(--brand-primary)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: sending ? 0.6 : 1 }}>{sending ? "Sending..." : "Send to Coach Claude"}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}
