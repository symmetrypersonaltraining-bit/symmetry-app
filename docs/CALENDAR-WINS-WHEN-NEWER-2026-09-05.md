# The calendar wins when it moved last (5 Sep 2026)

## What Dustin asked

> "if i do move the session in my schedule, the app should be set to
> automatically move that supervised workout in the app to the matching day
> according to my calendar. does this effect that?"

It did. Not because of anything changed that night — the bug predates it — but
because clients were now being told, correctly, that they *can* move supervised
workouts. That turned a latent fault into one that would fire regularly.

## The fault

`sync_supervised_workouts_to_appointments()` (pg_cron, three times a day) pulls
a supervised workout onto its appointment's date. Its guard was:

```sql
and (sw.moved_from_date is null or sw.moved_by = 'calendar_sync')
```

and `stamp_workout_mover()` stamps `moved_by = 'manual'` for every path that is
not the sync itself — the schedule board, the day sheet, the logger, and the AI
acting on a client's instruction.

So **the first hand-move opted a workout out of calendar sync permanently.**
Dustin moves the appointment in Google Calendar afterwards; the workout does not
follow; nothing says so. Live at the time of the fix: **15 of 259 future
supervised sessions already stranded**, across two clients.

The guard was asking *"has a person ever moved this?"* The right question is
*"who moved it most recently?"* Both moves are legitimate — a client moving a
session because he is away is real, and him moving the booking is real and
later — and the later one should win.

## The fix

**1. `scheduled_workouts.moved_at timestamptz`**, stamped by
`stamp_workout_mover()` on every date change, on both branches.

A dedicated column and not `updated_at`, because `updated_at` is bumped by
logging, position and status writes too. Using it would make an untouched
workout look freshly moved and stop the calendar winning for reasons that have
nothing to do with dates.

Backfilled from `coalesce(updated_at, created_at)` for rows already carrying a
`moved_from_date`. That is approximate, and approximating EARLY is the safe
direction: an older `moved_at` makes the calendar more likely to win, which is
the behaviour being restored.

**2. The guard learns about time:**

```sql
and (
      sw.moved_from_date is null
   or sw.moved_by = 'calendar_sync'
   or (sw.moved_at is not null and a.updated_at > sw.moved_at)
)
```

`gcal_sync_appointments()` sets `updated_at = NOW()` **only when a field
actually changed** — it has an `IS DISTINCT FROM` clause on the upsert — so
`appointments.updated_at` is a true "when he last changed this booking" clock,
not a "when the sync last ran" one. That is what makes the comparison mean what
it says.

The **orphan** branch is unchanged. An orphan has no appointment to compare
against — that is what makes it an orphan — so a hand-moved orphan stays where
the person put it. Nothing newer has contradicted them.

Nothing else in the function moved: the pairing, the same-week rule, the
duplicate check, the tomorrow floor, the archived and online-only filters are
byte-for-byte what they were.

## Proof it works

Backup first, per the standing rule: `bak_scheduled_workouts_20260905`, 5,716
rows.

- Dry run immediately after the change: **0 rows would move.** No overnight
  reshuffle, which is the outcome you want from a guard change.
- Then one appointment's `updated_at` was bumped, as if he had just moved it in
  Google Calendar. Dry run: **Lauren Standefer's 29 Sep "Tue — Glute Dominant"
  would move to 28 Sep** — back onto the appointment. Before the fix that row
  was permanently invisible to the sync.
- The bump was reverted to its exact original timestamp, and the dry run
  returned to 0.

## What the 15 stranded rows turned out to be

Chased down after the fix. Two clients, and only ONE of them is a problem.

### Sariah Duncan — fine, nothing to do

Her appointments are **Tue 5:00am and Thu 5:00am**. Her supervised workouts sit
on **Tue and Thu**. They agree. The manual moves on 16 Aug (Mon→Tue, Wed→Thu)
were somebody putting them on the right days, and they have been right ever
since.

The only oddity is cosmetic: her supervised rows carry no `appointment_id`, so
the sync sees them as orphans rather than linked sessions. Harmless while the
dates agree — worth linking one day, not worth touching now.

### Lauren Standefer — his Google Calendar is a day out

This is the real finding, and it is about the calendar, not the app.

| | |
|---|---|
| Google Calendar says | **Mon 11:00am** and **Wed 11:00am** |
| The app schedules | **Tue — Glute Dominant** and **Wed — Quad Dominant** |
| She has actually trained | Tue 11 Aug ✓ · Tue 18 Aug ✓ · Tue 25 Aug ✓ · Wed 26 Aug ✓ · Tue 1 Sep ✓ · Wed 2 Sep ✓ |

Six completed sessions in four weeks, every one of them on a **Tuesday** or a
Wednesday. Her Monday appointment has no completed session behind it, and her
Monday in the app holds a *solo* workout — a day she is booked in with him at
11am has her training alone.

So the recurring Monday 11:00 event is wrong, and it has been quietly fighting
the app: the sync keeps pulling Glute Dominant onto Monday and a human keeps
dragging it back to Tuesday. `moved_from_date` shows exactly that on 31 Aug and
again for every future week.

**Why it matters more now.** Under the old guard those rows were frozen out of
sync forever, so the fight had stopped. Under the new one, *the next time he
touches Lauren's Monday appointment the calendar wins* — and it would pull her
Glute Dominant session onto Monday, which is the day she does not train.

**The fix is one edit in Google Calendar**, not in the app: move her recurring
Monday 11:00 to Tuesday 11:00. The sync then agrees with reality, the weekly
drag stops, and the new guard does the right thing rather than the wrong one.
