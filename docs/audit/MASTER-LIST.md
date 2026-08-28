# Master list — every audit finding, with a decision slot for each

**This is the authoritative list.** `FULL-APP-AUDIT-2026-08-27.md` is the
evidence behind it; `FIX-QUEUE.md` is the plain-English walkthrough of the top
items. When they disagree, this file wins, because this is the one Dustin's
answers get written into.

**70 findings are enumerated below, numbered 1–70.** (#28–#34 are the seven
truncation sites, listed as a table inside Group 5 because they are one bug.) The original audit reported "~60"; the
count differs because the LOW section of the audit report compressed its items
into prose. See **§ What did not survive** at the end — about 8 low-severity
items exist only as the phrase "and others" and cannot be recovered from the
record. That is stated rather than papered over.

## UPDATE — 28 Aug, after four commits from another session

`994cd4a`, `55e1090`, `93f1d86`, `391297b` landed on the food path. Re-checked
against live data and the running code, not against the commit messages:

**Genuinely fixed.** The "1 100 g" bug — the model answering "each" / "serving"
/ "whole" when no measure was named, which took the unit path, missed the row's
own "1 bagel (95 g)", and fell through to the literal string `100 g` that sits
on 574,372 rows. `isGenericUnit()` now reads those words as "one of the thing".

**A policy change worth recording as a decision.** `nutrition-ai/meal-edit` may
now return model figures when the catalogue misses, marked `estimated: true` and
shown as an estimate on the row. That partly answers the second open question in
**#19** — the choice made was *estimate, but label it* rather than *log nothing
and ask*. Confirm that is what you want and I will close that half of #19.

**NOT fixed, despite touching the same file — #47 is still live.** I replayed
the real exported `householdServing()` against real catalogue rows rather than
reading the code:

    Bananas, raw      -> 1 cup, mashed = 225 g
    Cheese, cheddar   -> 1 cup, diced  = 132 g
    Nuts, almonds     -> 1 cup, whole  = 143 g

Still the first countable option, still alphabetical, still a cup.

**Everything else re-checked 28 Aug and unchanged:** #1 five empty sessions in
14 days · #20 71 saved meals across 7 clients · #21 Brooke still 198 g against
160 g · #48 still 15 of 1,859 plan items carry nutrients · Group 5 static audit
still 5 findings.

**#19 has grown.** 1,109 → **1,128** rows of AI-estimated nutrition, still 18
clients. It is accumulating at roughly 19 rows a day while the decision is open.

**#22 is holding.** Zero nudge rows since the freeze; sent still 20 all-time.

---

## Status of the numbers in this file

Every figure marked **[re-verified 27 Aug ~12:00 CT]** was run against the live
database today, in this session, after the audit was written. Figures marked
**[from audit]** are carried from this morning and were not re-run — either
because they need a code path rather than a query, or because re-running them
would not change the decision.

Three of this morning's figures came out **different** when re-run. They are
flagged inline with ⚠️ and the corrected number is given. Nothing has been
quietly adjusted.

## How to use this

Read down the list. Under each item there is:

> **DECISION:**  _(blank — Dustin fills this in)_

Anything left blank does **not** get worked on in the overnight run. Items
tagged **[MECHANICAL]** only need "yes"; a blank on one of those means it waits.

Tags:

- **[MECHANICAL]** — one right answer, no design choice. Confirm and go.
- **[YOUR CALL]** — a genuine choice about how the app should behave.
- **[PERMISSION]** — touches a file under a standing rule (both workout
  loggers). Cannot be started without an explicit yes.

---

# GROUP 1 — data loss and security. Do first.

## 1. Cancelling a workout deletes the sets of an already-finished session [PERMISSION]

**What you see.** A client trains, logs every set, taps Finish. Then taps the
red Cancel in the top-left on the way out — or reopens the finished workout
later and taps Cancel, which is always offered because the "already complete"
state does not survive a reload. Every set is deleted. The workout row survives
and still reads complete, so the schedule and adherence look normal while the
training history is empty.

**Why.** `discardSession` (`WorkoutLogger.tsx:1901`) deletes the sets with **no
condition on it at all**, then deletes the parent row guarded by
`completed = false`. The guard is on the wrong statement — and there is a
comment directly above it saying a finished workout must never be deletable
from here. PostgREST does not error on a delete that matches nothing, so the
code sees two successes and exits happy.

**Damage.** ⚠️ **15 sessions, not the 12 in the audit report.**
[re-verified 27 Aug]

| Client | Date | Length |
|---|---|---|
| Jennifer Day | 26 Aug | 27 min |
| Cheyenne Martin | 22 Aug | 50 min |
| Sara Prince | 17, 11, 9, 6 Aug | 7, 49, 11, 26 min |
| Dustin Gautreaux | 17 Aug, 10 Jul, 3 Jul | 30, 45, 60 min |
| Jennifer Day | 14 Aug | (stale, auto-closed) |
| Claudine Ocon | 1 Aug | 63 min |
| Lauren Standefer | 23 Jul | 41 min |
| Celeste Lennon | 1 Jul | 28 min |
| Stacie Weever | 25 Jun | 64 min |
| Lesly Spencer | 25 Jun | 41 min |

**The set data is not recoverable.** A delete leaves nothing behind.

**Proposed fix.** Put the same `completed = false` guard on the set delete;
check the delete actually matched a row before reporting success; and stop
offering Cancel on a session that is already finished.

> **DECISION — permission to edit `WorkoutLogger.tsx` for this one fix?**
> _(blank)_
>
> **DECISION — on a finished workout, hide Cancel entirely, or show it and
> refuse with a message?**
> _(blank)_

## 2. `/api/set-client-mode` is unauthenticated and redirects anywhere [MECHANICAL]

**What you see.** `symmetry-app-omega.vercel.app/api/set-client-mode?mode=1&redirect=<any URL>`
sends whoever clicks it to any site on the internet, with no login. Proven
against production. It also sets an HttpOnly cookie flipping the app to client
mode for 7 days — a cookie type the in-app toggle physically cannot clear, so a
trainer who hits that link sees client screens for a week while the menu still
says "Trainer View". [from audit]

**Why it matters.** A link on your own domain that lands somewhere else is the
standard shape of a phishing attack, on an app holding health data.

**Proposed fix.** Delete the route. Nothing in the codebase calls it — every
real toggle sets the cookie from the page itself.

> **DECISION:** _(blank)_

## 3. Any trainer can read and delete all your feedback [MECHANICAL]

**What you see.** All **66** feedback rows that belong to you — your product
backlog, plus clients' own words about their food and their bodies — are
readable *and deletable* by every trainer account. That currently means
**Stephanie Gautreaux, Justin Ray, Ian Christman, Alan Meier, Oliver Gergelj,
Brooke Orton**. The delete was proven under a tester's login and rolled back.
[re-verified 27 Aug — 66 rows, 7 active trainer accounts]

**Proposed fix.** Restrict those rows to you, and split read permission from
delete permission so nobody but you can destroy them.

> **DECISION — should the testers be able to *see* your feedback list at all,
> or only their own?** _(blank)_

## 4. The challenge board names clients who never opted in [MECHANICAL]

**What you see.** Every client's home screen shows a ranked board listing people
by **full name** with their session counts. ⚠️ **7 of 40 have opted in**, not
the 6 of 29 in the report. [re-verified 27 Aug] The two API routes honour the
opt-in correctly; the component actually rendered on the home screen does not,
and it prints full names where the rest of the app uses first names.

**Proposed fix.** Filter to opted-in clients, first names only.

> **DECISION — go ahead? And should the header count show the whole room or
> only the people competing?** _(blank)_

---

# GROUP 2 — logging integrity

## 5. Two workout logs are created milliseconds apart; the first set is orphaned [PERMISSION-adjacent]

`ensureWorkoutLog` does select-then-insert with no unique constraint behind it,
so two rows can be created for the same client, day and date. The set logged
against the first one disappears from history. Tyler Dorsett's 160 lb × 10 lat
pulldown is not in his history because of this.

⚠️ **58 client/day/date combinations have more than one log row**, over the
whole history — the audit's "six times in August" was a narrower window.
[re-verified 27 Aug]

**Proposed fix.** A partial unique index on
`(client_id, day_id, log_date) where completed = false`, and let the insert
conflict instead of racing.

> **DECISION:** _(blank)_

## 6. A logged set can save with every value NULL, and 0 cannot be recorded [PERMISSION]

`parseFloat("0") || null` returns null, because 0 is falsy. Two consequences:

- **286 sets** are on record as completed with nothing behind them — no reps,
  no weight, no time, no distance. [re-verified 27 Aug]
- **Machine Assisted Pull Up** has **164 logged sets** and only **5** carry an
  assistance value of 0. Reducing the assist to zero is the entire point of
  your pull-up rule, and reaching it stores as "didn't enter anything".
  [re-verified 27 Aug]

**Proposed fix.** `Number.isFinite(parseFloat(x)) ? parseFloat(x) : null`.

> **DECISION — permission to edit the logger for this?** _(blank)_

## 7. "Mark completed on this date" accepts future dates [MECHANICAL]

The backlog-a-finished-workout picker allows dates after today, so a session
shows as done before it happens. **1 live instance: a completed log dated
2026-08-28.** [re-verified 27 Aug] Celeste has used the same button five times
this month.

**Proposed fix.** No date after today for a backlog action.

> **DECISION — go ahead? And what happens to the existing 28 Aug row: leave,
> correct the date, or delete? (Nothing gets deleted without your word.)**
> _(blank)_

---

# GROUP 3 — money

## 8. Client invoices print arithmetic that is false [MECHANICAL]

**What you see.** Tim Yancey's phone says *"8 sessions × $70 = $490."* That is
560. Sharon Rambo's says *"6 sessions × $75 = $300."* That is 450. The totals
charged are right; the sentence explaining them is wrong.

**Why.** `ReminderEditor.tsx:428` hard-codes `basis: "sessions_trained"` for
every client. ⚠️ Confirmed today: **all three of Tim, Sharon and Christine are
`monthly_adjusted`, none is `sessions_trained`.** [re-verified 27 Aug] Your own
editor shows Tim **$560** — see #8b, found after this section was written. Both
screens are wrong, in two different places, for two different reasons.

**Proposed fix.** Describe the billing type the client is actually on.

> **DECISION — go ahead? And should the client see the deduction spelled out
> ("$840 − 5 missed × $70") or just the final figure?** _(blank)_

## 8b. The reminder editor treats EVERY client as per-session — one tap overcharges $1,097 [MECHANICAL]

**Found 27 Aug ~09:50 CT from Dustin's screenshot of Cheyenne Martin's card, and
re-verified against live data before being written here.**

**What you see.** Her card reads *"6 sessions × $80 = $480"*, then a red *"Draft
$400 does not match calculated $480"*, with a **"Use calculated $480"** button
beside it. **The $400 is correct. The $480 is wrong.** Tapping that button
overcharges her $80.

**Why.** This is a DIFFERENT line from #8. `ReminderEditor.tsx:207`:

```ts
c.billing_type === "flat" || c.billing_type === "none" || c.billing_type === "per_session"
  ? c.billing_type
  : (c.flat_billing === true ? "flat" : "per_session")
```

`"monthly_adjusted"` is not in that list, so it falls through to `per_session`.
**All 42 active clients are `monthly_adjusted`** [re-verified 27 Aug], so the
editor mis-classifies the entire roster. #8 is the *client-facing* invoice
(line 428, `credit_details.basis`); this is the *trainer-facing* editor and its
recalculate button.

Cheyenne's real rule: $640 monthly − 3 cancelled × $80 = **$400**, which is what
the database correctly stored.

**Blast radius — 11 of the 14 open reminders would change on one tap**
[re-verified 27 Aug]:

| client | correct | "Use calculated" bills | difference |
|---|---|---|---|
| Sariah Duncan | $612.50 | $787.50 | **+$175.00** |
| Lesly Spencer | $560.00 | $720.00 | **+$160.00** |
| Sharon Rambo | $300.00 | $450.00 | **+$150.00** |
| Lauren Standefer | $600.00 | $750.00 | **+$150.00** |
| Hassan Kareem | $907.50 | $990.00 | **+$82.50** |
| Cheyenne Martin | $400.00 | $480.00 | **+$80.00** |
| Stacie Weever | $640.00 | $720.00 | **+$80.00** |
| Sara Prince | $900.00 | $975.00 | **+$75.00** |
| Claudine Ocon | $600.00 | $675.00 | **+$75.00** |
| Tim Yancey | $490.00 | $560.00 | **+$70.00** |
| Todd Prine | $675.00 | $525.00 | **−$150.00** |

**$1,097.50 over-billed** across ten clients; Todd $150 under.

**It also explains three things on that screen:**
- Every card showing **BLOCKED** with a red mismatch — the calculation is wrong
  for everybody, not the drafts.
- The green *"Billed $400 — 1 session covered"*. That label means "you comped a
  session" (Dustin, 18 Aug: *"so I can screenshot the dates n show her I gave her
  2 free"*). He comped nothing; it is the gap between the right amount and the
  broken calculation.
- Editing the session count or the remote-at-half box recomputes on the wrong
  rule too (`setCount`, `setHalfPrice`, same `billingType`).

**Proposed fix.** Add `monthly_adjusted` to the accepted list, and make the
fallback warn on an unrecognised billing type rather than silently guessing.
Stored amounts are all correct — this is display and recalculate only, so nothing
needs back-correcting.

> **DECISION — go ahead? And disable the "Use calculated" button until it is
> fixed, so it cannot be tapped by accident in the meantime?** _(blank)_

## 9. Christine Latham was charged $640 twice in seven days [YOUR CALL]

Reminders due **2026-07-22 $640 paid** and **2026-07-29 $640 paid**, on a
$640/month rate (8 sessions × $80). [re-verified 27 Aug] An extra instance in
her recurring calendar series generated the second one. Her 22 Jul session is
also counted in two billing cycles.

**Fix for the future.** Refuse to generate a second invoice whose cycle overlaps
one that already exists.

> **DECISION — what happens to the $640 itself? Refund, credit against the next
> invoice, or leave it?** _(blank)_

## 10. Her current invoice is $80 short [YOUR CALL]

Billed **$320 (4 × $80)** under the rule in force on 31 Jul. Under the rule you
set on 20 Aug it should be **$400 (5 × $80)**. It is **due 2026-08-22 and now 5
days overdue**, and the nightly recalculation deliberately will not touch an
invoice already sent. [re-verified 27 Aug]

> **DECISION — correct it to $400, or leave it and let the next cycle be
> right?** _(blank)_

## 11. Billing cycles can gap or overlap [MECHANICAL]

Cycles are computed by counting backwards from the due date instead of reading
the previous invoice. When a due date shifts off its normal cadence — Sharon
Rambo's did — you get a 2-day overlap (one session billed twice) and a 2-day
gap (days in no cycle at all). [from audit]

> **DECISION:** _(blank)_

## 12. Social-media reminders are being stored as payments [MECHANICAL]

Calendar events with no dollar amount are being filed as payment markers.
Confirmed live: [re-verified 27 Aug]

- **Jennifer Day** — "📱 POST STORIES — Perfect Day Macro Log" (amount null)
- **Stacie Weever** — "📱 POST — Optical Poetry Flyer / Stacie Weever" (null)
- Two more against a Test Client.

Both Jennifer and Stacie are live billed clients. Nothing has broken only
because each already had an open invoice blocking generation. If one of these
lands first in a cycle it generates a full-fee invoice dated on the post day.

**Proposed fix.** Require an actual dollar amount before treating a calendar
event as a payment.

> **DECISION:** _(blank)_

## 13. The calendar-vs-app mismatch flag can never fire [MECHANICAL]

It checks for a `basis` value that the nightly recalc overwrites on every
pending row, so the condition is unreachable. The approved mockup's source tags
and its use-app / use-calendar resolver were never built. [from audit]

> **DECISION — repair the flag now, or fold it into building the resolver
> properly?** _(blank)_

## 14. The "N overdue" badge on the home reminders panel is structurally unreachable [MECHANICAL]

The query it counts from excludes exactly the rows the badge is meant to count.
Two panels on the same screen can say "2 overdue" and "none". There genuinely
are 2 overdue right now — **Christine Latham $320 (22 Aug), Sharon Rambo $300
(23 Aug)**. [re-verified 27 Aug]

> **DECISION:** _(blank)_

## 15. Two couples' revenue is invisible to every payments surface [LOW]

⚠️ **Not reproduced.** My query for clients paid by another client returned
nothing, so either the mechanism is different from what I checked or the
condition has changed. Listed so it is not lost, but treat it as unconfirmed
until re-audited. [audit only — I could not verify]

> **DECISION — worth re-auditing, or drop it?** _(blank)_

## 16. `cancelled_half` would deduct at full rate [LOW]

A half-price cancellation deducts the whole session rate. No live instance yet.
[from audit]

> **DECISION:** _(blank)_

## 17. Archived clients are not excluded from reminder generation [LOW]

No live instance today — **0 archived clients have a pending reminder**
[re-verified 27 Aug] — but the guard is missing, so the next archive can
generate one.

> **DECISION:** _(blank)_

## 18. The "Email sent" chip never renders [LOW]

It reads a column that is always empty. [from audit]

> **DECISION:** _(blank)_

---

# GROUP 4 — the AI stating numbers

This is your standing rule: *"the AI anywhere in the app needs to be 100%
accurate at all times, period."* Meal-edit and parse were converted on 26 Aug.
These were not.

## 19. 1,109 rows of model-guessed nutrition across 18 clients [YOUR CALL]

**Confirmed exactly. [re-verified 27 Aug]** 1,109 rows carry AI-estimated
macros, across 18 clients. **59** disagree with their own macro arithmetic by
more than 10%; **24** by more than 25%. The worst, verbatim from the database:

| logged as | kcal | P | C | F | reality |
|---|---|---|---|---|---|
| "3/4 cup egg whites, green beans" | 95 | **203** | 1.3 | 1 | ~19 g protein |
| "4 slices of sausage pizza" | 1120 | 52 | 98 | **0** | not zero fat |
| "Homemade pizza on a paper plate" | 820 | 38 | 85 | **0** | not zero fat |
| "Bowl of Greek yogurt ~150 g" | 520 | 18 | 52 | **0** | not zero fat |

⚠️ **One correction to the audit's framing.** The report attributes all 1,109
rows to `analyze-meal-photo`. Only **115 of them have a photo attached**, and
the photo route logs **83** successful calls in total. So the photo route is one
source, not the only one — the wider AI logging path is writing estimates too.
That widens the fix rather than changing it, but the report overstated the
attribution and you should know that before signing off.

**Why.** The route asks the model to *estimate the macros* and stores the
answer. It never calls `resolveFood()`, so the food database is never consulted.
Every calorie bar, weekly average and coach card for those days is built on
these numbers.

**Proposed fix.** Let the model do what it is good at — *identify* what is on
the plate and how much — then look every item up in the database and total it in
code, exactly as the "say what you ate" path now does.

> **DECISION — what happens to the 1,109 existing rows? Leave them / flag them
> visibly as estimates / recompute what can be recomputed.** _(blank)_
>
> **DECISION — when a photo shows something the database does not have: log
> nothing and ask, or log the item with no macros so the meal is at least
> recorded?** _(blank)_

## 20. The meal-edit AI saves wrong macros into My Meals [MECHANICAL]

Same fault, worse consequence, because the wrong number gets saved for reuse. It
logged "Fairlife Core Power, 1 bottle → 42 g protein"; the real product row says
26 g. That is 16 g of protein nobody ate, saved as a meal she can re-log
forever. **430 AI-estimated items across 318 foods and 14 clients** [from
audit]; **71 saved meals across 7 clients exist right now** [re-verified 27
Aug].

> **DECISION — go ahead? And clean the existing saved meals, or leave them?**
> _(blank)_

## 21. Brooke's plan is 38 g over her protein target [MECHANICAL]

She told you on 23 Aug: *"AI told me 160g of protein but is giving me 198g."*
⚠️ **Still exactly true today.** Her live plan, effective 2026-08-23:
**198 g protein against a 160 g target** (1,772 kcal against 1,800).
[re-verified 27 Aug]

**Why.** `plan-build` asks the model for the totals, and when its own validation
fails it ships the plan anyway.

**Proposed fix.** Model picks foods and amounts; the plan is totalled in code
from the database and rebuilt if it misses the target, instead of shipping the
miss.

> **DECISION — go ahead? And rebuild Brooke's plan now, or leave it until you
> next review her?** _(blank)_

## 22. Something is running in production that is not in the code [YOUR CALL]

**This is the strongest-evidenced item in the whole list, and it got stronger
today.** [re-verified 27 Aug]

- `nudge_sweep` is declared in the current source and has **0 rows** in
  `ai_usage_log`. The metered path has never run once.
- `ai_nudge_log` holds **857 rows**, **20 sent**, and **434** stamped
  `suppressed = 'preview_mode'` — a string that was removed from `src/` on
  13 August and appears nowhere in the repo today.
- The most recent of those rows was written **this morning at 02:13**.

So a build nobody controls is generating nudges daily, writing messages toward
clients, and it is invisible to your $95 spend cap and to the AI health page
because it never logs usage.

> **DECISION — Dustin, 27 Aug:** *"nudge should be gone period. 4th time this
> has come up."*
>
> **DONE, at the database level, 27 Aug ~13:00 UTC.** Backed up first
> (`bak_ai_nudge_log_20260827`, 857 rows — nothing deleted), then frozen with
> `trg_ai_nudge_log_frozen`, which discards every insert and update to
> `ai_nudge_log`.
>
> **Proved, not assumed.** A real insert and a real update were attempted after
> the freeze: both returned 0 rows, the count stayed at 857, the probe row did
> not land, and the all-time sent count stayed at 20. A check was added to
> `live_audit.sql` and shown to go **red first** — the identical expression run
> against the pre-freeze snapshot returns FAIL with "34 rows written today".
>
> **Why a trigger and not a code change.** The sweep is not running from this
> repo, so a flag added here would not be read by it. The database is the only
> place we can reliably stand in front of it. To reverse:
> `drop trigger trg_ai_nudge_log_frozen on public.ai_nudge_log;`
>
> **Still open — for the overnight run:** rip the nudge feature out of the
> codebase (`src/app/api/ai-nudges/*` and its segment logic), and find and
> remove whatever deployed thing is still calling it, which is Vercel-side and
> needs Dustin's hands or a redeploy. Until then the trigger is the wall.
>
> **One correction to the audit's claim.** It said the sweep "writes messages to
> clients". It has **not sent anything since 13 August** — 19 went out on 12 Aug
> and 1 on 13 Aug, and every row since has been suppressed
> (`preview_mode`, `escalated_to_trainer`, `client_opted_out`). It was
> generating and discarding, not messaging. The exposure was smaller than
> reported; the unmetered daily model spend was real.

## 23. `verify-food` can overwrite your food database [MECHANICAL]

You asked whether this is a legitimate exception. **It is not.** A legitimate
exception would *create* a food the database lacks. This takes an existing row,
overwrites its calories and macros with model output, and stamps it
`verified = true` — in the table every other AI surface now reads. No backup. It
has **never been called** (`verify_food` has zero rows in `ai_usage_log`)
[re-verified 27 Aug], but it is deployed and reachable by any logged-in client.

> **DECISION — delete it, or make it write to a review queue you approve?**
> _(blank)_

## 24. `coach_action` fails about 30% of the time [MECHANICAL]

Its prompt instructs the model to produce exactly the response its own validator
rejects. Every failure is the model obeying the prompt. 50 successful calls are
logged. [from audit]

> **DECISION:** _(blank)_

## 25. `assessment-recommend` recommends programmes that do not exist [MECHANICAL]

8 of the 13 programme names in its prompt have no match in your `programs`
table. [from audit]

> **DECISION — fix the prompt to read the real programme list from the
> database, so it can never drift again?** _(blank)_

## 26. Six AI surfaces have never been called once [MECHANICAL]

⚠️ **Six, not the nine in the report** — by the check I can actually run, which
is "declared in the source, zero rows in `ai_usage_log`":
**`birthday_post`, `focus_suggest`, `nudge_sweep`, `outbox_draft`,
`verify_food`, `workout_assist`.** [re-verified 27 Aug]

Separately, five features **are** being logged that are **not declared anywhere
in `src/`** — `chat`, `coach_workout_tools`, `feedback_image`, `food_photo`,
`trainer_agent`. Some of that is renaming; some of it is the same old-build
problem as #22.

> **DECISION — work through these one at a time later, or leave them until
> something needs them?** _(blank)_

## 27. The photo route zeroes unknown macros but preserves unknown micros [LOW]

Inconsistent handling of "we don't know" between two fields on the same row.
[from audit]

> **DECISION:** _(blank)_

---

# GROUP 5 — the truncation family. One bug, seven places. [MECHANICAL]

The database returns at most **1,000 rows** per request and says nothing when it
cuts you off. `.limit(5000)` bounds nothing. Every read below asks for more than
1,000 rows with no filter and no paging, and silently gets 1,000.

The static audit finds 5 of these automatically today
(`node scripts/audit/static-audit.mjs`); the other two are in reads it cannot
see. Live row counts [re-verified 27 Aug]:

| # | Where | What you see | The numbers |
|---|---|---|---|
| **28** | Trainer calendar (`home/page.tsx:175`) | **Nothing since 29 July.** Today and everything future never loads | **4,589 live scheduled workouts**, 1,000 arrive; **2,063 are today-or-future** |
| **29** | Your appointments | The list stops early | **4,389 appointments** running to **2028-08-24** |
| **30** | Workout Library | **"0 exercises" on 278 real workouts**, wrong count on 352 more; only 6 of 682 right | reads **3,369 sections** and **10,866 prescriptions** unpaged to count them |
| **31** | Program page day picker | Drops 167 of 1,167 workouts, and *which* 167 changes between page loads (no `.order()`) | **1,167 days** |
| **32** | Day detail page | Same unpaged `days` read | **1,167 days** |
| **33** | "Swap in a workout from the library" | Reaches 171 of 600 names. Typing "push" finds 1 match when 24 exist | truncated source list |
| **34** | Client Schedule day pop-up | Shows **one** workout for a day that has several | **1,529 client/date pairs have more than one live workout** — today alone, 13 clients have two or three |

**#28 is the same failure you reported on 24 August** (*"where the hell did that
programming go!?"*), still live in a second read that nobody checked.

**Proposed fix.** Count in the database instead of pulling every row to count in
the browser, and page the reads that genuinely need every row. Then add a static
rule so this shape can never ship again.

> **DECISION — go ahead on all seven?** _(blank)_

---

# GROUP 6 — notifications

## 35. Push reaches 3 people out of 36 [YOUR CALL]

⚠️ [re-verified 27 Aug] **1 web-push subscription** (Lauren), **2 native
tokens**, **36 active clients**. When you post in the group or message a client,
almost nobody gets anything on their phone. Web Push shipped 10 days ago to fix
exactly this. The only place to turn it on is a button below the fold on
Settings that nobody has found.

**Proposed fix.** A dismissible prompt on the home screen where clients actually
are, plus a counter on your side reading "N of M clients can be reached", so
this can never be invisible again.

> **DECISION — how pushy? Once and never again / once a week until they act /
> a persistent card until dismissed.** _(blank)_

## 36. The bell and the flashing tab ignore notification settings [MECHANICAL]

Jennifer's complaint, still true from three other surfaces. She and Claudine
both switched group chat off; both have an unread group message — from the
*bot* — turning their bell red and flashing their Messages tab. The banner was
fixed on 26 Aug; the bell, the nav badge and the tab were not.

**Proposed fix.** One preference check inside `useNotificationFeed` that every
surface reads, instead of four copies.

> **DECISION:** _(blank)_

## 37. Four weeks of nightly AI reports have never been readable [YOUR CALL]

The nightly digest of who was nudged and who was escalated has been written
every night since 31 July into a message thread that no screen can open.
⚠️ **27 rows, 31 Jul through today.** [re-verified 27 Aug]

> **DECISION — put the digest somewhere you would see it (a card on your
> dashboard), or stop writing it?** _(blank)_

---

# GROUP 7 — numbers that disagree with each other

## 38. Three screens show three different streaks [YOUR CALL]

Today, for you: home says **10**, the card beneath it says **4**, Progress says
**none**. Four separate implementations, each with its own rules about rest days
and cardio. [from audit]

> **DECISION — what should a streak actually count? My reading of your 26 Jul
> note: anything scheduled that gets logged, and a rest day does not break it.
> Confirm or correct.** _(blank)_

## 39. Body Fat reads "—" for six clients who have a reading on file [MECHANICAL]

⚠️ [re-verified 27 Aug] Exactly six, and the same six:
**Lauren Standefer, Jennifer Day, Dustin Gautreaux, Robert Miller, Jerry
Bourgeois, Claudine Ocon.** The profile takes the newest *row* instead of the
newest *non-null value*, and most weigh-ins are weight-only. Their own dashboard
shows the real number, so the two disagree.

> **DECISION:** _(blank)_

## 40. Lauren's Body Fat / Lean Mass / Fat Mass charts say "Not enough data" [MECHANICAL]

At every range. The range filter is applied twice, so the panel only ever
receives one point. This is her 22 Jul report — *"Lauren not showing progress on
charts"* — never actually fixed. [from audit]

> **DECISION:** _(blank)_

## 41. The same weight tile shows +13.4 lbs and its own expanded view shows +18.6 [MECHANICAL]

The two range controls default differently. [from audit]

> **DECISION:** _(blank)_

## 42. The Week card and the AI weekly brief report different average calories [MECHANICAL]

The Week card averages today as a whole day; the brief does not. Same client,
same week, two numbers. [from audit]

> **DECISION — which is right: count today as a partial day, or exclude today
> from the average until it ends?** _(blank)_

## 43. Challenge scoring differs between the client board and your API [MECHANICAL]

326 logs have a null `completed_at`, and the two surfaces treat them
differently. Join/Leave writes to a table the board never reads, so **three
people are ranked on a challenge they never joined**. **32 participants across
6 challenges** exist right now. [re-verified 27 Aug]

> **DECISION:** _(blank)_

## 44. The Progress "Workouts" tile ignores its own range control [LOW]

And counts abandoned sessions as done. [from audit]

> **DECISION:** _(blank)_

## 45. The leaderboard has no upper date bound [LOW]

Future-dated rows can score. [from audit]

> **DECISION:** _(blank)_

## 46. The week summary counts replaced sessions [LOW]

A session that was swapped out still counts. [from audit]

> **DECISION:** _(blank)_

---

# GROUP 8 — food and servings

## 47. "Add a banana" logs 1 cup mashed — 200 calories instead of 105 [MECHANICAL]

**This one is mine, from 26 August.** The serving fix takes the *first
countable* serving on the row, and the database stores them alphabetically, so
it is almost always a cup.

⚠️ **Confirmed today, and bigger than the report said.** [re-verified 27 Aug]
The audit said 1,996 USDA rows; replaying the actual `householdServing` logic
against the catalogue gives **59,477 rows out of 298,392** that auto-pick a cup.
Straight from the database:

- `Bananas, raw` → **"1 cup, mashed"**
- `Cheese, cheddar` → **"1 cup, diced"**
- `Bananas, dehydrated` → **"1 cup"**

**Proposed fix.** Prefer a piece — medium, small, each, slice, bagel — over a
cup, and fall back to volume only when the row has no piece.

> **DECISION:** _(blank)_

## 48. Adding a food to a planned meal throws away the amount and unit [MECHANICAL]

Your 30 Jul request ("type the amount and change the unit") and your 26 Jul
chili-crisp complaint are both fixed at the point of *picking* the food — and
undone one step later when it is saved to the meal, which keeps only the name
and three macro numbers. So the row shows "1 serving" with a stepper that moves
in whole servings. All nutrients are dropped too.

⚠️ [re-verified 27 Aug] **1,799 of 1,821 meal items carry an amount, but only
15 carry any micronutrients.**

> **DECISION:** _(blank)_

## 49. Plan items still cannot be typed or re-united [MECHANICAL]

The *added-food* row got the typed box and unit dropdown. The rows above it —
your actual plan items — did not. Changing a 300 g item to 170 g is 13 taps, and
there is no way to switch it to ounces. [from audit]

> **DECISION:** _(blank)_

## 50. Saving a day's edit halves or doubles any measured added food [MECHANICAL]

`resolveEditedItems` ignores `base_amount`. [from audit]

> **DECISION:** _(blank)_

## 51. Manual search still puts junk above the checked data [MECHANICAL]

Searching "banana" by hand: Robby sees three crowd-entered rows at 242 cal /
14 g fat before the real one; you see the verified USDA banana **15th**. The AI
matcher is fine — it is only the typed search.

Worth noting: the live audit's macro-sanity probe is **currently failing** on
1 of 10 top hits for exactly this reason. [re-verified 27 Aug]

> **DECISION:** _(blank)_

## 52. Nutrients are empty for anyone eating their plan [YOUR CALL]

Your 4 Aug *"need to track full nutrients everywhere"* is half-built.

⚠️ [re-verified 27 Aug] The audit's figure is exact: **0 of 8,789** verified
`usda` rows carry a micronutrient panel. The neighbouring `usda_generic` source
is fine — **12,825 of 12,844 have them.** So it is one source that was imported
without micros, not the whole catalogue. That makes this a smaller job than the
report implied: a targeted backfill of one source, not a rebuild.

> **DECISION — worth doing, or park it?** _(blank)_

## 53. Custom and barcode foods save without serving options or nutrients [LOW]

[from audit]

> **DECISION:** _(blank)_

## 54. The kcal shown when adding differs from the kcal counted afterwards [LOW]

[from audit]

> **DECISION:** _(blank)_

## 55. Food-import jobs have been frozen since 16 August with status "running" [LOW]

⚠️ [re-verified 27 Aug] Two of them: **`off_micros_backfill`** and
**`off_bulk`**, both last updated **16 Aug**, both still claiming to be running.
The first is very likely why #52 is unfinished.

> **DECISION — restart them, or leave until you decide on #52?** _(blank)_

---

# GROUP 9 — programming and schedule

## 56. Four people who signed up on 23 August have no programming at all [YOUR CALL]

**Alan Meier, Ian Christman, Justin Ray, Oliver Gergelj** — no assignments, no
workouts, nothing. They are invisible to both coverage checks: one excludes
self-coached clients, the other starts from `scheduled_workouts` so a client
with no rows never appears. [re-verified 27 Aug]

**Evidence that points to an answer.** All four also exist in the `trainers`
table with `role = 'trainer'` and `active = true` — they are the tester accounts
added on 22–23 Aug, alongside Stephanie and Brooke Orton. [re-verified 27 Aug]
That reads as "testers", but it is your call, because if any of them is a real
person waiting on a programme, that is a different problem entirely.

> **DECISION — testers, or real clients waiting on programming?** _(blank)_

## 57. Brooke Orton runs out of programming tomorrow and nothing says so [MECHANICAL]

`programming_coverage()` excludes self-coached clients. The integrity check that
does catch her is a `warn`, and the dashboard only renders `critical`.
⚠️ Live right now: **`client_coverage_under_14_days` is red with 2 clients**,
and it is a `warn`, so you cannot see it. [re-verified 27 Aug] She also has two
live sessions belonging to a programme she was moved off.

> **DECISION — surface warns on the dashboard too, or only promote this one
> check to critical?** _(blank)_

## 58. 70 scheduled workouts carry an assignment from a different programme [MECHANICAL]

⚠️ **Exactly 70, confirmed.** [re-verified 27 Aug] Separately, the integrity
checker reports **576 scheduled workouts with no assignment at all**.

> **DECISION — repair the 70, and back up to a `bak_` table first?** _(blank)_

## 59. Two supervised sessions today do not appear in Today's Sessions [MECHANICAL]

**Troy Schnitzler and Tyler Dorsett** are both supervised and scheduled today,
and both are missing from the list. [re-verified 27 Aug — 9 supervised sessions
today] A cancelled session is still counted in the "6 scheduled" badge.

> **DECISION:** _(blank)_

## 60. `progression_events` has never been written to [LOW]

**0 rows.** [re-verified 27 Aug] Phase-ups, regressions, swaps, holds and
refer-outs — the cause-and-effect history the whole method depends on — are not
being recorded anywhere.

> **DECISION — is this worth building properly, or is it dead schema?**
> _(blank)_

## 61. The five new trainers have an empty Client View with no way to fill it [LOW]

[from audit]

> **DECISION:** _(blank)_

---

# GROUP 10 — everything else

## 62. The weekly-focus approval step no longer exists [YOUR CALL]

⚠️ [re-verified 27 Aug] **`weekly_focus_drafts` has 0 rows**, nothing writes to
it, and the sweep publishes AI-written copy straight to your clients. Your
standing rule is *approval before client-live*.

> **DECISION — restore the approval queue, or accept auto-publish?** _(blank)_

## 63. The bench-press video you asked to be removed is back [YOUR CALL]

A different third-party tutorial, written straight into the database outside the
review queue. Live now: **Barbell Bench Press →
`https://www.youtube.com/watch?v=_FkbD0FhgVE`** [re-verified 27 Aug]

> **DECISION — watch it and say keep or clear.** _(blank)_

## 64. Madeleine Coker's date of birth is 4 August 2026 [MECHANICAL]

She is recorded as 23 days old. [re-verified 27 Aug] There is no `max` on the
date input, and the birthday bot will announce it.

> **DECISION — go ahead (fix the input and correct her record)? And what is her
> real date of birth?** _(blank)_

## 65. The Google Calendar sync fails about half its runs [MECHANICAL]

A duplicate-key collision in `gcal_sync_runs`.
⚠️ **Today it is behaving: 4 runs, 0 failures.** [re-verified 27 Aug] But the
integrity checker still has **`gcal_sync_stale_over_60min` red at critical**,
which is the one critical failure on the live audit right now.

> **DECISION:** _(blank)_

## 66. There is no daily calorie/macros chart anywhere [YOUR CALL]

`MacrosProgressChart` is built, correct, and **mounted nowhere**, while the
Nutrition screen tells clients to open Progress for a chart that is not there.
[from audit]

> **DECISION — mount it on home, on Progress, or both?** _(blank)_

## 67. Charts have no touch interaction, and the weight chart blocks scrolling [MECHANICAL]

Your 26 Jun request. The client weight chart sets `touchAction: "none"`, so the
page will not scroll over it. [from audit]

> **DECISION:** _(blank)_

## 68. A weigh-in can only be deleted by the client, and only their last five [MECHANICAL]

Your 18.4 lb jump between 2 and 16 Aug is not removable from the trainer app.
[from audit]

> **DECISION — give the trainer app delete on any weigh-in?** _(blank)_

## 69. `used_on` is stamped in UTC [LOW]

Against your standing rule: Central time, never UTC. [from audit]

> **DECISION:** _(blank)_

## 70. Two cron jobs are permanent no-ops [LOW]

They run and do nothing. [from audit]

> **DECISION — delete them, or repair them?** _(blank)_

---

# The decisions that actually block the overnight run

Everything tagged [MECHANICAL] can proceed on a single "yes to all mechanical".
These eleven cannot — they need you specifically. In rough order of consequence:

| # | Decision | Why only you can make it |
|---|---|---|
| **1** | Permission to edit `WorkoutLogger.tsx` for the cancel-deletes-sets fix, and whether Cancel is hidden or refuses on a finished workout | Standing rule: both loggers off limits |
| ~~**22**~~ | ~~Stop the rogue nudge sweep~~ — **ANSWERED AND DONE 27 Aug.** *"nudge should be gone period."* Frozen at the database level, proved, live check added. Codebase removal is queued for the overnight run. | — |
| **9** | What happens to Christine Latham's duplicate $640 | Real money, real client |
| **10** | Correct her current $320 invoice to $400, or let the next cycle be right | It is already 5 days overdue |
| **19** | What happens to 1,109 rows of AI-guessed nutrition already in clients' logs | Leave / flag / recompute — all three are defensible |
| **56** | Are Alan Meier, Ian Christman, Justin Ray and Oliver Gergelj testers, or real clients waiting on programming | Changes whether this is a bug or a to-do |
| **38** | What a streak should actually count | There is no right answer in the code to recover |
| **62** | Restore the weekly-focus approval queue, or accept auto-publish | It contradicts your own standing rule either way you go |
| **63** | Watch the Barbell Bench Press video and say keep or clear | Only you can judge the clip |
| **35** | How pushy the notification prompt should be | Client experience |
| **52** | Fill in the missing micronutrients (one source, 8,789 rows), or park it | Cost/benefit is yours |
| **66** | Where the daily calorie/macros chart gets mounted | Product decision |

---

# What did not survive from this morning's audit

Said plainly, because pretending otherwise is how this list stops being
trustworthy.

**About 8 low-severity findings are unrecoverable.** The audit report's LOW
section states "23 more" and then names roughly fifteen before ending with "and
others". Eight audits ran in parallel and returned their findings to a session
that has since ended; only the synthesised report was written to disk. The
individual agent outputs are gone. Those ~8 items cannot be listed because
nobody wrote them down.

**What that means for tonight:** nothing. Every HIGH and MEDIUM finding is here,
and the LOW items that are named are here. The missing ones are, by the audit's
own severity call, cosmetic. If they matter, a re-run of the same eight audits
would surface them again — that is a half-day, not an overnight job.

**One finding could not be re-verified: #15** (two couples' revenue invisible to
payments). My query returned nothing. It stays on the list marked unconfirmed.

**Three of this morning's numbers were wrong and are corrected above:** the
destroyed-session count (12 → **15**), the cup-serving count (1,996 →
**59,477**), and the "nine AI surfaces never called" (→ **six**, by the check
that can actually be run). One framing was overstated: the 1,109 guessed
nutrition rows are not all from the photo route (**115 have photos**).

---

# What no audit here can see

- **Rendering.** A banner covering a button, or a number rendering as
  "1 100 g", is invisible to SQL and to grep.
- **Model behaviour.** Whether the food picker chooses the *right* row needs
  real API calls against fixed cases. There is no API key in the cloud sandbox.
  This is the biggest remaining gap — the cinnamon-roll bug was a model
  behaviour bug and nothing here would catch its return.
- **Write paths end to end.** The dismiss-button bug would have been caught by
  *executing* the upsert as a real user. That needs a scratch account and a
  rollback, and it is the highest-value thing still missing.
- **Anything Vercel-side.** Environment variables, and whether FCM is even
  configured. If it is not, push reach in #35 drops from 3 people to 1.

---

# Verified working — worth knowing what is solid

Workout swap and move (16 real swaps, 57 backward moves) · the trainer inbox ·
exercise notes reaching it with the exercise tagged · group fan-out room
isolation · RLS isolation in both directions, tested under a real tester's JWT ·
the metrics autocalc trigger (zero disagreements across the table) ·
celebration, weekly-brief and coach-card AI — all three compute in code and
forbid the model from doing arithmetic, which is the correct architecture ·
video checking (815 videos, 0 dead) · recipes · Jennifer's flat $1,500 quarterly
billing · moving a workout never changing the billed amount · payment-excluded
clients · 13 of 18 cron jobs producing verified output · all 28 RPCs the code
calls exist · all 11 live `onConflict` targets match a real unique index · no
live table holding client data has RLS off · all 20 search probes pass.

---

# Today's baseline, for comparison after the fixes land

Run at ~12:00 CT on 27 Aug 2026, against `origin/main` at `9fc907d`.

**`node scripts/audit/static-audit.mjs` — 5 findings**, all `read-can-truncate`:
`day/[dayId]/page.tsx:29`, `program/page.tsx:200`, `program/page.tsx:731`,
`library/workouts/page.tsx:32`, `library/workouts/page.tsx:37`.

**`supabase/audit/live_audit.sql` — 4 FAIL:**

1. `catalogue / top search hits are internally consistent` — 1 of 10 top hits
   disagrees with its own macros by >25% (this is #51)
2. `data / no critical integrity check is failing` —
   `gcal_sync_stale_over_60min` (this is #65)
3. `security / RLS-enabled tables all have a policy` — ~200 `bak_*` backup
   tables with RLS on and no policy. Noise rather than a finding, but it drowns
   the check, so the check should exclude backup tables.
4. `workouts / completed sessions recorded their sets` — 5 in the last 14 days
   (this is #1)

Plus `workouts / no workout is completed for a future date` — 1 row dated
2026-08-28 (this is #7).

---

# Before the overnight run

1. Dustin's answers go **in this file**, under each `> **DECISION:**`.
2. Work is ordered by his priorities, not mine.
3. **Every fix must be proved against live data before it is called done** — run
   the query, read the row back. Add a check to `supabase/audit/live_audit.sql`
   and confirm it goes red against the broken version *first*. A check that
   cannot fail is not a check.
4. Ship in small commits through the bridge. Never end a session with work only
   in the sandbox.

*Symmetry Personal Training · Trainer App · master audit list · Thursday
27 August 2026, Central.*
