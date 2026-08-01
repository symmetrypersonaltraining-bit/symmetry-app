"use client";

// In-app new-message notification. Polls the user's unread count (~15s) and,
// when it INCREASES while the app is open, slides in a themed top banner that
// deep-links to /messages. Self-contained (no react-hot-toast dependency, so it
// can't double-fire with other Toasters). Mounted for BOTH trainer and client.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotificationFeed } from "@/lib/useNotificationFeed";
import { type Banner } from "@/lib/messageBanners";

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

  // Each banner gets its own 6s on screen.
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(t);
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
      text: i.count > 1 ? `${i.count} new in ${i.title}` : `New message — ${i.title}`,
      href: i.href,
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
      onClick={() => { const to = banner.href; setBanner(null); router.push(to); }}
      style={{
        position: "fixed", top: "calc(env(safe-area-inset-top) + 8px)", left: 12, right: 12, zIndex: 3000,
        display: "flex", alignItems: "center", gap: 12, textAlign: "left",
        background: "var(--brand-primary)", color: "#fff", border: "none",
        borderRadius: 14, padding: "12px 16px", cursor: "pointer",
        boxShadow: "0 8px 28px rgba(0,0,0,0.28)", animation: "cw-slide-down 0.25s ease",
        maxWidth: 560, margin: "0 auto",
      }}
    >
      <i className="ti ti-bell" style={{ fontSize: 20 }} />
      <span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{banner.text} — tap to read</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 18 }} />
    </button>
  );
}
