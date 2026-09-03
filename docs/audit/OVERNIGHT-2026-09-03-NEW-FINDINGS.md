# Found while fixing — 3 Sep 2026

Things that turned up on the way to something else.

## Fixed on the spot

**A pinned version that does not exist.** The first draft of the icon-font
commit pinned `@tabler/icons-webfont@3.19.0`. That version has never been
published. It would have 404'd the entire stylesheet and taken all 144 icons off
every screen for every client — a confident, well-commented change that breaks
the app, which is exactly the failure mode this project keeps paying for. Caught
by checking the npm registry instead of trusting memory. The real `@latest` is
3.46.0, which is what shipped, and the warning is now in the file.

**A verification query that lied.** My first check that the 45 RLS rewrites had
landed said "still 45 unwrapped" — because the regex was case-sensitive and
Postgres renders the rewritten predicate as `( SELECT auth.uid() AS uid)`. The
rewrite had worked perfectly. Had I trusted that check I would have "fixed" it
twice or reverted a good change.

**An index-coverage query that over-matched.** My first attempt to find
unindexed foreign keys returned far more than the linter's 52, including
`clients.auth_user_id`, which is obviously indexed. Corrected to test that the FK
columns are a *prefix* of the index — which then agreed with Supabase exactly, 52
for 52. Worth remembering that agreeing with an independent source is what made
it trustworthy, not the query looking right.

## Noted, not fixed

**`client_coverage_under_14_days` could never see its own worst case.** It
inner-joined a `GROUP BY` over `scheduled_workouts`, so a client with no
scheduled workout at all produced no row to compare. Fixed tonight, but the
shape is worth flagging as a pattern: *any* check built on a group-by over the
thing being checked is blind to total absence. There may be others.

**`appointment_no_supervised_workout` and the coverage check are probably the
same finding.** Erin Arit appears in both. Not chased.

**56 tsc errors remain, all outside `src/`.** Scripts, fixtures and test helpers.
The CI type gate is scoped to `src/` because of them. Clearing them would let
the filter go.

**There is still no ESLint config at all.** `npm run lint` would hang in CI.
Deliberately not added tonight — a lint config is a large pile of opinions and
adding one unsupervised, at speed, is how a "cleanup" turns into a diff nobody
can review.

**44 `bak_*` tables are still present** and now show up in the generated
database types. Cosmetic. They also account for all 41 `no_primary_key` advisor
findings, which is why that category can be ignored wholesale.

**Auth is capped at 10 database connections** and is not on percentage-based
allocation, so growing the instance will not improve auth throughput. One line
in the Supabase dashboard. Not touched because it is a paid-plan setting and his
call.
