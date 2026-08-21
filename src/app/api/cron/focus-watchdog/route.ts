// GET /api/cron/focus-watchdog — did the weekly sweep actually happen?
//
// Dustin, 21 Aug, asked what should happen when there is no fresh focus line:
// "notify me to find the cause of failure and get it fixed asap."
//
// WHY THIS IS A SEPARATE ROUTE, and not a try/catch inside the sweep.
//
// The failure that prompted this was the sweep NOT RUNNING AT ALL on 15 Aug.
// An alert living inside /api/cron/weekly-ai would have been just as absent as
// the run it was meant to report on — it cannot fire from a route nobody
// invoked. Six days passed before anyone noticed, and the only reason anyone
// noticed then was a manual database query.
//
// So the check has to be somewhere the sweep is not. It runs on pg_cron (the
// database's own scheduler, a different machine and a different failure domain
// from Vercel's) a few hours after the sweep is due, and asks one question of
// the data rather than of the code: does every active client have a focus
// stamped for the week that has just started?
//
// That single question catches every way this breaks — cron never fired, route
// 500'd, model returned junk, meter paused it, one client's row failed to
// update — without needing to know which.
//
// PER TRAINER, not owner-only. Stephanie's one client is 100% of her roster; a
// combined count would round her failure away inside Dustin's thirty.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronRequest } from "@/lib/cron-auth";
import { isDbSchedulerRequest } from "@/lib/scheduler-key";
import { sendPushToUser } from "@/lib/push";
import { NOTIFICATION_EVENTS } from "@/lib/notificationEvents";
import { weekStartOf } from "@/lib/ai/weekly-numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESEND_API_URL = "https://api.resend.com/emails";
/** One alert per trainer per week. The marker is the dedupe. */
const ALERT_FEATURE = "focus_watchdog_alert";

const CT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

interface TrainerRow { id: string; name: string | null; email: string | null; auth_user_id: string | null }
interface ClientRow { id: string; name: string | null; trainer_id: string | null; weekly_focus: string | null; weekly_focus_week: string | null }

function emailHtml(firstName: string, missing: string[], total: number, week: string): string {
  const all = missing.length === total;
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#E53935;border-radius:12px 12px 0 0;padding:20px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">Symmetry — weekly focus did not write</h1>
  </div>
  <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px">
    <p style="color:#333;font-size:15px;margin:0 0 12px">
      ${firstName}, ${all
        ? `<strong>none</strong> of your ${total} clients have a focus line for the week of ${week}.`
        : `<strong>${missing.length}</strong> of your ${total} clients have no focus line for the week of ${week}.`}
    </p>
    <p style="color:#555;font-size:14px;margin:0 0 12px">
      They are seeing no focus at all rather than an old one, so nothing
      misleading is on screen — but nothing useful is either.
    </p>
    ${missing.length ? `<p style="color:#555;font-size:14px;margin:0 0 12px"><strong>Missing:</strong> ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? " and " + (missing.length - 20) + " more" : ""}</p>` : ""}
    <p style="color:#555;font-size:14px;margin:0 0 12px">
      The sweep runs late Saturday. Check the Vercel cron log for
      <code>/api/cron/weekly-ai</code>, or force a run from the app.
    </p>
    <p style="color:#999;font-size:12px;margin:0">Sent once per week, only when something is missing.</p>
  </div>
</div>`.trim();
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req) && !(await isDbSchedulerRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const today = CT_TODAY();
  const week = weekStartOf(today);

  const [{ data: tData }, { data: cData }] = await Promise.all([
    db.from("trainers").select("id, name, email, auth_user_id"),
    db.from("clients").select("id, name, trainer_id, weekly_focus, weekly_focus_week").is("archived_at", null),
  ]);
  const trainers = (tData || []) as TrainerRow[];
  const clients = (cData || []) as ClientRow[];

  const out: { trainer: string; total: number; missing: number; alerted: boolean; reason?: string }[] = [];

  for (const t of trainers) {
    const mine = clients.filter((c) => c.trainer_id === t.id);
    if (mine.length === 0) continue;

    const missing = mine
      .filter((c) => !(c.weekly_focus_week === week && (c.weekly_focus || "").trim()))
      .map((c) => c.name || "—");

    if (missing.length === 0) {
      out.push({ trainer: t.name || t.id, total: mine.length, missing: 0, alerted: false });
      continue;
    }

    // Durable once-per-week guard, per trainer. Marker FIRST: if recording it
    // fails we send nothing, because a repeating alert is worse than a missed
    // one — the same reasoning as the AI cap notice in meter.ts, which this
    // deliberately mirrors rather than inventing a second alerting style.
    //
    // `client_id` is a FK to clients and a trainer is not a client, so the
    // per-trainer key lives in `model`, the one free-text column here.
    const dedupeKey = `${ALERT_FEATURE}:${t.id}`;
    const { data: alreadySent, error: readErr } = await db
      .from("ai_usage_log")
      .select("id")
      .eq("feature", ALERT_FEATURE)
      .eq("used_on", week)
      .eq("model", dedupeKey)
      .limit(1);
    if (readErr) {
      out.push({ trainer: t.name || t.id, total: mine.length, missing: missing.length, alerted: false, reason: "dedupe read failed" });
      continue;
    }
    if (alreadySent && alreadySent.length > 0) {
      out.push({ trainer: t.name || t.id, total: mine.length, missing: missing.length, alerted: false, reason: "already alerted this week" });
      continue;
    }

    const { error: insErr } = await db.from("ai_usage_log").insert({
      client_id: null, used_on: week, feature: ALERT_FEATURE,
      model: dedupeKey, tokens_in: 0, tokens_out: 0, cost_usd: 0,
    });
    if (insErr) {
      out.push({ trainer: t.name || t.id, total: mine.length, missing: missing.length, alerted: false, reason: "marker not written" });
      continue;
    }

    const firstName = (t.name || "").split(" ")[0] || "there";
    const headline = missing.length === mine.length
      ? "Weekly focus did not write"
      : `${missing.length} client${missing.length === 1 ? "" : "s"} have no focus this week`;

    // Push and email are independent. Neither failing may stop the other, and
    // neither may fail the run — a watchdog that throws is a watchdog nobody
    // hears from.
    await Promise.all([
      t.auth_user_id
        ? sendPushToUser(
            t.auth_user_id,
            NOTIFICATION_EVENTS.SYSTEM_ALERT,
            headline,
            `Week of ${week}. Clients see no focus line rather than an old one.`,
            { url: "/home" },
          ).catch((e) => console.error("focus-watchdog: push failed", e))
        : Promise.resolve(),
      (async () => {
        if (!process.env.RESEND_API_KEY || !t.email) return;
        try {
          await fetch(RESEND_API_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Symmetry Corrective <noreply@symmetrypersonaltraining.com>",
              to: [t.email],
              subject: headline + ` — week of ${week}`,
              html: emailHtml(firstName, missing, mine.length, week),
            }),
          });
        } catch (e) {
          console.error("focus-watchdog: email failed", e);
        }
      })(),
    ]);

    out.push({ trainer: t.name || t.id, total: mine.length, missing: missing.length, alerted: true });
  }

  return NextResponse.json({ ok: true, week, today, trainers: out });
}
