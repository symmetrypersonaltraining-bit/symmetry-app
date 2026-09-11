<!-- Moved from the Cowork project (`claude/WORKOUT-ISOLATION-2026-09-01.md`) on
     10 Sep 2026 so Claude Code sessions can read it. The project copy is
     history; this is the live one. -->

# Do not collapse duplicate workouts — they ARE the isolation

*Settled 1 Sep 2026.*

## The question

> "for the same workout copied, I do not ever want an issue of reusing workouts
> for different clients or any type of cross over issues so as long as
> collapsing does not bring back up any of those issues thats fine"
> — Dustin, 1 Sep

**Answer: collapsing would bring exactly those issues back. Do not do it.**

## Why

`sw_enforce_day_isolation` is a BEFORE INSERT/UPDATE trigger on
`scheduled_workouts`. Every time a workout is scheduled it checks
`day_is_exclusive_to(day_id, client_id)` and, if the day is not exclusive,
silently calls `fork_day_for_client` and repoints the row at the copy.

**The 734 "duplicate" workouts are that trigger's output.** They are not
accidental bloat left by a sloppy import — they are one private copy per client,
created on purpose, which is what makes a per-client edit impossible to leak.
Collapsing them would be deliberately undoing the protection, and the trigger
would re-fork them the next time anything was scheduled anyway.

It matters because **every editor writes to `prescribed_exercises` in place, by
id**:

| path | writes | forks first? |
|---|---|---|
| `WorkoutLogger` swap (client-facing) | `swap_prescribed_exercise` RPC | **yes** |
| `clients/[clientId]/program/page.tsx:455` | `.update()` on `prescribed_exercises` | no |
| `clients/[clientId]/day/[dayId]/WorkoutDayEditor.tsx:249` | `.delete()` | no |
| `lib/ai/workoutAdjust.ts:171/186/201` | `.delete()` / `.update()` | no |
| `WorkoutLogger:1532` (tracked_fields) | `.update()` | no (trainer-gated) |

So if two clients shared one `days` row, changing a movement for one would
change it for the other, with nothing visible to say so. The fork is what stops
that.

## Exposure as of 1 Sep: none upcoming

25 days still have a live row shared between 2–4 clients — rows written before
the trigger existed, which it cannot reach backwards to fix (it also exempts
completed history by design).

**All 25 hold only stale past rows — scheduled, never done. Zero future rows.**
No upcoming session, for any client, sits on a shared workout.

The client-facing swap path is safe on those days regardless, because it forks
before writing. The residual surface is the trainer-side editors in the table
above: editing one of those 25 days from a client's programme page would cross
over to the other client on it.

## Guard added

`public.run_day_isolation_checks()`, wired into `integrity_checks_12h`
(now: integrity → scheduling → nutrition → programme-ownership → workout-names
→ day-isolation). Two checks, severity keyed to whether anyone will actually
train it:

| check | severity | at the time |
|---|---|---|
| `day_shared_between_clients_upcoming` | warn | **0** — no future session on a shared day |
| `day_shared_between_clients_stale` | info | 25 — surface, not incident |

## Open — Dustin's call

Two ways to clear the remaining 25, either is safe:

1. **Delete the stale past rows.** They were scheduled and never done, across
   ~15 clients. Removing them makes those days exclusive again and closes the
   surface with no code change. Same class of cleanup already done for two
   clients, but a wider blast radius, so not done unasked.
2. **Add fork-before-edit to the three trainer-side editors**, matching what
   the client-facing swap already does. Closes it permanently for any day,
   including ones created in future. More work; the better long-term answer.

Doing both is the belt-and-braces version.
