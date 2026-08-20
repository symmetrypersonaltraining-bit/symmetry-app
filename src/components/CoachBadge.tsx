"use client";

// The coach's badge (Dustin) shown on client-facing coaching surfaces — Coach's
// Read, the weekly Focus callout, etc. Renders his profile photo (clients
// .avatar_url for the trainer account) with the "DG" gradient monogram as a
// fallback. Resolved once per mount; the trainer row rarely changes.
//
// THIS IS THE REAL PHOTO, AND IT STAYS THAT WAY. Dustin's rule, 2026-08-01:
// the cartoon is for AI-generated surfaces only — Coach Bot and anything else
// the app writes on its own. Anywhere a client is reading something FROM HIM
// shows his actual face. Putting the cartoon here would quietly relabel his
// own coaching as machine output, which is the opposite of what it is.
// The cartoon lives at /public/coachbot.png; do not wire it in here.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
// Module-level cache so multiple badges on one screen don't each hit the DB.
let cachedUrl: string | null | undefined; // undefined = not fetched, null = none

export default function CoachBadge({ size = 30, initials = "DG" }: { size?: number; initials?: string }) {
  const [url, setUrl] = useState<string | null | undefined>(cachedUrl);

  useEffect(() => {
    if (cachedUrl !== undefined) { setUrl(cachedUrl); return; }
    let on = true;
    (async () => {
      try {
        const supabase: any = createClient();
        // The COACH the viewer actually has — their own trainer's avatar, not
        // the owner's. A client of Stephanie's saw Dustin's face on every
        // coach badge in the app.
        //
        // Resolved through the viewer's own client row, so it works for a
        // client (their trainer) and degrades to nothing rather than to the
        // wrong person when there is no row to resolve from.
        const { data: me } = await supabase
          .from("clients")
          .select("trainer_id")
          .eq("auth_user_id", (await supabase.auth.getUser()).data?.user?.id || "")
          .limit(1);
        const tid = me && me[0]?.trainer_id;
        const { data } = tid
          ? await supabase.from("trainers").select("avatar_url").eq("id", tid).limit(1)
          : { data: null };
        const u = (data && data[0]?.avatar_url) || null;
        cachedUrl = u;
        if (on) setUrl(u);
      } catch { if (on) setUrl(null); }
    })();
    return () => { on = false; };
  }, []);

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Coach" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", fontWeight: 800, fontSize: Math.round(size * 0.4), display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>{initials}</div>
  );
}
