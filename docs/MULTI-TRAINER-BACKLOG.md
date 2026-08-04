# Backlog: make "trainer" a setting instead of an email address

**Status:** not started. Parked 2026-08-04 at Dustin's request — do this before
scaling, not after.

**Why it's on the list:** Dustin, 2026-08-04, on Dylan's instance: "dylans is
completely seperate, testing from a trainer perspective for later moving to app
stores and scaling so i guess we have to leave that one seperate."

Separate is the right call. The problem is *how* it's separate.

---

## The actual problem

"Is this person the trainer" is written as "is this email address
`symmetrypersonaltraining@gmail.com`" in **63 places across 62 files** in
`src/`, and once more inside the database:

```sql
CREATE OR REPLACE FUNCTION public.is_trainer()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND email = 'symmetrypersonaltraining@gmail.com'
  );
$function$
```

So Dylan's instance is not a *configuration* of this app. It is a **fork**: to
make him the trainer, those same 63 lines had to be edited. Which means:

- Fixes shipped here either never reach him, or reach him as a merge that
  re-touches the exact lines his fork changed. The two drift by default.
- Once they drift, "Dylan testing from a trainer perspective" stops testing what
  Dustin's clients are actually running — which is the entire point of his
  instance.
- Adding a second trainer to *Dustin's own* studio is impossible today for the
  same reason. `is_trainer()` is binary: true means full access to all 35
  clients' data. This was flagged when Dylan's access first came up and is still
  the reason his email was not simply added to it.

## What the fix is

One place that answers the question, fed by config rather than a literal:

1. **App side.** A single `isTrainer(user)` in `src/lib/` reading a
   `TRAINER_EMAILS` env var, defaulting to Dustin's address. Replace all 63
   call sites. `src/lib/ai/scope.ts` already exports `TRAINER_EMAIL` and
   `src/lib/rankings.ts` already imports it — that import is the pattern to
   spread, not a new idea.
2. **Database side.** `is_trainer()` reads from a table (or a database setting)
   instead of a string literal. Same signature, so no RLS policy changes.
3. **A test** that fails the build on a new hardcoded occurrence of the address
   outside the one config module — otherwise the 64th appears within a month.

## What it changes for Dustin

Nothing visible. Same behaviour, same access, same everything — the env var
defaults to his address.

## What it unlocks

- Dylan runs the **same code** with one setting different, and pulls every fix
  automatically.
- A second trainer inside Dustin's studio becomes possible at all (and the
  scoping work — which clients a trainer can see — becomes a separate, honest
  piece of work rather than an all-or-nothing flag).
- App Store multi-tenancy becomes a row in a table rather than 63 edits.

## Size

About a day. Mechanical but wide — 62 files. Worth doing in one pass with the
test in place, not incrementally.

## Related open question

`app_feedback.app_instance` exists (`'live'` / `'dylan'`, defaults to `'live'`)
from the cross-app columns migration. As of 2026-08-04 there are **99 rows, all
`'live'`** — nothing from Dylan's instance has ever landed here. If his feedback
is meant to reach Dustin's board, that wiring is still missing; if it isn't,
the column can go when this work happens.
