"use client";

// Full-screen Sunday weigh-in reminder. Fires on Sundays (America/Chicago) when
// the client hasn't logged a weight yet that day and hasn't dismissed it this
// week. The primary button drops them straight onto the weight logger in the
// Progress screen (/progress?log=weight auto-opens it). Brand-color compliant.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchOwnClientRow } from "@/lib/ownClient";
import AiBadge from "@/components/AiBadge";

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function weekdayCT(): string {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "long" });
}

export default function SundayWeighInReminder() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        if (weekdayCT() !== "Sunday") return;
        const today = todayCT();
        const dismissKey = "sym:sundayweighin:" + today;
        try { if (localStorage.getItem(dismissKey)) return; } catch { /* ignore */ }

        const supabase: any = createClient();
        let cid: string | null = null;
        try { cid = new URLSearchParams(window.location.search).get("forClient"); } catch { cid = null; }
        if (!cid) {
          const { data: userData } = await supabase.auth.getUser();
          const user = userData ? userData.user : null;
          if (!user) return;
          {
            // Was a name search on the trainer branch — src/lib/ownClient.ts.
            const own = await fetchOwnClientRow<{ id: string }>(supabase, user, "id");
            const c = own ? [own] : null;
            cid = c && c[0] ? c[0].id : null;
          }
        }
        if (!cid) return;

        // Already weighed in today? Don't nag.
        const { data: m } = await supabase
          .from("metrics").select("id")
          .eq("client_id", cid).eq("metric_date", today)
          .not("weight", "is", null).limit(1);
        if (m && m.length) return;

        if (on) setShow(true);
      } catch { /* fail silent → no reminder */ }
    })();
    return () => { on = false; };
  }, []);

  function dismiss() {
    try { localStorage.setItem("sym:sundayweighin:" + todayCT(), "1"); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 85, background: "var(--brand-bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
      <div style={{ background: "linear-gradient(135deg,var(--brand-primary),#6366f1)", color: "#fff", padding: "26px 20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AiBadge size={26} mood="plan" ring={false} title="" />
          <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, letterSpacing: 0.5 }}>SUNDAY CHECK-IN</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>Time to weigh in ⚖️</div>
        <div style={{ fontSize: 13.5, opacity: 0.92, marginTop: 6, lineHeight: 1.5 }}>
          It&rsquo;s Sunday — your weekly weigh-in day. One number, same time, same routine. This is how we track what&rsquo;s working and dial in your next week.
        </div>
      </div>
      <div style={{ padding: 20, flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 16, boxShadow: "0 8px 26px rgba(20,30,55,0.08)" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)", marginBottom: 8 }}>Best practice</div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--brand-text-secondary)" }}>
            • First thing in the morning, after the bathroom, before food or water.<br />
            • Same scale, minimal clothing.<br />
            • Log it here — don&rsquo;t overthink one day&rsquo;s number; the trend is what matters.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { // /progress never read ?log=weight, so this button landed on a read-only
            // dashboard. /log is the screen that actually takes a weigh-in.
            window.location.href = "/log"; }}
          style={{ width: "100%", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, padding: 15, borderRadius: 15, fontSize: 15.5, border: "none", cursor: "pointer" }}>
          Log my weigh-in →
        </button>
        <button onClick={dismiss} style={{ width: "100%", marginTop: 10, background: "none", color: "var(--brand-text-secondary)", fontWeight: 700, padding: 10, fontSize: 13.5, border: "none", cursor: "pointer" }}>
          Not right now
        </button>
      </div>
    </div>
  );
}
