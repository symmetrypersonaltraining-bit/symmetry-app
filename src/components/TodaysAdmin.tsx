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
  /**
   * The people this row is actually about, each with somewhere to go.
   *
   * Dustin, 24 Aug: "same for programming run out, I need a way to click on
   * each to get there." A row that names four clients and then offers one
   * button to a list is the same fault as the notes row that opened the
   * roster — it tells you who, and then makes you go and find them.
   */
  subjects?: { id: string; name: string; href: string }[];
}

/**
 * HOW LONG A DISMISSAL LASTS.
 *
 * Dustin: "once I dismiss it doesn't come back up... no big deal if it comes up
 * once a month but I need to be able to clear the list."
 *
 * So: not forever. A row that can be silenced permanently is a row that will
 * eventually hide something that matters, and neither of us would remember it
 * was hidden. A month is long enough to be genuinely out of the way and short
 * enough that anything still true resurfaces on its own.
 */
const DISMISS_DAYS = 30;

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
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /**
   * Mark a row as dealt with.
   *
   * Optimistic, then written. If the write fails the row comes STRAIGHT BACK —
   * a dismissal that quietly did not save is how something he thought he had
   * cleared turns up again with no explanation, which is worse than the row
   * itself.
   */
  async function dismiss(key: string) {
    if (!me || busy) return;
    setBusy(key);
    const keep = rows;
    setRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
    try {
      const sb = createClient() as any;
      const until = addDays(todayCT(), DISMISS_DAYS);
      const { error } = await sb
        .from("admin_dismissals")
        .upsert({ trainer_id: me, row_key: key, subject_id: null, until, dismissed_at: new Date().toISOString() },
                { onConflict: "trainer_id,row_key,subject_id" });
      if (error) throw error;
    } catch {
      setRows(keep ?? null);
      if (typeof window !== "undefined") window.alert("That didn't clear — it's still there.");
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    let on = true;
    (async () => {
      const sb = createClient() as any;
      const today = todayCT();
      const horizon = addDays(today, 14);

      // Whose admin list this is — the dismissals are per trainer.
      try {
        const { data: auth } = await sb.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: t } = await sb.from("trainers").select("id").eq("auth_user_id", uid).maybeSingle();
          if (on && t?.id) setMe(t.id as string);
        }
      } catch { /* no dismiss button, rather than no admin block */ }

      try {
        const [props, pays, notes, cov, focus, integ, dism] = await Promise.all([
          // Proposals the app is holding until he says so.
          sb.from("schedule_change_proposals").select("id", { count: "exact", head: true }).is("resolved_at", null),
          // Money: sent-but-unconfirmed AND ready-to-send. Dustin, 21 Aug:
          // "for upcoming payments keep add payments sent out that have not
          // been confirmed paid yet on there."
          sb.from("payment_reminders").select("due_date, reminder_sent_at, client_ack_at, paid_confirmed_at"),
          // Notes, minus the classes that close themselves.
          sb.from("exercise_notes").select("note").not("resolved", "is", true),
          // Programming coverage. RLS scopes this to his own clients.
          sb.from("clients").select("id, name, nutrition_only, is_self_coached").is("archived_at", null),
          sb.from("clients").select("weekly_focus_week, is_self_coached").is("archived_at", null),
          // The integrity checker's latest verdict.
          //
          // run_integrity_checks() has been running twice a day since 16 Aug
          // and NOTHING in the app has ever read its table. A critical could
          // sit there for weeks — and did: anon_writable_policies was red the
          // whole time on a false positive, which is the same as being unread,
          // because a check nobody looks at cannot tell anyone anything.
          //
          // OWNER ONLY, by RLS rather than by a check here: the detail column
          // names clients, and those clients belong to other trainers. A
          // non-owner simply gets an empty set and no row is drawn, which is
          // correct — these are whole-database faults and he is the one who
          // fixes them.
          sb.from("integrity_checks").select("check_name, severity, count, detail, ran_at")
            .order("ran_at", { ascending: false }).limit(60),
          // What he has already dealt with. RLS scopes it to him.
          sb.from("admin_dismissals").select("row_key").gte("until", today),
        ]);
        const hidden = new Set(((dism.data || []) as { row_key: string }[]).map((d) => d.row_key));

        // ── coverage: who runs out inside two weeks ──────────────────────────
        const clients = ((cov.data || []) as { id: string; name: string; nutrition_only?: boolean; is_self_coached?: boolean }[])
          // NOT HIS TO PROGRAMME. Dustin: "I dont program for trainers so they
          // shoukd not be on here. steph is exception I do hers." Every trainer
          // carries a self-coached client row of their own, and five of them
          // were sitting in this count as though he had forgotten to programme
          // them. `is_self_coached` already existed and already meant exactly
          // this; nothing read it. Steph's flag was wrong and is now false,
          // because he does write hers.
          .filter((c) => !c.is_self_coached);
        let short: { id: string; name: string }[] = [];
        if (clients.length) {
          // Scoped to THESE clients and given an explicit high limit.
          //
          // Without both, PostgREST returns its default first 1,000 rows across
          // the whole table, the "covered" set comes back partial, and clients
          // who ARE programmed months out get reported as running out. That is
          // exactly what shipped: nine names on screen when the real answer was
          // one. A false alarm on this row is worse than no row, because it
          // teaches him to ignore the block.
          const { data: sw } = await sb
            .from("scheduled_workouts")
            .select("client_id")
            .is("deleted_at", null)
            .in("client_id", clients.map((c) => c.id))
            .gte("scheduled_date", horizon)
            .limit(20000);
          const covered = new Set(((sw || []) as { client_id: string }[]).map((r) => r.client_id));
          short = clients
            // Nutrition-only clients have no programming BY DESIGN and must not
            // be reported as a gap. Flagging them is a recurring false alarm.
            .filter((c) => !c.nutrition_only && !covered.has(c.id))
            .map((c) => ({ id: c.id, name: c.name }));
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
        const fRows = ((focus.data || []) as { weekly_focus_week: string | null; is_self_coached?: boolean }[])
          .filter((c) => !c.is_self_coached);
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
          // /clients/notes, NOT /clients. This row counted six notes and then
          // dropped him on the roster with no way to reach any of them. When
          // "Needs your eyes" came off Home on 21 Aug the plan was "one counted
          // row in Today's Admin that links to it" — the row shipped, the thing
          // it links to did not, and the href was left pointing at the list of
          // clients.
          href: "/clients/notes", cta: "Open",
        });

        out.push(
          short.length
            ? {
                key: "coverage", tone: "warn",
                title: "Programming running out", count: String(short.length),
                sub: "Under two weeks left.",
                // Each name goes straight to that client's programme. The names
                // used to be a sentence with one button to /clients underneath.
                subjects: short.map((c) => ({ id: c.id, name: c.name, href: `/clients/${c.id}/program` })),
                href: "/clients", cta: "All",
              }
            : {
                key: "coverage", tone: "good",
                title: "Programming coverage", count: "OK",
                sub: "Everyone is programmed more than two weeks out.",
                href: "/clients", cta: "Clients",
              },
        );

        // ── the integrity checker, when it has something to say ─────────────
        //
        // Latest run only: the table keeps history, and counting every run
        // would report the same fault a dozen times. Criticals only — the
        // warns are context for a person already looking, not a reason to
        // interrupt someone's morning.
        const checks = (integ.data || []) as {
          check_name: string; severity: string; count: number;
          detail: unknown; ran_at: string;
        }[];
        const newest = checks.length ? checks[0].ran_at : null;
        const live = checks.filter((c) => c.ran_at === newest && c.severity === "critical" && c.count > 0);
        if (live.length) {
          // Names, where the check collected them. "300" is not something
          // anybody can act on; "Dustin, Maddy, Tyler, Steph" is.
          const named = new Set<string>();
          for (const c of live) {
            for (const d of (Array.isArray(c.detail) ? c.detail : []) as { client?: string }[]) {
              if (d?.client) named.add(d.client);
            }
          }
          const who = [...named];
          out.push({
            key: "integrity", tone: "crit",
            title: "Data check failing", count: String(live.length),
            sub:
              live.map((c) => c.check_name.replace(/_/g, " ")).slice(0, 2).join(" · ") +
              (who.length ? " — " + who.slice(0, 4).join(", ") + (who.length > 4 ? " +" + (who.length - 4) : "") : ""),
            href: "/clients", cta: "Look",
          });
        }

        if (missingFocus > 0) out.push({
          key: "focus", tone: "crit",
          title: "Weekly focus did not write", count: String(missingFocus),
          sub: "The Saturday sweep missed these. They see no focus line rather than a stale one.",
          href: "/settings", cta: "Check",
        });

        // Anything he has already dealt with is simply not drawn.
        if (on) setRows(out.filter((r) => !hidden.has(r.key)));
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
          // A DIV, not a Link, around the whole row.
          //
          // It was one big <Link>, which is why there was nowhere to put a
          // dismiss button or a per-client link: a button inside an anchor is a
          // nested interactive control, and tapping either one navigated. The
          // row now holds several targets and the title itself is the one that
          // opens the list.
          <div
            key={r.key}
            style={{ background: "var(--brand-surface)", display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 12px" }}
          >
            <span style={{ width: 3, borderRadius: 3, alignSelf: "stretch", flex: "0 0 3px", background: TONE[r.tone].bar }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <Link href={r.href} style={{ textDecoration: "none", display: "block" }}>
                <span style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--brand-text)" }}>{r.title}</span>
                  <span
                    className="text-xs font-bold"
                    style={{ padding: "1px 6px", borderRadius: 6, background: TONE[r.tone].chip, color: TONE[r.tone].text, fontVariantNumeric: "tabular-nums" }}
                  >{r.count}</span>
                </span>
                <span className="text-xs block mt-0.5" style={{ color: "var(--brand-text-secondary)" }}>{r.sub}</span>
              </Link>

              {/* Each person, straight to their own screen. */}
              {r.subjects?.length ? (
                <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                  {r.subjects.map((sj) => (
                    <Link
                      key={sj.id}
                      href={sj.href}
                      className="text-xs font-semibold"
                      style={{
                        padding: "3px 8px", borderRadius: 999, textDecoration: "none",
                        background: TONE[r.tone].chip, color: TONE[r.tone].text,
                        border: "1px solid " + TONE[r.tone].chip,
                      }}
                    >
                      {sj.name} ›
                    </Link>
                  ))}
                </span>
              ) : null}
            </span>

            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, alignSelf: "center" }}>
              <Link href={r.href} className="text-xs font-semibold"
                    style={{ color: "var(--brand-primary)", whiteSpace: "nowrap", textDecoration: "none" }}>
                {r.cta} →
              </Link>
              {/* Dealt with. Comes back in a month if it is still true. */}
              {me ? (
                <button
                  type="button"
                  onClick={() => void dismiss(r.key)}
                  disabled={busy === r.key}
                  aria-label={`Dismiss ${r.title} for ${DISMISS_DAYS} days`}
                  title={`Dealt with — hide for ${DISMISS_DAYS} days`}
                  style={{
                    width: 22, height: 22, borderRadius: 999, padding: 0, lineHeight: "20px",
                    fontSize: 12, cursor: busy === r.key ? "default" : "pointer",
                    background: "transparent", border: "1px solid var(--brand-border)",
                    color: "var(--brand-text-secondary)", opacity: busy === r.key ? 0.4 : 1,
                  }}
                >
                  ✕
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
