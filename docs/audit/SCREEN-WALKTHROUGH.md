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

## Interlude — the food quality gate  ·  6 Sep 2026 (overnight)

Dustin: *"we need proper units on every food that calculate proper macros for
each unit and defaults to standard serving... as of right now its useless."*

Four attempts had tried to INFER serving sizes from the catalogue. The reason
they kept failing is that **the catalogue cannot answer the question**: 511,555
of its rows are Open Food Facts, and for 127,847 of them OFF holds no serving
size at all. That was checked against the OFF API product by product, not
assumed, and it cannot be re-fetched — it was never collected.

So the answer is structural, in four parts.

### 1. An authoritative core

**USDA Standard Reference 28 — 8,789 foods**, with lab-measured macros and
USDA's own household measures. `data/usda-sr28.tsv` lives in the repo and
`import_usda_core()` fetches it over http straight from the public repo, so it
re-imports on demand and no 1.1 MB of generated INSERTs sits in a migration.

Searching "butter" answers **Butter, salted — 717 cal**, opening on
**1 tbsp = 102 cal**.

### 2. His own foods, ahead of everything

`meal_items` already held the answer for the foods that matter most: the macros
and the unit Dustin writes, every time he builds a meal. **155 foods** are now a
`trainer` tier in the catalogue, ranked first — because for a food he
programmes, his numbers *are* the answer.

| search | answers |
|---|---|
| butter | **Butter · Symmetry · 1 tbsp · 104 cal** |
| olive oil | Olive oil · 1 tsp · 36 cal |
| homemade sourdough | 1 g · 2.4 cal |
| SF greek yogurt | 1 cup · 132 cal |
| boiled eggs | 1 each · 74.5 cal |

They are badged **SYMMETRY**, not "✓ USDA" — they are verified, but the numbers
are his, and claiming USDA would misattribute them.

### 3. A gate: nothing wrong is offered

`quarantined` — the calories disagree with 4P+4C+9F, the macros are physically
impossible, or the row carries no real measure. **152,693 hidden, 387,596
searchable.** Ranking bad rows to the bottom was not enough: they stayed
pickable, and a pickable wrong row is a wrong log. Recomputed nightly, because
the OFF import keeps adding rows.

The gate was wrong twice before it was right, and both are worth keeping:

- It called **an ounce "not a portion"** and hid 30 of his own foods. He
  programmes meat and fish by the ounce.
- It judged every row **as if macros were per 100 g**, so a cup of dry oats —
  106 g of carbohydrate, because it is a cup — looked impossible. The limits now
  scale with each row's own basis.

### 4. Ranking that knows what a food is

- **Authority beats an exact name.** A packet titled exactly "butter" claiming
  428 kcal must not outrank USDA's 717.
- **Whole words beat substrings.** "apple" is inside "applebee's", which is how
  searching for an apple returned APPLEBEE'S chili.
- **The food is what comes before the second comma.** USDA writes
  "Oil, olive, salad or cooking"; judging relevance on the head alone is what
  separates it from "Oil, corn, peanut, and olive".
- **Authority only counts when the row is ABOUT the search.** USDA's only match
  for "mixed berries" is a strained babyfood, so a real punnet wins.
- **One product, one row.** Kerrygold's "Pure Irish Butter" appeared five times
  with different fat figures; the copy closest to what its duplicates agree on
  is kept, so a lone 748 loses to three near 714.

### Caught by testing in the app, not by assuming

Setting `serving_grams` to the pat weight while the macros were per 100 g made
**a tablespoon of butter read 2,036 cal**. It looked right in every SQL check.
`serving_desc`/`serving_grams` describe the BASIS of the macros, never a
portion; the real measures live in `serving_options`.

---

## Interlude — the catalogue audit  ·  6 Sep 2026

Dustin: *"if there are duplicates get rid of the ones w wrong units or fix them.
we cannot release the app like this."*

Then, when the first fix did not reach his own butter: *"are you fucking
kidding!???"* — a search for "Kerrygold butter" returning four near-identical
rows, every one of them grams-only.

Both complaints were correct and had different causes.

### What was actually wrong

**1. The rows were duplicated.** `Pure Irish Butter` (Kerrygold) existed five
times with fats of 78.6, 39.3, 85.7, 78.6 and 82.5 g, all claiming ~714 cal.
Only some of those are arithmetically possible, and that is the objective test:
**calories must equal 4P + 4C + 9F.**

**2. The catalogue had no serving size for countable foods**, so something
downstream always invented one — a borrow, then a model estimate. That is where
"6 cookies = 2,148 cal" came from.

### What was done

| pass | rows | basis |
|---|---|---|
| exact duplicate rows removed | 34,331 | identical name, brand and macros; kept the copy with the most servings |
| contradictory rows removed | 8,992 | calories disagree with the row's own macros AND a consistent row for the same food exists |
| impossible volume servings stripped | 102 | a tablespoon cannot weigh 200 g |
| household servings added | 61,275 | FDA RACC |

All three are reversible: `bak_food_catalog_deleted_20260906` holds every
deleted row whole with its reason, `bak_food_catalog_badservings_20260906` and
`bak_food_catalog_racc_20260906` hold the old `serving_options` beside the new.
**No food name lost all of its rows** — checked before the delete, and zero.

### The reference layer

`serving_kw` (224 food words) and `serving_phrase` (85 two-word names) hold
**FDA Reference Amounts Customarily Consumed — 21 CFR 101.12** — the published
table that decides what a package prints as one serving. That is the literal
answer to "default to the normal serving size according to the packaging".

Matching it to a name took four attempts, and each wrong one is worth keeping:

- **Tier-first was wrong.** "tortilla chips" became a 49 g tortilla and
  "olive oil" became a 4 g olive. English is head-final: the LAST food word is
  the food. Position now wins; specificity is only the tie-break.
- **Head-final alone was wrong** for USDA names, which are head-INITIAL:
  "Pie, blueberry" became a cup of blueberries. The head noun is now taken from
  the segment before the first comma.
- **Substring phrase matching was wrong.** "pancake mix" matched the phrase
  "cake mix". Phrases are word-bounded now.
- **Fruit words are usually flavours.** "diet orange burst" is a soda, not a
  182 g orange. Produce names only count when the food is essentially just that
  food and the name carries no drink or confectionery word.

**Foreign-language rows are left alone entirely.** French, Spanish and German
food names are head-initial, so the English rule reads them backwards — it
turned *beurre demi-sel* into a teaspoon of salt. A foreign product keeping
grams is correct; one given the wrong unit is not.

Verified by sampling the plan before any write, twice, and re-running the exact
cases each earlier attempt got wrong.

---

## Interlude — the unit was never the catalogue's to know  ·  6 Sep 2026

Dustin, after the third attempt: *"now do a full audit on every singke food in
the database n get them all correct."*

The audit found the answer somewhere else entirely, so the audit is not what
shipped.

**Every fix so far tried to DERIVE the unit from `food_catalog`.** Read the
row's own servings; borrow from a similarly-named row; rank the candidates by
how much of the name they explain. The catalogue is a 574,667-row import that is
mostly junk, so each derivation failed in a new way, the last one loudly — six
cookies became **six protein bars, 1,815 cal**.

It never had to be derived. `meal_items.unit` is the unit **Dustin wrote down
himself**, once per food, every time he built a meal:

| his food | his unit | times |
|---|---|---|
| mixed berries | cup | 98 |
| white rice (cooked) | cup | 82 |
| olive oil | tsp | 52 |
| **butter** | **tbsp** | **8** |
| sweet potato (cooked) | g | 38 |
| salmon (cooked) | oz | 39 |

**251 foods, and it is consulted before anything is derived.** It is in the repo
as `src/lib/nutrition/foodUnitDefaults.ts`, generated by
`scripts/food-unit-defaults.sql` and regenerable from the database at any time.
A generated file, not a table and not an RPC — after the PostgREST schema-cache
lesson below, nothing on this path waits for a cache.

Two rules, both narrow on purpose:

- **The whole name first, then the name up to its first comma or bracket.** The
  catalogue writes a food as `<food>, <qualifier>` — "Butter, salted",
  "Butter (unsalted)" both reduce to `butter`. A plain word-prefix rule was
  tried and was wrong: **"Butter Pecan Ice Cream" starts with "butter"** and is
  not eaten by the tablespoon. Requiring the name to END at the delimiter is
  what separates a qualifier from a different food.
- **A food he never programmed gets nothing.** Silence is the honest answer, and
  it is exactly the answer that was missing when a cookie was handed a "bar".

And the map is read in both directions. A food he **weighs** — sweet potato in
grams, salmon in ounces — now *suppresses* the borrow below, because a borrowed
"cup" on his sweet potato is the same class of mistake as the missing tablespoon
on his butter.

### The duplicate rows underneath it

The catalogue holds the same food twice: `Butter, salted` with six servings
including `1 tbsp (14.2 g)`, and a second `Butter, salted` with only `100 g` and
`1 oz`. **Search kept landing on the bare twin.** 25,353 food names carried both
shapes.

Where a bare row had an exact-name, same-brand twin whose calories agree within
5%, the twin's household measures were merged in: **17,201 rows**, backed up
whole to `bak_food_catalog_servings_20260906` (old and new side by side, so it
reverses with one statement). Bread gained slices, pancakes gained "3 PANCAKES",
cream of tartar gained a teaspoon. The 15,838 pairs whose calories disagree were
left alone — same name, different food, and whipped butter's tablespoon is 9.4 g
where regular butter's is 14.2.

Covered by `tests/unit/theUnitHeProgrammesInWins.test.ts`, verified red against
the unfixed matcher — "Butter Pecan Ice Cream" returned `tbsp` until the rule
was tightened.

---

## Interlude — butter had no tablespoon  ·  5 Sep 2026

Dustin: *"why are we still fighting this? butter shouod measure in tablespoons i
thought we fixed all this."*

Fair question, and the answer is that 4 Sep fixed a different thing. That fixed
WHICH of a row's own servings gets picked — a real piece over a cup. This is the
case underneath: **a row with no countable serving at all.**

He searched his actual butter, Kerrygold Salted Irish Butter, and got it,
correctly. That row is Open Food Facts and carries exactly "100 g" and "1 oz",
so grams was the only honest thing to offer. Of the catalogue's butter rows
**7,218 are crowd-submitted and 318 are USDA-verified; only 31 carry a
tablespoon.** The foods it hurts are the ones nobody weighs.

**A weight-only row now borrows the household measures of the best-matching
VERIFIED row for the same food.** No invented grams — USDA's "Butter, salted"
has carried "1 tbsp (14.2 g)", "1 pat (5 g)", "1 stick (113 g)" all along.
`borrowed_household_servings(name, brand)` matches on shared name tokens, most
overlap first, head noun required.

| search | now offers |
|---|---|
| Salted Irish Butter | pat 5 g · tbsp 14.2 g · stick 113 g · cup 227 g |
| Peanut Butter | 2 tbsp (32 g) → **16 g each**, not dairy butter's 14.2 |
| Extra Virgin Olive Oil | tablespoon 14 g · teaspoon 4.5 g |
| Raw Honey | tbsp 21 g · cup 339 g |
| Cream Cheese | tbsp 14.5 g |

The peanut butter row is the one that matters: the ranking is what stops it
taking dairy butter's tablespoon, which would be an 11% error on every spoonful
and invisible.

**The rule took three attempts, and the two rejected ones are the useful part.**
Matching on ANY shared word (v1, shipped and replaced within the hour) gave
"Chicken Parmigiana & Penne" a tablespoon of chicken fat, "Zero Sugar Oatmilk"
two tablespoons of peanut spread, and a goat cheese pizza a submarine sandwich.
Requiring EVERY word of the source row to appear in the food's name (v2) was
safe and nearly useless — USDA names carry qualifiers a package never does, so
"Butter, salted" could not lend to "Pure Irish Butter" and four of the five
butters on his screen came back empty. What works: the last significant word of
the package name IS the food, so that word must appear in the source row, and
the rest is ranking.

**⚠️ AND IT WAS INVISIBLE ON THE PHONE FOR TWO ROUNDS, FOR A REASON WORTH
REMEMBERING.** The lookup was first written as a new SQL function. It answered
correctly against the database every single time — which is the layer that was
being tested — and did nothing at all in the app, because a browser reaches
Postgres through PostgREST and **PostgREST serves functions from a cached
schema**. A function created minutes earlier is a 404 until that cache turns
over, and the 404 landed in the catch and became "no units", so the screen
carried on showing grams while every check said fixed.

It now reads `food_catalog` directly — the table this sheet already queries on
every keystroke. If the search results render, the units work. **A new RPC is
not verifiable from a SQL console; a table read is.**

The second bug was in the same function and would have hidden the fix anyway:
the line setting the default portion ran AFTER the lookup, recomputed from the
food's own empty unit list, and overwrote the borrowed portion a line later. The
units were fetched and thrown away. It now runs before.

**⚠️ AND A BORROWED MEASURE MAY ONLY ANSWER THE UNIT IT WAS ASKED ABOUT.** The
first rule fell back to "whichever countable measure the borrowed set leads
with". Dustin typed *"6 tiffs treats cookies"* into Quick log and got
**6 bar — 1,815 cal**: the row was right (*Cookie, chocolate chip*), its borrowed
set contained a "bar", nothing matched the word he used, and it handed over the
bar anyway. Six cookies became six protein bars at 300 cal each.

A borrowed serving is only ever an answer to "what does one X weigh". No X in
the set means it does not know, and the portion question — which asks a model
that exact thing and returns ~35 g for a cookie — is the correct next step. When
no unit is named, the food is taken from the CLIENT's own last word ("6 tiffs
treats COOKIES"), not the catalogue row's name.

The food sheet keeps offering every borrowed unit, each with its gram weight,
but only OPENS on one named after the food itself. Offering is help; choosing
silently is the failure.

**Nothing is backfilled, and that was a decision, not an omission.** 276,275 of
the catalogue's 574,667 rows carry no countable portion. A set-based backfill
was written, sampled and thrown away: the loose rule matched 162,286 and the
strict rule 14,298, and hand-checking the strict sample still found about one in
eight wrong ("Honey Wheat" taking Honey's 21 g tablespoon). Written into
`serving_options` those are indistinguishable from real portions and wrong
forever. As a lookup, the borrowed measure appears with its gram weight beside
it and can be overridden.

The sheet renders the food first and the units arrive a beat later, so a slow
lookup never holds up what was tapped; a failed lookup leaves grams working.
**The AI resolver also asks the catalogue before it asks a model** — 4 Sep's
portion question costs a Haiku call and returns an estimate, and a borrowed
serving is a real number from a real row, so the model is only asked when the
catalogue has nothing.

---

## Interlude — the coach's read said 207 when he was 205  ·  5 Sep 2026

Dustin: *"its reading weight from the wrong place. im at 205."*

It was not. `clients.current_weight` said 205 and his latest weigh-in said 205.
The paragraph said 207 because it had been **written on 29 August**, when 207.2
(17 Aug) was the most recent weigh-in that existed.

| paragraph (29 Aug) | tile beside it (live) |
|---|---|
| "5 of 8 done" | 4/8 |
| "consistency jumped to 100%" | 61% |
| "flat at 207 lb" | 205 |

Two changes, and they are halves of one thing.

**1. It is rewritten when the number moves.**
`/api/cron/weekly-ai?mode=refresh`, daily at 12:00 UTC, for clients whose last
weigh-in is later than their `ai_focus_date`. It rewrites the READ only — the
weekly focus, food focus and fortnightly question are the week's copy, chosen
once, and moving them because someone stepped on a scale would move the target
a client is working towards three days in.

**2. It says which week it is about.**
The read reviews the week that FINISHED, and now carries **"LAST WEEK ·
<range>"**. The label is on the read alone, not the panel: the focus line above
it is about the week AHEAD, and labelling that "last week" would mislabel the
one instruction the client acts on. The writer is also barred from narrating the
week in progress — `CLAIMS_THIS_WEEK`, which has guarded the programming
question since 1 Sep, now runs on the read too.

**What the card means now, top to bottom:** the tiles own the week in progress.
The focus line owns the week ahead. The read owns the week that finished. Body
weight is the one present-tense figure in the read, which is why a weigh-in is
what triggers the rewrite.

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

---

## Interlude — the rebuilt library, and three things left over  ·  6 Sep 2026

The rebuild is in the migration
`supabase/migrations/20260906b_the_rebuilt_food_library.sql`, which is the whole
record: Open Food Facts deleted, USDA SR28 and USDA Branded imported by Postgres
itself, the nightly quality gate, and the search ordering. This interlude is
about the three things that were still wrong once it landed.

### The barcode scanner could not find food that was sitting right there

A USDA branded row's `fdc_id` **is** its GTIN, so setting `barcode = fdc_id` made
442,775 packaged products scannable without another import. It did not work.

USDA writes the number zero-padded — Apple Jacks is `00038000162367`. The scanner
in his phone reads the box and emits the UPC-A printed on it, `038000162367`. The
lookup was one exact match on the scan as it arrived, so the two never met. Scan
an Oreo packet and the Oreos came back, because that row happened to be stored at
12 characters; scan the Apple Jacks beside it and the app said it had never heard
of the product. The catalogue holds barcodes at 8, 11, 12, 13 and 14 characters
depending on which import wrote the row.

`src/lib/nutrition/barcode.ts` now strips the leading zeros to get the number's
identity and offers every padding of it back; both lookups — the sheet's and the
server route's — match on that set. Quarantined rows sort last within it, because
one number can land on a good row and a bad twin, and the Oreo scan found the
twin.
### Searching a brand led with its diet version

Dustin typed **"kerrygold butter"**. First result: *Kerrygold, Reduced Fat Irish
Butter*, 571 kcal. The butter he actually buys is 717.

Nobody asks for reduced fat by typing the plain name. So a row that adds a
qualifier the search did not contain now sorts below the row that does not add
one, and a qualifier that changes the macros — reduced fat, sugar free, diet,
imitation — costs more than one that only changes the form — whipped, unsalted,
smoked. Ask for it by name and the penalty disappears: "reduced fat kerrygold"
still finds reduced fat first. The word list is the `food_variant_qualifier`
table, tunable without touching the query.

Three words were deliberately left out of it: *extra*, because extra virgin olive
oil **is** the plain product; *double*; and *soft*, because in soft taco and soft
drink the word is the food's own name.

The same ordering went into `match_food_for_ai`, so a food logged by talking to
Claude and the same food logged by searching land on the same row.

### Open Food Facts was still armed to come back

Two cron jobs re-imported it every five minutes. They had last run on 16 August
and their import state still said `running`, which means the next successful
fetch would have refilled both the catalogue and the 1 GB disk. Unscheduled, and
their import state set to `paused` with the reason written into it.

### Still open from the rebuild

- ~~A trainer row's default amount is 1 g.~~ **Fixed the same day.** Foods he
  programmes by weight — chicken breast, rice, potatoes — are stored on a
  per-gram basis, which is arithmetically right and opened the amount box on
  1 g of chicken breast: 1.1 calories, and a number to clear before typing the
  real one. That one case now opens on 100 g. Every real portion the row states
  — 1 tbsp, 1 oz, 30 g of almonds — is left exactly as written, because those
  are answers rather than artefacts of the basis.
- **The Open Food Facts fallback** in `/api/nutrition-ai/barcode-lookup` still
  fires when a scan misses the catalogue entirely. It is now the only path that
  can write an `off` row, and the nightly gate hides whatever it writes, so a
  scanned miss is offered once and never becomes searchable.

---

## Interlude — Client View was chrome, not a boundary  ·  7 Sep 2026

Dustin, with another client's full profile page on his screen while signed into
Client View: *"why am I seeing this while signed into my client view?"*

### It was never visible to a client

Two independent guards, both checked before anything was changed.
`/clients/[clientId]` calls `viewerIsTrainer()` and redirects a non-trainer to
`/home` before it reads a single row — and that answer comes from the `trainers`
table, not a UI flag. Underneath it, RLS on `clients` gives a logged-in client
exactly one policy, `auth_user_id = auth.uid()`: their own row. A client who
somehow reached the URL would get an empty result and a 404.

So this was a mode boundary, not a data leak. But a preview mode that shows you
things a client cannot see is no use for the thing it exists to do.

### What it actually was

The toggle swapped the header and the bottom nav and set
`symmetry_client_mode=1`. The pages shared between both audiences read that
cookie and render their client branch — `/home`, `/settings`, `/schedule`,
`/movement` all do. **The trainer-only pages never read it.** They gate on who
the account is, which is still a trainer in client view, so any way of arriving
at one of those URLs rendered the whole trainer page inside the client shell.

The likeliest way, and the one that matches the screenshot: he was on that page,
toggled into Client View, and swiped Back. `handleToggleMode` used
`router.push`, so the trainer page he had just left was one gesture behind him.

### The fix

One guard in `src/middleware.ts`, which already runs on every route. In client
mode, a trainer-only path redirects to `/home?as=client`. It sits there rather
than as a line added to each page for two reasons: it runs before the route
does, so a payload prefetched in the other mode cannot get around it, and it
covers pages nobody has written yet.

Blocked: `/clients`, `/payments`, `/library`, `/assessment`,
`/settings/data-health`, `/settings/ai-health`.

**Not blocked: `/workout`.** A trainer logs a client's session at
`/workout?forClient=<id>`, and both workout loggers are off limits without
per-item permission. Blocking that would break real work to fix a cosmetic
boundary.

The middleware has two ways out for a trainer — the build-time list and the
`trainers` table — and both now go through the guard. A source-order test holds
that, in the spirit of `middlewareAsksAuthLast`: the property is "no exit skips
the check", and a third early return is exactly what would quietly undo it.
The toggle also uses `router.replace` now, so the page you toggled away from is
not one swipe behind you.

Mutation-tested both ways: unguarding either return, or dropping `/clients` from
the list, turns the tests red.

---

## Interlude — the work saved, the screen did not know  ·  7 Sep 2026

Dustin, home screen showing both of today's sessions on Start and the week at
0% adherence: *"I logged my workout earlier... I just relogged n completed it
and still won't save. huge fuck up."*

### It saved

| | |
|---|---|
| `workout_logs` 2026-09-07, Bulk — Chest + Triceps | `completed = true`, `completed_at` 2:04pm Central, **31 set logs** |
| `scheduled_workouts` for that day | `status = 'completed'`, `workout_log_id` pointing at that log |

The card that draws either a green **Done** chip or a **Start** button reads
exactly that `status` column, and reads it correctly. The screenshot was taken
at 2:51pm — forty-seven minutes after the session was marked complete — and was
still showing the render made before he finished.

This is the second time the same symptom has been reported, and the first time
had a different cause. On 17 Aug it was the completion crediting the wrong
scheduled row when a day was forked mid-session; that is fixed and is why
`src/lib/completionTarget.ts` exists. Checked first this time, and the right row
was credited.

### Why a screen goes stale and stays that way

A page put aside and returned to is the whole problem: tap Done, swipe Back,
switch apps mid-set, lock the phone. The React tree is restored exactly as it
was left, server data and all, and nothing goes and asks whether any of it is
still true.

`RealtimeScheduleSync` exists and is mounted in the app layout, but it answers a
different question — somebody else moving a session while you sit on the screen.
It does nothing for a screen that was away.

### The fix

`RefreshOnReturn`, mounted in both shells beside the realtime sync: when the
screen comes back — `visibilitychange` to visible, or a `pageshow` with
`persisted` set, which is what a hardware Back produces — it asks the server
again.

**It refreshes; it never reloads.** That distinction is the whole safety of it.
A `pageshow` handler that called `location.reload()` broke the hardware Back
button on 1 Aug (the note is still in `HapticTap`): reloading on a bfcache
restore throws away the page Back has just restored and re-arms
`BackButtonGuard`'s sentinel entry, so every press went one level deeper and
Back could never win. `router.refresh()` re-runs the server components and
patches the tree in place — no history entry, nothing unmounted.

Two guards against a refetch on every flick between apps: a quiet period before
firing, and a minimum time away before it counts as a return. If the screen has
gone away again by the time the timer fires, nothing is spent.

### Two things found underneath it

**`scheduled_workouts.updated_at` was dead.** The row that completed today still
read 12 August on it, identical to `created_at`, because nothing maintained the
column. That is the first thing you reach for when the screen and the data
disagree, and it could not answer. It has a trigger now.

**The table was on `REPLICA IDENTITY DEFAULT` with RLS on.** Supabase's own
requirement for `postgres_changes` on an RLS table is `FULL`, without which
`old_record` cannot be sent — and `RealtimeScheduleSync` is written to no-op
silently when realtime gives it nothing. Set to `FULL`; the table takes a few
hundred writes a day, so the extra WAL is nothing.

Both are in `supabase/migrations/20260907a_a_completed_session_is_observable.sql`.

### Why now — this was fixed once already, and the fix was removed

Dustin: *"something recently caused that bc we've fixed it before more than
once."* He is right, and it is dated.

| | |
|---|---|
| **26 Jun** `1b60f66a` | *"Global bfcache buster: reload when page restored from back-forward cache (**stops phones serving stale workout screens**)"* — a `pageshow` handler in `HapticTap` that reloaded on every bfcache restore. |
| **1 Aug** `f55a7135` | *"Fix the hardware Back button. Two bugs, and they compounded"* — removed it. Correctly: reloading on a restore threw away the page Back had just restored and re-armed the sentinel entry, so every press went one level deeper. |
| **1 Aug → 7 Sep** | Nothing replaced the freshness it had been providing as a side effect. Five weeks unguarded. |

The removal note said it out loud — *"Whatever staleness this was guarding
against, the fix is not to defeat the browser's own back navigation"* — and then
nothing was built. `RefreshOnReturn` is what should have gone in that day: the
same protection, without the cost.

**What makes it stick this time is the test, not the component.** Nothing went
red when the 26 Jun protection was deleted, which is the only reason it could be
quietly gone for five weeks. Now: delete the file and the suite fails to read
it; unmount it from either shell and the mount count fails; swap `refresh()` for
`reload()` and the Back-button assertion fails. Mutation-tested in both
directions.

### And the write path was checked, not assumed

The obvious worry is that the save itself is flaky and the screen was telling
the truth. It is not. Across 60 days and every active client, the number of
sessions logged and completed on their own scheduled date whose scheduled row
was **not** credited: **zero**.

Five completed logs in 45 days have no scheduled row at all, and every one is an
off-plan or extra session — a client logging something other than what was on
the plan that day. That is the feature working, not a miss.

That query is now the `completed_session_not_credited` integrity check, running
twice a day at `critical`. It reads zero today, so anything it ever reports is
real.

---

## Interlude — two entries outvoted eight  ·  7 Sep 2026

Dustin, opening Kerrygold in the food sheet and getting grams, no tablespoon
anywhere in the picker, and 750 cal per 100 g: *"I still can log my fucking
butter!!!! no tbsp, multiple wrong numbers. you rebuilt the full fucking
database how are we still here?"*

Fair question. **This row never came from the catalogue.** The 6 Sep rebuild
replaced 322,000 catalogue rows and did not touch `refresh_trainer_foods`, which
generates his own foods from his own meal plans, weekly. Kerrygold is one of
those. So the rebuild was never going to fix it, and I had already written
"a trainer row's default amount is 1 g" into this document that morning as
*still open* — then fixed only the opening amount, not the missing unit. That
was the miss.

### Two entries beat eight

| in `meal_items` | |
|---|---|
| `butter` → **tbsp** | 8 entries, his own plans |
| `kerrygold irish butter` → **g** | 2 entries, both in Claudine's plan |

`unitHeUses` matched the whole name first and returned on the first hit, so the
longer name won on principle rather than on evidence. Worse, the answer was a
*weight*, which sets `heWeighsIt` in the sheet — and that skips the unit borrow.
The tablespoon was not merely unselected. It was absent from the list.

The rule is now his own count, with the more specific name winning ties. Every
case where he really does weigh a variant is untouched, because there the count
says so: sweet potato (cooked) is grams 38 times against sweet potato ounces 4
times. What changes is only the case where a household measure is better
attested than the weight.

A second bug fell out of the same function. USDA writes a generic food
head-first — "Butter, salted" — but a *branded* row is the other way round:
"Kerrygold, Naturally Softer Pure Irish Butter". Reading only the segment before
the comma found "kerrygold" and stopped, so a row that plainly says butter came
back with no unit at all. It now reads the head and then the whole string.

### And the row itself now carries the measure

The app-side rule is not enough on its own: the borrow that would have found a
tablespoon searches the catalogue by name overlap, and the nearest Kerrygold row
offers "1 serving", not "1 tbsp". So a weight-based trainer row now also borrows
the household measure from **his own row for the same food** — Butter, 1 tbsp,
15 g — longest matching name first. Ten rows had this shape; every match reads
as it should, blueberries' cup to the frozen ones, an almond's weight to the
sliced ones.

**It only adds an option.** The basis, the macros and `serving_grams` are
untouched, so no number moves as a result — there is simply a measure a person
can use next to the grams. And the same rule went into the weekly generator,
proven by deleting the tablespoon, running the job, and watching it come back;
without that, Monday 08:50 would have undone all of it.

### The numbers, honestly

750 cal / 100 g is wrong — real butter is 717, and Kerrygold's own label is 100
cal per 14 g tablespoon. It is wrong because of two lines in Claudine's plan:
**"Kerrygold Irish butter — 6 g — 5 g fat"**. Five over six is 0.833 g of fat
per gram, which is 83 g per 100 rather than 81, and the row is generated from
exactly that.

That is his programming, not catalogue data, so it has not been silently
rewritten — and it could not be fixed in the row anyway, because the generator
would rebuild it from those two lines next week. The fix is those two entries.
The client row already in the catalogue has it right: 99 cal, 11 g fat, 14 g.

---

## Interlude — the all-clear that was not looking at the criticals (8 Sep)

`/settings/data-health` showed the rows whose `ran_at` equalled the newest
`ran_at`. On a nightly run that is the whole board: pg_cron runs all eight check
functions in one transaction, so every one of the twenty-three checks carries an
identical timestamp.

It is not the whole board after anyone runs a single check function by hand.
That has happened at least six times, and it happened on **7 Sep at 3:20pm
Central**: three rows written, three hours after the 6:25am cron had written
twenty-three. The page fetches `order("ran_at", { ascending: false })` and took
row zero as "the latest run", so until the 6:25pm cron it showed **three checks
out of twenty-three, and all five criticals were among the twenty it hid.** Had
those three been clean — two of the three were — it would have printed
*"Everything passed — all 3 checks came back clean on the last run"* over an
unread critical.

**What the screen shows now:** the latest result of each check, not the rows
sharing the latest timestamp. The selection lives in `src/lib/dataHealth.ts` so
it can be tested; `tests/unit/dataHealthShowsTheWholeBoard.test.ts` is that
afternoon, and six of its seven assertions fail against the old filter.

Two details worth keeping:

- **A window, measured from the newest row rather than from the clock.** A check
  the runners no longer emit keeps its last row in `integrity_checks` for ever —
  `scheduled_workout_null_assignment_id` still has 493 against its name from
  3 Sep, retired that morning because all 493 were the standard shape. Showing
  the latest row per check without a window would re-raise a fault that was
  deliberately closed. Thirty-six hours clears a missed run and nothing older.
  Measuring from the data rather than from `now()` means the page keeps showing
  the last board it had if the checker itself ever stops, instead of emptying
  out and looking clean.
- **A check that missed the last run now says so**, with the date its result
  came from. That is how a check quietly dropping out of the rotation becomes
  visible on the screen rather than only in the table.

---

## Interlude — every food opens on its own unit  ·  8 Sep 2026

Dustin, on the two weeks before this: *"i want it to open to the correct grams
for 1 serving, not '1 serving' so butter should open to 1 tbsp and you can edit
it if you had more than that. every single food in that database needs to be set
up like that ive been trying to explain that for 2 weeks now... there are
hundreds of other apps out there to log food that dont have this problem."*

He is right that it should not have taken two weeks, and the reason it did is
worth writing down plainly.

### The work was already done. Nothing pointed at it.

The 6 Sep RACC pass named 78,266 foods correctly. `Rice, white, cooked` has
carried `1 cup = 158 g` since that night; `Bread, Cuban` has carried
`1 slice = 28 g`. **Every one of those rows still opened on "100 g"**, because
the naming went into `serving_options` and nothing ever chose from it. Four
attempts at "infer the unit" were built on top of a shelf that was already
stocked.

### What changed

| | |
|---|---|
| `food_serving_rules` | The 307-keyword RACC map, lifted out of a one-off script into a table, plus 20 produce keywords it never had. Widening it is now data entry. |
| `food_default_serving(name, options)` | One function, in Postgres, that decides what a food opens on. The app calls it through the column below; nothing re-derives it. |
| `food_catalog.default_serving_desc` / `_grams` | The answer, stored per row. 322,232 rows filled. |
| `householdServing()` | Reads the stored answer first, falls back to the old ladder for rows that predate it. |
| `FoodSearchSheet` | Opens on it — after his own unit map, which still wins. |

Before: **100%** of rows opened on "100 g". After: **10 rows** do. 79% carry a
real unit name; the remaining 21% have the right weight under a plain "1
serving" because no keyword matched them yet.

### The mistake that nearly shipped

The obvious move was to write 14 into `serving_grams` so butter would open on a
tablespoon. **`serving_grams` is the weight the macros are QUOTED for** —
`foodResolve` divides by it — so that would have declared 717 calories to be the
value of one tablespoon of butter. A 7× error on 471,633 rows, behind a label
that finally read correctly.

This exact rule is already written down twice in this file, from 5 and 6 Sep:
*"serving_desc/serving_grams describe the BASIS of the macros, never a
portion."* It was still nearly broken again, which is the argument for the
portion having its own column rather than a convention everyone has to remember.

### Decisions he made, recorded verbatim

- On adopting the real serving everywhere: *"A AND fix the names now."*
- On rows offering nothing but grams and ounces: *"whatever the average size of
  1 chicken breast is, that's your answer unless we give the acual oz or grams."*
- On his own 28 rows: *"B"* — see them before they change.
- On his unit map versus the row: *"A"* — his always wins.
- And the standing requirement: *"we should be able to change the units on
  anything and it should still be accurate but defualt should b ethe logical
  unit."* The stored default is added to the picker when the row's own options
  do not already carry it, so it is always changeable.

### Still open

- **68,594 rows read "1 serving"** with the right weight. Every one is a missing
  keyword, not a missing mechanism.
- **His own 155 foods are untouched** — 28 of them carry a wrong weight for the
  right unit, and he asked to see the list first.

---

## Interlude — a half cup has no leading zero  ·  8 Sep 2026

**494 foods opened on "1 .5 cup".** Broccoli read `1 .5 cup, chopped`,
grapefruit `1 .5 fruit`, oats `1 .333 cup`, a Campbell's soup
`1 .5 cup, condensed`. It is not a measurement, it is a parser talking to
itself, and a client who reads it stops trusting the screen — correctly.

**The cause.** USDA writes a half cup as `.5 cup`, with no leading zero. Both
Postgres parsers opened with `[0-9]+`, which requires a digit BEFORE the point,
so neither matched:

    food_serving_count_in('.5 cup')  ->  1          should be 0.5
    food_serving_label_of('.5 cup')  ->  '.5 cup'   should be 'cup'

The count fell back to its default of 1 and the `.5` stayed glued to the front
of the label, so `food_serving_fmt(1, '.5 cup')` rendered `1 .5 cup`.

**Why it survived a whole build.** `foodResolve.ts` parses the count with
`([\d.]+)?`, which *does* match a bare `.5`. TypeScript was right and Postgres
was wrong about the same three characters, and nothing compared them — until
Postgres started WRITING a default for TypeScript to read back. Two parsers for
one format is the underlying fault; they now agree.

**What a client sees now.** The row's own duplicate had the answer all along,
which is how the fix was checked:

| food | before | after |
|---|---|---|
| Abiyuch, raw | 1 .5 cup — 114 g | **1 cup — 228 g** |
| Grapefruit, raw | 1 .5 fruit — 123 g | **1 fruit — 246 g** |
| Broccoli, boiled | 1 .5 cup, chopped — 78 g | **1 stalk, small — 140 g** |

Zero garbled rows remain. `1.5`, `1/2` and `1 large` all still read as before.

**The guard.** A `check` constraint — `food_default_serving_is_readable` —
refuses any default containing a digit followed by a lone decimal point. This
shape arrived twice (the 6 Sep pass wrote it, the 8 Sep pass rendered it), so it
is now a constraint rather than a comment.

Migration `20260908b_a_half_cup_has_no_leading_zero.sql`. Reversible:
`bak_food_default_serving_20260908b`.

---

## Interlude — a cup of rice is not a cup of water  ·  8 Sep 2026

**His own programmed foods opened on a cup weighing 240 g.** 240 g is a cup of
*water* — the number you get when nothing knew what the food was. These are the
foods in his clients' meal plans, so a client logging the rice in their own plan
was charged half a meal again.

| food | opened on | a cup really is | over by |
|---|---|---|---|
| Spinach | 240 g | 30 g | **+700%** |
| Steel-cut oats (dry) | 240 g | 81 g | +196% |
| Broccoli | 240 g | 91 g | +164% |
| Pasta (cooked) | 240 g | 140 g | +71% |
| Blueberries | 240 g | 148 g | +62% |
| White rice | 240 g | 158 g | +52% |

**Fault 1 — the row's own wrong number beat a map that knew better.** The brain
trusts a row's own named serving first, which is right when the row knows
something. These rows did not: they carried the generic volume weight while
`food_serving_rules` held the real one. The map now wins one narrow case — same
unit, water's weight, and a map that actually disagrees. Deliberately narrow: a
cup of milk really is 244 g and a smoothie really is 240, so those moved by 4 g
and by nothing.

**Fault 2 — "in water" was the keyword.**

    Canned tuna in water   ->  matched 'water'  ->  1 cup = 240 g
    Sardines in water      ->  matched 'water'  ->  1 cup = 240 g

Longest keyword wins and `water` (5) is longer than `tuna` (4). This is the same
failure as `89d991fa` earlier the same day, where the word "water" answered for
his protein shakes — fixed there for one food, and here in the matcher. How a
tin is *packed* is not what is *in* the tin, so the packing medium now comes off
the name before any keyword is looked up. "Goya coconut water" keeps its water,
because there it is the food.

**28 rows corrected**, and his duplicates now agree with each other — blueberries,
pasta, white rice, egg whites and both potatoes each resolve to one answer.

### Still his call

- **Banana still disagrees with itself**: `banana` 1 medium 118 g,
  `Banana (medium)` 1 each 100 g, `Banana (small)` 1 medium 100 g. Those weights
  are his own entries, not the catalogue's, so they were left alone. A small and
  a medium banana cannot both be 100 g — but which is wrong is his to say.
- **The USDA half is untouched.** Most of its 1-cup-240-g rows are drinks, where
  240 is correct. A 322,232-row sweep is its own measured pass, not something to
  ride along on a fix to his own foods.

Migration `20260908c_a_cup_of_rice_is_not_a_cup_of_water.sql`. Reversible:
`bak_food_default_serving_20260908c`.

---

## Interlude — one chicken breast is an answer  ·  8 Sep 2026

Dustin, 8 Sep: *"for chicken breast this should be logical, this is where I need
you to build in a 'brain' for the database n all features that use it. if i say
I ate 1 chicken breast without any measurements, it needs to log the average
size chicken breast in oz. or give me small med large options w oz."*

His own row logged **1 oz — 28 g** for "Chicken breast". Saying you ate a chicken
breast recorded an ounce of one.

### Why this one is different from every other fix this week

Every other fix found the right number already sitting in the row. Here the
number is absent, and the number that IS there is worse than nothing. Across
every row in the catalogue naming a breast:

    median "1 breast"   863 g       p25 384 g       p75 1171 g

Because USDA's "breast" is a whole bone-in breast — both lobes, skin and bone:

| row | its "1 breast" |
|---|---|
| Chicken, rotisserie, breast, meat only | 483 g, with skin and bone |
| Chicken, broiler, rotisserie, BBQ | 384 g |

Nobody means 483 g. **Reading harder gives the wrong answer more confidently**,
so the size is a judgement written down as data — `food_piece_sizes` — marked as
a standard rather than a measurement, and changeable in one row.

**And the data agrees with the standard.** The one USDA row that measures what a
person actually buys says `1 breast, bone removed = 174 g`, against the 170 g
(6 oz) seeded here. That row is deliberately left alone — it measured it, we only
assumed it — but it is the check that the assumption is right.

### The rule

| he says | it logs |
|---|---|
| "1 chicken breast", no measurement | the **medium** — 1 breast (6 oz), 170 g |
| wants to be exact | small / medium / large, each with its ounces, in the unit picker |

Sizes are stored in grams because that is what the app logs; each description
carries its ounces because that is how he and his clients talk about meat. Both
parsers already discard a trailing `(...)`, so `1 breast (6 oz)` reads as one
breast to the app and as six ounces to a person. Small/medium/large are three
DISTINCT labels — "small breast", not "breast (small)" — because the parenthesis
is discarded and all three would otherwise collapse onto one unit.

### ⚠️ Why this applies to six rows and not five thousand

The first cut matched on the keyword alone. It touched 5,000 rows and it made
the database worse. Caught by reading the diff before keeping it:

| row | what the keyword did to it |
|---|---|
| Shrimp Soup Base | → 1 shrimp |
| Hillshire Farms turkey breast | → 1 breast (a deli pack) |
| Beef, bottom sirloin, tri-tip roast | → 1 steak (a roast is not a steak) |
| Chicken breast tenders, breaded | → 1 breast (a tender is not a breast) |
| Chicken breast, oven-roasted, sliced | → 1 breast (deli slices) |
| Shrimp (cooked) | → 1 shrimp, 10 g — nobody logs one shrimp |

Every one of those is the exact complaint this work exists to end. So the rule
now demands the food **be** the cut: the name, once parentheses and one leading
qualifier are stripped, must START with the keyword and must carry no
processed-form word. `shrimp` and `turkey breast` came out of the table
altogether — a shrimp is too small to be a portion, and a turkey breast is a
roast.

### What changed — all six, all his

| food | before | after |
|---|---|---|
| Chicken breast | 1 oz — 28 g | **1 breast (6 oz) — 170 g** |
| Chicken breast (cooked) | 1 oz — 28 g | **1 breast (6 oz) — 170 g** |
| Chicken thigh (cooked) | 1 oz — 28 g | **1 thigh (3.5 oz) — 99 g** |
| Chicken thigh (pulled, cooked) | 1 oz — 28 g | **1 thigh (3.5 oz) — 99 g** |
| Chicken thigh, boneless skinless (cooked) | 1 oz — 28 g | **1 thigh (3.5 oz) — 99 g** |
| Top sirloin, trimmed (cooked) | 1 oz — 28 g | **1 steak (8 oz) — 227 g** |

Each also gained its three sizes in the picker, e.g.
`1 small breast (4 oz) · 1 breast (6 oz) · 1 large breast (8 oz)`.

### Still open, and deliberately not done here

- **The picker shows the unit name, not the ounces.** "(6 oz)" lives in the
  stored description; showing it in the dropdown is a Nutrition-screen change and
  that screen has not been walked. Rule 6 — it waits.
- **The table has twelve keywords.** Chicken breast/thigh/tender/drumstick/wing,
  salmon, tilapia, pork chop, ribeye, sirloin, filet mignon, burger patty. Adding
  a food is one row; the list should grow as he names them.

Migration `20260908d_one_chicken_breast_is_an_answer.sql`. Reversible:
`bak_food_catalog_pieces_20260908d`.

---

## Interlude — a unit is not a name  ·  8 Sep 2026

Dustin, 8 Sep: *"I want real unit names based on serving sizes for those."*

68,853 rows opened on **"1 serving"** and 7,165 on **"1 unit"** or **"1 each"**.
The weight was right — it comes off the label — but the word tells a client
nothing. "1 each" is what a database says when it does not know what the food
is. A person says "1 bun".

**Where the vague words came from.** Twenty-six rules carried the label `each`
while their own keyword WAS the noun all along — avocado, bun, burrito,
croissant, donut, egg roll, grilled cheese, lemon, lime, nugget, olive, pancake,
pickle, roll, sandwich, string cheese, waffle. Every food matching them was told
it came in "eaches". The keyword, singularised, is the name.

| before | after |
|---|---|
| 1 each — 28 g | **1 pickle** — 28 g |
| 1 each — 28 g | **1 string cheese** — 28 g |
| 1 each — 43 g | **1 bun** — 43 g |
| 1 each — 57 g | **1 donut** — 57 g |
| 2 each — 117 g | **2 pancake** — 117 g |
| 1 each — 217 g | **1 burrito** — 217 g |

### ⚠️ Why this renamed 3,623 rows and not 45,283

45,283 could have been touched. Reading the diff first found two ways it went
wrong, and both are **worse than the vague word they replace** — wrong beats
vague only in the bad direction, and that is the whole complaint:

    All-Natural Unsweet Tea, Lemon & Lime   ->  "6 lemon"      a soda
    Gourmet Black Olive Pate                ->  "8 olive"      a pate
    Cookie, oatmeal sandwich, creme filled  ->  "1 sandwich"   a biscuit
    Pork, cured, ham, slice, pan-broiled    ->  85 g becomes 28 g

Three guards, one per failure:

1. **A flavour is not a food.** When a name carries "flavor", "tea", "soda",
   "juice", "candy", "pate" and the rest, a whole-food keyword is describing the
   flavour. A lemon-flavoured soda is not lemons.
2. **Manufactured forms only** — bun, roll, burrito, pickle, donut. Produce
   words stay out until a fruit can tell food from flavour, which is a bigger
   job than a rename.
3. **The grams may not move.** A row is renamed only when the new answer weighs
   exactly what the old one did. Verified after the run: **0 weights moved.** So
   nothing a client has logged can regress on this commit.

### Still open — and it is the biggest number left in the food work

**68,778 rows still say "1 serving" and 73,453 still carry a vague word.** Every
one is a missing keyword, not a missing mechanism: the machinery now names a
food the moment the map has a word for it. Closing them is keyword coverage, and
each keyword needs a real piece weight — which is the same care the piece-size
table took, at a hundred times the scale. It should be its own pass, measured
the same way: propose, read the diff, keep only what does not move a gram it
should not.

Migration `20260908e_a_unit_is_not_a_name.sql`. Reversible:
`bak_food_serving_rules_20260908e`, `bak_food_default_serving_20260908e`.

---

## Interlude — a small banana is 101 grams, and the app should know that  ·  8 Sep 2026

Dustin, 8 Sep: *"these decisions are not mine to say. I'm not gonna go through
half a million different foods and figure out the macros and the grams... You
can go online as AI and figure out how many grams a small banana is. That needs
to happen for all of these foods."*

**He is right and the session before this one got it wrong.** It found that his
three banana rows all said 100 g, reported it, and called it "his to say". How
much a small banana weighs is a fact with a source. It is not a programming
decision and he must never be asked for it again. That reflex — handing a
knowable fact back to him as a question — is the thing to stop.

### The root cause of two weeks of this

He asked the right question: *"Where are those numbers coming from?"*

Every nutrition app — MyFitnessPal, Cronometer, LoseIt — gets "1 small" /
"1 medium" / "1 large" from **one** place: the `food_portion` file of USDA
FoodData Central. It is free, public and definitive. **Our import took the
nutrients and a handful of cup measures and left that file behind:**

    rows carrying ANY size portion        706
    searchable rows                   322,232        0.2%

So the app was never given the data that answers "how big is a small banana".
**Every workaround in the food code — the keyword map, the RACC pass, the
piece-size table, `weighedDefaultAmount` — is a substitute for a missing
import.** That is why this kept coming back no matter what got patched.

**His own rows show it exactly.** "Bananas" carried USDA's own description,
`1 large (8" to 8-7/8" long)`, with the weight overwritten to **100 g**. The
label came from USDA and the number did not.

| row | was | now |
|---|---|---|
| Banana (small) | 1 medium — 100 g | **1 small — 101 g** |
| Banana (medium) | 1 each — 100 g | **1 medium — 118 g** |
| Bananas | 1 large — 100 g | **1 medium — 118 g** |
| banana | 1 medium — 118 g | unchanged |

Every banana row now offers `1 small 101 · 1 medium 118 · 1 large 136`, and a
row whose NAME says a size opens on that size — "Banana (small)" was the one row
already carrying the answer, and it was the one being ignored.

### What was built

- **`food_portion_reference`** — what one small/medium/large of a food weighs,
  every row recording the FDC id it came from. The app's answer, not the
  trainer's. This is the landing table for the full import.
- **`food_size_in_name()`** — a row that names its size gets that size.
- **`scripts/import-usda-portions.mjs`** — the importer, written and ready.

`serving_grams` is deliberately untouched: it is the weight the macros are
QUOTED for, and moving it to 101 would declare a banana's per-100 g macros to be
the value of one small banana. Same rule as `20260908a`, and it nearly broke
again here.

### ⚠️ The one thing blocking the other 322,000 rows

**This session cannot reach USDA.** The environment's network policy blocks it:

    api.nal.usda.gov       connect_rejected (organization policy)
    fdc.nal.usda.gov       blocked by the egress proxy
    data.gov, huggingface  blocked
    github.com             reachable — but nobody mirrors food_portion.csv

Checked, not assumed: every host above was probed. Web *search* works, which is
how the banana numbers were confirmed, but searching one food at a time is not
an import.

**To finish the database, allow `api.nal.usda.gov` in the environment's network
policy and add a free FDC key** (a minute at `fdc.nal.usda.gov/api-key-signup.html`).
Then:

    USDA_FDC_API_KEY=xxxx node scripts/import-usda-portions.mjs

It reads SR Legacy and Foundation — the whole foods, the ones with sizes —
and fills `food_portion_reference` with a traceable source per number. Branded
products already carry their label serving and are not the problem.

Migration `20260908f_a_small_banana_is_101_grams.sql`. Reversible:
`bak_food_catalog_banana_20260908f`.

---

## Home, AI item H — his assistant, not him  ·  9 Sep 2026

Ruling 4 of the AI contract, built. Dustin re-approved the wording on 9 Sep,
word for word:

> "Dustin's assistant — knows your programme, your logs and how he trains you.
> Anything real goes to him."

**What it was doing instead.** The coach sheet — one shared component mounted on
every client screen — labelled every reply **`COACH`**, and two of its nine
greetings opened with **"I'm your coach"**. In the first line a client read, the
app claimed to *be* him.

The reasoning recorded with the ruling is why this matters more than it looks:
clients *discovering* they were talking to a bot is a top-three risk to trust,
and an undisclosed assistant means that on the day it is discovered, **every
warm message he actually wrote gets re-read as generated.**

### What a client sees now

A standing line at the top of the sheet, above the conversation:

> ✦ **Dustin's assistant** — knows your programme, your logs and how Dustin
> trains you. Anything real goes to Dustin.

- The per-message label reads **`DUSTIN'S ASSISTANT`**, not `COACH`.
- The two greetings that impersonated him no longer do. Their capability lines
  are unchanged — "I can see your logs, targets and trends" is still true and
  still the useful half.
- **Said once, standing**, rather than repeated into every greeting. Rule 7 bans
  walls of obvious text, and a disclosure that repeats on every message is the
  thing people learn to skip.

### ⚠️ The name, never a pronoun

His wording says "how **he** trains you" because he was describing himself. Half
the clients on this deployment are **Stephanie's** — `coachIdentity` exists
precisely because one name cannot serve two trainers — and `CoachIdentity`
carries no pronoun field to read. So the rendered copy uses the coach's NAME
everywhere his wording used a pronoun. Stephanie's clients read "Stephanie's
assistant — knows your programme, your logs and how Stephanie trains you."

Same sentence, same warmth, correct for every coach, and it needs no field that
does not exist. A test asserts no pronoun can creep back into that block.

### Where it appears

One component, `CoachChatSheet`, mounted globally by `GlobalCoach` — so Home,
Nutrition, Progress, Messages, Settings and Help all get it from this one
change. The **workout logger is deliberately untouched**: `GlobalCoach` returns
null there, the logger mounts its own coach, and that screen is off limits
without per-item permission. It gets this when the logger is walked.

Four tests in `tests/unit/hisAssistantNotHim.test.ts`.

---

## Home — today's workout opens two ways  ·  9 Sep 2026

Dustin, 4 Sep and again 9 Sep: *"that today's workouts section... we need to add
the view button. So we have the start and the view button just like on the
workout page."* The resume had it as the last place a workout opened only one
way.

**It was worse than a missing button.** Both branches of the tile — the single
branded card and each row of the multi-workout list — wrapped the *whole card*
in a link to the **overview**, while the pill sitting on it read **"Start
Workout"**. The one control was labelled Start and did View. A client who tapped
Start landed on the overview and had to find another button to actually begin.

Counted in the code before the change: the word "Start" appeared twice in that
region and `?start=1` appeared **zero** times.

### What a client sees now

| | Start | View |
|---|---|---|
| Single card | white pill → `?start=1`, enters the session | outlined pill → the overview |
| Each row of a multi day | primary pill → `?start=1` | tinted pill in the row's own colour → the overview |

- **A completed session keeps View** and loses Start — it is how a client reads
  back what they actually lifted.
- The card wrapper is gone. Two destinations cannot live inside one anchor, and
  a nested `<a>` is invalid HTML, so the card is a container and the two buttons
  are the links.
- Same split, same words and same order as the Workout tab, so the pair means
  the same thing in both places.

Five tests in `tests/unit/todayOpensTwoWays.test.ts`. The load-bearing one is an
invariant rather than a snapshot: **every control that says "Start" must carry
`?start=1`.** Against the pre-change file that reads 2 Starts and 0 flags, which
is the bug stated as a number.

---

## Workout tab — today left a hole in the week  ·  9 Sep 2026

Dustin, 9 Sep, having moved two sessions onto today and then opened the past
strip: *"wed is missing."*

**It was not missing.** The data was right the whole time — both sessions sat on
Wednesday 9 Sep, carrying `moved_from_date` 7 Sep and 8 Sep exactly as he had
moved them, and today's tile rendered them correctly at the top of both Home and
the Workout tab.

**The board was telling him otherwise.** Today is hoisted to the top — right,
and it stays — but it was then *filtered out* of the chronological run below.
With the past strip open that list read:

    Monday, Sep 7   →   Tuesday, Sep 8   →   Thursday, Sep 10

A gap in a date sequence does not read as "moved to the top". It reads as **lost
data** — and he had just moved two sessions onto that exact date, so the first
thing it looked like was the move having failed. He was right to report it and
right about what he saw; only the diagnosis was different.

### The fix — a pointer, not a hole

Today keeps its slot in the sequence, filled with a single line rather than a
tile:

> ☀ **Today · Wednesday, Sep 9** — 2 sessions · at the top ↑

Tapping it scrolls back to the real tile. It carries the **session count** for
the same reason the gap was a problem: the number is what says *your two moved
sessions are on this date*, right where the eye is looking for them.

One line and not a tile on purpose — it must not compete with the real today
tile, and it must not look like a second copy of the same day on one screen.

### The lesson worth keeping

The board's reading order is deliberately not chronological, and that is
documented and correct. What was missing is that **a deliberate reordering has
to leave a mark where it moved something from.** Silence in a numbered sequence
is indistinguishable from a bug — and the client it looks like a bug to is the
one who just made the change.

Five tests in `tests/unit/todayLeavesNoHole.test.ts`; three of them fail against
the pre-change file.

---

## One client app — Client View and a client's app are now the same  ·  9 Sep 2026

Dustin, 9 Sep, on finding out they were not: *"we need to make my client app
work exactly like any other clients so i can test the same exact app they are
using... this is something we've discussed before and needs to be locked in
permanently so we dont run into this again. i was not aware they were looking at
a diff screen than i am and that is not good."*

### What differed

They were two different code paths in `src/app/(app)/layout.tsx` — a trainer got
`TrainerLayoutWrapper`, a client got the branch below it — and the chrome had
quietly diverged:

| | Client View (his) | A real client |
|---|---|---|
| Top bar | Branded: logo, "Symmetry · My Training" | **A bare sticky strip** with the feedback button pushed right |
| Bell + feedback | Yes | Yes |
| Trainer View | Yes | No — correctly |
| Bottom nav | Same six tabs, same order, same icons | Same |

### ⚠️ Why this was worse than cosmetic

**It had already cost real time.** The nutrition logger's "very sticky
scrolling" was chased as an app bug. It existed ONLY in Client View, because
that wrapper added a nested scroller real clients never had — the code comment
in `TrainerLayoutWrapper` says so outright. A test surface that differs from the
real one does not merely fail to catch bugs: **it invents them, and they then
get fixed in the app that never had them.**

### The fix, and the part that makes it permanent

One component — `ClientTopBar` — mounted by both. Not two blocks of JSX that
match today, because those drift and nobody notices until a client reports
something the trainer cannot reproduce.

The **only** difference is a `trailing` slot carrying the Trainer View toggle.
Dustin, the same day: *"just remember they cannot have that trainer view
toggle."* A real client has no trainer view to go to, so the button, the
handler and the mode flag are all absent from their layout — asserted three
ways, including against the raw file with comments included.

**Bottom navs were already identical** and were left alone: same six tabs, same
order, same icons, same labels. Only the hrefs differ — his carry `?as=client`
so the SERVER renders the client branch on first paint, which fixes an
intermittent trainer-UI leak. That difference is deliberate and must not be
"fixed".

**Routing was not touched.** Checked against the diff: no href, route, redirect
or `router.push` changed in either file. He asked for that specifically —
*"routing needs to be watched very carefully bc that's where things can change a
bit."*

### The standing rule, locked in

**The trainer's Client View and a client's app are the same app.** Every fix
lands on both, always. `tests/unit/oneClientApp.test.ts` fails if a second top
bar is hand-rolled, if either mount stops using the shared one, if the tabs stop
matching, or if a trainer-only control reaches a client.

---

## INTERLUDE — Nutrition in the tile format: the mock-up, before the walk

Dustin, 9 Sep, opening screen 3: *"Let's start on nutrition. However, before you
run the inventory, look back through our notes. We talked about transferring the
layout as far as the visuals from the home page. We've already done it on the
workout page. We need to transfer that over to the nutrition page now. Show me a
mock up of what you're going to do before you do it. and remember that needs to
be on my client view and on the clients. actual client view."*

`APP-FORMAT.md` §5 already required this: *"Each screen gets a mock-up Dustin
approves before it changes. Every time. He rejected three layouts before
approving the current one."* Mock-ups show **all thirty schemes**.

**Built:** `docs/mockups/nutrition-format.html`, generated by
`scripts/gen-nutrition-mockup.py`, and published for phone viewing at
<https://claude.ai/code/artifact/c52d0283-f009-4946-8fbb-1ae34c719c6b>.

### The one thing that makes this mock-up worth trusting

It **inlines the app's real `globals.css`** rather than copying colours out of
it. The same `.sym-*` rules, the same thirty `[data-theme]` palettes, the same
four `[data-deep]` levels, and `AutoDark`'s luminance test replayed in ten lines
of JS. A mock-up drawn from hand-picked hexes can look right and ship wrong;
this one cannot drift, because it *is* the stylesheet. It also flips to the
screen **as it is today**, so the comparison is like for like.

### What the format brings over

| Rule | How it lands on Nutrition |
|---|---|
| The cap, no side borders | Every tile: day summary, assistant, each meal, extras |
| Nesting is the same object smaller | A meal is a tile; the food inside is that tile smaller |
| Today is filled bright and renders first | The **day summary** is this screen's "now" — bright fill, sweeping cap, already at the top |
| Ladder shading, one colour six shades | M1 → M6. Six meals, six shades — it fits a day better than it fits a week |
| Two rows of text max, name never cut | Kept for meal names; the food list is its own object (`.sym-food`), because a meal has always listed every item on its own line |
| The three contrast rules | Buttons and chips stop vanishing on the tinted schemes — Carbon Neon and Blush Cloud are the two to check |

### What it fixes on the way past — format only, no behaviour

- A meal's **foods and its controls stop competing for one row**. Today the
  ring, name, food list, macros, `⠿` handle and `⋯` all share a single flex row,
  which is why the row grows tall and the drag handle ends up beside the text.
- **Meal options A / B become real objects** instead of two lettered buttons —
  the same shape as two workouts inside one day tile.
- **An empty slot reads as empty** (the rest-day shape), not as a normal card
  with a line of blue text in it.

### ⚠️ The decision put to him, not assumed

**The next meal due: bright in place, or hoisted to the top?**

On the Workout tab today is lifted out of date order and drawn first. A day of
meals is not that list: **M1 → M6 *is* the order you eat in**, and hoisting M3
above M1 breaks the only thing that makes it readable — and it would move again
as the day went on.

So the mock-up **leaves the next meal in place** and marks it with a `NEXT` meta
label, giving the bright fill to the day summary instead. That is the one place
this screen deliberately does not copy the Workout tab, and it is his to rule
on, not mine to assume.

### Explicitly not in this change

`"numbers are way off"` (the day total against the target), **Nutrition %** and
how adherence calculates, and the logging sheets / food search / photo path.
All behaviour, all part of the walk itself — the format lands first so the walk
is done against the screen he approved.

### Where it goes

One component, so it lands on **his Client View and the clients' app together**,
the way `ClientTopBar` now does. There is no second copy to keep in step.

### SHIPPED — the format is live on Nutrition (9 Sep)

Dustin approved the mock-up with two rulings, and both are now enforced by
`tests/unit/nutritionWearsTheFormat.test.ts` rather than trusted:

> *"do not lift meals, leave them in order we eat them in. bright fill on today
> block as in the mock up is correct."*

| Element | Before | Now |
|---|---|---|
| Page | plain `pb-8` div on the app background | `.sym-page` — sink, tile depth, cap, ladder ink |
| Date row | `‹ date ›` with the `⋯` absolutely positioned at `right: 3` over a centred flex row | `.sym-title`; the `⋯` is a normal item and can no longer sit on top of the `›` |
| Recipes | a small bordered link | `.sym-past` strip, capped |
| Incoming plan banner | gold rounded box | `.sym-jump`, its gold kept |
| Day summary | flat card, hero 21px | `.sym-tile.is-today` — **the one bright thing on the screen**, and only when the day really is today |
| Range chips | primary-filled pill | `.sym-chip` with `aria-pressed`, so it announces its state |
| Macros | three `pill()` boxes, carbs hard-coded `#5ec9a3` | `.sym-mac` objects; **no per-macro hue** — colour means position, not type |
| Adherence / logging | two centred columns under a dashed rule | `.sym-split`, two capped objects |
| Weekly read + coach note | cards with a 3px coloured **left border** | `.sym-tile`; no side borders, the cap carries it |
| Coach note attribution | an AI badge and a paragraph, nothing naming it | head reads **`<COACH>'S ASSISTANT`** — ruling 4, the name never a pronoun |
| A meal | one flex row holding ring + name + every food line + macros + `⠿` + `⋯` | `.sym-tile`: head (name, badges, calories), body (food), action strip (ring, Edit, `⋯`, `⠿`) |
| Meal options A / B | two lettered buttons — **nested inside the row's own `<button>`** | each option is a `.sym-wo` object with its food and its cost, and choosing is a real button |
| An empty slot | a normal card with a line of blue text in it | the `.sym-rest` shape — it reads as empty |
| Extras | one row, name `truncate`d | `.sym-tile`; the name wraps and is never clipped |
| Log ring | 46px circle at the head of the row | `.sym-ring`, 44px, in the action strip |

### Three real defects the conversion ended, not just moved

1. **Nested buttons.** The A / B option buttons lived inside the row's own
   `<button>`. That is invalid HTML, and browsers resolve it by dropping the
   inner element out of the button — which is why a tap on A sometimes opened
   the meal sheet instead of switching the option.
2. **The `⋯` overlapped the `›`.** `position: absolute; right: 3` over a
   `justify-center` row: on a long date the two controls collided.
3. **`truncate` on an extra's name.** The name IS the record of what was eaten
   — the same column the composer writes — and anything longer than the card was
   cut with no way to read it.

### What did NOT change

No behaviour. Every control that was on the screen is still on it, doing the
same thing: the ring still logs, `⋯` still opens the meal sheet, `⠿` still
drags, the range chips still drive the same state, the nutrient disclosure still
collapses. `"numbers are way off"`, Nutrition %, the logging sheets, food search
and the photo path are all untouched and are the walk itself.

**Both surfaces at once.** `/nutrition` and `/client-preview/nutrition` mount the
same component, so this landed on his Client View and on real clients together —
asserted, so it stays that way.

### SHIPPED — adherence is hitting the numbers (9 Sep)

Dustin, 9 Sep: *"the adherence i want to be based on hitting numbers alone so
cal and macros, not logging since we have the logging rate. the adherence needs
to be based on hitting the numbers on daily average for that week up to that day
within that week."*

**This supersedes his 31 Jul ruling** (*"adherence should be based on
consistently logging and hitting macros n calories"*), which made it
`consistency × accuracy`. The reason the old one had to go is visible on the
card itself: adherence and logging rate sit **side by side**, so folding logging
into adherence charged a missed day twice, once in each column. A client who
logged 5 of 7 days and hit target on all five read **71% adherence** — a number
that says they missed their numbers when they missed none.

| | Before | Now |
|---|---|---|
| Formula | `consistency × accuracy` | `accuracy` — the daily hit score, averaged |
| What one day scores | mean of cal / P / C / F against that day's target, ±10% = full credit, zero at 50% off | **unchanged** |
| The window on the card | Sunday → today | **unchanged** |
| The day in progress | **counted in the average** | left out of the average, still counted as logged |
| Card copy | "logging × macros" | "hitting the numbers · this week so far" |
| No target on file | meal-status average, labelled "plan meals" | **unchanged** — nothing else can be computed |

### Two defects found while doing it

1. **The client and the coach were shown different numbers for the same week.**
   `excludeDates` — the option that keeps a half-eaten day out of an average —
   has existed since the module was written, and `weekly-context.ts` (what the
   AI is briefed with) always passed it. `useNutritionAverages`, which draws the
   number the **client** reads, never did. Now both do. It matters more under
   the new formula: at 8am today's totals are near zero against a whole day's
   target, which scores ~0% and drags the week down until dinner.
2. **A caller with a target but no window silently got the wrong measure.** The
   old gate required *both* `consistency` and `accuracy` before it would score,
   so handing over a perfectly good target with no `windowDays` fell back to the
   meal-status average — a different measurement wearing the same label.

### One implementation, four readers

`summariseLogRange` is the only place this is computed. The client card, the
averages strip, the home tile and the AI's weekly context all read it, which is
why the change is one function and the tests are on that function.

The AI's briefing now states both figures and is told, in the prompt, never to
merge them or describe one as the other.

---

## SCREEN 3 — NUTRITION · MY OWN AUDIT, BEFORE THE WALK (9 Sep)

Dustin: *"go ahead and fully audit the nutrition log yourself first to find any
obvious issues to report. then lets do the walk through button by button... take
your time here this one has to be perfect."*

**Readable version, with the six decisions:**
<https://claude.ai/code/artifact/d76b5285-7578-4ca5-a428-dcf507448ad3>

Everything below was read out of the code and then **checked against the live
database**, so each item carries a count rather than a suspicion. Nothing here
has been changed — these are for him to rule on before the walk.

### ⚠️ ONE FALSE POSITIVE, CAUGHT AND KILLED BEFORE IT REACHED HIM

The first pass reported *"Claudine's plan is 4,869 kcal against a 1,650
target — 195% over."* **That was my bug, not hers.** Her plan offers 15 meals
across 7 positions (options A/B/C), and my query summed every meal instead of
one per position. Re-run properly her plan is 1,467 kcal — 11% under, which is
an ordinary drift. Recorded here because the standing rule exists for exactly
this: a query that double-counts options looks identical to a broken plan.

---

### 1 · THREE PLACES A FOOD'S MACROS COME FROM, AND TWO OF THEM LET THE MODEL INVENT THE NUMBER

| Path | Where the numbers come from |
|---|---|
| Typed · "describe it loosely" · voice | `/api/nutrition-ai/parse` — the model says **what** was eaten, every number is read off a `food_catalog` row, and a food that matches nothing is **excluded and named** so it can be searched by hand |
| **Photo** | `/api/analyze-meal-photo` — the model states `calories`, `protein_g`, `carbs_g`, `fat_g` itself. No catalogue lookup anywhere in the route |
| **The AI chat — "I ate a banana", "swap M4 for wings"** | `/api/nutrition-ai/act`, whose prompt says, in these words: *"Estimate realistic macros per item (grams protein/carbs/fat, kcal)."* No catalogue lookup |

The parse route's own header records why it was rebuilt: *"The parse prompt used
to ask it to estimate macros using USDA / nutrition-label knowledge, which is
recall plus arithmetic, and it got both wrong in ways that looked right."* **That
prompt is still live in the other two paths**, and the chat one is the path he
asked about.

**And the chat path keeps the invented number.** `swapMealCustom` calls
`saveMyMeal(name, items)`, so a macro the model made up is written into the
client's My Meals library and re-used every time they pick it again.

**Why no arithmetic check will ever catch this.** All 154 client-saved foods are
internally consistent — kcal agrees with 4/4/9 of their own macros, every one.
The `banana` row reading **242 kcal · 2P · 27C · 14F** is perfectly
self-consistent. It is simply not a banana. A fabricated macro is consistent *by
construction*; only sourcing it from a row can catch it.

**149 of those 154 rows have no `serving_grams` at all**, so "1 serving" of a
client-saved food has no weight behind it and can never be scaled or converted.

### 2 · THE `verified` BADGE MEANS NOTHING

| Source | Rows | Marked verified |
|---|---:|---:|
| `usda_branded` | 442,891 | **100%** |
| `usda_generic` | 11,732 | 100% |
| `usda_core` | 8,789 | 100% |
| `usda` | 7,766 | 100% |
| `trainer` | 155 | 100% |
| `restaurant` / `brand` | 143 | 100% |
| `client` | 154 | 0% |

Everything that is not client-created is stamped verified — and `usda_branded`
is the **manufacturer-submitted label** half of FoodData Central, which is the
crowd-sourced part. Two live examples, both `verified: true`:

- `Banana` — **336 kcal, 0 g protein, 78.6 C, 1.1 F per 100 g** (a raw banana is 89)
- `Banana` — **312 kcal, 12.5 P, 40.6 C, 6.3 F per 100 g**

This is the same failure MyFitnessPal has: their own help page says *"even
verified entries can sometimes have mistakes"*, and a published analysis found
**~30% of the top 1,000 most-logged foods carried a >20% error in at least one
macro**. Cronometer's answer is the opposite — no crowd row enters the main
database at all, and each entry is labelled with its actual origin (USDA, NCCDB,
CRDB) instead of a badge.

### 3 · 23,385 CATALOGUE ROWS DISAGREE WITH THEMSELVES

Out of 471,633 rows carrying full macros, **23,385 (5.0%)** have a `kcal` that
differs from 4/4/9 of their own protein/carbs/fat by more than 25 cal or 15%.
**900** rows over 100 kcal declare zero carbs *and* zero fat. 11 are physically
impossible per serving.

### 4 · THE BANANA HE COMPLAINED ABOUT IS STILL WRONG — IN THE TRAINER ROWS

Search "banana" today and the top three are his own:

| Name | Serving says | kcal | P / C / F |
|---|---|---:|---|
| Bananas | 1 large (8"–8-7/8") — **but `serving_grams` = 100** | 128 | 1 / 31 / 0 |
| Banana (small) | **"1 medium"** | 112 | 2 / 26 / 0 |
| Banana (medium) | "1 each" | 112 | 1 / 27 / 0 |

The name and the serving description contradict each other on two of the three,
and **small and medium are the same 112 kcal** — the exact complaint from 8 Sep.
The `food_portion_reference` work fixed `food_default_serving()`; these three
rows carry their own hard-coded numbers and were never touched by it.

### 5 · HIS OWN PLAN CANNOT REACH HIS OWN TARGET

Plan v7, one meal per position:

| | Plan | Target | Off by |
|---|---:|---:|---:|
| Calories | 4,213 | 4,462 | **−5.6%** |
| Protein | 254 | 267 | −4.7% |
| Carbs | 381 | 381 | 0.0% |
| Fat | 186 | 208 | **−10.7%** |

Eat the plan perfectly and the card reads 4,213 against 4,462, every day. And
because fat lands 10.7% off, a **flawless day scores less than 100% adherence** —
the full-credit band is ±10%.

He is not alone, and **fat is the macro that drifts everywhere**:

| Client | kcal | protein | fat |
|---|---:|---:|---:|
| Madeleine Coker | −19% | **−34%** | **+53%** |
| Gerard Gautreaux | +17% | −5% | **+52%** |
| Sharon Gautreaux | +6% | +11% | **+55%** |
| Brooke Orton | −1% | +24% | **−36%** |
| Jerry Bourgeois | +4% | −6% | **+32%** |
| Dustin | −6% | −5% | −11% |

The AI plan builder already enforces 3% on calories and 5 g on each macro and
prints the drift in orange when it misses. **Hand-built plans are never
checked**, and nothing on the trainer's plan screen or the client's card says
the plan does not add up to the target it is graded against.

*Confirmed clean, so it is not the cause:* his M6 really is 766 kcal in the
plan, so the number he questioned on 4 Sep was the app telling the truth.

### 6 · 95 LOG ROWS CARRY A CALORIE THAT DISAGREES WITH THEIR OWN MACROS

Up to **731 cal** apart, and they are still inside every average and every
adherence figure. The pattern is photo-era rows at the legacy 101/102 band with
**`est_fats` = 0**:

- "4 slices of sausage pizza" — 1,120 kcal, 52P / 98C / **0F** (macros say 600)
- "Bowl of yogurt" — 520 kcal, 18P / 52C / **0F** (macros say 280)
- "3/4 cup egg whites, green beans" — 95 kcal but **203 g protein**

Also 9 off-plan rows saved with details and **zero calories**.

### 7 · "MACROS TONIGHT" IS A PROMISE NOTHING KEEPS

The off-plan sheet offers *"save it as pending — macros get filled in tonight"*
and the summary card prints *"totals update tonight"*. **There is no job.**
`vercel.json` runs four crons — weekly-ai, weekly-ai refresh, birthdays, goals —
and none of them touches `macros_pending`. Nothing anywhere flips a pending row
to resolved.

Live impact today is **zero rows**, so this is a dead promise rather than a live
wrong number — but the button is on the screen.

### 8 · WHAT THE AI CAN ACTUALLY DO, AND WHAT IT ASKS FIRST

Worth writing down plainly because it is better than it looks:

- Eight actions: `swap_meal`, `add_to_meal`, `move_meal`, `copy_meal`,
  `delete_meal`, `add_snack`, `log_meal`, `unlog_meal`.
- **Nothing mutates until Confirm.** The reply renders as a bubble plus a
  confirmation card; the write only runs on tap, and a failure says so and
  changes nothing.
- Any meal reference it cannot resolve — missing, or two plausible matches —
  **downgrades the whole action to a clarifying question**. It never guesses
  which meal you meant.
- Every write goes to the **day on screen**, and every label names that date
  when it is not today.

The gap is not the control flow. It is item 1: what it confirms can contain a
number nobody sourced.

### THE SIX CALLS PUT TO HIM — none of these are decided

Recorded so a later session does not read a recommendation back to him as his
own instruction. **Nothing below is his yet.**

1. **Route photo and chat macros through the food database** (recommended). Same
   shape as typed: the model identifies *what*, the database supplies the
   numbers, anything unmatched is shown by name. Photo keeps the model for
   identification and restaurant detection.
2. **Stop saving unsourced foods into My Meals** (recommended). A food enters the
   library only once it resolves to a real row.
3. **Make `verified` mean something.** Drop it from the 442,891 manufacturer-label
   rows, keep it for USDA core/generic and trainer rows — or take Cronometer's
   stronger line and show the *origin* instead of a tick. Design pass, so it is
   his to pick.
4. **Check a hand-built plan against the target** (recommended). The same 3% / 5 g
   check the AI builder already runs, printed on the trainer's plan screen. Six
   live plans would flag today, five of them on fat.
5. **"Macros tonight" — build the nightly job, or take the button off.**
6. **The 95 bad history rows — recompute, flag, or leave as history.**

### Research consulted, so the recommendations are not invented

- Cronometer curates every submission and labels entries by origin (USDA, NCCDB,
  CRDB, Nutritionix) rather than by badge; crowd rows never enter the main
  database.
- MyFitnessPal's own help page says a verified entry can still be wrong and an
  unverified one can be right. A published analysis found ~30% of their
  top-1,000 most-logged foods carried a >20% error in at least one macro.
- On off-plan logging, the consistent finding across app reviews is that
  **friction, not accuracy, decides whether a meal gets logged at all** — which
  is the argument for keeping the photo and chat paths fast and fixing where
  their numbers come from, rather than making them slower.

Sources: [Cronometer vs MyFitnessPal](https://feastgood.com/cronometer-vs-myfitnesspal/) ·
[Verified vs community food data](https://nutriscan.app/blog/posts/verified-vs-community-food-entries-accuracy-2026-044a380ccd) ·
[The fastest ways to log food](https://www.intakenutrition.io/blog/fastest-ways-to-log-food-less-friction)

### SHIPPED — the chat stops inventing macros, and the brain goes online (9 Sep)

Dustin's rulings on the audit, in his words:

> **1** — *"thats fine but also ai needs to be involved here, if it's not in the
> data base they need a way to search in online through ai and get real numbers.
> again this is the whole point of having a 'brain' in the app."*
> **2** — *"def stop saving foods that are not accurate."*

| | Before | Now |
|---|---|---|
| The chat's prompt | *"Estimate realistic macros per item (grams protein/carbs/fat, kcal)"* | *"YOU NEVER STATE A NUTRITION FIGURE"* — names and amounts only, same rule the parse prompt has carried since 26 Aug |
| Where a chat food's numbers come from | whatever the model said | `food_catalog`, then **USDA FoodData Central over the network** when the catalogue is short one |
| A food nothing can price | priced anyway, from recall | named back: *"I couldn't find X, and I won't guess"* |
| A partly-resolved meal | silently short | the confirmation says which food is missing, **before** the tap |
| Saving to My Meals | always | **only when every item resolved to a real row** |
| The pricing loop | inline in the parse route | one function, `priceNamedFoods`, called by both |

**The brain's online step.** On a catalogue miss the app queries FoodData
Central for the real measured rows and hands them to the *same* pick prompt
every other path uses — the model chooses between rows it can see and is never
asked for a figure. What it picks is written into `food_catalog` with its FDC
id, so the next client to eat it reads it from the catalogue with no network at
all. The catalogue teaches itself, one miss at a time. Foundation, SR Legacy and
Survey are written verified; **Branded is not** — that is the
manufacturer-submitted half, and the source of the 336 kcal "Banana".

Verified live: *"thomas cinnamon swirl bagel"* returns THOMAS' own row at 279
kcal **and its label serving, 1 BAGEL at 43 g** — a real countable portion,
which is the thing the catalogue has been short of all along.

### ⚠️ A feature that had never once worked

`add_to_meal` — built 5 Sep for *"add the jam to that meal"* — is extracted by
the model, validated, and resolved against the day correctly. Then
`wireParams()` had **no case for it** and fell through to `default: {}`, so the
confirmation card received empty params and tapping Confirm threw *"that meal
isn't on today's list anymore"*, every single time. Found while rewiring the
route. Fixed in the same commit.

### ⚠️ CORRECTION TO FINDING 3 OF MY OWN AUDIT

I reported **23,385 catalogue rows disagree with themselves** and **900 rows
over 100 kcal with no carbs and no fat**. Those counts included rows that
**`quarantined = true` already keeps out of every search** — 149,401 of them,
a third of the table, and a mechanism I had not found when I wrote the finding.

Against rows a search can actually return:

| | Reported | Actually reachable |
|---|---:|---:|
| Rows whose kcal disagrees with their own macros | 23,385 | **831** |
| Rows over 100 kcal with zero carbs and zero fat | 900 | **78** |
| Rows flagged as contradicting USDA | — | 122 |

**28× overstated.** The other findings stand as written and were re-checked:
the three bad `Banana` rows are *not* quarantined and *are* reachable, and
297,817 reachable `usda_branded` rows are still all stamped `verified`.

### SHIPPED — a hand-built plan is checked against the target (9 Sep)

Dustin's ruling on the audit finding: **"4: yes"**.

His own plan reaches 4,213 kcal against a 4,462 target with **fat 10.7% short**,
so eating it exactly as written still reads under — and because the
full-credit band is ±10%, a flawless day cannot score 100% adherence.

Six live plans would flag today and **five of them are wrong on fat**, which is
the macro that drifts when a plan is built to calories and protein:

| Client | kcal | protein | fat |
|---|---:|---:|---:|
| Madeleine Coker | −19% | −34% | **+53%** |
| Gerard Gautreaux | +17% | −5% | **+52%** |
| Sharon Gautreaux | +6% | +11% | **+55%** |
| Brooke Orton | −1% | +24% | **−36%** |
| Jerry Bourgeois | +4% | −6% | **+32%** |
| Dustin | −6% | −5% | −11% |

**Where it shows:** on the day tile, **trainer only**, **today only**. "Your plan
doesn't add up" is a message for the person who can change it; to a client it is
only unsettling, and a past day's plan is history.

**The tolerances are the AI plan builder's own** — 3% on calories, 5 g on each
macro — deliberately, not looser ones. A tolerance a second check invents for
itself is how "within 3%" quietly becomes 24%. The builder has enforced this
since it shipped and prints the drift in orange when it misses; a hand-built
plan was never checked by anything.

**It sums the CHOSEN meal per slot**, one per position, the way the day actually
renders. Summing every meal double-counts any slot offering A/B — the exact
mistake that made an ordinary plan look 195% over when this was first measured.

---

## SCREEN 3 — NUTRITION · THE CONTROL INVENTORY

Built from the code on 9 Sep 2026, after the format landed. **This is audit step
1 and it is done — the next session does not re-derive it.** Walk it in this
order, one batch at a time, and fill the last column in with his words.

Everything below is on `/nutrition` and `/client-preview/nutrition`, which mount
the same component. A row marked **T** is trainer-only.

### Batch 1 — the top of the screen · WALKED 11 Sep 2026, client view

| # | Control | What it should do | What it actually does | Verdict |
|---|---|---|---|---|
| 1 | **Recipes** strip | opens `/recipes` | link, no state. *"Works properly. Goes to the recipes in the system. Toggles for my personal ones, which should be individual to each client, and the shared library that everybody has access to."* | **WORKS** — two findings below |
| 2 | **‹** | back one day | `setSelectedDate(-1)`; every write follows the date on screen | **WORKS** |
| 3 | The date | shows Today, or the date + "past day" / "upcoming day" / "scheduled — plan vN" | display only. Today / past / upcoming seen while stepping; **"scheduled — plan vN" not seen** — no incoming plan on his account today | **WORKS** (scheduled label untested) |
| 4 | **›** | forward one day | `setSelectedDate(+1)`; future days reachable | **WORKS** |
| 5 | **⋯** | the plan menu sheet | `openSheet({kind:"menu"})` | **DEFERRED — its own audit.** *"Let's hold off on the plan menu sheet, do that completely separate after everything in this list… that's where I think we're going to run into that layered menu. One of the places I suspect we're going to need some pretty major adjustments or even rebuild."* |
| 6 | Incoming-plan banner | "plan vN starts <date> — tap for the version timeline" | `openVersions()`; only when a plan is dated ahead. *"When I did have one, that was working on my app."* The tap → timeline is **untested** until his next incoming plan | **WORKS** (banner); timeline tap pending |

**Findings from #1 that belong to later batches — captured here, built there:**

- **The AI must be able to use the recipe library.** His words: *"When we get to the meal
  plan builder, the AI meal plan builder needs to have access from this. If I tell it,
  create me a meal plan using meals from the actual library and adjust the portions to
  hit my macros that are already set in the system, that AI needs to be able to do that.
  All the AI in here has to have access to these recipes, including Dustin's assistant —
  that assistant could say, hey, you're not hitting your protein on average for the last
  three weeks, try this meal from the library, put it in for lunch. We can expand this
  library a lot more and get it more usable where people are actually using it."*
  → applies to **#20 (COACH'S ASSISTANT)**, **#23 (Build me a plan)**, and the
  **`aiplan`** sheet. Checked in step 0 of the AI pass; not built until then.
- **No in-app way back from `/recipes` on desktop.** Phone hardware back works; the
  desktop PWA (standalone, no browser chrome) has none. Recipes is not a bottom-tab
  item for clients, so the only route back is tapping the Nutrition tab. His
  question — a small universal back control — is answered in the interlude below
  and **awaits his confirmation before anything is built.**

#### #7 — the range toggles, and the divisor he asked me to verify

Tapped: **Today / 1W / 2W / 4W / 8W / Custom all work.** He asked for the logic:

> *"If I click two weeks, it needs to give me the average calories, protein, carbs and
> fats for the entire last two weeks. All of the fourteen days added together divided
> by fourteen, so I get an actual average of what I've been hitting per day. Pretty
> sure it's already set up like that, but double check that logic for me."*

**It is not set up like that, and it is deliberate.** `rangeAverages.ts:250`:

    const denom = avgDates.length || 1;

The average is the sum ÷ **the number of days that hold real food logs**, with today
left out (his own 20 Aug ruling: a day that is not over is not a data point). So:

| range | window | what is averaged |
|---|---|---|
| 2W | today − 13 … today | the finished days among those 14 that have food logged, ÷ that count |

The difference only shows when a day is **unlogged**. Concrete case: 10 of the 13
finished days logged at ~2,500 kcal, 3 days with nothing —

| divisor | reads | means |
|---|---|---|
| ÷ logged days (**today**) | **2,500** | "on the days you logged, you averaged 2,500" |
| ÷ 14 (his words) | **1,786** | treats each unlogged day as a **zero-calorie day** |

The current design pairs "per logged day" with the separate **LOGGING RATE** figure
(#16), which is exactly the split he ruled for adherence on 9 Sep — *"not logging,
since we have the logging rate."* Dividing by 14 folds the missing days back in as
zeros.

**RULED, 11 Sep — ÷ 14, an unlogged day is a zero. Built the same day.**

> *"Go ahead and rewrite that logic. I want it to go by all fourteen days. That
> way there's a lot more incentive to never skip logging no matter what. Once we
> make logging easier, that won't be an issue — because the fact is we need to
> know the average even if they forgot to log. That's their problem. They screwed
> up. So it needs to be an actual true average of the last fourteen days of
> everything that's in the app. Even if they forgot to log, that day still counts
> within that average."*

And the half that keeps it honest, which is what the AI now reads:

> *"Make sure the AI is aware of how that is set up. Let's say there's two days
> that had nothing logged and it drops their average way down. The AI for
> Dustin's assistant and for Your Week needs to be able to reference that and say
> there was nothing logged on these two days — you need to get better at logging
> if you actually ate those days and just didn't log. The AI needs to be aware of
> that as a possibility always."*

What changed, in one implementation (`rangeAverages.ts`) and the three things
that read it:

| | before | now |
|---|---|---|
| 2W window | today + 13 before, today then excluded → **13** finished days | the **14 finished days** before today; today never in the window (his 20 Aug ruling kept) |
| divisor | days with food logged | **every finished day in the window** |
| an unlogged day | invisible | **a zero**, and named by date |
| the tile | no basis stated | *"avg per day over all 14 days · 2 unlogged days counted as 0"* |
| the AI (Your Week, assistant) | *"averages per logged day"* | *"averages over ALL 14 finished days… 2 of those days had NOTHING logged (dates) and COUNT AS ZERO. If they ate on those days the true average is HIGHER. Say this plainly, name the days, tell them to log every day — do NOT coach a deficit off an average that is low because of missing logs."* |

Adherence is untouched — it scores the days they *did* log against target, and
he ruled that separately on 9 Sep. The old test asserting the opposite rule was
rewritten to assert this one, with the reversal recorded in its own comment.

**One second implementation found and left alone:** `NutritionAverages.tsx` has
its own `denom = logged || 1`. It renders only for a trainer viewing a non-v3
client, and **33 of 34 active clients are on v3** — the one that is not is the
Demo Client. It is a RETIRE candidate for the trainer-side walk, not a change
for this one.


### Batch 2 — the day tile (the bright one)

| # | Control | What it should do | What it actually does |
|---|---|---|---|
| 7 | **Today / 1W / 2W / 4W / 8W / Custom** | switch the tile between today's live totals and a range average | `setSummaryRange`; "Today" maps to the **week-to-date** range for adherence and logging rate |
| 8 | Custom **start** / **end** dates | set the range | both capped at today |
| 9 | Calorie hero + "N left" / "N over" | today's eaten against target | `totals.kcal` vs `macro_targets` |
| 10 | The bar | share of the calorie target | capped at 100%, turns warn-coloured over |
| 11 | **PROTEIN / CARBS / FAT** | eaten of target | over-target turns orange; no per-macro hue by design |
| 12 | **ALL NUTRIENTS ⌄** | expand the full nutrient registry | `setShowNutrients`; today only, not on a range |
| 13 | The nutrient grid | every nutrient anything knew | unknown nutrients are **hidden**, not shown as dashes |
| 14 | The coverage line | "from N of M logged meals" | says out loud when it is a floor, not a total |
| 15 | **ADHERENCE** | hitting the numbers, this week so far | **changed 9 Sep** — accuracy alone, in-progress day excluded |
| 16 | **LOGGING RATE** | days logged of days in the window | in-progress day still counts as logged |
| 17 | ⚠ plan-vs-target strip **T** | says when the plan cannot reach the target | trainer only, today only, 3% / 5 g |

### Batch 3 — the AI tiles

| # | Control | What it should do | What it actually does |
|---|---|---|---|
| 18 | **YOUR WEEK** tile | last week vs this week | dismissed per week in `sessionStorage` |
| 19 | its **✕** | dismiss | |
| 20 | **`<COACH>`'S ASSISTANT** tile | the nudge for today | ruling 4 — named, never impersonating |
| 21 | its **✕** | dismiss for the session | |
| 22 | **Save my built day as the plan** | open-plan only | `saveplan` sheet |
| 23 | **✦ Build me a plan from targets** | open-plan only | `aiplan` sheet, mode `targets` |
| 24 | **✦ Recommend my targets** | open-plan only | `aiplan` sheet, mode `consult` |

### Batch 4 — a meal

| # | Control | What it should do | What it actually does |
|---|---|---|---|
| 25 | The **＋** on the line between meals | insert a meal at that point | `addmeal` sheet |
| 26 | The tile **head** | open the meal sheet | whole head is the button |
| 27 | The food list | every item, one per line | struck through when removed, badged FREE / ADDED |
| 28 | **Choose A / Choose B** | switch which option is planned | **was nested buttons, fixed 9 Sep**; re-logs if already logged |
| 29 | **＋ Build this meal** | an empty slot | the rest-day shape; food database · photo · typed |
| 30 | The **ring** | log the meal full | 44px; colour carries Full / part / Skipped / Off-plan. **Unlogged now shows a ghost tick** — was invisible on the new layout, fixed 10 Sep, see the interlude |
| 31 | **✎ Edit** | the meal sheet | same target as the head |
| 32 | **⋯** | the meal sheet | same target again — **worth asking him whether three doors to one sheet is right** |
| 33 | **⠿** | hold to reorder | pointer-driven; `persistOrder` |

### Batch 5 — extras

| # | Control | What it should do | What it actually does |
|---|---|---|---|
| 34 | An extra's name | what was eaten | **no longer truncated** (fixed 9 Sep) |
| 35 | PENDING / EST badge | says the number is not final | see the "macros tonight" question |
| 36 | **✕** | remove, with undo | `deleteLogRow` + undo toast |
| 37 | **Quick-add an extra** | the extra picker | `extrapick` sheet |

### Batch 1b — THE PLAN MENU SHEET · its own audit, at his request

*"That's where I think we're going to run into that layered menu… one of the
places I suspect we're going to need some pretty major adjustments or even
rebuild."* Inventoried from `MenuSheetView` (`NutritionV3Client.tsx:3086–3109`).
Opened by **#5 (⋯)**. Title "Plan menu", subtitle = client name + "plan vN (live)"
or "open plan". No trainer-only rows.

| # | Row | What it should do | What it actually does | Verdict |
|---|---|---|---|---|
| M0 | The sheet's **✕** / backdrop | close the menu | `closeAllSheets()` — closes **every** open sheet | **WORKS** — *"tapping the menu and closing the menu works just fine"* |
| M1 | 🛒 **Grocery & Prep** | shopping list + prep sheet, Grocery / Meal Prep PDFs | closes the menu, opens the grocery overlay. Only shown when a plan is live | **WORKS** — *"everything in the grocery and prep works exactly as it's supposed to, including creating printable PDFs of everything. That one is all locked in."* |
| M2 | ✦ **Build my own plan with AI** | design a plan from scratch | `buildplan` sheet — five options, walked below | **UNTESTED BY HIM** — his own plan is written outside the app (the orange lock). Testing from the Test Client account. *"As far as I can tell it does seem to be working."* |
| M3 | ~~📈 **Trends**~~ | averages + the progress charts | was a paragraph and a link to /progress | **RETIRED, 11 Sep** — *"Let's remove that altogether. That is essentially the progress tab, so there's really no reason to have that there."* Row, sheet and its kind are deleted; Progress in the bottom nav is the replacement |
| M4 | 🗂 **Plan versions** | current live + staged incoming | list of versions with LIVE / PENDING / ARCHIVED and "↩ Make this my plan again". **BUILT 11 Sep:** tap a version's head and it expands in place — meals in order, every item with its amount, kcal per meal, day total — without restoring anything | **WORKS, CHANGE BUILT** — *"It doesn't really tell you a whole lot just in that one tab. We should have a way to tap on that and open up a little more details on exactly what that plan looks like without actually clicking make this my plan again. That way if they want to reuse a previous plan they can look through the actual plans first instead of just a very brief small summary."* |
| M5 | 📅 **Week ahead** | forward view 1w / 4w / 8w / custom | `forward` sheet | **WORKS** — *"good to go, able to see everything I need to see there."* |
| M6 | ⭐ **My Meals** | saved custom meals | `mymeals` sheet | **WORKS** — *"When you create something with AI custom, it puts it in there as My Meals. I'm actually okay with that, I kinda like that. There is a way to delete them. That's perfect."* |
| M7 | ✦ **Coach: ON / OFF** | toggle insight cards, celebrations & nudges | flips `coachOn`, persisted | **WORKS** |

His close: *"I think that's everything for this page. Everything else, you can
lock in."*

#### M2's five options, and how each actually works

Inventoried from `BuildPlanSheetView` and `/api/nutrition-ai/plan-build`. He
asked *"tell me how all that stuff is set up to work"* — this is the answer,
from the code, and two of the five are findings.

| option | what he thinks it does | what it actually does |
|---|---|---|
| ✦ **Recommend my targets** | *"the AI will give them their actual targets"* | **The targets are the model's opinion, not a formula.** It is handed the latest weight and body-fat from `metrics`, `clients.primary_goal`, and the three consult answers, plus one prompt rule: *"protein ~0.8-1.2g per lb bodyweight, sensible deficit/surplus for the goal."* No TDEE, no activity arithmetic in code. Two clients with identical numbers can get different targets on different days. |
| ✦ **Build from my targets** | *"them entering in their own targets"* | Exactly that — the four numbers are used as given. |
| 🗣️ **Build it from the foods I eat** | *"does the AI only use the foods they eat, or does it recommend other foods?"* | **An instruction, not a constraint.** The prompt says *"build the plan out of the foods this client says they eat"* — and the shared library is still attached as a menu the model may reach into. So it can, and does, add foods they did not name. |
| 🛠 **Save the day I built** | | Turns today's built slots into the ongoing plan. |
| 🥗 **Build manually from the food database** | *"them actually building it"* | Exactly that. |

#### FINDING — the AI's "library" is not the Recipes screen

He asked *"where is it getting the actual foods from?"*

The three AI builders are handed `MEAL_LIBRARY` and `RECIPE_LIBRARY` from
`libraryForAi.ts` — **hardcoded TypeScript lists**, the 20 recipes written on
15 Aug. They **never read the `recipes` table** that `/recipes` shows and that he
and clients add to. So a recipe added on the Recipes screen is invisible to
every AI builder and to the assistant.

That contradicts the Batch 1 ruling from an hour earlier — *"all the AI in here
has to have access to these recipes"* — and is now the top item for this
screen's AI pass (step 0).

#### FINDING — for anything it invents, the plan builder invents the macros too

For a library meal the macros come from the database. For any item the model
makes up, `plan-build`'s JSON schema has the model emit `kcal / p / c / f` per
item, and nothing downstream re-prices them: `adopt-plan` writes them as they
are, and the validator recomputes only the *totals* from those per-item
figures. This is the class of number his 9 Sep ruling removed from chat
(`a1edf49`), still live in the plan builder — and the literal answer to *"it
rarely gets the numbers right."*

#### DESIGN ASK, captured — "library recipes, or custom from my foods?"

> *"Is there a way to determine if it's going to recommend actual meals and
> recipes, or actual foods like chicken breast and rice, instead of using only
> recipes from the actual recipe library? There needs to be a way to tell the
> AI: use recipes from the library, or build my meals custom with the foods
> that I'm giving you and give me portions for each one."*

**Not built.** No such switch exists; the library is always offered as a menu
and never as a rule. Belongs with the AI pass, alongside the two findings above.

**Every one of M1–M6 opens something with its own controls.** Each is walked as
its own sub-batch after the seven rows above: the grocery overlay, `buildplan`,
`versions`, `forward`, `mymeals` (Trends retired). Those sub-inventories are built from
the code when we reach them, not before.

**Two things to watch as he taps:** M0 closes *everything* (so backing out of a
sub-sheet may drop him to the page rather than to the menu — that is his "go back
one page, not all the way" case, and it is a sheet, not a route); and M1/M5 vanish
entirely on an open plan, which a client with no plan will never know existed.

### Batch 6 — the sheets, each its own pass

Not yet inventoried control by control. There are **26 sheet kinds** (`trends`
retired 11 Sep):
`menu`, `meal`, `addmeal`, `adjust`, `composer`, `copyto`, `copy`, `foodsearch`,
`mymeals`, `offplan`, `replace`, `extrapick`, `extra`, `aiplan`, `saveplan`,
`buildplan`, `versions`, `forward`, `custom`, `openslot`, `slot`,
`swap`, `plan`, `good`, `push`, `insert`.

The ones that carry real risk and should be walked first: **`offplan`** (photo /
typed / voice — the path whose macros are still the model's), **`foodsearch`**,
**`composer`**, **`adjust`**, **`aiplan`**.

### The three questions — ANSWERED 11 Sep 2026, his words

**1. What is this screen for?**

> *"This screen's entire function is to make it as easy as possible for anyone
> using the app to record their daily food intake to compare against their
> activity and dial in their deficit/surplus/maintenance to match goals."*
>
> *"What I want the client to walk away with is a very clear picture of where
> they are at on the path to their goals, and what they need to adjust to stay
> on track."*
>
> *"The main reason people don't log food is because it takes too much time and
> it's a pain to get the correct numbers. That's where we can really leverage
> the AI on this page — but it has to be coded correctly and the AI needs to
> know what its job is and be able to make it easier on us to log food even if
> it's not on an actual meal plan."*

And the standard the AI on it has to meet — this is the bar for step 0:

> *"The AI on this screen needs to know every bit of that information for each
> client and keep it up to date as goals change and metrics change constantly.
> The only thing worse than not tracking it at all is tracking it and then the
> app telling you what to adjust based on bad numbers — and that's what I'm
> seeing a lot of, so we need to get this one right."*

**2. What on it does he never use?**

> *"I look at everything on this page that's viewable from the main page. When
> we get to clicking on all the buttons in the menus, that answer may change.
> But right now I use everything on here, and I actually track my food. There's
> nothing on here that I want to remove."*

So: **no RETIRE candidates on the main page.** Revisit per sheet in Batch 6.

**3. What does he expect to be wrong?**

> *"Tons of screwed up details. Basically, the numbers being wrong. All three
> AI functions not working properly some times of the week. The AI bot has
> inaccurate information. Sometimes Dustin's assistant has inaccurate
> information."*
>
> *"The functionality of the actual AI assistant in there has gotten better —
> it's able to do things in the nutrition tab. However, it doesn't always do
> them properly, and it rarely gets the numbers right."*

The ruling that comes out of that, and it is the spec for the floating AI:

> *"If I tell it what I eat from a specific restaurant, that AI bot needs to go
> on the Internet and look up the actual numbers for exactly what I told it I
> eat. The AI bot — the floating button in the nutrition page — should be able
> to do anything that you can do in this app, and I want it to do it the same
> way. If I came to Claude and said, hey, I replaced this meal with this, you
> would go on the Internet, get the actual numbers, and log it for me properly.
> That's what that AI bot needs to do. Currently it kind of does that, but not
> the way I want, and the numbers are extremely inaccurate — just like the
> lunch I did on mine today was way off and I had to come to my Claude project
> to fix it. Clients won't have that option."*

**"All three AI functions"** = the YOUR WEEK tile (#18), the COACH'S ASSISTANT
tile (#20), and the floating AI bot (the coach chat sheet). Each gets its own
pass against `AI-CONTRACT.md` in this screen's step 0.

**Scope ruling for this walk:** *"Save the trainer view questions for after
this audit as we will need to do this full audit again from my trainer end.
Right now let's focus on finishing the full audit from client view."* So rows
marked **T** are recorded but not walked now; the Nutrition screen gets a second,
trainer-side walk later.

### Already answered, do not ask again

- **"numbers are way off"** — traced. His M6 really is 766 kcal; the plan itself
  is 249 cal and 22 g of fat short of the target. See the plan-vs-target finding.
- **Nutrition %** — ruled on 9 Sep: hitting the numbers alone, week to date,
  in-progress day excluded. Shipped.
- **Whether meals get lifted** — ruled: they do not.

---

## Interlude — a unit that cannot fit is not the unit  ·  9 Sep 2026

The 9 Sep session was stopped with the catalogue 11 of 16 batches through a
recompute. Finishing it was meant to be four queries and a count. It was — and
then reading the batch diff before keeping it turned up the fifth fault in this
work, in the migration that had just shipped.

**A can of ginger ale opened on 1 tsp — 2 g.**

    Ginger Ale, Ginger                 1 tsp    2 g     really 591 g
    Diet Soda, Ginger Ale              1 tsp    2 g     really 355 g
    Macaroni & Cheese, Creamy Sauce    1 tbsp  16 g     really 340 g
    Restaurant, chicken parmesan       1 tbsp   5 g     really 301 g
    Cinnamon Rolls                     1 tsp    3 g     really  57 g

### The fault

`20260909a` added *"a measure opens on ONE"* — correctly, and it is what finally
made butter open on a tablespoon. But it put that return **before** the cap
check instead of inside it:

    if cnt > 1 and food_serving_opens_on_one(label) then return 1 <label>;
    if cnt >= 0.25 and cnt <= cap  then return cnt <label>;

The cap is the sanity check that says *this unit does not belong to this food*.
591 g of ginger ale is 296 teaspoons. Nothing is 296 teaspoons — and the count
blowing past the cap is precisely how the brain knew the keyword `ginger` had
matched a **flavour** rather than the food. Before `20260909a`, such a row fell
through to "1 serving" at the label weight, which is right. After it, the
opens-on-one shortcut answered first and returned one teaspoon, turning a missed
keyword into a 296× understated portion.

**9,128 rows catalogue-wide**, understating by 31× on average and 430× at worst.
All of them branded — which is what a client hits when they scan a barcode.

### What changed

The cap comes first. Opening on one is a choice made **among counts that were
already plausible**, not a way around the plausibility test.

    if cnt >= 0.25 and cnt <= cap then
      if cnt > 1 and food_serving_opens_on_one(label) then return 1 <label>;
      return cnt <label>;
    end if;

Both call sites, because both had it: the row's own named serving, and the
mapped unit.

### What a user sees now

Nothing he programmes moved. **Zero of his 249 trainer and client foods
changed** — butter still opens on 1 tbsp / 14 g, baby spinach on 1 cup / 30 g,
almonds on 1 oz, white rice on 1 cup / 158 g, chicken breast on 1 breast (6 oz),
hard boiled eggs on 1 large. None of them was ever near its cap: butter is 5.67
of 8, spinach 2.8 of 4, almonds 2.6 of 24. That is why the cap can come first
without undoing anything `20260909a` exists to fix.

What changed is 8,484 branded rows that had been collapsed to a teaspoon or a
tablespoon, and every one of them **grew back** to the serving on the package.

### How it was proven, because this is the method now

Red first, then green, then measured before applying:

1. The shipped `20260909a` function was loaded into a local Postgres 16 with its
   whole dependency chain, and the cases above reproduced **exactly**.
2. The fix turned them green while butter, spinach, almonds, chia and an 8-cracker
   box stayed exactly as they were.
3. Then measured on the live catalogue through a shadow function, before a single
   row was written:

   | | changed | grew | shrank |
   |---|---|---|---|
   | 20,344-row branded sample | 539 | 539 | 0 |
   | all 24,415 non-branded rows | 11 | 11 | 0 |
   | his own trainer/client foods | **0** | 0 | 0 |

**Nothing shrinks.** That is the invariant that matters here: this fix can only
ever give a serving back, never take one away — the mirror of `20260909a`'s own
downwards-only rule, and the reason the two do not fight.

### ⚠️ The confirmation query has to round the way the function rounds

The first check reported 644 survivors. They were phantoms: it compared the
**raw** ratio while the function tests the **pretty-rounded** count. A 33 g bag
of popcorn is 4.125 cups, `food_serving_pretty_count` rounds that to 4, and 4 is
exactly the cup cap. Those rows are correct and the naive check called them
broken. Rounded the way the function does, the count is **zero**.

The corrected query is at the bottom of the migration. Use that one.

### Still open — unchanged by this

The keyword coverage problem underneath is the same shape it was: **68,383 rows
say "1 serving"** and 68,490 carry a vague label, counted after this pass. It is
slightly larger than the 8 Sep figure would suggest *because* of this fix, which
moved ~8,484 rows into "1 serving" deliberately — an unnamed unit at the right
weight beats a named one at the wrong weight. This fix makes a missed
keyword fail *safely* — back to the package's own serving weight instead of to a
teaspoon — but it does not add a keyword. "Lemon Lime Soda" still reads `6 lemon`,
and a granola bar with "peanut butter" in its name still borrows a tablespoon.
Those want the measured keyword pass described in the 8 Sep interludes.

Migration `20260909b_a_unit_that_cannot_fit_is_not_the_unit.sql`. Reversible:
`bak_food_default_serving_20260909` holds all 322,232 searchable rows as they
stood before the `20260909a` pass.

## Interlude — the AI button was there and nothing opened (9 Sep)

Dustin, on Todd Prine's client page, with the header **AI** button plainly
visible in the screenshot: *"trainer ai assistant is gone!!"*

Both halves of that were true, because two components answered the same question
separately and only one of them could change its mind:

| | asks | recovers? |
|---|---|---|
| `HeaderAssist` — draws the **AI button** | `viewerIsTrainer` once at mount; re-read the client-mode cookie **every 2s** | the button comes back |
| `AIAssistant` — **is** the assistant | both, once at mount, folded into one latched boolean | never, until a full reload |

`AIAssistant` ends in `if (!isTrainer) return null`. So leaving Client View
clears the cookie, the button reappears within two seconds over a drawer that is
still shut, and tapping AI does nothing at all.

The same latch had a second way in. `viewerIsTrainer` documents that it **fails
open to the build-time list** so a database blip cannot demote the owner in his
own app — but that only holds once it knows the email. On a cold start
`supabase.auth.getUser()` can resolve before the session is restored, and with
no user at all it returns false on its first line, before the fail-open is ever
reached. One unlucky moment at mount, assistant gone for the life of the page.
Nothing in the app called `onAuthStateChange`, so nothing was listening for the
session arriving late.

**What the screen does now:** both surfaces read one watcher,
`src/lib/auth/trainerMode.ts`, which keeps asking — client mode on the same 2s
timer the button already used, and the trainer answer again whenever the session
changes. Three of the six tests in `theAssistantComesBack.test.ts` fail against
ask-once-and-latch.

Two rules kept deliberately:

- **Client View still closes it, on the same timer.** Dustin, 22 Aug: *"no
  clients can have this function. So there needs to be a very strong guard up
  for that."* Recovering must not weaken the guard, and that is its own test.
- **A "yes" is never withdrawn by a failed re-check.** A dropped request is not
  a logout — the same lesson as `d95879cf` — and the drawer must not shut
  underneath him mid-sentence. Signing out unmounts the app.

Still only presentation either way: `/api/agent` authorizes on its own against
an ACTIVE `trainers` row and refuses client mode.

## Interlude — access is not the same thing as archived  ·  9 Sep 2026

Dustin set a new rule: **an archived client loses app access 30 days after their
last payment, automatically.**

    access_ends_on = last PAID payment_reminders.due_date + 30 days

### What was actually wrong

`clients.archived_at` never gated sign-in. Not partially — not at all. **Bobbie
Page was archived on 31 Aug and had full app access on 9 Sep**, nine days later,
and would have kept it indefinitely. Archiving was a roster and billing state
that the app's front door had never been told about.

So the two states are now two columns, deliberately:

| | what it means | who writes it |
|---|---|---|
| `archived_at` | a ROSTER state — who shows up in his lists | him, when he archives |
| `access_revoked_at` | an ACCESS state — who can open the app | the nightly job, only |

Conflating them is what produced the confusion in the first place. Keeping them
apart means archiving stays a reversible bookkeeping act with no effect on
anyone's phone, and losing the app is a separate event with a date on it.

### The screen a revoked client sees

`/access-ended`. It says three things, in this order: your access has ended and
here is the rule; **nothing you logged has been deleted**; talk to your trainer.
It does not say "subscription expired" and it does not imply they did anything
wrong. These are people who trained with him for months and some of them come
back.

The login screen learned the same sentence. A banned auth user gets `user_banned`
from Supabase and the literal words **"User is banned"**, which is an accusation
and an explanation of nothing. That string never reaches a client now.

### Two gates, and only one of them is real

- **The ban is the gate.** The job bans the auth user, so a revoked client
  cannot obtain a session at all.
- **The middleware check is not**, and is not pretending to be. That file says
  of itself, in its own comments, *"This middleware is a convenience, not a
  gate"* — it passes through whenever auth does not answer. It exists here for
  exactly one case: a session minted **before** the job ran, still sitting in a
  phone that has not been asked to refresh. Without it they keep the app until
  the token expires.

The order inside the job matters for the same reason: **the ban goes first and
the column is only written if it took.** The reverse leaves a client the app
believes is revoked who can still sign in — which is precisely the `archived_at`
gap this whole rule exists to close.

### The off switch is the first thing the job touches

`app_flags.access_revoke_live`, read before a single client is looked up, and it
**ships false**.

That is the nudge job's lesson paid forward. Its flag gates *delivery* rather
than whether the job *runs*, so with nudges off it still woke every night, still
called the model, and still posted a preview into Dustin's own inbox — eleven
consecutive nights after he set the flag false, and by his count he had turned it
off about ten times. Three tests fail if that shape is ever reintroduced here.

### The list, and what he ruled on every name

He flagged Bobbie Page. The other seven were read off the live database and put
to him one by one on 9 Sep. **He ruled on all eight, and the switch went ON the
same night** — `app_flags.access_revoke_live = true`, job daily at 06:30 Central.

| | archived | last paid | access ends | outcome |
|---|---|---|---|---|
| Tina Haley | 13 Aug | 12 Jul | **11 Aug** | cut off, first run |
| Christine Latham | 31 Aug | 22 Jul | **21 Aug** | cut off, first run |
| Brooke Reynolds | 31 Jul | never | **30 Aug** | cut off, first run — no login to ban |
| Robert Miller | 1 Sep | 1 Aug | **31 Aug** | cut off, first run |
| Jada Cook | 13 Aug | never | 12 Sep | auto cut-off on 12 Sep |
| Tania Millan | 13 Aug | never | 12 Sep | auto cut-off on 12 Sep |
| Bobbie Page | 31 Aug | 1 Aug | 31 Aug → **1 Oct** | kept, his override |
| Test Client | 13 Aug | never | → **2099** | kept, indefinite override |

His words, in order: *"Tina, Christine and Brooke can be archived, not robert!"*
— *"robert is archived i forgot he quit!!"* — *"Jada n Tania can be archived,
leave test client"*.

### ROBERT MILLER, AND THE FLOOR THAT WAS NOT ADDED

His is the case where the rule looks harsh. Archived 1 Sep, last paid invoice due
1 Aug, so the rule ends his access on **31 Aug — the day before he was archived
at all.** Read literally, anyone archived more than thirty days after their last
payment gets **no grace period whatsoever**: archiving them cuts them off that
night.

The tempting fix was a floor — a guaranteed few days from the archiving date. It
was built literally and put to him instead. **He ruled: no floor.** He quit, and
being cut off on the first run is correct.

Worth recording that it nearly went the other way. He first said Robert should
not be archived at all (*"Robert still trains but I only do programming but he's
still paying"*), his row was unarchived, and then he corrected himself and it was
restored from `bak_robert_miller_unarchive_20260909`. **Neither the rule nor the
row needed changing in the end.** Check the row, and ask him, before softening
this rule the next time it looks harsh.

### `payment_reminders` is a thinner ledger than this rule assumes

Robert pays **$300 a month flat** and has exactly **one** `payment_reminders`
row, for **$150**, with `payment_reminders_enabled = false`. He is not unusual:
**16 of the 33 active clients have reminders off**, every one of them
`billing_type = 'none'` with zero paid rows — four family accounts, five
self-coached, one demo, and six real training clients (Celeste Lennon, Greg
Lennon, Jerry Bourgeois, Krysta Ruiz-Schnitzler, Laurie Kane, Troy Schnitzler).

So "their last paid invoice" is **not** a reliable record of when somebody last
paid. Where there is no paid row the rule falls back to `archived_at + 30`, which
is the safer answer and is doing more of the work here than the headline rule
suggests. It was right for every name he ruled on. **It is a standing risk for
anyone archived in future** — and it is the reason the override exists.

### Brooke Reynolds is a one-day timezone bug that the tests caught

Her `archived_at` is `2026-08-01T00:23:27Z` — which is **19:23 Central on 31
July**. `select archived_at::date` says 1 Aug and is wrong by a day. The rule
reads it in Central and gets 31 July, so her thirty days end on 30 Aug rather
than 31 Aug.

It changes nobody's outcome today, because both dates are long past. It changes
one the first time somebody is archived in the evening — CLAUDE.md's *"after 7pm
Central the UTC date is already tomorrow"*, sitting in the live data, found by a
test and not by reasoning.

### Never delete history

His words, and the tests hold it: revoking access is not deleting the client.
`workout_logs`, `set_logs`, `meal_adherence_logs` and `metrics` are untouched.
Restoring somebody is two reversible writes — clear `access_revoked_at`, and
unban their auth user.

### Not built, and deliberately

**The trainer-facing override control.** `access_override_until` exists and
works, and two overrides are set — Bobbie's and Test Client's. What does not exist is a button for it on the client
profile — because `/clients/[clientId]` has not been walked yet, and audit rule 6
is *never edit a screen that has not been walked*. It lands when that screen
comes up. Until then the override is set directly.

**`Test Client` has `is_test_account = false`**, which looks wrong for a row
named that. It is held back by a 2099 override, which is a workaround rather than
an answer — the tidier fix is flagging it a test account and having the job skip
test accounts outright. Not built; his call.

Migration `20260910a_access_is_not_the_same_as_archived.sql`. Rule:
`src/lib/access/archivedAccess.ts`. Job: `/api/cron/revoke-access`, daily at
06:30 Central, **live since 9 Sep**.


## Interlude — the ring you could not see  ·  10 Sep 2026

Dustin, with a screenshot of M5 Dinner and M6 Evening Snack: *"you cant see the
unchecked circles on unlocked foods w the new layout on nutrition logger."*

He was right, and it is the control a client touches most on this screen.

### The cause was one token drawn against the wrong background

`circleFor` passed `var(--brand-border)` inline for an unlogged meal, which
overrode the `--tile-ctrl-bd` that `.sym-ring` already carried.

The two are not interchangeable, and `globals.css` has said so for months:
*"Everything a tile contains derives from the TILE, not from the raw token."*

| | mixed against | in dark |
|---|---|---|
| `--brand-border` | the PAGE | `color-mix(--brand-primary 34%, #2a3140)` |
| `--tile-ctrl-bd` | the TILE | `color-mix(--brand-text 22%, --tile-bg)` |

The ring sits inside a tile whose background is `#141922` tinted with that same
primary. So the border and the surface behind it were two near-identical darks,
and a 2.5px circle drawn in one on the other is a ghost. Exactly what the
screenshot shows.

**The fix is to stop overriding the class.** An unlogged ring now paints nothing
inline, which also makes the `.sym-tile.is-today .sym-ring` rule reachable — it
had been dead code, silently overridden on every meal.

### The other half: it never looked like a target

Every OTHER state of this control is a filled circle in a state colour — green
for logged, gold for part, blue for off-plan, a dash for skipped. So the one
state a client is actually meant to **act on** was the only one with no fill at
all, and a hairline outline is not a checkbox.

`.sym-ring--todo` gives it a real border (38% of the text colour) and a faint
inset (5%), both mixed against `--tile-bg` for the same reason the bug existed.
It darkens on `:active`, and it drops the inset on the bright tile where the
white border already carries it.

### The trap inside the fix

**Skipped** set a background and let the border default. That was fine while the
default was a real colour; once the default means *"unlogged, leave it to the
class"*, a skipped meal would have lost its fill and read as untouched. It names
`--tile-ctrl-bd` explicitly now, and a test holds it.

### Proven red first

`tests/unit/theRingYouCanActuallySee.test.ts` — **five of its six tests fail
against the unfixed code.** It also pins the 44px thumb target, because this
class of bug invites a "make it smaller and darker" fix, and shrinking a thumb
target on a phone is its own regression.

### And then an icon inside it  ·  10 Sep 2026

Dustin, once the ring was visible: *"we need some type of icon in there,
ideas?"* — then *"Just run 1 ghost check plz"*.

**An unlogged ring now carries a dimmed version of the tick it turns into.**
Tapping it fills the circle green and makes that same tick white, so the ghost is
a preview of the outcome rather than a new symbol to learn.

**Why not the obvious ＋.** It is already two things on this screen: the
open-slot ring means *build this meal*, and the line between tiles means *insert
a meal here*. A third meaning would have made all three vaguer. The tick also
cannot be confused with the — that marks a meal skipped.

It cannot read as "already logged" either: a logged meal is a **white** tick on a
**solid green fill**, and this is an outline on an empty circle.

Two details worth keeping:

- `CheckSvg` hardcoded `stroke="#fff"`. Correct on a green, blue or gold fill and
  wrong the moment the same path is a ghost on an empty ring in a light scheme.
  It takes a colour now, defaulting to `#fff` so every existing call site is
  untouched, and the ghost passes `currentColor`.
- The tick is **45%** of the text colour where the border is 38%. They are meant
  to look like one object; a 3px stroke reads lighter than a solid ring edge at
  the same value. On the bright tile both follow the white border instead of the
  tile they are no longer sitting on.

---

## Interlude — the app records its own errors (10 Sep)

Dustin: *"anytime something goes wrong or errors or there's a bug, you can look
back at the actual log of when it happened and what happened and figure it out a
little bit easier to make sure that we fix it permanently, and we don't keep
running into the same problems."*

### What was already there, and why it had never seen anything

`client_error_log` (`20260826e`) was built the day Jennifer lost 27 minutes of
sets, and it works. It watches three writes — `set_log`, `bulk_set_log`,
`workout_complete`. **It had zero rows, and that was checked before anything was
changed**: the mechanism is sound and the RLS policies were correct, so the
honest reading is the good one — the workout write path genuinely has not missed.

Everywhere else, an error went to `console.error`. There are **124** of those,
and on a phone that means a hidden console and then nothing. So "it didn't work"
had no record behind it unless it was one of those three writes. There was no
error boundary and no global handler at all.

### The hole that mattered most

The insert policy was `client_id = my_client_id()`, and `my_client_id()`
resolves the **logged-in** user's client row. When Dustin logs a client's
session at `/workout?forClient=<id>` he has no client row — so the insert was
refused by RLS, and `logClientError`'s own `catch` swallowed the refusal,
correctly, because it must never throw.

**A failed set during a session he logged himself could not be recorded.** The
one case most likely to be noticed and reported was the one guaranteed to leave
no trace. Writing through `/api/log-error` under the service role closes it, and
**the workout logger was not touched to do it** — its call sites were always
passing the right client id; only RLS disagreed.

### One row per fault, not one per occurrence

`20260826e` refused to widen its net for a stated reason: *"anything broader
becomes a table nobody reads, which is where the integrity checker sat for ten
days."* That fear is right, and the fingerprint is the answer to it. A screen a
client opens forty times a day, failing every time, is **one row saying 40** —
carrying `occurrences`, `last_seen_at`, and `recent`, the last ten actual hits
with their own times, clients and paths.

The fingerprint is `scope + normalised message + path`, where normalising strips
uuids, timestamps, numbers and quoted strings. Get it too specific and every
occurrence is its own row; too loose and two faults share one and the count is a
lie. `tests/unit/oneBugIsOneRow.test.ts` pins both directions, and **two of its
grouping assertions fail against a naive hash of the raw message** — which is
what the obvious implementation would have been.

### What a client sees now — this is the observable change

| state | before | now |
|---|---|---|
| a screen crashes | blank white screen | a tile: *"Something went wrong… it has been reported automatically"*, with **Try again** and **Go home** |
| the app fails to start | blank white screen | a plain dark page with **Try again** |

**Try again** calls Next's `reset()` — it re-renders the route without a full
reload, so a transient failure costs a tap rather than a cold start.

Neither screen promises the data is safe, deliberately. The crash screen says
*"if you were part-way through logging something, check it saved"*, because the
app does not know, and reassurance over the top of a failure that may have eaten
a set is the app lying to the one person able to notice. The global one **does**
say nothing was lost, because it only fires before any screen has opened.

### Rules this had to obey

- **The reporter must never throw.** It runs on the error path, and a `window`
  `error` listener that throws re-enters itself — one dead image becomes an
  infinite loop on a client's phone. A test asserts no `throw` in either file;
  it caught a genuinely unguarded handler while it was being written.
- **It must survive the navigation that follows.** A crash is usually followed
  by a reload, and an in-flight `fetch` dies with the page, so the worst faults
  would be the least likely to be reported. `sendBeacon` first, `keepalive`
  after.
- **It must not flood.** An error inside a render fires every render. The same
  fingerprint is sent at most once a minute per page; the server counts
  occurrences regardless, so the number stays true while the traffic does not.
- **The browser is never believed about who it is.** A client's id comes from
  their session; a trainer may name a client, but that lookup runs under their
  own session so RLS decides. A log writable into someone else's name is worse
  than no log.

---

## Interlude — the chrome agrees with the page (10 Sep)

Dustin, with a screenshot of his own Client View: *"my own client view nav tabs
r gone! fix n check other clients"*.

### What the screenshot actually showed

The **page** was the client home — greeting, streak, This Week, Today's
Workouts. The **chrome** was the trainer's: hamburger top-left, the trainer's
bell and AI button, and no bottom tabs at all. Client mode's bar carries a
"Trainer View" pill; this one did not. Two halves of one screen had decided
differently which app they were in.

Nothing had crashed. `app_error_log` was empty, which is what it is for — it
ruled out a whole class in one query.

### Why

Every server page (`/home`, `/workout`, `/nutrition`, `/settings`, `/messages`)
and the middleware decide Client View from `?as=` and the
`symmetry_client_mode` cookie, in that order. `TrainerLayoutWrapper` — the one
component that draws the top bar and the bottom tabs — decided from
**localStorage** and read neither.

Its own comment recorded fixing one direction of that split: it re-asserted
the cookie *from* localStorage. The other direction was never handled. Android
evicts localStorage under storage pressure; cookies are not subject to quota.
Once localStorage was gone, the cookie lived another 30 days, every page
rendered the client app, and the wrapper dressed it as the trainer's — until he
toggled twice.

### Check other clients

Client-only accounts **cannot** hit this: their branch of the layout mounts
`<BottomNav />` unconditionally, and `AppBottomNav` is `fixed bottom-0 z-50`
with no responsive hiding. The seven accounts that are both a trainer and a
client — Dustin, Steph, Alan, Brooke, Ian, Justin, Oliver — all go through the
wrapper and all could. After this, none can.

### The fix — one rule, both sides of the wire

`lib/clientModeResolve.ts` is the pages' rule, pure: `?as=trainer` → trainer,
`?as=client` → client, cookie `1` → client, else trainer. The server layout
reads the cookie with the existing `isClientMode()` and hands the wrapper its
**starting** mode, so the first paint of the chrome agrees with the page by
construction. On mount the wrapper reconciles from `?as=` and the cookie —
the same inputs — and **writes** localStorage as a mirror, because three
feedback paths read it for a "client-app"/"trainer-app" label. It never reads
it as an input again.

| state | before | now |
|---|---|---|
| cookie says client, localStorage evicted | client page, trainer chrome, **no tabs** | client page, client chrome, tabs |
| localStorage says client, cookie expired | client chrome over **trainer** pages (the 7 Sep leak) | trainer chrome over trainer pages — consistent; tap the toggle to re-enter |
| any first paint | trainer chrome, then maybe a swap | the right chrome first time |

`tests/unit/theChromeAgreesWithThePage.test.ts` pins the rule and the wiring,
and **its wiring assertions fail against the wrapper as it was**.

---

## Interlude — the trainer home costs one round trip (10 Sep)

Dustin: *"the trainer view takes about 10 seconds to switch screen over its
laggy fix that too"*.

### Measured, not guessed

The trainer branch of `/home` made **five serial reads** — clients,
appointments, today's workouts, the calendar's workouts, reminders — and the
calendar one pages through **5,697** scheduled workouts at 1,000 a time, so it is
six round trips on its own. **Ten PostgREST hops, one after another, per
render.** Then the toggle called `router.refresh()` as well as
`router.replace()`: refresh renders the layout and page for the URL being
*left*, and then replace renders the destination. **Two full renders, about
twenty hops, per tap.** At phone-to-Vercel-to-Supabase latency that is ten
seconds.

One screen over, the client branch already says it: *"Promise.all so the five
leave together and the page costs one round trip."*

### What changed

- **The five reads leave together.** One `Promise.all`; the page waits for the
  slowest, not the sum. The paged calendar read still costs six hops internally
  but now runs alongside the other four: ~10 serial hops → ~6.
- **The toggle renders once.** `router.refresh()` is gone. It existed to stop a
  payload prefetched in the other mode being served stale, and three things
  since made that impossible without it: both directions carry a marker so the
  destination URL is never one that was prefetched; Next 15 does not reuse
  dynamic page payloads on navigation; the nav links are `prefetch={false}`.
  And since the chrome fix (#18) the wrapper no longer needs the layout
  re-rendered to know which mode it is in. ~20 hops per tap → ~6.

### Found on the way — and this one is correctness

The appointments read was **not paged**. 2,491 appointments sit in its window
against a 1,000-row cap that reports no error; the 1,000 that arrived were the
oldest, the last dated **1 December**, and the **1,491 after that never reached
the calendar.** Today's Sessions happened to be right — today was rank 557 — and
a month from now it would not have been. Same fault this file documents for
workouts since 24 Aug, fixed the same way. The static audit could not see it: it
flags a `.limit()` above the cap, and this read had no `.limit()` at all.

### What he sees

| | before | now |
|---|---|---|
| tap the view toggle | ~10 s, chrome flips first, page follows | one render; the page arrives with the chrome |
| trainer calendar, months ahead | empty past 1 Dec | every appointment that exists |
| Today's Sessions | correct today, by luck of the ordering | correct by construction |

`tests/unit/theTrainerHomeCostsOneRoundTrip.test.ts` pins one `Promise.all`,
one `await`, both reads paged, and no `refresh()` — and fails against the
branch as it was.

---

## Interlude — three names that should not have been on his day (10 Sep)

Dustin, 7:13am, screenshot of Today's Sessions: *"I need to know why Tyler, Troy
and Christine are in my schedule. Troy n christine are archived. Tyler only
trains w me at 5am Mondays."* Three rows with a "–" where the time should be.

### The "–" is the tell

Today's Sessions is built from the day's **appointments**, and then — since
27 Aug — any workout flagged *with-you* (`supervised`) that has **no**
appointment, so a supervised session missing from the calendar is not missed
on the board. No appointment means no time, hence "–". All three were that path.

### Three causes

- **Christine** — archived 31 Aug. **Archiving sets `clients.archived_at` and
  nothing else.** Her programme kept 35 future rows, nine flagged with-you, and
  the trainer home read the *schedule*, never the *roster*. Bobbie Page and
  Robert Miller were the same shape, one flag away from surfacing.
- **Troy** — **not archived in the app at all.** `archived_at` empty, billing
  "none", last workout and last appointment 29 Jul, never a paid invoice. His
  pattern still said Wednesday and Thursday with-you. Archived by hand today, the
  way the app does it; pattern days switched off.
- **Tyler** — a stale flag. He trained Thursdays until 20 Aug (×10 on the
  calendar); his pattern was corrected to Monday-only; but the rows generated on
  17 and 24 Aug carried Thursday = with-you **through 10 December, plus all six
  days of his peak week** — which is photoshoot prep, not sessions with him.
  Nothing re-derives the flag after generation.

### Why calendar sync never caught it

`detect_schedule_changes` has two rules: an appointment with no with-you
workout ("uncovered"), and a client with nothing booked at all ("retired"). It
has **no rule for the inverse** — a with-you workout with no appointment on a
client who still trains. Tyler kept his Mondays, so "retired" never fired, and
his Thursdays were invisible to it by construction.

### What changed

1. **The trainer home reads the roster.** `activeIds` from the existing active
   `clients` read gates all four schedule-derived loops — appointments, today's
   workouts, the with-you fallback, the calendar layer. An archived client's rows
   never reach the screen. `tests/unit/anArchivedClientLeavesTheTrainersDay.test.ts`
   pins all four; **all fail against the page as it was.**
2. **The rule, in his words: if it is not on the calendar, it is not with him.**
   `derive_supervised_from_calendar()` (migration `20260910c`) takes the
   **with-you marker** off any future, unlogged workout with no appointment that
   day. **The workout itself is untouched** — same date, same day, still on the
   client's schedule, still theirs to log; only whether it counts as a session
   with him changes. He read "clears" as deleting — *"i dont want the workout
   cleared just bc its not in my gcal"* — so: it is a marker, not the workout.
   **Downward only**, judged against the client's **own booked horizon** (the
   rule the `supervised_workout_no_appointment` check already used: a session
   past the last appointment a client has actually made is next week's booking,
   not a ghost), and it **skips any workout tied to a live booking** — when he
   moves a session in Google Calendar, the existing follow-the-booking sync
   moves that workout to match, and it runs first. First run: 42 rows unmarked
   (Tyler 19, Christine 9, Troy 9, Lauren 4, Laurie 1); Todd, Celeste and Krysta
   correctly untouched.

| | before | now |
|---|---|---|
| archived client with a running programme | on Today's Sessions and the calendar until the programme ends | never shown |
| with-you marker after the calendar changes | frozen at generation | re-derived three times a day, after the sync, inside the booked horizon |
| he moves a booking in Google Calendar | the marked workout follows it (unchanged) | the marked workout follows it, and is never unmarked out from under the move |
| a session he simply hasn't put on the calendar yet | shown as with-you | shown until his booked horizon passes it, then unmarked — the workout stays, the calendar is the truth |
| a client flagged online-only | the calendar machinery skips them (unchanged) | unchanged — Tyler carries that flag and 108 Mondays; put to him |

## Interlude — a failed tick clears when the next one saves (11 Sep)

Dustin, mid-session on Bulk — Legs, exercise 11 of 17: *"new row violates
row-level security policy for table workout_logs … when this happens error
doesnt clear once it works."* His log had existed since 10:43 with 24 sets on
it. One tick went out without his login attached; the lookup for the log came
back empty, the logger inserted, and the insert was refused. The next tick
carried the login and saved.

| Control | Before | Now |
|---|---|---|
| Set tick, after an earlier tick failed | the red banner (it is `completeError`) stayed until **Complete** was tapped | a tick that saves clears it |
| Set tick, refused as anonymous (`42501`) | the refusal was shown | the client is asked for its session and the insert is tried once more; only a second refusal is shown |
| Refused `workout_logs` insert | left no trace | recorded in `app_error_log` under scope `workout_log`, with the error code and whether the retry ran |

Per-item permission given for all three ("all 3"). Test:
`tests/unit/aFailedTickClearsWhenTheNextOneSaves.test.ts`.

## Interlude — a restaurant plate is not a retail serving (11 Sep)

Dustin, on his own lunch: *"Fix my lunch macros in the app. That's not even
close."* He had typed "Beef fajitas from Rivera's in Princeton Texas with flour
tortillas and queso with ground beef" into the coach chat and it logged
**634 kcal**. Every number came off a row and the model never recited one, and
it was still half the plate: the fajitas resolved to a packaged product
("Fully Cooked Beef Fajitas", 1 serving = 78 g, 111 kcal) and the queso to a
frozen "Beef & Chorizo Taco Bowl" (0.5 bowl, 227 kcal). The words "from
Rivera's" were dropped at the first step, so nothing downstream knew it was a
restaurant plate as served.

| Control | Before | Now |
|---|---|---|
| Coach chat / "describe what you ate", restaurant or takeout meal | the restaurant was thrown away; each food was named like a grocery item and priced at a retail label serving | each item carries `context` ("restaurant dish, as served at Rivera's (Tex-Mex)"); the row pick refuses a frozen meal or packaged product for a restaurant dish, and the portion question answers for the plate (fajita meat ≈ 170–225 g, a queso bowl ≈ 170 g) |
| His 11 Sep lunch row | 634 kcal · 37P / 74C / 21F | corrected by hand to **1,092 kcal · 69P / 69C / 60F** (fajita plate 513, two tortillas 296, queso with beef 283); backed up to `bak_dustin_lunch_20260911_{log,mymeal}`; the saved My Meal carries the same numbers |

The search term is still the plain food name — "beef fajitas from Rivera's"
finds nothing; "beef fajitas" finds the rows. Context reaches only the three
judgement calls (pick, portion, estimate). Test:
`tests/unit/aRestaurantPlateIsNotARetailServing.test.ts`.

## Interlude — a way back from every screen  ·  11 Sep 2026

Dustin, from his desktop, on `/recipes`: *"There is no actual back button from
desktop, which is making me think this may be something we've already missed on
other pages. What are your thoughts on putting an actual small back button on
everything throughout the entire app so no matter which screen you're in, you
always have a way to go back one page? Tell me what you think, and then I'll
confirm."*

### What is true today

- **Android shell:** `BackButtonGuard.tsx` handles the hardware Back, and its
  header already quotes his rule — *"Back needs to go to the previous screen
  from every single screen in the app."* So this is not a new rule; it is an
  existing one that only the Android shell honours.
- **Phone browser / iOS:** the platform back works.
- **Desktop PWA:** installed `standalone`, so **no browser chrome and no back at
  all.** The only way off a non-tab page is a bottom-nav tab.
- **How deep does the app actually go?** For a client, routes more than one level
  under a tab are just `schedule/proposals` and `workout/[dayId]` (the logger —
  off limits). Everything else that *feels* layered — the 27 Nutrition sheets — is
  an overlay with its own close, not a route. So the "three or four pages deep,
  need to go back one" case he is worried about barely exists as navigation. It
  exists as sheets, and the sheet audit (Batch 6) is where that is checked.

### Recommendation — yes, and narrowly

A small **‹** at the top-left of the header on **any page that is not a
bottom-tab root** (`/recipes`, `/schedule/proposals`, `/movement/…`, and so on —
never on Home, Workout, Nutrition, Progress, Messages, Settings). One behaviour:

1. If the previous history entry is inside the app → `history.back()`.
2. If there is none (deep link, fresh PWA launch) → go to the page's **parent
   tab**, so it can never do nothing.

**What it must never do:** push an invented history entry so that Back "has
somewhere to go". That is precisely the v2/v3 `BackButtonGuard` bug — a sentinel
entry with the same URL re-rendered the identical screen and read as *"Back did
nothing"*, and reloads re-armed it until every press was dead. The fix is a
control that calls back or falls back, and never fabricates.

**Risk: low.** It is chrome, built once in the shared shell (the same object
`#18 "the chrome agrees with the page"` just fixed), it draws nothing on tab
roots so no walked screen changes, and it is one test. It does not touch either
logger.

### Confirmed and built — 11 Sep

> *"Go ahead with the back button. Just be careful on this one. The actual back
> button on mobile phones still needs to work as it does right now, the same
> exact way as clicking the in-app back button. That's a big piece that I added
> to this because people are used to using the back button on their phone. Those
> two buttons should work the exact same way. When you hit either button, it
> needs to go back one page — the previous screen you were looking at."*

So it is built as **one rule, two buttons.** `src/lib/nav/backFromHere.ts` holds
the decision — `history.length > 1` → back one entry, otherwise Home — which is
*exactly* the two branches `BackButtonGuard` already runs for the Android
hardware key. A test pins the guard's lines unchanged, so the two cannot drift.

- **Where it draws:** `ClientTopBar`, the one client top bar, before the logo —
  on every page that is **not** a bottom-nav root. `/recipes` gets it; Home,
  Workout, Nutrition, Progress, Messages and Settings do not. Client View's
  `/client-preview/…` roots count as roots, so both mounts of the bar agree.
- **The fallback keeps Client View.** From a deep link with no history, Home is
  `/home?as=client` when he is in Client View — leaving it by accident is the
  boundary the 7 Sep middleware guard exists to hold.
- **It never writes history.** No `pushState`, no sentinel entry. A test forbids
  it, because that is precisely the v2/v3 `BackButtonGuard` bug.
- **44px target**, the same floor as every other control on a phone.

The phone's hardware Back is untouched. It was already correct; it now has a
twin on screen that does the same thing.

## Interlude — "as written" means the plan, not the day (11 Sep)

Dustin, on his own Nutrition tab, mid-audit: *"a little warning thing saying
this plan does not reach the target. Eating exactly as written comes to 3,553
calories. My actual calorie set is 4,462 … I've been eating on this plan
exactly what it says."* His live plan (BULK v2, resumes Aug 31) sums to
**4,462.5 kcal** from `meal_items`. The 909 kcal the warning could not find
was **Lunch, which he had swapped for restaurant fajitas that day**.

| Control | Before | Now |
|---|---|---|
| Today block · "⚠ This plan does not reach the target" (trainer, today only) | totalled the **day's rows** and skipped any slot that was not a plain plan meal, so a swapped, custom or removed slot dropped a whole meal out of an "as written" total | totals **`planMeals` as written**, one meal per position (a rotating slot counts its first option); recomputes when the plan or the target changes, never when a log does |

Test: `tests/unit/asWrittenMeansThePlanNotTheDay.test.ts`, red on all three
before the change.

## Interlude — height and sex belong on the client  ·  11 Sep 2026

Found from the plan builder's consult, which was estimating daily expenditure
with no height, no sex and no age to hand. There was nowhere to put them: the
client record had neither column, and `skinfold_logs` carried age and sex per
*reading* — which is why the body-fat screen defaults to 38 and "male".

Dustin: *"make sure those missing columns, the height and sex, go into their
actual profile page. Also make sure that gets added into the assessment page
and the onboarding. Whenever somebody starts the app it should collect all of
that information and put it in their profile. If a trainer is starting the app,
the assessment should get all of that information and put it in their profile."*

**Three doors, one record.** `clients.height_in` (inches) and `clients.sex`
(`male` / `female`, checked — never stored as anything else, never guessed):

| door | what changed | where it writes |
|---|---|---|
| **Onboarding** — Body Stats step | height (ft + in) and sex, beside weight and body fat | `/api/complete-onboarding` → the client's row |
| **Assessment** — Personal details | height and sex after date of birth; prefilled for an existing client | new client: `/api/create-client-from-assessment` with everything else; existing client: the record is updated as well as the assessment row |
| **Profile** | a *Body details* card with exactly these two fields, save button | the client's own row, under `client_update_own_clients` |

**On rule 6.** `/profile`, `/assessment` and `/onboarding` have not been walked.
They received these two fields at his explicit instruction and nothing else —
the profile in particular had no editable field at all before, and now has two.
Everything else on those screens is untouched and still waits for its walk.

The trainer tutorial's assessment step says the first step asks height and sex.

## Interlude — an AI draft is a proposal, not a verdict  ·  11 Sep 2026

Dustin, on the consult's draft screen: *"Once it spits out a recommended plan
and numbers, we need to put in a way to manually change these numbers and edit
this entire plan before you accept it to make an ongoing plan. Even though this
is run by AI, the client needs the ability to override those numbers and edit
this plan before they actually accept it."* Then, minutes later: *"Same issue
from the build from my targets and build it from the foods I eat."*

**The screen had been telling people to do this since it was built.** The drift
warning says *"Adjust the amounts before you save it"* — and there was nothing
to adjust them with. One Accept button, take it or run it again.

### What is editable now

One editor, because all three modes render through the same `AiPlanSheet`. A
test asserts there is exactly one draft block, so it cannot be forked per mode
and quietly lose editing on two of them.

| | |
|---|---|
| **Targets** | all four, his to override outright. Typing a macro refills calories 4/4/9; calories stay hand-settable — the same rule as the entry form |
| **Meal** | name, time, or remove the whole meal |
| **Item** | food name, amount, or remove it |
| **Totals & the target check** | recomputed as you type, from the items |

### Changing an amount scales the macros — from the ORIGINAL

Nothing in this editor lets anyone type a macro by hand. The whole complaint
behind this screen is invented numbers, so the honest handle is the portion, and
the grams follow it.

Each item is scaled from the item **as the model wrote it**, not from its
current value. Type 170 → 1 → 17 → 170 — which is what clearing a field and
retyping looks like — and you get back exactly the numbers you started with.
Compounding from the current value would not. Each item carries a stable `_k`
so removing one cannot shift which baseline another scales from, which an index
would.

### The target check is the server's

`planTargetDrift` is imported rather than reimplemented: 3% on calories, 5 g per
macro, the same numbers the prompt demands. A tolerance invented in the UI is
how "within 3%" becomes 24%.

### Found while testing this — the builder was truncating

Ten consecutive plan builds logged `No valid JSON after 2 attempts`, each
alongside an `ok`. The replies were 6,776-8,686 output tokens against
`maxTokens: 8000`: the JSON was being cut off mid-structure, both attempts
failed, and what reached the screen came from the **salvage** path
(`validatePlanAcceptingDrift`). That is also why his drafts kept missing their
targets. **Not fixed here** — it is its own change, and it is the next one.

## Interlude — the app works out what you burn  ·  11 Sep 2026

Dustin, mid-audit: *"For the build my own plan, when I have AI set the numbers,
where is it getting my total calorie expenditure from? Because I never put my
height in the test client app, and it needs my height to be able to figure out
that number accurately. So something is missing."*

**It was getting it from nowhere.** There was no expenditure calculation in this
app at all. The consult handed the model a weight, a body fat and a goal, and
the model wrote sentences like *"approximately 500-600 kcal below estimated
TDEE"* — having estimated that TDEE from nothing. No height reached it (the
column did not exist until that afternoon), no age, no sex.

So: *"set up the TDEE calculation in here in the code… If those numbers are not
already in my profile, it needs to ask for them and put them in my profile for
future use, and then it needs to get an accurate number to build the plan off
of that."*

### The arithmetic is arithmetic now

`src/lib/nutrition/expenditure.ts`, with the reasoning in it:

- **BMR** — Katch-McArdle from lean mass when body fat is known, Mifflin-St
  Jeor otherwise. Which one ran is stated to the client.
- **Activity** — split in two on purpose. Occupation (desk / mixed / on your
  feet) is the NEAT floor; each training day adds on top. One "activity level"
  dropdown makes someone with a desk job and five sessions a week choose
  between them, and that is most of this roster.
- **The goal shift is a percentage, not a flat 500.** 500 off a 3,600 kcal day
  is a nudge; off 1,700 it is a crash. A percentage says the same thing to both.
- **Floors** — 1,500 / 1,200 kcal, and 0.3 g/lb of fat. When the floor catches
  the arithmetic, the client is told.
- **Protein** on lean mass when body fat is known, bodyweight otherwise. Carbs
  take the remainder, which is the only one of the three that should.

### It stops rather than guessing

A missing sex, age, height or weight returns **422 with the list**, and the
sheet asks for exactly those, saves them to the profile, and resumes the build
without re-asking the three chips. A defaulted sex alone moves the answer by
**166 kcal** and nothing on screen would say so — which is the body-fat screen's
standing bug (age defaults to 38, sex to "male") arriving somewhere new.

A weight typed there is also written as today's weigh-in, because the
calculation reads the newest metric first and an older one would otherwise keep
winning over what was typed thirty seconds ago.

### The computed targets win

The model is told the targets are decided and not to recompute them — and then
the route **overwrites** `targets` and `reasoning` with the computed ones
anyway, and redoes the drift check against them. Telling a model not to do
something is a hope; this is the guarantee. The reasoning a client reads is now
built from the real BMR, the real TDEE and the real split, and it says plainly
that these are estimates from published formulas.

### Same inputs, same answer

The complaint underneath all of it: two clients with identical stats got
different targets on different days, because a model was deciding. Pinned by a
test.

### The shortcut card is the same engine

His check: *"make sure those do the exact same thing as those same options from
the actual build my own plan with AI menu — the exact same AI, everything works
exactly the same."* They already did. **Five doors, one sheet** — two on the
"turn this into my plan" card, three in the build menu, all `kind: "aiplan"` at
the same mode. A test pins the count so nobody builds a sixth, lighter path.

### Round two — and the bug the first round shipped  ·  11 Sep 2026

**The bug he found within minutes:** *"If I change the calories, it immediately
zeros out all of the protein, carbs, and fat."*

Typing `2000` into a 2,135 kcal target sends **four** values through `setKcal` —
2, 20, 200, 2000. The first scales every macro by 2/2135, which rounds all three
to zero; from then on there is no split left to keep and every later keystroke
just writes a calorie number onto three zeros.

The fix is the rule the item amounts already used and the targets did not:
**scale from the value as it stood when the field was focused, never from the
last keystroke.** Same oversight, same shape, now the same rule in both places.

**Added in the same pass, from his list:**

- **Add a food to any meal** — the same `FoodSearchSheet` the rest of the app
  logs with, so an added item carries `food_catalog`'s numbers and never a
  typed or model-invented one. It stacks OVER the draft rather than replacing
  it, because the draft lives in local state and navigating away would throw
  away every edit. An added item becomes its own scaling baseline, so its
  amount behaves exactly like one the AI wrote.
- **Revert to what the coach came up with** — the draft as it arrived is kept
  from the moment it loads, and the button only appears once something has
  changed. *"If I play around with the numbers and I don't like it, we can
  default back to what the AI originally put."*
- **Every edit recomputes everything.** *"If I edit anything, the logic auto
  adjusts everything."* Renaming a meal now goes through `recomputeDraft` too —
  a no-op for macros, but it makes the invariant unconditional, and a test
  asserts that NO draft write skips the recompute, so a path added next month
  is covered without anyone remembering.

**Still not built from his round-two list:** swapping an item for another *in
place* (add + remove does it today), rebuilding one meal with AI to a per-meal
target, reordering meals, and an explicit before/after delta against the
draft's own targets.

### Round three — the numbers had to be readable while he edited  ·  11 Sep 2026

Three reports off the same screen, in the order he hit them.

**1. "It adjusts the calories when I add, and it does not take them off when I
remove."**

> *"I added chicken to one meal and then removed it… it does adjust the
> calories on the plan that it does not remove when I remove it. That needs to
> be confirmed first. Pause when you can and make this priority because I can't
> really move forward on this audit until this is done."*

The draft arithmetic all lived inside a 4,500-line screen file, so the first
move was to take it out: `src/lib/nutrition/draftEdit.ts` now owns
`recomputeDraft` and every edit that feeds it, and `tests/unit/draftEdit.test.ts`
runs his exact sequence — load, add, remove, revert. Add-then-✕ was already
correct and the test proves it stays that way.

What reproduced was the other way of removing a food: **clearing the amount
box.** `scaleItemTo` ran three different cases through one guard, so an item
with no amount kept every macro it had. "6 oz chicken, 204 cal" became
" oz chicken, 204 cal" and the 204 stayed in the total behind an empty box.
The three cases are now separate:

| what you did | what happens |
|---|---|
| cleared the amount of a food that had one | its macros go to zero — there is no such thing as "some" of a food in a total |
| typed an amount | macros scale from the ORIGINAL, never compounding |
| an item that never had an amount ("to taste") | macros stay — they ARE the item, and a typed number cannot scale what has no baseline |

Clearing 6 to type 8 dips the total for one keystroke. That is deliberate: it
is the honest reading of a box that says nothing at that instant, and it is the
only version where the printed total is never a number the plan is not.

**2. The two banners were both moving, so neither was a comparison.**

> *"Recommended needs to stay what the AI originally recommended on this draft…
> The banner under that that says this plan comes to, that's the one that needs
> to auto adjust. So we have a comparison."*

**Recommended** read `draft.targets` — which he can edit in the box below it.
So the moment he moved a target, the recommendation silently became whatever he
had just typed, sitting next to the AI's unchanged sentence explaining it. It
is now frozen to the draft **as it arrived** and never moves again.

**3. …and then the second banner went away entirely.**

> *"What if we have the targets where they are and then have a slash and then
> the calories of what's actually in the meal plan? … The first number on those
> needs to be the one that changes. So the actual target is the second number…
> nineteen hundred calories out of eighteen fifty calories. That way I can see
> that I went over on my calories, and I need to make a fine tune adjustment to
> fix it. And then we don't need that banner at all."*

Done, and the banner is gone. Each of the four target boxes now carries
**`1,900 of 1,850`** underneath it — what the plan is, then what it is aiming
at — and the number turns red when that one field is out. The tolerance is the
server's own (`planTargetDrift`: 3% or 30 kcal on calories, 5g per macro), so
the box and the build agree about what "close" means.

**4. Percentages stopped moving on their own.**

> *"When I change one, it should not change the others. It should just show that
> the others do not match up to a hundred percent until I adjust them manually…
> and not allow you to save the plan until you adjust the rest of them."*

The old behaviour rebalanced the other two on every keystroke, which kept the
numbers valid and made a custom split impossible to type — reach for protein
and carbs had already moved. A split is now **entered as a set**: the three
boxes hold exactly what he types, they and the line under them go red with the
running total ("These percentages come to 95%, not 100%"), nothing is applied
to the grams, and **Accept is disabled** until they add up. Grams stay the one
truth, because a split that is not a split never becomes grams.

### The back button on his phone  ·  11 Sep 2026

> *"My back button function on my mobile is all screwed up. If I hit back on my
> phone from recipes, it signs me out and puts me on the sign in screen."*

It does not sign anybody out. Chrome **restores an installed PWA's history
across launches**, so Back can walk off the end of today's session and into a
`/login` entry left over from a previous one — and it comes out of the
back-forward cache, which means the middleware that redirects a signed-in
visitor to `/home` never runs. A live session looking at a sign-in form.

`/login` now answers for itself: on mount and on every `pageshow` (which is the
event a bfcache restore fires, and the only one), a readable session replaces
the page with `/home`.

The second half — *"if I hit it from pretty much anywhere else, it goes back to
the progress tab"* — is the same restored stack, and it is not harmful: those
are real app screens he really did visit, just in a previous launch. Left alone
for now rather than guessed at; if it still reads wrong once the sign-in bounce
is live, the fix is to stamp each entry with an in-session depth so both back
buttons stop at the launch entry and go Home instead.

### The contrast fix, checked in both appearances  ·  11 Sep 2026

The first pass measured every scheme **as designed** and stopped there. That
covered half the matrix. With a Light/Dark toggle in the app, each of the
thirty schemes can now be shown the other way round, and a 3% dark tile lift
did not hold for the flipped ones: **Charcoal 1.244, Deep Purple 1.249, Rose
1.277** — near-black primaries, so every surface derived from them collapses
back toward the page.

**5%** is the value where the worst case in the whole matrix — thirty schemes
times both appearances, sixty combinations — is **1.292**, the same number the
worst light scheme sits at. One relationship everywhere, whichever way round.

| | worst | best |
|---|---|---|
| as designed | 1.292 (Citrus) | 1.709 (Carbon Neon) |
| flipped by the toggle | 1.320 (Charcoal) | 1.950 (Citrus dark) |

`tests/unit/tilesStandOffThePage.test.ts` reads the real stylesheet, resolves
the same `color-mix` chain the browser does, and fails if any of the sixty
drops under 1.28. It was run against the numbers that shipped before this
(a 6% sink, no lift) and fails there, which is the only reason to trust it.

**The mock-up sheet** — `docs/mockups/nutrition-format.html` — gained three
things for approving this: a **Light / Dark / Auto** segment that replays
AutoDark's real rule, a **"Before the fix"** toggle that puts the 6% sink back
so the merge is visible side by side, and a live page-vs-tile contrast readout
measured off the rendered pixels rather than the tokens, so it cannot flatter
the fix.

### Approved and live: the strongest background  ·  11 Sep 2026

He looked at the first fix on the live app and it was not enough:

> *"Whenever you switch it to light mode, a lot of the color schemes, the
> actual tiles are too close to the same exact color to the background. So
> it's the background that we need to adjust… I need a little bit more
> contrast so the tiles pop out a little bit more and separate from each
> other. Remember this gets applied once I approve it to the nutrition page
> and the workout page."*

Five stops went onto the mock-up sheet rather than a guess at what "a little
bit more" meant. His answer: **`"use strongest for the background"`**.

| stop | light schemes |
|---|---|
| original | 1.130 – 1.209 |
| first fix (earlier the same day) | 1.292 – 1.416 |
| more | 1.496 – 1.749 |
| strong | 1.657 – 1.973 |
| **live now — approved** | **1.836 – 2.230** |

`--sink: 24%`, `--page-tint: 8%`, `--tile-deep: 0%`. The tile is now simply its
own surface; all the separation comes from the page.

**Why there is a tint at all.** Sinking toward near-black darkens every scheme
by the same amount and desaturates it on the way down. At 24% with no tint,
Citrus lands on `#B4B7BC` — a grey, and the scheme is gone. Mixing 8% of the
scheme's own primary back in afterwards holds the hue: Citrus `#B8C2B2`, Hot
Pink `#DBBACB`, Orange `#C3B0A1`, Lagoon `#A9BABC`, Forest `#ACB6AE`. Deeper
shades of their own schemes, which is what he asked for both times.

**Both pages at once, and nothing else.** `.sym-page` is the wrapper and only
three files carry it: the Nutrition v3 client, the Workout tab, and the app
error screen. Both target screens wrap their whole tree in it, so every tile,
sheet and control inside them moves together — there was no per-component work
to do. `WorkoutDaySheet` is the one thing that portals to `document.body`
instead; it uses none of the tile tokens, so it is unaffected.

The dark side is untouched. A dark page is already within a few points of
black, so sinking moves nothing — there the tile lifts instead, and he said the
dark side reads right.

The mock-up sheet keeps all five stops so the decision can be walked back or
nudged without rebuilding it.

### The off-plan photo: three defects, one root each  ·  12 Sep 2026

> *"To have AI get macros and replace a meal is not working in my app right
> now. It takes the picture, then it goes back to the menu."*
>
> *"Tried using image already took, 4 slices it says 1 slice. also I can't edit
> it, edit screen shows originals. This is the type of thing I was saying is
> not working in here."*

**1. The camera killed the sheet.** Nothing was wrong with the camera or with
`/api/analyze-meal-photo`. The chain:

1. Tapping **Snap a photo** opens the camera app, so the PWA goes hidden and
   `RefreshOnReturn` stamps the time.
2. Taking a picture takes well over its 3-second `MIN_AWAY_MS`.
3. Coming back, it fires `router.refresh()` 700 ms later — which is exactly
   what it is for, and its header promises it *"unmounts nothing"*.
4. That promise holds **only while the component types are stable.**
   `OffPlanSheetView` was declared *inside* `NutritionV3Client`, so every
   render minted a new function identity; React saw a different type at that
   position and threw the subtree away.
5. `OffPlanFlow`'s state died with it — `mode` back to `"pick"`, the file and
   the estimate gone, the analyze request still in flight resolving into
   nothing. No error, no spinner. The menu.

It reproduced every single time from the camera and never from **Pick a photo
you already took**, because the gallery picker does not background the app —
which is why his second attempt got as far as an estimate at all.

The sheet is now mounted as `<OffPlanFlow>` directly from `renderSheet`, a
module-level type that does not change between renders, and the commit logic
moved out to `commitOffPlan` unchanged.

**2. "4 slices it says 1 slice", with no way to say otherwise.** The route
returned four totals and a paragraph of prose. The model's assumption — *"a
standard slice (~1/12 of the 40 oz cake)"* — was buried in that paragraph and
was **final**: with no item list, the estimate card had no per-item stepper to
correct a count with.

It now returns `items`, one per distinct food, and the prompt says the count IS
the amount: *"1 slice", "6 wings", "2 tacos"* — never "1 serving" for something
it counted. Four slices is now ×4 on the stepper, two taps.

**3. Edit opened the meal plan's own food.** Same root. The client writes
`item_overrides.__custom.items` from that list, and that is what makes a saved
row kind `"custom"`. With none, the row stayed kind `"plan"`, so **Edit** opened
`PlanAdjustSheet` seeded from the plan — Boiled Eggs, Sourdough, Egg Whites,
Almond Butter — for a row that held a cheesecake.

This is **Megan Gautreaux's 17 Aug report**, word for word: *"when I click on
edit it pulls up the list of original meal plan, not the meal I logged with the
picture."* It was fixed for the typed path, because `parseFoodText` already
returned items, and the fix's own comment claims to be "the whole fix". It never
covered the photo path, which is the path she reported it on.

**The totals stay authoritative.** They are what is anchored to a chain's
official nutrition data; the items are a breakdown *of* them, not a second
opinion. `photoItemsFor` accepts the list only when it sums to within 10% (or
60 kcal, whichever is larger) of the reported calories, and drops it otherwise —
a stepper that jumps the day's total the moment it is touched is worse than no
stepper, because the number it jumps to looks just as official as the one it
replaced.

`tests/unit/photoMealIsCorrectable.test.ts` covers all three. The remount guard
was run against the restored wrapper and fails there.
