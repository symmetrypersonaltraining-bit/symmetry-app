import test from "node:test";
import assert from "node:assert/strict";
import {
  addDaysISO,
  buildBrief,
  buildChanges,
  dayName,
  dedupeSessions,
  focusLine,
  normaliseProgram,
  scheduleDays,
  scheduleHeadline,
  weekStartOf,
  type BriefInput,
  type MovementFact,
  type Track,
} from "../../src/lib/weeklyBrief.ts";

const mv = (name: string, o: Partial<MovementFact> = {}): MovementFact => ({
  name,
  everLogged: true,
  lastWeekBest: null,
  priorBest: null,
  sessionsAtSameWeight: 0,
  ...o,
});

const tk = (program: string, phase: string | null = null): Track => ({ program, phase });

const base = (o: Partial<BriefInput> = {}): BriefInput => ({
  today: "2026-07-27",
  weekStart: "2026-07-26",
  clientName: "Robert Miller",
  thisWeekTracks: [tk("APT Correction", "Phase 2")],
  lastWeekTracks: [tk("APT Correction", "Phase 2")],
  thisWeek: [],
  lastWeekScheduled: 0,
  lastWeekCompleted: 0,
  movements: [],
  weeklyFocus: null,
  recentNotes: [],
  ...o,
});

// ---------- week math ----------

test("the week starts on Sunday, matching the rest of the app", () => {
  assert.equal(weekStartOf("2026-07-26"), "2026-07-26"); // a Sunday is its own start
  assert.equal(weekStartOf("2026-07-27"), "2026-07-26"); // Monday
  assert.equal(weekStartOf("2026-08-01"), "2026-07-26"); // Saturday, same week
  assert.equal(weekStartOf("2026-08-02"), "2026-08-02"); // next Sunday, new week
});

test("date math crosses months and years without drifting", () => {
  assert.equal(addDaysISO("2026-07-31", 1), "2026-08-01");
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(weekStartOf("2026-01-01"), "2025-12-28");
});

test("day names line up with the calendar", () => {
  assert.equal(dayName("2026-07-26"), "Sun");
  assert.equal(dayName("2026-07-31"), "Fri");
});

// ---------- program names ----------
// Every case below is a real program name off the live calendar.

test("a client's name is stripped off the end of their program", () => {
  assert.equal(
    normaliseProgram("Knee Stability & Strength — Bobbie", "Bobbie Page"),
    "Knee Stability & Strength"
  );
  assert.equal(
    normaliseProgram("Hip Replacement & Chronic Hip Pain Protocol — Lesly", "Lesly Spencer"),
    "Hip Replacement & Chronic Hip Pain Protocol"
  );
});

test("a client's name is stripped off the front too", () => {
  assert.equal(
    normaliseProgram("Robert Miller — 8-Week Block (Jun 2026)", "Robert Miller"),
    "8-Week Block (Jun 2026)"
  );
  assert.equal(normaliseProgram("Bobbie — Personal Workouts", "Bobbie Page"), "Personal Workouts");
});

test("a plain hyphen separator works the same as an em dash", () => {
  assert.equal(
    normaliseProgram("Lauren Standerfer - 8-Week Block (Jun 2026)", "Lauren Standefer"),
    "8-Week Block (Jun 2026)"
  );
});

test("a name on both ends comes off both ends", () => {
  assert.equal(
    normaliseProgram("Celeste Lennon — 8-Week Hip & Glute Block — Celeste", "Celeste Lennon"),
    "8-Week Hip & Glute Block"
  );
});

test("someone else's name in the title is left alone", () => {
  // This is a real row on Sarah's calendar — a program copied from Celeste and
  // never retitled. Only the Sarah on the end is hers, and the leftover Celeste
  // is exactly the kind of thing he'd want to notice.
  assert.equal(
    normaliseProgram("Celeste Lennon — 8-Week Hip & Glute Block — Sarah", "Sarah Prince"),
    "Celeste Lennon — 8-Week Hip & Glute Block"
  );
});

test("a middle segment that isn't a name survives", () => {
  assert.equal(
    normaliseProgram("Cardio — 20 Min Walk (LISS) — Christine", "Christine Latham"),
    "Cardio — 20 Min Walk (LISS)"
  );
});

test("a program with no name in it is untouched", () => {
  assert.equal(
    normaliseProgram("Asymmetrical Weight Shift & Lumbar Decompression", "Troy Schnitzler"),
    "Asymmetrical Weight Shift & Lumbar Decompression"
  );
  assert.equal(normaliseProgram("5-Day Bodybuilding Split", "Tyler Dorsett"), "5-Day Bodybuilding Split");
  assert.equal(
    normaliseProgram("8-Week APT + Ankle/Posterior Chain Combination", "Robby Burns"),
    "8-Week APT + Ankle/Posterior Chain Combination"
  );
});

test("stripping never leaves an empty program name", () => {
  assert.equal(normaliseProgram("Bobbie", "Bobbie Page"), "Bobbie");
  assert.equal(normaliseProgram("Solo Training — 3-Day", ""), "Solo Training — 3-Day");
});

// ---------- duplicate calendar rows ----------

test("the same session on the calendar twice counts once", () => {
  // Straight out of the live schedule: "20 min treadmill" is routinely doubled
  // up on a single date. Counting it twice would inflate every week.
  const out = dedupeSessions([
    { date: "2026-07-27", label: "20 min treadmill", done: false },
    { date: "2026-07-27", label: "20 min treadmill", done: false },
  ]);
  assert.equal(out.length, 1);
});

test("if either copy of a duplicate was completed, the session counts as done", () => {
  const out = dedupeSessions([
    { date: "2026-07-27", label: "Day 1", done: false },
    { date: "2026-07-27", label: "Day 1", done: true },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].done, true);
});

test("duplicates are matched past stray whitespace and casing", () => {
  const out = dedupeSessions([
    { date: "2026-07-27", label: "Day 1", done: false },
    { date: "2026-07-27", label: "  day 1  ", done: false },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, "Day 1"); // the first spelling wins, trimmed
});

test("the same label on two different days is two sessions", () => {
  const out = dedupeSessions([
    { date: "2026-07-27", label: "Daily Reset Walk", done: false },
    { date: "2026-07-28", label: "Daily Reset Walk", done: false },
  ]);
  assert.equal(out.length, 2);
});

test("sessions come back in date order however they arrived", () => {
  const out = dedupeSessions([
    { date: "2026-07-31", label: "Day 3", done: false },
    { date: "2026-07-27", label: "Day 1", done: false },
    { date: "2026-07-29", label: "Day 2", done: false },
  ]);
  assert.deepEqual(out.map((s) => s.label), ["Day 1", "Day 2", "Day 3"]);
});

// ---------- the schedule ----------

test("the headline counts the week and what's already done", () => {
  const input = base({
    thisWeek: [
      { date: "2026-07-27", label: "Day 1", done: true },
      { date: "2026-07-29", label: "Day 2", done: false },
      { date: "2026-07-31", label: "Day 3", done: false },
    ],
  });
  assert.equal(scheduleHeadline(input), "3 sessions this week · 1 done");
});

test("one session doesn't get pluralised, and no-progress omits the count", () => {
  const input = base({ thisWeek: [{ date: "2026-07-27", label: "Day 1", done: false }] });
  assert.equal(scheduleHeadline(input), "1 session this week");
});

test("an empty week says so rather than rendering an empty list", () => {
  assert.match(scheduleHeadline(base()), /Nothing on the schedule/);
});

test("the headline counts deduped sessions, not raw calendar rows", () => {
  const input = base({
    thisWeek: [
      { date: "2026-07-27", label: "20 min treadmill", done: false },
      { date: "2026-07-27", label: "20 min treadmill", done: false },
    ],
  });
  assert.equal(scheduleHeadline(input), "1 session this week");
});

test("the schedule groups by day so a ten-entry week stays readable", () => {
  // Celeste's shape: a daily walk plus the actual training days. Listed flat
  // this is an unreadable run-on; grouped it's four short rows.
  const input = base({
    thisWeek: [
      { date: "2026-07-27", label: "Daily Reset Walk", done: true },
      { date: "2026-07-27", label: "Day 1", done: true },
      { date: "2026-07-28", label: "Daily Reset Walk", done: false },
      { date: "2026-07-29", label: "Daily Reset Walk", done: false },
      { date: "2026-07-29", label: "Day 2", done: false },
    ],
  });
  const days = scheduleDays(input);
  assert.equal(days.length, 3);
  // Labels within a day are alphabetical — arbitrary, but stable, so the card
  // doesn't reshuffle itself between reads.
  assert.deepEqual(days[0], {
    date: "2026-07-27",
    day: "Mon",
    labels: ["Daily Reset Walk", "Day 1"],
    done: 2,
  });
  assert.equal(days[1].day, "Tue");
  assert.equal(days[1].done, 0);
});

test("a day with nothing on it is left out entirely", () => {
  const input = base({
    thisWeek: [
      { date: "2026-07-27", label: "Day 1", done: false },
      { date: "2026-07-31", label: "Day 3", done: false },
    ],
  });
  assert.deepEqual(scheduleDays(input).map((d) => d.day), ["Mon", "Fri"]);
});

// ---------- what changed ----------

test("a phase move is reported and leads", () => {
  const changes = buildChanges(
    base({
      thisWeekTracks: [tk("APT Correction", "Phase 3")],
      lastWeekTracks: [tk("APT Correction", "Phase 2")],
      movements: [mv("Leg Press", { everLogged: false })],
    })
  );
  assert.equal(changes[0].kind, "phase");
  assert.match(changes[0].text, /APT Correction: moved into Phase 3/);
  assert.match(changes[0].text, /last week was Phase 2/);
});

test("staying in the same phase is not news", () => {
  const changes = buildChanges(base());
  assert.ok(!changes.some((c) => c.kind === "phase"));
});

test("a client with no history last week isn't told they changed phase", () => {
  // First week in the app: no tracks last week at all, which is absence of
  // evidence, not a phase move.
  const changes = buildChanges(
    base({ thisWeekTracks: [tk("APT Correction", "Phase 1")], lastWeekTracks: [] })
  );
  assert.ok(!changes.some((c) => c.kind === "phase"));
});

test("a client on three programs only hears about the one that moved", () => {
  // The whole reason the track model exists. Pooling phase labels across
  // programs fired a phase-change alert every single week for these clients.
  const changes = buildChanges(
    base({
      thisWeekTracks: [
        tk("5-Day Split", "Phase 1"),
        tk("APT Correction", "Phase 3"),
        tk("Personal Workouts", null),
      ],
      lastWeekTracks: [
        tk("5-Day Split", "Phase 1"),
        tk("APT Correction", "Phase 2"),
        tk("Personal Workouts", null),
      ],
    })
  );
  const phases = changes.filter((c) => c.kind === "phase");
  assert.equal(phases.length, 1);
  assert.match(phases[0].text, /APT Correction/);
});

test("a program that only appeared this week reports nothing", () => {
  // A newly assigned program has no last-week phase to have moved from. Its
  // arrival shows up in the schedule; inventing a phase move for it would be a
  // false alarm right as he starts a session. (Renames are handled upstream by
  // normaliseProgram, so they match rather than landing here.)
  const changes = buildChanges(
    base({
      thisWeekTracks: [tk("Knee Stability & Strength", "P1"), tk("Personal Workouts", "Personal")],
      lastWeekTracks: [tk("Personal Workouts", "Personal")],
    })
  );
  assert.ok(!changes.some((c) => c.kind === "phase"));
});

test("a program with no phase label at all is never reported as moving", () => {
  const changes = buildChanges(
    base({
      thisWeekTracks: [tk("Personal Workouts", null)],
      lastWeekTracks: [tk("Personal Workouts", "Phase 1")],
    })
  );
  assert.ok(!changes.some((c) => c.kind === "phase"));
});

test("never-logged movements are named with the client's first name", () => {
  const changes = buildChanges(
    base({ movements: [mv("Pendulum Squat", { everLogged: false }), mv("Cable Row")] })
  );
  const fresh = changes.find((c) => c.kind === "new-movement")!;
  assert.equal(fresh.text, "New to Robert: Pendulum Squat — demo before loading.");
});

test("a long list of new movements is capped and counted", () => {
  const names = ["A", "B", "C", "D", "E", "F"];
  const changes = buildChanges(base({ movements: names.map((n) => mv(n, { everLogged: false })) }));
  const fresh = changes.find((c) => c.kind === "new-movement")!;
  assert.match(fresh.text, /A, B, C, D and 2 more/);
});

test("a real increase is reported with both weights", () => {
  const changes = buildChanges(
    base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 135 })] })
  );
  const up = changes.find((c) => c.kind === "progressed")!;
  assert.equal(up.text, "Up last week on Leg Press — 135 → 145 lb.");
});

test("the biggest jump wins and the rest are counted", () => {
  const changes = buildChanges(
    base({
      movements: [
        mv("Cable Row", { lastWeekBest: 90, priorBest: 85 }),
        mv("Leg Press", { lastWeekBest: 200, priorBest: 145 }),
        mv("DB Press", { lastWeekBest: 55, priorBest: 50 }),
      ],
    })
  );
  const up = changes.find((c) => c.kind === "progressed")!;
  assert.match(up.text, /Leg Press — 145 → 200 lb \(and 2 others\)/);
});

test("a first-ever logged weight is not called progress", () => {
  // Nothing to beat. Reporting this as an increase is the bug the celebration
  // PR check already guards against.
  const changes = buildChanges(base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: null })] }));
  assert.ok(!changes.some((c) => c.kind === "progressed"));
});

test("matching a previous best is not progress either", () => {
  const changes = buildChanges(base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 145 })] }));
  assert.ok(!changes.some((c) => c.kind === "progressed"));
});

test("three sessions at the same weight is a stall", () => {
  const changes = buildChanges(
    base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 145, sessionsAtSameWeight: 3 })] })
  );
  const stuck = changes.find((c) => c.kind === "stalled")!;
  assert.match(stuck.text, /Leg Press has sat at 145 lb for 3 sessions/);
});

test("two sessions at the same weight is just a normal week", () => {
  const changes = buildChanges(
    base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 145, sessionsAtSameWeight: 2 })] })
  );
  assert.ok(!changes.some((c) => c.kind === "stalled"));
});

test("a missed session last week is reported", () => {
  const changes = buildChanges(base({ lastWeekScheduled: 3, lastWeekCompleted: 2 }));
  const a = changes.find((c) => c.kind === "adherence")!;
  assert.equal(a.text, "Last week: 2 of 3 done — 1 missed.");
});

test("a perfect week gets no adherence line", () => {
  const changes = buildChanges(base({ lastWeekScheduled: 3, lastWeekCompleted: 3 }));
  assert.ok(!changes.some((c) => c.kind === "adherence"));
});

test("a client with nothing scheduled last week is not marked behind", () => {
  const changes = buildChanges(base({ lastWeekScheduled: 0, lastWeekCompleted: 0 }));
  assert.ok(!changes.some((c) => c.kind === "adherence"));
});

test("the brief never runs long", () => {
  const changes = buildChanges(
    base({
      thisWeekTracks: [tk("5-Day Split", "Phase 3"), tk("APT Correction", "Phase 2")],
      lastWeekTracks: [tk("5-Day Split", "Phase 2"), tk("APT Correction", "Phase 1")],
      lastWeekScheduled: 3,
      lastWeekCompleted: 1,
      movements: [
        mv("New One", { everLogged: false }),
        mv("Leg Press", { lastWeekBest: 200, priorBest: 145 }),
        mv("Cable Row", { lastWeekBest: 90, priorBest: 90, sessionsAtSameWeight: 5 }),
      ],
    })
  );
  assert.ok(changes.length <= 5, `got ${changes.length} lines`);
});

test("a quiet week produces no change lines at all", () => {
  // Silence is the signal: nothing moved, so nothing is said.
  assert.deepEqual(buildChanges(base({ movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 145 })] })), []);
});

// ---------- the focus line ----------

test("the Week Ahead focus wins, and is tagged as the client's, not his own note", () => {
  // clients.weekly_focus is written FROM the Week Ahead and shown TO the client
  // on their home screen — live rows read like "You hit 5 of your 10 sessions
  // last week…". It outranks anything derived, but the card has to label it so
  // it doesn't read as a coaching note Dustin wrote to himself.
  const input = base({
    weeklyFocus: "Ankle mobility every session.",
    movements: [mv("Leg Press", { lastWeekBest: 145, priorBest: 145, sessionsAtSameWeight: 4 })],
  });
  const focus = focusLine(input, buildChanges(input))!;
  assert.equal(focus.text, "Ankle mobility every session.");
  assert.equal(focus.source, "week-ahead");
});

test("a blank written focus falls through instead of showing empty", () => {
  const input = base({ weeklyFocus: "   ", recentNotes: [{ note: "Watch the left knee.", created_at: "2026-07-24" }] });
  assert.match(focusLine(input, buildChanges(input))!.text, /Watch the left knee/);
});

test("with no written focus, a stall is what to work on", () => {
  const input = base({ movements: [mv("Cable Row", { lastWeekBest: 90, priorBest: 90, sessionsAtSameWeight: 4 })] });
  assert.match(focusLine(input, buildChanges(input))!.text, /Cable Row has sat at 90 lb/);
});

test("a new phase focuses on quality before load", () => {
  const input = base({
    thisWeekTracks: [tk("APT Correction", "Phase 3")],
    lastWeekTracks: [tk("APT Correction", "Phase 2")],
  });
  assert.match(focusLine(input, buildChanges(input))!.text, /movement quality before adding load/);
});

test("new movements focus on the pattern before the weight", () => {
  const input = base({ movements: [mv("Pendulum Squat", { everLogged: false })] });
  assert.match(focusLine(input, buildChanges(input))!.text, /coach the pattern first/);
});

test("with nothing derived, the last trainer note carries the line", () => {
  const input = base({ recentNotes: [{ note: "Shoulder felt better after the band work.", created_at: "2026-07-24" }] });
  assert.match(focusLine(input, buildChanges(input))!.text, /Shoulder felt better/);
});

test("the trainer note is tagged as a note and carries no prefix of its own", () => {
  // The card supplies the "Last note" label and the quote marks, so the text
  // here is the note verbatim — anything else double-labels it.
  const input = base({ recentNotes: [{ note: "Shoulder felt better after the band work.", created_at: "2026-07-24" }] });
  const focus = focusLine(input, buildChanges(input))!;
  assert.equal(focus.source, "note");
  assert.equal(focus.text, "Shoulder felt better after the band work.");
});

test("a derived line is tagged derived, not passed off as something he wrote", () => {
  const input = base({ movements: [mv("Cable Row", { lastWeekBest: 90, priorBest: 90, sessionsAtSameWeight: 4 })] });
  assert.equal(focusLine(input, buildChanges(input))!.source, "derived");
});

test("with nothing at all to say, the focus is null rather than filler", () => {
  const input = base();
  assert.equal(focusLine(input, buildChanges(input)), null);
});

// ---------- the assembled brief ----------

test("a brief with nothing in it reports itself empty so the card can hide", () => {
  const brief = buildBrief(base());
  assert.equal(brief.empty, true);
  assert.deepEqual(brief.changes, []);
  assert.equal(brief.focus, null);
  assert.deepEqual(brief.days, []);
});

test("a week with sessions is never empty, even when nothing changed", () => {
  // The schedule alone is worth showing — it's the answer to "what are we doing
  // today" that Dustin opens the card for.
  const brief = buildBrief(base({ thisWeek: [{ date: "2026-07-27", label: "Day 1", done: false }] }));
  assert.equal(brief.empty, false);
  assert.equal(brief.days.length, 1);
  assert.deepEqual(brief.days[0].labels, ["Day 1"]);
});

test("a full brief carries the tracks, schedule, changes and focus", () => {
  const brief = buildBrief(
    base({
      thisWeekTracks: [tk("APT Correction", "Phase 3")],
      lastWeekTracks: [tk("APT Correction", "Phase 2")],
      thisWeek: [
        { date: "2026-07-27", label: "Day 1", done: false },
        { date: "2026-07-29", label: "Day 2", done: false },
      ],
      lastWeekScheduled: 3,
      lastWeekCompleted: 2,
      movements: [mv("Pendulum Squat", { everLogged: false })],
    })
  );
  assert.deepEqual(brief.tracks, [{ program: "APT Correction", phase: "Phase 3" }]);
  assert.equal(brief.weekStart, "2026-07-26");
  assert.match(brief.headline, /2 sessions this week/);
  assert.deepEqual(brief.days.map((d) => d.day), ["Mon", "Wed"]);
  assert.equal(brief.changes[0].kind, "phase");
  assert.ok(brief.changes.some((c) => c.kind === "adherence"));
  assert.ok(brief.focus);
  assert.equal(brief.empty, false);
});

test("a multi-program client's tracks all survive into the brief", () => {
  // The card only shows the subheader when there's exactly one, but the AI line
  // and any future surface need the full set.
  const brief = buildBrief(
    base({ thisWeekTracks: [tk("5-Day Split", "Phase 1"), tk("APT Correction", "Phase 2")] })
  );
  assert.equal(brief.tracks.length, 2);
});
