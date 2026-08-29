import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { centralWeekStart, shiftDate } from "@/lib/central-time";
import TrainerCalendarPanel from "@/components/TrainerCalendarPanel";
import ClientDashboard from "./ClientDashboard";
import TrainerHome from "./TrainerHome";
import PendingRemindersPanel from "@/components/PendingRemindersPanel";
import { TRAINER_EMAIL } from "@/lib/trainer";
import { viewerIsTrainer } from "@/lib/auth/viewer";
import { getServerUser } from "@/lib/auth/serverUser";
import { fetchAllRows } from "@/lib/fetchAllRows";

async function isClientMode(asMarker?: string): Promise<boolean> {
  // Explicit ?as=client marker OR the cookie. The marker guarantees the client
  // branch renders on the FIRST server render even if the cookie (set in a
  // client effect) hasn't propagated yet — fixes the intermittent trainer-UI
  // leak in Client View.
  if (asMarker === "client") return true;
  // ?as=trainer is the mirror of ?as=client, and it BEATS the cookie.
  //
  // Entering client view was deterministic — the marker forced the client
  // branch on the first server render whatever the cookie said. LEAVING it had
  // no marker at all: the toggle pushed a bare /home and relied entirely on
  // `document.cookie = "symmetry_client_mode=; max-age=0"` having propagated
  // before the RSC request went out. When it had not, the server read the
  // cookie as still set and rendered the CLIENT dashboard for a trainer who had
  // just asked for the trainer one.
  //
  // Dustin, 22 Aug: "my app is currently opening to client view when i hit
  // trainer toggle" — and again, the other way, as a hang: the wrong branch
  // renders the trainer's all-clients schedule query, which takes ~1.8s, so the
  // mistake shows up as a freeze rather than as a wrong screen.
  if (asMarker === "trainer") return false;
  const cookieStore = await cookies();
  return cookieStore.get("symmetry_client_mode")?.value === "1";
}

export default async function HomePage(props: {
  searchParams?: Promise<{ as?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createClient();
  // Local token verification first; see src/lib/auth/verifyJwt.ts.
  const { data: { user } } = await getServerUser(supabase);
  if (!user) redirect("/login");

  const isTrainer = await viewerIsTrainer(supabase, user);
  const isInClientMode = isTrainer ? await isClientMode(searchParams.as) : false;

  // ── TRAINER VIEW ──────────────────────────────────────────────────────────
  if (isTrainer && !isInClientMode) {
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name")
      .is("archived_at", null)
      .order("name");

    const todayStrCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    // Calendar range: 3 months back, 12 months forward (Central time)
    const rangeStart = new Date();
    rangeStart.setMonth(rangeStart.getMonth() - 3);
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 12);
    const startStr = rangeStart.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const endStr = rangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

    // All appointments for the calendar (3mo back to 12mo forward)
    const { data: apptRows } = await supabase
      .from("appointments")
      .select("id, client_id, scheduled_at, ends_at, status, title, clients(id, name)")
      .gte("scheduled_at", startStr + "T00:00:00")
      .lte("scheduled_at", endStr + "T23:59:59")
      .order("scheduled_at");

    type AE = {
      id: string; clientId: string; clientName: string; title: string;
      startTime: string; endTime: string; status: string; scheduledAt: string; endsAt: string | null;
    };
    const appointmentMap: Record<string, AE[]> = {};
    for (const a of apptRows || []) {
      const row = a as any;
      const dateKey = new Date(row.scheduled_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const startTime = new Date(row.scheduled_at).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago",
      });
      const endTime = row.ends_at
        ? new Date(row.ends_at).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Chicago",
          })
        : "";
      if (!appointmentMap[dateKey]) appointmentMap[dateKey] = [];
      appointmentMap[dateKey].push({
        id: row.id,
        clientId: row.clients?.id || row.client_id,
        clientName: row.clients?.name || "Unknown",
        title: row.title || "Training Session",
        startTime,
        endTime,
        status: row.status || "scheduled",
        scheduledAt: row.scheduled_at,
        endsAt: row.ends_at || null,
      });
    }

    // Today's scheduled workouts — provides day_id for Start button + completion status
    const { data: todayWorkoutRows } = await supabase
      .from("scheduled_workouts")
      .select("id, client_id, status, day_id, supervised, position, days(id, label)")
      .is("deleted_at", null)
      .eq("scheduled_date", todayStrCT);

    // The trainer's "Today's Sessions" must launch the SUPERVISED day (what the client trains
    // WITH the trainer), never their solo mobility/cardio/walk homework. Rank each candidate:
    // supervised first, then a real training day over a solo/cardio/mobility day, then lower
    // position; lowest score wins. (Previously it only avoided /cardio/ and didn't order the
    // query, so a solo mobility day could shadow the supervised strength session.)
    type ClientDay = { dayId: string; dayLabel: string; status: string };
    const SOLO_RE = /cardio|treadmill|\bwalk\b|stair.?master|mobility|daily reset|elliptical|\bbike\b/i;
    const dayRank = (label: string, supervised: boolean, position: number) =>
      (supervised ? 0 : 100) + (SOLO_RE.test(label) ? 10 : 0) + Math.max(0, Math.min(9, position || 0));
    const bestRank: Record<string, number> = {};
    const clientDayMap: Record<string, ClientDay> = {};
    for (const w of todayWorkoutRows || []) {
      const row = w as any;
      if (!row.client_id) continue;
      const label = (row.days?.label || "Training") as string;
      const score = dayRank(label, row.supervised === true, row.position);
      if (bestRank[row.client_id] === undefined || score < bestRank[row.client_id]) {
        bestRank[row.client_id] = score;
        clientDayMap[row.client_id] = {
          dayId: row.days?.id || row.day_id,
          dayLabel: label,
          status: row.status || "scheduled",
        };
      }
    }

    // Today's sessions for TrainerHome — merge appointments + scheduled_workouts
    const todayAppointments = appointmentMap[todayStrCT] || [];
    const trainerHomeSessions = todayAppointments.map((appt: AE) => {
      const workout = clientDayMap[appt.clientId];
      const sessionStatus = workout?.status === "completed" ? "completed"
        : workout?.status === "cancelled_client" ? "cancelled_client"
        : appt.status;
      return {
        id: appt.id,
        clientId: appt.clientId,
        clientName: appt.clientName,
        startTime: appt.scheduledAt
          ? new Date(appt.scheduledAt).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago",
            })
          : appt.startTime,
        endTime: appt.endsAt
          ? new Date(appt.endsAt).toLocaleTimeString("en-US", {
              hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Chicago",
            })
          : appt.endTime,
        status: sessionStatus,
        title: appt.title,
        workouts: workout
          ? [{ id: workout.dayId, label: workout.dayLabel, isCardio: /cardio|run|bike|swim|tread|ellip/i.test(workout.dayLabel) }]
          : [],
      };
    });

    const loggedTodayCount = trainerHomeSessions.filter((s) => s.status === "completed").length;

    // Workout map (programmed workouts — separate calendar layer, do NOT modify)
    type WE = { id: string; dayId: string | null; clientId: string; clientName: string; date: string; dayLabel: string; status: string };
    const workoutRangeEnd = new Date();
    workoutRangeEnd.setMonth(workoutRangeEnd.getMonth() + 3);
    // THE TRAINER CALENDAR HAS SHOWN NOTHING SINCE 29 JULY, and this read is why.
    // 4,589 live scheduled workouts sit in the window; PostgREST caps every
    // response at 1,000 and reports no error; the rows are ordered by date
    // ascending, so the 1,000 that arrive are the OLDEST and the last one is
    // dated 2026-07-29. Today and everything future -- 2,063 rows -- never
    // reached the page. This is the same failure Dustin reported on 24 Aug in a
    // different read, which is exactly why paging it once is not enough and the
    // static audit now looks for the shape.
    const workoutRows = await fetchAllRows<any>(
      () => supabase
      .from("scheduled_workouts")
      .select("id, day_id, client_id, scheduled_date, status, days(id, label), clients(id, name)")
      .is("deleted_at", null)
      // Central, not UTC: derive the month floor from the Central date, not the UTC year/month.
      .gte("scheduled_date", (() => {
        const [y, m] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 2, 1));
        return dt.toISOString().slice(0, 10);
      })())
      .lte("scheduled_date", workoutRangeEnd.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .order("scheduled_date") as any,
      { label: "trainer calendar workouts" },
    );

    const workoutMap: Record<string, WE[]> = {};
    for (const w of workoutRows || []) {
      const row = w as any;
      const dateKey = row.scheduled_date;
      if (!workoutMap[dateKey]) workoutMap[dateKey] = [];
      workoutMap[dateKey].push({
        id: row.id,
        dayId: row.days?.id || row.day_id || null,
        clientId: row.clients?.id || row.client_id,
        clientName: row.clients?.name || "Unknown",
        date: dateKey,
        dayLabel: row.days?.label || "Workout",
        status: row.status || "scheduled",
      });
    }

    // Payment reminders due in 30 days
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    // Overdue lives in the past, so the window has to reach into it.
    // shiftDate/centralToday rather than another hand-rolled toLocaleDateString:
    // the suite caps that idiom at 99 copies and this would have been the 100th.
    const ninetyBackCT = shiftDate(todayStrCT, -90);
    const { data: remindersRaw } = await supabase
      .from("payment_reminders")
      .select("id, client_id, due_date, amount_due, billing_credits, notification_status, email_sent_at, clients(id, name)")
      // ⚠️ THE "N OVERDUE" BADGE COULD NEVER FIRE, and this is why.
      //
      // The panel computes `overdue = reminders.filter(daysUntil(due) < 0)`.
      // This query started at TODAY, so nothing before today was ever in the
      // set it filtered. The badge counted a subset that had been excluded
      // upstream -- structurally unreachable, not merely empty. Two panels on
      // the same screen could therefore read "2 overdue" and "none".
      //
      // It was excluded twice over: the status filter allowed only pending and
      // paused, and BOTH genuinely overdue invoices are 'sent' -- Christine
      // Latham $320 due 22 Aug and Sharon Rambo $300 due 23 Aug. An invoice
      // that has been sent and not paid is exactly what "overdue" means.
      //
      // So: look back 90 days as well as forward 30, and count sent-and-unpaid
      // as pending does. 'paid' stays out, which is the only status that
      // should be.
      .gte("due_date", ninetyBackCT)
      .lte("due_date", thirtyDays.toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))
      .in("notification_status", ["pending", "paused", "sent"])
      .order("due_date");

    const reminders = (remindersRaw || []).map((r: any) => ({
      id: r.id,
      clientName: r.clients?.name || "Unknown",
      clientId: r.clients?.id || r.client_id,
      dueDate: r.due_date,
      amountDue: Number(r.amount_due),
      billingCredits: Number(r.billing_credits),
      notificationStatus: r.notification_status,
      emailSentAt: r.email_sent_at,
    }));

    const trainerDateLabel = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago",
    });

    // ── THE NOTES NOBODY HAS CLOSED OUT ──────────────────────────────────────
    //
    // The notes QUERY went with the panel on 21 Aug. Today's Admin counts
    // them itself, live, and links to where they get dealt with — so fetching
    // sixty note rows on every trainer home render to feed a panel that is no
    // longer mounted was pure cost. isSymptomNote still classifies them; that
    // ranking now happens where they are read, not here.
    return (
      // ONE container, ONE width, ONE gap. TrainerHome used to carry its own
      // `max-w-lg mx-auto` while the panels below it were siblings of it here
      // with no width at all — so the top of the dashboard was a narrow centred
      // column and the bottom was edge-to-edge. Dustin, 21 Aug: "i want it
      // organized to look good and professional. everything lined up, even and
      // symmetrical." That starts with every block agreeing on how wide it is.
      <div className="p-4 lg:p-6 pb-24 max-w-lg mx-auto space-y-4">
        <TrainerHome
          todaySessions={trainerHomeSessions}
          completedCount={loggedTodayCount}
          scheduledCount={trainerHomeSessions.length}
          clients={(clients || []) as Array<{ id: string; name: string }>}
          notificationCount={reminders.length}
          dateLabel={trainerDateLabel}
        />
        {/* "Needs your eyes" is gone from Home as of 21 Aug. Dustin: "those
            changes would also get rid of the need for the needs your eyes tab
            right? that would declutter my trainer dashboard a lot and still
            catch everything."

            It caught everything by showing everything, which is why 63 notes
            accumulated with a client's back injury underneath twelve pull-up
            weights. It is now split three ways: equipment problems become swap
            proposals (ConfirmSwaps), routine set data and cardio substitutions
            close themselves and are never surfaced, and what is genuinely left
            is one counted row in Today's Admin that links to it.

            ClientNotesPanel stays in the repo, unmounted. */}
        <PendingRemindersPanel reminders={reminders} />
        {/* The sidebar's Schedule -> Calendar link lands here. The trainer
            calendar has never had a route of its own — /schedule redirects
            every trainer straight back to /home — so the nav item pointed at a
            page that bounced, for the owner as much as for anyone else. */}
        <div id="calendar" style={{ scrollMarginTop: 72 }} />
        <TrainerCalendarPanel
          clients={clients || []}
          appointmentMap={appointmentMap}
          workoutMap={workoutMap}
        />
      </div>
    );
  }

  // ── CLIENT VIEW ───────────────────────────────────────────────────────────
  // Trainer in client-preview mode (cookie set) or an actual client
  // THE SIGNED-IN PERSON'S OWN CLIENT ROW — by account id, never by email.
  //
  // This looked the trainer's row up with `.eq("email", TRAINER_EMAIL)`, a
  // single constant. With two trainers from 20 Aug that lands on Dustin no
  // matter who is signed in: Stephanie's own client view would have shown HIS
  // weight, HIS meals, HIS workouts.
  //
  // auth_user_id is right for everybody and always was — both trainers' client
  // rows carry the same auth account as their trainer row. The workout page
  // reached this conclusion already: "Matching a person by a substring of their
  // name was always a guess; his account id is a fact."
  const { data: clientRecord } = await supabase
    .from("clients")
    .select("id, name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!clientRecord) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: "var(--brand-text-secondary)" }}>
          Your account is being set up. Check back soon.
        </p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const thirtyAhead = new Date();
  thirtyAhead.setDate(thirtyAhead.getDate() + 30);
  const thirtyAheadStr = thirtyAhead.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

  // FIX: was .maybeSingle() — fails with error when client has 2 workouts today (cardio + lifting),
  // causing null return and "Rest Day" to show incorrectly. Now returns all workouts as array.
  const { data: todayWorkoutsRaw } = await supabase
    .from("scheduled_workouts")
    .select("id, status, days(label, phase_id, phases(label, programs(name)))")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .eq("scheduled_date", today)
    .order("id");
  const todayWorkouts = todayWorkoutsRaw || [];

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const sixtyStr = sixtyDaysAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  // `skipped` is left out on purpose, everywhere this feeds.
  //
  // Every replace path in the app marks the original skipped and inserts the
  // replacement next to it. Nothing filtered on that, so a replaced session
  // kept its circle in the week strip — an outstanding-looking workout sitting
  // beside the thing that replaced it — AND stayed in the adherence
  // denominator, so swapping a walk in for a cardio day quietly LOWERED the
  // week's percentage. Dustin, 22 Aug: "im still showing an extra workout for
  // yesterday that should not be there."
  //
  // A skipped row means "this was replaced or the person did something else".
  // Either way it is not outstanding and it is not a session they failed to
  // do, so it counts neither as a circle nor against them.
  const { data: recentScheduled } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .is("deleted_at", null)
    .neq("status", "skipped")
    .eq("client_id", clientRecord.id)
    .gte("scheduled_date", sixtyStr)
    .lte("scheduled_date", thirtyAheadStr)
    .order("scheduled_date", { ascending: false });

  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  const thirtyStr = thirtyAgo.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const recent30 = (recentScheduled || []).filter((w: any) => w.scheduled_date >= thirtyStr);
  const totalScheduled = recent30.length;
  const completedCount = recent30.filter((w: any) => w.status === "completed").length;

  // A REST DAY DOES NOT BREAK A STREAK.
  //
  // Dustin, 22 Aug: "a rest day is considered completed... if i logged
  // everything that was scheduled this week, which i did, my streak should be 5
  // days. rest days count towards streak. only thing that stops a streak is if
  // something programmed is not logged."
  //
  // The old rule counted only days that HAD a completed workout and required
  // them to be consecutive calendar days, so Wednesday — programmed as a rest
  // day, nothing scheduled, nothing missed — ended the streak. He had done
  // every single thing on his programme and the app told him 2.
  //
  // The rule is about COMPLIANCE, not about training every day:
  //   nothing programmed        the day counts (a rest day is part of the plan)
  //   everything programmed done the day counts, and ANCHORS the streak
  //   something programmed left  the streak ends there
  //
  // Two details that are easy to get wrong:
  //
  // TODAY IS NEVER A BREAK. The day is not over, so an unfinished today must
  // not end a streak. It only ADDS once its scheduled work is actually done —
  // otherwise it is skipped over silently. Counting today as a rest day at
  // 9am, before anything could have been logged, would hand out credit for a
  // day that has not happened.
  //
  // TRAILING REST DAYS DO NOT PAD IT. The count returned is the count as of the
  // last day that ANCHORED — a day with programmed work, all done. Without
  // that, a client with nothing programmed for a fortnight would accumulate a
  // fourteen-day "streak" having trained zero times.
  //
  // `recentScheduled` already excludes `skipped`, which is what makes
  // "programmed but not logged" mean the right thing: a session that was
  // REPLACED was not missed, and must not end a streak.
  const byDate = new Map<string, { sched: number; done: number }>();
  for (const w of (recentScheduled || []) as any[]) {
    const d = w.scheduled_date as string;
    const e = byDate.get(d) || { sched: 0, done: 0 };
    e.sched++;
    if (w.status === "completed") e.done++;
    byDate.set(d, e);
  }
  let streakDays = 0;
  {
    let run = 0;
    const cursor = new Date(today + "T12:00:00"); // midday: no DST edge
    // 60 days is the window `recentScheduled` covers; beyond it every day would
    // look like a rest day because the rows simply were not fetched.
    for (let i = 0; i < 60; i++) {
      const key = cursor.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
      const e = byDate.get(key);
      const isToday = i === 0;
      if (!e) {
        // Nothing programmed. A rest day bridges — but today has not finished,
        // so it is not yet a rest day worth counting.
        if (!isToday) run++;
      } else if (e.done >= e.sched) {
        run++;
        streakDays = run;
      } else if (isToday) {
        // Programmed work still outstanding, and the day is still going.
        // Neither counts nor breaks.
      } else {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  // THIS WEEK, BY THE CENTRAL CALENDAR.
  //
  // This used to be `new Date().getDay()`, which on Vercel is the UTC weekday.
  // From 19:00 Central the server's "now" is already tomorrow, so every evening
  // the week boundaries slid forward a day — and on a Saturday evening the
  // strip rolled into NEXT week entirely, taking the adherence figure with it.
  // Converting back through toLocaleDateString afterwards hid it well enough
  // that it read as the app being flaky after dinner.
  //
  // Dustin, 22 Aug: "everything in the entire app needs to go by the actual
  // calendar in the timezone we are in and must be accurate."
  const weekStartStr = centralWeekStart(today);
  const weekEndStr = shiftDate(weekStartStr, 6);
  const weekWorkouts = (recentScheduled || [])
    .filter((w: any) => w.scheduled_date >= weekStartStr && w.scheduled_date <= weekEndStr)
    .map((w: any) => ({ date: w.scheduled_date, completed: w.status === "completed" }));

  const allScheduled = (recentScheduled || []).map((w: any) => ({
    id: w.id as string,
    date: w.scheduled_date as string,
    completed: w.status === "completed",
    label: (w.days as any)?.label as string | undefined,
  }));

  const { data: metricsHistory } = await supabase
    .from("metrics")
    .select("metric_date, weight, body_fat_pct, lean_mass, fat_mass")
    .eq("client_id", clientRecord.id)
    .order("metric_date", { ascending: false })
    .limit(30);
  const metrics = (metricsHistory || []).reverse();

  const { data: recentWorkouts } = await supabase
    .from("scheduled_workouts")
    .select("id, scheduled_date, status, days(label)")
    .is("deleted_at", null)
    .eq("client_id", clientRecord.id)
    .eq("status", "completed")
    .order("scheduled_date", { ascending: false })
    .limit(5);

  const { data: notifData } = await supabase
    .from("client_notifications")
    .select("id, type, title, body, amount_due, due_date")
    .eq("client_id", clientRecord.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(10);
  const notifications = (notifData || []) as any[];

  const firstName = (clientRecord.name || "").split(" ")[0];

  return (
    <>
      {/* PwaInstallBanner and SlackerGate both removed 21 Aug.
          - Two install prompts existed with two different dismiss keys and
            could show at once; InstallPrompt in (app)/layout.tsx is the one
            that stayed.
          - SlackerGate ("welcome back slacker") duplicated the lapse screen
            inside ClientTakeovers, at z-index 9999 — ABOVE it — so a lapsed
            client got both. Worse, it ignored checkin_nudges_off and
            checkin_snoozed_until, which the lapse screen honours: a client who
            had explicitly asked not to be nudged got a comedy wanted poster
            anyway. See ClientTakeovers for the one-takeover rule. */}
      <ClientDashboard
        firstName={firstName}
        todayWorkouts={todayWorkouts as any[]}
        metrics={metrics as any[]}
        completedCount={completedCount}
        totalScheduled={totalScheduled}
        recentWorkouts={(recentWorkouts || []) as any[]}
        streakDays={streakDays}
        weekWorkouts={weekWorkouts}
        allScheduled={allScheduled}
        notifications={notifications}
        isOwnTrainerView={isTrainer}
      />
    </>
  );
}
