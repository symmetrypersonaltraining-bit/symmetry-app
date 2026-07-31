"use client";

// In-app new-message notification. Polls the user's unread count (~15s) and,
// when it INCREASES while the app is open, slides in a themed top banner that
// deep-links to /messages. Self-contained (no react-hot-toast dependency, so it
// can't double-fire with other Toasters). Mounted for BOTH trainer and client.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchGroupUnread } from "@/lib/groupUnread";
import { bannersForDelta, type Banner } from "@/lib/messageBanners";

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
  const prev = useRef<number | null>(null);
  const prevGroup = useRef<number | null>(null);

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

  useEffect(() => {
    let on = true;
    const supabase = createClient();
    async function load() {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (!user) return;
        const isClientMode = typeof document !== "undefined" && document.cookie.split("; ").some((x) => x === "symmetry_client_mode=1");
        let scopeId: string | null = null;
        if (isClientMode) {
          const { data: myClient } = await supabase.from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
          scopeId = myClient ? (myClient as { id: string }).id : null;
        }
        let q = supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("to_id", user.id).is("read_at", null).is("deleted_at", null)
          .eq("is_broadcast", false).eq("is_group", false);
        if (scopeId) q = q.eq("client_id", scopeId);
        // In client mode (Dustin's own client app) include his OWN trainer-sent
        // group/announcement messages so the banner slides in like a real client.
        const [{ count }, group] = await Promise.all([q, fetchGroupUnread(supabase, user.id, isClientMode)]);
        const direct = count || 0;
        const grp = group.count;
        const c = direct + grp;
        if (!on) return;
        if (prev.current != null && c > prev.current) {
          // Split the increase into its group vs direct parts and queue a banner
          // for EACH thread that actually gained messages. Group is queued first
          // (community posts are the ones a client is most likely to want) but
          // neither is ever discarded in favour of the other.
          const prevGrp = prevGroup.current ?? 0;
          const prevDirect = (prev.current ?? 0) - prevGrp;
          const groupDelta = grp - prevGrp;
          const directDelta = direct - prevDirect;
          const queued = bannersForDelta({ groupDelta, directDelta, isClientMode });
          if (queued.length) {
            // Cap the backlog: if the app sat in the background through several
            // polls we want the latest counts, not a parade of stale banners.
            queue.current = [...queue.current, ...queued].slice(-2);
            setTick((t) => t + 1);
          }
        }
        prev.current = c;
        prevGroup.current = grp;
      } catch { /* noop */ }
    }
    load();
    const iv = setInterval(load, 15000);
    return () => { on = false; clearInterval(iv); };
  }, []);

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
