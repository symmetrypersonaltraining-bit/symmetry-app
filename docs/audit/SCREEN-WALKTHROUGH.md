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

---

## Interlude — the coach could not ADD to a meal  ·  5 Sep 2026

Not a walked screen. Recorded here because it changes what the coach chat can
do, and this file is the record of what each screen is supposed to do.

Dustin: *"I used the ai coach to replace my normal m4 w 2 bagels w cream cheese
n egg whites 8 oz. that worked, i logged it. then I told ai to add the jam to
that meal n now cant see or edit the rest of the meal."*

### What happened

The action extractor had no intent for adding to a meal — the list was
swap_meal / move_meal / copy_meal / delete_meal / add_snack / log_meal /
unlog_meal / none. So "add the jam to that meal" resolved to a **swap**, which
replaces a meal's whole contents. The model, trying not to lose the meal it was
replacing, invented one line to stand in for all of it:

    Post-Workout (original) — 1 serving   640 cal  44P/94C/12F   est
    Muscadine jam           — 1 tbsp       48 cal   0P/12C/0F    est

Three failures in one write:

- the bagels, the cream cheese and the egg whites were gone from the card **and
  from the edit sheet**, so there was nothing to see or correct;
- their numbers collapsed into a single recalled figure — three known items
  became one estimate;
- a swap lands unlogged by design, so a meal he had already eaten came back
  unlogged with its macros off the day.

The totals survived (688 / 44 / 106 / 12, exactly what the card showed). That is
what makes this the dangerous shape: the number at the bottom looked right while
the meal underneath it was gone.

### What the coach does now

| Say | Intent | What happens |
|---|---|---|
| "add jam to M4", "I also had a banana with lunch" | **add_to_meal** (new) | the new food is appended; every existing item keeps its own name, amount and numbers; a logged meal stays logged |
| "swap M4 for X", "change M4 to X" | swap_meal | replaces the whole meal, lands unlogged — unchanged |
| "I ate something extra" | add_snack | a new off-plan meal — unchanged |

The extractor is told the difference in as many words, and forbidden by name
from inventing a placeholder for a meal's existing contents — no "(original)",
no "rest of meal", no "previous items".

The executor seeds from what is ACTUALLY there — the custom items if the meal is
already custom, otherwise the plan meal **with today's edits**, through the same
`rowItemsForCopy` that "Copy to slot" uses — then appends.

**His own M4 was rebuilt** from the copy that `saveMyMeal` had kept: 8 oz egg
whites + 2 Thomas cinnamon swirl bagels with cream cheese + 1 tbsp muscadine
jam, re-logged, same 688 / 44 / 106 / 12. The saved My Meals entry carried the
same placeholder and was repaired too, or it would have come back. Backed up to
`bak_m4_collapsed_20260905`.

### Still open on this screen

The coach's own items are still `est` — `/api/nutrition-ai/act` does not resolve
food against `food_catalog` the way the parse and meal-edit paths do. Deferred
by him to the Nutrition walkthrough; see AUDIT-RESUME.md.

---

## Interlude — the portion sweep  ·  4 Sep 2026

Not a walked screen. Recorded here because it changed what several screens
DISPLAY, and this file is the record of what each screen is supposed to show.

Dustin, on the Edit custom meal sheet, having typed
"2 5 inch pancakes, 4 scrambled eggs w butter n cheese, 3 maple sausage links":

> its got all the same screw ups that we fixed on other features. this numbers r
> terrible. fix it moving firward and in my log

Then, once the first fix was in:

> I dont want to find this accuracy problem again anywhere. find it from every
> path n get it fixed

### The fault, in one sentence

`food_catalog` stores macros per 100 g and, on 574,372 of its 574,650 rows,
knows no other portion. Every surface that turned a counted food into a number
fell back to that 100 g — so a pancake weighed 100 g, an egg weighed 100 g, and
"w butter" cost 743 calories.

### Every path, and what it does now

| Path | Was | Now |
|---|---|---|
| Nutrition → Adjust / "just say what changed" (`/nutrition-ai/meal-edit`) | a count multiplied the row's 100 g base; no amount meant 100 g | one portion-weight question — a weight, never a macro — and the macros still straight off the row |
| Daily food logging (`/nutrition-ai/parse`) | same resolver, same fault | same fix; both doors share one resolver |
| "Add from the food database" sheet | the amount box opened on the FIRST named serving, a volume on 93,752 of the 223,237 rows that have one — "Bananas, raw" opened on 1 cup mashed (225 g) | opens on a real piece, using the one chooser all three surfaces now share |
| Recipe builder — database search | added the row's per-100 g macros labelled "1 100 g"; almonds 579 cal, butter 717 | adds one real serving, verified rows ranked first |
| Recipe builder — the amount box | **decoration.** Typing 8 oz over a chicken breast re-rendered the line and left the totals counting 100 g, under a panel reading "Edit any amount and the totals follow" | scales, for rows that have a basis (database + estimated). A hand-typed row's P/C/F is still the line total, and the panel now says so |
| Coach chat "add a snack" (`/nutrition-ai/act`) | model-recalled macros, never checked against a row | unchanged, and it is MARKED — every item off this path renders as an estimate. Left as a decision, not a silent fix |
| `/nutrition-ai/verify-food` | wrote model-recalled macros into `food_catalog` and set `verified: true` — the flag the picker is told to trust | audits and reports; it does not write. Checked first: zero rows carried `ai_verified_at`, so nothing in the catalogue came from it |

### What is guaranteed from here

- **A macro figure comes from a `food_catalog` row.** Unchanged, and it is the
  reason the portion question asks for a WEIGHT and refuses anything shaped like
  a macro.
- **"One of them" has exactly one definition** — `preferredServing` — and the AI
  resolver, the manual food sheet and the recipe builder all call it. Two copies
  of that rule is two screens disagreeing about the same banana, which is what
  happened between 26 Aug and 4 Sep.
- **An estimated portion is flagged** (`portion_estimated`) and is not dressed
  as a serving the row actually carries. It is deliberately NOT shown as an "est"
  badge: the macros are USDA and pointing a client away from them would be worse
  than the gap it describes.

### Dustin's own log, corrected

`meal_adherence_logs` `0c5ac7ab` (4 Sep, meal 1) went from **2,314 cal /
94P / 81C / 179F** to **1,034 / 58 / 60 / 63**. Same rows he was given — only
the portions were repaired, and the micronutrients rescaled with them. Backed up
first to `bak_meal_adherence_logs_20260904`.

## Screen 2 — Workout tab — REBUILT 4 Sep 2026

The visual rebuild, and the two behaviours agreed on 3 Sep, shipped together so
there is one live version to test rather than four.

### What this screen is for, in Dustin's words

"A daily used thing for clients. It needs to be cleaner." Moving workouts has to
be easy, starting has to be easy, and seeing what the week looks like has to be
easy.

### The format — and it is not only this screen's

Everything is one object, taken from the **Weekly Focus card on the client home
screen**: `--brand-surface`, a 1px border, radius 18, padding 14, a soft shadow,
a bold 14px label with an icon on the left and a small meta on the right, and a
gradient bar across the top. That bar was never bespoke — Weekly Focus carries
an inline `background: var(--brand-surface)`, which is exactly what the
`[data-deep]` blanket selector matches, so depth was already painting
`--card-topbar` across its top.

- **No side borders anywhere.** A tile is capped; the things inside it are capped.
- **A day is a tile.** Label written out — "Saturday, Sep 5" — with a calendar
  icon, session count on the right.
- **A workout is the same object, smaller**, inside the tile.
- **Today is the same tile filled bright** with the scheme gradient, and it
  renders FIRST, above the past strip, not in date order. Its cap sweeps; it is
  the only thing on the screen that moves.
- **Ladder shading**: one colour, six shades deepening down the list.
- **Raised**: the page sinks darker and the tile deepens toward the primary at
  the same time. Shadow alone between two surfaces half a step apart reads as a
  smudge, which is what the first attempt looked like.
- Scoped to `.sym-page` so it opts in one screen at a time — rule 6.

### Controls on a workout card

| control | what it should do | verdict |
|---|---|---|
| **Start** | Enter the session immediately (`?start=1`) | BUILT 4 Sep — needs walking |
| **View** | Open the overview and wait, the old behaviour | BUILT 4 Sep — needs walking |
| **Calendar icon** | Open the move sheet (move to a date, or swap in from the library) | BUILT 4 Sep — needs walking |
| **→ Today** | One tap to pull a past unlogged session to today | Carried over |
| **Trash** | Soft-remove, with the completed-session confirm | Carried over |
| **Press and hold** | Drag onto another day tile | Carried over |
| **Add workout** | Unchanged; moved onto the title row so it stops costing a full row | BUILT 4 Sep — needs walking |
| **Past N days** | Collapsed by default, never says "missed" | Carried over |

### Decisions settled

- **No "programme" language anywhere client-facing.** Dustin, 4 Sep: most
  clients are not on a programme. Each is programmed personally, day by day, in
  6-week blocks, from the library. Applies to every screen, not just this one.
- **Max two rows of text per card.** The name gets both and is never truncated;
  the count moved onto the button strip so it stops stealing width.
- **Colour means the day, not the session type.** Session type is carried by the
  icon alone.
- **Moving a logged workout copies rather than moves.** The trained session and
  its log stay put; a copy lands on the target date.

### Three contrast rules, each from a real failure

1. A button fill is a fixed step off the surface it sits on, never the same
   token. Taking it from `--brand-surface` made buttons invisible on tinted days.
2. A filled button pushes toward the scheme's own **text** colour and labels
   itself with the **surface** colour. White-on-hue measured ~2:1 on Carbon Neon.
3. No text ever sits on a saturated hue. Colour lives in caps, edges and the
   field behind the cards.

Also: the today gradient is a tonal ramp of the primary **alone**. Mixing primary
into accent lands on mud wherever the accent is complementary (Ocean Dusk).

### Fixed on first live test, 4 Sep

- **The screen opened onto last week.** Dustin: "app is opening to past days
  expanded." An effect force-opened the past section whenever the current week
  held an unlogged session. It was added 22 Aug for a real complaint — on a rest
  day there was nothing above the board to look at — and that reason expired
  when Today started rendering first on every day, rest day included. Removed,
  along with the `missed` count that fed it and the week-scoping that count
  needed. **Nothing on this screen counts or announces missed sessions now**,
  which answers Bobbie Page's 20 Aug complaint more completely than a smaller
  number did. The only thing that opens the past section is a tap on it.
- **The past window is 14 days**, as agreed, not the 7 it shipped with.
- **View and Start landed on screens that looked identical.** Dustin: the view
  screen was light and the logger dark before the rebuild, and that is the state
  he wants back. The session view
  has always pinned itself to a fixed dark ground whatever scheme is active; the
  overview followed the theme, so on any dark scheme the two destinations were
  the same colour and the two buttons appeared to do the same thing. The
  overview is now pinned light — the mirror of what the session already does.
  Surfaces only: the scheme's own primary and accent stay, so a client on Forest
  gets green controls on white rather than somebody else's blue.
  Checked before changing anything: every selector the rebuild added is
  `.sym-*` scoped and none of them reach that screen, so no regression was
  found — the overview has been following the theme throughout. The pin is
  what makes the two destinations tell each other apart on a dark scheme.

### Add workout — rebuilt 4 Sep

**The two entry points now come first.** "Type what I did" and "Build my own"
sat underneath the entire library — Dustin: "its there but at the very bottom of
100+ workoyts so Noone has seen it." They are the first thing on the sheet.

**Filters, all precomputed on `days` by `refresh_day_facets()`:**

| filter | source |
|---|---|
| Region — upper / lower / core / full | share of classified movements; 60% decides it |
| Body part — chest, back, shoulders, biceps, triceps, arms, core, glutes, legs, hips, ankle, neck | `exercises.muscle_group` of the movements programmed |
| Type — strength, cardio, mobility, conditioning, functional, rehab | `exercises.modality`, plus label keywords for cardio and rehab |
| What it's for — muscle, strength, fat loss, corrective, rehab, mobility, balance, prep, at home, solo | label + description keywords |
| Difficulty | the `difficulty` column |

Region is by DOMINANCE, not presence. The first pass set it if a body part
appeared at all, which made 887 of 1,195 days "full" — a label, not a filter.

**AI search.** `/api/library-search` turns a sentence into a filter over that
fixed vocabulary and the chips move to match, with a line saying what it
understood. It never picks a workout, never writes, and never sees the library —
handing 1,195 labels to a model on every keystroke would be slow and would let
it invent a workout that reads right and does not exist. Postgres does the
matching; every id came out of the database. Falls back to keyword search with
no key.

**View on every result.** Opens the workout in place — sections and movements,
client-facing section names only — and Back returns to the same search with
every chip still set. It is a layer, not a navigation.

**Pull-forward is gone.** Adding used to look 7 days ahead for the same workout
and move that row onto the chosen date. Dustin: "definitely do not like that,
fix it a replace shouod reolace what they said not move anything." Add adds;
replace replaces what was named, on the day it was named.

> **Trade-off he should know about.** This re-opens Sara Prince's 11 Aug case:
> doing Thursday's session on Tuesday now leaves Thursday's copy where it is,
> and it is on the person to move or remove it. `src/lib/pullForward.ts` and its
> tests are left in place; only this surface stopped calling it.

### Build my own — rebuilt 4 Sep

`MovementPicker.tsx`, reusable, opened from the Search button on every exercise
row. The movement-level twin of the workout search:

- **Filters** — body part, type (strength / power / functional / conditioning /
  mobility), equipment. All normalised in code rather than in the data:
  `muscle_group` is free text typed by hand over a year ("Chest" and "chest",
  "Legs" and "Lower Body"), and equipment has drifted the same way
  ("Lacrosse Ball" / "Lacrosse ball", "Cable rig" / "Cable Machine").
- **Ask** — `/api/movement-search`, same contract as the workout one: a filter
  over a closed vocabulary, never a named movement. Falls back to a name search
  with no key.
- **View** on every result — what it is, and its demo video.
- **A layer, not a navigation.** A half-typed workout survives going to look
  something up.
- **Free text still works.** "red band pull-apart" is a real thing somebody
  types and no library has to contain it. Picking from the library also
  guarantees the exact stored name, which is what makes `/api/workout-manual`
  resolve to the shared exercise instead of quietly creating a personal copy of
  one that already exists.

Two safety rules enforced here and tested:

- **Excluded movements are never listed** (11 of them). Rule 13.
- **`corrective_phase_tags` never reaches the screen.** Inhibit / Lengthen /
  Activate / Integrate is the internal engine; it is on the row, which is
  exactly why keeping it off the screen has to be deliberate.

### Search fix, 4 Sep — spelling

Dustin, testing: "i typed in pushup".

The movement library spells that lift **four** ways, because the names were
typed by hand over a year: `Push Up`, `Push-Up`, `Pushup`, `Push ups`. Twenty-
three variations exist. A plain substring test splits them into disjoint sets —
"pushup" found six, "push up" found a different fourteen, and **neither spelling
found all of them.** There was no way for the person searching to know which one
to guess, and the ones they did not guess did not exist as far as the box was
concerned.

Both searches now strip everything that is not a letter or a digit, on both
sides, before matching. Multi-word queries still AND: "push up" becomes "push"
and "up", and both appear in "pushupwithscapularcontrol". The movement search
also reads `aliases` and `everfit_name` — a movement goes by more than one name,
which is what those columns are for.

**Enter no longer fires the AI.** It was bound to Ask, so pressing it spent a
metered call and replaced what had been typed. The list filters as you type;
Ask is a deliberate tap.

### Still open on this screen

- **The "modified from original" marker.** The link field exists but only 6 of 73
  forks carry it — the fork routes do not set it. Not addressed here.
- **Nutrition %** — Dustin is unhappy with how it calculates. Rule to be captured
  at the Nutrition tab so both places change together.
- **Group auto-posting** — nothing posts automatically; the rest lands at Messages.
- **The AI components on this screen have not been reviewed yet** — see the
  process note in AUDIT-RESUME.md. Home comes first.
