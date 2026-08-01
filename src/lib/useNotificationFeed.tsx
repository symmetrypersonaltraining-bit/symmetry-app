"use client";

// ONE source of truth for unread — and exactly ONE instance of it.
//
// There used to be three independent pollers with three different WHERE
// clauses, which is why the badge stayed lit after the bell went quiet. The
// first attempt at fixing that made a worse mistake: it exported a hook that
// three separate components each called, so three Supabase browser clients each
// opened a realtime channel with the IDENTICAL topic name. Duplicate
// subscription, throw, and because MessageNotifier is mounted in the app layout
// the throw took down every page. tsc was clean and 295 tests passed, because
// neither exercises three components mounting against a websocket.
//
// So this is a PROVIDER, mounted once. Everything reads the same context: one
// client, one subscription, one set of queries. It is not possible to end up
// with two of these by adding another consumer, which is the whole point.
//
// Everything below is defensive on purpose. This renders inside the layout, so
// anything it throws is a white screen on every route rather than one broken
// badge. It must fail to zero, never fail loudly.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { aggregateNotifications, type NotifRow, type RawUnread } from "@/lib/notifications";
import { fetchGroupUnread, markGroupRead } from "@/lib/groupUnread";

export interface NotificationFeed {
  items: NotifRow[];
  total: number;
  messageCount: number;
  /** IDs new since the previous load — identity, not counts. */
  freshIds: string[];
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (item: NotifRow) => Promise<void>;
}

const EMPTY: NotificationFeed = {
  items: [], total: 0, messageCount: 0, freshIds: [], loading: false,
  refresh: async () => {}, markRead: async () => {},
};

const Ctx = createContext<NotificationFeed>(EMPTY);

const POLL_MS = 25000;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [items, setItems] = useState<NotifRow[]>([]);
  const [messageCount, setMessageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [freshIds, setFreshIds] = useState<string[]>([]);

  const knownIds = useRef<Set<string> | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);

  // One client for the life of the provider. createClient() builds a NEW
  // browser client every call, so calling it per consumer meant a websocket per
  // consumer.
  const supabase = useMemo(() => {
    try { return createClient(); } catch { return null; }
  }, []);

  const load = useCallback(async () => {
    if (!supabase || inFlight.current) return;
    inFlight.current = true;
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) { if (alive.current) setLoading(false); return; }

      const clientMode =
        typeof document !== "undefined" &&
        document.cookie.split("; ").some((x) => x === "symmetry_client_mode=1");

      const { data: me } = await supabase
        .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
      const isTrainer = !clientMode && !me;

      // ROWS, not a count. The banner needs to know WHICH messages are unread —
      // a HEAD count is why it could never route to the sender's thread.
      const { data: rows } = await supabase
        .from("messages")
        .select("id, from_id, to_id, client_id, body, created_at, read_at, deleted_at, is_group, is_broadcast, image_url")
        .eq("to_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      const unread = (rows ?? []) as RawUnread[];

      let clientNames: Record<string, string> = {};
      if (isTrainer) {
        const ids = Array.from(new Set(unread.map((r) => r.client_id).filter(Boolean))) as string[];
        if (ids.length) {
          const { data: cs } = await supabase.from("clients").select("id, name").in("id", ids);
          clientNames = Object.fromEntries(
            ((cs ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
          );
        }
      }

      const group = await fetchGroupUnread(supabase, user.id, clientMode);

      const agg = aggregateNotifications(unread, {
        isTrainer, myUserId: user.id, clientNames, clientMode,
      });

      // fetchGroupUnread owns the group watermark. aggregate only sees rows
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

      // Fresh by ID. A read and an arrival inside one window cannot cancel out
      // the way two counts could — that is how messages were being lost.
      const ids = new Set<string>([...unread.map((r) => r.id), ...group.ids]);
      if (knownIds.current === null) {
        knownIds.current = ids;                    // first load announces nothing
      } else {
        const fresh = [...ids].filter((id) => !knownIds.current!.has(id));
        knownIds.current = ids;
        if (alive.current && fresh.length) setFreshIds(fresh);
      }

      if (!alive.current) return;
      setItems(merged);
      setMessageCount(merged.reduce((n, i) => n + i.count, 0));
    } catch {
      /* never throw from the layout */
    } finally {
      inFlight.current = false;
      if (alive.current) setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    alive.current = true;
    load();
    const iv = setInterval(load, POLL_MS);
    return () => { alive.current = false; clearInterval(iv); };
  }, [load]);

  // Realtime is the primary channel; the poll above only covers a dropped
  // socket. The topic name is unique per mount — a fixed name is what collided
  // when this ran in three places at once.
  useEffect(() => {
    if (!supabase) return;
    const topic = "notif-feed-" + Math.random().toString(36).slice(2, 10);
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(topic)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { load(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "group_reads" }, () => { load(); })
        .subscribe();
    } catch {
      // Realtime unavailable (blocked socket, quota, whatever). The poll still
      // works, so degrade instead of taking the app down.
      ch = null;
    }
    return () => { try { if (ch) supabase.removeChannel(ch); } catch { /* noop */ } };
  }, [supabase, load]);

  // Reading a thread clears it server-side. These are what make every surface
  // notice immediately rather than waiting out a timer.
  useEffect(() => { load(); }, [pathname, load]);
  useEffect(() => {
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [load]);

  const markRead = useCallback(async (item: NotifRow) => {
    // Optimistic, so the bell, the badge and the banner all drop in the same
    // frame instead of the bell going quiet on its own.
    setItems((prev) => prev.filter((i) => i.key !== item.key));
    setMessageCount((n) => Math.max(0, n - item.count));
    if (!supabase) return;
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
        // Scope to the thread. Unscoped, tapping the client-side "Trainer" row
        // marked EVERY unread message to this user read across every client
        // thread — one tap wiped the trainer's whole inbox.
        if (item.kind === "client" && item.clientId) q = q.eq("client_id", item.clientId);
        await q;
      }
    } catch {
      /* noop */
    } finally {
      load();
    }
  }, [supabase, load]);

  const total = useMemo(() => items.reduce((n, i) => n + i.count, 0), [items]);

  const value = useMemo<NotificationFeed>(
    () => ({ items, total, messageCount, freshIds, loading, refresh: load, markRead }),
    [items, total, messageCount, freshIds, loading, load, markRead],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Read the shared feed. Returns an inert feed when no provider is mounted, so a
 * component used outside the app layout renders an empty badge rather than
 * crashing the tree.
 */
export function useNotificationFeed(): NotificationFeed {
  return useContext(Ctx);
}
