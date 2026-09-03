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

*(next: screen 2 — Workout tab)*
