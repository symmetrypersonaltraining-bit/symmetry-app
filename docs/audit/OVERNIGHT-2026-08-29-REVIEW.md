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

## Still queued for tonight

#5 duplicate workout logs · #6 zero cannot be recorded · #8 invoice arithmetic ·
#12 social posts stored as payments · #14 the unreachable overdue badge ·
#36 the bell ignoring notification settings · #39 Body Fat showing "—" for six
clients · #43 challenge scoring · #59 today's supervised sessions · and a fresh
audit pass at the end.
