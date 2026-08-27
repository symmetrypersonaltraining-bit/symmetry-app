# Fix queue — walk through this with Dustin before touching anything

> **⚠️ SUPERSEDED AS THE DECISION RECORD — 27 Aug, midday.**
> `MASTER-LIST.md` in this folder is now the authoritative list: all **70**
> findings numbered, every figure re-verified against live data, and a
> `DECISION:` slot under each. Dustin's answers go **there**. This file stays as
> the plain-English walkthrough of the top items and as the record of how the
> queue was first framed.

**How to use this document.** Dustin, 27 Aug: *"i need each explained to me first
so i understand exactly what's going on and can confirm how i want it to function
before we start."*

So: go through this **in order, one item at a time.** For each, give him the
plain-English version, then stop and get his answer to the ❓ before moving on.
Do not batch them. Do not start fixing until he has been through the list.

Items are tagged:

- **[MECHANICAL]** — unambiguously broken, one correct fix, no design choice.
  Still explain it, but the ❓ is just "go ahead?"
- **[YOUR CALL]** — the behaviour is a genuine choice and he has to make it.
- **[PERMISSION]** — touches a file under a standing rule. Cannot proceed
  without an explicit yes.

Full evidence for every item: `docs/audit/FULL-APP-AUDIT-2026-08-27.md`.

---

# Group 1 — stop the bleeding (do these first, overnight-safe)

## 1.1 Cancelling a workout destroys the sets of a *finished* workout [PERMISSION]

**What's happening.** A client finishes a session, then taps Cancel on the way
out — or reopens the finished workout later and taps Cancel, which is always
offered because the "already complete" flag doesn't survive a page reload. Every
set they logged is deleted. The workout row survives and still says complete, so
the schedule and your adherence numbers look fine while the training data is gone.

**Why.** `discardSession` deletes the sets with no guard, then deletes the parent
row guarded by `completed = false`. The guard is on the wrong statement. Postgres
doesn't complain when a delete matches nothing, so the code thinks it worked.

**Damage so far.** 12 sessions: Jennifer 26 Aug (27 min), Cheyenne Martin 22 Aug
(50 min), Sara Prince ×4, Claudine Ocon 1 Aug (63 min), Lauren, Celeste, Stacie
Weever, Lesly Spencer. **The set data is not recoverable.**

**What I'd do.** Refuse to discard a workout that is already complete — the
button shouldn't be there at all on a finished session. Guard the set delete the
same way the parent is guarded, and check the delete actually matched before
reporting success.

❓ **This is in `WorkoutLogger.tsx`, which is off limits without your say-so. Do I
have permission for this specific fix?** And: should Cancel be *hidden* on a
completed workout, or still shown but refuse with a message?

## 1.2 An unauthenticated URL on your domain redirects anywhere [MECHANICAL]

**What's happening.** `symmetry-app-omega.vercel.app/api/set-client-mode?redirect=<anywhere>`
sends whoever clicks it to any site on the internet, with no login required. I
tested it against production. It also sets a browser cookie that flips the app
into client mode for 7 days — and that cookie is of a type the in-app toggle
physically cannot delete, so a trainer who hits that link sees client screens for
a week while the menu still says "Trainer View."

**Why it matters.** A link that looks like it's from your app and lands somewhere
else is the standard shape of a phishing attack, on an app holding health data.

**What I'd do.** Delete the route. Nothing in the app calls it — every real
toggle sets the cookie from the page itself.

❓ Go ahead?

## 1.3 Any trainer can delete all your feedback [MECHANICAL]

**What's happening.** All 66 of your own feedback entries — your product backlog,
plus clients' words about their food and bodies — can be read *and deleted* by
every trainer account, including the five testers added on 22–23 Aug. I proved
the delete under a tester's login (rolled back).

**What I'd do.** Restrict those rows to you. Split read from delete so nobody but
you can destroy them.

❓ Should the testers be able to *see* your feedback list at all, or only their own?

## 1.4 The challenge board names 23 clients who never opted in [MECHANICAL]

**What's happening.** Every client's home screen shows a ranked board of 29
people by **full name** with their session counts. Only 6 have opted in. The two
API routes honour the opt-in correctly; the component actually on screen doesn't,
and it shows full names rather than first names.

**What I'd do.** Filter the board to opted-in clients and show first names only,
matching what the rest of the app already does.

❓ Go ahead? And should the header count ("of 29") show the whole room or just
the people competing?

---

# Group 2 — money

## 2.1 Client invoices show arithmetic that doesn't add up [MECHANICAL]

**What's happening.** Tim Yancey's phone says *"8 sessions × $70 = $490."* 8 × 70
is 560. Sharon Rambo's says *"6 sessions × $75 = $300."* That's 450. The totals
charged are correct — it's the explanation that's wrong, because the invoice
always describes the bill as "sessions trained × rate" no matter which billing
type the client is actually on. Your own editor shows Tim the correct line
($840 − 5 cancelled × $70 = $490), so the two screens contradict each other.

**What I'd do.** Have the invoice describe the billing type the client is
actually on — flat, monthly-less-cancellations, or per-session.

❓ Go ahead? Also: do you want clients to see the cancellation deduction spelled
out ("$840 − 5 missed × $70"), or just the final figure?

## 2.2 Christine Latham was charged $640 twice in seven days [YOUR CALL]

**What's happening.** Reminders due 22 Jul and 29 Jul, both $640, on a $640/month
rate. Both marked paid. Your calendar has an extra instance of her recurring
payment marker, and the app generated a second invoice from it. Her 22 Jul
session is also counted in two billing cycles.

**What I'd do about the future.** Refuse to generate a second invoice whose cycle
overlaps one that already exists.

❓ **What do you want done about the $640 itself?** That's a real client and a
real overcharge — I can't decide that.

## 2.3 Her current invoice is $80 short [YOUR CALL]

Billed $320 (4 × $80) under the rule that was in force on 31 Jul. Under the rule
you set on 20 Aug it should be $400. It's already 5 days past due, and the
nightly recalculation deliberately won't touch an invoice that's been sent.

❓ Correct it to $400, or leave it and let the next cycle be right?

## 2.4 Billing cycles can gap or overlap [MECHANICAL]

Cycles are worked out by counting backwards from the due date rather than reading
the previous invoice. When a due date shifts off its normal cadence — Sharon
Rambo's did — you get a 2-day overlap (a session billed twice) and a 2-day gap
(days in no cycle at all).

❓ Go ahead?

## 2.5 Social-media reminders are being stored as payments [MECHANICAL]

Calendar events like *"📱 POST STORIES — Perfect Day Macro Log"* are being filed
as payment markers against Jennifer Day and Stacie Weever, both live billed
clients. Nothing has broken yet only because both already had an open invoice
blocking generation. If one of these lands first in a cycle, it generates a
full-fee invoice dated on the post day.

❓ Go ahead? (Fix: require an actual dollar amount before treating a calendar
event as a payment.)

---

# Group 3 — the AI stating numbers

This is your *"100% accurate at all times, period."* Four surfaces were never
converted when meal-edit and parse were fixed on 26 Aug.

## 3.1 Meal photos: 1,109 rows of guessed nutrition, 18 clients [YOUR CALL]

**What's happening.** The photo route asks the model to *estimate the macros* and
saves whatever comes back. It never checks the food database. The numbers
contradict themselves — one row says 3/4 cup of egg whites is 203 g of protein
(it's about 19). A banana logged with 14 g of fat. Four slices of sausage pizza
with zero fat. 58 rows are off by more than 10%.

Those numbers are in your clients' logs now, and every calorie bar, weekly
average and coach card for those days is built on them.

**What I'd do.** Let the model do what it's good at — *identify* what's on the
plate and how much — then look every item up in the food database and total it in
code, exactly like the "say what you ate" path now does.

❓ Two questions. **First: what do you want done with the 1,109 existing rows?**
Leave them, flag them as estimates, or recompute what can be recomputed. **Second:
when a photo shows something the database doesn't have, should it log nothing and
ask, or log the item with no macros so at least the meal is recorded?**

## 3.2 The meal-edit AI saves wrong macros into My Meals [MECHANICAL]

Same fault, worse consequence. It logged "Fairlife Core Power, 1 bottle → 42 g
protein". The real product row in your database says 26 g. That's 16 g of protein
nobody ate — and because the same action saves the item to My Meals, it can be
re-logged forever. 430 AI-estimated items across 318 foods, 14 clients.

❓ Go ahead? Same question about the existing saved meals — clean them or leave them?

## 3.3 Brooke's plan is still 38 g over her protein target [MECHANICAL]

She told you on 23 Aug: *"AI told me 160g of protein but is giving me 198g."* Her
live plan today is still 198 g against a 160 g target. The plan builder asks the
model for the totals, and when the check fails it keeps the plan anyway.

**What I'd do.** Let the model pick foods and amounts; total the plan in code from
the database and rebuild if it misses the target, rather than shipping the miss.

❓ Go ahead? And should Brooke's plan be rebuilt now, or left until you next
review her?

## 3.4 Something is running in production that isn't in the code [YOUR CALL]

A nudge sweep has made **451 model calls**, about 34 a day, writing messages to
clients. It's invisible to your $95 spend cap and to the AI health page. It's
provably an old deployed build — it writes a status string that was removed from
the code on 13 Aug.

❓ **This needs you.** It's writing to clients from a build nobody controls. Do
you want it stopped immediately (I can disable it at the database level tonight),
or investigated first to see what it's been sending?

## 3.5 `verify-food` can overwrite your food database [MECHANICAL]

You asked whether this one is a legitimate exception. **It isn't.** A legitimate
exception would *create* a food the database lacks. This takes an existing row and
overwrites its calories and macros with model output, then stamps it "verified" —
in the table every other AI surface now reads. No backup. It has never been called,
but it's live and any logged-in client could trigger it.

❓ Delete it, or make it write to a review queue you approve?

---

# Group 4 — the truncation family (all one bug, several places) [MECHANICAL]

The database returns at most 1,000 rows per request and says nothing when it cuts
you off. These reads ask for more and silently get 1,000.

- **Your trainer calendar has shown nothing since 29 July.** 4,147 workouts in
  the window, 1,000 arrive, the last is dated 29 Jul. 3,136 rows across 35
  clients — including today and everything future — never load. *This is the same
  fault you reported on 24 Aug, in a second place nobody checked.*
- **Your appointments stop at 23 Nov** for the same reason.
- **The Workout Library shows "0 exercises" on 278 real workouts**, and a wrong
  count on 352 more. Only 6 of 682 are right.
- **The Program page day picker drops 167 of 1,167 workouts**, and *which* 167
  changes between page loads.
- **"Swap in a workout from the library" reaches 171 of 600 names.** Typing "push"
  finds 1 match when 24 exist.

**What I'd do.** Count in the database instead of pulling every row to count in
the browser, and page the reads that genuinely need all the rows. The tooling to
catch these is already written (`scripts/audit/static-audit.mjs`).

❓ Go ahead on all of them?

---

# Group 5 — notifications

## 5.1 Push reaches 3 people out of 29 [YOUR CALL]

**What's happening.** One client (Lauren) has notifications enabled in her
browser. Two phones have the app-store version. That's it. When you post in the
group or message a client, **26 of 28 get nothing on their phone.** The only place
to turn it on is a button below the fold on the Settings page that nobody has
found.

**What I'd do.** Put a dismissible prompt where clients actually are — the home
screen — and add a counter on your side reading "N of M clients can be reached",
so this can never be invisible again.

❓ How pushy do you want that prompt? Once and never again, once a week until
they act, or a persistent card until dismissed?

## 5.2 The bell and the flashing tab ignore notification settings [MECHANICAL]

Jennifer's complaint, still true somewhere else. She and Claudine both switched
group chat off. Both have an unread group message right now — from the *bot* —
turning their bell red and flashing their Messages tab. I fixed the banner on
26 Aug and missed the other three surfaces.

❓ Go ahead? (Fix: one preference check that every surface reads, instead of four
copies.)

## 5.3 Four weeks of nightly AI reports have never been readable [YOUR CALL]

The nightly digest of who got nudged and who was escalated has been written to
the database every night since 31 Jul, into a message thread that no screen can
open. 27 of them.

❓ Do you want that digest somewhere you'd actually see it — a card on your
dashboard — or should it stop being written?

---

# Group 6 — numbers that disagree with each other [MECHANICAL]

- **Three screens show three different streaks.** Today, for you: home says 10,
  the card beneath it says 4, Progress says none. Four separate implementations,
  each with different rules about rest days and cardio.
  ❓ *What should a streak actually count?* My reading of your 26 Jul note is:
  anything scheduled that gets logged, and a rest day doesn't break it. Confirm.
- **Body Fat shows "—" for six clients who have readings** — Lauren, you,
  Jennifer, Claudine, Robert Miller, Jerry Bourgeois. The profile reads the newest
  *row* rather than the newest *reading*, and most weigh-ins are weight-only.
- **Lauren's Body Fat / Lean Mass / Fat Mass charts say "Not enough data"** at
  every range. Her 22 Jul report, never actually fixed — the range filter runs
  twice, so the chart only ever gets one point.
- **The same weight tile shows +13.4 lbs and its own expanded view shows +18.6**,
  because the two range controls default differently.

❓ Go ahead on all four?

---

# Group 7 — food and servings

## 7.1 "Add a banana" logs 1 cup mashed — 200 calories instead of 105 [MECHANICAL]

**This one is mine, from 26 Aug.** My serving fix takes the first countable
serving on the row, and the database stores them alphabetically, so it's almost
always a cup. Almonds log as 828 calories. Cheddar as 533. 1,996 database rows
default to a cup.

**What I'd do.** Prefer a piece — medium, small, each, slice, bagel — over a cup,
and fall back to volume only when there's no piece.

❓ Go ahead?

## 7.2 Adding a food to a planned meal throws away the amount and unit [MECHANICAL]

Your 30 Jul request ("type the amount and change the unit") and your 26 Jul chili
crisp complaint are both fixed at the point of *picking* the food — and then
undone one step later when it's saved to the meal, which keeps only the name and
three macro numbers. 283 of 283 saved rows prove it. All nutrients are dropped too.

❓ Go ahead?

## 7.3 Plan items still can't be typed or re-united [MECHANICAL]

The *added-food* row got the typed box and unit dropdown yesterday. The rows above
it — your actual plan items — didn't. Changing a 300 g item to 170 g is 13 taps,
and there's no way to switch it to ounces.

❓ Go ahead?

## 7.4 Manual search still puts junk above the checked data [MECHANICAL]

Searching "banana" by hand: Robby sees three crowd-entered rows at 242 cal / 14 g
fat before the real one. You see the verified USDA banana **15th**. The AI path is
fine — it's only the typed search.

❓ Go ahead?

## 7.5 Nutrients are empty for anyone eating their plan [YOUR CALL]

Your 4 Aug *"need to track full nutrients everywhere"* is half-built. None of the
8,789 verified whole-food rows carry a micronutrient panel — only the branded
ones do. So a client eating chicken and rice sees an empty nutrient screen.

❓ Filling this means a backfill job over the food database. Worth doing, or park it?

---

# Group 8 — programming gaps [YOUR CALL on the first]

- **Four people who signed up on 23 Aug have no programming at all** — Alan Meier,
  Ian Christman, Justin Ray, Oliver Gergelj. No assignments, no workouts, nothing.
  They're invisible to both coverage checks: one excludes self-coached clients, the
  other only looks at clients who already have workouts.
  ❓ *Are these four testers you expect to be empty, or real people waiting on
  programming?* That changes whether this is a bug or a to-do.
- **Brooke Orton runs out tomorrow** and no dashboard surface says so, for the
  same reason. She also has two live sessions belonging to a programme she was
  moved off.
- **Two supervised sessions today** (Troy Schnitzler, Tyler Dorsett) don't appear
  in Today's Sessions, and a cancelled session is still counted in the "6
  scheduled" badge.

---

# Group 9 — everything else

Lower severity, no decisions needed unless flagged. Full detail in the audit report.

- The weekly-focus **approval step no longer exists** — AI copy publishes straight
  to 35 clients. Your standing rule is approval before client-live. **[YOUR CALL:
  restore the approval queue, or accept auto-publish?]**
- The bench press video you asked to be removed is back, as a different
  third-party tutorial. **[YOUR CALL: watch it and tell me keep or clear.]**
- Madeleine Coker's date of birth is recorded as 4 Aug **2026** — she's 23 days
  old, and the birthday bot will announce it.
- The Google Calendar sync fails about half its runs on a duplicate-key collision.
- Challenge scoring differs between the client board and your API; three people
  are ranked on a challenge they never joined.
- **There is no daily calorie/macros chart anywhere** — the component is built,
  correct, and mounted nowhere, while the Nutrition screen tells clients to go
  find it on Progress. **[YOUR CALL: mount it on home, on Progress, or both?]**
- Charts have no touch interaction (your 26 Jun request), and the weight chart
  blocks scrolling over itself.
- A weigh-in can only be deleted by the client, and only their last five — your
  18.4 lb jump between 2 and 16 Aug isn't removable from the trainer app.
- 23 further low-severity items in the audit report.

---

# Before the overnight run

Once he has been through the list:

1. Write down his answers **in this file** under each ❓ so the run has them.
2. Order the work by his priorities, not mine.
3. **Every fix must be proved against live data before it is called done** — run
   the query, read the row back. Add a check to `supabase/audit/live_audit.sql`
   and confirm it goes red against the broken version first.
4. Ship in small commits through the bridge. Never leave work only in the sandbox.
