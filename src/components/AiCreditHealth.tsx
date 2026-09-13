"use client";

/**
 * WHAT IS LEFT ON THE AI ACCOUNT — BEFORE A CLIENT FINDS OUT FOR YOU.
 *
 * Dustin, 13 Sep 2026, mid-test: *"photo didn't work, says credit balance
 * issue"* … *"wtf are we doing?? everything im testing is getting worse."*
 * Every AI feature in the app had been down for an hour and the first signal
 * was features breaking in his hands.
 *
 * RENDERS NOTHING WHEN THERE IS NOTHING TO SAY — the same rule as
 * WeeklyFocusHealth. A card that is always there is a card nobody reads, and
 * this one has to be believed on the day it matters.
 *
 * The reasoning behind the two signals is in lib/ai/creditHealth.ts.
 */

import { useCallback, useEffect, useState } from "react";

interface Health {
  state: "out" | "low" | "ok" | "untracked";
  added: number;
  spent: number;
  remaining: number | null;
  perDay: number;
  daysLeft: number | null;
  outage: { at: string; feature: string | null } | null;
  since?: string;
}

const BILLING_URL = "https://console.anthropic.com/settings/billing";
const usd = (n: number) => "$" + n.toFixed(2);

export default function AiCreditHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai-credit");
      if (!res.ok) return;
      setH(await res.json());
    } catch {
      /* a status card must never be the thing that breaks the home screen */
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function record() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: Number(amount) }),
      });
      if (res.ok) { setAdding(false); setAmount(""); await load(); }
    } finally {
      setSaving(false);
    }
  }

  if (!h) return null;
  // Healthy and tracked: say nothing. Untracked is also silent — nagging to
  // set up bookkeeping is not what this card is for, and the outage signal
  // works without it.
  if (h.state === "ok" || (h.state === "untracked" && !h.outage)) return null;

  const out = h.state === "out";
  const tone = out
    ? { bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.45)", ink: "#dc2626" }
    : { bg: "rgba(245,158,11,0.12)", bd: "rgba(245,158,11,0.5)", ink: "#b45309" };

  return (
    <div className="rounded-2xl p-4 mb-3 mx-4" style={{ background: tone.bg, border: `1px solid ${tone.bd}` }}>
      <p className="text-sm font-bold" style={{ color: tone.ink }}>
        {out ? "Every AI feature is down — the account is out of credit" : "The AI account is running low"}
      </p>

      <p className="text-xs mt-1.5" style={{ color: "var(--brand-text)" }}>
        {out ? (
          <>
            {h.outage
              ? <>The last {h.outage.feature ? <b>{h.outage.feature}</b> : "AI"} call was refused for billing. </>
              : <>What has been recorded is spent. </>}
            Clients see &ldquo;the AI is unavailable&rdquo; and can still log by hand — nothing is lost.
          </>
        ) : (
          <>
            About <b>{usd(h.remaining ?? 0)}</b> left of {usd(h.added)}
            {h.daysLeft != null && <> — roughly <b>{h.daysLeft} {h.daysLeft === 1 ? "day" : "days"}</b> at {usd(h.perDay)}/day</>}.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        <a href={BILLING_URL} target="_blank" rel="noopener noreferrer"
          className="text-xs font-bold px-3 py-2 rounded-xl text-white" style={{ background: tone.ink, textDecoration: "none" }}>
          Add credit ↗
        </a>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs font-semibold px-3 py-2 rounded-xl"
            style={{ border: "1px solid var(--brand-border)", color: "var(--brand-text)", background: "transparent" }}>
            I added credit — record it
          </button>
        )}
      </div>

      {adding && (
        <div className="flex gap-2 mt-2 items-center">
          <span className="text-xs font-bold" style={{ color: "var(--brand-text-secondary)" }}>$</span>
          <input inputMode="decimal" aria-label="amount added" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="50"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", borderRadius: 10, padding: "8px 10px", fontSize: 13, width: 90, outline: "none" }} />
          <button onClick={record} disabled={saving || !Number(amount)}
            className="text-xs font-bold px-3 py-2 rounded-xl text-white"
            style={{ background: "var(--brand-primary)", opacity: Number(amount) && !saving ? 1 : 0.5 }}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => { setAdding(false); setAmount(""); }}
            className="text-xs font-semibold px-2 py-2" style={{ color: "var(--brand-text-secondary)", background: "transparent", border: 0 }}>
            Cancel
          </button>
        </div>
      )}

      {/* Said plainly, because a number presented as fact and quietly wrong is
          how this went unnoticed in the first place. */}
      <p className="text-[10px] mt-2.5" style={{ color: "var(--brand-text-secondary)" }}>
        {out
          ? "The refusal is read from the provider — this one is not an estimate."
          : "An estimate from what you have recorded against what the app has spent. Anything else using the same key makes the real figure lower."}
      </p>
    </div>
  );
}
