// GOAL MATHS. One implementation, used by the card, the chart AND the coach.
//
// That is the whole reason this file exists rather than the numbers being
// computed where they are displayed. If the card can say "on track" while the
// chart draws a line landing short, one of them is lying and the client has no
// way to tell which — and the one thing a progress screen cannot afford is to
// be caught being wrong about a number the person already knows.
//
// ── THE TWO DECISIONS THAT MATTER, BOTH MADE FROM REAL DATA ───────────────
//
// 1. RATE COMES FROM THE LAST SIX WEEKS — AND A STALL OVERRIDES IT.
//
//    Lauren Standefer, live rows: 158 (4 May), 153, 150.2, 146.2 (20 Jul),
//    146.2 (5 Aug). Run the numbers at different window sizes and the answer
//    inverts:
//
//      lifetime      -0.89 lb/wk   lands 138.2   ARRIVES
//      last 6 weeks  -0.78 lb/wk   lands 139.2   ARRIVES
//      last 4 weeks   0.00 lb/wk   lands 146.2   MISSES BY 6
//
//    Neither is wrong. The six-week trend is the more stable estimate; the flat
//    four weeks is the most recent evidence. A screen that silently picks one
//    is misleading whichever it picks — "on track, arriving 8 Oct" is
//    technically defensible and practically a lie to somebody who has not moved
//    in sixteen days.
//
//    So both are computed, and A STALL WINS. A projection assumes the trend
//    continues; two weeks of no movement at all is direct evidence that it has
//    stopped, and evidence beats extrapolation. The copy can then say the true
//    thing, which is neither of the one-liners: "your six-week trend would get
//    you there, but you haven't moved in sixteen days."
//
//    This was caught by the test, not by the design. The mock-up asserted her
//    recent rate was zero — true only for a window shorter than the one the
//    code uses.
//
// 2. UNDER FIVE WEIGH-INS, OR UNDER A MONTH OF SPAN, THERE IS NO PROJECTION.
//
//    Robert Miller, live rows: four readings over seven weeks going
//    266 → 267 → 266.2 → 263. That is noise. A dashed line drawn through it is
//    a confident answer to a question the data cannot answer, and the first
//    time it is wrong the client stops believing the screen — including the
//    parts that were right.
//
//    The honest output is "log a few more and I can tell you where this lands",
//    which also happens to be the single most useful thing the app could ask
//    them for. There are 95 weigh-ins across 23 clients; the real prerequisite
//    for this whole feature is the scale, not the chart.

export type GoalMetric = "weight" | "body_fat_pct" | "lean_mass";

export interface Reading {
  /** ISO date, yyyy-mm-dd. */
  date: string;
  value: number;
}

export interface Goal {
  id: string;
  metric: GoalMetric;
  targetValue: number;
  targetDate: string;
  startValue: number | null;
  startDate: string | null;
  setBy: "trainer" | "client";
  status: "proposed" | "active" | "hit" | "rolled" | "declined" | "closed";
}

/**
 * `overshooting` — this pace does not miss the target, it sails past it.
 *
 * Dustin, 17 Aug: goal 235 lb, projection landing at 248.8, chip reading "On
 * track". The status had no way to say otherwise — for a gain, "behind" meant
 * projected BELOW target, so 13.8 lb past it was indistinguishable from
 * arriving on time.
 *
 * It matters more on a cut than a bulk. A client projected to blow 15 lb THROUGH
 * their fat-loss target is under-eating badly, and the app was calling that on
 * track. One state covers both directions: past the target is past the target.
 */
export type GoalStatus = "on_track" | "behind" | "overshooting" | "too_thin" | "hit";

export interface GoalAnalysis {
  now: number;
  start: number;
  /** Signed, per week, from the recent window. Negative = falling. */
  rate: number | null;
  weeksLeft: number;
  /** Positive = still that far to go, in the direction of travel. */
  remaining: number;
  /** The per-week rate needed from today to arrive on time. */
  needRate: number;
  /** Where the current rate lands on the target date. Null when not projectable. */
  projected: number | null;
  /** When the current rate would arrive, or null. */
  arrivesOn: string | null;
  /** 0-100. */
  percent: number;
  /** Too few readings, or too short a span, to project honestly. */
  thin: boolean;
  status: GoalStatus;
  daysSinceLastReading: number;
  /** True when the metric is going the wrong way, or not moving. */
  stalled: boolean;
  /** Consecutive days the value has not moved at all. */
  flatDays: number;
  /**
   * The six-week trend, kept even when a stall overrules it.
   *
   * Lauren's card needs to say BOTH true things — "your six-week trend would
   * get you there, but you haven't moved in sixteen days" — and it cannot do
   * that if the stall has already overwritten the only rate on the object.
   */
  trendRate: number | null;
  /** Where the six-week trend alone would land, ignoring the stall. */
  trendProjected: number | null;
}

const DAY = 86_400_000;
const RECENT_WINDOW_DAYS = 42;
/**
 * No movement at all for this long counts as a stall, whatever the longer trend
 * says. Two weeks: long enough not to fire on normal water-weight noise between
 * two weigh-ins, short enough to catch a plateau while it is still worth
 * mentioning.
 */
export const STALL_DAYS = 14;
/** Below either of these, no line gets drawn. See the header. */
export const MIN_READINGS_TO_PROJECT = 5;
export const MIN_SPAN_DAYS_TO_PROJECT = 30;

const ms = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Rate per week over the recent window. Null when it cannot be computed. */
export function recentRate(readings: Reading[], windowDays = RECENT_WINDOW_DAYS): number | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort((a, b) => ms(a.date) - ms(b.date));
  const last = sorted[sorted.length - 1];
  const cutoff = ms(last.date) - windowDays * DAY;
  let win = sorted.filter((r) => ms(r.date) >= cutoff);
  // If the window catches only the final reading, fall back to the last two —
  // a client who weighs in monthly still deserves a rate, and two points a long
  // way apart is a worse estimate than two points close together but it is not
  // a guess.
  if (win.length < 2) win = sorted.slice(-2);
  const a = win[0];
  const b = win[win.length - 1];
  const weeks = (ms(b.date) - ms(a.date)) / (7 * DAY);
  if (weeks <= 0) return null;
  return (b.value - a.value) / weeks;
}

/**
 * Everything the card, the chart and the coach need, computed once.
 *
 * `today` is passed in rather than read from the clock so this is testable and
 * so a server render and a client render of the same screen cannot disagree
 * across midnight.
 */
export function analyseGoal(goal: Goal, readings: Reading[], today: string): GoalAnalysis | null {
  const sorted = [...readings].sort((a, b) => ms(a.date) - ms(b.date));
  if (!sorted.length) return null;

  const last = sorted[sorted.length - 1];
  const now = last.value;
  const start = goal.startValue ?? sorted[0].value;
  const startDate = goal.startDate ?? sorted[0].date;

  const spanDays = (ms(last.date) - ms(sorted[0].date)) / DAY;
  const thin = sorted.length < MIN_READINGS_TO_PROJECT || spanDays < MIN_SPAN_DAYS_TO_PROJECT;

  const rate = recentRate(sorted);
  const weeksLeft = Math.max(0, (ms(goal.targetDate) - ms(today)) / (7 * DAY));

  // Signed toward the target, so "remaining" is positive whichever direction
  // the client is travelling. A lean-mass goal goes UP; a weight goal goes
  // down; the arithmetic below must not care which.
  const goingDown = start >= goal.targetValue;
  const remaining = goingDown ? now - goal.targetValue : goal.targetValue - now;
  const needRate = weeksLeft > 0 ? remaining / weeksLeft : Infinity;

  // How long the number has literally not changed. Computed BEFORE `stalled`,
  // because it is allowed to overrule the trend.
  let flatDays = 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].value !== sorted[i - 1].value) break;
    flatDays = Math.round((ms(sorted[sorted.length - 1].date) - ms(sorted[i - 1].date)) / DAY);
  }

  // A stalled client's projection is FLAT, not the six-week slope. Drawing the
  // slope would put a line on the chart arriving on time while the status chip
  // says behind — the exact card-versus-chart contradiction this file exists to
  // prevent.
  const projRate = rate == null ? null : flatDays >= STALL_DAYS ? 0 : rate;
  const projected = thin || projRate == null ? null : now + projRate * weeksLeft;

  // Progress toward the goal from where they started — SIGNED toward the
  // target, so moving the wrong way is 0% and not credit.
  //
  // Dustin, 17 Aug: goal changed to GAIN to 235 lb, start_value still 212 from
  // the cut it replaced, currently 207.2. `Math.abs(start - now)` made that 4.8
  // lb in the WRONG direction read as "21% of the way there". He has not gained
  // an ounce toward it; he is further from the target than the day the goal
  // began, and the bar said a fifth done.
  //
  // Absolute distance answers "how far have you moved", which is only the same
  // question as "how far along are you" while you are moving the right way.
  const total = Math.abs(start - goal.targetValue);
  const done = goingDown ? start - now : now - start;
  const percent = total === 0 ? 100 : Math.max(0, Math.min(100, (done / total) * 100));

  // Moving the right way? The six-week trend says one thing; a flat fortnight
  // says another, and the flat fortnight wins — see the header. A projection
  // assumes the trend continues, and no movement is evidence it has stopped.
  const movingRightWay = rate != null && (goingDown ? rate < 0 : rate > 0);
  const stalled = rate == null || !movingRightWay || flatDays >= STALL_DAYS;

  const arrivesOn =
    !thin && rate != null && movingRightWay && flatDays < STALL_DAYS && remaining > 0
      ? iso(ms(today) + (remaining / Math.abs(rate)) * 7 * DAY)
      : null;

  // How far past the target counts as overshooting rather than arriving.
  //
  // A QUARTER of the journey, floored at one unit. Proportional because 2 lb
  // past a 30 lb goal is noise and 2 percentage points past a 5-point body-fat
  // goal is not.
  //
  // A quarter rather than something tighter because `rate` is an estimate from
  // a handful of weigh-ins projected over months, and the error in it grows
  // with the horizon. At 10% a real lean-mass goal in the fixtures — 140 → 155,
  // projecting to 156.6 nine weeks out — tripped the alarm by 0.1 lb. Crying
  // overshoot on a rounding difference is how a status everyone eventually
  // ignores gets made.
  //
  // For scale, the case this was built for: projected 248.8 against a 235
  // target on a 23 lb goal — 60% of the journey past it, not 10%.
  const overshootMargin = Math.max(1, total * 0.25);
  const overshoot =
    projected != null &&
    (goingDown ? projected < goal.targetValue - overshootMargin : projected > goal.targetValue + overshootMargin);

  let status: GoalStatus;
  if (remaining <= 0) status = "hit";
  else if (thin) status = "too_thin";
  else if (stalled) status = "behind";
  else if (projected != null && (goingDown ? projected > goal.targetValue + 0.5 : projected < goal.targetValue - 0.5))
    status = "behind";
  // After "behind", never before it: a stalled or short projection is the more
  // urgent thing to say, and the two cannot both be true anyway.
  else if (overshoot) status = "overshooting";
  else status = "on_track";

  return {
    now, start,
    rate: rate == null ? null : round1(rate),
    weeksLeft: Math.round(weeksLeft * 10) / 10,
    remaining: round1(remaining),
    needRate: Number.isFinite(needRate) ? round1(needRate) : Infinity,
    projected: projected == null ? null : round1(projected),
    arrivesOn,
    percent: Math.round(percent),
    thin, status,
    trendRate: rate == null ? null : round1(rate),
    trendProjected: thin || rate == null ? null : round1(now + rate * weeksLeft),
    daysSinceLastReading: Math.round((ms(today) - ms(last.date)) / DAY),
    stalled,
    flatDays,
  };
}

export const UNITS: Record<GoalMetric, string> = {
  weight: "lb",
  body_fat_pct: "%",
  lean_mass: "lb",
};

export const METRIC_LABEL: Record<GoalMetric, string> = {
  weight: "Body weight",
  body_fat_pct: "Body fat",
  lean_mass: "Lean mass",
};

/**
 * Roughly how many fewer calories a day a rate change implies.
 *
 * Deliberately rough, and only ever used for a WEIGHT goal. 3,500 kcal per
 * pound is a rule of thumb, not physiology, and it is offered as "roughly"
 * everywhere it appears — a client who takes it as an exact prescription is
 * being misled by the false precision, not by the number.
 */
export function kcalPerDayFor(lbPerWeek: number): number {
  return Math.round((Math.abs(lbPerWeek) * 3500) / 7 / 25) * 25;
}

/** How long since the last reading counts as "worth asking for one". */
export const WEIGH_IN_NUDGE_DAYS = 7;
