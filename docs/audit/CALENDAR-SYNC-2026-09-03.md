# The 207 supervised sessions with no appointment — what is actually wrong

**3 Sep 2026 · RESEARCH ONLY. Nothing was changed.**

> "we need to research where that is coming from because we should already have
> the logic set up with the calendar sync... Don't change anything there. Get
> back to me to review that tomorrow. That should have already been fixed. We
> dealt with that two weeks ago." — Dustin, 3 Sep

He is right that it was dealt with. The **moving** was fixed. The **linking**
never was, and that is a different thing.

---

## The headline

Of the 207 flagged sessions, **189 are already on the correct day.** There is an
appointment in the calendar, that same client, that same date. They are simply
not *linked* to it — `scheduled_workouts.appointment_id` is null.

| | count |
|---|---|
| Flagged supervised sessions with `appointment_id is null` | **207** |
| …that have exactly one appointment on that same date | **185** |
| …that have more than one (ambiguous) | **0** |
| …with no appointment that day at all | **18** |

Nothing is on the wrong day because of this. The calendar is being followed.
What is missing is the pointer that says *which* appointment a session belongs
to — and that pointer is what lets a session follow the appointment the next
time you move it.

---

## Why the sync never links them

`sync_supervised_workouts_to_appointments()` builds three sets:

- **`linked`** — sessions that ALREADY have an `appointment_id`, whose
  appointment has since moved. These get moved to follow it.
- **`orphan`** — supervised sessions with `appointment_id is null` **and no
  appointment on that date**.
- **`uncovered`** — appointments with no supervised session on that date.

`orphan` × `uncovered`, matched within the same week, becomes `paired`, and
`paired` rows get moved *and* stamped with `appointment_id`.

Read those definitions together and the hole is obvious:

> A session with **no `appointment_id`** that **does have an appointment on its
> own date** is in `linked` (needs an id it hasn't got) and it is not in
> `orphan` (which requires `not exists` an appointment that day).

It is in neither set. The function cannot see it. It never has.

**`appointment_id` is only ever written as a side effect of moving something.**
A session that was already on the right day has nothing to move, so it is never
adopted, and it stays unlinked forever.

## Why that matters even though the dates are right today

While `appointment_id` is null, a session can only follow its appointment
through the `orphan`/`paired` path, and that path requires:

1. no appointment on the session's current date, **and**
2. the replacement appointment falls in the **same calendar week**, **and**
3. nothing else already covers the target date.

So move a client's Tuesday session to the following Monday in Google Calendar
and the session does **not** follow — different week, so `paired` will not match
it. The old date stays on the client's phone. That is the shape of the bug that
keeps coming back: it looks fixed for a fortnight because most moves are
within-week, and then a cross-week move quietly does not take.

Once `appointment_id` is set, `linked` handles it with no week restriction at
all.

## The fix I did NOT apply

A fourth CTE — call it `adopt`: supervised, `appointment_id is null`, exactly
one scheduled appointment on the same date → **stamp `appointment_id`, change
no date.** Pure linking, zero movement.

It is small and it is safe on the numbers above (185 unambiguous, 0 ambiguous),
but you said don't touch it, so it is not touched. Worth deciding two things
first thing:

1. Should `adopt` refuse when more than one appointment sits on the date? (Today
   that is 0 rows, so it costs nothing to be strict — I would be strict.)
2. Should it also run for sessions in the past, or future-only like everything
   else in this function? (I would keep it future-only.)

---

## The 18 that genuinely have no appointment — and one that needs you

These are a separate problem, and one of them is worth looking at before
anything else:

**Todd Prine — 15 of the 18.** He has **67 future sessions** programmed through
9 October, and his calendar **runs out on 4 September** — 33 appointments ever,
the last one two days from now. He is `per_session` billing, so sessions that
exist in the app but not in the calendar are sessions nobody is being billed
for. Either his calendar needs extending or those sessions should not be there.

The other three:

| Client | Date | Appointment that week? |
|---|---|---|
| Martha Montgomery | 5 Sep | no |
| Tim Yancey | 5 Sep | yes — the existing `paired` path may still catch this one |
| Todd Prine | 7 Sep → 9 Oct (15 sessions) | no |

Martha and Tim both have healthy calendars otherwise (115 and 355 appointments,
running into 2028), so theirs look like one-off gaps rather than a pattern.

---

## What this does not explain

`appointment_no_supervised_workout` — the inverse, 12 rows, Erin Arit and Lauren
Standefer. Erin is the same client flagged separately for having 209
appointments, 24 payments and **no programming at all**. That is probably one
finding wearing two hats, but I have not confirmed it and did not chase it
tonight.
