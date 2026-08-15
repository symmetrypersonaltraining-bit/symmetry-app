# Backlog — the single work queue

> ## 👉 START AT `docs/MORNING-2026-08-15.md`
>
> Written overnight 14/15 Aug. Twenty-two commits, an outage, and its root
> cause. Two lists: done, and needs-Dustin. Read it before this file.
>
> **The one thing that must not be undone:** the food and micronutrient import
> crons are **OFF**, and off is the treatment, not a precaution. They drained
> the database instance's CPU credits and took the whole app down for most of a
> night — auth at 10–65s, half of all page loads returning
> `504 MIDDLEWARE_INVOCATION_TIMEOUT`. Do not re-enable them before choosing
> between a larger instance and a maintenance window.
> `docs/OUTAGE-2026-08-15-AND-RESILIENCE-PLAN.md` has the evidence and the
> options.
>
> **Claudine's root cause: FOUND, and it was not what either handoff assumed.**
> Two active assignments is the NORMAL state — 26 of 35 clients have two or
> more, because everyone who has ever used a manual workout carries a "Personal
> Workouts" sidecar and five people run several real programmes at once. Her
> rogue sessions came from a chat-scheduling pass on 16 Jul, not from a code
> path that runs on its own. The actual defect was `ensurePhaseId` asking
> Postgres for one active assignment with **no ordering**, so the same client
> adding the same workout twice could land it in two different programmes
> (`505fcc5`).
>
> **Bug A and Bug B below are BOTH ALREADY FIXED** — the entries further down
> this file are stale. Bug B's repair shipped 13 Aug in
> `20260813_swap_relabels.sql`; Bug A's `EDIT_WINDOW_MIN` de-duplication is live
> in `workout-ai/route.ts`. Re-verified against live data 15 Aug: no
> triples-seconds-apart since 30 Jul, and the five remaining "stale labels" are
> false positives or Dustin's deliberate naming.

---

> ## 15 Aug — three writes that had never once succeeded, or could not fail
>
> Same family as the six found on 14 Aug, and one of them is in the file that
> was fixed for exactly this.
>
> - **The single-session Cancel button on the trainer calendar wrote
>   `'cancelled'`**, which `appointments_status_check` refuses. Verified: 23514
>   every time, and 0 rows in the table have ever carried that status. The error
>   was not read, so the code recoloured the Google Calendar event orange and
>   closed the sheet — Dustin cancelled a session, watched Google agree, and the
>   appointment stayed `scheduled`. The BULK cancel sixty lines below had this
>   exact bug and was fixed on 14 Aug. **Why the scanner missed it:**
>   `dbCheckConstraintValues.test.ts` follows a bare identifier back to its
>   `const`, and here `status` is a function PARAMETER. Same hole that hid the
>   sixth of the original six. (`8fb61b0`)
> - **`deleteMessage` / `deleteThread` could not fail.** They never read their
>   error and returned void, so `MessagesClient`'s `catch {}` was unreachable —
>   a confirmed "delete the entire conversation" refused by RLS still navigated
>   away as if it had worked. (`e798d18`)
> - **Two unchecked `payment_reminders` writes.** The second, in the SEND path,
>   is the worse one: it sets the amount immediately before POSTing to
>   `/api/reminders/send`, which reads the row back — so a failed update sent the
>   email with the OLD amount under a screen showing the new one. (`e798d18`)
>
> Also latent, fixed before it bit: `AddSessionModal` wrote naive timestamps into
> `timestamptz` on a UTC connection, i.e. every booked session 5–6 hours early.
> Never exercised — all 4,628 appointments came from the Google Calendar sync —
> so nothing to clean up.

---

> ## 15 Aug — the AI audit
>
> - **The system prompt carried hardcoded body weights for eighteen clients and
>   every one was wrong.** Tyler by 15 lb and 5 points of body fat while in
>   contest prep; four clients had figures that exist nowhere in the database.
>   Now live from `metrics`, with the measurement date. (`3baefae`)
> - **Every AI feature was hanging.** `resolveAiScope`, the authorisation gate
>   for every AI route, awaited auth with no cap — measured at 28s and never
>   answering while the app's own pages served in 150ms. (`36e6919`)
> - **The AI could not see a single logged set.** 8,406 of them, 5,524 in the
>   last 30 days, across 29 clients — so "what did I press last time?" could not
>   be answered by the app that recorded the answer. Both client-facing contexts
>   now carry recent sessions and the last logged set per movement. (`e8db78a`)
> - **Still not wired, and these need Dustin's call:** movement assessment
>   findings are unreachable by ANY AI surface including his own assistant; his
>   trainer notes are not in the trainer agent's readable list; the nutrition
>   coach sees only 14 days.
> - **13 of 25 AI features have never produced a usage row** since per-feature
>   tracking began 13 Aug — including `client_assistant` (the ✦ on every client
>   screen) and `trainer_agent` (Dustin's own). Some are explained
>   (`verify_food` is dormant, `outbox_draft` was never built, the Monday and
>   Saturday sweeps have not come round, and `birthday_post` correctly did
>   nothing because nobody has a birthday this week). The two big assistants
>   having zero usage is worth a conversation.
> - Only **20 of 35 clients have a date of birth**, so the birthday bot can only
>   ever reach twenty of them.


> ## 14 Aug, late — USDA is in. What it can and cannot do.
>
> **Answer to "can we pull all micros from USDA?": half yes, and the half that
> matters most is the yes.**
>
> Measured on the live API, not assumed:
>
> | USDA data type | foods | nutrients per food |
> |---|---|---|
> | SR Legacy | ~7,800 | **128** |
> | Survey (FNDDS) | ~7,700 | **65** |
> | Foundation | ~300 | 26 |
> | **Branded** | ~1.9M | **13** |
>
> Branded is 13 because a US nutrition label legally carries about fifteen
> items and nobody assays the selenium in a particular brand of chips. That
> data does not exist at USDA, at Open Food Facts, or anywhere — it was never
> measured. Any app showing full micros on a barcode product is estimating.
>
> **`import_usda_generic()` is live on cron**, pulling the ~15,000 generic foods
> with full panels. Verified against known values before it inserted anything:
> raw almonds came back calcium 269mg, iron 3.71mg, magnesium 270mg, potassium
> 733mg, vitamin E 25.63mg — all matching reference data. Acerola juice returns
> vitamin C 1600mg, which is correct (it is the richest known source) and which
> the ceilings correctly allow. ~27 nutrients per food, `micros_source='measured'`.
>
> **THIS COVERS 100% OF DUSTIN'S PLAN FOODS**, which are all generic whole
> foods — White rice (cooked), Almonds, Salmon (cooked), Mixed berries, Olive
> oil. That is the actual fix for #44.
>
> **Two dialect traps, both of which produced silent zero-row imports:**
> USDA speaks two nutrient languages depending on endpoint — `/food/{id}`
> returns `nutrient.id` (1087 = calcium), `/foods/list` returns the legacy NDB
> `number` ("301" = calcium). The map keyed only on ids, so the list endpoint
> matched nothing: "fetched 50, inserted 0". Fixed, then the SAME bug appeared
> in the macro extraction, so `usda_amount()` is now shared. If an importer ever
> reports fetched > 0 and inserted 0, suspect a dialect mismatch first.
>
> **Also caught by a CHECK constraint**, on the very day six of them were found:
> `source='usda_generic'` was not an allowed value. It announced itself loudly
> because this caller surfaces the error — which is the whole argument for not
> swallowing them.
>
> ### NEXT: the branded estimator (Dustin approved, 14 Aug)
> He chose "estimate from the generic match, clearly labelled". The plumbing is
> in — `food_catalog.micros_source` is `NULL | 'measured' | 'estimated:<name>'`,
> and there is a trigram index on `name` for matching. What remains is the
> matcher itself, and it deliberately was NOT rushed out at the end of a long
> session: it writes to 1.2M rows and its whole value depends on matching
> quality, so it needs its own pass with real spot-checks. **The generic import
> must finish first — it is the reference set.**
>
> Do not let the estimated values render without the badge. That was the
> explicit condition of his approval.

---

> ## 14 Aug, evening — #44 micronutrients: running, and the honest ceiling
>
> **`food_catalog.micros` was NULL on all 1.26M rows.** Not sparse — empty. That
> is why `planMealNutrients()` returned nothing for every planned meal: there
> was no source data anywhere to read. The docs called #44 a data gap in
> `meal_items`; the gap was the whole library.
>
> **The data was already arriving and being thrown away.** `import_off_bulk`
> builds `nm` = every nutriment name → per-100g value, read eight keys out of
> it, and dropped the other twenty-nine. Two functions now fix that:
>
> - `off_nut(nm, key, scale, max_plausible)` — one nutrient, scaled and bounded
> - `off_micros(nm)` — the whole map, keyed to `lib/nutrition/nutrients.ts`
>
> Wired into the importer (new foods) and into `backfill_off_micros()` on cron
> every minute at :30 (the 1.26M already imported). Both verified live.
>
> **Three things were caught by looking at real output, and all three would have
> silently shipped garbage to 35 people:**
>
> 1. **Units.** OFF reports every nutriment in GRAMS per 100g. The registry
>    wants g / mg / mcg per key. Getting this backwards is a factor of a million
>    on a million rows. Verified against live rows (calcium 0.0247 = 24.7mg,
>    selenium 0.000005 = 5mcg), not reasoned about.
> 2. **Ceilings were too loose.** The first cut passed breadcrumbs with 2,581mg
>    of cholesterol. Ceilings are now set from what food actually contains
>    (~2–3× the richest known source), and an over-value is dropped to NULL
>    rather than clamped — a clamped number is a wrong number wearing a
>    plausible face.
> 3. **All-zero maps are not measurements.** "High Protein Semolina Pudding"
>    arrived with twenty nutrients all exactly 0.0000. Semolina has iron and
>    magnesium. That is a contributor filling a form, or a "0% DV" column
>    transcribed as "0 g". A single zero among real values is kept — "no
>    cholesterol" is a useful fact — but an all-zero map now becomes NULL.
>
> **⚠️ THE CEILING, AND IT MATTERS FOR WHAT DUSTIN WAS PROMISED.** He asked for
> "everything in library to have all nutrient info". That is **not achievable
> from Open Food Facts**, because OFF simply does not hold micros for most
> products. Measured hit rates: **~13%** of newly imported foods, **~46%** on
> the earlier (better-curated) offsets. Expect roughly 20–30% overall, averaging
> ~10 nutrients per food that has any. Do not write "the library has full
> nutrient data" anywhere — it will not be true, and this file has a history of
> confident documentation that was wrong.
>
> **The higher-value next step is USDA FoodData Central.** Dustin's plan meals
> are generic whole foods — "White rice (cooked)", "Almonds", "Salmon
> (cooked)", "Mixed berries" — which is exactly what USDA covers superbly and
> where OFF is weakest (OFF is branded/barcode products). FDC publishes full
> nutrient data as a free bulk download. That, not more OFF, is what gets the
> PLAN meals to full micros.
>
> Neither pipeline costs a cent of AI budget, and neither should ever be made
> to: 1.26M foods through a model would be roughly a $10,000 idea.

---

> ## 14 Aug, afternoon — where things actually stand
>
> **Exercise videos: 788 of 839 (93.9%)**, up from 720 this morning. It was
> never a search problem. 112 of the 119 empty exercises already HAD a video
> found, parked in `too_long`, because the shortest clip that exists for them
> runs 31 seconds against a 30-second ceiling. Dustin raised the ceiling to 60
> (`62fcea7`) and 68 exercises filled in one deploy.
>
> ⚠️ **CORRECTED 15 Aug — the sentence below is WRONG.** Measured against the
> live table: only SEVEN of the 51 are near the ceiling (61–67s). Sixteen sit
> at 61–90s, eight at 91–120s, fifteen at 121–180s, six over 180s — the worst is
> **1,098 seconds** — and six have no usable candidate at all. So "raise it a
> notch" clears almost nothing, and the exact number barely matters.
> `docs/EXERCISE-VIDEOS-THE-REAL-NUMBERS.md` has the full distribution and the
> three rows that should not be counted at all.
>
> **The same thing is now true one notch up.** Of the 51 still empty, 45 have a
> candidate and the shortest is **61 seconds**. Do NOT just raise the ceiling
> again — that reflex is what put the number at 30 and left it there. 90s would
> clear 16 more, 120s would clear 24. The honest next step is searching for
> genuinely shorter alternatives for those 45; the ceiling is his call and he
> has already made it once today. 6 have no usable candidate at all.
>
> **Writes: swept, clean.** RLS was tested by IMPERSONATING A REAL CLIENT — set
> the role and `request.jwt.claims` and Postgres evaluates the real policies.
> Every client-facing write passed as Bobbie Page; every cross-client write was
> correctly blocked (42501). Verify the mechanism before trusting a result: as
> her, `select count(*) from clients` must return 1, not 35, or the "OK"s mean
> nothing. NOT NULL swept too, nothing found.
>
> **All mics are now MicButton**, including the workout logger's three (one of
> which was broken three ways) and the program page. No exemptions left in
> `everyAiInputHasAMic.test.ts`.
>
> **Food catalog: 1.15M+ and climbing.**

---

> ## ⛔⛔ READ THIS FIRST — 14 Aug, midday
>
> **Six writes in this app had never once succeeded.** Not "worked sometimes",
> not "regressed" — zero successful executions, ever, each confirmed by counting
> rows and finding none. Every one was a string literal the database's CHECK
> constraint refuses:
>
> | where | column | wrote | should be | rows it ever wrote |
> |---|---|---|---|---|
> | `clientActions` add_my_workout | `scheduled_workouts.source` | `client` | `client_self_assign` | 0 |
> | `clientActions` log_my_weight | `metrics.source` | `ai_assistant` | `claude` | 0 |
> | `TrainerCalendar` bulk cancel | `appointments.status` | `cancelled` | `cancelled_client` | 0 |
> | `LogClient` weigh-in | `metrics.source` | `client_app` | `client` | 0 |
> | `LogClient` cardio | `cardio_logs.source` | `client_app` | `client` | 0 |
> | `schedule/actions` mark done | `workout_logs.status` | `completed` | `Done as planned` | 0 |
>
> Fixed in `07268f5` and `0b213ed`. **The method is the transferable part**, and
> it is the only reason any of it is known: run the real statement against the
> real database inside a `DO $$ ... $$` block that ends in `RAISE EXCEPTION`.
> The raise aborts the transaction, so nothing is committed, and the message
> carries the result out. Nothing else — not tsc, not 991 tests, not review, not
> a shipped build — had caught any of these.
>
> **Why they hid so well:** the readers tolerate values their own writers cannot
> produce. `TrainerCalendar` tests `status === "cancelled"` in five places. And
> `source` accepts `client` on `workout_logs`, `cardio_logs`, `daily_logs`,
> `meal_adherence_logs` and `metrics` — but NOT on `scheduled_workouts`. Same
> column name, one table where the obvious value is silently wrong.
>
> `tests/unit/dbCheckConstraintValues.test.ts` now pins this, with the live
> CHECK sets snapshotted to `tests/fixtures/db-check-values.json` (39 tables, 55
> columns) and the regeneration query in the header. **Regenerate it after any
> migration that touches a CHECK.** Its scanner is deliberately narrow — it
> reads inline object literals and follows a bare identifier back to its
> `const` — so a write assembled any other way is still invisible. That
> limitation already cost one bug (the sixth). Do not assume a green run means
> a table is safe.
>
> **All four client AI write tools are now proven** against real tables by that
> method: `move_my_workout`, `swap_my_workout`, `add_my_workout`,
> `log_my_weight`. Still unproven: any of them run **as a real client** rather
> than as Dustin, and Gerard's and Sharon's pool gate on their own accounts.
>
> **Mics are on every AI input** (`0e8dbc6`, `8bdd119`). Voice logging had been
> dead in the APK — `NutritionV3Client` built `webkitSpeechRecognition` inline
> and that API does not exist in the Capacitor WebView, so it failed on every
> client's phone and passed in every desktop browser. All surfaces now use
> `MicButton` → `lib/dictation`. Verified live on the deployed app end to end
> (fake engine injected, real click, transcript appended). **The one unverified
> thing is a human speaking into a real phone.**

---

> ## ⛔ START HERE — 14 Aug (night 2)
>
> **Read `docs/OVERNIGHT-8-14-NIGHT2.md` first.** Three things in it change what
> you would otherwise do:
>
> 1. **The exercise videos are DONE.** 703 of 839 have one (was 595), avg 18.6s.
>    The block below about WebSearch budget is **historical** — 94 were found
>    with 93 calls, and durations no longer come from search at all.
> 2. **YouTube removed `lengthSeconds` from the watch page.** The scrape in
>    `/api/video-candidates/verify` is obsolete, not blocked. Measuring now runs
>    in Postgres on the YouTube Data API (`measure_video_durations()`), on cron.
>    Do not try to "fix" the scrape by moving it somewhere with a better IP.
> 3. **#44 is a DATA gap, not a display gap.** Every previous handoff says the
>    opposite. `meal_items` has 1,528 rows and **0** with micros, so
>    `planMealNutrients()` correctly returns nothing for every planned meal.
>    Building display renders 1,528 blanks. Details in the night-2 handoff.
>
> **Also: CI had been red on every push since 13 Aug** (`4df0802`), sending
> Dustin a failure email per commit. Fixed in `7a2d3b2`, verified green as run
> #680. If you see failure mail from before that SHA, it is the old noise.
>
> **Running unattended right now:** `off-bulk-import` (every minute, food
> catalog → ~4M) and `video-duration-measure` (every 10 min). Both are
> rate-limited by the upstream service, not by cost. **30 pages/min is the
> fastest CLEAN rate — 45 and 55 both earn 429s and 55 is measurably slower.**

---

> ## Historical — the video budget problem, now resolved
>
> **Finish the exercise library videos.** Dustin, 13 Aug: *"make sure next
> session we start from here picks up on continuing the exercise library."*
>
> Do this **before anything else in this file**, and do it **before burning any
> WebSearch calls on other work** — that is the whole reason it is stranded.
> `WebSearch` is capped at **200 calls per SESSION** and does **not** reset
> mid-session. The 13 Aug session spent its 200 on the first 151 exercises; five
> agents spawned afterwards for the remaining 101 all returned instantly with
> *"budget used: 200 of 200"*. Nothing was wrong with the pipeline. It ran out
> of a per-session resource, and the only fix is a session that still has one.
>
> 101 exercises × one search each fits inside a fresh 200 comfortably — but only
> if nothing else eats it first.
>
> Full detail, the SQL to get the list, the agent instructions, and the seven
> rows to skip: **"Exercise demo videos"** section below.
>
> Second thing, and it takes Dustin ten minutes rather than you: the 151
> candidates already found are waiting at **Library → Exercise Videos**. He
> presses "Check lengths" once, then works the queue.

**This file is the only work queue.** Not Notion, not the loose `*-LIST-*.md`
files in the Trainer App folder, not a chat scrollback. If it is not here, it is
not tracked. Last consolidated 2026-08-07.

Sources folded in: `app_feedback` (open rows), `FEEDBACK-LIST-8-6.md`,
`docs/MULTI-TRAINER-BACKLOG.md`, the Notion Master Build Tracker, and everything
parked in the previous version of this file.

**Re-verified 2026-08-07 evening:** `app_feedback` has exactly 4 rows with
status `new` (`73fcd284`, `8aa820a9`, `2c2df05f`, `95f11695`). All four are
already tracked below as items 1, 3, 4 and 5. Nothing new.

---

## Shipped 2026-08-13 → 14 (overnight) — do not redo

| SHA | What |
|---|---|
| `879890d` | `client_goals` table + the goal maths (`src/lib/goals.ts`) |
| `938e1a8` | Goal card, chart, weigh-in nudge, mounted on Progress |
| `8071135` | Goal chart width cap — the viewBox was scaling axis labels to ~40px on a desktop column |
| `1cbee42` | Goal chart: pre-goal weigh-ins kept inside the plot; right-edge labels de-collided |
| `52b2414` | Goal context for the coach (both assemblies) + **every modal raised above the bottom nav** |
| `49f129f` | **Meal-plan history is no longer rewritten by an edit made today** (Claudine) |
| `e026f87` | Goals end to end: set/propose/accept/decline/adjust + roll-forward cron. Permanent plan changes announce themselves; `plan-restore` makes "restorable anytime" true |
| `160b09c` | Goal chart: leftmost dot labelled with its own value; target-date label anchored so it stops printing through "this rate" |

### Two fault classes closed, both with guard tests

**Modals sat at the bottom nav's z-index.** `AppBottomNav` is `z-50`; every
bottom sheet in the app was also `z-50`, and a sheet rendered inside the page
comes first in document order — so at a tie the nav won and parked itself over
the sheet's confirm button. Eleven modal roots across nine files. Found on the
logger's time picker, where the covered control was the only way out.
`tests/unit/modalsAboveNav.test.ts` fails if any modal goes back to `z-50`, and
separately if `AppBottomNav`'s own z-index moves out from under the rule.

**Plan history was resolved against the current plan.** Editing a
trainer-authored meal clones the plan and archives the original (correct — the
prescription must never be mutated), but the resolver fetched `status = 'live'`
only, so the archived version left the candidate set and every past day fell
through `?? mealPlan` to today's plan. Two consequences: last week's menu was
redrawn as this week's, and every zeroed item came back, because
`item_overrides` are keyed by `meal_item` ID and the clone minted new rows.
A version's reign is `[effective_date, next version's)`; live vs archived says
which is *current*, not which governed last Tuesday.
`tests/unit/planHistoryIsNotRewritten.test.ts`, built from Claudine's real ids.

### Goals — what exists now

`client_goals` · `src/lib/goals.ts` (the maths, single source for card, chart
and coach) · `GoalCard` / `GoalsSection` / `GoalsPanel` / `GoalSetSheet` /
`WeighInNudge` · `POST /api/goals` (set · accept · decline · adjust · close) ·
`GET/POST /api/cron/goals` (daily 12:00 UTC roll-forward) ·
`src/lib/ai/goalContext.ts` feeding both coach assemblies.

Rules worth not relitigating: a stall of 14 days overrides the six-week trend
and the projection draws FLAT · under 5 readings or 30 days of span there is no
projection at all · a trainer-set goal is `proposed` and only the client may
answer it · start value/date are stored, not derived · a rolled goal is not
re-proposed · a stalled client's roll-forward does not extrapolate from zero.

### Open, from this session

- **Read `docs/SATURDAY-NIGHT-2026-08-15.md` first.** Everything from the night
  of 15 Aug: what shipped, the four things that need Dustin, and why the v2
  Phase 0 build stalled (it needs his hands, not more knowledge).
- **Jerry Bourgeois has never had a workout scheduled.** Active client, logging
  meals, zero rows in scheduled_workouts ever. Needs a programme decision.
- **The v2 push route.** The ship bridge hardcodes the live repo. Extending it
  to take the target repo from SHIP-NOW is ~20 minutes and removes this blocker
  permanently — recommended over a one-off manual push.
- **Images for meals/recipes.** Schema has recipes.image_url. Blocked on a
  source, not on build work: this sandbox cannot generate or fetch images.

- **Turn the uptime monitor on.** `/api/health` shipped (`8238cd8`) and is live;
  pointing Better Stack at it needs Dustin's sign-in. Ten minutes, steps in
  `docs/MONITORING-SETUP.md`. Until this is done the app still has no monitoring
  in the sense that matters — the endpoint answers, but nobody is asking.

- **Claudine's 13 Aug totals** were computed while her zeroed items were back.
  Today's row is keyed to the current plan's item ids so it should be right —
  have her reload and confirm before reading anything into the number.
- **Exercise videos: 101 exercises still unsearched.** Needs a FRESH session;
  see the banner at the top of this file. This session spent its WebSearch
  budget elsewhere.

---

## How code ships from a cloud session

A Cowork **cloud** session cannot push to GitHub. Verified 2026-08-07 across
three routes — sandbox `git push`, the sandbox GitHub REST API, and
`device_bash` on the laptop — all refused by the proxy with 403. **This is not
a token problem;** the PAT authenticates fine and the proxy discards it before
GitHub ever sees the request. Do not rotate the token in response to a 403.

The cloud does all the work and all the gates; the laptop performs the push via
the **ship bridge**: Dustin runs `SHIP-WATCHER.bat` from the Trainer App folder,
the session drops a git bundle plus a `SHIP-NOW` trigger in `outbox\`, and the
watcher fast-forwards `origin/main`. It refuses any non-fast-forward, so it
cannot clobber `main`. Full detail in `START-HERE-SESSION-SETUP.md`.

> ### ⚠️ Run `git fetch origin main` after EVERY ship. Two seconds, saves an argument.
>
> The laptop does the pushing, so this sandbox's `origin/main` ref stays frozen
> at whatever it last fetched — even though the commit is on GitHub. Anything
> comparing local to `origin/main` (the stop hook, `git status`, your own eyes)
> then reports phantom unpushed commits.
>
> On 14 Aug this fired three separate times, each one after a `SHIP-RESULT.txt`
> that said `OK pushed`, and each one cost a round trip to disprove. **When the
> ship result says OK, that is the truth and the local ref is stale.** The fetch
> is what makes the two agree, and the correct place for it is immediately after
> reading a successful SHIP-RESULT — not after something looks wrong.
>
> Concretely, the ship sequence is: bundle → deliver → `SHIP-NOW` → read
> `SHIP-RESULT.txt` → **`git fetch origin main`**.

> ### ⚠️ And the sandbox cannot `curl` the app either. A `000` is NOT an outage.
>
> Same proxy, second surprise, found 15 Aug at 11:03Z and confirmed again at
> 11:24Z. From the sandbox shell:
>
> | target | result |
> |---|---|
> | `api.github.com`, `registry.npmjs.org` | **200** — git and `npm ci` work fine |
> | `symmetry-app-omega.vercel.app` | `curl: (56) CONNECT tunnel failed, response 403` |
> | `<project>.supabase.co` | same |
>
> So `curl -o /dev/null -w "%{http_code}"` against the live app returns `000`
> with a sub-300ms time, which looks exactly like the site being down and is
> not. It says nothing whatsoever about the app.
>
> **What actually works, and what to use instead:**
>
> - the app → the **WebFetch tool** (it egresses elsewhere). `/api/health` and
>   `/api/version` are the two worth hitting. WebFetch caches 15 minutes per
>   URL, so add a throwaway `?probe=N` to force a fresh reading.
> - the database → the **Supabase MCP tool** (`execute_sql`). Unaffected.
>
> This is written down because a session that greets a `000` by announcing an
> outage will burn an hour on a problem that does not exist — which is the exact
> failure mode that cost most of the night of 14/15 Aug.

---

## Shipped 2026-08-07 — do not redo

Five commits that had been stuck at the push for two days, plus two new ones.

| SHA | What |
|---|---|
| `74154f1` | Assisted-lift PRs read the right direction (`src/lib/loadDirection.ts`) |
| `010f92b` | Meal plan visible 8 weeks ahead instead of flipped live each morning |
| `2b12aba` | This backlog doc |
| `74a6154` | Logger records against the day you are logging, not the clock |
| `57b5b12` | Logger verifies a resumed workout-log id (the FK crash of 6 Aug) |
| `daeed4a` | Challenge: `leave` action added to `/api/challenge` |
| `9744220` | Challenge: persistent Join/Leave control, coach included |

Also done directly in the database:

- `exercises.load_is_assistance` added + backfilled (Assisted Dip, Machine Assisted Pull Up)
- Madeleine's 6 Aug cardio log moved to 5 Aug; 5 Aug completed, 6 Aug reopened
- Lauren Standefer's 154 lb weigh-in (5 Aug) deleted
- Birthday bot live (`app_flags.birthday_bot_live`), daily 13:00 UTC
- **Dustin's 4 Aug duplicate Arms A resolved.** There were THREE logs, not two.
  Kept the 12:34pm CT session; the 12:11 and 12:16 duplicates are deleted and
  backed up in `bak_dupe_armsA_workout_logs_20260807`,
  `bak_dupe_armsA_set_logs_20260807`, `bak_dupe_armsA_sched_20260807`.
  Their two `scheduled_workouts` rows are soft-deleted (`deleted_at` set,
  status `skipped`).

---

## Two write-path bugs from the programming chat  ← TONIGHT, BEFORE GOALS

Filed by Dustin's programming session on 2026-08-13, full brief in Supabase:

```sql
select body from claude_handoff
where title = 'APP BUG BRIEF 2026-08-13 — SWAP/REPLACE + ACTIVITY EDIT';
```

**Both re-verified here against the live rows before being written down** — the
brief is accurate on every claim checked, including the exact timestamps.

### Bug B — swap/replace leaves a stale label (higher priority)

The swap forks a `days` row and repoints the existing `scheduled_workouts` at
the fork, which is right. It then never renames the fork and never bumps
`updated_at`. Confirmed:

| | |
|---|---|
| day | `eecfddf2-9c75-42b9-8fbe-3ebc7e0ad384` |
| `days.label` | **"Deload — Cardio (20 min Walk)"** |
| actual content | **Elliptical Trainer 20 min** |
| `sw.created_at` | 2026-07-14 15:00:42 |
| `sw.updated_at` | 2026-07-14 15:00:42 — *unbumped, though `day_id` changed 13 Aug* |

Second client (Claudine Ocon, 31 Jul) shows the same shape, so it is not
account-specific.

Why it is the priority: the label is what the UI shows and what any adherence
calc or AI summary reads if it does not walk through to `prescribed_exercises`.
The app is currently misreporting what was done. It also manufactures fake
"duplicate day" groups — same label, different content — which are
indistinguishable from a real duplication bug without opening both.

Fix: rename the fork from its new contents (or store `swapped_from_day_id` and
derive the display name from contents), bump `updated_at` on the repoint, record
the swap in `schedule_change_proposals`, and set `created_by` truthfully —
`library_fork` rows claim `trainer` even when the app did it.

Test: swap a scheduled workout to a different modality; assert the label
describes the new content, `sw.updated_at > sw.created_at`, and the original day
is untouched with its logs intact.

### Bug A — editing a logged activity INSERTS instead of UPDATES

Editing the duration of a logged activity creates a whole new
`days` + `scheduled_workouts` + `workout_logs` triple. Confirmed on Jennifer
Day, 30 Jul — two complete triples **52 seconds apart**, both `completed`, both
with their own log:

- `90286d4e…` created 12:30:27 — Baby Stroller Walk, 45 min
- `a4cdf2a3…` created 12:31:19 — Baby Stroller Walk, 120 min

She logged 45 and corrected it to 120. Her 30 Jul now reads 165 minutes across
two sessions; she did one. This corrupts adherence and volume totals for anyone
who has ever corrected an entry.

Fix: update `prescribed_exercises.volume_value` (or `set_logs.duration_seconds`)
in place, bump `updated_at`, and never create a second `days` row for the same
client + date + activity.

Test: log a 20 min walk, edit to 45, assert the `ai_activity` day count for that
client is unchanged by the edit and exactly one `workout_logs` row exists.

### Before touching any row — the FK map

`days.id` is referenced by: `scheduled_workouts`, `workout_logs`,
`trainer_notes`, `exercise_notes`, `published_workouts`, `sections`,
`schedule_change_proposals`, `client_training_patterns`.
`prescribed_exercises.id` by: `set_logs`, `exercise_notes`, `trainer_notes`,
`prescribed_exercises.alternate_of`.

The last two on each list are the non-obvious ones and caused a failed migration
on 13 Aug. Repoint everything before moving or deleting.

Also: `uq_scheduled_workout_one_per_day (client_id, day_id, scheduled_date)
WHERE deleted_at IS NULL`. Always filter `deleted_at IS NULL` when reading
`scheduled_workouts`, and note this constraint makes one of the four day-pairs
below impossible to merge while both rows exist.

### DO NOT bulk-clean the data

Four day-pairs share a label with different content. They are **not**
duplicates, and which record survives is Dustin's call:

- Dustin "Deload — Cardio (20 min Walk)" — Aug 12 Outdoor Walk 20 / Aug 13 Elliptical 20 (Bug B)
- Dustin "Outdoor Walk" — Aug 6 Walk (2 Miles) 45 / Aug 7 Outdoor Walk 30 (Bug A)
- Dustin "Fat Loss Cardio Phase 3: Stair Master" — identical content but TWO logged Aug 1 sessions, both with set data; **cannot be merged** while both exist
- Jennifer Day "Baby Stroller Walk" — Jul 30, 45 min / 120 min (the genuine double-count)

### Context only — already fixed, do not re-diagnose

A batch-build bug created one `days` row per scheduled date instead of reusing
one — 179 orphans across Christine Latham, Tyler Dorsett, Steph Gautreaux and
Dustin. Repaired 13 Aug (1113 → 934 days, zero data loss, backups
`bak_*_20260813b`). The correct pattern for any date-looping build: insert the
day ONCE, capture the id, loop only the `scheduled_workouts` insert.

---

## Goal-driven progress charts + a coach that drives toward the goal  ← MOCK-UPS DONE, awaiting review

Dustin, 2026-08-14 (Thursday afternoon): "id like to revamp the progress charts
to have goals me and clients can set and have the charts reflect where they are
on the journey towards the goal with the ai card on progress screen keeping up
with them to help encourage them to hit that goal and guide them on what needs
to happen to get there based on real numbers."

Deliberately parked until the current list is clear, because it wants mock-ups
first — this is the one screen a client will open specifically to feel something
about their progress, and the chart IS the feature.

What it has to do, in his words and unpacked:

- **Goals both sides can set.** He sets one; the client can set one. Needs a
  target value, a target date, and which metric — weight, body fat, lean mass,
  a lift, sessions per week.
- **The chart shows the JOURNEY, not just the line.** Where they started, where
  they are, where the goal sits, and whether the current trajectory actually
  arrives. A trend line that lands short is the most useful thing on the screen.
- **The AI card keeps up with them.** Not a generic "keep going" — it reads the
  real numbers against the goal and says what has to happen from here: the rate
  they need, whether the current rate gets there, what to change.

**Decided 13 Aug** (Dustin, via the mock-up round):

- **Metrics:** body weight, and body fat % / lean mass. Not lifts, not
  consistency — those can come later.
- **Who sets:** both. His goals are visible as his, and the client can push
  back rather than just accept. "Keeps it a conversation instead of a target
  dropped on them."
- **Off-track tone:** honest, plus one specific fix in real numbers. *"At
  0.4 lb/wk you'll land ~4 lb short. 0.9/wk gets you there — roughly 200 fewer
  cals a day."* Not soft, not blunt.
- **Missed deadline:** rolls forward at the achieved pace and keeps the old
  attempt visible on the chart. Nothing framed as a failure, nothing hidden.

**Mock-up:** `docs/mockups/goals-progress.html` — eight states, built on real
weigh-ins from `metrics` rather than invented numbers, so the awkward cases show
up instead of hiding.

**The finding that came out of building it, and it changes the shape of the
feature:** there are 95 weigh-ins in the whole database across 23 clients —
about four each. Robert has four; Lauren has five. **A projection from four
points is a guess wearing a suit.** So the design refuses to draw one under six
readings and says why. Which means the real prerequisite here is not chart code,
it is weigh-in frequency — worth deciding whether the goal screen should ask for
one when it is stale.

Also settled while building: rate must be computed from the **last six weeks**,
not lifetime. Lauren's lifetime rate says 0.9 lb/wk; her last three weigh-ins
are the same number. Lifetime rate is a fact about the past — recent rate is the
only one that answers "does this arrive?", which is the entire question.

Still open for Dustin after he reads it:
- Does the "behind pace" wording land right? (Lauren's and Robert's cards.)
- Is the projection line useful or alarming?
- Should a goal he sets be genuinely refusable, or only discussable?
- Does the progress meter earn its space, or does the chart already say it?

Prerequisite already in place: `metrics` has the history, and the coach already
reads the trend. This is a new `client_goals` table plus chart work.

---

## Notification settings — who gets told what, how, and who decides  ← AFTER GOALS

Dustin, 2026-08-13: "lets look at optoins for notification settings for everyone
in terms of what they get notified on and how, what they have a choice of and
what i say is built in, where that setting should live, etc." Then: "also add
options for them to get notifications on emojis on thier group chat comments
within the notification settings."

**Explicit ordering: goals first, this second.**

### What actually exists today (checked, not assumed)

Push is real and working — FCM via `src/lib/push.ts`, `sendPushToUser()`. But it
fires from exactly **one** file, `home/messageActions.ts`, in four places:

| Event | Who gets it |
|---|---|
| Coach messages a client | that client |
| Client messages the coach | Dustin |
| Announcement | every client |
| Group message | everyone in the group |

That is the whole notification surface. **Nothing else in the app pushes at
all** — not a workout reminder, not a nudge, not a payment, not a birthday, and
not a reaction on your group message.

There is **no per-event preference anywhere**. The only related switches are
`client_app_settings.nudges_enabled` (AI nudges, which are messages not pushes)
and the new `checkin_nudges_off` / `checkin_snoozed_until` from the go-quiet
screen. So today the honest answer to "what can they turn off?" is: nothing,
except by switching off notifications for the whole app at the OS level — which
is exactly the outcome a missing settings screen produces.

`message_reactions` (`message_id, user_id, emoji`) exists and is written by
`MessageReactions.tsx` under RLS from the browser. **No push fires on insert**,
so the kudos feature is invisible unless you happen to be looking. That is
Dustin's emoji ask, and it is genuinely the highest-value one on this list —
👊 on someone's win is the whole point of the group chat, and right now the
person who earned it never finds out.

### The design questions, which are the actual work

1. **Which events even become notifiable?** Messages · group messages ·
   announcements · **reactions on your own message** · workout reminder ·
   missed-log nudge · payment due · birthday · challenge results · a reply from
   Dustin to an escalated coach question.
2. **Which are Dustin's to force and which are the client's to choose?** His
   words: "what they have a choice of and what i say is built in." Payment
   reminders are plainly his. Reactions are plainly theirs. The middle is the
   conversation.
3. **Where does the screen live?** Settings today is one `SettingsClient.tsx`
   plus `ExperienceSettings`. Probably its own Settings → Notifications page,
   because a per-event matrix does not fit inside an existing card.
4. **Quiet hours**, and whether Dustin can override them for something urgent.
5. **Does the trainer get a separate set?** He is the only person who receives
   from thirty people rather than one.

### Notes for whoever builds it

- Storage should be a per-client, per-event table rather than more boolean
  columns on `client_app_settings` — that column list is already 25 wide and
  every new event would add another.
- **Default ON, opt-out per event.** A notification system nobody has heard of
  does nothing; one that cannot be turned off gets killed at the OS level, and
  then the payment reminders stop arriving too.
- Reaction pushes need coalescing (five 👊 in a minute is one notification, not
  five) and must never notify you about your own reaction.
- `sendPushToUser` is currently called with no preference check at all. Whatever
  lands should route every send through one gate, so a new caller cannot bypass
  preferences by simply not knowing they exist.

---

## AI build — night of 2026-08-12/13

Dustin: "i want the ai functions in this app to feel so accurate and personal
that it blows plps minds." What landed, and what is deliberately still open.

### Landed

| SHA | What |
|---|---|
| `7948046`–`f271fa9` | The nine from earlier that night: usage failures logged, one feature name per route (23, was 5), the $95 cap applied to six routes that ignored it, the weekly focus can reach a client, the Monday nudge sweep can actually run, movement screens are kept, the trainer agent stops forgetting, `${COACH_FIRST_NAME}` in two quoted strings |
| `49997f0` | Twenty faces + the mood registry (`src/lib/ai/faces.ts`) |
| `f19a7c2` | **The tap ripple was throwing every floating button off-screen mid-press** — see below |
| `efca005` | Faces re-cut on the grid so nothing is clipped; `CoachFab` |
| `45ea82d` | `GlobalCoach` — one ✦ on every client screen |
| `0a7f138` | Workout edits are undoable; `applyProposal` de-duplicated (it existed twice) |
| `5962d33` | The celebration's AI line wears the matching face |
| `778c98c` | Coaching-voice routes moved to Sonnet, extraction stays on Haiku |
| `3c1f1eb` | `/settings/ai-health` — every surface, what has never run, what is failing, spend vs the cap |

### The ripple bug, because it will be tempting to "simplify" it back

`InteractionFX` added one class, `.cw-ripple-host`, which set BOTH
`overflow: hidden` and `position: relative`. On a `position: fixed` button the
second half drops it into normal document flow the instant a finger lands on
it: the button teleports, pointerup lands elsewhere, the browser fires `click`
on the common ancestor, and the handler never runs. The class is never removed,
so it stays broken. Sixteen positioned buttons were affected including "Start
session and log". Clipping and positioning are now separate classes and the
positioning one is only applied to elements that are already `static`.
`tests/unit/ripplePositioning.test.ts` fails if they are merged again.

### Open — spec'd, not built

1. ~~**Lapse takeover.**~~ **DONE 13 Aug**, and it grew a third rung on the way.
   `lapseMood` now returns `quiet` for a client who has been silent 21 days but
   never logged regularly — Robert's case, where the original two-rung ladder
   said nothing because he had no habit to have fallen off. Correct by the rule,
   wrong about the person. The `quiet` screen never mentions logging and never
   wears the disappointed face. Snooze / off / tell-Dustin all live
   (`/api/checkin-preference`). Dry-run against real data before shipping: fires
   for 3 of 30, all gentle.
2. ~~**Ten more celebration variants.**~~ **DONE 13 Aug (`111a9cb`).** 38 in the
   rotation now, all wearing the sticker set. `celebrationLayout.test.ts` fails
   the build if the modulus and the `variant ===` blocks ever drift apart —
   which they silently did while writing these.
3. **The Outbox.** The coach escalating a question to Dustin's inbox with a link
   back to the conversation. The memory half of this is DONE and live
   (`src/lib/ai/clientMemory.ts` — append-only transcript plus a folded running
   summary, verified against real rows in `ai_chat_turns`). What is left is the
   escalation: when the coach decides something needs Dustin, it should land
   somewhere he actually reads, carrying the exchange that prompted it. Needs
   decisions from him on trigger, destination and whether the client is told.
4. ~~**The logger ✦.**~~ **DONE 13 Aug (`47da1c3`).** Header button, not a FAB,
   so the keyboard question never arises.
5. **Legacy food-photo path.** `MealPlanClient` posts to `/api/analyze-meal-photo`
   with no `clientId`, so a trainer-viewed photo bills the trainer. Every client
   is on `nutrition_v3`, so this is unreachable today — fix it or delete the
   legacy logger.

---

## Exercise demo videos — 252 missing, half-sourced  ← NEEDS A FRESH SESSION

Dustin, 13 Aug: "We have a ton of exercises in the library that do not have
videos... All videos need to be under thirty seconds, preferably under twenty."

252 of 847 exercises have no `video_url`. A client tapping play on one of those
gets nothing, mid-set.

**Built and shipped (`2d108bb`)** — the whole review pipeline:

- `exercise_video_candidates` — staging table, trainer-only RLS.
- `POST /api/video-candidates/verify` — batched duration check.
- `POST /api/video-candidates/decide` — the only thing that writes
  `exercises.video_url`. Refuses any candidate with no verified length.
- `/library/videos` — the queue. Thumbnail, length, two buttons.

**Sourced so far:** 151 candidates covering 151 exercises. **None have a
verified duration yet** — run "Check lengths" on `/library/videos` once, from
the live app, and the queue sorts itself shortest-first.

**Why the duration check runs on Vercel and not here:** a Cowork cloud sandbox
has no network route to youtube.com at all. Every request dies at the proxy,
`curl` included. This is the same class of thing as the git-push 403 — do not
re-diagnose it, and do not build anything whose duration check runs in the
sandbox.

**WHAT IS LEFT, and the exact reason it is left:** 101 exercises have no
candidate at all. `WebSearch` is capped at **200 calls per session** and that
cap does NOT reset mid-session — it was spent by the first round of agents.
Five agents spawned for the remaining 101 all returned zero, immediately, with
"budget used: 200 of 200".

So this is a **first-thing-in-a-fresh-session** job: 101 exercises at one search
each fits inside a fresh 200 comfortably. Get the list with:

```sql
select e.id, e.name from exercises e
left join exercise_video_candidates c on c.exercise_id = e.id
where (e.video_url is null or e.video_url = '') and c.id is null
order by e.name;
```

Instruct the agents: **one** WebSearch per exercise, no retrying with different
phrasing, never invent a video id, leave `duration_sec` NULL.

**Skip these — they are not movements.** Seven rows in `exercises` are fragments
of a pasted programme script that got parsed as exercise names. None is used by
any programme (`prescribed_exercises` count 0 for all seven), so they are safe
to hide, but **nothing has been deleted — that needs Dustin's say-so:**

- `Olympic / power lifts (cleans, snatches, jerks, high pulls, push press`
- `Pull: Superman (3×15) · Alternating Superman (3×12 ea) · Prone Cobra (3×12`
- `Warm-up: Body Weight Glute Bridge (2×15) · Cat Cow (1×10) · Prone Cobra (2×12`
- `Cable Half Kneeling Single Arm High Row — 3×12 ea`
- `Seated Leg Extension (partial range, VMO`
- `Dumbbell Reverse Lunge — confirm`
- `Dumbbell Seated Overhead Tricep Extension (Male`

Also skipped on purpose: `Sandbag Clean & Jerk`, `Dumbbell Squat Clean`,
`Dumbbell Push Press` — Olympic/power lifts are on the never-program list, so
sourcing demos for them is work that can only ever be wasted.

---

## 0. Logger reported a SAVED workout as a failure — FIXED 2026-08-11

**Shipped `39fc4a8`.** Lauren Standefer, 11 Aug 10:04am, mid-session:
"Couldn't finish the workout: duplicate key value violates unique constraint
`uq_workout_log_one_completed`."

Her workout had completed at 10:03:28. At 10:04:02 the logger inserted a SECOND
`workout_logs` row for the same client/day/date, copied all 24 of her sets into
it, and tried to complete that one. The partial unique index refused —
correctly — and the refusal was shown to her as her workout failing to save.

Root cause: `ensureWorkoutLog` treated "I hold no log id" as "no log exists".
The draft is cleared on completion, so every remount after finishing looks
identical to a fresh start. It now looks up client + day + sessionDate before
inserting, and a COMPLETED log always wins over a newer incomplete one — the
ordering matters, because Lauren's orphan was created 38 seconds AFTER the
completed row. Helper: `src/lib/workoutLogLookup.ts`, 7 tests.

An already-complete session now shows as finished rather than erroring, and
re-runs the schedule-marking block only when no `scheduled_workouts` row points
at the log yet — re-running it unconditionally would find "nothing scheduled
today" and pull a future session forward, which is the Sara Prince bug.

Data: her completed log and its 24 sets are intact and the 11 Aug schedule row
is `completed`. The orphan log and its 24 duplicate sets were removed, backed
up first to `bak_lauren_orphan_log_20260811` and
`bak_lauren_orphan_setlogs_20260811`.

## 0b. Decimals could not be typed into a recipe — FIXED 2026-08-11

Claudine Ocon, 9:08pm, with a photo of her screen: *"Recipe works but cant type
decimals in weight for each ingredient."* She wanted 1.5 lbs of ground beef and
could only ever get "1".

The field was controlled straight off a NUMBER:

```
value={it.amount ?? ""}
onChange={(e) => setIng(i, { amount: Number(e.target.value.replace(...)) })}
```

`Number("1.")` is `1`, so React re-rendered the box as `"1"` — **deleting the
decimal point on the keystroke that typed it**. The second digit then had
nothing to attach to. It is not rejecting decimals; it is erasing the point, so
from the other side of the screen it reads as a broken keyboard rather than a
bug. That is why it took a photo to report.

The P/C/F boxes beside it had the same shape plus `|| 0`, so clearing one to
retype snapped it back to 0.

Fixed with `src/components/NumericInput.tsx` + `src/lib/numericField.ts`: while
someone is typing, the TEXT is the source of truth and the number is derived
from it. A half-typed `"1."` reports nothing rather than committing `1`, so
totals never flicker mid-entry. 10 tests.

**Same fix applied to the meal-plan added-food amount** (`MealPlanClient.tsx`),
which had the same family of fault — `parseFloat("")` is NaN, which snapped the
field to 0 the moment a client cleared it to retype. That one is on a screen
clients use every day.

## 0c. Per-set timer, in the row you log — BUILT AND SHIPPED 13 Aug

Dustin: *"for timer lets have it function from where you set the actual time.
that way we can get rid of the timer button at the top. movements that track
time you set timer or stop watch right there where you log it, hit start, when
time is up it logs as complete but just like everywhere else you can still
manually log or unlog it as well as edit the time."*

**Why it is right.** Today the clock at the top opens a detached stopwatch that
has no idea which set you are on, so you carry the number in your head. A timer
that starts from the row's own time value and logs that set when it finishes
removes the bookkeeping entirely. Prone W Hold 0:20 × 3 becomes three taps.

**DECIDED:**
- **The timer gets its OWN control**, separate from the log button. Dustin,
  12 Aug. So the fast path — log it now, no waiting — is never taken away.
- **The log button no longer looks like a play button.** DONE, shipped: it is a
  hollow circle-check that animates into the drawn tick. That change had to come
  first, because a play triangle next to a countdown is misleading about which
  control starts the timer.
- **Remove the top clock button** once the per-set timer is in. Not before.

**CONFIRMED 13 Aug — placement.** Dustin picked **Option A** from the three
mocked placements: a small timer button in the row, beside the log button.

**CONFIRMED 13 Aug — modes.** *"we need to be able to toggle from timer to
stopwatch starting from zero."* So the behaviour is not inferred from whether
the time box is empty — every set can be flipped either way:

- a programmed time **counts down** from it and logs the set at zero
- **stopwatch** counts up from **zero** and logs what it measured on stop
- a set with no programmed time simply starts as a stopwatch
- stopping a countdown EARLY records the time worked but does **not** log it —
  a hold abandoned at 8 of 30 seconds is information, not a completed set
- a stopwatch face reads 0:00 before it is started, never the programmed target

**SETTLED 13 Aug — the toggle.** Three ways were mocked; Dustin picked
**(1) a Timer/Stopwatch switch above the sets**, per movement. It is rendered
only for a movement that tracks time — *"yes hide it on non-time movements, but
it needs to come up if we toggle time on"* — and both halves of that come from
the same condition, so switching the Time chip on brings it up in the same tap.

**SETTLED 13 Aug — the icon.** The log button is now a **bare check**, no
circle, chosen from four candidates. Unlogged it is drawn faint; logging draws
the same tick solid, so the animation reads as the mark being made rather than
one icon swapping for another.

**SHIPPED.** Timer button beside the log button in both the session view and the
list view; the top clock button and `TimerWheel` are deleted. Extra rules the
build settled:

- a stop within **2 seconds** is treated as a fumbled button, not a set —
  without it a mis-tap rewrites a 0:30 target to 0:02 and the first anyone knows
  is a log that reads wrong (`CANCEL_WINDOW_SECS`)
- the time box stays tappable and editable, logged or not; it is inert only
  while its own clock is running
- `logSet` gained an `overrides` argument. It closes over `sets` from the render
  that built it, so `updateSet()` then `logSet()` would have written the time the
  box held BEFORE the timer touched it. The auto-log path reaches it through a
  ref as well, because that call site lives inside an interval that is only
  rebuilt when a clock starts or stops.

**Found and fixed on the way:** both views listed TIME and DIST in the opposite
order to the input boxes underneath, so `DIST (ft)` sat over the seconds box.
Unreachable until 12 Aug — no movement could carry both fields, because distance
was not renderable — and visible the moment one could.

**BUILT 13 Aug — the engine.** `src/lib/setTimer.ts`, 18 unit tests. Pure, no
React, no UI decision baked in, so it fits whichever toggle wins.

It is **wall-clock derived, not a tick counter**. The obvious build,
`setInterval(() => secs--, 1000)`, is wrong on a phone: background the app
mid-plank or let the screen lock and the timers throttle, so a 60-second hold
comes back reading 41. State holds the epoch millisecond the run started and
every reading derives from `now`; the interval only forces a repaint. A missed
beat, or twenty in one second, cannot change the number on screen. `startOnly`
keeps exactly one clock running — starting a set pauses the others rather than
refusing the tap.

**Care needed.** This is `WorkoutLogger.tsx`, the file with the worst regression
history here — `tests/unit/loggerLayout.test.ts` names five separate shipped
bugs. A running timer is the first thing on this screen that changes state over
time, so it must not resize anything, must survive backgrounding the app, and
must not fight the pinned viewport height.

## 0d. Library tracked-field defaults — DONE 13 Aug

Dustin, 12 Aug: *"make all holds in library default to this"* (weight + time,
from the screenshot), then three overrides: *"suitecase do distance, single arm
overhead do sets and 1 min each side, hamstring curl hold weight and time 5 sec
holds."*

Verified in the database 13 Aug. Every `%Hold%` row carries a sensible pair;
`Single-Arm Dumbbell Overhead Waiter's Hold` is `time + each_side` and
`Hamstring Curl Isometric Hold` is `weight + time`, both as asked.

One was still wrong: **Suitcase Carry** was `duration + weight`. A carry is
programmed by how far you walk, and `distance` only became a field the logger
could render on 12 Aug — so it now reads `weight + distance`. Backed up to
`bak_exercises_tracked_2026_08_13` first.

**Left alone, needs a word from Dustin:** `Suitcase Hold` is a separate library
row and is still `reps + time`. That is right for a stationary hold, but if
"suitcase" meant this row rather than the carry, it wants `weight + distance`
too — or the two rows want merging.

**Cosmetic, not urgent:** some library rows still use the legacy key
`duration` where everything else says `time`. The logger maps `duration` → `time`
on read (`defaultTrackedFields`), so nothing is broken; it is just two names for
one field, which will eventually mislead somebody reading the table.

## 1. Custom workout from the schedule page  ← NEXT

`app_feedback` `73fcd284`, 2026-08-06, client-app, from Dustin.

> "Need full add workout custom from schedule page not just pick from library"

Today the schedule page only offers "pick from library". The full custom builder
exists elsewhere — this is about reaching it from the schedule page. Check
whether the AI "Create / Replace Workout" builder (shipped `900af2b`) can be
mounted here rather than building a second one.

## 2. Duplicate-programme bug — ROOT CAUSE FOUND AND FIXED 2026-08-11

**Shipped `1ca7876`.** Six duplicate (client, day, date) groups existed across
a 60-day window and FOUR of them shared a `created_at` to the microsecond —
one insert batch writing the same session twice. That is the copy-week path:
`loadWorkouts` on the trainer's programme calendar did not filter `deleted_at`,
so soft-deleted sessions were displayed; `copyCurrentWeek` read what was
displayed; `pasteWeekBulk` inserted it blind. A week holding one duplicate
pasted two copies forward and doubled again on every paste. Bobbie Page carried
four of the six groups, which is exactly what that looks like.

All three leaks are closed and the logic is a tested pure helper
(`src/lib/scheduleDedupe.ts`, 8 tests).

**CLOSED 2026-08-11.** Dustin: "yes add the unique index, shouldn't be doing
same session twice." Migration `uq_scheduled_workout_one_per_day` is live:
unique on `(client_id, day_id, scheduled_date) WHERE deleted_at IS NULL`, so a
soft-deleted session never blocks re-adding the same one.

The 6 pre-existing duplicate pairs were resolved first, keeping the row that
carried a `workout_log_id` (never orphan a logged session), then completed over
scheduled, then oldest — deterministic, never UUID-random. In every completed
pair BOTH rows already pointed at the same `workout_log_id`, so no session was
lost. The losers are soft-deleted, not removed, and the whole set is backed up
to `bak_dupe_sched_20260811`.

A constraint only helps if what the user SEES improves too — the lesson from
Lauren's toast the same morning. Every path that writes a scheduled session now
runs its error through `src/lib/scheduleConflict.ts`, which recognises this
index specifically (not any 23505, and not an FK failure wearing the same table
name) and says "that session is already on the calendar for that day" instead
of raw Postgres. Three of those paths — `assignDay`, `saveAndSchedule` and the
programme page's `moveWorkout` — were discarding their error entirely, so a
rejection would have looked like the button doing nothing at all.

### Original note (kept for context)

Three copies of **"Knee Stability & Strength"** exist (one 17 Jun, two 25 Jul;
one has zero scheduled rows). This is almost certainly the same root cause that
produced Dustin's triple-logged Arms A on 4 Aug: **one session scheduled by
three different sources** (`claude`, `trainer`, `client_self_assign` — confirmed
in `scheduled_workouts.source`).

Fixing the duplicate *programmes* without fixing whatever writes duplicate
*schedule rows* leaves the real bug in place. Find the write path first.
**Ask Dustin before deleting any programme.**

## 3. Add box bridge and ball bridge to the library — needs 30 seconds from Dustin

`app_feedback` `8aa820a9`, 2026-08-05.

**Checked 2026-08-11.** Neither exists as asked. The library has *Stability Ball
Bridge March Feet on Floor* — a specific variant, not the plain movement — and
nothing matching "box bridge" at all.

**Deliberately NOT added by guessing the names.** Rule 12 is exact movement
names, and inventing two is how the library ends up with near-duplicates that
do not come up in the swap search — precisely the failure Dustin hit trying to
switch a lying leg curl for a seated one mid-session.

What is needed, and it is quick: the **exact names** he programs them under,
whether each is corrective-tagged, and a video URL if he has one. Modality and
tracked fields can follow the ball-bridge row already in the library
(`bodybuilding`, `["reps"]`).

## 4. Full nutrients in the food logger  ← IN PROGRESS

`app_feedback` `2c2df05f`. **Scoped 2026-08-07: Dustin said FULL micros, and
"for AI get them all working properly."** Not fibre/sugar/sodium only.

### Done and shipped 2026-08-07

| SHA | What |
|---|---|
| `a0320dc` | One calorie formula. 4/4/9 existed NINE times and they were not identical (some rounded, some did not), so it had to be consolidated before adding fields or they would diverge further. Plus the first-ever test suite for `src/lib/ai/nutrition-json.ts`, which gates every AI nutrition reply and had ZERO coverage. |
| `716c58c` | Storage. `micros` jsonb on `meal_items`, `foods`, `food_catalog`, `recipe_ingredients`; `est_micros` on `meal_adherence_logs`; `total_micros` on `recipes`; nullable `kcal` on `meal_items`/`foods`. Canonical registry at `src/lib/nutrition/nutrients.ts` (33 nutrients). Migration `add_micronutrient_storage`, additive only. |
| `da30c87` | The AI half. `parse`, `plan-build`, `verify-food` and `analyze-meal-photo` all request and store micros. Prompt field list is GENERATED from the registry so it cannot drift from what the validator accepts. |

**Design rules — read before continuing this item:**

- Nutrients live in ONE `micros` jsonb per row, keyed by the registry. Not 33
  columns × 6 tables (~180 columns and a migration per nutrient).
- `fiber`, `sugar`, `sodium`, `sat_fat` keep their existing flat columns on
  `food_catalog` and as `est_*` on `meal_adherence_logs`, and stay
  authoritative there. **There is no dual write.** `readNutrients()` merges
  flat + jsonb and is the ONLY thing that should know this.
- NULL/absent = UNKNOWN, never zero. A 0 is a claim the food contains none of
  that nutrient and silently drags the day's total down.
- Adding a partially-known meal contributes what it knows rather than poisoning
  the day's total to unknown.
- `meal_items.kcal` is nullable: stored when known from a label, derived 4/4/9
  otherwise. Every existing row is NULL so nothing changed. This matches what
  `validateParseResult` already did — it trusts a positive model kcal over the
  formula, which is correct for alcohol, fibre and sugar alcohols.

### Still to do on this item

1. ~~**Plan path threading.**~~ **DONE 2026-08-11.** Micros and a label `kcal`
   now survive from the AI draft all the way to `meal_items`. FIVE separate
   layers were dropping them — the client's `PlanDraft` type, the draft→adopt
   mapping, the adopt request body, `AdoptItemInput`, and `plan-edit`'s clone
   `select()` list. Confirmed against real data: plan-build ran successfully
   for the first time ever on 11 Aug and `meal_items` still had zero rows with
   micros. Five tests in `tests/unit/adoptPlan.test.ts`.
2. ~~**Plan-meal nutrient path.**~~ **DONE 2026-08-11 (`173f60b`).**
   `planMealNutrientMap` reads the panel off `meal_items.micros`, honouring
   amount overrides and prorated by adherence. Three things had to change
   together: the calculator, the SELECT lists (`PLAN_SELECT` and
   `PlanRangeView` both omitted `micros`, and an omitted column reads exactly
   like an empty one), and the types (`LogRow.est_micros`, `CustomItem.mi`).
   `DayTotals.nutrientMap` now carries the whole registry and the legacy four
   are a PROJECTION of it, not a second calculation — they used to be computed
   twice down parallel branches, which is how a panel and a chart end up
   disagreeing about the same day.
3. ~~**UI.**~~ **DONE 2026-08-11 (`173f60b`).** The ALL NUTRIENTS panel renders
   the full registry grouped by carbohydrate / fat / mineral / vitamin, with
   % of daily reference where one exists. Nutrients nothing knew are hidden
   rather than shown as a column of dashes — the coverage footnote already
   states the gap.
4. **Backfill `food_catalog.micros`** from the USDA/OFF import (197,826 rows
   already carry the legacy four; the rest of the panel is available upstream
   for many of them).
5. **Two surfaces bypass the canonical calculators entirely** and will not pick
   any of this up: `MealPlanClient.tsx` and `NutritionAverages.tsx` run their
   own DB queries and their own maths. Worth fixing independently of micros.

## 4b. AI coach loop — draft to Dustin, approve/edit, send, LEARN  ← NEW, NOT STARTED

Dustin, 10 Aug (late): the AI should ask clients questions — "was this helpful?
would you like me to help you somewhere else? how can I help keep you on
track?" — learn each client's needs from the answers, and help them toward
their goals with ideas, tips and advice. Crucially: **drafts go to Dustin's
inbox as a special AI message for him to approve or edit before anything
reaches the client**, so the AI learns how he wants each client handled.

Half of this shipped in `429cbda`: the nudge voice now asks one short question
per message and coaches what each client actually uses. The other half — the
approval loop and the memory — is a real feature and was NOT attempted
overnight, deliberately: it needs a new table, a review surface in the inbox,
and send-on-approve plumbing. Half-landing that unsupervised is how main gets
left fragile.

**It should build on what already exists rather than starting fresh:**

- `/api/ai-nudges` already runs preview-first (`send` defaults false, writes to
  `ai_nudge_log` with `sent=false`, and digests to Dustin). That IS the
  approve-before-send skeleton — it currently just lacks a way for him to say
  yes.
- `/api/attention-drafts` is the existing "AI drafts, trainer reviews" pattern
  worth copying rather than reinventing.
- `client_private_profiles.coach_notes` already exists and is trainer-only —
  the natural home for learned per-client preferences, no new table needed for
  v1.

**Sketch:**

1. Nudge/coach drafts land in Dustin's inbox as a distinct AI-draft message
   type, with Approve / Edit / Skip.
2. Approve sends it to the client under his name (the send path already
   exists); Edit sends his version.
3. **What he changed is the training signal.** Store the diff between draft and
   sent, plus any Skip, against the client. Feed the last few into the next
   draft's context so the AI converges on how he talks to that person.
4. Client replies route back to him, and the useful ones get summarised into
   `coach_notes` so the next draft knows what that client actually responds to.

The learning is the point, and the diff between what the AI wrote and what
Dustin actually sent is the highest-signal, lowest-effort version of it.

## 5. Pull from Garmin / Google / Apple

`app_feedback` `95f11695`, 2026-07-29, from Todd Prine. Plan already written:
`docs/HEALTH-SYNC-HANDOFF.md` + `docs/GARMIN-APPLICATION-DRAFT.md`. Phase 0
shipped 2026-08-04. Parked behind the iPhone build, not blocked technically.
This feedback row can be closed against that work.

## 6. ~~Make "trainer" a setting instead of an email address~~ DONE 2026-08-11

All 63 call sites across 62 files now go through `src/lib/trainer.ts`, and
`is_trainer()` reads a `public.trainers` table instead of a string literal.
Same function signature, so all **64 RLS policies** that call it were untouched.

Verified before and after: across all 33 auth users the rewritten function
disagrees with the old literal on **zero** of them. The table was seeded and
matched against a real `auth.users` row BEFORE the function was swapped — doing
it the other way round would have denied all 64 policies at once and locked
Dustin out of every client's data.

Comparisons became `isTrainerEmail()` rather than `=== TRAINER_EMAIL`, which is
the part that actually enables a second trainer; the equality form compiles,
reads fine, and silently supports exactly one.

`tests/unit/trainerIdentity.test.ts` fails the build on a 64th hardcoded copy
of the address, with a capped allowlist for the three genuine business-contact
uses (privacy policy, payment links, the Open Food Facts User-Agent). Without
that scan the literal comes back within a month.

How to add a trainer: `docs/ADDING-A-TRAINER.md`.

**Still NOT done, and worth being clear about:** `is_trainer()` remains binary.
A trainer sees ALL clients. Per-trainer client scoping means changing the 64
policies themselves and is a separate, larger piece of work. This makes a
second trainer possible; it is not yet multi-tenancy.

## 7. iOS TestFlight

~45 minutes of App Store Connect clicks **only Dustin can do**. Steps in
`docs/IOS-RELEASE-CHECKLIST.md`. Build side is pre-flighted.

## 7b. The demo account shows an empty app  ← NOT STARTED, Dustin said "not yet"

Checked 2026-08-11 while confirming the download and login Dylan was given.
Both work: `symmetry.apk` (7.2 MB, 20 Jul) serves from Supabase storage, the
login page renders, and the four auth files touched this session are
behaviour-identical (verified across all 33 accounts).

The account itself is the problem. `test-client@symmetry-test.com`
("Test Client"):

- 8 scheduled workouts, **0 upcoming** — every one is in the past
- **0 meal plans**, 0 workout logs
- `password_is_temporary` still true, so sign-in forces the set-password screen
- last sign-in 3 July

So someone can download it, get in, and land in a blank app. Not caused by any
recent change — it has been this way since early July — but it demos nothing,
and for someone evaluating from a trainer's perspective it undersells the app
badly.

**The fix, when Dustin wants it:** seed that ONE account with a week of real
programming, a meal plan with macros, and a few logged sessions and weigh-ins so
the charts have shape. Test account only, nowhere near a real client.

## 7c. Help & Tutorials — LANDED 2026-08-11 (was never in this repo)

Dustin, 11 Aug: "we set up the tutorials in his app to guide him through
setting up to run app as is. what do we do now?"

The answer was worse than "they're stale". **The Help & Tutorials centre had
never landed in this repo at all.** It existed as two patch files in the
project docs (`help-center-READY-8-07.patch`, commit `fe1e23e`) and applied
only inside Dylan's fork. Retiring that fork — the entire point of this week's
work — would have deleted the tutorials with it.

Now in the shared repo, so both instances get it and it stays current with the
code: `src/components/HelpCenter.tsx`, `src/lib/help/articles.ts`, wired into
Settings, 20 tests.

Three things changed versus the patch:

- **Instance-neutral.** No article names a person; the product name comes from
  `BUSINESS_NAME`. A tutorial telling another trainer's client to contact
  Dustin is worse than no tutorial — it is confidently, specifically wrong. A
  test enforces it.
- **A new "Running Your Own Instance" category**, trainer-only, replacing the
  fork's setup guidance. It describes the app as it is NOW — configured, not
  edited — including the AI-key warning (a shared key spends the other
  instance's cap) and the APK warning (another instance's build opens their
  login screen).
- **Existing articles updated** for what shipped this week: early sessions
  consuming their slot rather than adding one, copy/paste-week not duplicating,
  a finished workout reading as finished, and the full nutrient panel.

**Standing rule, in the file header:** when a feature lands, its article changes
in the same commit.

## 8. Smaller / hygiene

- **Tim Yancey dip data.** His 4 Jul Assisted Dip records `20.00` assist and
  18 Jul has an empty `0.00 x0` set. Both look like mis-entries and will poison
  any all-time-best comparison now that assisted lifts are scored correctly.
- **~358 hardcoded colours** across ~40 files, outside the theme system.
- **64 pending schedule proposals** awaiting review.
- **Coach ranking decision.** The coach can now join a challenge, but joining
  does NOT make him ranked — that is `clients.exclude_from_rankings`, untouched
  on purpose. Dustin should say whether joining should imply ranked.

## 9. Security — mostly CLEARED 2026-08-11

- ~~**Old GitHub PATs in plaintext** inside `COWORK-INSTRUCTIONS.md`.~~
  **Verified clean.** Scanned the whole Trainer App folder for token-shaped
  strings across `.md`, `.txt`, `.sh`, `.ps1` and `.bat`: **zero matches.**
  The only credential present is `.ghtoken` itself, which is the intended store.
- ~~**~8 obsolete `push-sym*` helpers** from the dead Chrome-token era.~~
  **Moved 2026-08-11** into `Trainer App\_to_delete\` — 12 files including
  `push-symmetry-5.ps1/.sh`, `PUSH-NOW.bat`, the PUSH logs, and the stale
  4- and 5-commit patch/diff pairs. `device_bash` cannot delete, so Dustin
  removes that folder when convenient.
- **STILL OPEN:** the stray `.ghtoken` copy on the **Desktop**. Not reachable
  from a session (only the Trainer App and symmetry-app folders are mounted).
  Dustin deletes it manually.
