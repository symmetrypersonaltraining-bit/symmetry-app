// WHO THIS CLIENT IS — the half of the weekly sweep's context that was missing.
//
// Dustin, 5 Sep 2026, setting the bar for every AI surface in the app:
//
//   "any ai needs a very detailed way of thinking to make sure its accurate to
//    each client and relevant to them."
//
// The weekly sweep already had excellent NUMBERS — weeklyNumbersBlock computes
// adherence, averages, signed deltas, sessions completed and the weight move,
// all in advance, all trusted. What it did not have was any idea WHO it was
// writing to. The whole picture handed to the model was the client's name and
// their primary_goal. So the week written for Stacie, who has a repaired
// rotator cuff, and the week written for a competitive lifter came out of the
// same context.
//
// Worse, the prompt asked for something that context could not support. It told
// the model to ground its fortnightly programming question in specifics —
// verbatim, "if they skipped legs twice, ask about that; if every session ran
// long, ask about session length" — while handing it the single line
//
//     - Training: 3 of 4 scheduled sessions completed.
//
// A count. Not which sessions, not which body parts, not how long anything
// took. An instruction to ground a question in detail the context does not hold
// is an instruction to invent one, and an invented question reads exactly as
// confident and specific as a real one. That is the failure this file exists to
// close: give the model the detail, so the instruction becomes satisfiable.
//
// Everything here is READ AND FORMATTED, never inferred. Where a fact is absent
// the block says it is absent, in words, rather than leaving a silence the model
// will fill.

import type { Db } from "@/lib/ai/scope";

export interface PictureWindows {
  lastStart: string;
  lastEnd: string;
  currentStart: string;
  currentEnd: string;
  /** The Sunday the copy being written is for. */
  week: string;
}

interface SessionRow {
  scheduled_date: string;
  status: string | null;
  days: { label: string | null; region: string | null; focus_tags: string[] | null } | null;
}

/** "Mon 1 Sep" — short enough to list seven of them without eating the prompt. */
function shortDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * One session on one line: the day, what it was, and whether it happened.
 *
 * `region` and `focus_tags` are the facets backfilled onto `days` on 4 Sep.
 * They are what make "they skipped legs twice" a readable fact rather than a
 * guess — but only when they are actually populated, so an unclassified day
 * says so instead of quietly looking like a day with no focus.
 */
function sessionLine(s: SessionRow): string {
  const done = (s.status || "").toLowerCase() === "completed";
  const d = s.days;
  const label = d?.label?.trim() || "(untitled session)";
  const focus = (d?.focus_tags || []).filter(Boolean);
  const region = d?.region?.trim() || "";
  const what =
    focus.length ? focus.join(", ")
    : region ? region
    : "not classified — do NOT guess what it worked";
  return `  - ${shortDay(s.scheduled_date)}: ${label} [${what}] — ${done ? "COMPLETED" : "not completed"}`;
}

function sessionsBlock(title: string, rows: SessionRow[]): string {
  if (!rows.length) return `${title}: no sessions were scheduled.`;
  return `${title}:\n${rows.map(sessionLine).join("\n")}`;
}

/**
 * The client-specific context block for the weekly sweep, appended to the
 * numbers block.
 *
 * Best-effort by design: this makes the week BETTER, and a week written from
 * the numbers alone is the behaviour that shipped for months. A failure here
 * must never cost the whole roster their focus, so the caller gets "" and
 * carries on.
 */
export async function weeklyClientPicture(
  db: Db,
  clientId: string,
  w: PictureWindows,
): Promise<string> {
  try {
    const [clientRes, swRes, memRes] = await Promise.all([
      db
        .from("clients")
        .select(
          "name, primary_goal, secondary_goals, experience_level, training_frequency, days_per_week, injuries_limitations, injuries, start_date, weekly_focus, weekly_focus_week, weekly_focus_source",
        )
        .eq("id", clientId)
        .maybeSingle(),
      db
        .from("scheduled_workouts")
        .select("scheduled_date, status, days(label, region, focus_tags)")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .gte("scheduled_date", w.lastStart)
        .lte("scheduled_date", w.currentEnd)
        .order("scheduled_date", { ascending: true }),
      db.from("ai_client_memory").select("summary, facts").eq("client_id", clientId).maybeSingle(),
    ]);

    const c = (clientRes.data || null) as Record<string, unknown> | null;
    const sessions = ((swRes.data as unknown as SessionRow[]) || []).filter(
      (s) => typeof s?.scheduled_date === "string",
    );

    const out: string[] = [];

    // ── who they are ────────────────────────────────────────────────────────
    const profile: string[] = [];
    const str = (k: string) => {
      const v = c?.[k];
      return typeof v === "string" && v.trim() ? v.trim() : "";
    };
    if (str("primary_goal")) profile.push(`Primary goal: ${str("primary_goal")}`);
    if (str("secondary_goals")) profile.push(`Secondary goals: ${str("secondary_goals")}`);
    if (str("experience_level")) profile.push(`Experience: ${str("experience_level")}`);

    // PROGRAMMED, not attended. The coach context learned this the hard way on
    // 22 Aug, when a plan number was asserted as attendance to a client with 7
    // sessions out of 45. Same trap, same wording.
    const planned = Number(c?.days_per_week) || null;
    const stated = Number(c?.training_frequency) || null;
    if (planned && stated && planned !== stated) {
      profile.push(`Programmed ${planned}x/week (intake said ${stated}x — they disagree; this is the PLAN, never attendance)`);
    } else if (planned || stated) {
      profile.push(`Programmed ${planned ?? stated}x/week (this is the PLAN, never what they actually did)`);
    }

    const inj = str("injuries_limitations") || str("injuries");
    profile.push(
      inj
        ? `INJURIES / LIMITATIONS: ${inj} — anything you tell them to do this week has to be compatible with this.`
        : `Injuries / limitations: none on file.`,
    );
    if (str("start_date")) profile.push(`Coaching since: ${str("start_date")}`);

    out.push(`WHO THIS CLIENT IS:\n- ${profile.join("\n- ")}`);

    // ── what they were actually programmed, session by session ──────────────
    //
    // The reason this file exists. Without it the model is told a count and
    // asked to write about specifics.
    const lastRows = sessions.filter((s) => s.scheduled_date >= w.lastStart && s.scheduled_date <= w.lastEnd);
    const curRows = sessions.filter((s) => s.scheduled_date >= w.currentStart && s.scheduled_date <= w.currentEnd);
    out.push(
      `SESSIONS, ONE BY ONE. This is the ONLY place you may learn what they trained. ` +
        `If a session says "not classified", you do not know what it worked and must not say. ` +
        `If neither week shows a pattern, there is no pattern.\n` +
        sessionsBlock(`Last week (${w.lastStart} → ${w.lastEnd})`, lastRows) +
        `\n` +
        sessionsBlock(`This week so far (${w.currentStart} → ${w.currentEnd})`, curRows),
    );

    // ── what they have told the coach ───────────────────────────────────────
    //
    // The coach chat has had a permanent per-client memory since 12 Aug. The
    // weekly writer never read it, so the focus could contradict something the
    // client had said three days earlier and neither side would know.
    const mem = (memRes.data || null) as { summary?: unknown; facts?: unknown } | null;
    const summary = typeof mem?.summary === "string" ? mem.summary.trim() : "";
    const facts = Array.isArray(mem?.facts)
      ? (mem.facts as unknown[]).filter((f): f is string => typeof f === "string" && !!f.trim()).slice(0, 20)
      : [];
    if (summary || facts.length) {
      out.push(
        `WHAT THEY HAVE TOLD THE COACH (their words, not their numbers — do not contradict this):` +
          (summary ? `\n- ${summary}` : "") +
          (facts.length ? `\n- ${facts.join("\n- ")}` : ""),
      );
    } else {
      out.push(`WHAT THEY HAVE TOLD THE COACH: nothing on file yet.`);
    }

    // ── what you told them last time ────────────────────────────────────────
    //
    // Without this the sweep cannot tell whether its own advice landed, cannot
    // say "you held that, add a notch", and will repeat the same line for a
    // month without noticing.
    const prevFocus = str("weekly_focus");
    const prevWeek = str("weekly_focus_week");
    const prevSrc = str("weekly_focus_source");
    if (prevFocus && prevWeek && prevWeek !== w.week) {
      out.push(
        `THE FOCUS THEY WERE GIVEN FOR THE WEEK OF ${prevWeek} (${prevSrc === "trainer" ? "set by their trainer" : "written by you"}):\n` +
          `  "${prevFocus}"\n` +
          `Judge it against the numbers above and say whether it was met. Do NOT hand them this same focus again.`,
      );
    } else {
      out.push(`THE FOCUS THEY WERE GIVEN LAST WEEK: none on file — this is the first one.`);
    }

    return out.join("\n\n");
  } catch (e) {
    console.error("weeklyClientPicture failed (continuing on numbers alone)", e);
    return "";
  }
}
