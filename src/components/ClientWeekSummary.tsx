"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useNutritionAverages } from "@/components/nutrition/useNutritionAverages";
import CoachBadge from "@/components/CoachBadge";
import AiBadge from "@/components/AiBadge";
import { fetchOwnClientRow } from "@/lib/ownClient";

import { useCoach } from "@/lib/useCoach";
import { useTakeoverSlot } from "@/lib/useTakeoverSlot";
import { TAKEOVER_PRIORITY } from "@/lib/takeoverSlot";

const briefKey = (weekStart: string) => "weekbrief-" + weekStart;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate());
}
function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return addDays(dateStr, -dt.getDay());
}
function fmtRange(a: string, b: string): string {
  const pa = a.split("-").map(Number);
  const pb = b.split("-").map(Number);
  return MON[pa[1] - 1] + " " + pa[2] + " – " + MON[pb[1] - 1] + " " + pb[2];
}

/**
 * A focus only shows if it belongs to the CURRENT week. No stamp, no display.
 *
 * This used to honour a NULL weekly_focus_week as "show it", so that rows
 * written before the provenance columns existed would not vanish. Every row in
 * production is a pre-provenance row, so the escape hatch WAS the rule: on
 * 21 Aug all 34 clients carrying a focus were being shown a line written on or
 * before 8 Aug, presented as this week's, with no date on it. Bobbie Page was
 * reading "3 lifts and 2 cardio days this week"; Christine Latham was reading
 * "It's been 9 days" on day 22.
 *
 * A line with no week stamp cannot be proven current, so it is not shown. The
 * card renders without a focus, which is what the food-logger's weekly read
 * (NutritionV3Client, ai_food_focus_week) has always done correctly.
 */
function currentWeekFocus(row: { weekly_focus?: string | null; weekly_focus_week?: string | null }): string | null {
  if (row.weekly_focus_week !== weekStartOf(todayCT())) return null;
  return row.weekly_focus || null;
}

interface Summary {
  // THIS week (matches the header + top schedule widget)
  doneThis: number; totalThis: number;
  // LAST week (the once-weekly full-screen review only)
  doneLast: number; totalLast: number;
  weightDelta: number | null; streak: number;
  focus: string | null; focusSource: string | null; firstName: string;
  lastWkStart: string; lastWkEnd: string; thisWk: string; thisWkEnd: string;
}

export default function ClientWeekSummary() {
  const { firstName: coachFirstName } = useCoach();
  // Component-scope client. The loader below makes its own for the big parallel
  // read; this one is for the brief's seen-marker, which outlives that closure.
  const [sup] = useState(() => createClient() as any);
  const [s, setS] = useState<Summary | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  // Deterministic Central-time date + week bounds (no async needed → stable for
  // the canonical adherence hooks below).
  const today = useMemo(() => todayCT(), []);
  const thisWk = useMemo(() => weekStartOf(today), [today]);
  // ONE definition of "the week", 21 Aug. This card used a ROLLING trailing
  // seven days for the review while the focus line printed directly underneath
  // it was stamped for the Sun–Sat calendar week — so opening it on a Wednesday
  // reviewed Thu–Wed and handed you a focus written for Sun–Sat, both labelled
  // "week". That mismatch is the inconsistency Dustin kept seeing between the
  // card and the AI copy next to it.
  //
  // The AI side was already right: lastWeekWindow/thisWeekWindow in
  // src/lib/ai/weekly-numbers.ts are the previous full Sun–Sat and Sunday-
  // through-today. The card now uses the same two windows, so the numbers under
  // the coaching and the numbers inside it cannot disagree.
  //
  // The old comment claimed the rolling window also stopped never-started
  // sessions padding the total. It did not — a trailing seven days contains
  // exactly as many stale `scheduled` rows as a calendar week does. That is a
  // real problem (1,043 rows point at programmes clients are no longer on) and
  // it is a data cleanup, not a windowing trick.
  const lastWkStart = useMemo(() => addDays(thisWk, -7), [thisWk]);
  const lastWkEnd = useMemo(() => addDays(thisWk, -1), [thisWk]);

  // CANONICAL nutrition adherence — the EXACT same source + method the logger's
  // AveragesStrip uses (computeDayTotals + plan-meal proration). Reusing the
  // hook means the home tile can never diverge from "adherence · 7d" in the app.
  // "1w" = last 7 days ending today (America/Chicago). Last-week uses a custom
  // range so the weekly review tile is canonical too.
  // Calendar week to date, NOT a rolling 7 days. Every other number on this
  // card is now Sunday-through-today; a nutrition figure quietly measuring
  // Thu–Wed alongside them is the same mismatch in miniature.
  const weekAdh = useNutritionAverages(clientId || "", today, "custom", thisWk, today, clientId);
  const lastWkAdh = useNutritionAverages(clientId || "", today, "custom", lastWkStart, lastWkEnd, clientId);

  const nutritionPctThis = weekAdh.result && weekAdh.result.adherence != null ? Math.round(weekAdh.result.adherence) : null;
  const nutritionPctLast = lastWkAdh.result && lastWkAdh.result.adherence != null ? Math.round(lastWkAdh.result.adherence) : null;

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const supabase: any = createClient();
        let cid: string | null = null;
        let clientName = "";
        let focus: string | null = null;
        let focusSource: string | null = null;
        try { cid = new URLSearchParams(window.location.search).get("forClient"); } catch { cid = null; }
        if (!cid) {
          const { data: userData } = await supabase.auth.getUser();
          const user = userData ? userData.user : null;
          if (!user) return;
          const col = "id, name, weekly_focus, weekly_focus_week, weekly_focus_source";
          // One path for everyone. The trainer branch used to look for a client
          // literally named Dustin, which finds nothing on any other instance —
          // see src/lib/ownClient.ts.
          const own = await fetchOwnClientRow<{
            id: string; name: string;
            weekly_focus?: string | null; weekly_focus_week?: string | null;
            weekly_focus_source: string | null;
          }>(supabase, user, col);
          if (own) { cid = own.id; clientName = own.name; focus = currentWeekFocus(own); focusSource = own.weekly_focus_source ?? null; }
        } else {
          const { data: c } = await supabase.from("clients").select("id, name, weekly_focus, weekly_focus_week, weekly_focus_source").eq("id", cid).limit(1);
          if (c && c[0]) { clientName = c[0].name; focus = currentWeekFocus(c[0]); focusSource = c[0].weekly_focus_source ?? null; }
        }
        if (!cid || !on) return;
        if (on) setClientId(cid);

        const thisWkEnd = addDays(thisWk, 6);
        const metricWindow = addDays(today, -21);

        const [swLast, swThis, metricsRows, wlogs, swStreak] = await Promise.all([
          supabase.from("scheduled_workouts").select("status, scheduled_date").is("deleted_at", null).eq("client_id", cid).gte("scheduled_date", lastWkStart).lte("scheduled_date", lastWkEnd),
          // THIS week counts only as far as TODAY. Dustin, 21 Aug: "how many
          // workouts they logged out of how many are scheduled per that current
          // day in the week... it should keep up with daily how many they have
          // logged against how many were in the schedule to log so far that
          // week." Bounding at thisWkEnd counted Thursday and Friday's sessions
          // against them on Tuesday, so the number could only ever look bad
          // until Saturday.
          supabase.from("scheduled_workouts").select("status, scheduled_date").is("deleted_at", null).eq("client_id", cid).gte("scheduled_date", thisWk).lte("scheduled_date", today),
          supabase.from("metrics").select("metric_date, weight").eq("client_id", cid).gte("metric_date", metricWindow).order("metric_date", { ascending: true }),
          supabase.from("workout_logs").select("log_date, completed, status").eq("client_id", cid).gte("log_date", addDays(today, -60)).order("log_date", { ascending: false }),
          // Sixty days of SCHEDULING, so the streak can tell a rest day from a
          // missed one. Without this it cannot, and it punishes rest.
          supabase.from("scheduled_workouts").select("scheduled_date, status").is("deleted_at", null).eq("client_id", cid).gte("scheduled_date", addDays(today, -60)).lte("scheduled_date", today),
        ]);

        // A SWAPPED-OUT SESSION IS NOT STILL ON THE PLAN.
        //
        // Replacing a day does not delete its row: AddWorkoutButton and
        // OffPlanBanner rewrite the original's status to 'skipped' and insert
        // the replacement beside it. Both rows survive `deleted_at is null`, so
        // the denominator counted the same session twice and the card read
        // "1/2 workouts done" on a day the client did exactly what was asked.
        const swappedOut = (r: { status?: string | null }) => r.status === "skipped";
        const lastRows = (swLast.data || []).filter((r: any) => !swappedOut(r));
        const totalLast = lastRows.length;
        const doneLast = lastRows.filter((r: any) => r.status === "completed").length;
        const thisRows = (swThis.data || []).filter((r: any) => !swappedOut(r));
        const totalThis = thisRows.length;
        const doneThis = thisRows.filter((r: any) => r.status === "completed").length;

        const mts = (metricsRows.data || []).filter((r: any) => r.weight != null);
        let weightDelta: number | null = null;
        if (mts.length >= 2) weightDelta = +(Number(mts[mts.length - 1].weight) - Number(mts[0].weight)).toFixed(1);

        // workout_logs.status can never be "completed" — its CHECK allows only
        // 'Done as planned' | 'Modified' | 'Partial' | 'Skipped' | 'Rest day'.
        // "completed" belongs to scheduled_workouts, and the two vocabularies
        // were conflated here. `completed` is the boolean that actually says
        // whether the session finished.
        // Dead rather than wrong here — the boolean already carried it — but a
        // dead clause with a false premise is how the MetricCards version of
        // this line ended up counting unfinished sessions.
        // ── STREAK: days they did what was asked, not days they trained ──────
        //
        // Dustin, 21 Aug: "my streak shows 2 right now bc i had a rest day wed,
        // that was programmed ive hit everything so far this week on programming
        // so my streak should be 5 days right now not 2."
        //
        // The old version walked back while a COMPLETED log existed and stopped
        // at the first day without one — so a programmed rest day ended the
        // streak exactly like a skipped session. That punishes people for
        // following the programme, and rest is part of the programme.
        //
        // Now: a day with nothing scheduled is passed over without breaking or
        // incrementing. Only a day that ASKED for something and did not get it
        // ends the run. Bounded to the 60 days of data fetched above.
        const doneDates = new Set<string>(
          (wlogs.data || []).filter((w: any) => w.completed).map((w: any) => w.log_date as string),
        );
        // A session ticked off on the schedule counts even if no log row exists.
        for (const r of (swStreak.data || []) as any[]) {
          if (r.status === "completed") doneDates.add(r.scheduled_date as string);
        }
        const askedDates = new Set<string>(
          ((swStreak.data || []) as any[]).map((r) => r.scheduled_date as string),
        );

        // Scoped to THIS Sun-Sat week and reset with it, like every other
        // number on this card. Dustin, 21 Aug: "this should be the week of so
        // sun-sat correct? like the rest of everything we did, same week that
        // we are on right now."
        //
        // A day is KEPT if they did what was asked, or if nothing was asked —
        // a programmed rest day is the programme working, not a gap in it. Only
        // a day that asked for something and did not get it ends the run.
        let streak = 0;
        let cursor = !doneDates.has(today) && askedDates.has(today) ? addDays(today, -1) : today;
        while (cursor >= thisWk) {
          if (doneDates.has(cursor) || !askedDates.has(cursor)) streak++;
          else break;
          cursor = addDays(cursor, -1);
        }

        const firstName = (clientName || "").split(" ")[0] || "there";
        if (!on) return;
        setS({ doneThis, totalThis, doneLast, totalLast, weightDelta, streak, focus: focus || null, focusSource, firstName, lastWkStart, lastWkEnd, thisWk, thisWkEnd });
      } catch { /* fail silent -> render nothing */ }
    })();
    return () => { on = false; };
  }, [today, thisWk, lastWkStart, lastWkEnd]);

  // Once-weekly full-screen review trigger (shown once/day-guarded). Fires when
  // the summary + last-week nutrition (canonical) have loaded and there's real
  // activity. Not shown in trainer preview (?forClient=…).
  //
  // WHEN THIS IS ALLOWED TO COVER THE SCREEN — rewritten 21 Aug.
  //
  // It used to fire on the first open of EVERY day, despite the comment above
  // it saying "once-weekly". Dustin: "i dont want screen take overs popping up
  // constantly and causing too much annoyance and clutter."
  //
  // Now: the first open of SUNDAY or MONDAY only. A "week in review" on a
  // Thursday is reviewing a week that is still happening, and by Tuesday the
  // week just gone is not news. Two days is its shelf life, so two days is what
  // it gets.
  //
  // "Seen" moved off localStorage and onto client_announcements_seen — the same
  // per-PERSON table ClientTakeovers uses — so dismissing it on the phone does
  // not leave it waiting on the iPad. The old key was written the moment it
  // OPENED, so a client who closed the app without reading it was recorded as
  // having seen it; the row is now written when they actually dismiss. The
  // localStorage day-key stays as a second belt: it caps an undismissed brief
  // at one appearance per day.
  useEffect(() => {
    if (!s || !clientId) return;
    let on = true;
    (async () => {
      try {
        const dow = new Date(today + "T12:00:00Z").getUTCDay(); // 0 Sun, 1 Mon
        if (dow !== 0 && dow !== 1) return;

        const hasActivity = s.totalLast > 0 || s.doneLast > 0 || s.streak > 0 || s.totalThis > 0 || (lastWkAdh.result?.loggedDays || 0) > 0;
        if (!hasActivity) return;

        let isPreview = false;
        try { isPreview = !!new URLSearchParams(window.location.search).get("forClient"); } catch { isPreview = false; }
        if (isPreview) return;

        const dayKey = "symmetry_weekbrief_v2_" + clientId + "_" + today;
        const weekKey = "symmetry_weekbrief_v2_seen_" + clientId + "_" + thisWk;
        try {
          if (localStorage.getItem(dayKey)) return;
          // Written only when the server-side marker failed to save.
          if (localStorage.getItem(weekKey)) return;
        } catch { /* ignore */ }

        const { data } = await sup
          .from("client_announcements_seen")
          .select("key")
          .eq("client_id", clientId)
          .eq("key", briefKey(thisWk))
          .limit(1);
        if (!on || (data && data.length > 0)) return;

        try { localStorage.setItem(dayKey, "1"); } catch { /* ignore */ }
        setShowBrief(true);
      } catch { /* a status screen must never break the dashboard */ }
    })();
    return () => { on = false; };
  }, [s, clientId, today, thisWk, sup, lastWkAdh.result]);

  // One full-screen interrupt at a time, app-wide. ClientTakeovers' six
  // announcements outrank this: a birthday is worth saying today only, a week
  // in review is still worth saying tomorrow. See src/lib/takeoverSlot.ts.
  const mayTakeOver = useTakeoverSlot("weekbrief", TAKEOVER_PRIORITY.WEEK_BRIEF, showBrief);

  if (!s) return null;

  async function dismissBrief() {
    setShowBrief(false);
    // Recorded per PERSON so it does not reappear on their other device.
    //
    // Checked, and with a real fallback rather than a shrug: if the row does not
    // land, this device at least remembers for the rest of the week, so a failed
    // write costs them one repeat on another device instead of one every Sunday
    // forever. There is nothing useful to show a client here — the card is
    // already closed and the thing that failed is bookkeeping — so the handling
    // is the fallback, not a message.
    if (!clientId) return;
    try {
      const { error } = await sup
        .from("client_announcements_seen")
        .insert({ client_id: clientId, key: briefKey(thisWk) });
      if (error) throw new Error(error.message);
    } catch (e) {
      console.error("week brief: seen-marker not saved", e);
      try { localStorage.setItem("symmetry_weekbrief_v2_seen_" + clientId + "_" + thisWk, "1"); } catch { /* ignore */ }
    }
  }

  const focusText = s.focus && s.focus.trim() ? s.focus.trim() : null;
  // Who actually wrote this line. The weekly sweep drafts it and Dustin approves
  // or rewrites it on Saturday — 'trainer' means his words, 'ai' means the app's.
  // Badging both the same way would make his own coaching indistinguishable from
  // generated copy, which costs him the thing that makes it worth reading.
  const focusIsAi = !!focusText && s.focusSource !== "trainer";
  const stat = (n: React.ReactNode, l: string, d?: React.ReactNode) => (
    <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--brand-text)" }}>{n}</div>
      <div style={{ fontSize: 11, color: "var(--brand-text-secondary)", marginTop: 2 }}>{l}</div>
      {d != null && <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: "#22c55e" }}>{d}</div>}
    </div>
  );

  return (
    <>
      {/* C2 — always-on "This Week" home card. Every tile = THIS week, matching
          the header range + the top schedule widget. */}
      <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 18, padding: 14, boxShadow: "0 8px 26px rgba(20,30,55,0.08)", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)" }}>📋 This week</div>
          <div style={{ fontSize: 11, color: "var(--brand-text-secondary)" }}>{fmtRange(s.thisWk, s.thisWkEnd)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: focusText || s.totalThis ? 10 : 0 }}>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{s.doneThis}/{s.totalThis || 0}</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>logged so far</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{nutritionPctThis != null ? nutritionPctThis + "%" : "—"}</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>nutrition · wk</div>
          </div>
          <div style={{ flex: 1, textAlign: "center", background: "var(--brand-card)", borderRadius: 11, padding: 7 }}>
            <div style={{ fontWeight: 800, color: "var(--brand-text)" }}>{s.streak}🔥</div>
            <div style={{ fontSize: 10, color: "var(--brand-text-secondary)" }}>days kept</div>
          </div>
        </div>
        {(focusText || s.totalThis > 0) && (
          <div className="focus-panel" style={{ padding: 9 }}>
            {focusIsAi ? <AiBadge size={30} mood="plan" /> : <CoachBadge size={30} />}
            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--brand-text)" }}>
              <b>Focus:</b> {focusText || (s.totalThis + " session" + (s.totalThis === 1 ? "" : "s") + " on the calendar this week — let's go.")}
            </div>
          </div>
        )}
      </div>

      {/* C1 — once-weekly full-screen briefing: a review of LAST week (header +
          all tiles = last week; nutrition uses the SAME canonical adherence). */}
      {showBrief && mayTakeOver && (
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "var(--brand-bg)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{ background: "linear-gradient(135deg,#7c9cf5,#8b6ff0)", color: "#fff", padding: "20px 18px 18px" }}>
            <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 600 }}>{fmtRange(s.lastWkStart, s.lastWkEnd).toUpperCase()}</div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>The week just finished</div>
            <div style={{ fontSize: 23, fontWeight: 800, marginTop: 2 }}>Your week in review 💪</div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {stat(<span>{s.doneLast}<span style={{ fontSize: 14, color: "var(--brand-text-secondary)" }}>/{s.totalLast || 0}</span></span>, "workouts done")}
              {stat(nutritionPctLast != null ? nutritionPctLast + "%" : "—", "nutrition adherence")}
              {stat(s.weightDelta != null ? (s.weightDelta > 0 ? "+" : "") + s.weightDelta + " lb" : "—", "body weight", s.weightDelta != null && s.weightDelta < 0 ? "▼ trending down" : undefined)}
              {stat(<span>{s.streak}🔥</span>, "days kept")}
            </div>
            <div style={{ fontWeight: 800, fontSize: 14, color: "var(--brand-text)", marginTop: 2 }}>This week's focus</div>
            <div className="focus-panel" style={{ padding: 11 }}>
              {focusIsAi ? <AiBadge size={30} mood="plan" /> : <CoachBadge size={30} />}
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--brand-text)" }}>
                <b>{focusIsAi ? "Your focus:" : `${coachFirstName}:`}</b> {focusText || ("You've got " + s.totalThis + " session" + (s.totalThis === 1 ? "" : "s") + " scheduled this week. Show up and stack another good one.")}
              </div>
            </div>
            <button onClick={dismissBrief} style={{ display: "block", textAlign: "center", background: "var(--brand-primary)", color: "#fff", fontWeight: 800, padding: 14, borderRadius: 15, fontSize: 15, border: "none", width: "100%", cursor: "pointer", marginTop: "auto" }}>
              Let&apos;s crush it →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
