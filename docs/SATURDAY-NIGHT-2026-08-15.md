# Saturday night — what shipped, what needs you, what I could not do

Written while you were out. Everything below is either **done and live**, or
**blocked with the reason named**. Nothing is "in progress but probably fine".

---

## ⚡ READ THESE FOUR FIRST

1. **The food imports cannot finish tonight, and it is not the database.** Both
   are rate-limited by Open Food Facts (HTTP 429). I raised the batch 5× to try
   to hit your deadline and throughput went *down*. Reverted. Realistic
   completion: **~74 hours** for the catalog, **~180 hours** for micronutrients.
   Detail in §4.
2. **Dylan's app would have shipped broken, and it was my fault.** I applied a
   schema change by hand to your live database with no migration file. His
   instance would have shown an empty meal library with nothing in any log.
   Fixed, with a test. Detail in §3.
3. **The AI's workout adjuster has been reporting changes it never made.** Not
   a silent failure — it counted the failed writes and told you "Applied 3
   changes". Fixed. Detail in §2.
4. **Jerry Bourgeois has no programming at all** — but he has 16 meal plans and
   115 meal logs, so he is a coached NUTRITION client, not a neglected one. I
   overstated this first time round; §5 has the corrected picture. Still worth a
   decision, because he is the only one of 29 without training.

**Also worth knowing:** the meal + recipe library is LIVE and verified as a real
client (50 meals / 20 recipes / 116 ingredients readable, 0 rows writable), and
it took two separate fixes to get there — both found by checking the database
rather than believing a success response. §11.

---

## 1 · SHIPPED TONIGHT

| SHA | What |
|---|---|
| `d5e4459` | Group chat shows everyone's face, not just Coach Bot's |
| `235785f` | Client-preview workout page uses local auth (your condition checked, not assumed) |
| `2c6776b` | The manual drag can move a completed workout, and admits it when it fails |
| `37820ff` | Movement notes: symptoms reach you, load bookkeeping does not |
| `d6f5d0b` | AI daily caps 15 → 60, plus the limit takeover screen |
| `a3d5ce8` | Workouts move anywhere to anywhere — no window, no status check |
| `d9b9275` | 50 meals + 20 recipes, and the migration Dylan's app needs |
| `c7d06c6` | The AI's workout adjuster counted writes it never checked |

All through the bridge, all `OK pushed`. **1,165 tests / 0 failures**, `tsc`
clean, `next build` compiled on every one.

### The meal + recipe library

50 meals (12 breakfast / 14 lunch / 13 dinner / 11 snack) and 20 cook-from-
scratch recipes. Every ingredient has a weighed portion. Every recipe declares
servings, prep and cook time, and stores macros **per serving** so it drops into
a plan exactly like a meal does.

**Nobody writes a calorie count anywhere.** The only hand-authored numbers are
the three macros per ingredient; kcal is derived from 4/4/9 and totals are
summed from items. A wrong total is not expressible. 18 tests check the
arithmetic and sanity-check every macro against the portion it claims to be.

Two of those tests failed on their first run and **both were my errors, not the
data's** — I capped recipe ingredients at per-serving limits when they are
whole-batch, and flagged "Heat the oven to 425°F." as too short to be a real
instruction.

---

## 2 · THE ONE THAT WORRIES ME MOST

The AI workout adjuster ran this, five times over:

```
await db.from("prescribed_exercises").delete().eq("id", id); applied++;
```

Write issued, **result thrown away, counter incremented anyway.** An RLS
refusal, a constraint violation, or a row that had moved all produced the same
output — *"Applied 3 changes"* — over a workout that had not changed at all.

You would have believed it. You might have told the client. The client would
have trained the old session.

Fixed: every write checked, only counted when it lands, partial failures named
out loud rather than hidden behind the successes.

**This is the fourth time this exact shape has turned up in two days** — message
deletes, payments, the calendar drag, and now this. I swept every write path in
the app and found 92 candidates; most are legitimately fire-and-forget (push
notifications, telemetry). This was the one where a discarded error gets
reported to a human as a completed action.

---

## 3 · DYLAN'S APP — the honest answer

**What I verified:**

- Only **one** Supabase project exists on this account (`symmetry-training`).
  His is a separate database on an account I cannot see.
- All 102 rows in `app_feedback` are tagged `live`. **Nothing from his instance
  has ever reached your database** — consistent with `docs/DYLAN-INSTANCE.md`.
- His schema therefore arrives **only** through `supabase/migrations/`.

**What I got wrong.** An hour before you asked, I applied the meal library's RLS
read policy straight to your live database through the Supabase API and wrote no
migration file. `docs/DYLAN-INSTANCE.md` warns about exactly that: *"Not applied
by hand to one database and remembered later — that is precisely how 186 of them
went missing."*

His app would have deployed the new library code and his clients would have
opened an **empty library**. RLS returns an empty list, not an error — nothing
would have appeared in any log. **Caught because you asked, not because I
checked.**

Migration now written (`supabase/migrations/20260815_meal_library_read.sql`),
plus `libraryNeedsItsMigration.test.ts` which fails if the policy ever goes
missing again, stops being SELECT-only, or the sync route loses its key gate.

I audited every other commit from today: **none touch schema.** That was the
only gap.

### ⏸️ NEEDS YOU — Dylan

1. **Confirm his Vercel project builds from this repo.** Vercel → his project →
   Settings → Git → should be `symmetrypersonaltraining-bit/symmetry-app`,
   branch `main`. I cannot see Vercel from here. *If it points at a fork, none
   of tonight's work has reached him.*
2. **Run the new migration against his database.**
3. **Populate his library**: call `/api/admin/sync-library` on his deployment
   with his scheduler key. The route ships in the code.

---

## 4 · THE IMPORTS — why "tonight" was never available

Restarted both at 16:04 CT. Baseline CPU probe **787 ms** (it was 4.3–10.9 s
during Friday's outage — the instance had fully recovered).

I then raised the batch 5× to chase your deadline. **That backfired**: both
started returning `http_status_429` from Open Food Facts and throughput *fell* —
6,700 rows in ten minutes against 30,000 expected. Reverted to the known-good
settings, which have run for weeks without errors.

**The bottleneck is their rate limit, not your database.** CPU under load was
855 ms against a 787 ms idle baseline — barely touched.

| | Done | Remaining | At sustainable rate |
|---|---|---|---|
| Food catalog | 42.2% | 2.68M rows | **~74 hours** |
| Micronutrients | 7.6% | 4.32M rows | **~180 hours** |

Both are running now and will keep running. I would rather tell you this than
have you find 8% progress in the morning and wonder what happened.

**A question worth your judgement:** the micronutrient backfill is 180 hours of
continuous API calls for data almost none of your clients will look at. The
branded-micros estimator (backlog #7) covers the same ground far cheaper. Worth
deciding whether that job should run at all.

---

## 5 · ⏸️ NEEDS YOU — decisions, ordered

### 1. Jerry Bourgeois — the fuller picture, and I overstated it earlier

I first flagged this as if something were broken. Having actually looked, it may
be entirely intentional and you are the only one who knows.

| | |
|---|---|
| Joined | 17 Jul |
| Goal on file | "Lose 30 lbs fat only" |
| Meal plans | **16** |
| Meal logs | **115** |
| Program assignments | **0** |
| Workouts ever scheduled | **0** |
| experience_level / training_frequency / injuries | all **blank** |

So he is not a neglected client — he is a heavily-coached NUTRITION client. He
is also the **only** one of your 29 active clients with no workouts at all;
every other one has programming.

**Either reading is plausible** and I am not going to guess: he is nutrition-
only by arrangement, or his training was never set up. Tell me which and I will
either leave it alone or build the programme.

**One thing worth knowing either way.** Jerry is `ai_pool_only = false`, so he
is UNGATED — the coach may offer him any workout in the library and
`add_my_workout` will let him take it. For most clients that is fine, because a
programme and an assessment sit behind it. Jerry has neither, and no recorded
injuries or experience level, so nothing at all constrains what the AI would
hand him. The gate exists and you already use it selectively (Gerard and Sharon
have server-side contraindications). This is a decision, not a bug.

### 2. Megan is not in the system

You said she is your sister. There is no Megan in `clients` under any spelling,
so the recipe-builder message cannot go to her in-app. **Jerry Bourgeois IS a
real client** (added 17 Jul, active). Options: add her as a client, or just text
her. I have done neither.

### 3. Swap is still guarded

You opened up **moves**. Swap — changing *which* session sat on a completed day
— still refuses, because that rewrites what somebody actually did rather than
when they did it. One word and it goes.

### 4. Images for meals and recipes

You asked for images on the new ones and on what is already there. **I cannot
generate images or fetch them from this sandbox** — the egress proxy blocks
image hosts and I have no image tooling here. This needs a real decision:
licensed stock, your own photos, or an image-generation step run somewhere with
access. The schema already has `image_url` on `recipes`, so the moment there is
a source this is a data job, not a build.

### 5. The Supabase dashboard, still

Compute size and CPU credits. Two numbers, thirty seconds:
- https://supabase.com/dashboard/project/mkfiginpiesospsnktea/settings/compute-and-disk
- https://supabase.com/dashboard/project/mkfiginpiesospsnktea/reports/database

### 6. Turn the uptime monitor on

`/api/health` is live. Ten minutes, needs your sign-in.
Steps in `docs/MONITORING-SETUP.md`.

---

## 6 · SYMMETRY APP v2 (Phase 0) — what I found and why it stalled

**I cannot push to `symmetry-app-v2` from here, and it is not the same block as
the live repo.** Tested it properly rather than assuming:

- `git clone` of v2 reaches GitHub and asks for credentials — so the proxy is
  **not** blocking that host.
- The GitHub API with your token returns **403 with a specific message**:
  *"GitHub access to this repository is not enabled for this session. Use
  add_repo to request access."*
- **`add_repo` is not among this session's tools.** So the mechanism the proxy
  points at is not available to me.

**The ship bridge cannot help either** — `ship-watcher.sh` hardcodes
`REPO="/c/Users/dusti/Claude/Projects/symmetry-app"`. It only ever pushes live.

**`push-symmetry-v2-phase0.html` is not recoverable from here.** It was saved to
your Desktop, and Desktop is not a folder connected to this session — I can see
only that a `Bio` directory exists there. Asking for access would need you to
approve it on the device, and you are out.

### What this means

Phase 0 steps 1–4 **all** need your hands: the push, the Vercel env var, the
GitHub repo secret, and the Supabase org transfer. None of them are things I can
do from a cloud session, and none are blocked on knowledge — only on access.

### The fastest path when you are back

The cheapest unblock is **one of these**, and you pick:

- **A.** Open Git Bash on your laptop and push v2 yourself — I will prepare the
  exact commands and the code bundle so it is copy-paste.
- **B.** Let me extend the ship bridge to handle a second repo. It is a small
  change to `ship-watcher.sh` (read the target repo from the SHIP-NOW file
  instead of a constant), after which I can ship v2 the same way I ship live,
  unattended, for the rest of the project. **This is the one I would pick** —
  it is the permanent low-friction path rather than a one-off.

Say which and I will build it. Option B is maybe twenty minutes and then this
category of blocker is gone for good.

---

## 7 · Verified since, as an actual client rather than as the service role

The library RLS changes were the risky part of the night, so I tested them the
way a client would hit them — inside a transaction, as `authenticated`, with a
real client's JWT claims, rolled back afterwards.

| As Jennifer Day | Result |
|---|---|
| Library meals she can READ | **50** ✓ |
| Library recipes she can READ | **20** ✓ |
| Library ingredients she can READ | **116** ✓ |
| Library meals she can EDIT | **0** ✓ |
| Library meals she can DELETE | **0** ✓ |
| Library recipes she can DELETE | **0** ✓ |
| Library ingredients she can DELETE | **0** ✓ |

Readable by everyone, writable by nobody but you. That is what it was supposed
to be, and now it is checked rather than assumed.

---

## 8 · The app_feedback queue — triaged, one closed

Three items were sitting at `new`. All three are feature requests; none is a bug.

| Item | Verdict |
|---|---|
| **"Nedd full add workout custom from schedule page"** (you, 6 Aug) | **ALREADY BUILT — closed.** The schedule page has "Build a workout for this day" wired to ManualWorkoutBuilder, and the source comment cites this exact feedback id (`73fcd284`). The queue was stale, the same way the backlog was stale about Bugs A and B this morning. Marked resolved. |
| **"Need to track full nutrients everywhere in food logger"** (you, 4 Aug) | **GENUINELY OPEN, and narrower than it looks.** Micros are captured, carried through the AI, and stored on `meal_items` — the whole pipeline exists. What does not exist is any UI that RENDERS them. Nothing in the app displays a single micronutrient to a client today. So this is a display job, not a data job, and it does not depend on the 180-hour backfill. |
| **"Pull info from Garmin, Google, Apple"** (Todd, 29 Jul) | **Open, and needs your call.** A real integration, not an evening's work. |

Feedback queue is now 100 resolved / 2 open.

---

## 9 · A deliberate NON-decision: 57 remaining auth call sites

Overnight I converted the page-level auth to local verification. **57 files still
make a network `getUser()` call** — all API routes and server actions.

I have not swept them, and I do not think I should have. The outage benefit was
almost entirely on page loads, which are done; these are write paths, and my own
note when I stopped the first time still holds — *"a write path deserves its own
read rather than a sweep."* Doing 57 of them at midnight with you unreachable is
how a good change becomes an incident.

Listed here so it is a decision on the record rather than something forgotten.

---

## 10 · What I checked and found clean

- **Every other commit today touches no schema.** The library policy was the
  only one, and it now has its migration.
- **Your CPU has fully recovered** from Friday: 787 ms idle, 855 ms under import
  load, against 4.3–10.9 s during the outage.
- **The app is up.** `/api/health` green all evening; auth and database both in
  the tens of milliseconds warm.
- **No client has lost programming** except Jerry, who never had any.

---

*Nothing in here is guessed. Where I could not verify something, it says so.*


---

## 11 · The library took three goes, and only checking caught it

Worth reading because the pattern is the useful part.

**Attempt 1 — a 500, honestly reported.** `source: "library"` violated
`recipe_ingredients_source_check` (allowed: manual / database / ai). 20 recipes
in, **0 ingredients**. The route caught this itself because it checks its own
writes — the exact discipline I spent the evening adding elsewhere. Had it been
written the way the workout adjuster was, it would have returned 200 and I would
have told you the library was live.

**What should have caught it earlier:** `dbCheckConstraintValues.test.ts` exists
for precisely this, and the fixture already had the right three values. It
missed mine because of the SHAPE — the rows were built in a `.map()` and inserted
as a variable, and the scanner only followed `const x = {`. Extended, and
verified by putting the bad value back.

**Attempt 2 — a 200 with correct numbers, and still broken.** All 20 recipes
came out `visibility='private'`. `trg_recipe_publish` downgrades a public insert
unless `is_trainer()`, and the service role is not a trainer. Twenty recipes and
116 ingredients in the database, readable by **nobody**, with nothing in any log
or response body to show it. I only found it because I queried the rows.

**I did not touch that trigger.** It is what stops a client publishing a recipe
to everyone else. Fixed the read policy instead, in a migration, so Dylan gets
it too.

**Then I swept every trigger in the database** for the same class. Eight rewrite
a column on write — eight places where what the app sends is not what gets
stored, silently. The four that change a *submitted* value (the isolation and
publish triggers) are all behaving correctly. No further bugs of that shape.

**And that sweep found one more real thing.** Moving a real completed workout in
a rolled-back transaction raised `23505` on
`uq_scheduled_workout_one_per_slot (client_id, day_id, scheduled_date, position)`.
Both AI move paths computed a free destination slot; the drag set only the date.
So on your "move anywhere to anywhere, period" instruction, the drag would still
have been refused — on exactly the busy days somebody drags. Fixed and
re-verified against the real constraint.
