"use client";

// A large, obvious way into the coach — for the two clients who need one.
//
// Dustin, 14 Aug, on his parents: the standard entry point is "56px in a
// corner — fine for Lauren, not for someone 71 holding the phone at arm's
// length." And on placement, which is the whole requirement: "wherever it fits
// well, do not let it cover any buttons on any page or tab... make sure this
// button does not cover up anything that is needed like another button."
//
// ⛔ WHY THIS IS NOT JUST A BIGGER CoachFab
//
// The obvious implementation — bump CoachFab's SIZE from 56 for these two — is
// the wrong one, and the repo already contains the evidence.
//
// CoachFab floats. It carries collision rules that were each paid for: it hides
// entirely while a keyboard is up, lifts for SessionDock, sits under sheets
// (z 1100 vs 1200), and clears the bottom nav. GlobalCoach then keeps a
// per-screen FAB_LIFT map on top of that, which exists because the 56px circle
// was already covering the Messages send button — Dustin, 13 Aug, with a
// screenshot: "the ai bot [is] over a button blocking it."
//
// A larger circle in that same corner covers strictly MORE on every screen. It
// would re-open that exact class of bug everywhere at once, and the only way to
// know would be to re-check every screen by eye — against an instruction whose
// whole point is that nothing may be covered.
//
// So: this is an IN-FLOW element, not a floating one. It sits in the document,
// above the dashboard's cards, and pushes content down instead of sitting on
// top of it. An in-flow element cannot cover a button. That satisfies "cover
// nothing" by construction rather than by inspection — and the 56px FAB is left
// exactly as it is for everyone, including these two, who keep it as a second
// way in on every other screen.
//
// It renders for nobody unless `client_app_settings.ai_pool_only` is true, and
// that is verified live: exactly Gerard and Sharon carry that flag.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { faceSrc } from "@/lib/ai/faces";
import { useCoach } from "@/lib/useCoach";

export default function BigCoachBar() {
  // The viewer's own coach's face set — see faceSrc().
  const { botSet, faces } = useCoach();

  const [show, setShow] = useState(false);
  const supabase = createClient();

  // Resolves its own client rather than taking a prop, mirroring GlobalCoach.
  // That keeps mounting this a one-line, additive change to ClientDashboard
  // instead of threading a new prop down from the page — the same containment
  // discipline Goals used on the Progress screen.
  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: byAuth } = await supabase
          .from("clients").select("id").eq("auth_user_id", user.id).maybeSingle();
        let id = (byAuth as { id: string } | null)?.id ?? null;
        if (!id && user.email) {
          const { data: byEmail } = await supabase
            .from("clients").select("id").eq("email", user.email).maybeSingle();
          id = (byEmail as { id: string } | null)?.id ?? null;
        }
        if (!id) return;

        const { data } = await supabase
          .from("client_app_settings")
          .select("ai_pool_only")
          .eq("client_id", id)
          .maybeSingle();
        // Absent row, absent column, or false all mean the same thing: not one
        // of the two. Fail to HIDDEN — an unexpected error must never put an
        // extra control on 33 other people's home screens.
        if (on) setShow((data as { ai_pool_only?: boolean | null } | null)?.ai_pool_only === true);
      } catch {
        if (on) setShow(false);
      }
    })();
    return () => { on = false; };
  }, [supabase]);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("symmetry:open-coach"))}
      aria-label="Ask your coach about today"
      className="w-full flex items-center gap-4 rounded-2xl mb-4"
      style={{
        // Generous, but a real button rather than a banner: full width, tall
        // enough to hit without aiming, and it says what it does. The face is
        // the same character as the corner button so it is recognisably the
        // same thing, just findable.
        minHeight: 84,
        padding: "16px 20px",
        background: "var(--brand-primary)",
        border: "none",
        textAlign: "left",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={faceSrc("neutral", botSet, faces)}
        alt=""
        width={56}
        height={56}
        style={{ width: 56, height: 56, objectFit: "contain", flexShrink: 0, display: "block" }}
      />
      <span className="flex flex-col">
        <span className="text-white font-semibold" style={{ fontSize: 19, lineHeight: 1.25 }}>
          Ask about today&rsquo;s workout
        </span>
        <span className="text-white/75" style={{ fontSize: 14, lineHeight: 1.3, marginTop: 2 }}>
          Swap it, move it, or ask me anything
        </span>
      </span>
    </button>
  );
}
