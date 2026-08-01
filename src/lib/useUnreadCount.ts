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
