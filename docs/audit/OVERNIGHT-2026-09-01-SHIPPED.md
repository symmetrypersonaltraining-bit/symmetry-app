# Overnight run, 1 Sep 2026 — what shipped

Green light: "All of it. Delete all for christine n archive she quit."

`origin/main` af27201 → **802c864**, seven commits. Every one passed
`npx tsc --noEmit` (0 errors in src/), `npm run test:unit` (0 failed) and
`npx next build` ("Compiled successfully") before it left the sandbox.
Unit tests 2,529 → **2,601**. Every fix has a test that FAILS on the old code —
proved by reverting the source and re-running, not by assuming.

---

## Money

**#11 — A client billed on the 29th had no February invoice.** `62a98b3`
`setUTCMonth(m + 1)` on a 29th, 30th or 31st overflows past the month asked
for: 29 Jan + 1 month became **1 March**. So that client skipped February
entirely, and every cycle after was permanently one or two days out of step,
leaving a window that belonged to no cycle at all — sessions in it were billed
to nobody. Lauren and Tim are both on the 30th; Jennifer Day is quarterly on the
30th. Month arithmetic now clamps to the last day of the target month. Postgres
already did this correctly; only the JavaScript was wrong.

Clamping alone cannot make cycles tile, because guessing backwards is never a
true inverse — "the 31st, minus a month" from 28 February is the 28th. So where
the previous due date is recorded it is now used instead of reconstructed, on
the screen and in `recalc_pending_payment_reminders()`. **No open invoice
changed amount** — every current cycle is anchored mid-month.

**#18 — The payments screen said nobody had ever been emailed.** `698bc4c`
It read `sms_sent_at` and called it `emailSentAt`. Nothing has ever written
`sms_sent_at` — 0 rows of 52, against 30 with `email_sent_at`. Home read the
right column and showed it, so two screens contradicted each other about whether
a client had been asked for money. The query did not even select the column it
rendered.

**#65 — The one live critical was a false alarm that fired by design.** (DB)
`gcal_sync_stale_over_60min` measured `max(appointments.updated_at)` — the last
time an appointment ROW changed. The sync runs hourly and succeeds, but on a day
nobody moves anything there is no row to update, so it sat red most of every day
and a real outage looked exactly like a quiet Sunday. That is how the 25–26 Aug
outage ran 32 hours before anyone noticed: the board was already red, so red
meant nothing. Now `gcal_sync_stale_over_90min`, measured off `gcal_sync_runs`.
Proved it still fires: 0 now, 1 if the sync stops for two hours, 1 if every run
fails.

---

## Nutrition

**#48 + #50 — A food you add to a meal keeps its size and its nutrients.** `210b170`
Two bugs in the same few lines. `resolveEditedItems` scaled added foods by
`servings` alone while the day total used `addedScale()`, which knows p/c/f
describe `base_amount` of `unit`. 170 g of chicken quoted per 100 g counted as
1.7× on the day it was eaten and **1× the moment it was saved into the plan**;
50 g counted 0.5× then 1×. And both add paths wrote only name + three macros,
dropping fibre, sugar, sodium, saturated fat and the other 29 — a food with a
full lab panel became a three-macro food the moment it was added.

**#49 — Thirteen taps to go from 300 g to 170 g.** `5dbd9c7`
The amount was a read-only label between a minus and a plus, and grams step by
ten. It is a number you already know, so you can type it now. No unit dropdown
on plan items, deliberately: they carry no `grams_each`, so a dropdown would
have to guess what a cup of this weighs, and a macro total built on a guess is
worse than one more tap.

**#54 — 100 calories on the row, 118 in the day.** `0a79c87`
Every item card prints the catalogue's label kcal; the total beneath them threw
it away and recomputed Atwater 4/4/9 from the macros. Those disagree routinely.
The total is now the sum of what the rows show — "these add up" is the property
a person checks. **Worth knowing:** the day's kcal need not equal 4P+4C+9F of
the day's macros. It never did for the item cards either.

**#53 — Correcting a food stripped it.** `019abba`
"Fix these macros" on a scanned product routes through the custom-food form,
which collects name/serving/macros — so correcting a Quest bar's protein also
stripped its gram weight, serving options and every nutrient the Open Food Facts
import had given it. **The correction left the food worse than the row it was
correcting**, and un-re-portionable for good.

**#27 — One meaning of "the model did not say".** `0a79c87`
The photo route stored a missing protein as a real 0 g while, twenty lines
later, keeping a missing fibre as null. Same row, same update.

---

## AI

**#24 — The prompt asked for exactly what the validator threw away.** `0a79c87`
`ACT_SYSTEM_PROMPT` tells the model to answer intent `"none"` with an EMPTY
reply; `validateActReply` treated that as a hard parse failure. Every model that
obeyed was rejected and retried, and the retry obeyed the same instruction and
failed the same way — two calls and doubled latency on every training question,
~30% of `coach_action` logged as failed. Nothing reached a client wrong; it was
a standing tax on the budget the spend cap exists to guard.

**#25 — The assessment recommended programmes that do not exist.** `019abba`
The routing block was hand-written and never reconciled with `programs`: eight
of thirteen names are not in the table ("Scapular Precision Program" is really
"Scapular Stability & Shoulder Mechanics"). Nothing downstream checked. The
prompt now carries the real list (live, shared, deduplicated) and the model
returns an **id**; the displayed name is rewritten from the row it resolves to.

---

## Progress and counting

**#40 / #41 / #44 — Progress gave two answers to the same question.** `0149df3`
Body fat said "Not enough data" at every range because the series was filtered
twice and the second pass can only narrow the first. The same weight statistic
read +13.4 lb on the tile and +18.6 inside it — two range controls with
different defaults, and a delta whose endpoints came from different arrays, so a
NARROWER range produced a LARGER change. The Workouts tile ignored its own range
control entirely and counted abandoned sessions as done.

**#45** — the leaderboard window was open at the top; a future-dated row scored.
**#46** — the week card and the AI brief both counted swapped-out sessions, so a
fully adherent week read as half done. Fixed in both, because fixing one would
have moved the disagreement rather than removed it.

**#43 (scoring half)** — the challenge board scored off `completed_at`; every
other surface reads the `completed` boolean. **326 of 1,194 finished workouts**
carry `completed = true` with no timestamp, so better than a quarter of every
session anybody has ever finished scored zero on the board while counting
everywhere else — a client could watch their streak climb and their rank sit
still. The predicate was wrong, not the data; `log_date` is recorded on all
1,195 rows.

---

## Cleanup

**#33 — The search box could only see the front of the alphabet.** `b25b0d3`
The library swap list fetched 400 days of 1,205 and filtered them in the
browser. "push" matches 24 and found a handful.

**#67 — A chart is not a dead zone.** `b25b0d3`
`touchAction:"none"` on the client home chart, which has no touch handlers at
all, so it blocked page scrolling and bought nothing.

**#22 — Nudge, gone.** `802c864`
Route and segment deleted. `nudgeSweepIsOff.test.ts` now guards the absence. The
database freeze stays.

**N1** — Tina Haley was archived on 13 Aug with a live meal plan. Archiving now
retires the plan. **N2** — duplicate macro-target rows are now surfaced by an
integrity check rather than resolved by row order.

---

## Roster

Robert Miller, Bobbie Page and Christine Latham archived; outstanding invoices
deleted; reminders off. Archiving is now datable (`archive_effective_on` + a
06:40 CT job) and an archived client can no longer be invoiced.

**Christine's one PAID row was kept deliberately** — it is the record that money
changed hands and the surviving half of the July double-charge. Backed up; say
the word and it goes.

---

## Closed without work

**#17** — archived clients excluded from invoicing: fixed hours earlier.
**#69** — `used_on` in UTC: stale finding, `chicagoToday()` at every write since
23 Aug, four days before the audit was written.
