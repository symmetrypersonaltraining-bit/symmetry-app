# Screen-by-screen walkthrough — how every page is SUPPOSED to work

**Started 3 Sep 2026, with Dustin, live.**

This is the companion to `FEATURE-AUDIT.md`. That one asks "does it work?" — this
one answers the question underneath it: **what is this screen actually for, and
what should happen when you use it?** Written from Dustin's own words as we walk
it, one feature at a time, not from what the code appears to do.

That distinction is the whole point. Most of the bad work on this app came from
building what the code implied instead of what he meant.

## Format

Each screen gets:

- **What it is for** — in his words
- **Every feature on it**, each with: what should happen · what actually happens ·
  verdict
- **Decisions** — anything settled while walking it, so it is never re-litigated

Verdicts: ✅ right · ⚠️ works but wrong · ❌ broken · 🚫 missing · 🗑 retire

## Screens to cover (39)

CLIENT: home · workout · workout/[dayId] · nutrition · recipes · progress ·
schedule · messages · log · log-bodyfat · profile · settings · onboarding ·
welcome · tutorial · assessment · movement

TRAINER: clients · clients/[clientId] · clients/[clientId]/program ·
clients/[clientId]/day/[dayId] · clients/notes · library · library/exercises ·
library/programs · library/videos · library/workouts · payments · schedule ·
schedule/proposals · progress · settings/ai-health · settings/data-health ·
movement/results · movement/testers

PREVIEW: client-preview and its four sub-screens

---

## Screen 1 — Client home  ·  walked 3 Sep 2026

**What it is for:** the first thing a client sees. Am I keeping up, what am I
doing today, how am I trending.

| feature | verdict | notes |
|---|---|---|
| Load speed | ✅ | "Everything definitely loads faster" after the five-query fix |
| Weight shown | ✅ | 205, logged that morning, correct everywhere |
| **This Week / adherence %** | ❌ → fixed | counted all 7 days; now counts only days due so far |
| **Card order** | ⚠️ → fixed | This Week now sits directly under the streak |
| **Add workout button** | 🗑 → removed | duplicate of the Workout tab's button |
| Today's Workout card | ✅ | "finalized" |
| Challenge + group cards | ✅ | leave as is for now |
| **Second "This week" card** | ⚠️ → renamed | now "Weekly Focus" |
| Weekly Focus numbers + focus line | ✅ | |
| **Nutrition % on that card** | ⚠️ OPEN | logic to change — implementing at the Nutrition tab so both places move together |
| Today's Nutrition | ✅ | |
| Progress charts | ✅ | |
| **AI Insights card** | 🗑 → removed | pure placeholder; no data, no logic, trainer-only, promised a feature that does not exist |
| **Auto-posting PRs to the group** | ⚠️ OPEN | make opt-in — implementing at Messages |

### Decisions

- **Adherence is measured against what is DUE, not the calendar week.** Today's
  sessions count from the start of the day. Past weeks count all seven days;
  future weeks show no percentage at all.
- **Nothing posts to the group automatically.** "That group chat is getting way
  too cluttered... I don't want anything automatically going in there." PRs and
  finished workouts become opt-in, client-initiated.
- **Two cards may never share a title.**

### Open question for Dustin

Moving This Week to the top pushes the **payment notification banner** below it.
Fine, or should payment notices stay above everything?

---

## Working rule for this walkthrough

Settled 3 Sep, before screen 1:

**Walk page by page. Capture decisions wherever they surface. Only change a page
we have already walked.**

A page-specific fix is made while we are on that page. Anything whose logic is
shared with a screen we have not reached yet is captured and built when we get
there, so both halves change in one commit rather than two half-changes. We
never edit a page that has not been walked — that is how the code's intent got
substituted for Dustin's, repeatedly.

---

### Click inventory — screen 1, client home

Pulled from the code, not from memory, so nothing is missed. Every interactive
element on this screen. Tap each, record what happens, set a verdict.

**This is also the tutorial script.** "What happens when you tap this" is the
only thing a tutorial ever needs to say, so the column below becomes tutorial
copy directly rather than being written again later.

| # | control | where | should do | actual | verdict |
|---|---|---|---|---|---|
| 1 | Payment notice **✕ dismiss** | payment banner | hides that notice, stays hidden | | ☐ |
| 2 | Streak pill | header banner | display only — no tap target | | ☐ |
| 3 | **View Schedule →** | This Week | opens the Workout tab | | ☐ |
| 4 | **‹ previous week** | This Week | steps back a week; adherence recalculates for a FINISHED week (all 7 days) | | ☐ |
| 5 | **› next week** | This Week | steps forward; disabled past +4 weeks; shows NO percentage for a future week | | ☐ |
| 6 | **A day circle** | This Week | opens that day's sheet | | ☐ |
| 7 | Day sheet **close / backdrop** | day sheet | closes, nothing changes | | ☐ |
| 8 | Day sheet **progress link** | day sheet | opens Progress | | ☐ |
| 9 | **Today's Workout card** | today block | opens that session's logger | | ☐ |
| 10 | **Workout picker** (2+ today) | today block | each row opens its own session | | ☐ |
| 11 | **Rest day slip** | shown when 0 scheduled | the permission slip; check whether it still offers to post to the group | | ☐ |
| 12 | **Challenge card** | community pair | expand / collapse | | ☐ |
| 13 | **Join challenge** | community pair | joins; button state changes | | ☐ |
| 14 | **Group card** | community pair | opens group chat | | ☐ |
| 15 | **Weekly Focus tiles** | weekly focus | display only? confirm nothing is tappable | | ☐ |
| 16 | **Dismiss brief** | weekly focus | hides the weekly brief | | ☐ |
| 17 | **Programming question submit** | below focus | saves the answer, card disappears | | ☐ |
| 18 | **Macros card** | today's nutrition | opens Nutrition | | ☐ |
| 19 | **Milestone badge** | badges row | opens group chat | | ☐ |
| 20 | **View all →** | Progress heading | opens Progress | | ☐ |
| 21 | **Each metric tile** | Progress grid | opens that metric's full chart | | ☐ |
| 22 | Metric modal **close** | metric modal | closes | | ☐ |
| 23 | **Coach bar** | Gerard + Sharon only | opens the coach | | ☐ |
| 24 | Off-plan card | only when something off-plan was logged today | shows what was logged | | ☐ |

### When we test

**Every control on a page gets tapped before we leave that page.** Settled 3 Sep.
Walking 39 screens and coming back to test them is two passes and a guarantee
that something is missed; it also means the tutorial has to be written from
scratch later instead of falling out of this table.

---

### Screen 1 test results — 3 Sep, Dustin tapping

| # | control | result |
|---|---|---|
| 1 | Payment notice ✕ | n/a — he has no payment notice, and does not want one. Correct: the banner only renders when something is owed. |
| 2 | Streak pill | ✅ display only, as designed |
| 11 | Rest day slip | ✅ offered to share to the group — **and that is one of the auto-shares going opt-in** |
| 13 | Join challenge | ✅ **not a bug.** The button renders only on `joined === false`. He is already a participant, so there is nothing to join. |
| 16 | Dismiss brief | ✅ **not a bug.** It is not a permanent button — it belongs to the full-screen weekly brief, which only appears when there is a brief AND it wins a takeover slot. No brief, no button. |
| 17 | Programming question | ✅ **not a bug.** Renders nothing on weeks nothing is being asked, and disappears once answered, by design — so it never becomes furniture. |
| 19 | **Milestone badge "Share 🎉"** | ❌ **REAL BUG.** `onClick` is `router.push("/messages?client=group")` and nothing else. It opens the group chat and shares nothing. A button labelled Share that does not share. |

**Not on this screen:** "fat mass, workouts and streak cards do not expand."
Workouts and Streak tiles live on the **/progress** page inside `MetricCards`,
not on Home — Home's Progress grid is only Body Weight, Body Fat, Lean Mass and
Fat Mass. Carried to the Progress screen. (He has 19 fat-mass rows, so that tile
has data and *should* expand — to be confirmed which screen he was on.)

### The Share fix — done, 3 Sep

Deferred at first, then done immediately when he pushed back: "sill need to fix
share milestone button." He was right — a visibly broken button should not wait
for a screen we have not reached.

Share now opens the group chat with the message **already written**
("🏅 50 Sessions — just hit it!"); the client reads it and presses send, or does
not. Opt-in by construction, which is the same rule as the group auto-posting
change still queued for Messages.

The composer fills **once**, only over an empty box so it can never eat
something half-typed, and the `draft` parameter is stripped from the URL so a
refresh does not silently rewrite it.

Covered by `tests/unit/shareActuallyShares.test.ts`, verified red against the
old one-line `router.push` first.

---

**Home confirmed closed 3 Sep.** "Progress tabs from home work fine" — the
expand issue was the /progress page, carried to that screen. Home's only
outstanding item is the Share button, deferred to Messages by design.

---

## Screen 2 — Workout tab (`/workout`)  ·  walked 3 Sep 2026

**What it is for:** *(to be filled in from Dustin's words)*

Note: this is the **tab**, not the logger. `/workout/[dayId]` is the logger and
is off limits without per-item permission.

### Click inventory — screen 2

| # | control | where | should do | actual | verdict |
|---|---|---|---|---|---|
| 1 | **Add workout** | top of tab | opens the add sheet — the only one in the app now | | ☐ |
| 2 | Add sheet: **pick a library day** | add sheet | adds that session to the chosen day | | ☐ |
| 3 | Add sheet: **add / replace prompt** | when a day already has one | "add alongside" vs "replace" — both must be obvious | | ☐ |
| 4 | Add sheet: **Build one** | add sheet | opens the builder | | ☐ |
| 5 | Add sheet: **Custom** | add sheet | opens custom entry | | ☐ |
| 6 | Add sheet: **close / backdrop** | add sheet | closes, adds nothing | | ☐ |
| 7 | **‹ / › week arrows** | week bar | steps the week, capped at +8 | | ☐ |
| 8 | **Tap a day** | week bar | opens that day's sheet | | ☐ |
| 9 | **Tap a session card** | board | opens the logger for it | | ☐ |
| 10 | **Start / launch** | session card | opens the logger | | ☐ |
| 11 | **Move to today** | session card | moves it to today | | ☐ |
| 12 | **Move…** | session card | opens the date picker | | ☐ |
| 13 | Move picker: **pick a date** | move sheet | moves it there | | ☐ |
| 14 | Move picker: **swap with another** | move sheet | swaps the two sessions | | ☐ |
| 15 | Move picker: **cancel / backdrop** | move sheet | closes, moves nothing | | ☐ |
| 16 | **Remove** | session card | removes the session — confirm what "remove" means vs skip | | ☐ |
| 17 | **Show past / hide past** | board | toggles finished sessions | | ☐ |

### Questions for this screen

- Does **Remove** delete the session, mark it skipped, or something else? It
  must not silently count against adherence — that was #46 on the old list.
- Moving a session: does the client's **log history** follow it? Rewriting a
  log's date on a scheduling action is what broke Jenn's history in August.

---

### Screen 2 findings — 3 Sep

**What the tab is for, in his words:** finding and starting work. The problems
are all about *getting to the right workout* and *what the buttons do*.

#### 1. Library search is one line, and that line is the whole problem

`AddWorkoutButton.tsx:281`:

    const filtered = lib.filter((d) => d.label.toLowerCase().includes(q.toLowerCase()));

It matches **the label and nothing else**. Search "chest" and you get workouts
with "chest" in the title; a perfect chest session called "Upper Push A" is
invisible. There is nothing else to match on — `days` has no description column.

Library as it stands: **711 days · 435 distinct labels · 45 programs · 47 days
with no exercises in them at all.**

#### 2. Start vs View — one button doing two jobs

`/workout/[dayId]` renders `WorkoutLogger`, which opens on an **overview** and
waits for a tap to enter the session (`sessionMode`). So today every route in —
board card, today's sessions, home — lands on the overview.

Wanted: **View** keeps the overview. **Start** goes straight into logging.

#### 3. Delete already does what he wants

`removeWorkout` really deletes, with a second confirmation for a completed
session — added 17 Aug after he deleted a stray third workout and lost a
finished 70-minute Upper Push. Deleted rows are filtered out of adherence
entirely, so they count neither for nor against. **No change needed.**

#### 4. But "skipped" does NOT count against adherence, and he thinks it should

Adherence filters `.neq("status", "skipped")`, so a skipped session leaves both
the numerator and the denominator.

That was deliberate: **every replace path marks the original skipped**, so
counting skipped would punish a client for swapping a walk in for a cardio day.
Dustin, 22 Aug: "im still showing an extra workout for yesterday that should not
be there."

He now says it should count if "left unlogged or marked skipped". Those are the
same status today, so the app cannot tell a session someone *blew off* from one
that was *replaced*. **Needs a decision — see the open question below.**

#### 5. Moving a logged workout

Unlogged: the session moves. Logged: he wants the log to stay put and the
workout copied forward.

#### 6. The week bar above the board

The board already renders past + upcoming as one continuous chronological list
with a Show past toggle. The week bar is a second, different navigation model
sitting on top of a list that does not need one.

### Guidance given

- **Week bar: remove it.** The board is a list of what is coming; a week
  scrubber above a continuous list is two navigation models fighting. Home's
  This Week ring already answers "am I keeping up", and two week widgets that
  look different and behave differently is the same fault as the two cards that
  both said "This week".
- **Moving a logged session: no dialog.** Unlogged moves; logged always leaves
  the log where it happened and puts a fresh copy on the new date, with a line
  saying so. You cannot move history — rewriting a log's date on a scheduling
  action is exactly what broke Jenn's history in August — and there is no
  sensible second option, because deleting the log is never right. A prompt
  would imply a choice that should not exist.

### Open question — the one that needs Dustin

Can the app tell a **replaced** session from a **skipped** one? Today both are
`status = 'skipped'`. Until they are distinguishable, making skipped count
against adherence also penalises every swap.

---

*(next: screen 3)*
