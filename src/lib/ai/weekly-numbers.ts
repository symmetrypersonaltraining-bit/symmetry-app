// Last week vs this week — the numbers, derived once, server-side.
//
// Dustin: "food logger one base numbers on how they did last week and what to
// work on this week. i dont want to have to check on these so keep them
// accurate to real numbers. triple check the numbers because they have been
// off here and there and not accurate."
//
// Two things follow from that. First, the model never does arithmetic: every
// average, delta and direction below is computed here and handed over as a
// stated fact with "do NOT recompute" attached — the same discipline
// averagesVsTargetsLine and trajectoryLines already use, because the model was
// demonstrably flipping above/below when given raw rows.
//
// Second, everything in this file is PURE and unit-tested. The fetching lives
// in weekly-context.ts. If a number here is wrong, a test says so.
//
// The week runs SUNDAY → SATURDAY, matching weeklyBrief.ts, TrainerWeekDigest
// and the rest of the app. Dates are Central Time ISO strings ("2026-07-31").
// "Last week" is the most recent COMPLETE week; "this week" is Sunday through
// today and is explicitly flagged as partial so nothing scores it as a finished
// week.

export function shiftISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Sunday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return shiftISO(iso, -dow);
}

export function daysBetweenISO(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export interface WeekWindow {
  start: string;
  end: string;
  /** Calendar days in the window, inclusive. 7 for a complete week. */
  days: number;
  complete: boolean;
}

/** The most recent COMPLETE Sun→Sat week before the week containing `today`. */
export function lastWeekWindow(today: string): WeekWindow {
  const start = shiftISO(weekStartOf(today), -7);
  return { start, end: shiftISO(start, 6), days: 7, complete: true };
}

/** Sunday of this week through `today` — partial unless today is Saturday. */
export function thisWeekWindow(today: string): WeekWindow {
  const start = weekStartOf(today);
  const days = daysBetweenISO(start, today) + 1;
  return { start, end: today, days, complete: days === 7 };
}

export interface MacroSet {
  kcal: number;
  p: number;
  c: number;
  f: number;
}

/** Everything measured about one week. Averages are PER LOGGED DAY. */
export interface WeekFacts {
  window: WeekWindow;
  /** Days in the window with at least one food log. */
  loggedDays: number;
  /**
   * Days actually behind `avg`. Lower than loggedDays when the in-progress day
   * is left out — half a day of food would drag the average down and the model
   * is told to state these figures as fact.
   */
  avgDays: number;
  /** Average per averaged day, or null when nothing was logged. */
  avg: MacroSet | null;
  /**
   * Adherence, 0-100. Dustin, 2026-07-31: "adherence should be based on
   * consistently logging and hitting macros n calories." So it is
   * consistency × accuracy — see rangeAverages.ts for the full definition.
   * Falls back to the old meal-status average when there's no target on file.
   */
  adherence: number | null;
  /** Days logged ÷ days in the window, 0-100. */
  consistency: number | null;
  /** How close the logged days landed to target across all four macros, 0-100. */
  accuracy: number | null;
  /** Which calculation produced `adherence`, so the copy describes it honestly. */
  adherenceBasis: "logging+macros" | "meal-status";
  workoutsScheduled: number;
  workoutsCompleted: number;
  /** First and last weigh-in inside the window. */
  weightStart: number | null;
  weightEnd: number | null;
}

export interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export const EMPTY_WEEK = (window: WeekWindow): WeekFacts => ({
  window,
  loggedDays: 0,
  avgDays: 0,
  avg: null,
  adherence: null,
  consistency: null,
  accuracy: null,
  adherenceBasis: "meal-status",
  workoutsScheduled: 0,
  workoutsCompleted: 0,
  weightStart: null,
  weightEnd: null,
});

function r0(n: number): number {
  return Math.round(n);
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}
function signed(n: number): string {
  return `${n >= 0 ? "+" : ""}${n}`;
}
function dirWord(n: number, up: string, down: string, flat: string): string {
  return n > 0 ? up : n < 0 ? down : flat;
}

/** "3 of 7 days" style, never a bare percentage of a made-up denominator. */
function loggingLine(f: WeekFacts): string {
  return `logged food on ${f.loggedDays} of ${f.window.days} day${f.window.days === 1 ? "" : "s"}`;
}

/**
 * A signed delta line with the direction spelled out in words, so the model
 * restates it instead of deciding it. Returns null when either side is missing —
 * a comparison against absent data is exactly the kind of invented number this
 * whole module exists to prevent.
 */
export function deltaLine(
  label: string,
  last: number | null,
  now: number | null,
  unit: string,
  betterWhen: "higher" | "lower" | "neither",
  round: (n: number) => number = r0,
): string | null {
  if (last == null || now == null) return null;
  const a = round(last);
  const b = round(now);
  const d = round(b - a);
  const word = dirWord(d, "UP", "DOWN", "FLAT");
  let verdict = "";
  if (d !== 0 && betterWhen !== "neither") {
    const better = betterWhen === "higher" ? d > 0 : d < 0;
    verdict = better ? " (moving the right way)" : " (moving the wrong way)";
  }
  return `- ${label}: ${a}${unit} last week → ${b}${unit} this week = ${signed(d)}${unit} ${word}${verdict}`;
}

/** One week's numbers as flat, stated facts. */
export function weekFactsLines(f: WeekFacts, label: string, target: MacroTarget | null): string[] {
  const out: string[] = [];
  const head = `${label} (${f.window.start} → ${f.window.end}${f.window.complete ? ", COMPLETE week" : ", PARTIAL — still in progress, do NOT judge it as a finished week"})`;
  out.push(head + ":");

  if (!f.avg || !f.loggedDays) {
    out.push(`- Nutrition: nothing logged (${loggingLine(f)}).`);
  } else {
    // When today is left out of the averages, say so in the same breath as the
    // numbers — otherwise "logged 6 of 6 days" next to a 5-day average reads
    // like an arithmetic error to anyone checking it.
    const basis =
      f.avgDays && f.avgDays !== f.loggedDays
        ? ` averages across the ${f.avgDays} completed logged day${f.avgDays === 1 ? "" : "s"} (today is still in progress and is deliberately excluded)`
        : " averages per logged day";
    out.push(
      `- Nutrition: ${loggingLine(f)};${basis} ${r0(f.avg.kcal)} kcal, ${r0(f.avg.p)}g protein, ${r0(f.avg.c)}g carbs, ${r0(f.avg.f)}g fat.`,
    );
    if (target) {
      const d = (a: number, t: number) => `${signed(r0(a - t))} (${dirWord(r0(a - t), "ABOVE", "BELOW", "on")} target)`;
      out.push(
        `  vs targets (${target.calories} kcal / ${target.protein}P / ${target.carbs}C / ${target.fats}F) — these signed deltas are the SOURCE OF TRUTH, do NOT recompute the direction: calories ${d(f.avg.kcal, target.calories)}, protein ${d(f.avg.p, target.protein)}, carbs ${d(f.avg.c, target.carbs)}, fat ${d(f.avg.f, target.fats)}.`,
      );
    }
    // Adherence is no longer "how did they tag their meals" — it is logging
    // consistency × macro accuracy. The model has to be told what the number
    // MEANS or it will keep calling it meal-plan adherence and coach the wrong
    // behaviour off it.
    if (f.adherence != null) {
      if (f.adherenceBasis === "logging+macros" && f.consistency != null && f.accuracy != null) {
        const caveat =
          f.avgDays !== f.loggedDays
            ? " (the in-progress day is left out of both sides of consistency)"
            : "";
        out.push(
          `- Adherence: ${r0(f.adherence)}%. This is logging consistency × macro accuracy, NOT a meal checkbox score: consistency ${r0(f.consistency)}% — how much of the window they logged at all${caveat} — times accuracy ${r0(f.accuracy)}% — how close the days they did log landed to target across ALL FOUR of calories, protein, carbs and fat. A day nobody logged counts as a miss. Within 10% of a target is a full hit.`,
        );
      } else {
        out.push(
          `- Adherence: ${r0(f.adherence)}% — meal-status average only, because there is no macro target on file to score accuracy against. Treat it as a rough read.`,
        );
      }
    }
  }

  out.push(
    f.workoutsScheduled
      ? `- Training: ${f.workoutsCompleted} of ${f.workoutsScheduled} scheduled session${f.workoutsScheduled === 1 ? "" : "s"} completed.`
      : "- Training: nothing was on the calendar.",
  );

  if (f.weightStart != null && f.weightEnd != null && f.weightStart !== f.weightEnd) {
    const d = r1(f.weightEnd - f.weightStart);
    out.push(`- Weight: ${r1(f.weightStart)} lb → ${r1(f.weightEnd)} lb = ${signed(d)} lb ${dirWord(d, "UP", "DOWN", "FLAT")} across the week.`);
  } else if (f.weightEnd != null) {
    out.push(`- Weight: ${r1(f.weightEnd)} lb (one weigh-in — no within-week trend).`);
  } else {
    out.push("- Weight: no weigh-in this window.");
  }

  return out;
}

/**
 * The full block handed to the model. Last week's finished numbers, this week
 * so far, and the week-over-week movement — all pre-computed.
 */
export function weeklyNumbersBlock(
  last: WeekFacts,
  current: WeekFacts,
  target: MacroTarget | null,
  // Each week is judged against the target that was actually in force during
  // it. Judging a finished week against a target set after it ended is how
  // Dustin's last week reported protein +1 ABOVE when it was really 29g BELOW —
  // his numbers were measured against a target that took effect five days after
  // the week closed. Defaults to `target` so single-target callers are unchanged.
  currentTarget: MacroTarget | null = target,
): string {
  const lines: string[] = [
    "WEEK-OVER-WEEK NUMBERS — computed from this client's real logs. Every figure and direction below is already worked out; state them as given and do NOT recompute any of them.",
    "",
    ...weekFactsLines(last, "LAST WEEK", target),
    "",
    ...weekFactsLines(current, "THIS WEEK SO FAR", currentTarget),
  ];

  // A mid-window target change is the single most useful thing a coach can be
  // told, and it silently explains why the deltas jumped.
  const changed =
    target && currentTarget &&
    (target.calories !== currentTarget.calories ||
      target.protein !== currentTarget.protein ||
      target.carbs !== currentTarget.carbs ||
      target.fats !== currentTarget.fats);
  if (changed) {
    lines.push(
      "",
      `TARGETS CHANGED between the two weeks — last week is measured against ${target!.calories} kcal / ${target!.protein}P / ${target!.carbs}C / ${target!.fats}F, this week against ${currentTarget!.calories} kcal / ${currentTarget!.protein}P / ${currentTarget!.carbs}C / ${currentTarget!.fats}F. Each week is compared to the target that was actually in force during it; do not treat the change as the client slipping.`,
    );
  }

  const moves: string[] = [];
  const push = (s: string | null) => {
    if (s) moves.push(s);
  };
  push(deltaLine("Days logged", last.loggedDays, current.loggedDays, " days", "higher"));
  push(deltaLine("Avg calories", last.avg?.kcal ?? null, current.avg?.kcal ?? null, " kcal", "neither"));
  push(deltaLine("Avg protein", last.avg?.p ?? null, current.avg?.p ?? null, "g", "higher"));
  push(deltaLine("Adherence (logging × macro accuracy)", last.adherence, current.adherence, "%", "higher"));
  push(deltaLine("  ↳ logging consistency", last.consistency, current.consistency, "%", "higher"));
  push(deltaLine("  ↳ macro accuracy on logged days", last.accuracy, current.accuracy, "%", "higher"));
  push(
    deltaLine(
      "Sessions completed",
      last.workoutsScheduled ? last.workoutsCompleted : null,
      current.workoutsScheduled ? current.workoutsCompleted : null,
      "",
      "higher",
    ),
  );

  if (moves.length) {
    lines.push(
      "",
      current.window.complete
        ? "WEEK OVER WEEK — direction is stated for you, do NOT recompute it:"
        : "WEEK OVER WEEK (this week is still partial, so these are early reads — say so rather than declaring a verdict). Direction is stated for you, do NOT recompute it:",
      ...moves,
    );
  }

  if (!last.loggedDays && !current.loggedDays) {
    lines.push(
      "",
      "NO food logs in either week. Do not invent numbers or infer a trend — say plainly that there's nothing logged yet and make getting a few days down the focus.",
    );
  }

  return lines.join("\n");
}

/**
 * What the weekly copy has to be, in one place, so the focus line, the coach's
 * read and the food-logger read all stay in the same voice and never leak
 * internal method language to a client.
 */
export const WEEKLY_WRITER_RULES = `Ground every claim in the numbers given. Never invent a figure, never restate a direction differently from how it is stated, and never describe the partial current week as a finished one. If the numbers are thin, say so plainly and keep the ask small.
Write to the client, by first name, the way a coach who watched their week would talk. Warm, direct, specific, no lecture, no filler.
Never use clinical or certification language (no "corrective phase", no "activation", no "inhibit/lengthen/activate/integrate", no NASM terminology) — plain gym English only.
Plan changes are Dustin's call: you may suggest, never prescribe a new macro target or program as settled.`;
