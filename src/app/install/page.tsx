"use client";

// /install — the one address that puts Symmetry on a phone.
//
// Dustin, 2026-08-04: "tell me where to find the qr code to have clients
// download this new version."
//
// The QR that already existed is per-client: it comes out of the Invite button
// and carries a one-tap sign-in link, which is right for somebody who has never
// had a login. It is also only offered for clients with no account yet — so for
// the thirty-odd clients who already have one, there was no QR at all, and the
// only button on their profile resets their password, which is not what "show
// them how to install it" should cost.
//
// This page is that missing thing: public, permanent, the same for everybody.
// Scan it, land here, install, sign in with the password you already have.
// Print it and stick it on the studio wall if you like — the URL never changes.
//
// Public by design (see middleware): a client who is not signed in has to be
// able to reach it, which is the whole point.

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import Logo from "@/components/Logo";
import InstallPrompt, { isIos, isStandalone } from "@/components/InstallPrompt";
import { COACH_FIRST_NAME } from "@/lib/trainer";

const INSTALL_URL = "https://symmetry-app-omega.vercel.app/install";

export default function InstallPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setIos(isIos());
    setInstalled(isStandalone());
    QRCode.toDataURL(INSTALL_URL, { width: 640, margin: 1 })
      .then(setQr)
      .catch(() => { /* the instructions below work without it */ });
  }, []);

  const card: React.CSSProperties = {
    background: "#EDF2F7", borderRadius: 18, padding: 18, marginBottom: 14, color: "#0D1B2E",
  };

  return (
    <div style={{ minHeight: "100dvh", background: "#0F4C81", padding: "32px 16px 48px" }}>
      <div style={{ maxWidth: 460, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Logo size={72} color="white" />
          <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 800, margin: "14px 0 4px" }}>
            Get Symmetry on your phone
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
            No app store, no download. It takes about ten seconds.
          </p>
        </div>

        {installed ? (
          <div style={card}>
            <p style={{ fontWeight: 800, fontSize: 15, margin: "0 0 6px" }}>You&apos;re already set up ✓</p>
            <p style={{ fontSize: 13.5, color: "#4E6080", margin: "0 0 14px", lineHeight: 1.5 }}>
              You&apos;re using the installed app right now.
            </p>
            <Link href="/home" style={{ display: "block", textAlign: "center", padding: 13, borderRadius: 12, background: "#0F4C81", color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
              Go to my programme
            </Link>
          </div>
        ) : (
          <div style={card}>
            <p style={{ fontWeight: 800, fontSize: 15, margin: "0 0 10px" }}>
              {ios ? "On an iPhone" : "On this phone"}
            </p>
            {ios ? (
              <p style={{ fontSize: 13.5, color: "#4E6080", lineHeight: 1.6, margin: "0 0 14px" }}>
                Tap the <b>Share</b> button at the bottom of Safari — the square
                with an arrow coming out of it — then scroll down and tap{" "}
                <b>Add to Home Screen</b>. Symmetry then opens full screen, like
                any other app.
              </p>
            ) : (
              <p style={{ fontSize: 13.5, color: "#4E6080", lineHeight: 1.6, margin: "0 0 14px" }}>
                Tap Install below. Your phone will ask once to confirm, and the
                Symmetry icon appears on your home screen.
              </p>
            )}
            <InstallPrompt inline />
            <Link href="/login" style={{ display: "block", textAlign: "center", marginTop: 12, padding: 13, borderRadius: 12, background: "#0F4C81", color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
              Sign in
            </Link>
            <p style={{ fontSize: 12, color: "#4E6080", textAlign: "center", margin: "10px 0 0", lineHeight: 1.5 }}>
              Use the email and password you already have. Forgotten it? Tap
              &ldquo;Forgot password&rdquo; on the sign-in screen, or message {COACH_FIRST_NAME}.
            </p>
          </div>
        )}

        {/* The trainer-facing half: show this on your phone, they scan it. */}
        <div style={card}>
          <button
            onClick={() => setShowQr((v) => !v)}
            style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #C8D8EC", background: "transparent", color: "#0F4C81", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
          >
            {showQr ? "Hide QR code" : "Show the QR code"}
          </button>
          {showQr && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="Scan to install Symmetry" style={{ width: "100%", maxWidth: 300, background: "#fff", borderRadius: 14, padding: 10 }} />
              ) : (
                <p style={{ fontSize: 13, color: "#4E6080" }}>symmetry-app-omega.vercel.app/install</p>
              )}
              <p style={{ fontSize: 12.5, color: "#4E6080", marginTop: 10, lineHeight: 1.5 }}>
                Point a phone camera at this and it lands right back on this page.
                Safe to print.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
