# The audit — how we stop shipping obvious breakage

## Why this exists

Dustin, 27 Aug 2026:

> *"These are the types of mistakes that could completely destroy the success of
> this app. Things like this should have already been caught. I told you how I
> wanted it to work. We built it and then it should have been tested somehow
> because obviously you do have the capability to test it — because once I told
> you it wasn't working right, you were able to test it and find it very quickly
> and very simply."*

He is right, and the diagnosis is specific.

On the morning all of the following were broken, **2,500 unit tests were green**:

| What was broken | For how long |
|---|---|
| "Thomas bagel" found nothing, with nine Thomas' products in the table | since the search shipped |
| Every AI-added food arrived as "100 g" — nothing read `serving_options`, populated on 574,515 of 574,650 rows | since the catalogue shipped |
| The ✕ on Today's Admin had **never worked once** — `admin_dismissals` had zero rows, ever | since the feature shipped |
| The Payments header could not report an overdue payment on the tab it opens on | since the tab shipped |
| The calendar sync timed out every hour | 32 hours |

**Every one of those tests passed because they assert that source code contains
a string.**

```js
assert.match(CODE, /rpc\("dismiss_admin_row"/)   // passes whether or not the RPC works
```

That is a spell-checker. It confirms an intention was typed. It cannot tell you
whether the intention was achieved.

And every one of these bugs was then found **in about two minutes** by running a
query. That is the whole lesson:

> **Running it is the test.**

## The two halves

### 1. `supabase/audit/live_audit.sql` — the important half

Executes the real paths against the real database and asserts on the **answers**.

- Search "Thomas bagel" → require a Thomas bagel back
- Search ten phrases a person would actually type → require a plausible hit
- Require common foods to offer a countable serving, not just a weight
- Require a completed workout over five minutes to have recorded sets
- Require no workout to be completed for a future date
- Require the calendar sync to have succeeded recently
- Require no critical integrity check to be failing

Run it in the SQL editor, or via `execute_sql` on the Supabase MCP tool. Read the
`FAIL` rows; each one is a real user-visible fault.

### 2. `scripts/audit/static-audit.mjs` — the cheap half

Looks for **shapes known to fail**, each drawn from a fault that actually shipped:

- a read of a >1,000-row table with no filter and no usable limit — PostgREST
  caps every response at 1,000 rows and returns no error
- a `.limit(n)` above that cap, which bounds nothing and reads as if it does

```
node scripts/audit/static-audit.mjs      # exit 1 if anything is flagged
```

## Rules for adding a check

1. **Assert on an answer, never on the presence of code.** "This function exists"
   is not a check. "This function returns a Thomas bagel when asked for one" is.
2. **Strip comments before matching source.** This codebase documents each bug
   beside its fix, quoting the broken code verbatim. The first run of the static
   audit reported four `.limit(5000)` findings and all four were comments
   explaining that `.limit(5000)` does not work. An audit that cries wolf gets
   ignored, which is worse than no audit.
3. **A check that cannot fail is not a check.** Before adding one, break the
   thing on purpose and confirm it goes red.
4. **Prefer the live half.** A static rule can only find shapes you already know
   about. A live probe finds the ones you don't.

## What this still does not cover

- **Model behaviour.** Whether the food picker chooses the right row needs a real
  API call against fixed cases. No key is available in the cloud sandbox; this
  needs an eval run where one is.
- **Rendering.** Whether a banner covers a button, or a number renders as
  "1 100 g", is not visible from SQL or a regex.
- **Write paths end to end.** The dismiss bug would have been caught by
  *executing* the upsert as a real user. That needs a scratch account and a
  rollback, and it is the highest-value thing still missing.
