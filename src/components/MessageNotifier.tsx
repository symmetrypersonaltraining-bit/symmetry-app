"use client";

// In-app new-message notification. Polls the user's unread count (~15s) and,
// when it INCREASES while the app is open, slides in a themed top banner that
// deep-links to /messages. Self-contained (no react-hot-toast dependency, so it
// can't double-fire with other Toasters). Mounted for BOTH trainer and client.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchGroupUnread } from "@/lib/groupUnread";

export default function MessageNotifier() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [text, setText] = useState("New message");
  const [href, setHref] = useState("/messages");
  const prev = useRef<number | null>(null);
  const prevGroup = useRef<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const [{ count }, group] = await Promise.all([q, fetchGroupUnread(supabase, user.id)]);
        const direct = count || 0;
        const grp = group.count;
        const c = direct + grp;
        if (!on) return;
        if (prev.current != null && c > prev.current) {
          const delta = c - prev.current;
          // If the whole increase came from the group chat, deep-link to Group.
          const groupOnly = prevGroup.current != null && grp > prevGroup.current && (grp - prevGroup.current) >= delta;
          setText(groupOnly ? (delta > 1 ? `${delta} new group messages` : "New group message") : (delta > 1 ? `${delta} new messages` : "New message"));
          setHref(groupOnly ? "/messages?client=group" : "/messages");
          setShow(true);
          if (hideTimer.current) clearTimeout(hideTimer.current);
          hideTimer.current = setTimeout(() => setShow(false), 6000);
        }
        prev.current = c;
        prevGroup.current = grp;
      } catch { /* noop */ }
    }
    load();
    const iv = setInterval(load, 15000);
    return () => { on = false; clearInterval(iv); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (!show) return null;
  return (
    <button
      onClick={() => { setShow(false); router.push(href); }}
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
      <span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>{text} — tap to read</span>
      <i className="ti ti-chevron-right" style={{ fontSize: 18 }} />
    </button>
  );
}
