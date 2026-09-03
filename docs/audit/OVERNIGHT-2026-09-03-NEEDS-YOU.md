# Still needs you — 3 Sep 2026

Four things. The two I led with last night were both my error, and are struck
through below rather than deleted, so the mistakes stay visible.

---

## 1. ~~Todd Prine~~ — RESOLVED, and it was my error

I raised his calendar as a problem. It is not one. He books a week at a time, his
billing was already correct (`per_session`, $75), and tomorrow's session is real.

The check was wrong, not Todd. Fixed: `clients.schedules_week_to_week` judges
such a client against their own booked horizon instead of the full future.
15 flagged rows → 1, and that one is the ordinary linking bug. Nothing needed
from you.

## 2. ~~Erin Arit~~ — not a client yet, nothing to decide

She has not confirmed signing up. Left exactly as she is; no flag invented for
someone who may not become a client. She will keep showing on the coverage check
until she signs up or is archived, and that is expected rather than drift.

## 3. The 207 supervised sessions — reviewed, cause found, NOT fixed

You said don't change anything and review it first thing. Full write-up:
`docs/audit/CALENDAR-SYNC-2026-09-03.md`.

The short version: **189 of the 207 are already on the correct day.** They just
have no `appointment_id`. The sync function only ever stamps that id as a *side
effect of moving something*, and a session that is already on the right day has
nothing to move — so it is in neither the `linked` set nor the `orphan` set and
the function cannot see it at all.

It looks harmless today because the dates are right. It is not: without that id,
a session can only follow its appointment when the move stays **inside the same
calendar week**. Move a Tuesday to the following Monday and the session silently
stays put. That is why this keeps looking fixed and then isn't.

The fix is one extra clause that stamps the id without moving anything — 185
unambiguous matches, 0 ambiguous. Two decisions before I write it:

- refuse when two appointments share a date? (0 rows today, so being strict is
  free — I would be strict)
- future-only, like the rest of the function? (I would say yes)

## 4. Your weigh-ins on 16 and 17 August

I set your weight to 196.2 everywhere, as instructed, by logging it as today's
weigh-in — so it is now the newest entry and everything reads from it.

I did **not** delete anything. But two rows are worth your eyes:

| date | weight | source |
|---|---|---|
| 2 Aug | 188.6 | caliper |
| 16 Aug | 207.0 | claude |
| 17 Aug | 207.2 | client |

188.6 → 207 in fourteen days is not a real fortnight. Your caliper entries run
consistently 5–8 lb below your scale entries, so those two are probably a
mis-log rather than a measurement — but they are yours to judge, and they are
still in the chart until you say otherwise.

## 5. Steph's duplicate macro-target row (carried over)

Two rows, 2 June, same millisecond, 1600 kcal and 1370. Ordering cannot separate
them. Still yours to pick — unchanged since 1 Sep.

## 6. Three cold spots the audit turned up

Not urgent, but each is a real decision:

- **Cardio logging: 0 rows in 30 days.** The feature exists. Broken, hidden, or
  replaced by something else?
- **Movement assessment: 0 rows, ever.** Three screens, an API route, a table,
  and a known RLS gap. Finish it or retire it — half-built has a cost.
- **Push notifications: 1 subscription, 28 clients.** If push is dead then every
  reminder and message alert in the app is landing nowhere, and the notification
  work is decoration.
