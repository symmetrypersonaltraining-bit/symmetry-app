"use client";

// Nav-badge count.
//
// This used to run its own 20s poll with its own WHERE clause — one of three
// components asking three different questions about the same thing. It had no
// `from_id !== me` filter while the bell did, so a trainer's own broadcast
// self-copy and the AI nudge digest (both from_id = to_id = trainer, client_id
// null) were counted here, rendered nowhere, and could not be cleared by
// anything except "Mark all read": a permanently lit badge.
//
// It is now a view onto useNotificationFeed, so the badge cannot disagree with
// the bell — they are the same number. The signature is unchanged so existing
// callers (BottomNav, AppBottomNav) did not need touching.

import { useNotificationFeed } from "@/lib/useNotificationFeed";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useUnreadCount(_pollMs = 20000): number {
  const { messageCount } = useNotificationFeed();
  return messageCount;
}

/**
 * Where the Messages tab should go, given what is actually unread.
 *
 * Dustin, 16 Aug: "ensure both rou[te] to group messages when thats where the
 * notification comes from."
 *
 * The bell already did — its rows carry their own href, and the group row
 * points at `/messages?client=group&m=<anchor>`. The nav tab did not: it was a
 * static link to `/messages`, so a badge lit by group activity dropped you on
 * the thread list with the group one tap further away. Small, and exactly the
 * kind of small that stops people opening a chat.
 *
 * Returns the newest unread row's destination, or null when there is nothing
 * unread — in which case the tab keeps its own href, because sending somebody
 * to a specific thread they did not ask for is worse than the list.
 */
export function useUnreadTarget(): { count: number; href: string | null } {
  const { items, messageCount } = useNotificationFeed();
  // items are sorted newest-first by the feed.
  const top = items.find((i) => i.count > 0);
  return { count: messageCount, href: top?.href ?? null };
}
