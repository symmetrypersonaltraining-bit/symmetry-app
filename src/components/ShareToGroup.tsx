"use client";

import { useState } from "react";
import { sendGroupMessage } from "@/app/(app)/home/messageActions";
import { fx } from "@/lib/fx";

/**
 * ShareToGroup — post an achievement into the group chat. 2026-07-25.
 *
 * The community play: wins go into the group thread where everyone sees them,
 * rather than dying on a celebration screen the client closes.
 *
 * Deliberately reuses the EXISTING sendGroupMessage server action rather than
 * inserting into `messages` directly, so the push fan-out, revalidation and
 * group semantics stay owned by the messaging code and can't drift out of sync
 * with it. Nothing in the messaging UI is modified.
 *
 * Presentational and self-contained: one button, local state only, failures
 * surface inline and never bubble. Revert = remove the mount.
 */
export default function ShareToGroup({
  text,
  label = "Share to group",
  className,
  style,
}: {
  text: string;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function share() {
    if (state === "sending" || state === "sent") return;
    setState("sending");
    try {
      await sendGroupMessage(text);
      setState("sent");
      fx("complete");
    } catch {
      setState("error");
      fx("error");
      // Let them try again rather than stranding the win.
      window.setTimeout(() => setState("idle"), 2600);
    }
  }

  const copy =
    state === "sent" ? "Shared to group ✓"
    : state === "sending" ? "Sharing…"
    : state === "error" ? "Didn't send — tap to retry"
    : `👊 ${label}`;

  return (
    <button
      type="button"
      onClick={share}
      disabled={state === "sending" || state === "sent"}
      data-fx-own
      className={className}
      style={{
        border: 0,
        borderRadius: 24,
        padding: "11px 22px",
        fontWeight: 800,
        fontSize: 14,
        cursor: state === "sent" ? "default" : "pointer",
        background: state === "sent" ? "var(--brand-success, #3fb950)" : "var(--grad-cta, var(--brand-primary))",
        color: "#fff",
        opacity: state === "sending" ? 0.75 : 1,
        transition: "background .25s ease, opacity .2s ease",
        ...style,
      }}
    >
      {copy}
    </button>
  );
}
