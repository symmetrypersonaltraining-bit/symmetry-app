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

/**
 * How this client's relationship with the food logger actually stands — over
 * their whole history, not over the fortnight the numbers block covers.
 *
 * Dustin, 5 Sep 2026: "make sure it does not mention nutrition if they have
 * never logged food too much. every so often a soft nudge fine but don't keep
 * on it if they have never logged. if they have logged n fell off push it."
 *
 * The reason he asked is sitting in the database. Jennifer Day's coach's read
 * for the week of 30 Aug says "there's still nothing in the food logger two
 * weeks running" — to a client who has NEVER logged a single day, ever. The
 * numbers block only sees a fortnight, so an absence that is simply how this
 * client uses the app is indistinguishable from an absence that is a slip. Told
 * only "0 days logged", the model writes the same disappointed sentence to
 * both, every week, forever.
 *
 * Live counts, 5 Sep 2026: 18 clients have never logged a day; ten logged
 * properly and then stopped; seven are logging now. Three different situations
 * that were getting one message.
 */
export type FoodStance = "never" | "starting" | "active" | "slipping" | "lapsed";

export interface PictureWindows {
  lastStart: string;
  lastEnd: string;
  currentStart: string;
  currentEnd: string;
  /** The Sunday the copy being written is for. */
  week: string;
}

/**
 * Which stance, from lifetime counts.
 *
 * Thresholds are deliberately generous at the bottom: two logged days ever is
 * somebody who opened the screen once, not somebody who tracks food.
 */
export function foodStance(daysEver: number, days14: number): FoodStance {
  if (daysEver <= 2) return "never";
  if (days14 >= 5) return "active";
  if (daysEver <= 4) return "starting";
  return days14 === 0 ? "lapsed" : "slipping";
}

/**
 * Whether a client who has never logged may be nudged AT ALL this week.
 *
 * "every so often a soft nudge fine but don't keep on it." Every so often has
 * to be deterministic or it is not a rule — a model asked to nudge "sometimes"
 * nudges every time. One week in four, anchored to a fixed Sunday so the
 * cadence survives a missed or replayed run, exactly like isQuestionWeek.
 */
const NUDGE_ANCHOR = Date.parse("2026-08-02T00:00:00Z"); // a Sunday
export function nudgeWeekFor(weekStart: string): boolean {
  const wk = Date.parse(weekStart + "T00:00:00Z");
  if (Number.isNaN(wk)) return false;
  const weeks = Math.round((wk - NUDGE_ANCHOR) / (7 * 86400000));
  return ((weeks % 4) + 4) % 4 === 0;
}

// ── the occasional general tip ──────────────────────────────────────────────
//
// Dustin, 5 Sep 2026: "work in some general tips too occasionally. tips on
// enough sleep n why, water consumption for recover, resting properly. general
// tips are ok just keep specific n personal most of the time."
//
// "Occasionally" and "most of the time" are the whole instruction, and neither
// survives being handed to a model as an adjective. A writer told it may
// "sometimes" add a general tip adds one every week, and within a month the
// weekly focus is a wellness newsletter — which is exactly the "obvious,
// outdated or just not useful" wall of text that is the modal complaint about
// AI coaching. So the cadence is computed here and handed over as a topic or as
// nothing at all, and the topic ROTATES so the same client is not told about
// sleep four times.
//
// The list stays inside what a trainer says on the gym floor: recovery, sleep,
// water, rest. No supplements, no medical claims, no diagnosis, nothing that
// belongs to a dietitian or a doctor.
const TIP_TOPICS = [
  "SLEEP — that the actual adaptation happens while they are asleep, not while they are training, and what short sleep costs them in recovery and strength",
  "WATER — that being even slightly under-hydrated shows up as flat sessions, early fatigue and cramping, and that recovery between sessions needs it as much as the session itself",
  "REST DAYS — that a rest day is when the work they already did turns into progress, and that training through everything is what stalls people, not what advances them",
  "SLEEP CONSISTENCY — that going to bed and waking at roughly the same time does more for recovery than one long catch-up night at the weekend",
  "WATER AROUND TRAINING — drinking through the day rather than trying to catch up in the hour before a session",
  "SORENESS vs PAIN — that ordinary next-day soreness is expected and settles, while something sharp, or in a joint, or that does not settle, is worth telling their trainer about rather than training through",
  "MOVEMENT ON OFF DAYS — that an easy walk on a non-training day helps recovery more than sitting still does",
];

/**
 * Which general tip, if any, belongs in this week's copy.
 *
 * Every third week, on the same fixed-Sunday anchor as the food nudge so both
 * cadences survive a missed or replayed run — and suppressed entirely on a food
 * nudge week, because two bolted-on extra lines in one short piece of copy is
 * the wall of text this is meant to avoid.
 */
export function generalTipFor(weekStart: string): string | null {
  const wk = Date.parse(weekStart + "T00:00:00Z");
  if (Number.isNaN(wk)) return null;
  const weeks = Math.round((wk - NUDGE_ANCHOR) / (7 * 86400000));
  const n = ((weeks % 3) + 3) % 3;
  if (n !== 1) return null;
  if (nudgeWeekFor(weekStart)) return null;
  const idx = ((Math.floor(weeks / 3) % TIP_TOPICS.length) + TIP_TOPICS.length) % TIP_TOPICS.length;
  return TIP_TOPICS[idx];
}

/** The instruction that goes with the topic — or the one that goes without it. */
function tipBlock(topic: string | null): string {
  if (!topic) {
    return (
      `GENERAL TIPS: not this week. Everything you write must be about THIS CLIENT and their own numbers. ` +
      `No general advice about sleep, water, rest, recovery or anything else that would be true of a stranger.`
    );
  }
  return (
    `GENERAL TIP — allowed this week, on this topic only:
  ${topic}
` +
    `ONE sentence, at the very END of the coach's read, after everything personal. Say the WHY, not just the instruction — ` +
    `"drink more water" is the kind of line people scroll past; the reason it matters to their training is the part worth reading. ` +
    `Plain words, the way it would be said standing in the gym, not a health article. General guidance figures are fine if you ` +
    `frame them as general ("most people need…"), but never state anything as a fact about THIS client's sleep, water or rest — ` +
    `you have no data on any of it. Do not diagnose, do not mention supplements, and do not let this line contradict or soften ` +
    `anything you just said about their week.`
  );
}

/** What the writer is allowed to say about food, given the stance. */
function foodStanceBlock(stance: FoodStance, daysEver: number, days14: number, lastLog: string | null, nudgeOk: boolean): string {
  const facts = `Logged food on ${daysEver} day${daysEver === 1 ? "" : "s"} in their entire history; ${days14} in the last 14 days${lastLog ? `; last logged ${lastLog}` : ""}.`;
  switch (stance) {
    case "never":
      return (
        `FOOD LOGGING — THEY HAVE NEVER USED IT. ${facts}
` +
        (nudgeOk
          ? `This is a nudge week, so you may include ONE short, warm, no-pressure line inviting them to try the food logger — mention that it is a tap per meal now, and that they can photograph or just say what they ate. One line. Then move on and never return to it.`
          : `⛔ DO NOT MENTION FOOD, MACROS, CALORIES, NUTRITION OR LOGGING AT ALL THIS WEEK. Not as an aside, not as a "one more thing", not as a gap. A client who has never tracked food does not need to be told every single week that they are not tracking food; it reads as nagging about a thing they have not chosen to do, and it crowds out the training coaching that is the whole point. Write about their TRAINING.`) +
        `
Never describe this absence as a slip, a lapse, "still nothing", "two weeks running" or anything implying they used to and stopped. They never did.`
      );
    case "lapsed":
      return (
        `FOOD LOGGING — THEY DID IT AND STOPPED. ${facts}
` +
        `PUSH THIS, warmly and specifically. They have already proved they can do it, so this is about restarting a habit they own, not selling them a new one. Say what it did for them while they were doing it if the numbers show it. Then remind them how little it now takes: one tap per planned meal, and for anything off-plan they can photograph it, scan a barcode, search it, or just tell the coach what they ate and it logs it for them. Do not scold, do not guilt, and do not ask why they stopped.`
      );
    case "slipping":
      return (
        `FOOD LOGGING — SLIPPING. ${facts}
` +
        `They are still logging, just thinly. One encouraging line pointing at the gap between what they logged and what they ate. Remind them the off-plan ones are a photo or a sentence to the coach, not a form.`
      );
    case "starting":
      return (
        `FOOD LOGGING — JUST STARTED. ${facts}
` +
        `Treat any logging at all as the win it is. Encourage the next few days; do not grade their macros yet on this little data.`
      );
    case "active":
      return (
        `FOOD LOGGING — ACTIVE. ${facts}
` +
        `Coach the actual numbers above. They are doing the work of logging; give them something worth the effort in return.`
      );
  }
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
    const [clientRes, swRes, memRes, foodRes] = await Promise.all([
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
      // LIFETIME food logging, not the fortnight the numbers block covers.
      // Distinct dates only — several rows land on one day.
      db.from("meal_adherence_logs").select("log_date").eq("client_id", clientId),
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

    // ── how they actually use the food logger, over their whole history ─────
    //
    // The fortnight in the numbers block cannot tell "never started" apart from
    // "stopped last week", and those two need opposite messages. See FoodStance.
    const foodDates = new Set(
      (((foodRes.data as { log_date: string }[]) || [])
        .map((r) => r?.log_date)
        .filter((d): d is string => typeof d === "string")),
    );
    const daysEver = foodDates.size;
    const fourteenAgo = new Date(Date.parse(w.currentEnd + "T00:00:00Z") - 13 * 86400000)
      .toISOString()
      .slice(0, 10);
    const days14 = [...foodDates].filter((d) => d >= fourteenAgo).length;
    const lastLog = daysEver ? [...foodDates].sort().slice(-1)[0] : null;
    const stance = foodStance(daysEver, days14);
    out.push(foodStanceBlock(stance, daysEver, days14, lastLog, nudgeWeekFor(w.week)));

    // Occasional, rotating, and off by default — see generalTipFor.
    out.push(tipBlock(generalTipFor(w.week)));

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
