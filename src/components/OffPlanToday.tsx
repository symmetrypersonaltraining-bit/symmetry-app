"use client";

// What you logged today that wasn't on the plan.
//
// Todd Prine, 14 Aug 2026: "Tried to just type my run in for a workout and I
// don't think it saved." It had saved — the row was in offplan_workout_logs two
// minutes before he wrote — but NOTHING on the home screen renders that table.
// He typed his run, the page reloaded, and came back byte-for-byte identical.
//
// The save now confirms itself in the sheet (see AddWorkoutButton), which stops
// the moment of doubt. This is the other half: the thing he logged has to still
// be there when he looks again tomorrow, or the doubt just returns on a delay.
//
// ADDITIVE, deliberately. Dustin's standing rule on this dashboard is that new
// things arrive as their own card so nothing existing can regress — it is why
// the Goals work was built this way. So this fetches its own data, renders
// NOTHING when there is nothing to show, and touches neither the props
// interface, the server component, nor the Today's Workout card.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

import { useCoach } from "@/lib/useCoach";

interface Row {
  id: string;
  description: string;
  details: string | null;
  log_date: string;
}

function ctToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export default function OffPlanToday({ clientId }: { clientId?: string }) {
  const { firstName: coachFirstName } = useCoach();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = createClient();
        let cid = clientId;
        if (!cid) {
          const { data: u } = await supabase.auth.getUser();
          if (!u?.user) return;
          const { data } = await supabase
            .from("clients").select("id").eq("auth_user_id", u.user.id).limit(1);
          cid = (data as { id: string }[] | null)?.[0]?.id;
        }
        if (!cid) return;
        const { data } = await supabase
          .from("offplan_workout_logs")
          .select("id, description, details, log_date")
          .eq("client_id", cid)
          .eq("log_date", ctToday())
          .order("created_at", { ascending: false });
        if (alive && data) setRows(data as Row[]);
      } catch {
        // A card that cannot load its own data says nothing. It must never be
        // the reason the rest of the home screen fails to render.
      }
    })();
    return () => { alive = false; };
  }, [clientId]);

  if (!rows.length) return null;

  return (
    <div className="metric-card" style={{ marginBottom: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--brand-text-secondary)" }}>
          Also logged today
        </span>
        <span
          className="font-extrabold px-2 py-0.5 rounded-full"
          style={{ background: "color-mix(in srgb, #22c55e 16%, transparent)", color: "#16a34a", fontSize: 9 }}
        >
          LOGGED
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.id} style={{ marginBottom: 6 }}>
          {/* details holds the full text; description is truncated to 80 chars
              at write time, and showing the clipped version to the person who
              typed it is its own small "did that save properly?" */}
          <p className="text-sm" style={{ color: "var(--brand-text)", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
            {r.details || r.description}
          </p>
        </div>
      ))}
      <p style={{ color: "var(--brand-text-secondary)", fontSize: 10, marginTop: 2 }}>
        {coachFirstName} can see this.
      </p>
    </div>
  );
}
