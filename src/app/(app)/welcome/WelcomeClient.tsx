"use client";

// Three steps, in the order that matters: a password you chose, the app on your
// home screen, notifications if you want them. Then straight into your day.
//
// The rule this screen follows: nothing here is mandatory except the password,
// and even that can wait. Onboarding that traps somebody is how you get a client
// who never opens the app again.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InstallPrompt, { isIos, isStandalone } from "@/components/InstallPrompt";
import KeyboardSafeArea from "@/components/KeyboardSafeArea";

import { useCoach } from "@/lib/useCoach";

export default function WelcomeClient({ firstName, clientId, needsIntake }: { firstName: string; clientId: string | null; needsIntake?: boolean }) {
  const { firstName: coachFirstName } = useCoach();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [notifState, setNotifState] = useState<string>("default");

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());
    try { setNotifState(typeof Notification !== "undefined" ? Notification.permission : "unsupported"); } catch { setNotifState("unsupported"); }
  }, []);

  async function savePassword() {
    if (busy) return;
    if (pw.length < 8) { setError("Make it at least 8 characters."); return; }
    if (pw !== pw2) { setError("Those two don't match."); return; }
    setBusy(true); setError(null);
    try {
      const sb = createClient();
      const { error: upErr } = await sb.auth.updateUser({ password: pw });
      if (upErr) { setError(upErr.message); return; }
      // The flags the rest of the app reads to decide whether someone is new.
      if (clientId) {
        await sb.from("client_app_settings").upsert(
          { client_id: clientId, password_is_temporary: false, first_login_completed: true },
          { onConflict: "client_id" },
        );
      }
      setStep(2);
    } catch {
      setError("Couldn't save that — check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function askNotifications() {
    try {
      if (typeof Notification === "undefined") return;
      const res = await Notification.requestPermission();
      setNotifState(res);
    } catch { /* denied or unsupported; not worth an error message */ }
  }

  const card: React.CSSProperties = {
    background: "var(--brand-surface)", border: "1px solid var(--brand-border)",
    borderRadius: 18, padding: 18, marginBottom: 14,
  };
  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "12px 12px", borderRadius: 12,
    border: "1px solid var(--brand-border)", background: "var(--brand-card)",
    color: "var(--brand-text)", fontSize: 16, // 16px or iOS zooms the page on focus
  };
  const primary: React.CSSProperties = {
    width: "100%", padding: 14, borderRadius: 14, border: "none",
    background: "var(--brand-primary)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
  };
  const ghost: React.CSSProperties = {
    width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--brand-border)",
    background: "transparent", color: "var(--brand-text-secondary)", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
  };

  return (
    // Step 1 is two password fields. On a short phone the keyboard reaches the
    // "Save and continue" button, and a client who cannot finish this screen is
    // a client who never gets into the app. See KeyboardSafeArea.
    <KeyboardSafeArea style={{ padding: "26px 16px 100px", background: "var(--brand-bg)" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 10 }} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "var(--brand-text)", margin: "0 0 4px" }}>
          Welcome, {firstName}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--brand-text-secondary)", margin: 0, lineHeight: 1.5 }}>
          Two quick things and you're in. Takes about a minute.
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 }}>
        {[1, 2, 3].map((n) => (
          <span key={n} style={{
            width: step === n ? 22 : 7, height: 7, borderRadius: 999,
            background: step >= n ? "var(--brand-primary)" : "var(--brand-border)",
            transition: "width .2s",
          }} />
        ))}
      </div>

      {/* ── 1. A password they chose ───────────────────────────────── */}
      {step === 1 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--brand-text)", margin: "0 0 6px" }}>Pick a password</h2>
          <p style={{ fontSize: 13, color: "var(--brand-text-secondary)", lineHeight: 1.5, marginTop: 0 }}>
            You're already signed in — this is just so you can get back in later.
          </p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password"
            autoComplete="new-password" style={{ ...input, marginBottom: 8 }} />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Again, to be sure"
            autoComplete="new-password" style={{ ...input, marginBottom: 10 }} />
          {error && <p style={{ color: "#ef4444", fontSize: 12.5, fontWeight: 600, margin: "0 0 10px" }}>{error}</p>}
          <button onClick={savePassword} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save and continue"}
          </button>
          <button onClick={() => setStep(2)} style={{ ...ghost, marginTop: 8 }}>I'll do this later</button>
        </div>
      )}

      {/* ── 2. On the home screen ──────────────────────────────────── */}
      {step === 2 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--brand-text)", margin: "0 0 6px" }}>
            Put it on your home screen
          </h2>
          <p style={{ fontSize: 13, color: "var(--brand-text-secondary)", lineHeight: 1.5, marginTop: 0 }}>
            {installed
              ? "Already done — you're using the installed app right now."
              : ios
              ? "One tap in Safari and it behaves like any other app on your phone."
              : "One tap and it's an app. No app store, no downloads."}
          </p>
          {!installed && <InstallPrompt inline />}
          <button onClick={() => setStep(3)} style={{ ...primary, marginTop: 12 }}>
            {installed ? "Continue" : "Done — next"}
          </button>
        </div>
      )}

      {/* ── 3. Notifications, entirely optional ────────────────────── */}
      {step === 3 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--brand-text)", margin: "0 0 6px" }}>
            Want a nudge when {coachFirstName} messages you?
          </h2>
          <p style={{ fontSize: 13, color: "var(--brand-text-secondary)", lineHeight: 1.5, marginTop: 0 }}>
            Messages and schedule changes only — never marketing, and you can turn
            it off in Settings whenever you like. Saying yes now means your phone
            is ready the moment {coachFirstName} turns them on.
          </p>
          {notifState === "granted" ? (
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--brand-primary)" }}>Notifications are on ✓</p>
          ) : notifState === "unsupported" ? (
            <p style={{ fontSize: 12.5, color: "var(--brand-text-secondary)" }}>
              Your phone will offer this once the app is on your home screen.
            </p>
          ) : (
            <button onClick={askNotifications} style={{ ...primary, marginBottom: 8 }}>Turn on notifications</button>
          )}
          <button onClick={() => router.push(needsIntake ? "/onboarding" : "/home")}
            style={notifState === "granted" ? primary : ghost}>
            {needsIntake ? `Next — a few questions from ${coachFirstName}` : "Take me to my programme"}
          </button>
        </div>
      )}

      <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 18 }}>
        Stuck? Message {coachFirstName} from inside the app — he gets it straight away.
      </p>
    </KeyboardSafeArea>
  );
}
