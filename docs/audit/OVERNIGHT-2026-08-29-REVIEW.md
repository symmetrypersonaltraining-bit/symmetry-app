# Review list — what changed overnight, 28–29 Aug 2026

Everything here is **shipped to `main`** and proved against live data. Evidence
for every line is in `OVERNIGHT-2026-08-29-TESTS.md`. What still needs you is in
`OVERNIGHT-2026-08-29-NEEDS-YOU.md`.

**Nothing in this list was decided by me where a decision was yours to make.**

---

## Fixed

### #1 · Cancel no longer eats a finished workout `20ff885` [you approved this file]

Cancelling deleted the sets with **no condition at all**, then deleted the
parent guarded by `completed = false` — with a comment above it saying a
finished workout must never be deletable from here. The guard was on the wrong
statement, and Postgres does not complain about a delete that matches nothing,
so both calls "succeeded" while the workout row survived still reading complete.
15 sessions were destroyed that way.

The set delete is **removed**, not guarded: the foreign key is
`ON DELETE CASCADE`, so deleting the parent is deleting the sets, and one
guarded statement cannot disagree with itself the way two did. Cancel is also no
longer offered on a finished workout — that state now comes from the database
instead of local state that reset on every reload.

**What to check:** finish a workout, reload it, confirm there is no Cancel
button. Start one, log a set, cancel it, confirm it clears properly.

### #3 · Your feedback is yours alone `8dd52c6`

All 66 of your own entries were readable **and deletable** by every trainer
account, including the five testers. One `FOR ALL` policy whose function returns
`is_trainer()` for any row with a null client. Read is now split from delete;
delete is owner-only.

**What to check:** your feedback list still shows everything (106 rows).

### #2 · The open redirect is gone `8dd52c6`

`/api/set-client-mode?redirect=` sent anyone anywhere with no login and planted
a cookie the in-app toggle could not clear. Nothing called it.

**What to check:** the Trainer/Client view toggle still works normally.

### #28–#34 · The truncation family `fa650be`

- **Your trainer calendar had shown nothing since 29 July.** 2,063 today-or-future
  sessions never loaded. Fixed.
- **The Workout Library counts were wrong on 1,100 of 1,112 days** — 471 showed
  "0 exercises". Now counted in the database.
- The day picker and library list dropped 167 workouts, and *which* 167 changed
  between page loads. Fixed and ordered.

**What to check:** open your calendar and confirm August and September are
there. Open the Workout Library and confirm the exercise counts look right.

### #47 · A banana is not a cup of mashed banana `47017b9`

My bug from the 26th. `Bananas, raw` resolved to **1 cup, mashed — 225 g**. Now
a piece beats a volume.

⚠️ **Read the two corrections in the test record.** My first fix was also wrong
(`1 almond = 1 g`), caught only by testing against real rows instead of ones I
invented. And my "59,477 rows" figure was misleading — most are branded rows
where the cup is the correct label serving.

**What to check:** add a banana and confirm the portion is sane. **There is an
open question for you about cheese, nuts and meat — item 4 in the needs-you list.**

### #64 · Madeleine's birthday `16b839e`

She could always fix it herself; she was never asked, because the prompt fired
only on a *missing* date and hers was present (2026-08-04 — 23 days old). An
impossible date now counts as no date, so she gets prompted at next login. The
intake form that let it in now has an upper bound.

**What to check:** nothing. **I did not message her** — see item 10 in the
needs-you list, with a draft.

---

## Found while working, not in the original audit

### ⚠️ One unit test was failing and I reported it as passing, three times

`npm run test:unit | tail -N` prints the **last sub-suite's** summary, not the
run total. I read `41 passed, 0 failed` from it and put that in three commit
messages. The real total was **2,509 passed and 1 FAILED**, and the failure was
mine — I had hand-rolled the Central-date idiom for the 100th time in the intake
form and tripped a guard that exists to stop exactly that.

Fixed by importing the shared helper. **The suite was right and my reading of it
was wrong.** The correct command is now recorded at the top of the test record.

This is the same failure mode as the 2,500 green tests: a number that looks like
an answer and is not.

### ⚠️ The static audit was crying wolf

It flagged a read that is filtered by primary key and returns one row. Guards
existed and never ran, because the window was a fixed 700 characters and the
statement carried a long comment. **So the truncation family is 6 real sites,
not 7** — corrected in the master list. `AUDIT.md` rule 2 says an audit that
cries wolf gets ignored, which is worse than no audit; it had started doing that.

### ⚠️ A measurement trap that nearly became a false finding

Checking my own cleanup, one query reported "4 orphaned sets" and "2 scratch
rows left behind". Both were wrong — CTEs in a single statement read the same
snapshot and cannot see each other's writes. Re-queried separately: 0 and 0. I
was one step from filing "the cascade is broken".

---

### #6 · Zero is a number again `b988f56` [logger — you approved]

`parseFloat(x) || null` returns null for zero, so **286 sets** are on record as
completed with nothing behind them — and **Machine Assisted Pull Up has 164
logged sets with only 5 at zero assist.** Reaching zero assist is the entire
point of your pull-up rule, and the app recorded it as "didn't enter anything".

**What to check:** log a set with 0 assist on an assisted pull-up and confirm it
sticks.

### #5 · Only one workout can be open at a time `b988f56` [logger — you approved]

Two logs were being created milliseconds apart and the sets written to the loser
left history — Tyler's 160 lb × 10 lat pulldown among them. **No data was
changed**: there were zero duplicate groups among open logs, so the index went on
clean. The 59 historical duplicates are all among completed logs and are in the
needs-you list.

### #39 · Body Fat shows the reading `9a0bb05`

Six clients showed "—" with a trend line drawn beside it. Each field now finds
its own newest reading.

⚠️ **Yours reads 5.2%**, against 11.5% in June. That is what is on file and the
tile will now show it. It looks like a mis-entry — I have not touched it.

### #12 · A social post is not a payment `9a0bb05`

"POST STORIES — Perfect Day Macro Log" was filed as a payment marker against
Jennifer Day, and another against Stacie Weever. Nothing broke only because both
already had an open invoice blocking generation. Now an event needs a dollar
figure. The four bogus rows are backed up and removed.

### #8 · Your invoices explain the right billing `ff776eb`

Tim's phone said "8 sessions × $70 = $490". **Not one client is on per-session
billing** — 15 monthly, 5 flat, 16 none, zero per-session — and that was the one
basis the code wrote for everybody.

**What to check:** open Tim Yancey's and Sharon Rambo's invoices and confirm the
line now describes monthly billing. **Newly sent invoices carry the fix; already-sent
ones keep what they were sent with**, which is deliberate.

### #14 · The overdue badge can fire `ff776eb`

It counted a subset the query had already excluded — unreachable, not empty.
Now shows Christine ($320) and Sharon ($300), matching the other panel.

### #4 · The leaderboard stops naming everyone in full `469214a`

Every client saw every other client's full name. Now first names, with a last
initial only where one repeats — you have two Sharons.

⚠️ **The audit was wrong about the rest of this one.** It said 23 people never
opted in, measured against a column **this board does not use**. The board uses
an opt-out, and the 2 who used it are correctly absent. Ranking everyone is a
deliberate decision your own code documents from 1 Aug. **I did not reverse it.**
If you want opt-in-only, say so.

### #36 · The bell obeys the settings screen `b045431`

Jennifer's complaint, still true on three surfaces after the banner was fixed —
because the check lived inside one component. **Right now she has group chat off
and an unread group message on her bell.** One shared reader now.

### #7 · A future date cannot already be done `1863098`

Guarded in the picker and, more importantly, on the server. **The existing
28 Aug row is untouched** — see the needs-you list.

### #59 · Supervised sessions appear on Today `1863098`

Today's Sessions was built from appointments alone, so a supervised workout with
no appointment was invisible on your own screen — Troy and Tyler on the 27th,
and it recurs most weeks (227 overall). They now show, with no invented time.
A cancelled session also no longer counts toward "N scheduled".

---

## ⚠️ Worth your attention

**Three of tonight's four test failures were false alarms** — tests asserting
that a source file contains a string, breaking on changes that improved the
behaviour they exist to protect. The fourth was real and caught me twice. All
four now assert behaviour. This is `docs/AUDIT.md`'s thesis, still live in your
suite: a spell-checker cannot tell a refactor from a regression.

**Deploy check still outstanding:** `/api/set-client-mode` should 404 in
production once Vercel redeploys. Worth one click.

---

## Still queued

#43 challenge scoring · #40/#41 Lauren's charts and the weight tile · #42 the
two average-calorie figures · #33 library swap search · #48–#51 the food and
plan-item items · #57 Brooke's coverage warning · #58 the 70 mismatched
assignments (needs you) · #24/#25 the two AI prompt faults · and a fresh audit
pass at the end.
