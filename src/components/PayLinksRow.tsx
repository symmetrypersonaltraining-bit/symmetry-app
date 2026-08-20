"use client";
// src/components/PayLinksRow.tsx
// Additive pay-links row for PaymentDueBanner (and optionally the payments page).
// ZERO DB access — pure UI. Tapping a button opens the payment app; nothing
// auto-charges; Dustin's "Confirm paid" stays 100% manual.
// Revert = remove the <PayLinksRow/> line + import in PaymentDueBanner.

import { useState, type CSSProperties } from "react";
import {
  ZELLE_INSTRUCTIONS,
  SQUARE_LINK,
  buildVenmoLink,
  buildCashAppLink,
  OWNER_PAY_DESTINATION,
  type PayDestination,
} from "@/lib/pay-links";

/**
 * WHOSE ACCOUNT THIS PAYS.
 *
 * Every button here pointed at module constants naming Dustin. From 20 Aug
 * Stephanie's clients pay her directly, and a client paying the wrong trainer
 * is the worst thing this app could do without saying so.
 *
 * `to` is resolved from the client's own trainer row by whoever renders this.
 * The fallback is the owner's details — used only when a trainer cannot be
 * resolved, which the NOT NULL trainer_id makes impossible in practice. Showing
 * no way to pay at all would be worse than showing the business default.
 */
export default function PayLinksRow({ amount, to }: { amount: number; to?: PayDestination | null }) {
  const dest = to ?? OWNER_PAY_DESTINATION;
  const [zelleOpen, setZelleOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  const btnBase: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
    padding: "10px 12px",
    borderRadius: 14,
    fontSize: 13,
    fontWeight: 700,
    color: "#fff",
    border: "none",
    textDecoration: "none",
    cursor: "pointer",
  };

  const copyBtn: CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid var(--brand-border)",
    background: "transparent",
    color: "var(--brand-primary)",
    cursor: "pointer",
  };

  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {dest.venmoUsername && (
          <a
            href={buildVenmoLink(amount, "Personal Training", dest.venmoUsername)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnBase, background: "#3D95CE" }}
          >
            Venmo ${amount.toFixed(0)}
          </a>
        )}
        <button
          onClick={() => setZelleOpen((v) => !v)}
          style={{ ...btnBase, background: "#6D1ED4" }}
        >
          Zelle&reg;
        </button>
        {SQUARE_LINK && (
          <a
            href={SQUARE_LINK}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnBase, background: "#111827" }}
          >
            Card
          </a>
        )}
        {dest.cashtag && (
          <a
            href={buildCashAppLink(amount, dest.cashtag)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...btnBase, background: "#00C244" }}
          >
            Cash App
          </a>
        )}
      </div>

      {zelleOpen && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            background: "var(--brand-surface)",
            border: "1px solid var(--brand-border)",
            fontSize: 12.5,
            color: "var(--brand-text)",
          }}
        >
          <div style={{ color: "var(--brand-text-secondary)", marginBottom: 8 }}>
            {ZELLE_INSTRUCTIONS}
          </div>
          <div style={rowStyle}>
            <span style={{ wordBreak: "break-all" }}>
              <strong>{dest.recipientName}</strong> &middot; {dest.zelleEmail}
            </span>
            <button onClick={() => copy("email", dest.zelleEmail || "")} style={copyBtn}>
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={rowStyle}>
            <span>or {dest.zellePhone}</span>
            <button onClick={() => copy("phone", dest.zellePhone || "")} style={copyBtn}>
              {copied === "phone" ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={{ ...rowStyle, marginBottom: 0 }}>
            <span>
              Amount: <strong>${amount.toFixed(2)}</strong>
            </span>
            <button onClick={() => copy("amount", amount.toFixed(2))} style={copyBtn}>
              {copied === "amount" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
