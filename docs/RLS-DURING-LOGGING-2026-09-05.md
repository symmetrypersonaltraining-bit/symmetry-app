# "new row violates row-level security policy for table workout_logs"

Greg Lennon's session, Sat 5 Sep, ~9:14am. Cleared on its own within a minute.
**Diagnosis only — nothing changed, nothing run.**

---

## What was actually happening

**The phone was signed in as Dustin, in client view for Greg.** That is not a
guess:

- Greg Lennon's client row has `auth_user_id = null` and `email = null`. **He
  has no login.** So `my_client_id()` can never return Greg, and the
  `client_own_workout_logs` policy can never pass for him.
- The only other policy on the table is
  `trainer_all_workout_logs` → `trainer_can_see_client(client_id)`, and Greg's
  `trainer_id` is Dustin.
- And a `workout_logs` row for Greg **was created successfully at 09:03:32**,
  eleven minutes before the screenshot, for that exact day
  ("W1-3 — Sat Coordination & Upper"). So the session was authorised then.

## Why it failed at 09:14 and worked again after

Both policies resolve through `auth.uid()`:

```
my_client_id()          → select id from clients where auth_user_id = auth.uid()
trainer_can_see_client  → is_trainer() → my_trainer_id() → auth.uid()
```

If the access token is expired **at the moment the request is made**,
`auth.uid()` returns null and **both policies fail at once** — which is exactly
the error, and exactly why it affects a trainer and a client identically.

The token expires because nothing keeps it alive while the phone is asleep.
`src/lib/supabase/client.ts` is `createBrowserClient(url, key)` with no options,
so the session relies on supabase-js's background refresh timer — and a phone
that locks between sets freezes that timer. The first request after unlocking
goes out stale, fails, supabase-js then refreshes, and the next tap works.

That is precisely "was just for a minute", and the logger already knows the page
freezes — its own comment at line 391:

> "on some phones the interval is exactly what was frozen, and this is the first
> thing that fires on wake."

**Nothing in the app has ever handled this.** Across all of `src/`: no
`onAuthStateChange`, no `refreshSession`, no `getSession()` used to refresh, and
no handling of `42501`, `PGRST301`, "row-level security" or "JWT expired"
anywhere.

## Why Greg saw the raw Postgres sentence

`WorkoutLogger.tsx`, the `logSet` catch:

```ts
setCompleteError(
  err?.message ||
  "That set didn't save — check your connection and tap it again.",
);
```

`err.message` first. Any database error the file does not specifically recognise
— and it only recognises the stale-exercise `23503` case — goes to the client
verbatim. The human sentence underneath it is only ever used when Postgres
returned no message at all.

---

## The fix — three parts, none of them run

### 1. PREVENT — refresh the session on wake

The one that actually stops the error rather than papering over it. On
`visibilitychange` → visible, call `supabase.auth.getSession()`, which refreshes
an expired token. Then the first tap after unlocking already has a live token.

App-wide, not just the logger: nutrition logging, weigh-ins and every other
write have the identical exposure. The logger already registers
`visibilitychange` handlers in two places, so the pattern is established.

### 2. RECOVER — refresh once, retry once, silently

A shared helper wrapping writes:

```
withFreshSession(fn):
  r = await fn()
  if r is auth-shaped failure:          // 42501 | PGRST301 |
                                        // /row-level security|JWT expired/i
      await supabase.auth.getSession()  // refreshes if needed
      r = await fn()                    // exactly once more
  return r
```

One retry, not a loop: if the second attempt fails the session is genuinely
gone and the client needs telling, not spinning. Where it matters most is
`ensureWorkoutLog` and `logSet`, because those are the writes a person is
standing in a gym waiting on.

### 3. NEVER SHOW RAW DATABASE TEXT

Invert that fallback. Recognised cases keep their specific wording (the
stale-exercise reload already does this well). Auth-shaped failures that survive
the retry get something true and actionable — "Signing you back in — tap that
set again, nothing has been lost." Everything else gets the existing human
sentence. `console.error` keeps the real message for diagnosis.

The typed set is already safe: `saveTypedSet` writes on blur and the
localStorage draft holds it, so a failed tick loses nothing. That is worth
saying in the message, because from the client's side it looks like loss.

⚠️ Parts 1 and 3 touch `WorkoutLogger.tsx`, which is off limits without
per-item permission. Part 2 can live entirely in a shared lib.

---

## Separate finding — Greg has no login

`auth_user_id` and `email` are both null on his client row. Celeste is the only
one in that family with a login (`celeste.lennon180218@gmail.com`, last sign-in
12 Jul).

So today Greg's sessions can only be logged by Dustin, from a trainer session.
If Greg or Celeste is ever meant to log on his behalf it will fail **every
time**, not for a minute — Celeste's own account would be refused by both
policies, because she is not a trainer and `my_client_id()` returns her, not
Greg.

That is a decision rather than a bug: either Greg gets his own login, or the app
needs a way for one client to log for another. Nothing in the schema supports
the second today.
