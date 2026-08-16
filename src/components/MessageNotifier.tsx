"use client";

// In-app new-message notification. Polls the user's unread count (~15s) and,
// when it INCREASES while the app is open, slides in a themed top banner that
// deep-links to /messages. Self-contained (no react-hot-toast dependency, so it
// can't double-fire with other Toasters). Mounted for BOTH trainer and client.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotificationFeed } from "@/lib/useNotificationFeed";
import { type Banner } from "@/lib/messageBanners";
import { COACH_FIRST_NAME } from "@/lib/trainer";

export default function MessageNotifier() {
  const router = useRouter();
  // A QUEUE, not a single slot (626775f9 verification, 2026-07-31). The old
  // version compared groupDelta against directDelta and rendered whichever won,
  // so a poll window containing 1 group message and 2 direct messages showed
  // only "2 new messages" pointing at the private trainer thread — the group
  // message was silently dropped AND the watermark advanced past it, so it was
  // never announced again. Group and direct are different threads; one can't
  // stand in for the other. Now each gets its own banner, shown in turn.
  const [banner, setBanner] = useState<Banner | null>(null);
  const [tick, setTick] = useState(0);
  const queue = useRef<Banner[]>([]);

  // Show the next queued banner as soon as the slot is free.
  useEffect(() => {
    if (banner) return;
    const next = queue.current.shift();
    if (next) setBanner(next);
  }, [banner, tick]);

  // Each banner gets its own time on screen — longer when a person sent it.
  //
  // Six seconds is enough to notice something moved and not enough to decide to
  // act on it if you are mid-set with a phone on a bench. Twelve for a message
  // Dustin actually typed; the automated nudges keep the shorter one, because
  // giving everything the long treatment is how the long treatment stops
  // meaning anything.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), banner.fromPerson ? 12000 : 6000);
    return () => clearTimeout(t);
  }, [banner]);

  // A short buzz for a person's message, where the device allows it. Deliberately
  // not for automated ones: a phone that vibrates every night at 9pm for a nudge
  // gets its notifications turned off entirely, and that takes the payment
  // reminders with it.
  useEffect(() => {
    if (!banner?.fromPerson) return;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([60, 45, 60]);
      }
    } catch { /* not supported, and not important enough to care */ }
  }, [banner]);

  // Driven by the shared feed, and by message IDENTITY rather than a count.
  //
  // The old gate was `if (c > prev.current)` on the SUM of direct + group. Read
  // one message while another arrived inside the same 15s window and the total
  // did not move — no banner — and the watermark advanced anyway, so that
  // message was never announced again. It was lost permanently. freshIds is a
  // set difference, so a read and an arrival cannot cancel out.
  //
  // It also carries the real destination: each banner now points at the item's
  // own href, which includes ?m=<id>. The old one asked for a HEAD count and so
  // never learned who sent anything — it could only ever route to /messages,
  // which for the trainer is the inbox list rather than a thread.
  const { items, freshIds } = useNotificationFeed();
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!freshIds.length) return;
    const unseen = freshIds.filter((id) => !announced.current.has(id));
    if (!unseen.length) return;
    unseen.forEach((id) => announced.current.add(id));

    // One banner per SOURCE, not per message: three group posts is one "Group
    // Chat" banner, not three. Sources are already grouped by the feed.
    const queued: Banner[] = items.slice(0, 2).map((i) => ({
      // A person's message says so. "New message — Group Chat" reads like
      // system chatter; naming the coach is what makes somebody stop.
      text: i.fromPerson
        ? i.count > 1
          ? `${i.count} new from ${COACH_FIRST_NAME} in ${i.title}`
          : `${COACH_FIRST_NAME} messaged you — ${i.title}`
        : i.count > 1
          ? `${i.count} new in ${i.title}`
          : `New message — ${i.title}`,
      href: i.href,
      fromPerson: i.fromPerson === true,
    }));
    if (queued.length) {
      // Cap the backlog. If the app sat in the background through several polls
      // we want the current state, not a parade of stale banners.
      queue.current = [...queue.current, ...queued].slice(-2);
      setTick((t) => t + 1);
    }
  }, [freshIds, items]);

  if (!banner) return null;
  return (
    <button
      onClick={() => {
        // Same hard-navigation fallback as the bell. In a WebView a client-side
        // push that silently does nothing looks identical to a dead button, and
        // the banner has already dismissed itself by then so there is no second
        // chance to tap it.
        const to = banner.href;
        setBanner(null);
        router.push(to);
        window.setTimeout(() => {
          try {
            // The QUERY, not just the path.
            //
            // This compared pathname alone, so tapping a banner while already
            // on /messages could never trigger the fallback — same path, so it
            // concluded the navigation had worked. If the client-side push had
            // not actually moved the thread, you stayed exactly where you were
            // and the banner was gone. That is the "it routed wrong" Dustin has
            // hit more than once, and it only ever showed up when you were
            // already in Messages, which is why it was hard to pin down.
            //
            // client AND m both matter: a second announcement in a thread you
            // are already reading differs only by m, and landing on the thread
            // without scrolling to the message is the same failure in miniature.
            const want = to.split("?")[0];
            const target = new URLSearchParams(to.split("?")[1] || "");
            const here = new URLSearchParams(window.location.search);
            const samePath = window.location.pathname === want;
            const sameClient = (here.get("client") || "") === (target.get("client") || "");
            const sameMsg = (here.get("m") || "") === (target.get("m") || "");
            if (!samePath || !sameClient || !sameMsg) window.location.assign(to);
          } catch { /* noop */ }
        }, 700);
      }}
      style={{
        position: "fixed", top: "calc(env(safe-area-inset-top) + 8px)", left: 12, right: 12, zIndex: 3000,
        display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        background: banner.fromPerson ? "#E53935" : "var(--brand-primary)", color: "#fff", border: "none",
        borderRadius: 14, padding: banner.fromPerson ? "15px 16px" : "12px 16px", cursor: "pointer",
        // A person's message gets the red treatment, a heavier shadow and a
        // slow pulse that keeps going the whole time it is up. The brand blue
        // banner is what every automated nudge already looks like, and after a
        // fortnight of those it reads as furniture.
        boxShadow: banner.fromPerson ? "0 10px 34px rgba(229,57,53,0.45)" : "0 8px 28px rgba(0,0,0,0.28)",
        animation: banner.fromPerson
          ? "cw-slide-down 0.25s ease, cw-alert 1.6s ease-in-out 0.25s infinite"
          : "cw-slide-down 0.25s ease",
        maxWidth: 560, margin: "0 auto",
      }}
    >
      <i className={`ti ${banner.fromPerson ? "ti-message-circle-2-filled" : "ti-bell"}`} style={{ fontSize: banner.fromPerson ? 23 : 20 }} />
      <span style={{ flex: 1, fontWeight: 800, fontSize: banner.fromPerson ? 15 : 14 }}>{banner.text} — tap to read</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 18 }} />
    </button>
  );
}
