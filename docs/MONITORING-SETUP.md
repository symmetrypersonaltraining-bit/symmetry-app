# Turning on the monitor — 10 minutes, and it needs you

The endpoint is built and live. What's left needs a sign-in, which I can't do.

**The URL:** `https://symmetry-app-omega.vercel.app/api/health`

Open it now on your phone. Here is a real reading, taken live at 11:20 UTC:

```json
{"ok":true,"sha":"d86fb5a","checks":{"auth":{"ok":true,"ms":19},"db":{"ok":true,"ms":53}},"ts":"2026-08-15T11:20:25Z"}
```

**What the numbers actually look like**, measured over 45 minutes this morning
rather than guessed:

| when | auth | db |
|---|---|---|
| first call after a deploy — genuinely cold container | 706 ms | **1179 ms** |
| 8 seconds later | 387 ms | 506 ms |
| 6 seconds later | 187 ms | 180 ms |
| 3 seconds later | 19 ms | 53 ms |
| after 2 minutes idle | 265 ms | 360 ms |
| after 9 minutes idle | 255 ms | 547 ms |
| after 19 minutes idle | 252 ms | 425 ms |

Warm is tens of milliseconds. Any gap of a few minutes costs a few hundred, and
**it stops there** — a nineteen-minute gap was no worse than a two-minute one.
Everything above is comfortably inside the 1500 ms amber line.

The one case that can legitimately trip amber is the very first call after a
deploy, when the container is cold for real. If you see a single amber right
after something ships, that's what it is.

> **Correcting myself.** I first wrote that a fifteen-minute check interval
> would "sit near amber forever". Then I measured a nineteen-minute gap and it
> came back at 425 ms. That claim was wrong — extrapolated from one cold reading
> before the evidence was in, which is a habit I spent last night regretting.
> The 1-minute frequency below is still right, but for a plainer reason: it's
> how fast you find out. At fifteen minutes an outage gets a fifteen-minute head
> start on you.

---

## What to do

1. Go to **betterstack.com/uptime** and sign up (free tier is plenty — it does
   30-second checks and phone push).
2. **Create monitor** → paste the URL above.
3. Set these four things, and only these:

   | Setting | Value | Why |
   |---|---|---|
   | Check frequency | **1 minute** | how fast you find out; last night ran hours before anyone noticed |
   | Request timeout | **10 seconds** | ours is 5s, so we fail first and tell you *which* half broke |
   | Confirm before alerting | **2 failures** | one blip at 3am is not worth waking you |
   | Alert via | **phone push** | email you'd read in the morning, which is the current situation |

4. On the same page, turn on **"Alert when HTTP status is not 2xx"**. That's the
   whole trigger — the endpoint returns **503** when something is wrong, so the
   status code alone is enough. You don't need to configure keyword matching.

That's it. Nothing else needs setting.

---

## What the answer means when you look at it

| What you see | What it means |
|---|---|
| `"ok":true` and both `ms` under ~300 | normal |
| `"ok":true` with `"slow":true` on a leg | working, but degrading — **this is the shape last night started as** |
| `"ok":false` with `"timeout after 5000ms"` | the dependency is alive but not answering — last night's actual failure |
| `"ok":false` with `"http 5xx"` | the dependency is returning errors |
| `"ok":false` with `missing env` | a deploy lost its Supabase keys |

`checks.auth` is Supabase Auth. `checks.db` is the database. **The point of
splitting them is that you'll know which one to raise a ticket about without
doing any of the digging I did last night.**

---

## Why the endpoint fails on slow, not just on broken

Worth knowing, because it's the non-obvious part and it's the difference between
this being useful and being decoration.

Nothing errored last night. Auth returned the *correct* answer — 10 to 65
seconds later. The database answered every query it was given; it had just taken
4.6 seconds to plan a query over 31 pages. Your clients got 504s the entire time.

A normal uptime check asks "did the server answer". It would have said yes, all
night, while the app was unusable. So this one has a deadline and treats blowing
it as a failure. That's the only reason it would catch a repeat.

---

## What this does not do

It watches the app's **dependencies**. It does not watch:

- whether a specific client can log in
- whether a workout saves correctly
- CPU credits on the database instance — **that was the actual root cause**, and
  it's only visible in the Supabase dashboard. Nothing external can see it.

The last one is the gap worth closing next, and it needs the dashboard question
answered first (which tier, and what the credit balance looks like).

Sections 3, 4 and 5 of `docs/OUTAGE-2026-08-15-AND-RESILIENCE-PLAN.md` are the
rest of the backup system — offline reads on the phone, separating the importer
from the app database, and the auth change that's already shipped. This is
section 2, and it's the cheapest of them by a distance.
