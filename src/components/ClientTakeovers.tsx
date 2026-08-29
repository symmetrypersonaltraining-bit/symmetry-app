"use client";

// The full-screen things the app says to a client, and the rules for when it is
// allowed to say them.
//
// There are five of these now — it's your birthday, join the challenge,
// celebrate the winner, read the trainer's announcement, and (last, quietly)
// tell us when your birthday is — and they were heading for five components
// each deciding independently whether to cover the screen. That ends with two
// takeovers stacked on top of each other on a Sunday evening, which is worse
// than either alone.
//
// So: ONE component, ONE query pass, and at most ONE takeover ever on screen.
// Priority is by shelf life, not importance. A birthday is good for ONE day and
// is therefore first; the winner announcement is stale by Tuesday; a challenge
// invitation is good until the challenge ends; an announcement Dustin wrote
// will still make sense tomorrow; "when is your birthday" is good forever and
// so goes last, behind everything with an expiry date. Whatever loses today is
// still unseen tomorrow, so nothing is dropped — it just waits.
//
// "Seen" is per PERSON (client_announcements_seen), not per device. localStorage
// would re-show a takeover on their phone after they dismissed it on the iPad,
// and a full-page interruption that comes back is worse than one that never
// fired.
//
// Everything is defensive: this renders inside the dashboard, so a throw here is
// a broken home screen. Every failure path renders nothing.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fx } from "@/lib/fx";
import Confetti from "@/components/Confetti";

import { useCoach } from "@/lib/useCoach";
import AiBadge from "@/components/AiBadge";
import { lapseMood, type LapseTier } from "@/lib/ai/faces";
import { useTakeoverSlot } from "@/lib/useTakeoverSlot";
import { TAKEOVER_PRIORITY } from "@/lib/takeoverSlot";
import { centralFormat, centralToday } from "@/lib/central-time";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function pretty(iso: string): string {
  const [, m, d] = (iso || "").split("-").map(Number);
  return MON[m - 1] ? MON[m - 1] + " " + d : iso;
}

interface Challenge {
  id: string;
  title: string;
  emoji: string | null;
  metric: string;
  starts_on: string;
  ends_on: string;
  days_left: number | null;
}

interface Winner {
  id: string;
  title: string;
  emoji: string | null;
  metric: string;
  winner_score: number | null;
  winner_name: string;
  winner_is_me: boolean;
  my_score: number;
  my_rank: number | null;
}

interface PastDue {
  id: string;
  due_date: string;
  amount: number;
  daysLate: number;
}

interface Announcement {
  id: string;
  body: string;
  created_at: string;
}

type Pick =
  | { kind: "birthday"; key: string; firstName: string }
  | { kind: "askdob"; key: string }
  | { kind: "winner"; key: string; winner: Winner }
  | { kind: "challenge"; key: string; challenge: Challenge; myScore: number; myRank: number | null; total: number; people: number; joined: boolean }
  | { kind: "announcement"; key: string; announcement: Announcement }
  | { kind: "pastdue"; key: string; due: PastDue }
  | { kind: "lapse"; key: string; firstName: string; tier: LapseTier; daysSince: number; priorDays: number }
  | null;

// The announcement key names the CHALLENGE, not the month.
//
// It was "challenge-launch-2026-08", hardcoded. Every client who saw August's
// challenge has that string marked seen, so a challenge launched in September
// would have been silently announced to nobody — no error, no empty state, you
// would just notice that nobody joined. Keyed to the row's own id, each new
// challenge announces itself exactly once and nothing has to be edited to
// launch the next one.
const launchKey = (challengeId: string) => `challenge-launch-${challengeId}`;

export default function ClientTakeovers({ basePath = "" }: { basePath?: string }) {
  const { firstName: coachFirstName } = useCoach();
  const router = useRouter();
  const supabase = createClient();

  const [pick, setPick] = useState<Pick>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dob, setDob] = useState("");
  const [dobErr, setDobErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: me } = await supabase.rpc("my_client_id");
        const cid = (me as string | null) ?? null;
        if (!cid) return;

        // Archived clients get nothing. Tina was archived on 13 Aug and would
        // otherwise have been the longest-silent person in the room.
        // Also read what they have already told us about check-ins: a screen you
        // cannot switch off is a nag, so "don't show again" and "snooze" are
        // checked BEFORE anything is chosen, not after.
        const { data: meGate } = await supabase
          .from("clients").select("archived_at").eq("id", cid).maybeSingle();
        if ((meGate as { archived_at: string | null } | null)?.archived_at) return;

        const { data: prefRow } = await supabase
          .from("client_app_settings")
          .select("checkin_nudges_off, checkin_snoozed_until")
          .eq("client_id", cid).maybeSingle();
        const pref = prefRow as { checkin_nudges_off?: boolean | null; checkin_snoozed_until?: string | null } | null;

        const { data: seenRows } = await supabase
          .from("client_announcements_seen")
          .select("key")
          .eq("client_id", cid);
        const seen = new Set(((seenRows as { key: string }[]) ?? []).map((r) => r.key));

        // ── 0. Their own birthday ────────────────────────────────────────
        // First, because it is only true for one day. Everything else below
        // still makes sense tomorrow; this doesn't.
        const { data: meRow } = await supabase
          .from("clients")
          .select("name, date_of_birth")
          .eq("id", cid)
          .maybeSingle();
        const meC = meRow as { name: string | null; date_of_birth: string | null } | null;
        const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
        const dobMd = (meC?.date_of_birth || "").slice(5, 10);
        // 29 Feb falls back to the 28th in a non-leap year — see lib/birthdays.
        const yr = Number(todayCT.slice(0, 4));
        const leap = (yr % 4 === 0 && yr % 100 !== 0) || yr % 400 === 0;
        const effMd = dobMd === "02-29" && !leap ? "02-28" : dobMd;
        // ── 0. MONEY, BEFORE ANYTHING ELSE ───────────────────────────────
        //
        // Dustin, 29 Aug, having chased two clients by email: "send ... app
        // screen take over letting them know payment is late."
        //
        // The banner on the home screen was already there and had been up for
        // over a week in both cases, unacknowledged. A banner is easy not to
        // see. This is the one thing in here that costs him money to have
        // missed, so it goes ahead of the birthday.
        //
        // ONLY when the trainer has approved the reminder (status "sent"), the
        // client has not said they paid, and the due date has actually passed.
        // Nothing here dunning anybody early.
        //
        // The key carries TODAY'S DATE, deliberately, and this is the whole
        // difference between this and everything below it. An announcement is
        // seen once and gone. A debt is not: dismissing it must not make it
        // disappear until it is settled, so it returns tomorrow, once a day,
        // until they tap "I've paid this" — which sets client_ack_at and ends
        // it for good.
        {
          const { data: overdue } = await supabase
            .from("payment_reminders")
            .select("id, due_date, amount_due, notification_status, client_ack_at, paid_confirmed_at")
            .eq("client_id", cid)
            .eq("notification_status", "sent")
            .is("client_ack_at", null)
            .is("paid_confirmed_at", null)
            .lt("due_date", todayCT)
            .order("due_date", { ascending: true })
            .limit(1);
          const od = ((overdue as { id: string; due_date: string; amount_due: number }[]) ?? [])[0];
          if (od) {
            const key = "pastdue-" + od.id + "-" + todayCT;
            if (!seen.has(key) && alive) {
              const days = Math.max(
                1,
                Math.round((Date.parse(todayCT) - Date.parse(od.due_date)) / 86400000),
              );
              setMeId(cid);
              setPick({
                kind: "pastdue",
                key,
                due: { id: od.id, due_date: od.due_date, amount: Number(od.amount_due) || 0, daysLate: days },
              });
              return;
            }
          }
        }

        const bdayKey = "birthday-" + todayCT.slice(0, 4);
        if (effMd && effMd === todayCT.slice(5, 10) && !seen.has(bdayKey)) {
          if (alive) {
            setMeId(cid);
            setPick({ kind: "birthday", key: bdayKey, firstName: (meC?.name || "").split(" ")[0] || "you" });
          }
          return;
        }

        // ── 1. A winner to celebrate ─────────────────────────────────────
        // Only for three days. "Cheyenne won!" a week later is not a
        // celebration, it is clutter, and it would sit in front of the
        // challenge that is running NOW.
        const cutoff = new Date(Date.now() - 3 * 86400000).toISOString();
        const { data: done } = await supabase
          .from("group_challenges")
          .select("id, title, emoji, metric, winner_client_id, winner_score, scored_at")
          .eq("status", "complete")
          .not("winner_client_id", "is", null)
          .gte("scored_at", cutoff)
          .order("scored_at", { ascending: false })
          .limit(1);
        const w = ((done as {
          id: string; title: string; emoji: string | null; metric: string;
          winner_client_id: string; winner_score: number | null;
        }[]) ?? [])[0];

        if (w && !seen.has("challenge-winner-" + w.id)) {
          const { data: board } = await supabase.rpc("challenge_leaderboard", { p_challenge_id: w.id });
          const rows = (board as { client_id: string; client_name: string; score: number; rnk: number; is_me: boolean }[]) ?? [];
          const champ = rows.find((r) => r.client_id === w.winner_client_id);
          const mine = rows.find((r) => r.is_me);
          if (alive) {
            setMeId(cid);
            setPick({
              kind: "winner",
              key: "challenge-winner-" + w.id,
              winner: {
                id: w.id,
                title: w.title,
                emoji: w.emoji,
                metric: w.metric,
                winner_score: w.winner_score,
                winner_name: (champ?.client_name || "").split(" ")[0] || "Someone",
                winner_is_me: w.winner_client_id === cid,
                my_score: Number(mine?.score) || 0,
                my_rank: mine?.rnk ?? null,
              },
            });
          }
          return;
        }

        // ── 2. The live challenge, if they have never been told ──────────
        //
        // The challenge is fetched FIRST now, because the key is derived from
        // it. One extra read on a screen that already makes several, in
        // exchange for a launch that cannot be missed.
        {
          const { data: c } = await supabase.from("v_active_challenge").select("*")
            // The view no longer stops at one row — it cannot, now that two
            // rooms can each have a live challenge. RLS still gives THIS reader
            // at most their own room's, so maybeSingle() is safe; the explicit
            // limit is what keeps it safe if a policy ever widens.
            .order("starts_on", { ascending: false }).limit(1).maybeSingle();
          const ch = (c as Challenge | null) ?? null;
          if (ch && !seen.has(launchKey(ch.id))) {
            const [{ data: rows }, { data: tot }] = await Promise.all([
              supabase.rpc("challenge_leaderboard", { p_challenge_id: ch.id }),
              supabase.rpc("challenge_group_total", { p_challenge_id: ch.id }),
            ]);
            const mine = ((rows as { is_me: boolean; rnk: number; score: number }[]) ?? []).find((r) => r.is_me);
            const t = Array.isArray(tot) ? tot[0] : tot;
            if (alive) {
              setMeId(cid);
              setPick({
                kind: "challenge",
                key: launchKey(ch.id),
                challenge: ch,
                // Falls back to the group-total RPC's my_score, which is the
                // caller's own data and is returned even for someone who is not
                // ranked (the coach). Otherwise their own days read as 0.
                myScore: Number(mine?.score ?? t?.my_score) || 0,
                myRank: mine?.rnk ?? null,
                total: Number(t?.group_total) || 0,
                people: Number(t?.contributors) || 0,
                joined: !!t?.joined,
              });
            }
            return;
          }
        }

        // ── 3. An announcement from Dustin ───────────────────────────────
        // Broadcasts only, last 7 days, newest first. A broadcast is the
        // deliberate "everyone needs to read this" channel — ordinary group
        // chatter never lands here.
        const week = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data: msgs } = await supabase
          .from("messages")
          .select("id, body, created_at")
          .eq("is_broadcast", true)
          .is("deleted_at", null)
          .gte("created_at", week)
          .order("created_at", { ascending: false })
          .limit(5);
        const ann = ((msgs as Announcement[]) ?? []).find((m) => !seen.has("announcement-" + m.id));
        if (ann && alive) {
          setMeId(cid);
          setPick({ kind: "announcement", key: "announcement-" + ann.id, announcement: ann });
          return;
        }

        // ── 4. They were logging, and then they stopped ──────────────────
        //
        // Dustin, 2026-08-12: "I have several clients that don't do it at all.
        // I don't want the AI to keep pestering them about that... try to keep
        // it only to people that were logging consistently and fell off, not
        // ones that have never logged before at all."
        //
        // So this is measured against THEIR OWN normal, never an absolute
        // count of missed days. The rule lives in lib/ai/faces (lapseMood) and
        // is unit-tested there; this screen only supplies the two numbers.
        //
        // Dry run against live data, 13 Aug: fires for 3 of 30 clients, all at
        // the gentle tier. It stays silent for the two people who have been
        // quiet the LONGEST (27 and 25 days) because neither ever logged
        // regularly — which is the entire point.
        //
        // The seen-key is stamped with the date of their last log, so it is one
        // key per LAPSE, not per day: gentle once, firm once, and then nothing
        // until they log again and later fall off afresh.
        const checkinsAllowed =
          pref?.checkin_nudges_off !== true &&
          !(pref?.checkin_snoozed_until && pref.checkin_snoozed_until >= todayCT);

        const { data: lastMeal } = await supabase
          .from("meal_adherence_logs").select("log_date")
          .eq("client_id", cid).order("log_date", { ascending: false }).limit(1);
        const { data: lastWk } = await supabase
          .from("workout_logs").select("log_date")
          .eq("client_id", cid).eq("completed", true)
          .order("log_date", { ascending: false }).limit(1);
        const lastLog = [
          ((lastMeal as { log_date: string }[]) ?? [])[0]?.log_date,
          ((lastWk as { log_date: string }[]) ?? [])[0]?.log_date,
        ].filter(Boolean).sort().pop();

        if (lastLog && checkinsAllowed) {
          const dayMs = 86400000;
          const daysSince = Math.round((Date.parse(todayCT) - Date.parse(lastLog)) / dayMs);
          const windowStart = new Date(Date.parse(lastLog) - 28 * dayMs).toISOString().slice(0, 10);
          const [{ data: mealDays }, { data: wkDays }] = await Promise.all([
            supabase.from("meal_adherence_logs").select("log_date")
              .eq("client_id", cid).gt("log_date", windowStart).lte("log_date", lastLog),
            supabase.from("workout_logs").select("log_date")
              .eq("client_id", cid).eq("completed", true).gt("log_date", windowStart).lte("log_date", lastLog),
          ]);
          const distinct = new Set<string>();
          for (const r of ((mealDays as { log_date: string }[]) ?? [])) distinct.add(r.log_date);
          for (const r of ((wkDays as { log_date: string }[]) ?? [])) distinct.add(r.log_date);
          const tier = lapseMood({ daysSinceLog: daysSince, priorLoggedDays28: distinct.size });
          const lapseKey = tier ? `lapse-${tier}-${lastLog}` : "";
          if (tier && !seen.has(lapseKey) && alive) {
            setMeId(cid);
            setPick({
              kind: "lapse", key: lapseKey,
              firstName: (meC?.name || "").split(" ")[0] || "you",
              tier, daysSince, priorDays: distinct.size,
            });
            return;
          }
        }

        // ── 5. "When's your birthday?" ───────────────────────────────────
        // 18 of Dustin's 34 clients have no date on file, and a birthday bot
        // that skips half the room reads as favouritism. This asks.
        //
        // The key carries the MONTH, deliberately. Everything else here is seen
        // once and gone forever, which is right for an announcement and wrong
        // for a question: somebody who taps "not now" while walking into a
        // session would never be asked again, and the gap would be permanent.
        // A month-stamped key means skipping costs them nothing today and asks
        // again in thirty days. Answering writes the date, and the date itself
        // is what stops it — not the seen-marker.
        // ...and ask again when the date on file cannot be right.
        //
        // Madeleine Coker's date of birth was stored as 2026-08-04 -- 23 days
        // old on 27 Aug -- because the intake form had no upper bound on its
        // date input. The prompt below already validates what a CLIENT types
        // (no future, no year before 1900); it simply never ran for her,
        // because it only fired on a MISSING date and hers was present.
        //
        // Dustin, 28 Aug: "make sure she is able to update it herself first."
        // She can -- RLS lets a client write their own row -- she was just
        // never asked. An impossible date is now treated as no date.
        const __dobOnFile = meC?.date_of_birth || "";
        const __dobYear = Number(__dobOnFile.slice(0, 4));
        const __dobImpossible =
          !!__dobOnFile &&
          (__dobOnFile > todayCT || !__dobYear || __dobYear < 1900 ||
           // Nobody training here is under 13. A date inside that window is a
           // typo or a default, not a birthday, and the birthday bot would
           // announce it to the whole group.
           __dobYear > Number(todayCT.slice(0, 4)) - 13);
        if ((!meC?.date_of_birth || __dobImpossible) && alive) {
          const askKey = "birthday-ask-" + todayCT.slice(0, 7);
          if (!seen.has(askKey)) {
            setMeId(cid);
            setPick({ kind: "askdob", key: askKey });
          }
        }
      } catch {
        /* a takeover must never take the dashboard down */
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const dismiss = useCallback(
    async (then?: () => void) => {
      const key = pick?.key;
      setPick(null);
      try {
        if (meId && key) await supabase.from("client_announcements_seen").insert({ client_id: meId, key });
      } catch {
        /* if the write fails they see it once more — better than a crash */
      }
      then?.();
    },
    [supabase, meId, pick],
  );

  /**
   * Send back what they said about check-ins. Fire-and-forget on purpose: the
   * screen closes either way, and a client who tapped "don't show again"
   * should not be held on a spinner or shown an error about it.
   */
  async function setCheckinPref(action: "snooze" | "off") {
    try {
      await fetch("/api/checkin-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } catch { /* they still get the rest of the month off via the seen-key */ }
  }

  const holdsSlot = useTakeoverSlot("announcements", TAKEOVER_PRIORITY.ANNOUNCEMENTS, !!pick);

  /**
   * They say they have paid. Same field the home-screen banner writes, so this
   * clears both at once and shows on Dustin's side as acknowledged — it does
   * NOT mark the invoice paid, which is his to confirm.
   */
  async function markPaid(reminderId: string) {
    if (busy) return;
    setBusy(true);
    try {
      // Through the RPC, NOT a direct update. Clients have SELECT on their own
      // payment_reminders and no UPDATE policy at all, so writing the column
      // from here would fail silently on every tap. ack_payment_reminder is
      // what the home-screen banner already uses.
      const { error } = await supabase.rpc("ack_payment_reminder", { reminder_id: reminderId });
      // A failed write must not strand them on this screen for ever. The
      // takeover closes either way; if the update did not land it comes back
      // tomorrow, which is the right failure — it never silently marks a debt
      // acknowledged that Dustin will not see.
      if (!error) fx("tap");
      await dismiss();
    } finally {
      setBusy(false);
    }
  }

  async function saveDob() {
    if (busy) return;
    // A date they have to fix later is worse than no date. Reject the two
    // things a date picker actually produces by accident: the future, and a
    // year somebody typed with a digit missing.
    const y = Number((dob || "").slice(0, 4));
    if (!dob || !y) { setDobErr("Pick a date first."); return; }
    if (dob > centralToday()) { setDobErr("That's in the future."); return; }
    if (y < 1900) { setDobErr("Check the year on that one."); return; }
    setBusy(true); setDobErr(null);
    try {
      // RLS: client_update_own_clients allows a client to update their own row.
      const { error } = await supabase.from("clients").update({ date_of_birth: dob }).eq("id", meId);
      if (error) { setDobErr("Couldn't save that — try again in a moment."); return; }
      fx("tap");
      await dismiss();
    } finally {
      setBusy(false);
    }
  }

  // One full-screen interrupt at a time, APP-WIDE — not just among the six
  // below. The header comment above promised that and could only deliver it
  // inside this file; src/lib/takeoverSlot.ts is what makes it true of the app.
  // These outrank the week-in-review: everything here has a shorter shelf life.
  //
  // Claimed unconditionally (hooks cannot sit behind a return) with `want` set
  // to whether there is actually something to show, so nothing is starved.
  if (!holdsSlot) return null;
  if (!pick) return null;

  const shell = (children: React.ReactNode) => (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "var(--brand-bg)", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      {children}
    </div>
  );

  const primaryBtn: React.CSSProperties = {
    width: "100%",
    padding: 15,
    borderRadius: 14,
    border: "none",
    background: "var(--brand-primary)",
    color: "#fff",
    fontSize: 15,
    fontWeight: 800,
    cursor: "pointer",
  };
  const quietBtn: React.CSSProperties = {
    width: "100%",
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid var(--brand-border)",
    background: "transparent",
    color: "var(--brand-text-secondary)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  };

  // ── THEIR BIRTHDAY ────────────────────────────────────────────────────────
  // Dustin asked for this alongside the group post. The group chat is everyone
  // else noticing; this is the app noticing. No age anywhere on it — the date
  // is stored so we know WHEN, never so anyone can publish HOW OLD.
  if (pick.kind === "birthday") {
    return shell(
      <>
        <Confetti />
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(40px + env(safe-area-inset-top)) 20px 34px", textAlign: "center" }}>
          {/* The cake was a placeholder from before the sticker set existed.
              Dustin, 2026-08-13: "Make sure that we use the new avatars for the
              birthday screen as well." `hype` is the arms-up one — the loudest
              face in the set, and the one day of the year it is unarguably the
              right call. */}
          <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
            <AiBadge size={112} mood="hype" ring={false} title="" />
            <span style={{ position: "absolute", right: "calc(50% - 74px)", top: -4, fontSize: 34, lineHeight: 1 }}>🎂</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 12, lineHeight: 1.15 }}>
            Happy birthday, {pick.firstName}.
          </div>
          <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 8, lineHeight: 1.5 }}>
            From {coachFirstName} and everyone who trains here.
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 18px 32px" }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--brand-text)", textAlign: "center", marginBottom: 20 }}>
            Take the day if you want it. The gym will still be here tomorrow,
            and so will we.
          </p>
          <button onClick={() => void dismiss(() => router.push(`${basePath}/messages?client=group`))} style={primaryBtn}>
            💬 See the group chat
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Thanks — to my dashboard
          </button>
        </div>
      </>,
    );
  }

  // ── WHEN IS YOUR BIRTHDAY ─────────────────────────────────────────────────
  // Deliberately the gentlest screen in the app: it asks for something, which
  // none of the others do. Skippable in one tap, no guilt copy, and it says
  // plainly what the date is for — people hand over a date of birth much more
  // easily when they are told it is not an age check.
  if (pick.kind === "askdob") {
    return shell(
      <>
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(34px + env(safe-area-inset-top)) 20px 26px", textAlign: "center" }}>
          <AiBadge size={88} mood="happy" ring={false} title="" />
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10, lineHeight: 1.2 }}>
            When&rsquo;s your birthday?
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 18px 32px" }}>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--brand-text)", marginBottom: 6 }}>
            So the group chat can say something on the day. That&rsquo;s the whole
            reason we&rsquo;re asking.
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--brand-text-secondary)", marginBottom: 18 }}>
            Your age is never shown to anyone — not in the group, not on the
            board, not anywhere in the app.
          </p>

          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            max={centralToday()}
            style={{
              width: "100%", boxSizing: "border-box", padding: "13px 12px", borderRadius: 12,
              border: "1px solid var(--brand-border)", background: "var(--brand-card, var(--brand-surface))",
              color: "var(--brand-text)", fontSize: 16, marginBottom: 14, // 16px or iOS zooms on focus
            }}
          />
          {dobErr && <p style={{ color: "#ef4444", fontSize: 12.5, fontWeight: 600, margin: "0 0 10px" }}>{dobErr}</p>}

          <button onClick={() => void saveDob()} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : "Save it"}
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Not now
          </button>
        </div>
      </>,
    );
  }

  // ── WINNER ────────────────────────────────────────────────────────────────
  if (pick.kind === "winner") {
    const w = pick.winner;
    const unit = w.metric === "logging" ? "days logged" : "days trained";
    return shell(
      <>
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(30px + env(safe-area-inset-top)) 20px 28px", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <AiBadge size={72} mood="hype" ring={false} title="" />
            <span style={{ fontSize: 44, lineHeight: 1 }}>🏆</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85, marginTop: 10 }}>
            {w.emoji ? w.emoji + " " : ""}
            {w.title.toUpperCase()}
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6, lineHeight: 1.15 }}>
            {w.winner_is_me ? "You won it." : w.winner_name + " took it."}
          </div>
          {w.winner_score != null && (
            <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
              {w.winner_score} {unit}
            </div>
          )}
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 18px 32px" }}>
          <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)", borderRadius: 16, padding: 16, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 700 }}>Where you finished</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "var(--brand-primary)", lineHeight: 1.1, marginTop: 4 }}>
              {w.my_rank ? "#" + w.my_rank : "—"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--brand-text)", fontWeight: 700 }}>
              {w.my_score} {unit}
            </div>
          </div>

          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--brand-text)", marginBottom: 18, textAlign: "center" }}>
            {w.winner_is_me
              ? "Top of the board. Go collect it in the group chat — and the next one starts today."
              : "A new challenge starts today, everyone back to zero. Go say something in the group chat."}
          </p>

          <button onClick={() => void dismiss(() => router.push(`${basePath}/messages?client=group`))} style={primaryBtn}>
            💬 Open the group chat
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Back to my dashboard
          </button>
        </div>
      </>,
    );
  }

  // ── PAYMENT PAST DUE ──────────────────────────────────────────────────────
  //
  // The only takeover about money, and the tone matters more here than
  // anywhere else in this file: these are people who pay him every month and
  // have almost certainly just forgotten. It states the fact, gives the number
  // and the date, and gets out of the way. No red, no warning triangle, no
  // guilt — an invoice, not a debt collector.
  //
  // "I've paid this" is the way out and it is honest: it sets client_ack_at,
  // which is the same field the home-screen banner uses, so tapping it here
  // clears it there too and tells Dustin on his side.
  if (pick.kind === "pastdue") {
    const d = pick.due;
    const money = (n: number) => "$" + (Math.round(n * 100) / 100).toLocaleString("en-US");
    return shell(
      <div style={{ padding: "calc(46px + env(safe-area-inset-top)) 20px 30px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: "var(--brand-primary)", textAlign: "center" }}>
          PAYMENT PAST DUE
        </div>

        <div style={{ fontSize: 46, fontWeight: 800, textAlign: "center", marginTop: 14, color: "var(--brand-text)", fontVariantNumeric: "tabular-nums" }}>
          {money(d.amount)}
        </div>
        <div style={{ fontSize: 13.5, textAlign: "center", color: "var(--brand-muted, #8b93a7)", marginTop: 6 }}>
          Due {centralFormat(d.due_date + "T12:00:00Z", { weekday: "long", month: "long", day: "numeric" })}
          {" · "}
          {d.daysLate === 1 ? "1 day ago" : d.daysLate + " days ago"}
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--brand-text)", marginTop: 24, textAlign: "center" }}>
          This one has slipped past its due date. Please get it settled as soon as you can — if
          you have already sent it, tap below and {coachFirstName} will check it off.
        </p>

        <button onClick={() => void markPaid(d.id)} disabled={busy} style={primaryBtn}>
          {busy ? "One moment…" : "I've paid this"}
        </button>
        <button onClick={() => void dismiss(() => router.push(`${basePath}/messages`))} style={quietBtn}>
          Message {coachFirstName}
        </button>
        <button onClick={() => void dismiss()} style={quietBtn}>
          Not now
        </button>
      </div>,
    );
  }

  // ── ANNOUNCEMENT ──────────────────────────────────────────────────────────
  if (pick.kind === "announcement") {
    const a = pick.announcement;
    return shell(
      <>
        <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(28px + env(safe-area-inset-top)) 20px 24px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85 }}>📣 FROM {coachFirstName.toUpperCase()}</div>
          <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 6 }}>
            {centralFormat(a.created_at, { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: "0 auto", padding: "22px 18px 32px" }}>
          {/* The message as written. whiteSpace: pre-wrap so his line breaks
              survive — a paragraphed announcement rendered as one block reads
              like a wall and gets skipped. */}
          <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "var(--brand-text)", whiteSpace: "pre-wrap", marginBottom: 22 }}>
            {a.body}
          </p>

          <button onClick={() => void dismiss(() => router.push(`${basePath}/messages?client=group&m=${a.id}`))} style={primaryBtn}>
            💬 Reply in the group
          </button>
          <button onClick={() => void dismiss()} style={quietBtn}>
            Got it
          </button>
        </div>
      </>,
    );
  }

  // ── CHALLENGE LAUNCH ──────────────────────────────────────────────────────
  // ── THEY WERE LOGGING, AND THEN THEY STOPPED ─────────────────────────────
  // The one takeover that is not good news, so it is the one that most needs to
  // sound like a person and not a system. Two tiers, and only ever two: this
  // shows once when it goes quiet, once more if it stays quiet, and then not
  // again until they log and later fall off afresh.
  //
  // It names THEIR number, not a target. "You logged 15 of the 28 days before
  // this" is a fact about them; "you should log daily" is a lecture, and they
  // have already heard it.
  //
  // No guilt, no streak-broken framing, and no mention of body weight. The way
  // back is one tap.
  if (pick.kind === "lapse") {
    const stern = pick.tier === "stern";
    // `quiet` is a different question and must not read as a telling-off. It is
    // for someone who has been silent for weeks and never really logged — so it
    // never mentions logging, because for them that is a complaint about a habit
    // they never had. Robert is the reason it exists.
    const quiet = pick.tier === "quiet";
    return shell(
      <div style={{ padding: "calc(46px + env(safe-area-inset-top)) 20px 30px", maxWidth: 460, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <AiBadge size={104} mood={pick.tier} ring={false} title="" />
        </div>
        <div style={{ fontSize: 23, fontWeight: 900, color: "var(--brand-text)", marginTop: 20, lineHeight: 1.2, textAlign: "center" }}>
          {quiet
            ? `Still with us, ${pick.firstName}?`
            : stern
              ? `${pick.firstName}, it has been ${pick.daysSince} days.`
              : `Everything alright, ${pick.firstName}?`}
        </div>
        <p style={{ fontSize: 14.5, color: "var(--brand-text-secondary)", marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
          {quiet ? (
            <>
              It has been about {pick.daysSince} days since anything came through — no sessions, nothing.
              That might be exactly as it should be, and if so, say so below and I will leave you to it.
              If life got in the way, {coachFirstName} would rather hear it than guess.
            </>
          ) : stern ? (
            <>
              You were logging {pick.priorDays} of every 28 days before this, so I know it is not
              that you cannot. Something got in the way. Tell {coachFirstName} what it was —
              he would rather fix the plan than watch it go quiet.
            </>
          ) : (
            <>
              You logged {pick.priorDays} of the 28 days before this and then it went quiet{" "}
              {pick.daysSince} days ago. No lecture — if this week got away from you, it got away
              from you. Picking it back up today counts for exactly as much as never stopping.
            </>
          )}
        </p>

        <div style={{ marginTop: 26 }}>
          <button style={primaryBtn} onClick={() => dismiss(() => { fx("tap"); window.location.href = quiet ? "/workout" : "/nutrition"; })}>
            {quiet ? "Show me today" : "Log today"}
          </button>
          <button style={quietBtn} onClick={() => dismiss(() => { window.location.href = "/messages"; })}>
            Tell {coachFirstName} why
          </button>

          {/* The rule can only infer from behaviour; the client is the one who
              knows what the silence means. Both of these are answers, and the
              app has to take them — see /api/checkin-preference. */}
          <div className="flex gap-2" style={{ marginTop: 10 }}>
            <button
              style={{ ...quietBtn, marginTop: 0, flex: 1 }}
              onClick={() => { void setCheckinPref("snooze"); dismiss(); }}
            >
              Not for a month
            </button>
            <button
              style={{ ...quietBtn, marginTop: 0, flex: 1 }}
              onClick={() => { void setCheckinPref("off"); dismiss(); }}
            >
              Don&rsquo;t show again
            </button>
          </div>
          <button style={{ ...quietBtn, border: "none" }} onClick={() => dismiss()}>
            Not right now
          </button>
        </div>
      </div>
    );
  }

  const ch = pick.challenge;
  const unit = ch.metric === "logging" ? "days logged" : "days trained";
  const left = ch.days_left ?? 0;

  const step: React.CSSProperties = { display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5, color: "var(--brand-text)" };
  const num: React.CSSProperties = {
    flex: "0 0 auto", width: 22, height: 22, borderRadius: 999, display: "grid", placeItems: "center",
    fontSize: 11, fontWeight: 800,
    background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)", color: "var(--brand-primary)",
  };

  async function joinAndGo() {
    if (busy || pick?.kind !== "challenge") return;
    setBusy(true);
    try {
      if (!pick.joined && meId) {
        // A duplicate genuinely means they were already in, and that is
        // success. Anything else is not — and the catch below could never see
        // one, because a PostgREST call returns its error rather than throwing.
        // So every failure still ran fx("complete") and the client was told
        // they had joined a challenge whose board will never show them. Same
        // fault, same table, as the one in GroupChallenge that produced
        // "twenty-three people had joined and six were showing".
        const { error } = await supabase
          .from("challenge_participants")
          .insert({ challenge_id: pick.challenge.id, client_id: meId });
        if (error && error.code !== "23505") {
          window.alert("Couldn't join that one — you can try again from the group chat.");
          return;
        }
      }
      fx("complete");
    } catch {
      /* unique constraint = already in */
    } finally {
      setBusy(false);
      void dismiss(() => router.push(`${basePath}/messages?client=group`));
    }
  }

  return shell(
    <>
      <div style={{ background: "var(--grad-hero, var(--brand-primary))", color: "#fff", padding: "calc(28px + env(safe-area-inset-top)) 20px 26px", textAlign: "center" }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{ch.emoji ?? "🏁"}</div>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, opacity: 0.85, marginTop: 10 }}>GROUP CHALLENGE</div>
        <div style={{ fontSize: 25, fontWeight: 900, marginTop: 4, lineHeight: 1.15 }}>{ch.title}</div>
        <div style={{ fontSize: 12.5, opacity: 0.9, marginTop: 7 }}>
          {pretty(ch.starts_on)} &ndash; {pretty(ch.ends_on)} · <b>{left > 0 ? `${left} ${left === 1 ? "day" : "days"} left` : "final day"}</b>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 18px 32px" }}>
        <div style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-primary)", borderRadius: 16, padding: 16, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "var(--brand-text-secondary)", fontWeight: 700 }}>You&apos;re already on the board</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: "var(--brand-primary)", lineHeight: 1.1, marginTop: 4 }}>{pick.myScore}</div>
          <div style={{ fontSize: 12.5, color: "var(--brand-text)", fontWeight: 700 }}>
            {unit}
            {pick.myRank ? ` · currently #${pick.myRank}` : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--brand-text-secondary)", marginTop: 8, lineHeight: 1.5 }}>
            Everything you&apos;ve logged since {pretty(ch.starts_on)} already counts. You haven&apos;t missed it — you&apos;ve
            been in it the whole time.
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
          <div style={step}>
            <span style={num}>1</span>
            <span><b>Every day you train and log it counts as 1.</b> Two sessions in one day is still one day — this rewards showing up often, not cramming.</span>
          </div>
          <div style={step}>
            <span style={num}>2</span>
            <span><b>Nothing to enter by hand.</b> Your score builds itself from the workouts you&apos;re already logging.</span>
          </div>
          <div style={step}>
            <span style={num}>3</span>
            <span><b>It ranks days shown up.</b> Never weight, never size, never body fat. Newest client can win it.</span>
          </div>
          <div style={step}>
            <span style={num}>4</span>
            <span><b>Highest total when the clock runs out wins.</b> Then a new one starts — every Sunday, from here on out.</span>
          </div>
          <div style={step}>
            <span style={num}>5</span>
            <span><b>The group chat is where it happens.</b> PRs, standings, trash talk. Come say something — that&apos;s the part that actually keeps people going.</span>
          </div>
        </div>

        {pick.total > 0 && (
          <div style={{ fontSize: 12.5, textAlign: "center", color: "var(--brand-text-secondary)", marginBottom: 18, lineHeight: 1.5 }}>
            The group is at <b style={{ color: "var(--brand-text)" }}>{pick.total}</b> {unit} so far
            {pick.people > 0 ? ` across ${pick.people} people` : ""}.
          </div>
        )}

        <button onClick={joinAndGo} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
          {pick.joined ? "💬 Take me to the group chat" : "🙌 I'm in — open the group chat"}
        </button>
        <button onClick={() => void dismiss()} style={quietBtn}>
          Got it — back to my dashboard
        </button>
      </div>
    </>,
  );
}
