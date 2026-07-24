"use client";

// Shared unread-message count hook — one source of truth for the client nav
// badge (real BottomNav AND the trainer Client View nav) and anywhere else a
// badge is needed. Client badge INCLUDES broadcasts (announcements to them),
// excludes group (whose to_id is the sender). Polls ~20s.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchGroupUnread } from "@/lib/groupUnread";

export function useUnreadCount(pollMs = 20000): number {
  const [unread, setUnread] = useState(0);
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
        // Direct + broadcast unread (per-message read_at).
        let q = supabase.from("messages").select("id", { count: "exact", head: true })
          .eq("to_id", user.id).is("read_at", null).is("deleted_at", null)
          .eq("is_group", false);
        if (scopeId) q = q.eq("client_id", scopeId);
        const [{ count }, group] = await Promise.all([q, fetchGroupUnread(supabase, user.id)]);
        if (on) setUnread((count || 0) + group.count);
      } catch { /* noop */ }
    }
    load();
    const iv = setInterval(load, pollMs);
    return () => { on = false; clearInterval(iv); };
  }, [pollMs]);
  return unread;
}
