# The AI, audited — and what tonight's build has to fix

Written 12 Aug 2026 from live data, not from reading the code.
Dustin: *"Main focus needs to be the AI in app and make sure that it's actually
working everywhere."*

---

## The headline

**23 routes in this app call Claude. The usage table knows about 5 things.**

That is not because 18 are unused. It is because of how they log.

| | |
|---|---|
| Routes calling Claude | **23** |
| Distinct features ever recorded | **5** (`chat`, `parse`, `photo`, `plan_build`, `workout_build`) |
| Routes that log as the generic `chat` | **14** |
| Routes with **no meter at all** | **6** |
| Failures recorded, ever | **0 — there is no such column** |

So the question "is the AI working everywhere?" is, right now, **unanswerable
from the data**. Fourteen different surfaces report as one word.

---

## The three faults, in the order they matter

### 1. Failures are invisible

`logUsage()` runs only after a successful call, and records tokens, cost and
model. There is no status, no error, nothing.

**A route that has been failing for a week is indistinguishable from a route
nobody used.** That is precisely how the 8 Aug outage ran unnoticed until
clients started reporting it — the fix then was diagnosed by noticing
`ai_usage_log` had *zero rows*, which only worked because EVERYTHING was down.
If one surface breaks, nothing will show it.

### 2. Fourteen surfaces share one label

`chat` covers the agent, the assistant, nudges, attention drafts, celebration,
both coach-focus routes, three cron jobs, the nutrition act/coach routes, the
weekly brief and the workout assistant.

478 `chat` calls tells you nothing about which of those actually ran. Spend
cannot be attributed, a broken surface cannot be spotted, and there is no way to
answer "has the celebration message fired since July?"

### 3. Six routes can spend past the kill switch

No `enforceMeter` / `assertNotPaused` on:

`ai-nudges` · `cron/birthdays` · `cron/coachbot` · `cron/weekly-ai` ·
`feedback/describe` · `recipes/ai`

The $95 monthly cap does not apply to them. Four are **cron jobs**, which is the
worst case: they run unattended, on a schedule, with nobody watching.

---

## What tonight's build does

**Phase 1 — make it observable.** One distinct feature name per route (23, not
5). Add `status` and `error` to `ai_usage_log` so a failure is a row, not a
silence. Log the attempt before the call and complete it after, so a route that
dies mid-call still leaves evidence.

**Phase 2 — close the metering holes.** Kill switch on all six. Per-client caps
where a client exists; cron jobs get the global cap only, since they have no
client to charge.

**Phase 3 — a health surface.** One trainer screen: every AI surface, last
success, last failure, calls and spend for the week. This is what "working
everywhere" means in practice — not a claim, a page you can look at.

**Phase 4 — prove it.** Exercise every surface against the real model and
record the result. Costs a few dollars once. It is the only thing that actually
answers the question, and it is what was missing on 8 Aug when prompt changes
shipped to four live endpoints without any of them being run.

---

## Decisions needed before the overnight run

1. **One feature name per route** (23 names) — or grouped families (~8)?
   *Recommend per route: grouping is what caused this.*
2. **Record failures in `ai_usage_log`** (adds `status`, `error`, nullable) —
   or a separate `ai_failures` table? *Recommend the same table: one place to
   look, and a failure is a use.*
3. **Cron jobs and the kill switch.** Should a cron job stop when the monthly
   cap trips? *Recommend yes — otherwise the cap does not mean anything.*
4. **The smoke test costs real money** (roughly $2–5 for one pass over all 23).
   Run it as part of the build, or leave it as a button? *Recommend running it
   once tonight, then leaving the button.*
