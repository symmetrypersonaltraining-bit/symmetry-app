# Overnight run — 3 Sep 2026 — what shipped

`origin/main` **5ef146c4 → (this run)**. Every commit passed the same three
gates before leaving the sandbox: `tsc` 0 errors in `src/`, unit suite 0 failed,
`next build` "Compiled successfully". The `/login` prerender error about
Supabase env vars is the expected sandbox one and is ignored.

**The unit suite is green for the first time since 1 Sep, and CI now enforces it.**

---

## Code

| commit | what |
|---|---|
| 6f93f148 | The type checker can read the test tree (carried from last session) |
| eb9e01de | The home screen asks five questions at once instead of one at a time |
| 1b419591 | The icon font no longer holds up the first paint |
| 1a8675bc | The test that has been red since the bug it describes was fixed |
| 60510377 | CI now runs the two checks everyone was asked to remember |
| 9b891176 | The shape of the database, in a file the compiler can read |
| 6451095d | The feature audit, built from the routes and the database |

## Database (all backed up first)

| change | backup |
|---|---|
| `metrics_sync_client_weight` trigger + backfill | `bak_clients_weight_20260903` |
| 45 RLS policies: `auth.uid()` → `(select auth.uid())` | `bak_rls_initplan_20260903` (all 215) |
| 52 missing foreign-key indexes created | additive, nothing to back up |
| `run_integrity_checks()` rewritten | `bak_run_integrity_checks_20260903` |
| `clients.is_test_account` added, 6 accounts flagged | additive |

---

## Why the app was slow

Three causes, all measured, not guessed. Region was ruled out first — Supabase
is `us-east-1` and Vercel defaults to the same, so that usual suspect was not it.

**1. Every page began with a render-blocking stylesheet on a third origin.**
The browser painted nothing until jsdelivr answered — DNS, TLS, fetch, parse,
all in front of the first pixel, on every page, every load. It now preloads and
attaches without blocking. Also pinned: the URL said `@latest`, which caps
browser caching at about a week instead of a year, so repeat visitors re-fetched
it constantly.

**2. The home screen made five database round trips in a row.** None of them
needed each other — every one takes `clientRecord.id`, already resolved — so the
waiting bought nothing. They now leave together. At ~150 ms a hop on gym wi-fi
that is most of a second, every load.

**3. The database re-did its security work on every row.** 45 policies called
`auth.uid()` per row instead of once per query, and 52 foreign keys had no
covering index, so joins on `client_id` — the column this app joins on more than
any other — were sequential scans.

Still outstanding, and the biggest single database win left: **130 duplicate
permissive RLS policies**, 114 of them on `authenticated`. Postgres evaluates
every matching policy and ORs the result, per row. Untouched deliberately —
consolidating them changes *who can see what*, and that is not a thing to do
unsupervised.

## The weight bug

`clients.current_weight` was a cache that nothing kept in sync. Ten active
clients had drifted from their own weigh-in log, by up to 11 lb.

The profile form was taught on 24 Aug to write a `metrics` row when a coach
types a weight — that closed one direction. The other stayed open: a weigh-in
arriving from the client check-in, the AI, a caliper session or an import
updated nothing. So which weight a person saw depended on which screen they
opened.

Per STANDING-RULE-INVARIANTS, the fix went in the database rather than the app:
a trigger on `metrics` keeps `current_weight` and `current_body_fat_pct` equal to
the newest weigh-in, binding every writer — app, AI, cron, a Claude session with
the MCP, and a file nobody has written yet. Dustin's 196.2 was logged as today's
weigh-in first, so it is the newest entry everywhere.

Drift is now **0**. Proved by inserting a weigh-in on the demo account, watching
`current_weight` follow, deleting it, and watching it revert — then confirming
nothing was left behind.

## The integrity board is honest now

It was reporting 8 warnings. One of them was 493 rows of normal.

- **`scheduled_workout_null_assignment_id` — RETIRED.** All 493 were the standard
  workflow: Dustin builds every session per client from the exercise library and
  does not assign grouped programmes. This has been re-raised as drift in session
  after session. It is now written into STANDING-RULE-INVARIANTS so it stops.
- **`client_coverage_under_14_days` — had a blind spot.** It inner-joined a
  GROUP BY over `scheduled_workouts`, so a client with *no* scheduled workout at
  all produced no row and could never be flagged. The worst coverage in the
  system was the only kind it could not see. Now a left join — and it
  immediately surfaced Erin Arit, who had been invisible.
- **`clients.is_test_account` added** so the six tester accounts stop being
  rediscovered every sweep. Jerry Bourgeois was already correctly flagged
  `nutrition_only` — see the correction below.
- **`client_weight_drift_from_metrics` — KEPT**, now as the guard proving the new
  trigger is still firing.

## The CI gate

Until tonight nothing in CI ran the type checker over `src/` or ran the tests.
Both were rules a person was expected to remember, which is how the same
regressions kept reaching main.

The unit gate was only possible because of the commit before it. The suite had
one failing test since 1 Sep — and that test was asserting the *bug*, not
guarding against it. `ACT_SYSTEM_PROMPT` tells the model to answer training
questions with intent `none` and an empty reply; the test demanded that be
rejected. The validator was fixed on 1 Sep, the test was not, and a red suite
cannot be made blocking. Verified red-first before replacing it.

The type gate is scoped to `src/` on purpose: 56 errors remain, all outside
`src/`, in scripts and fixtures that ship to nobody. Gating the whole tree means
a job that is red on arrival, which is a job everyone learns to scroll past.

---

## I was wrong about one thing, and it is worth saying plainly

I reported eight clients with no future workouts and implied the app had lost
track of them. **Jerry Bourgeois was already correctly flagged `nutrition_only`,
and the coverage check already excludes nutrition-only clients — so the app never
flagged him.** He appeared because *my own ad-hoc query* did not apply that
filter.

Dustin's response was "That should have already been noted. We've been over that
three times now." He was right, and the system was right. I was the one
re-raising it.

The fix is not a code change, it is that this is now written down where the next
session will read it before running its own query.
