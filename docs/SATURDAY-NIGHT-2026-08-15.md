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
4. **Jerry Bourgeois has no programming at all.** Not a gap — zero workouts have
   ever been scheduled for him. Active since 17 Jul, logging meals 5 of 7 days.
   He needs a decision from you, not from me.

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

### 1. Jerry Bourgeois has never had a workout scheduled

Active client since 17 Jul, has a login, logging meals 5 of 7 days as of 11 Aug.
**Zero rows in `scheduled_workouts`, ever.** Every other active client has
programming through at least 31 Aug.

I have not assigned him anything — your standing rule is that programmes are
your call. Tell me what he should be on and I will build it.

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

## 7 · What I checked and found clean

- **Every other commit today touches no schema.** The library policy was the
  only one, and it now has its migration.
- **Your CPU has fully recovered** from Friday: 787 ms idle, 855 ms under import
  load, against 4.3–10.9 s during the outage.
- **The app is up.** `/api/health` green all evening; auth and database both in
  the tens of milliseconds warm.
- **No client has lost programming** except Jerry, who never had any.

---

*Nothing in here is guessed. Where I could not verify something, it says so.*
