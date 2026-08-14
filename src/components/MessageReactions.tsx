"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fx } from "@/lib/fx";
import { notifyMessageReaction } from "@/app/(app)/home/messageActions";

/**
 * MessageReactions — kudos on group-chat messages. 2026-07-25.
 *
 * Tap 👊 on someone's win. That's the whole feature, and that's the point: the
 * group chat only becomes a community if reacting costs one tap. Anything that
 * needs a typed reply gets skipped.
 *
 * WHY THE SHARED STORE BELOW: a reaction bar under every message would mean one
 * query per message. Instead the first bar to mount fetches every reaction on
 * the thread ONCE and every other bar reads from that cache. Rendering 200
 * messages costs one round trip, not 200.
 *
 * Writes go through the browser client under RLS — a person can only insert a
 * reaction as themselves, and only on a message they can already see. Toggling
 * is idempotent at the database level via a unique constraint, so a
 * double-tap or two devices racing can't create duplicates.
 *
 * Fails silent. If the table is unreachable the bar renders as if there are no
 * reactions; it can never break the thread it sits inside.
 */

export const KUDOS = ["👊", "💪", "🔥", "👏", "❤️", "😂"] as const;

interface Reaction {
  message_id: string;
  user_id: string;
  emoji: string;
}

// ─── shared store ────────────────────────────────────────────────────────────
// Module scope on purpose: one load per page view, shared by every bar.

let cache: Reaction[] | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a bad listener must not stop the others */
    }
  });
}

async function loadAll(force = false): Promise<void> {
  if (cache && !force) return;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const supabase: any = createClient();
      // Every reaction the caller is allowed to see. RLS does the filtering, and
      // the table is small — one row per tap, not per message.
      const res = await supabase.from("message_reactions").select("message_id, user_id, emoji").limit(5000);
      cache = (res.data as Reaction[]) || [];
    } catch {
      cache = cache || [];
    } finally {
      inflight = null;
      notify();
    }
  })();
  return inflight;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function MessageReactions({
  messageId,
  userId,
  align = "left",
}: {
  messageId: string;
  userId: string | null;
  align?: "left" | "right";
}) {
  const [, bump] = useState(0);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    void loadAll();
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const mine = (cache || []).filter((r) => r.message_id === messageId);

  const counts: { emoji: string; n: number; byMe: boolean }[] = [];
  for (const e of KUDOS) {
    const hits = mine.filter((r) => r.emoji === e);
    if (hits.length) counts.push({ emoji: e, n: hits.length, byMe: !!userId && hits.some((r) => r.user_id === userId) });
  }

  const toggle = useCallback(
    async (emoji: string) => {
      if (!userId || busy) return;
      setBusy(true);
      setPicking(false);
      const had = (cache || []).some((r) => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);

      // Optimistic: the tap should feel instant even on a slow connection.
      if (cache) {
        cache = had
          ? cache.filter((r) => !(r.message_id === messageId && r.user_id === userId && r.emoji === emoji))
          : cache.concat([{ message_id: messageId, user_id: userId, emoji }]);
        notify();
      }
      // Reuses the existing vocabulary rather than inventing an effect: a light
      // tap when you take one back, the send pulse when you give one.
      fx(had ? "tap" : "send");

      try {
        const supabase: any = createClient();
        if (had) {
          await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", userId)
            .eq("emoji", emoji);
        } else {
          await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });
          // Tell the author, if they want to hear about it. Deliberately not
          // awaited: the reaction is already saved, the UI has already moved,
          // and a slow or failed push must not hold up the reconcile below or
          // make a saved reaction look like it failed.
          void notifyMessageReaction(messageId, emoji).catch(() => {});
        }
      } catch {
        /* fall through to the reconcile below */
      } finally {
        // Re-read the truth. If the write failed, the optimistic change is
        // undone here rather than leaving a phantom reaction on screen.
        await loadAll(true);
        setBusy(false);
      }
    },
    [messageId, userId, busy],
  );

  if (!userId) return null;

  const pillBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    padding: "1px 7px",
    borderRadius: 999,
    fontSize: 11.5,
    lineHeight: "18px",
    cursor: busy ? "default" : "pointer",
    background: "var(--brand-surface)",
    border: "1px solid var(--brand-border)",
    color: "var(--brand-text)",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        marginTop: 4,
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      {counts.map((c) => (
        <button
          key={c.emoji}
          type="button"
          data-fx-own
          onClick={() => toggle(c.emoji)}
          aria-label={c.emoji + " " + c.n}
          style={{
            ...pillBase,
            background: c.byMe ? "color-mix(in srgb, var(--brand-primary) 18%, var(--brand-surface))" : "var(--brand-surface)",
            borderColor: c.byMe ? "var(--brand-primary)" : "var(--brand-border)",
            fontWeight: c.byMe ? 800 : 600,
          }}
        >
          <span>{c.emoji}</span>
          <span style={{ fontSize: 10.5 }}>{c.n}</span>
        </button>
      ))}

      {picking ? (
        <span style={{ display: "inline-flex", gap: 2, background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 999, padding: "1px 4px" }}>
          {KUDOS.map((e) => (
            <button
              key={e}
              type="button"
              data-fx-own
              onClick={() => toggle(e)}
              aria-label={"React " + e}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "1px 3px", lineHeight: "18px" }}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            aria-label="Close reactions"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--brand-text-secondary)", padding: "1px 4px" }}
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setPicking(true)}
          aria-label="Add a reaction"
          title="Add a reaction"
          style={{ ...pillBase, color: "var(--brand-text-secondary)", fontSize: 11 }}
        >
          ☺+
        </button>
      )}
    </div>
  );
}
