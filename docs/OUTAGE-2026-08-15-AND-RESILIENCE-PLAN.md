# The 15 Aug auth outage, and what to build so the next one is boring

**Written overnight 14/15 Aug 2026, during the incident.**
Dustin, 23:05 CT: *"we need to discuss a way to avoid this in the future once
you get it all sorted out. there has to be some type of back up system for this
type of scenario."*

Yes. This document is the evidence, then the options, then a recommendation.

---

## PART 1 — WHAT ACTUALLY HAPPENED

### The symptom

`https://symmetry-app-omega.vercel.app/*` returned

```
504: GATEWAY_TIMEOUT
Code: MIDDLEWARE_INVOCATION_TIMEOUT
```

intermittently — roughly half of page loads. A white page with a Vercel error
code on it. No branding, no explanation, nothing a client could act on.

**Dustin found it, not the monitoring, because there is no monitoring.** That is
the single most important sentence in this document.

> ## ⚠️ ROOT CAUSE, FOUND AT 06:47Z — READ THIS BEFORE THE REST
>
> **The database instance has almost no CPU, and the imports are what took it.**
> Everything below this box was written before that was known and reasons from
> the symptom outward. It is kept because the ruling-out is worth having, but
> where it says "this is Supabase's problem, not ours", it is **wrong**.
>
> The measurement that settles it — pure CPU, no IO, no tables, no concurrency,
> on an idle database:
>
> ```
> select count(*) from generate_series(1, 3000000)   →  4.26s, then 6.58s
> ```
>
> A healthy small Postgres does that in 0.4–0.7s. This is **8–13× slower**.
>
> And a real query — 46 rows, correct index, 31 buffers — took **4,631 ms**, of
> which **844 ms was planning**. Thirty-one pages cannot take 4.6 seconds. The
> queries are fine. There is nothing left to run them with.
>
> **Why.** The instance is burstable: it earns CPU credits while idle and spends
> them under load. `off-bulk-import` and `off-micros-backfill` pushed 1.5M rows
> through an 853 MB table every 60 seconds for hours. That drains the credits,
> and once they are gone the instance is throttled to a fraction of one vCPU.
> Everything on it degrades at once — and Supabase still reports
> `ACTIVE_HEALTHY`, because the instance is up. It is just slow.
>
> That single fact explains every symptom independently observed tonight:
> auth at 10–65s, PostgREST timing out on half of all queries, a 13.6s Realtime
> `apply_rls`, and 844ms to plan a trivial index scan.
>
> **Consequences for what to do:**
>
> - Leaving the imports **off is the treatment**, not a precaution. Credits
>   refill while the instance is quiet, over hours.
> - **Do not re-enable them** before deciding between a larger instance and a
>   maintenance window. Item 4 below is no longer a "live risk" — it is the
>   cause, and it is now the first thing to fix.
> - Local JWT verification (`82d33d0`) is why the app serves in 150ms while the
>   database is still this slow. It is a real fix on its own merits and it also
>   bought the headroom to diagnose this calmly.
> - AI features stay slow until the CPU returns: they read a lot per request,
>   and reading is what is expensive.
>
> **Two corrections I owe the record.** My first answer tonight — the imports
> are saturating the connection pool — was the right culprit for the wrong
> reason. My second — this is Supabase's fault, nothing on our side makes it
> slow — was wrong, and I said it confidently after the pool cleared and the
> timeouts continued. What I had actually shown was that stopping the imports
> does not *immediately* fix it, which is a different claim, and CPU credits are
> exactly the mechanism that makes those two things differ.
>
> ### ⚠️ THIRD READING, ~07:29Z — the measurement, and a correction to my own
>
> **It is not recovering the way it should be, and the database was idle when
> measured.**
>
> ```
> ~06:33Z   3,000,000 rows in 1.15s  =  0.38 µs/row
> ~07:29Z     500,000 rows in 5.04s  = 10.1  µs/row     ← 26× worse per row
> ```
>
> `pg_stat_activity` at the time showed **nothing running but the probe itself**.
> An idle database cannot be 26× slower than itself an hour earlier because it
> is busy — there is nothing to be busy with.
>
> **A CORRECTION I OWE, and it matters because Dustin may spend money on this.**
> The first version of this box said "four hours after the imports were
> disabled" and dated the readings 08:16Z and 10:52Z. **All three numbers were
> wrong.** I wrote the timestamps by hand from a drifting sense of the clock
> instead of reading it. Anchored against the ship-bridge result files, which
> are real: the imports were paused ~04:41Z and fully disabled ~05:55Z, and that
> last probe was ~07:29Z. So the elapsed time is **1h34m, not four hours.**
>
> That weakens the conclusion and I would rather say so than let a tidy story
> stand. **1h34m is not long enough to declare a burstable instance recovered**,
> so "this is its floor" is no longer supported by the elapsed time.
>
> What survives the correction: the instance was **idle** and still 26× slower
> than itself an hour before. That is not explained by load, and it says this
> instance cannot hold its performance. Whether that is a credit floor or a slow
> refill is exactly the thing I cannot tell from here.
>
> **So the recommendation is: look at the dashboard before deciding.** The tier
> and the CPU credit balance are both there and take ten seconds. If credits are
> at zero and climbing, this is a slow refill and a maintenance window may well
> be enough. If they are at zero and staying there, the instance is undersized
> and Part 3 item 4's "bigger instance" is the honest answer. I can infer from
> behaviour; I cannot read the gauge, and Dustin can.
>
> ### FOURTH AND FIFTH READINGS — it is ERRATIC, which is its own answer
>
> Kept probing, reading the clock each time this time:
>
> ```
> 06:33Z  3,000,000 in  1.15s  =  0.38 µs/row   ← best of the night
> 07:29Z    500,000 in  5.04s  = 10.1  µs/row
> 07:49Z    500,000 in  2.29s  =  4.57 µs/row   ← improving?
> 07:59Z    500,000 in 10.86s  = 21.7  µs/row   ← worst of the night
> ```
>
> **A 57× spread inside ninety minutes, on a database with nothing running on
> it.** That is not a smooth refill and it is not a stable floor. It is erratic.
>
> For a production app that is arguably worse than being uniformly slow, because
> it means performance depends on luck rather than on load — you cannot plan
> around it, and you cannot tell a bad deploy from a bad minute.
>
> It also means neither of my earlier stories was right. Not "recovering
> steadily", not "at its floor". Whatever governs this instance's CPU is
> handing it out in a way that a single number cannot describe, and the
> dashboard is still where the answer is.
>
> ### ── AND THE THING WORTH TAKING FROM ALL OF IT ──
>
> Measured at **07:59Z, in the same minute as that 21.7 µs/row reading**, the
> app served six consecutive page loads at **304 / 111 / 98 / 88 / 102 / 103 ms**.
>
> The database was at its worst of the entire night and **the app did not
> notice**, because after `82d33d0` it no longer asks the database who you are on
> every page load. That is the whole value of the change Dustin approved at
> 05:15, demonstrated under the exact conditions that produced the outage.

### The cause (as understood at 05:00Z — superseded by the box above)

Supabase's **auth service** (GoTrue), not the app and not the database.

Every page load asks Supabase `GET /user` — "who is this?". From the project's
own `auth_logs`:

| minute (UTC) | requests | timed out | worst |
|---|---|---|---|
| 03:32 | 3 | 2 | 25.9s |
| 03:34 | 2 | 1 | 22.8s |
| 03:38 | 1 | 1 | 10.8s |
| 03:40 | 1 | 0 | **65.6s** |
| 03:42 | 1 | 1 | 14.2s |
| 03:44 | 4 | 4 | 38.3s |
| 03:45 | 3 | 2 | 12.1s |
| 03:46 | 4 | 2 | 12.1s |
| 03:51 | 3 | 2 | 12.8s |
| 03:52 | 2 | 2 | 10.8s |
| 03:53 | 18 | 3 | 10.9s |
| 04:15 | 13 | 8 | 11.4s |
| 04:36 | 22 | 1 | 10.1s |
| 04:37 | 12 | 0 | 2.5s |
| 04:38 | 9 | **9** | 12.9s |
| 04:39 | 2 | 2 | 10.3s |
| 04:43 | 3 | 2 | 10.2s |

A healthy call on the same logs takes **2ms to 200ms**.

The error is always `context deadline exceeded` / `request_timeout`.

### What it was NOT — each of these was tested, not assumed

**Not the food/micros import crons.** That was my first conclusion and it was
wrong. `import_off_bulk` and `backfill_off_micros` were each running ~45s on a
60s schedule, so they overlapped and did saturate the connection pool — that is
real and worth fixing on its own. But the auth timeouts **continued after both
crons were disabled and the database was left idle for several minutes**. I
reported the fix before I had verified it held. Correcting that publicly at
23:40 was right; announcing it at 23:15 was not.

**Not database load.** `pg_stat_activity` during the timeouts: 1 active
connection, nothing waiting on IO, no long transactions.

**Not the auth tables.** 33 rows in `auth.users`, 1,449 in `auth.refresh_tokens`,
264 kB and 800 kB respectively. There is nothing there to be slow.

**Not disk.** Database 917 MB total, `food_catalog` 853 MB of it.

**Not the project.** Supabase reports `ACTIVE_HEALTHY` throughout — which is
itself a finding: **their own health check did not notice.**

**Not this session's queries.** The timeouts start at 03:32 UTC. This session's
first database query was 03:49.

**Requests from Dustin's home IP succeeded in 2ms while requests from Vercel's
IPs timed out in the same minute.** That pattern points at the path between
Vercel and Supabase auth, or at per-origin throttling inside GoTrue. It is not
something we can fix from this side.

---

## PART 2 — WHAT WAS SHIPPED DURING THE INCIDENT

### `856a8f6` — a slow dependency must not mean a dead app

`src/lib/authTimeout.ts`. The middleware awaited `auth.getUser()` with **no
time limit**, so a slow answer did not produce a slow page — it produced no
page, because Vercel killed the whole invocation at 25s.

Both middleware calls are now capped at 4s (Supabase's own deadline is ~10s;
waiting past that only delays a failure that has already happened). On a
non-answer the request is handed to the page.

**Passing through is safe, and this is the part worth being sure about.** The
middleware is not the security boundary and never was. `(app)/layout.tsx` and
every page under it independently call `auth.getUser()` and redirect to
`/login` when there is no user, and every table is behind RLS keyed to the JWT.
The middleware saves a round trip and routes first-run clients to `/welcome`.
Skipping it costs those conveniences for one request; it grants nothing.

It deliberately does **not** redirect to `/login` on a timeout. A timeout is not
a signed-out user, and treating it as one logs people out at random — the same
fault `redirectKeepingSession` was written to fix, arrived at from a different
direction. "Did not answer" stays distinct from "answered: nobody" all the way
through, and that distinction is what the tests protect.

### `dfb5566` — stop asking a struggling service questions it does not need

The `getUser()` call sat **above** the public-path allowlist. So every
allow-listed request paid a round trip to auth and discarded the answer.
`/api/` is on that list and is **not** excluded by the matcher — so every API
call the app makes, every meal logged, every set saved, every poll, spent an
extra GoTrue request in middleware before its route handler authenticated
properly. Same for `/sw.js`, `/manifest.webmanifest`, every icon.

Not the cause. But it is the half of the load we control, and it was several
times larger than it needed to be.

### Also changed

Both import crons (`off-bulk-import`, `off-micros-backfill`) and
`video-duration-measure` are **disabled**, not throttled. They are not the
cause, but with auth already unwell there is no reason to add load. Re-enable
with:

```sql
select cron.alter_job(36, schedule:='* * * * *', active:=true);  -- off-bulk-import
select cron.alter_job(39, schedule:='* * * * *', active:=true);  -- off-micros-backfill
select cron.alter_job(34, active:=true);                          -- video-duration-measure
```

Food catalog stands at **1.54M rows**, up from 1.43M at the last handoff.

---

## PART 3 — THE BACKUP SYSTEM

Four pieces. They are independent, they are listed cheapest-first, and the
first two are worth doing whatever else is decided.

### 1. An error screen that belongs to Symmetry — half a day

**The problem:** when something fails, a client sees Vercel's white page with
`MIDDLEWARE_INVOCATION_TIMEOUT` on it. A client who sees that does not think
"the server is having a moment". They think the app is broken, or that they
broke it, and some of them will not come back to it that day.

**What to build:** `error.tsx` and `global-error.tsx` at the app root, plus a
Vercel custom error page for the gateway-level failures Next never sees. Dark
background, Symmetry logo, and three sentences: something is wrong on our end,
your data is safe and nothing you logged is lost, try again in a minute. A retry
button. No error codes.

**Why first:** it is the cheapest thing here and it changes what an outage feels
like from "the app is broken" to "the app is having a bad minute". It does not
reduce downtime by one second, and that is fine — most of the damage an outage
does to a coaching business is not the downtime.

### 2. A monitor that tells Dustin before a client does — half a day

**The problem:** this outage ran from at least 03:32 UTC. It was found at 23:00
CT by Dustin opening the app. Nothing else would have found it. If it had
started at 5am it would have been found by a client at 6am, mid-workout.

**What to build:** an external check — Better Stack, Cronitor, UptimeRobot, all
free at this size — hitting a `/api/health` endpoint every minute from outside
Vercel. The endpoint does the one thing that actually matters: a real auth call
and a trivial database read, with its own short timeout, returning what worked
and what didn't. Alert to Dustin's phone after two consecutive failures, not
one, so a single blip stays quiet.

**It must be external.** A monitor that runs inside the thing it is monitoring
tells you nothing on the day it matters.

Nice-to-have on the same endpoint: a public status page, so "is it just me?" has
an answer that doesn't require texting Dustin.

### 3. Read-only survival on the phone — several days, and the real fix

**The problem:** when the server is unreachable, a client standing in the gym
has nothing. Not a stale workout, not yesterday's plan — nothing. The single
most important thing this app does is tell somebody what to do today, and that
is exactly what it stops doing.

**What to build:** the service worker already exists (`/sw.js`). Extend it to
cache, per client:

- today's and tomorrow's workout, with movements, sets, reps and last-used loads
- today's meal plan and macro targets
- the last 30 days of their own logs, for the progress screens

Then: reads serve from cache when the network fails, with an honest "showing
what we had at 6:14am" banner. Writes queue locally and flush when the
connection returns — this is the harder half, and it needs a client-generated
id on every write so a flush that runs twice cannot double-log a session. That
constraint is not hypothetical here; duplicate-logging has been a recurring
fault in this codebase and the ship rule about idempotency exists for a reason.

**Do this after 1 and 2**, and do it as its own piece of work with its own
tests. Half-built offline sync is worse than none: it produces confident wrong
data instead of an honest error.

### 4. Stop the importer and the app sharing one database — ★ THIS IS THE CAUSE ★

**Updated 06:47Z.** This was written as a precaution and is now the top item. A
job that scans a million rows sits on the same Postgres instance your clients'
logins depend on, and on 15 Aug it drained the instance's CPU credits and took
the app down for most of a night. It is not a theoretical interaction.

**Three options, cheapest first:**

- **A maintenance window.** Imports run 02:00–05:00 CT only. Free, one line, and
  it removes the interaction entirely. The catalog fills more slowly; the
  catalog is not urgent.
- **Bigger instance.** Money, no code. Buys headroom for everything, including
  the AI work, which is about to get heavier.
- **Separate the bulk data.** The food catalog is 853 MB of the 917 MB database
  and shares nothing with client data except being read. It could live in its own
  project. Cleanest, most work, and it is the one that stops this class of
  problem permanently.

**Recommendation, revised now that this is the known cause: pick the instance
size FIRST, then the window.** A maintenance window alone still spends the same
credits, just at 3am — which is fine until the day an import overruns or a
client trains early. The honest question is whether this app should be running
its production database on a burstable instance at all now that it holds 1.6M
rows and 35 people's training.

Cheapest correct answer is probably: **window the imports now** (free, one line,
stops the bleeding), **and move the food catalog off this project** when there
is time — it is 853 MB of the 917 MB database, it is read-only reference data,
and it shares nothing with client records.

---

### 5. Take Supabase Auth off the hot path entirely — NEEDS DUSTIN'S SIGN-OFF

**This is the strongest fix on the list and it is the reason tonight's outage
was possible at all. I have deliberately not shipped it unsupervised, because
it touches the security boundary and that is not a thing to change at 5am
without the owner awake.**

**The problem.** `supabase.auth.getUser()` makes a **network call to Supabase's
auth service on every single request**. That is by design — it asks the server
to validate the token rather than trusting the cookie. The cost is that
Supabase Auth being reachable and fast is a hard requirement for the app to
render *anything*. Tonight it was neither, and there is no amount of retrying
that fixes a dependency in the request path.

**The alternative.** The session cookie already contains a signed JWT. Its
signature can be verified **locally**, in the app, with no network call at all —
either against the project's JWT secret, or, better, against Supabase's
published JWKS using asymmetric signing keys, which is what Supabase itself now
recommends for exactly this reason. A locally-verified token gives you the user
id and the expiry, which is everything the middleware and the page-level guards
actually need.

**What it changes:**

- Auth stops being a network dependency on the read path. A Supabase auth
  outage becomes invisible to anyone already signed in.
- Page loads get faster for everybody, every time — the 2–200ms healthy call
  disappears too, not just the 12-second sick one.
- Signing IN still needs Supabase to be up. That is correct and unavoidable.

**The honest trade-off:** a locally-verified token stays valid until it expires,
so a session revoked server-side (a password change, a forced sign-out) keeps
working for up to the token lifetime — an hour by default, and tunable. For an
app with 35 known clients and one trainer, that is a very small risk against a
whole-app outage. For an app holding health data it is still a real one and it
is Dustin's call, not mine.

**Why it matters beyond tonight:** the current design means *every* page load
of *every* client depends on a third-party service answering in under a few
seconds. Tonight it did not. Nothing in the app was broken, and none of the
1,032 tests could have caught it, because the failure was not in the code.



1. **Local JWT verification** (#5) — say yes or no first, because it is the one
   change that makes tonight's failure mode structurally impossible rather than
   merely survivable. Needs a decision, then about a day.
2. **Monitor** (#2) — because right now nobody knows about an outage until a
   client is standing in the gym looking at a white screen.
3. **Error screen** (#1) — because it is cheap and it changes what the bad
   minutes feel like.
4. **Maintenance window** (#4, option one) — one line, removes a live risk.
5. **Offline survival** (#3) — the real fix for the phone, with its own tests.

Items 2–4 are roughly a day together. Item 1 is a day and a decision. Item 5 is
a week and it is worth it.

**If only one thing gets done: #5.** Everything else makes the outage kinder.
That one makes most of it not happen.

---

## PART 5 — IF IT IS STILL BROKEN IN THE MORNING

**Read the root-cause box at the top first.** If the CPU measurement has
recovered (`select count(*) from generate_series(1, 3000000)` back under a
second) and the app is fast, there is nothing to raise with Supabase — the
instance was throttled because we exhausted it, and it recovered because we
stopped. The ticket below is only worth sending if the CPU measurement is still
several seconds with the imports off and the database idle, which would mean
something is consuming the instance that we have not found.

Supabase support ticket. Project `mkfiginpiesospsnktea`, region us-east-1.

> Auth service `GET /user` is returning 504 `context deadline exceeded` for
> roughly half of all requests, with durations of 10–65 seconds, since at least
> 2026-08-15 03:32 UTC. A healthy call on the same project takes 2–200ms.
>
> The database is idle (1 active connection, no IO waits), all cron jobs are
> disabled, `auth.users` has 33 rows and `auth.refresh_tokens` 1,449. Requests
> from a residential IP succeed in 2ms while requests from Vercel's IPs time out
> in the same minute. The project reports ACTIVE_HEALTHY throughout.
>
> Example request ids: `01a003b6-fbd7-7025-a2f5-b671687ac6bc`,
> `01a003b6-77e0-7e64-89d5-1db6f730028b`,
> `01a003b6-74f0-7d74-9008-ea5fa654b768`.

The timing table in Part 1 is the attachment.
