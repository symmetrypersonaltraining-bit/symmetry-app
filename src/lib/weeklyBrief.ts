// The weekly programming brief — the facts, derived.
//
// Feedback 117353cd: "Give trainer app a summary on first session of each
// client for the week of what the programming looks like that week, any
// changes, focus on, etc."
//
// Everything here is PURE so it can be unit-tested. The route does the
// fetching; this file turns the rows into the handful of sentences worth
// reading while a client is warming up. The AI line the route adds on top is
// garnish — the card must stand on its own if the model call fails.
//
// Editorial rule, and the reason this isn't just a dump: a brief that lists
// everything gets skimmed and then ignored. Each check has to earn its line,
// so the thresholds below are deliberately conservative and the output is
// capped. Silence means "nothing changed" — which is itself information.
//
// Shaped against the LIVE schedule, which is messier than the data model
// suggests: a client can be running three programs at once (a 5-day split, a
// corrective track and a personal-workout program), the same session can be on
// the calendar twice, and daily walk/treadmill rows mean a "week" is routinely
// ten-plus entries. So the schedule is grouped by day rather than listed flat,
// and a phase move is only reported per-program, never from a bare pool of
// phase labels — otherwise a multi-program client gets a phase-change alert
// every single week.
//
// Week runs SUNDAY → SATURDAY, matching TrainerWeekDigest and the rest of the
// app. Dates are Central Time ISO strings ("2026-07-31") throughout.

export function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function addDaysISO(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDaysISO(dateStr, -dow);
}

export function dayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export interface WeekSession {
  date: string;
  label: string;
  done: boolean;
}

/** One program the client is running, and the phase they're in on it. */
export interface Track {
  program: string;
  phase: string | null;
}

// Live program names carry the client's name on one end or both — "Knee
// Stability & Strength — Bobbie", "Robert Miller — 8-Week Block (Jun 2026)",
// "Cardio — 20 Min Walk (LISS) — Christine". In a brief that is already headed
// "This week for Bobbie" that's noise, and a mid-week rename would otherwise
// read as a different program week over week. So strip it — but only when the
// segment really is their name.
const NAME_SEP = /\s+[—–-]\s+/;
const NAME_WORD = /^[a-z'’-]+$/;

function isClientName(segment: string, nameParts: Set<string>): boolean {
  const toks = segment.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length || toks.length > 3) return false;
  // Every token has to look like a name (no digits, no "8-Week", no "(Jun
  // 2026)"), and at least one has to actually be theirs — "Celeste Lennon —
  // 8-Week Hip & Glute Block — Sarah" is a real row on Sarah's calendar, and
  // only the Sarah on the end should come off.
  if (!toks.every((t) => NAME_WORD.test(t))) return false;
  return toks.some((t) => nameParts.has(t));
}

export function normaliseProgram(raw: string, clientName?: string | null): string {
  const original = (raw || "").trim();
  const parts = new Set((clientName || "").toLowerCase().split(/\s+/).filter(Boolean));
  if (!original || !parts.size) return original;

  let name = original;
  // Twice, so a name on both ends comes off.
  for (let pass = 0; pass < 2; pass++) {
    const segs = name.split(NAME_SEP);
    if (segs.length < 2) break;
    if (isClientName(segs[segs.length - 1], parts)) name = segs.slice(0, -1).join(" — ");
    else if (isClientName(segs[0], parts)) name = segs.slice(1).join(" — ");
    else break;
  }
  return name.trim() || original;
}

// One movement scheduled this week, with the history that matters for it.
export interface MovementFact {
  name: string;
  everLogged: boolean;
  /** Best working weight in the last completed week, lb. null = not trained. */
  lastWeekBest: number | null;
  /** Best working weight BEFORE that week, lb. null = no earlier history. */
  priorBest: number | null;
  /** Consecutive recent sessions at the same top weight. */
  sessionsAtSameWeight: number;
}

export interface BriefInput {
  today: string;
  weekStart: string;
  clientName: string;
  thisWeekTracks: Track[];
  lastWeekTracks: Track[];
  thisWeek: WeekSession[];
  lastWeekScheduled: number;
  lastWeekCompleted: number;
  movements: MovementFact[];
  weeklyFocus: string | null;
  /** Trainer notes written in the last 14 days, newest first. */
  recentNotes: { note: string; created_at: string }[];
}

export type ChangeKind = "phase" | "new-movement" | "progressed" | "stalled" | "adherence";
export interface Change {
  kind: ChangeKind;
  text: string;
}

/** The week's schedule, one entry per calendar day that has anything on it. */
export interface BriefDay {
  date: string;
  day: string;
  labels: string[];
  done: number;
}

const MAX_CHANGES = 5;
const STALL_SESSIONS = 3;
const MAX_NEW_NAMES = 4;

/** Duplicate calendar rows are common; the same session twice isn't two sessions. */
export function dedupeSessions(sessions: WeekSession[]): WeekSession[] {
  const seen = new Map<string, WeekSession>();
  for (const s of sessions) {
    const key = `${s.date}|${s.label.trim().toLowerCase()}`;
    const prev = seen.get(key);
    // Keep the completed copy if either copy was completed.
    if (!prev) seen.set(key, { ...s, label: s.label.trim() });
    else if (s.done && !prev.done) seen.set(key, { ...prev, done: true });
  }
  return Array.from(seen.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label.localeCompare(b.label)));
}

export function scheduleDays(input: BriefInput): BriefDay[] {
  const byDate = new Map<string, BriefDay>();
  for (const s of dedupeSessions(input.thisWeek)) {
    if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, day: dayName(s.date), labels: [], done: 0 });
    const d = byDate.get(s.date)!;
    d.labels.push(s.label);
    if (s.done) d.done++;
  }
  return Array.from(byDate.values());
}

/** "8 sessions this week · 3 done" — the one line above the day-by-day list. */
export function scheduleHeadline(input: BriefInput): string {
  const sessions = dedupeSessions(input.thisWeek);
  if (!sessions.length) return "Nothing on the schedule this week yet.";
  const done = sessions.filter((s) => s.done).length;
  return `${sessions.length} session${sessions.length === 1 ? "" : "s"} this week${done ? ` · ${done} done` : ""}`;
}

export function buildChanges(input: BriefInput): Change[] {
  const out: Change[] = [];

  // 1. Phase moves, matched PER PROGRAM. A client on three programs has three
  //    phase labels in play at once, so comparing a pool of labels week over
  //    week fires constantly and means nothing. A program that was renamed or
  //    isn't on both weeks simply reports nothing — silence beats a false
  //    alarm when he's about to start a session.
  const lastPhaseOf = new Map<string, string | null>();
  for (const t of input.lastWeekTracks) if (!lastPhaseOf.has(t.program)) lastPhaseOf.set(t.program, t.phase);
  for (const t of input.thisWeekTracks) {
    if (!t.phase || !lastPhaseOf.has(t.program)) continue;
    const was = lastPhaseOf.get(t.program);
    if (!was || was === t.phase) continue;
    out.push({
      kind: "phase",
      text: `${t.program}: moved into ${t.phase} — last week was ${was}.`,
    });
  }

  // 2. Movements they've never done. These are the ones that need a demo and a
  //    conservative first load, so they're worth naming even when nothing else
  //    changed. Capped at four names — past that it's a new program, and the
  //    phase line above already said so.
  const fresh = input.movements.filter((m) => !m.everLogged).map((m) => m.name);
  if (fresh.length) {
    const shown = fresh.slice(0, MAX_NEW_NAMES);
    const more = fresh.length - shown.length;
    out.push({
      kind: "new-movement",
      text: `New to ${input.clientName.split(" ")[0]}: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""} — demo before loading.`,
    });
  }

  // 3. Where they went up last week. Only a real increase counts — matching a
  //    previous best is not progress, and a first-ever logged weight has
  //    nothing to beat (same rule the celebration PR check uses).
  const up = input.movements
    .filter((m) => m.lastWeekBest != null && m.priorBest != null && m.lastWeekBest > m.priorBest)
    .sort((a, b) => (b.lastWeekBest! - b.priorBest!) - (a.lastWeekBest! - a.priorBest!));
  if (up.length) {
    const m = up[0];
    const rest = up.length - 1;
    out.push({
      kind: "progressed",
      text: `Up last week on ${m.name} — ${m.priorBest} → ${m.lastWeekBest} lb${rest > 0 ? ` (and ${rest} other${rest === 1 ? "" : "s"})` : ""}.`,
    });
  }

  // 4. Where they're stuck. Three sessions at the same top weight is the point
  //    where it's a plateau rather than a normal week off.
  const stuck = input.movements
    .filter((m) => m.sessionsAtSameWeight >= STALL_SESSIONS && m.lastWeekBest != null)
    .sort((a, b) => b.sessionsAtSameWeight - a.sessionsAtSameWeight);
  if (stuck.length) {
    const m = stuck[0];
    out.push({
      kind: "stalled",
      text: `${m.name} has sat at ${m.lastWeekBest} lb for ${m.sessionsAtSameWeight} sessions — push it or change the stimulus.`,
    });
  }

  // 5. Last week's attendance, but only when it's actually news. A full week
  //    doesn't need a line, and a client with nothing scheduled isn't behind.
  const { lastWeekScheduled, lastWeekCompleted } = input;
  if (lastWeekScheduled > 0 && lastWeekCompleted < lastWeekScheduled) {
    const missed = lastWeekScheduled - lastWeekCompleted;
    out.push({
      kind: "adherence",
      text: `Last week: ${lastWeekCompleted} of ${lastWeekScheduled} done — ${missed} missed.`,
    });
  }

  return out.slice(0, MAX_CHANGES);
}

/**
 * Where the focus line came from. The card labels each differently, and it
 * matters: `weeklyFocus` is the Week Ahead focus, which is written in the
 * CLIENT's voice and shown on the client's own home screen ("You hit 5 of your
 * 10 sessions last week…"). Presenting that to the coach unlabelled would read
 * as a coaching instruction he wrote to himself, which it isn't.
 */
export type FocusSource = "week-ahead" | "derived" | "note";
export interface Focus {
  text: string;
  source: FocusSource;
}

// What to focus on. What Dustin already set for the week always wins — the app
// should never talk over the coach. Otherwise fall back to the most useful
// derived signal, and if there isn't one, say nothing rather than filling space.
export function focusLine(input: BriefInput, changes: Change[]): Focus | null {
  if (input.weeklyFocus && input.weeklyFocus.trim()) {
    return { text: input.weeklyFocus.trim(), source: "week-ahead" };
  }
  const stalled = changes.find((c) => c.kind === "stalled");
  if (stalled) return { text: stalled.text, source: "derived" };
  const phase = changes.find((c) => c.kind === "phase");
  if (phase) {
    return { text: "First week of a new phase — watch movement quality before adding load.", source: "derived" };
  }
  const fresh = changes.find((c) => c.kind === "new-movement");
  if (fresh) {
    return { text: "New movements this week — coach the pattern first, load second.", source: "derived" };
  }
  const note = input.recentNotes[0];
  if (note?.note?.trim()) return { text: note.note.trim().slice(0, 140), source: "note" };
  return null;
}

export interface Brief {
  weekStart: string;
  clientName: string;
  /** Shown in the card subheader only when there's exactly one. */
  tracks: Track[];
  headline: string;
  days: BriefDay[];
  changes: Change[];
  focus: Focus | null;
  /** True when there is genuinely nothing worth reading. */
  empty: boolean;
}

export function buildBrief(input: BriefInput): Brief {
  const changes = buildChanges(input);
  const focus = focusLine(input, changes);
  const days = scheduleDays(input);
  return {
    weekStart: input.weekStart,
    clientName: input.clientName,
    tracks: input.thisWeekTracks,
    headline: scheduleHeadline(input),
    days,
    changes,
    focus,
    empty: !changes.length && !focus && !days.length,
  };
}
