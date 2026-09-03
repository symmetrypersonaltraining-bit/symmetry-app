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
| e1eb7b88 | The three morning documents |
| cc20d7a8 | Backlog: the 3 Sep overnight run |
| e7d4c4cc | The service-role client now answers to the schema |

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


---

## The service-role client is now type-checked (added after the docs above)

`src/lib/supabase/admin.ts` is parameterised with `<Database>`. It is the client
that uses the service role and bypasses RLS entirely, so a wrong column there is
a write no policy would have stopped — which is why it went first.

Nine errors surfaced, all nine fixed on their merits. **No `any`, no
`@ts-ignore`, no `@ts-expect-error` in any of the seven files touched.**

The two most telling:

- **Two hand-written casts were replacing real types with guessed ones.** In the
  meal-plan clone path, `allMeals as { …; rotation: unknown }[]` declared
  `rotation` as `unknown` — and `rotation` is a jsonb column, so copying a meal
  was assigning `unknown` into `Json` with nothing checking it. The other threw
  away the shape its own `select` already guaranteed. Both deleted. The casts
  were not describing the database, they were overriding it, and that is the
  whole problem in one line.

- **One looked like a live bug and was not.** `clients.trainer_id` is NOT NULL
  with no default, and `create-client-from-assessment` omits it when the creator
  has no `trainers` row — which reads like a guaranteed failure during
  onboarding. It is not: `stamp_client_trainer()` is a BEFORE INSERT trigger
  that fills it in, and `gen types` cannot see triggers. Checked against the live
  trigger definition rather than assumed.

**The new CI gate earned its keep within the hour.** Changing
`p_trainer: isOwner ? null` to `undefined` — identical calls, since the argument
is `DEFAULT NULL::uuid` — broke a test that pins that line by source text. That
test guards a real leak: the AI health page once read the whole business's costs
behind a bare "is a trainer" check. The owner branch now accepts either
spelling, and the half that matters — a non-owner scoping to their own id — is
asserted separately and more strictly than before.

Final state: **tsc 0 errors in `src/` · 2,649 unit tests + 43 nutrition tests,
0 failed · build compiled successfully.**

`server.ts` (191 errors) and `client.ts` (135) remain. Those are a project, not
a commit.


---

## Correction, after Dustin reviewed the overnight docs

Two of the three things I led NEEDS-YOU with were my error, not findings.

**Todd Prine.** I reported his calendar running out while 67 sessions were
programmed to October. His billing was already correct (`per_session`, $75) and
he books a week at a time — "4th or 5th time explaining this." A calendar that
only runs a week ahead is how he books, not a gap.

Both calendar checks assumed every client's calendar reaches as far out as their
programming. For a week-to-week client that is never true, so they generated a
permanent and *growing* false alarm — the identical failure to
`scheduled_workout_null_assignment_id`, retired the same morning for the same
reason.

Fixed with `clients.schedules_week_to_week`: such a client is judged against
**their own booked horizon** — their latest actual appointment — rather than the
full future. A fixed 7-day window was tried first and was still wrong, because a
session on the 7th when he is booked through the 4th is next week's booking he
has not made yet, not an unbooked session. Todd: 15 flagged rows → 1, and off
the coverage check entirely. The remaining one is tomorrow's session, confirmed
correct, unlinked only because of the `appointment_id` bug.

**Erin Arit.** Not a client yet — she has not confirmed signing up. Left exactly
as she is; no flag invented for someone who may not become one.

`supervised_workout_no_appointment` now reports 187, and that number is now
almost entirely the linking bug and nothing else. Previous function definitions:
`bak_run_integrity_checks_20260903` and `bak_run_integrity_checks_20260903b`.

**The pattern worth keeping.** Three times in one night a "finding" turned out to
be normal work the check did not understand: the 493 assignment ids, Jerry, and
now Todd. Every one cost Dustin an explanation he had already given. Before
raising anything roster-shaped, read the "STOP RE-REPORTING THESE" section of
STANDING-RULE-INVARIANTS first — and when a check disagrees with how he actually
works, the check is what changes.
