"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { allSteps } from "@/lib/tutorial/script";
import { useTutorialVisibility } from "@/lib/useTutorialVisibility";

/**
 * "Start here" on the dashboard, for a trainer who has not finished the
 * walkthrough.
 *
 * The tutorial had one door: a card partway down Settings. On a phone — which
 * is where the first trainer tested it — that is not a door anyone finds. This
 * puts it on the first screen of their first morning and then gets out of the
 * way: once every step has been seen the card stops rendering, and the guide
 * stays where it belongs in the sidebar and in Settings.
 *
 * Progress is read from the same localStorage key the player writes, because
 * that is where the player keeps it. Nothing here is authoritative — the real
 * setup checklist is queried from the database on the tutorial's last chapter
 * and cannot be ticked by hand.
 */
const SEEN_KEY = "symmetry_tutorial_seen_v1";

export default function TutorialCard() {
  const { visible } = useTutorialVisibility();
  const [done, setDone] = useState<number | null>(null);

  const total = allSteps().length;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setDone(Array.isArray(arr) ? arr.filter((x) => typeof x === "string").length : 0);
    } catch {
      setDone(0);
    }
  }, []);

  // undefined = not answered yet. Draw nothing rather than flashing a card on
  // and back off while the queries land. `visible` is already false for a
  // trainer who has finished and put the guide away.
  if (visible !== true || done === null) return null;
  if (done >= total) return null;

  const started = done > 0;
  const pct = Math.round((done / total) * 100);

  return (
    <Link
      href="/tutorial"
      className="card p-4 flex items-center gap-3"
      style={{ textDecoration: "none" }}
    >
      <span
        className="flex items-center justify-center rounded-xl shrink-0"
        style={{ width: 44, height: 44, background: "var(--brand-accent)", color: "#fff" }}
      >
        <i className="ti ti-school text-xl" />
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold" style={{ color: "var(--brand-text)" }}>
          {started ? "Pick up where you left off" : "Start here — set up your app"}
        </span>
        <span className="block text-xs mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>
          {started
            ? `${done} of ${total} steps done. It reads itself out loud.`
            : `Every screen and setting, in ${total} short steps, read out loud.`}
        </span>
        {started ? (
          <span
            className="block h-1 rounded-full mt-2 overflow-hidden"
            style={{ background: "var(--brand-surface-2)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${pct}%`, background: "var(--brand-accent)" }}
            />
          </span>
        ) : null}
      </span>

      <i className="ti ti-chevron-right shrink-0" style={{ color: "var(--brand-text-secondary)" }} />
    </Link>
  );
}
