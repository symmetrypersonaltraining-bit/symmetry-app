# Paying for the AI when there is more than one trainer

**Status: DESIGN. Nothing here is built.** Written 21 Aug 2026 in response to
Dustin, 20 Aug: *"we need to figure out how to get them ai use without using
mine and create more cost for me just to test. id prefer they have their own
claude account connected to their trainer account."*

It ends in a decision he has to make, not in a pull request. One of the options
involves storing another person's API key in his database, and that is not a
thing to ship while he is asleep.

---

## The problem is not the bill. It is the blast radius.

Every AI call in the app runs on one `ANTHROPIC_API_KEY` — **28 call sites
across 22 route files** — and every one meters into a single `ai_usage_log`
with **one global monthly cap of $95** (`MONTHLY_COST_CAP_USD` in
`src/lib/ai/meter-core.ts`).

The cost of a second trainer is the smaller half of this. The sharp half is
that the cap is **global and shared**:

> A test trainer exploring the AI drawer on a Tuesday afternoon can trip the
> kill switch, and the app then refuses AI **for Dustin's paying clients** —
> the coach, food parsing, photo analysis, the workout builder, all of it —
> until the first of the next month.

Nothing in the app currently prevents that. There is no per-trainer accounting
at all: `ai_usage_log` has a `client_id` and no `trainer_id`, and the rows with
no client at all (the trainer agent, the crons, the kill-switch notices) cannot
be attributed to anybody even after the fact.

So the first job is not billing. It is making one trainer unable to take the
AI down for everyone else.

---

## Three options, in the order they should be considered

### A — Per-trainer budgets on Dustin's key *(recommended first, and safe to build)*

Keep one key. Start counting per trainer, cap per trainer, and make the kill
switch personal instead of collective.

**What it needs**

1. `ai_usage_log.trainer_id`, written on every insert. Derive it from
   `clients.trainer_id` where there is a client, and from the calling trainer
   where there is not. Backfill what can be attributed; leave the rest null and
   labelled, rather than guessing.
2. A per-trainer month-to-date sum. `monthToDateCostUsd()` currently sums the
   whole table; it needs a sibling that filters, and the cap check needs to use
   it.
3. `trainers.monthly_ai_budget_usd`, defaulting to something small — $10 is a
   great deal of testing. The owner's own budget is the existing $95.
4. The pause email goes to **the trainer who tripped it**, and copies the owner.
   Today it goes to `TRAINER_EMAIL`, which is the owner by definition, so the
   person who caused it never hears about it.
5. `/settings/ai-health` shows a trainer their own spend against their own
   budget. The owner keeps the whole-instance view.

**What it costs Dustin**: whatever the trainers actually use, bounded by a
number he sets per person. He can set it to $0 and a trainer has no AI at all,
which is a legitimate configuration.

**What it does not need**: anybody's key, any new secret, any new liability.

This is roughly a day of work, it is entirely plumbing, and **it is a
prerequisite for both of the other options** — neither of them is safe to run
without per-trainer accounting underneath.

### B — The trainer's own Claude account, connected to the app *(what Dustin actually asked for)*

This is the one worth being precise about, because the obvious reading of it is
wrong and the wrong version is dangerous.

**The wrong version**: give the trainer the Supabase MCP connector, the way
Dustin's own Claude reaches the database. That connector authenticates as the
service role. It **bypasses RLS entirely**. Every per-trainer boundary shipped
on 20 August — payments, reminders, appointments, device tokens, notifications,
41 policies — evaporates the moment a second person points their Claude at it.
They would be able to read every client of every trainer, and there would be no
record that they had. Do not do this, and do not let the convenience of it
argue otherwise.

**The right version**: the app exposes its own scoped endpoint — an MCP server,
or a plain HTTP API — that a trainer's Claude connects to with a **per-trainer
app token**. The token is a credential to *this app*, not to Anthropic and not
to Postgres, and everything it can reach goes through the same scoping the
screens use. `src/lib/ai/agent-tools.ts` already has exactly this shape: a
`ToolCaller` carrying `trainerId` / `isOwner`, tables classified
client-scoped versus shared, and a `query_table` that **fails closed** on
anything unclassified. That is the hard part and it is already written and
tested.

**Why this is the good answer**

- The trainer's usage is on **their** Claude subscription. Dustin's key is not
  involved and his cap is not touched. The cost question disappears rather than
  being managed.
- **No Anthropic key ever enters the app.** Nothing to store, encrypt, rotate,
  or be liable for.
- Revocation is a row. Delete the token and that trainer's Claude is out, with
  no effect on anyone else and no key to rotate anywhere.
- It is the same working style Dustin has, which is what he asked for — a
  Claude conversation that can read and write his side of the app.

**What it needs**

1. A `trainer_app_tokens` table: token hash (never the token), trainer_id,
   label, created_at, last_used_at, revoked_at. Show the token **once**, on
   creation, and store only its hash — the same discipline as a password.
2. An endpoint that authenticates a token to a trainer and calls
   `execTrainerTool` with the `ToolCaller` that token resolves to. The
   scoping work is done; this is the doorway.
3. Rate limiting per token, and `last_used_at` so a forgotten token is visible.
4. A page under Settings to create, name and revoke tokens, and a step in the
   tutorial — Chapter 12 already tells trainers this is coming and is marked
   NOT BUILT YET, so it is honest today and only needs the badge removing.

**What it does not solve**: the AI *inside* the app — the coach, food parsing,
the assessment recommendation, the nudges. Those run server-side on the app's
own key and always will, which is why option A is still needed underneath.

### C — Bring your own Anthropic key

Each trainer pastes their own `sk-ant-…` into settings; the app uses it for
their calls.

**Say the risk out loud.** An Anthropic API key is a bearer credential that
spends money. Holding other people's means:

- Storing it somewhere better than a normal column. `app_api_keys` (RLS on,
  **zero policies**, service-role only) is the right shape and would need a
  per-trainer variant. Note that Postgres-at-rest encryption is not the same as
  the key being unreadable to anyone with database access — which, today,
  includes anybody Dustin has ever given the Supabase connector to.
- A rotation and revocation story, and sane behaviour when a key goes invalid
  mid-request.
- Accepting that if the database leaks, he has leaked other people's paid
  credentials. That is a different conversation from leaking his own.

**And it buys less than B.** It pays for the in-app AI on their card, but it
does not give a trainer their own Claude to work in — which is the thing that
was actually asked for.

**Recommendation: do not build C.** Do A, then B. If some trainer genuinely
needs the in-app AI on their own account after that, revisit it as a deliberate
decision with the storage question answered first.

---

## Recommended order

1. **A** — per-trainer accounting and budgets. Removes the shared blast radius,
   which is a live risk today with Stephanie on the instance. Nobody's
   credentials involved.
2. **B** — per-trainer app tokens and a scoped endpoint, so a trainer's own
   Claude can work their own side of the app. Most of the scoping already
   exists.
3. **C** — only if something after A and B still requires it.

---

## Decision needed from Dustin

1. **Per-trainer budget default** — what should a new trainer get per month?
   ($10 is a lot of testing. $0 means no in-app AI until you raise it.)
2. **B: build it, or wait?** It is a real piece of work and it is what you asked
   for. A is worth doing either way.
3. **C: is storing a trainer's Anthropic key acceptable to you at all?** If the
   answer is no, that is a clean answer and it closes the question — it does not
   need to be revisited every time somebody asks about AI cost.

Until 1 is answered, A ships with a conservative default and a note, rather
than waiting.

---

*Nothing in this document has been built. `trainer_tutorial_live` Chapter 12
already tells new trainers that connecting their own Claude account is designed
and not yet available, so the app is not promising anything this document does
not deliver.*
