# Symmetry — feature audit

**Started 3 Sep 2026. This document is meant to be edited as we walk it.**

The point is not to run it once. Every pass makes it more accurate: a test that
was vague gets sharper, a "works" that turns out not to gets reopened, a feature
nobody can find a use for gets retired on purpose instead of rotting.

## How to use it

Work down a section together. For each numbered test: Dustin does the steps,
compares against **Expect**, and we set the status. Nothing gets marked
**WORKS** because it looks plausible — only because someone did it.

| status | means |
|---|---|
| ☐ UNTESTED | nobody has walked it yet |
| ✅ WORKS | tested, behaves as Expect says |
| ⚠️ WRONG | works, but not the way Dustin wants it — needs a decision |
| ❌ BROKEN | fails |
| 🚫 NOT BUILT | the screen or path does not exist yet |
| 🗑 RETIRE | exists, nobody wants it, delete deliberately |

**Evidence** lines are live counts from the database on 3 Sep. They are the
cheapest lie-detector we have: a feature with a screen, a route and zero rows is
either broken, undiscoverable, or not wanted.

---

## THE THREE COLD SPOTS — start here

These came out of the usage counts and none of them was on anybody's list.

### A. Cardio logging: ZERO rows in 30 days
**Evidence:** `cardio_logs` — **0** rows in the last 30 days. The table exists,
the feature exists, nobody has used it in a month.

1. ☐ Open the app as a client. Find where you log cardio.
   **Expect:** you can find it in under ten seconds without being told where.
2. ☐ Log 20 minutes of treadmill.
   **Expect:** it saves, and it appears on the client's progress screen.
3. ☐ Check `cardio_logs` for a new row.
   **Expect:** one row, today's date, Central time.

**The question this settles:** is cardio broken, hidden, or has it been replaced
by something else people actually use? All three are possible and they have
completely different fixes.

### B. Movement assessment: never used, ever
**Evidence:** `movement_assessments` — **0** rows, all time. There are three
screens (`/movement`, `/movement/results`, `/movement/testers`), an API route,
and a whole `movement_assessment_frames` table behind it.

1. ☐ Open `/movement` as a trainer.
   **Expect:** ...to be decided. Dustin: what was this for?

**The question this settles:** finish it, or retire it. It carries an RLS gap
already flagged (`maf_trainer_all` is bare `is_trainer()`, not
`trainer_can_see_client()`), so leaving it half-built has a real cost.

### C. Push notifications reach ONE person
**Evidence:** `push_subscriptions` — **1** row. 28 active clients.

1. ☐ On a client's phone, install the app and allow notifications.
2. ☐ Send a test push.
   **Expect:** it arrives, and `push_subscriptions` gains a row.

**The question this settles:** whether every reminder, nudge and message alert
in the app is currently landing nowhere. If push is dead then the notification
work is decoration.

---

## 1. Logging a workout — THE most-used feature in the app

**Evidence:** `set_logs` **6,008** rows in 30 days, `workout_logs` **409**. This
is the beating heart of the product and it is the one place with a standing
"do not touch without asking" rule, for good reason.

1. ☐ Open today's workout as a client. Log a full session, every set.
   **Expect:** every set saves. Reps come from the **programmed target**;
   weights prefill from **history**. (Reps must NOT autoload from history.)
2. ☐ Mid-session, navigate away to nutrition, then come back.
   **Expect:** everything already logged is still there. *(This exact thing
   failed on 20 Aug: "most of what I logged was not logged anymore.")*
3. ☐ Finish the workout, then reopen it.
   **Expect:** it opens back into the logger, not a locked completion screen.
   *(Fixed 2 Sep — confirm it held.)*
4. ☐ Kill the app mid-set and reopen within 8 hours.
   **Expect:** the draft resumes.
5. ☐ Reopen after more than 8 hours.
   **Expect:** the draft is treated as stale and does not trap you in it.

## 2. Nutrition — plan, logging, and the AI coach

**Evidence:** `meal_adherence_logs` **824** in 30 days. Heavily used.

1. ☐ Open the meal plan as a client.
   **Expect:** today's meals, current macros, matching the trainer's plan.
2. ☐ Log a meal Full, another Partial, another Off-plan with a photo.
   **Expect:** all three save; the day total updates to match what the rows say.
   *(#54: the day total once ignored the label kcal its own rows printed.)*
3. ☐ Add a catalogue food, change its amount from 300 g to 170 g.
   **Expect:** one typed entry, not thirteen taps, and the nutrients scale.
4. ☐ Ask the coach chat a **training** question ("move my cardio to tomorrow").
   **Expect:** answered as training. Never "I only handle meals".
5. ☐ Ask it to swap a meal without saying which.
   **Expect:** one short clarifying question. Never a guess.
6. ☐ Print the meal plan and prep cards.
   **Expect:** a real PDF, readable on paper.

## 3. The schedule and the calendar

**Evidence:** `appointments` **4,065** future, `scheduled_workouts` **1,847**
future. Google Calendar is the source of truth.

1. ☐ Move a client's session in Google Calendar to a **different day the same
   week**. Wait for the sync.
   **Expect:** the session follows.
2. ☐ Move one to a **different week**.
   **Expect:** the session follows. ⚠️ **This is the one I expect to fail** —
   see `docs/audit/CALENDAR-SYNC-2026-09-03.md`. 189 sessions currently have no
   `appointment_id`, and without it only same-week moves are caught.
3. ☐ Cancel a session in the calendar.
   **Expect:** it disappears from the client's week, and billing credits it.
4. ☐ Todd Prine specifically: 67 sessions programmed to 9 Oct, calendar ends
   4 Sep.
   **Expect:** a decision, not a fix — extend the calendar or remove them.

## 4. Programming a workout (the workout library, not "programs")

**Evidence:** `exercises` **858**. Dustin builds every session per client from
the library, through Claude. He does **not** assign grouped programmes — noted
permanently in STANDING-RULE-INVARIANTS after coming up three times.

1. ☐ Build a client a session by chatting.
   **Expect:** it lands as a draft for review, not straight to the client.
2. ☐ Approve it.
   **Expect:** it goes live and shows on that client's day.
3. ☐ Swap one exercise on ONE client's day.
   **Expect:** only that client changes. Nobody else's copy moves.
   *(This is what `pe_block_cross_client_edit` and `sw_enforce_day_isolation`
   exist to guarantee — worth confirming by looking at a second client.)*
4. ☐ Try to program a movement not in the library.
   **Expect:** it is flagged, not silently invented.

## 5. Billing and payments

**Evidence:** `payment_reminders` **54** open. This is the area where a bug
costs actual money, and #11 (a 29th-of-the-month anchor skipping February) was
found here.

1. ☐ Open Payments. Check a monthly client's next invoice.
   **Expect:** `monthly rate − (sessions missed × session rate)`, credit capped
   at sessions actually missed.
2. ☐ A client cancels one session and makes it up the same cycle.
   **Expect:** no change to the invoice.
3. ☐ Check a client billed on the 29th, 30th or 31st across February.
   **Expect:** every cycle present, none skipped.
4. ☐ Check an archived client.
   **Expect:** no invoice generated at all.

## 6. Progress, metrics and charts

**Evidence:** `metrics` **53** rows in 30 days.

1. ☐ Log a weigh-in as a client.
   **Expect:** it appears on the chart immediately, and the profile weight
   matches it. *(Fixed 3 Sep with a database trigger — the two used to drift up
   to 11 lb apart. Dustin's own record said 207.2 on one screen and 196.2 on
   another.)*
2. ☐ Type a weight into the trainer profile box instead.
   **Expect:** same result — it counts as today's weigh-in, chart moves.
3. ☐ Switch the range 2 weeks / 1 month / 8 weeks.
   **Expect:** every tile obeys the range. *(#40/#41/#44.)*
4. ☐ Check body fat, lean mass, fat mass.
   **Expect:** they move with the weigh-in rather than sticking at the last
   full entry.

## 7. Messaging

**Evidence:** `messages` **377** in 30 days. Well used.

1. ☐ Send a client a message; reply as that client.
   **Expect:** both see it; unread badge clears on read.
2. ☐ Check the unread count in the bell, the banner and the nav badge.
   **Expect:** all three agree.
3. ☐ Send a group message.
   **Expect:** it reaches the group and nobody outside it.

## 8. The AI coach and its budget

**Evidence:** `ai_usage_log` **1,577** calls in 30 days.

1. ☐ Ask the coach something it cannot answer.
   **Expect:** it says so. It does not invent a programme name.
   *(#25: the assessment named 8 programmes that do not exist.)*
2. ☐ Check spend against the cap.
   **Expect:** the cap holds and is visible somewhere.

## 9. Onboarding a new client

1. ☐ Invite a new client end to end.
   **Expect:** they receive it, sign in, and land on a screen with content —
   not "your account is being set up".
2. ☐ Erin Arit specifically: 209 appointments, 24 payments, **zero
   programming**, created 1 Sep.
   **Expect:** a decision. She is a paying client with a full calendar and
   nothing to train.

## 10. Working without the AI

Dustin, 2 Sep: the app has to be fully usable *both* with AI and without it.
This section is deliberately last because it is the biggest gap and the least
mapped.

1. ☐ Turn off / ignore every AI entry point. Now, as a trainer, build a client
   a full week of training by hand.
   **Expect:** possible, and not unbearable.
2. ☐ As a client, log a full day of food by hand with no AI parsing.
   **Expect:** possible, and not unbearable.
3. ☐ List every screen where the ONLY way forward is to talk to the AI.
   **Expect:** that list is the real backlog for paid launch.

---

## Things this audit has not covered yet

Named so they are not quietly forgotten: recipes (38 rows), group challenges
(18), progress photos (23), goals (11), the tutorial, the demo account,
client-preview mode, `/log-bodyfat`, `/plateaus`, the weekly brief, birthdays,
and the leaderboard. Each needs the same treatment; they are lower traffic, so
they are lower priority, not absent.
