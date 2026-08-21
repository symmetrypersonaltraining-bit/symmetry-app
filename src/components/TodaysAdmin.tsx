"use client";

// Today's admin — everything in the app that needs doing, in one place.
//
// Dustin, 21 Aug: "a block to the dashboard for trainers that organizes
// everything that we need to get done in the app, admin type work to guide us
// efficiently through getting things done like programming when it's running
// low, answering messages, questions, notes, etc. anything that needs to be
// done in the app, picks up and points us to it from that daily admin box all
// from one place."
//
// TWO RULES, and they are the whole design.
//
// 1. EVERY COUNT IS DERIVED, NOTHING IS QUEUED. There is no admin_tasks table
//    and there must never be one. Each row runs its own count against the live
//    data at render, so dealing with something at its source — resolving a note
//    on the client's file, approving a proposal on the schedule screen — makes
//    it drop off here on the next load with nothing to keep in sync. A cached
//    worklist would be a second source of truth that silently drifts, which is
//    the exact failure this dashboard exists to end.
//
//    "make sure it's set up to clean todays admin if i go straight to the
//     source and deal with them" — that is this rule.
//
// 2. EVERY ROW GOES TO WHERE THE WORK HAPPENS. A row is a link to the screen
//    that can actually close it, not a description of a problem. Counting
//    something you cannot act on from here is how the old panels became
//    wallpaper.
//
// Ordered by consequence, not by age. And healthy rows STAY, showing "OK" —
// an empty list is indistinguishable from a broken one, which is how the weekly
// sweep went unnoticed for six days.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Tone = "crit" | "warn" | "good";

interface Row {
  key: string;
  title: string;
  sub: string;
  count: string;
  tone: Tone;
  href: string;
  cta: string;
}

const TONE: Record<Tone, { bar: string; chip: string; text: string }> = {
  crit: { bar: "#dc2626", chip: "#dc262618", text: "#dc2626" },
  warn: { bar: "#d97706", chip: "#d9770618", text: "#d97706" },
  good: { bar: "#16a34a", chip: "#16a34a18", text: "#16a34a" },
};

/** Chicago today, as the rest of the app counts days. */
function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Notes that are genuinely his.
 *
 * Set weights, cardio substitutions and "did it with dumbbells" close
 * themselves elsewhere and must never be counted here — two fifths of the
 * 63-note backlog on 21 Aug was that kind of traffic, and it is what buried a
 * client's back injury for 25 days.
 */
const ROUTINE = /^\s*\d+\s*#?\s*(assist|second set|s3)?\s*$|at pf|pf chin|assist first set|# second set|# s3|^elliptical$|^stairs$|stair master|1 mile|^medium band$/i;

export default function TodaysAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      const sb = createClient() as any;
      const today = todayCT();
      const horizon = addDays(today, 14);

      try {
        const [props, pays, notes, cov, focus] = await Promise.all([
          // Proposals the app is holding until he says so.
          sb.from("schedule_change_proposals").select("id", { count: "exact", head: true }).is("resolved_at", null),
          // Money: sent-but-unconfirmed AND ready-to-send. Dustin, 21 Aug:
          // "for upcoming payments keep add payments sent out that have not
          // been confirmed paid yet on there."
          sb.from("payment_reminders").select("due_date, reminder_sent_at, client_ack_at, paid_confirmed_at"),
          // Notes, minus the classes that close themselves.
          sb.from("exercise_notes").select("note").not("resolved", "is", true),
          // Programming coverage. RLS scopes this to his own clients.
          sb.from("clients").select("id, name, nutrition_only").is("archived_at", null),
          sb.from("clients").select("weekly_focus_week").is("archived_at", null),
        ]);

        // ── coverage: who runs out inside two weeks ──────────────────────────
        const clients = (cov.data || []) as { id: string; name: string; nutrition_only?: boolean }[];
        let short: string[] = [];
        if (clients.length) {
          const { data: sw } = await sb
            .from("scheduled_workouts")
            .select("client_id, scheduled_date")
            .is("deleted_at", null)
            .gte("scheduled_date", horizon);
          const covered = new Set(((sw || []) as { client_id: string }[]).map((r) => r.client_id));
          short = clients
            // Nutrition-only clients have no programming BY DESIGN and must not
            // be reported as a gap. Flagging them is a recurring false alarm.
            .filter((c) => !c.nutrition_only && !covered.has(c.id))
            .map((c) => c.name);
        }

        // ── money ────────────────────────────────────────────────────────────
        const pr = (pays.data || []) as {
          due_date: string; reminder_sent_at: string | null;
          client_ack_at: string | null; paid_confirmed_at: string | null;
        }[];
        const awaiting = pr.filter((p) => p.reminder_sent_at && !p.paid_confirmed_at && !p.client_ack_at);
        const toSend = pr.filter((p) => !p.reminder_sent_at && p.due_date <= addDays(today, 7));
        const overdue = awaiting.filter((p) => p.due_date < today);

        // ── notes ────────────────────────────────────────────────────────────
        const realNotes = ((notes.data || []) as { note: string }[]).filter((n) => !ROUTINE.test((n.note || "").trim()));
        const symptom = realNotes.filter((n) => /pain|hurt|sore|afraid|burn|crack|swell/i.test(n.note)).length;
        const questions = realNotes.filter((n) => n.note.includes("?")).length;

        // ── the weekly sweep, only when it did NOT run ───────────────────────
        const fRows = (focus.data || []) as { weekly_focus_week: string | null }[];
        const thisWeek = (() => {
          const [y, m, d] = today.split("-").map(Number);
          const dt = new Date(Date.UTC(y, m - 1, d));
          dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
          return dt.toISOString().slice(0, 10);
        })();
        const missingFocus = fRows.filter((r) => r.weekly_focus_week !== thisWeek).length;

        const out: Row[] = [];

        if ((props.count ?? 0) > 0) out.push({
          key: "proposals", tone: "crit",
          title: "Schedule proposals waiting", count: String(props.count),
          sub: "Sessions the app thinks moved or vanished. Nothing shifts until you say so.",
          href: "/schedule/proposals", cta: "Review",
        });

        if (overdue.length || awaiting.length || toSend.length) out.push({
          key: "money",
          tone: overdue.length ? "crit" : "warn",
          title: overdue.length ? "Payments overdue" : "Payments outstanding",
          count: String(overdue.length || awaiting.length),
          sub:
            (overdue.length ? overdue.length + " past due and unconfirmed. " : "") +
            (awaiting.length - overdue.length > 0 ? (awaiting.length - overdue.length) + " sent, not confirmed paid. " : "") +
            (toSend.length ? toSend.length + " ready to send." : ""),
          href: "/payments", cta: "Payments",
        });

        if (realNotes.length) out.push({
          key: "notes", tone: symptom ? "warn" : "good",
          title: "Client notes needing you", count: String(realNotes.length),
          sub:
            (symptom ? symptom + " mention pain or fear" : "none mention pain") +
            (questions ? " · " + questions + " unanswered question" + (questions === 1 ? "" : "s") : ""),
          href: "/clients", cta: "Open",
        });

        out.push(
          short.length
            ? {
                key: "coverage", tone: "warn",
                title: "Programming running out", count: String(short.length),
                sub: short.slice(0, 4).join(", ") + (short.length > 4 ? " and " + (short.length - 4) + " more" : "") + " — under two weeks left.",
                href: "/clients", cta: "Programme",
              }
            : {
                key: "coverage", tone: "good",
                title: "Programming coverage", count: "OK",
                sub: "Everyone is programmed more than two weeks out.",
                href: "/clients", cta: "Clients",
              },
        );

        if (missingFocus > 0) out.push({
          key: "focus", tone: "crit",
          title: "Weekly focus did not write", count: String(missingFocus),
          sub: "The Saturday sweep missed these. They see no focus line rather than a stale one.",
          href: "/settings", cta: "Check",
        });

        if (on) setRows(out);
      } catch {
        // A dashboard block must never take the screen down with it.
        if (on) setRows([]);
      }
    })();
    return () => { on = false; };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div
      className="rounded-2xl p-4"
      style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-border)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <i className="ti ti-checklist text-base" style={{ color: "var(--brand-primary)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--brand-text-secondary)" }}>
          TODAY&rsquo;S ADMIN
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "var(--brand-border)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--brand-border)" }}>
        {rows.map((r) => (
          <Link
            key={r.key}
            href={r.href}
            style={{ background: "var(--brand-surface)", display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px", textDecoration: "none" }}
          >
            <span style={{ width: 3, borderRadius: 3, alignSelf: "stretch", flex: "0 0 3px", background: TONE[r.tone].bar }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{r.title}</span>
                <span
                  className="text-xs font-bold"
                  style={{ padding: "1px 6px", borderRadius: 6, background: TONE[r.tone].chip, color: TONE[r.tone].text, fontVariantNumeric: "tabular-nums" }}
                >{r.count}</span>
              </span>
              <span className="text-xs block mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{r.sub}</span>
            </span>
            <span className="text-xs font-semibold" style={{ color: "var(--brand-primary)", whiteSpace: "nowrap", alignSelf: "center" }}>
              {r.cta} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
