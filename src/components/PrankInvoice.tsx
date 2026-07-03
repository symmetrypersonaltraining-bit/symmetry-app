"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Who = "dad" | "wife";

const TARGETS: Record<string, Who> = {
  "gerardgautreaux@gmail.com": "dad",
  "steph.rgautreaux@gmail.com": "wife",
};
const STORAGE_KEY = "symmetry_prank_10k_v1";
const EXPIRES = "2026-07-12";
const SIREN = "🚨";
const HEARTS = "💕";
const HEART = "❤️";

const KEYFRAMES =
  "@keyframes prankFlash{0%,100%{background:rgba(239,68,68,.96);}50%{background:rgba(245,158,11,.96);}}" +
  "@keyframes prankShake{0%,100%{transform:rotate(-1.5deg);}50%{transform:rotate(1.5deg);}}" +
  "@keyframes prankPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.15);}}";

const LINES: Record<Who, Array<[string, string]>> = {
  dad: [
    ["Room & board 1985–2005 (retroactive, w/ interest)", "$9,399.00"],
    ["“Ask your mother” processing fees × 47", "$19.99"],
    ["Emotional damages: teaching me to drive", "$580.00"],
    ["Unpaid dad-joke royalties", "$1.00"],
    ["Convenience fee (for your convenience)", "$0.01"],
  ],
  wife: [
    ["Marriage membership dues — PREMIUM tier", "$8,200.00"],
    ["Thermostat adjustment fees (unauthorized)", "$1,300.00"],
    ["“I don’t care, you pick” dinner consulting", "$499.99"],
    ["Cover-stealing surcharge (nightly rate)", "$0.01"],
  ],
};

const PAY_LABEL: Record<Who, string> = {
  dad: "PAY NOW — 1 fishing trip accepted as payment in full",
  wife: "PAY NOW — 1 hug accepted as payment in full",
};
const PAID_MSG: Record<Who, string> = {
  dad: "Just kidding — you owe absolutely nothing. Thanks for everything, Dad.",
  wife: "Just kidding — you owe absolutely nothing. Love you babe.",
};

export default function PrankInvoice() {
  const [who, setWho] = useState<Who | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      if (today > EXPIRES) return;
      if (window.location.search.indexOf("prank=1") >= 0) {
        setWho("dad");
        return;
      }
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data }) => {
          const email = (data?.user?.email || "").toLowerCase();
          const w = TARGETS[email];
          if (w) setWho(w);
        })
        .catch(() => {});
    } catch {
      // never break the dashboard
    }
  }, []);

  if (!who) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
    setWho(null);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, animation: "prankFlash 0.6s infinite" }}>
      <style>{KEYFRAMES}</style>
      {!paid ? (
        <div style={{ background: "#fff", borderRadius: 24, maxWidth: 420, width: "100%", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", animation: "prankShake 0.25s infinite", color: "#111" }}>
          <div style={{ textAlign: "center", fontSize: 40, animation: "prankPulse 0.5s infinite" }}>{SIREN + SIREN + SIREN}</div>
          <div style={{ textAlign: "center", fontWeight: 900, fontSize: 26, color: "#ef4444", letterSpacing: 1 }}>FINAL NOTICE</div>
          <div style={{ textAlign: "center", fontWeight: 700, fontSize: 13, color: "#b91c1c" }}>(this is also the first notice)</div>
          <div style={{ textAlign: "center", margin: "10px 0", fontSize: 15, fontWeight: 600 }}>SYMMETRY PERSONAL TRAINING {"—"} COLLECTIONS DIVISION{"™"}</div>
          <div style={{ borderTop: "2px dashed #ddd", margin: "10px 0" }} />
          {LINES[who].map((row) => (
            <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0" }}>
              <span>{row[0]}</span>
              <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{row[1]}</span>
            </div>
          ))}
          <div style={{ borderTop: "2px solid #111", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: 20 }}>
            <span>TOTAL DUE</span>
            <span style={{ color: "#ef4444" }}>$10,000.00</span>
          </div>
          <div style={{ fontSize: 12, textAlign: "center", marginTop: 6, color: "#555" }}>Due: IMMEDIATELY. Late fee: one (1) guilt trip per hour.</div>
          <button onClick={() => setPaid(true)} style={{ width: "100%", marginTop: 14, background: "#ef4444", color: "#fff", fontWeight: 800, fontSize: 16, padding: "12px 0", borderRadius: 14, border: "none" }}>{PAY_LABEL[who]}</button>
          <button onClick={() => setPaid(true)} style={{ width: "100%", marginTop: 8, background: "transparent", color: "#666", fontSize: 12, border: "none", textDecoration: "underline" }}>dispute this charge (petty)</button>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 24, maxWidth: 420, width: "100%", padding: 28, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", color: "#111" }}>
          <div style={{ fontSize: 48 }}>{HEARTS}</div>
          <div style={{ fontWeight: 900, fontSize: 28, color: "#22c55e", transform: "rotate(-6deg)", display: "inline-block", padding: "4px 14px", borderRadius: 8, margin: "8px 0", border: "4px solid #22c55e" }}>PAID IN FULL</div>
          <div style={{ fontSize: 15, marginTop: 8 }}>{PAID_MSG[who]}<br />{"— Dustin "}{HEART}</div>
          <button onClick={dismiss} style={{ width: "100%", marginTop: 16, background: "#22c55e", color: "#fff", fontWeight: 800, fontSize: 15, padding: "12px 0", borderRadius: 14, border: "none" }}>Close (you{"’"}re welcome)</button>
        </div>
      )}
    </div>
  );
}
