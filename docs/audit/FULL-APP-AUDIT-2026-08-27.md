# Full app audit — 27 Aug 2026

Eight parallel audits across the whole app, every finding checked against live
data. Your ~106 `app_feedback` entries were used as the spec — each one is a
statement of how you wanted something to work, and almost all were marked
*resolved*, so each was re-tested rather than trusted.

**Nothing below is a guess.** Every item has observed data behind it. Things I
suspected but could not prove are in a separate section at the end.

---

## FIRST: I told you something wrong on 26 August

I said Jennifer's sets were never written — that a write failed and the logger
correctly refused to tick. **That was wrong.** The Supabase edge logs show her
sets *were* written, and then deleted:

```
16:12:26  PATCH  /workout_logs?id=eq.af942d48…          200   ← she completed it
16:14:11  DELETE /set_logs?workout_log_id=eq.af942d48…  204   ← every set destroyed
16:14:11  DELETE /workout_logs?id=eq.af942d48…&completed=eq.false  204  ← matched 0 rows
```

`discardSession` deletes the sets **unguarded** and only guards the parent row.
The `completed = false` check is on the wrong statement. PostgREST doesn't error
on a DELETE that matches nothing, so it reports success and exits.

**12 sessions across your roster have been destroyed this way** — Jennifer,
Cheyenne Martin (50 min), Sara Prince (×4), Claudine Ocon (63 min), Lauren,
Celeste, Stacie Weever, Lesly Spencer. The schedule still counts them complete,
so adherence looks fine while the training data is gone.

The telemetry I shipped can't see this — it only fires on a *failed* write, and
this was a successful delete.

---

# HIGH — fix first

## Data loss

**1. Cancel destroys the sets of an already-finished workout** *(above)*
`WorkoutLogger.tsx:1901`. Put the `completed = false` guard on the `set_logs`
delete too, and check the parent delete actually matched a row.

**2. Two workout logs are created milliseconds apart; the first set is orphaned**
`ensureWorkoutLog` does select-then-insert with no unique constraint behind it.
Six times in August. Tyler Dorsett's 160 lb x 10 lat pulldown is not in his
history. Fix: partial unique index on
`(client_id, day_id, log_date) where completed = false`.

**3. A logged set can save with every value NULL — and 0 is impossible to record**
`parseFloat("0") || null` returns null. **286 sets** are on record as done with
nothing behind them. Worse: Machine Assisted Pull Up has 164 logged sets and *no
assistance value of 0 has been storable since 24 July* — a client who reaches
zero assist, the whole point of your rule, has it stored as "didn't enter
anything". Fix: `Number.isFinite(parseFloat(x)) ? parseFloat(x) : null`.

## Money

**4. Client invoices print arithmetic that is false**
`ReminderEditor.tsx:428` hard-codes `basis: "sessions_trained"` for every billing
type. Live on phones right now:

| client | what his phone says | 8 x 70 actually = |
|---|---|---|
| Tim Yancey | "8 sessions x $70 = $490" | 560 |
| Sharon Rambo | "6 sessions x $75 = $300" | 450 |

Your own editor shows Tim the *correct* line ($840 − 5 cancelled x $70 = $490).
Two screens explaining the same bill contradict each other.

**5. Christine Latham was charged $640 twice, seven days apart**
Due 2026-07-22 and 2026-07-29, both $640 on a $640/month rate, both marked paid.
An extra instance in the calendar recurring series generated a second reminder.
Her 07-22 session is also counted in two billing cycles at once.

**6. Her current unpaid invoice is $80 under your own rule**
Billed 4 x $80 = $320 under the superseded 31 July rule; under the 20 Aug rule it
should be $400. The recalc won't touch a `sent` row. Already 5 days past due.

## The AI stating numbers

**7. The meal-photo route has written 1,109 rows of guessed nutrition across 18 clients**
`analyze-meal-photo` asks the model to *"estimate the macros"* and stores the
answer. It never calls `resolveFood()`. The numbers contradict themselves:

| logged | kcal | P | C | F | reality |
|---|---|---|---|---|---|
| "3/4 cup egg whites, green beans" | 95 | **203** | 1.3 | 1 | ~19 g protein |
| "banana" | 105 | 1 | 27 | **14** | 0.4 g fat |
| "4 slices sausage pizza" | 1120 | 52 | 98 | **0** | not zero fat |

58 rows are off by >10%, 24 by >25%. Every calorie bar, weekly average and coach
card for those days is built on them.

**8. `nutrition-ai/act` invents macros AND saves them to My Meals for reuse**
It wrote "Fairlife Core Power, 1 bottle → 170 kcal / **42P** / 5C / 2.5F". The
real catalogue row: 170 kcal / **26P** / 9C / 4.5F. 16 g of protein never eaten —
and `saveMyMeal()` runs on the same call, so it's a saved meal she can re-log
forever. 430 AI-estimated items across 318 foods, 14 clients.

**9. A nudge sweep is running in production, unmetered, from code that isn't in the repo**
451 model calls, ~34/day, invisible to the $95 kill switch and to the AI health
page. Proof it's an old deployed build: it writes `suppressed='preview_mode'`, a
string replaced on 13 Aug and absent from `src/`. It writes messages to clients.

**10. Brooke's AI plan still overshoots her protein target by 38 g**
She reported this on 23 Aug (*"AI told me 160g of protein but is giving me
198g"*). Her live plan today: 198 g against a 160 g target. `plan-build` asks the
model for totals and, when validation fails, keeps the drifted plan anyway.

## Wrong on screen

**11. "Add a banana" logs 1 cup mashed — 200 kcal instead of 105** — *my bug, from yesterday*
`householdServing` takes the *first* countable serving option, and USDA rows
store them alphabetically, so it's almost always a cup. Almonds → 1 cup whole →
**828 kcal**. Cheddar → 1 cup diced → 533. **1,996 USDA rows** default to a cup.
Fix: prefer piece-like options (medium/small/each/slice/bagel) over volume.

**12. Your trainer calendar has shown nothing since 29 July**
`home/page.tsx:175` reads 4,147 scheduled workouts unpaged; 1,000 arrive; the
last is dated **2026-07-29**. **3,136 rows across 35 clients** — including today
and everything future — never reach the page. This is the same failure you
reported on 24 Aug (*"where the hell did that programming go!?"*), still live in
a second read.

**13. Adding a food from the database to a planned meal throws away amount, unit and all nutrients**
283 of 283 saved rows prove it: `has_amount = 4`, `has_options = 0`,
`has_micros = 0`. So the row shows "1 serving" with a stepper that only moves in
whole servings — your 26 Jul chili-crisp complaint and your 30 Jul "type the
amount and change the unit", reintroduced one step later in the flow.

**14. The Workout Library shows 0 exercises on 278 real workouts**
Reads 10,866 prescriptions unpaged to count them. 1,000 arrive. Of 682 library
days: **278 show zero**, 352 show fewer than they have, 6 are correct.

## Notifications

**15. Push reaches 3 people out of 29**
1 web-push subscription (Lauren), 2 FCM tokens (you + Hassan). 38 clients have
accounts. When you post in the group or message a client, **26 of 28 get nothing
on their phone.** Web Push shipped 10 days ago to fix exactly this; nothing
anywhere prompts a client to enable it except a button below the fold on
Settings.

**16. The bell, the nav badge and the flashing Messages tab ignore notification settings**
Jennifer's complaint, still true from a different surface. She and Claudine both
switched group chat off; both currently have an unread group message (a *bot*
post) turning their bell red and flashing their Messages tab. Only the banner was
fixed on 26 Aug — the preference check needs to move into `useNotificationFeed`.

**17. Four weeks of nightly AI digests are written to a thread that cannot be opened**
27 rows with `client_id IS NULL, is_group = false, is_broadcast = false` —
matched by no inbox view and filtered out of the bell. The nightly report on who
was nudged has never been readable.

## Security & privacy

**18. `/api/set-client-mode` is unauthenticated and is an open redirect**
Proven against production with no session:
```
GET /api/set-client-mode?mode=1&redirect=https://example.com/pwned
→ 307 to example.com, and sets an HttpOnly cookie for 7 days
```
Nothing in the codebase calls it. It also plants a cookie the in-app toggle
*cannot clear* (HttpOnly), so a trainer who hits that URL gets client-side pages
for a week while the sidebar still says "Trainer View". **Delete the route.**

**19. The challenge board shows 29 clients by full name; only 6 opted in**
`v_challenge_roster` never checks `leaderboard_opt_in` and returns `clients.name`,
not the first name. The two API routes honour the opt-in; the component actually
mounted on the client home screen does not. **23 clients who never opted in are
listed to every other client by full name with their session counts.**

**20. Any trainer — including the five testers added last week — can read and DELETE all your feedback**
Proven under Justin Ray's JWT (rolled back): `delete from app_feedback where
client_id is null` → **66 rows**. That's your product backlog and clients' own
words about their food and bodies. One DELETE destroys it; nothing else holds a
copy.

## Numbers that disagree with each other

**21. Three screens show three different streaks for the same client**
Today: Dustin — home says **10**, the card under it says **4**, Progress says
**none**. Four separate implementations.

**22. Body Fat reads "—" for six clients who have a reading on file**
The profile takes the newest *row* instead of the newest *non-null value*.
Lauren, you, Jennifer, Claudine, Robert Miller, Jerry Bourgeois — all show a dash
with a trend line drawn beside it. The client's own dashboard shows the real
number.

**23. Lauren's Body Fat / Lean Mass / Fat Mass charts say "Not enough data" at every range**
The range filter is applied twice, so the panel only ever receives one point.
This is her 22 Jul *"Lauren not showing progress on charts"* — still true.
Related: the same tile shows +13.4 lbs and its own expanded panel shows +18.6
lbs, because the two range controls default differently.

---

# MEDIUM

**Programming & schedule**
- Brooke Orton runs out of programming tomorrow and no dashboard surface says so —
  `programming_coverage()` excludes `is_self_coached` clients. The integrity check
  that caught her is a `warn`, and the dashboard only renders `critical`.
- **Four people who signed up on 23 Aug have zero programming and zero assignments** —
  Alan Meier, Ian Christman, Justin Ray, Oliver Gergelj. Invisible to both
  coverage checks (one excludes them, the other starts from `scheduled_workouts`
  so a client with no rows never appears).
- "Swap in a workout from the library" reaches 171 of 600 workout names. Typing
  "push" returns 1 match; 24 exist.
- The client Schedule day pop-up shows **one** workout for a day that has four
  (376 client/date pairs have more than one; 70 have mixed statuses).
- The Program page day picker silently drops 167 of 1,167 days, and *which* 167
  changes between loads (no `.order()`).
- Your calendar's appointments stop at 2026-11-23 for the same truncation reason.
- 70 scheduled workouts carry an `assignment_id` from a different programme.
- Two supervised sessions today (Troy Schnitzler, Tyler Dorsett) don't appear in
  Today's Sessions; a cancelled session is still counted in the "6 scheduled" badge.

**Nutrition**
- Plan-item amounts in Adjust/edit still can't be typed and the unit can't be
  changed — only the *added-food* row got that control. 300 g → 170 g is 13 taps.
- Saving a day's edit into the plan halves or doubles any measured added food
  (`resolveEditedItems` ignores `base_amount`).
- Manual search still ranks crowd rows above USDA: searching "banana" as Robby
  returns three 242 kcal / 14 g fat rows before the verified 89 kcal one; as you,
  the USDA row is **15th**.
- 0 of 8,789 USDA rows carry micronutrients, and 15 of 1,821 plan items do — so
  "full nutrients everywhere" is empty for anyone eating their plan.
- The Week card averages today as a whole day; the AI weekly brief doesn't. Same
  client, same week, two different "avg kcal/day".

**Billing**
- Billing cycles only tile correctly when calendar due dates are exactly one
  cadence apart. Sharon Rambo has both a 2-day overlap (double-counting a real
  session) and a 2-day gap.
- The calendar-vs-app mismatch flag can never fire — it checks for a `basis` value
  the nightly recalc overwrites on every pending row. The approved mockup's
  source tags and use-app/use-calendar resolver were never built.
- Social-media post reminders (POST STORIES) are being stored as *payments* on
  live billed clients, and would generate a full-fee invoice on the post date.
- The "N overdue" badge on the home reminders panel is structurally unreachable —
  the query excludes exactly the rows the badge counts. Two panels on the same
  screen say "2 overdue" and "none".

**AI**
- `coach_action` fails **30%** of the time because its prompt instructs the exact
  response its validator rejects. Every failure is the model obeying the prompt.
- `verify-food` overwrites live catalogue rows with model output and stamps
  `verified = true`. **It is not a legitimate exception** — it doesn't create a
  missing food, it rewrites an existing one, with no backup. Never called yet, but
  deployed and reachable by any authenticated client.
- `assessment-recommend` recommends programmes that don't exist — 8 of the 13
  names in its prompt have no match in your `programs` table.
- **Nine AI surfaces have never been successfully called once**, including
  `client_assistant`, which is unreachable by construction (69 days of dead code).

**Other**
- The weekly-focus approval step no longer exists: `weekly_focus_drafts` has 0
  rows, nothing writes to it, and the sweep publishes AI copy straight to 35
  clients. Your standing rule is *approval before client-live*.
- The Google Calendar sync times out on ~half of runs; the 12-hour job has failed
  7 times today on a duplicate-key collision in `gcal_sync_runs`.
- The bench-press video you asked to be removed is back — a different third-party
  tutorial (*"Perfect Bench Press Form (DO THIS!)"*), written straight into the
  database outside the review queue. Worth eyeballing.
- Madeleine Coker's date of birth is **2026-08-04** — she's recorded as 23 days
  old. No `max` on the date input. The birthday bot will announce it.
- Challenge scoring differs between the client board and the trainer API (326 logs
  have a null `completed_at`); Join/Leave writes to a table the board never reads,
  so three people are ranked on a challenge they never joined.
- No daily calorie/macros chart exists anywhere — `MacrosProgressChart` is
  complete, correct and **mounted nowhere**, while the Nutrition screen tells
  clients to "open Progress" for a chart that isn't there.
- Charts have no touch interaction (your 26 Jun request), and the client weight
  chart sets `touchAction: "none"`, blocking scroll over itself.
- A weigh-in can only be deleted by the client, and only if it's one of their last
  five. Your 18.4 lb jump between 08-02 and 08-16 isn't removable from the
  trainer app.

---

# LOW (23 more)

Custom/barcode foods saved without serving options or nutrients · kcal shown when
adding differs from kcal counted · the Progress "Workouts" tile ignores its own
range control and counts abandoned sessions · leaderboard has no upper date bound
· week-summary counts replaced sessions · "Email sent" chip never renders (reads
an empty column) · archived clients not excluded from reminder generation ·
`cancelled_half` would deduct at full rate · two couples' revenue invisible to
every payments surface · `progression_events` never written to · food-import jobs
frozen since 16 Aug with status "running" · `used_on` stamped in UTC · the five
new trainers have an empty Client View with no way to fill it in · two cron jobs
are permanent no-ops · photo route zeroes unknown macros but preserves unknown
micros · and others.

---

# Verified working

Worth knowing what's solid: workout swap/move (16 real swaps, 57 backward moves),
the trainer inbox, exercise notes reaching it with the exercise tagged, group
fan-out room isolation, RLS isolation in both directions (tested under a real
tester's JWT), the metrics autocalc trigger (zero disagreements across the
table), celebration/weekly-brief/coach-card AI (all compute in code and forbid
the model from doing arithmetic — the correct architecture), video checking (815
videos, 0 dead), recipes, Jennifer's flat $1500 quarterly billing, moving a
workout never changing the billed amount, payment-excluded clients, and 13 of 18
cron jobs producing verified output.

---

# What the audit still cannot see

- **Rendering.** A banner covering a button, or "1 100 g" on screen, is invisible
  to SQL and grep.
- **Model behaviour.** No API key in the sandbox, so the food picker's *choices*
  can't be evaluated — only its architecture.
- **Device-only features.** Voice dictation, wake lock, keyboard insets.
- **Anything Vercel-side.** Env vars, whether FCM is even configured. If it isn't,
  push reach drops from 3 people to 1.

---

# Suggested order for the fix session

1. **Stop the bleeding:** #1 (cancel destroys sets), #18 (open redirect), #20
   (feedback deletable), #19 (privacy leak on the challenge board).
2. **Money:** #4, #5, #6 — client-facing and wrong.
3. **The AI number rule:** #7, #8, #9, #10 — this is your "100% accurate, period".
4. **Truncation sweep:** #12, #14, and the Program/Schedule reads. One pattern,
   several sites, mechanical to fix.
5. **Notifications:** #15 and #16 — right now the system reaches almost nobody
   and ignores the people who did configure it.
6. Everything else by severity.

Add a live check to `supabase/audit/live_audit.sql` for each fix, and confirm it
goes red against the broken version first.

---

## Ship state

The audit tooling (`supabase/audit/live_audit.sql`,
`scripts/audit/static-audit.mjs`, `docs/AUDIT.md`) was committed as `f780ae5` but
**the ship bridge went offline before it could be pushed** — `origin/main` is
still `66eda32`. The three files are also stored in the project under
`claude/audit-tooling/`. Get that up before starting fixes.
