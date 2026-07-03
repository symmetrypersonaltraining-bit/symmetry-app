"use client";
// src/components/PayLinksRow.tsx
// Additive pay-links row for PaymentDueBanner (and optionally the payments page).
// ZERO DB access — pure UI. Tapping a button opens the payment app; nothing
// auto-charges; Dustin's "Confirm paid" stays 100% manual.
// Revert = remove the <PayLinksRow/> line + import in PaymentDueBanner.

import { useState, type CSSProperties } from "react";
import {
  VENMO_USERNAME,
  ZELLE,
  ZELLE_INSTRUCTIONS,
  SQUARE_LINK,
  CASHTAG,
  buildVenmoLink,
  buildCashAppLink,
} from "@/lib/pay-links";

export default function PayLinksRow({ amount }: { amount: number }) {
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
        {VENMO_USERNAME && (
          <a
            href={buildVenmoLink(amount)}
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
        {CASHTAG && (
          <a
            href={buildCashAppLink(amount)}
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
              <strong>{ZELLE.recipientName}</strong> &middot; {ZELLE.email}
            </span>
            <button onClick={() => copy("email", ZELLE.email)} style={copyBtn}>
              {copied === "email" ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={rowStyle}>
            <span>or {ZELLE.phone}</span>
            <button onClick={() => copy("phone", ZELLE.phone)} style={copyBtn}>
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
