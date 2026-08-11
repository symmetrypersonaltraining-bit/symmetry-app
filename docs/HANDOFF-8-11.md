# Handoff — 11 Aug 2026

`origin/main` = `c0460ea`. 643 tests, 0 failures. All three gates green.

---

## PARKED — pick up first, in Waco

**The Help & Tutorials centre.** Dustin, end of day: *"that tutorial needs to be
there but needs to explain through the app that has now been updated. it needs
to stay up to date as we change anything in the app as well. lets park n deal
with it tomorrow once im in waco I don't want to mess it up."*

**Do not treat this as done.** What landed today is the *plumbing* — the centre
now lives in the shared repo instead of only in Dylan's fork, which is what
stopped it being deleted when that fork is retired. The CONTENT still describes
the app as it was, not as it now is.

Two jobs, and the second is the one that matters:

1. **Walk the app and rewrite the articles against what is actually on screen.**
   Do this WITH Dustin, screen by screen — the articles were written from a
   feature list, not from using it, and that is the gap he is pointing at. Every
   step should be checkable by tapping it.
2. **Make "stays up to date" structural, not a promise.** A header comment
   saying "update this when a feature ships" is exactly what failed here — the
   centre sat in a patch file for four days while the app moved. Options worth
   putting to him:
   - a test that fails when a route exists with no article referencing it;
   - the article set keyed to surfaces, so a renamed screen breaks the build;
   - a release-checklist gate.
   His call which. The point is that drift should be caught by something other
   than someone remembering.

Nothing here is urgent enough to rush, and getting it wrong writes confidently
false instructions into every client's app — which is why it is parked rather
than half-finished.

---

## Shipped today (11 commits)

| SHA | What |
|---|---|
| `1ca7876` | Schedule stops copying its own duplicates forward |
| `173f60b` | Full micronutrient panel: plan meals count, all 33 show |
| `39fc4a8` | Logger: a finished workout is never reported as a failure |
| `07f35b5` | Backlog updates |
| `7dd865c` | One session per client per day, enforced by the database |
| `b92b3e3` | Trainer is a setting, not an email address |
| `f487119` | Dylan's instance: the real blocker, and the plan |
| `c5cafe1` | Stop finding the coach by name |
| `b90d9a9` | The app stops calling every trainer Dustin |
| `520384a` | Three more things that would have broken Dylan's instance |
| `c0460ea` | Help & Tutorials into the shared repo |

Database changes: `uq_scheduled_workout_one_per_day`, `public.trainers`,
`is_trainer()` reading that table. Backups: `bak_lauren_orphan_log_20260811`,
`bak_lauren_orphan_setlogs_20260811`, `bak_dupe_sched_20260811`.

## The one step still needing Dustin

**`DUMP-SCHEMA.bat`** in the Trainer App folder, plus the connection string in
`db-url.txt` beside it. A cloud session cannot reach Postgres — verified: the
direct host is IPv6-only, pooler ports firewalled. Without this, Dylan's
Supabase cannot be built from the repo. Everything else for his instance is
done.

## Also open

- Demo account (`test-client@symmetry-test.com`) signs in to an empty app —
  backlog 7b, Dustin said "not yet".
- Garmin application is submit-ready; that queue runs weeks.
- Health Connect phases 2–6.
- AI coach approval loop (backlog 4b).
- The AI voice pass Dustin asked for "after everything else".
