# Shared audit brief — Symmetry Trainer App

You are auditing ONE feature area of a live production fitness-coaching app for
its owner, Dustin Gautreaux. Repo is at /home/claude/app (Next.js + Supabase).
Supabase project id: mkfiginpiesospsnktea (use the Supabase MCP execute_sql tool).

## THE POINT OF THIS AUDIT

The app has ~2,500 unit tests and they are nearly worthless: they assert that
SOURCE CODE CONTAINS A STRING, e.g.

    assert.match(CODE, /rpc\("dismiss_admin_row"/)

which passes whether or not that RPC does anything. On one recent morning, with
every test green:

  * searching "Thomas bagel" returned nothing, though the table holds nine
    Thomas' products — no search function read the `brand` column
  * every AI-added food arrived as "100 g" — nothing read `serving_options`,
    which is populated on 574,515 of 574,650 rows
  * the dismiss button on the trainer dashboard had NEVER worked once —
    `admin_dismissals` had zero rows in it, ever (an upsert named three columns
    while the unique index was on an expression, so every call 42P10'd)
  * the Payments header could not report an overdue payment on the tab it opens
    on, because it counted overdue rows out of a set that excludes them

Each was found in ~2 minutes by RUNNING A QUERY.

**So: do not report that code looks right. Run the thing and check the answer.**
A finding is only real if you can show the actual data that proves it.

## YOUR SPEC IS THE OWNER'S OWN WORDS

`app_feedback` holds ~106 rows of Dustin saying what he wanted or what was
broken. Almost every one is marked `resolved`. TREAT EACH AS AN ASSERTION AND
RE-TEST IT — several "resolved" items are demonstrably still broken. Example: on
2026-07-30 he asked for "an option to type the amount and change the unit" when
adding foods; it was marked resolved, and he hit that exact bug again on
2026-08-27.

    select created_at::date, status, transcript, change_summary
    from app_feedback where transcript ilike '%<your keyword>%' order by created_at;

Also useful: `messages` (his own words to clients/coach, `sender_kind is null`),
and project docs under claude/ in the attached Claude Project.

## HOW TO VERIFY (in order of preference)

1. **Run a query against live data.** Does the function return what a person
   would expect? Do two screens that show the same number agree?
2. **Call the RPC / function directly** with realistic inputs.
3. **Check the data the feature depends on exists and is shaped right** — the
   `serving_options` bug was "the column was full and nothing read it".
4. Only then read code, and only to explain a fault you have already observed.

Known traps in this codebase:
- PostgREST caps EVERY response at 1,000 rows and reports no error. `.limit(5000)`
  bounds nothing. A read of a >1,000-row table with no filter is truncating.
- `Number(null) === 0`, so a null macro silently logs as zero.
- ON CONFLICT must match a real unique index or every upsert fails with 42P10.
- The codebase quotes old broken code in comments; strip comments before
  concluding something is present in live code.
- Central time (America/Chicago), never UTC.

## WHAT TO REPORT

Return ONLY a markdown list of findings, most severe first. For each:

    ### <short title>
    **Severity:** high | medium | low
    **Where:** file:line, or the RPC/table
    **Spec:** what Dustin asked for, quoted, with the date if from app_feedback
    **Observed:** the ACTUAL data or output you got. Include the query/result.
    **Why it matters:** what a user sees go wrong
    **Fix:** one or two sentences

Rules:
- No finding without observed evidence. If you suspect but cannot show it, put it
  under a final `## Unverified suspicions` heading instead.
- Do not report style, naming, or refactor opportunities. Only things that are
  wrong or that contradict what he asked for.
- If a feature is fine, say so in one line under `## Verified working`.
- DO NOT modify any file. Read-only audit.
- Be concise. Findings, not prose.
