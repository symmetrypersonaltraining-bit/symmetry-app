"use client";

// Add a trainer. Owner only.
//
// Until this existed there was NO WAY to add one — no API, no screen. Both
// existing trainer rows were typed into SQL by hand, which is fine for two and
// impossible for a test group. Dustin, 22 Aug: "i want to send out the forms to
// collect trainer info in the morning and get them on the app and testing by
// tomorrow."
//
// Name and email only. Everything else — photo, payment handles, which bots
// they run, their avatar set — they now set themselves, and the walkthrough
// takes them through it. Asking him to type all of it here would just move the
// same data entry onto him.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Result {
  name: string;
  email: string;
  emailSent: boolean;
  tempPassword?: string;
  oneTapUrl?: string | null;
  loginUrl?: string;
}

export default function AddTrainerCard() {
  const [isOwner, setIsOwner] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const sb = createClient();
        const { data: auth } = await sb.auth.getUser();
        const uid = auth?.user?.id;
        if (!uid) return;
        const { data } = await sb.from("trainers").select("role").eq("auth_user_id", uid).maybeSingle();
        if (on) setIsOwner((data as { role?: string } | null)?.role === "owner");
      } catch { /* not the owner, or not readable — either way, no card */ }
    })();
    return () => { on = false; };
  }, []);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/invite-trainer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "That didn't work.");
      setDone(json as Result);
      setName("");
      setEmail("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) return null;

  const input: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid var(--brand-border)", background: "var(--brand-bg)",
    color: "var(--brand-text)", fontSize: 16, outline: "none", marginBottom: 10,
  };

  return (
    <section>
      <p className="section-header">Trainers</p>
      <div className="card p-4">
        {!open && !done ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center gap-3 text-left"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <i className="ti ti-user-plus text-2xl" style={{ color: "var(--brand-primary)" }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>Add a trainer</span>
              <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
                Creates their login and emails them a way in. They set up everything else themselves.
              </span>
            </span>
            <i className="ti ti-chevron-right" style={{ color: "var(--brand-text-secondary)" }} />
          </button>
        ) : null}

        {open && !done ? (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
              Name and email are all you need. Their photo, payment handles, bots and avatar set are
              theirs to set — the walkthrough takes them through it.
            </p>
            <input style={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <input style={input} type="email" inputMode="email" placeholder="Email — this becomes their login"
                   value={email} onChange={(e) => setEmail(e.target.value)} />
            {err && <p className="text-xs font-semibold mb-2" style={{ color: "#dc2626" }}>{err}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !name.trim() || !email.trim()}
                onClick={submit}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "var(--brand-primary)", color: "#fff", border: "none",
                         opacity: busy || !name.trim() || !email.trim() ? 0.5 : 1 }}
              >
                {busy ? "Setting them up…" : "Create their account"}
              </button>
              <button type="button" onClick={() => { setOpen(false); setErr(null); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: "var(--brand-surface-2)", color: "var(--brand-text-secondary)", border: "none" }}>
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {done ? (
          <>
            <p className="text-sm font-bold mb-1" style={{ color: "#16a34a" }}>
              {done.name} is on the app
            </p>
            <p className="text-xs mb-3" style={{ color: "var(--brand-text-secondary)" }}>
              {done.emailSent
                ? `Emailed to ${done.email}. Their link lands them straight on the walkthrough.`
                : `No email was sent — mail is not configured on this instance. Send them the details below yourself.`}
            </p>

            {/* Always shown, not only when mail failed: an email that bounces or
                lands in spam is the same as no email, and he needs to be able
                to read this out over the phone. */}
            <div className="rounded-xl p-3 mb-3" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Sign in at</p>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--brand-text)" }}>{done.loginUrl}</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Email</p>
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--brand-text)" }}>{done.email}</p>
              <p className="text-xs" style={{ color: "var(--brand-text-secondary)" }}>Temporary password</p>
              <p className="text-sm font-bold" style={{ color: "var(--brand-text)", letterSpacing: 1 }}>{done.tempPassword}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                const text =
                  `You're set up on the Symmetry trainer app.\n\n` +
                  `Sign in: ${done.loginUrl}\nEmail: ${done.email}\nTemporary password: ${done.tempPassword}\n\n` +
                  `First thing inside, open "Setup guide" in the sidebar — it walks you through the whole app.`;
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
                }
              }}
              className="w-full py-2.5 rounded-xl text-sm font-bold mb-2"
              style={{ background: "var(--brand-primary)", color: "#fff", border: "none" }}
            >
              {copied ? "Copied — send it to them" : "Copy their sign-in details"}
            </button>
            <button type="button" onClick={() => { setDone(null); setOpen(true); }}
                    className="w-full py-2 rounded-xl text-sm font-semibold"
                    style={{ background: "var(--brand-surface-2)", color: "var(--brand-text-secondary)", border: "none" }}>
              Add another
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
