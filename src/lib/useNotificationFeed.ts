"use client";

// ONE source of truth for unread.
//
// There were three, and they disagreed by design:
//
//   NotificationCenter (bell)  20s poll, to_id=me, no is_group filter, limit 300
//   useUnreadCount (nav badge) 20s poll, is_group=false, counts own broadcasts
//   MessageNotifier (banner)   15s poll, excludes broadcasts AND group
//
// Three different questions, three different timers, three different answers.
// That is why the badge stayed lit after the bell had gone quiet, and why
// opening a message cleared one surface and not the others. This hook asks the
// question once and everything renders from the same array.
//
// Two behaviours the old code got wrong and this fixes:
//
//  1. IDENTITY, NOT COUNTS. The banner fired when the total unread count went
//     UP. Read one message while another arrived inside the same 15s window and
//     the total was unchanged — no banner — and the watermark advanced anyway,
//     so that message was never announced again. It is gone for good. We track
//     message IDs, so nothing can cancel out.
//
//  2. IT REACTS. Nothing refetched on navigation or on the app returning to the
//     foreground. Opening a thread cleared it server-side and the badge learned
//     about it up to 20 seconds later — longer if the phone had frozen the
//     timer in the background. Realtime is primary here, with the poll as a
//     fallback, plus an immediate refetch on route change and on visibility.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { aggregateNotifications, type NotifRow, type RawUnread } from "@/lib/notifications";
import { fetchGroupUnread, markGroupRead } from "@/lib/groupUnread";

export interface NotificationFeed {
  items: NotifRow[];
  /** Everything unread — drives the bell. */
  total: number;
  /** Direct + broadcast + group — drives the Messages tab badge. */
  messageCount: number;
  /** IDs seen since mount, so callers can tell genuinely-new from already-known. */
  freshIds: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (item: NotifRow) => Promise<void>;
}

const POLL_MS = 25000;

export function useNotificationFeed(): NotificationFeed {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<NotifRow[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [freshIds, setFreshIds] = useState<string[]>([]);

  const knownIds = useRef<Set<string> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) { setLoading(false); return; }

      const clientMode =
        typeof document !== "undefined" &&
        document.cookie.split("; ").some((x) => x === "symmetry_client_mode=1");

      // Trainer identity decides how direct messages are grouped: by client for
      // the trainer, into one "Trainer" thread for a client.
      const { data: me } = await supabase
        .from("clients")
        .select("id, name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      const isTrainer = !clientMode && !me;

      // ROWS, not a count. The banner needs to know WHICH messages are unread —
      // asking for `{ count: 'exact', head: true }` was why it could never route
      // to the sender's thread and had to fall back to the inbox list.
      const { data: rows } = await supabase
        .from("messages")
        .select("id, from_id, to_id, client_id, body, created_at, read_at, deleted_at, is_group, is_broadcast, image_url")
        .eq("to_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      const unread = (rows ?? []) as RawUnread[];

      // Names for the trainer's per-client grouping.
      let clientNames: Record<string, string> = {};
      if (isTrainer) {
        const ids = Array.from(new Set(unread.map((r) => r.client_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: cs } = await supabase.from("clients").select("id, name").in("id", ids);
          clientNames = Object.fromEntries(((cs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        }
      }

      const group = await fetchGroupUnread(supabase, user.id, clientMode);

      const agg = aggregateNotifications(unread, {
        isTrainer,
        myUserId: user.id,
        clientNames,
        clientMode,
      });

      // fetchGroupUnread owns the group watermark; aggregate only sees rows
      // addressed to this user, and a group message is addressed to its sender.
      const merged: NotifRow[] = [
        ...agg.filter((a) => a.kind !== "group"),
        ...(group.count > 0
          ? [{
              key: "group",
              kind: "group" as const,
              title: "Group Chat",
              snippet: group.snippet ?? "New messages in the group",
              count: group.count,
              time: group.latest?.created_at ?? new Date().toISOString(),
              href:
                "/messages?client=group" +
                (clientMode ? "&as=client" : "") +
                (group.anchorId ? "&m=" + group.anchorId : ""),
            }]
          : []),
      ].sort((a, b) => (b.time || "").localeCompare(a.time || ""));

      // New-since-last-look, by ID. A read and an arrival in the same window
      // cannot cancel each other out the way two counts could.
      const ids = new Set<string>([...unread.map((r) => r.id), ...group.ids]);
      if (knownIds.current === null) {
        knownIds.current = ids;           // first load announces nothing
        if (alive.current) setFreshIds([]);
      } else {
        const fresh = [...ids].filter((id) => !knownIds.current!.has(id));
        knownIds.current = ids;
        if (alive.current && fresh.length) setFreshIds(fresh);
      }

      if (!alive.current) return;
      setItems(merged);
      setMessageCount(merged.reduce((n, i) => n + i.count, 0));
    } catch {
      /* a notification badge must never take a page down */
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [supabase]);

  // Initial + poll fallback.
  useEffect(() => {
    alive.current = true;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive.current = false; clearInterval(iv); };
  }, [load]);

  // Realtime. This is the primary channel; the poll above only covers a dropped
  // socket. Without it the app waited out a timer for something the database
  // already knew.
  useEffect(() => {
    const ch = supabase
      .channel("notif-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_reads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, load]);

  // React to the app coming back and to navigation. Reading a thread clears it
  // server-side; these are what make every surface notice straight away.
  useEffect(() => { load(); }, [pathname, load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);

  // Clear one source. Optimistic so every surface drops in the same frame, then
  // reconciled by the reload — the old code cleared the bell's own state only,
  // leaving the nav badge lit for another 20 seconds.
  const markRead = useCallback(async (item: NotifRow) => {
    setItems((prev) => prev.filter((i) => i.key !== item.key));
    setMessageCount((n) => Math.max(0, n - item.count));
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;

      if (item.kind === "group") {
        await markGroupRead(supabase);
      } else {
        let q = supabase
          .from("messages")
          .update({ read_at: new Date().toISOString() })
          .eq("to_id", user.id)
          .is("read_at", null)
          .is("deleted_at", null)
          .eq("is_group", false);
        // Scope to the thread. Without this, tapping the client-side "Trainer"
        // row marked EVERY unread message to this user read, across every
        // client thread — one tap wiped the trainer's whole inbox.
        if (item.kind === "client" && item.clientId) q = q.eq("client_id", item.clientId);
        await q;
      }
    } finally {
      load();
    }
  }, [supabase, load]);

  const total = useMemo(() => items.reduce((n, i) => n + i.count, 0), [items]);

  return { items, total, messageCount, freshIds, loading, refresh: load, markRead };
}
