# Overnight — Saturday night into Sunday 16 Aug

**This is the one document.** Live status, the queue, and the short list of
things that genuinely need Dustin. Scheduled sessions read this, take the top
unfinished item, ship it, tick it off here, and stop.

Last updated by the 15 Aug evening session at **23:55 CT**.

---

## THE BIG FINDING OF THE NIGHT — Dylan's instance is a MONTH behind, in the database

Dustin asked whether v2 gets "all the updates we added in the last few days".
Syncing the **code** was the half everybody was thinking about. It is the easy
half, and it is now automated (`sync-from-live.yml`, below).

The half nobody had looked at: **the dev database schema is from 3 August** and
live has moved a long way since. Measured, not guessed — dev's last migration is
`20260803025624 harden_is_trainer_search_path`, and comparing the two schemas
directly, dev is missing roughly **35 real tables**:

```
ai_action_log            ai_chat_turns              ai_client_memory
ai_nudge_log             app_api_keys               app_flags
app_scheduler_key        birthday_posts             challenge_participants
challenge_templates      claude_handoff             client_announcements_seen
client_goals             client_program_feedback    client_training_patterns
exercise_video_candidates  food_import_state        gcal_sync_runs
group_challenges         group_reads                health_connections
health_daily             health_workouts            integrity_checks
message_reactions        movement_assessment_frames movement_assessments
notification_preferences progress_photos            recipe_ingredients
recipes                  schedule_change_proposals  schedule_generation_log
usda_nutrient_map        weekly_focus_drafts
```

Ship live's code onto that database and Dylan opens the app to errors on most
screens. The meal library he is meant to be testing has nowhere to live —
`recipes` and `recipe_ingredients` do not exist there.

**Good news, and it removes the step everyone thought was blocking:** the dev
project `giiovjfpbuzmrvpdglhv` is `ACTIVE_HEALTHY` and **already sits in its own
organisation** (`qmfsauherdswigrbhklh`), separate from Dustin's live org. The
Jul-20 handoff's "create an org and transfer the project" step is **already
done**. And this session has full SQL access to it — 60 public tables, 7 auth
users — so the schema catch-up can be done from here without Dustin.

---

## STATE RIGHT NOW — 23:55 CT

| | |
|---|---|
| `origin/main` (live) | `f2598da`, shipped and verified |
| Unit tests | **1,190 passed, 0 failed**; `tsc` 0 errors in `src/` |
| Ship bridge | **v2, repo-aware, up** — proved itself on three real pushes tonight |
| Live Supabase | trim COMPLETE — **956 MB → 363 MB**, 574,605 foods, under the 500 MB free limit |
| `symmetry-app-v2` repo | **seeded** — main is live main byte for byte (`f2598da`) |
| `symmetry-app-v2.vercel.app` | serving, but an OLDER build — `/api/health` 404s. Confirm this. |
| Dev Supabase `giiovjfpbuzmrvpdglhv` | **caught up** — 88 tables, 1,169 columns, 166 policies |

Both food import cron jobs are **stopped** (`off-bulk-import` job 36,
`off-micros-backfill` job 39). Do not restart them without Dustin: the catalog
cannot grow further on the free tier. `trim-off-catalog` has been unscheduled.

---|---|
| `origin/main` (live) | `1e5c8ad` — pending ship |
| Unit tests | green |
| Ship bridge | **v2, repo-aware, up** (`alive … v=2 repos=symmetry-app,symmetry-app-v2`) |
| Live Supabase | trim in progress, see below |
| Dev Supabase `giiovjfpbuzmrvpdglhv` | ACTIVE_HEALTHY, own org, schema from 3 Aug |

---

## DONE TONIGHT

### 1. The live database was on course to run out of room — stopped

`food_catalog` was **891 MB of a 956 MB database**, holding 1,759,618 of a
target 4,626,862 rows. At the measured per-row cost a finished catalog with
micronutrients lands near **3.5 GB**. The free tier includes **0.5 GB**. That is
what the `EXCEEDING USAGE LIMITS` badge on the dashboard meant, and the 94%
compute / 83% disk IO on the same screen was the import taking CPU away from
real clients' requests.

Dustin's call: keep a curated catalog, stay free, add the rest after an upgrade.

- Both import jobs stopped (`off-bulk-import`, `off-micros-backfill`).
- Deleting the 1,190,308 non-US/CA Open Food Facts rows — the rule is
  `source='off' and length(barcode)>12 and left(barcode,1) not in ('0','1')`.
- **Verified before deleting anything:** 0 of those rows are logged by a client,
  0 appear in `recipe_ingredients`, 0 have `created_by_client_id`, 0 are
  `verified`. Pure imported bulk.
- Not backed up row-for-row **on purpose**, and that is recorded in
  `bak_food_catalog_offtrim_20260816` with the rule and the reasoning: every row
  is a copy of public Open Food Facts data, re-derivable by re-enabling cron job
  36. A row-for-row backup would have doubled the disk usage the exercise exists
  to reduce.
- Running as pg_cron job `trim-off-catalog` rather than from the API, because
  batches large enough to matter exceed the 60-second request timeout. It stops
  itself when the last row is gone.

What survives: **573,905 foods**, 100% with calories/protein/carbs/fats and a
real serving size; 552,038 scannable barcodes; 177,504 with the full 33-nutrient
panel of which 26,746 are lab-measured, including all 12,825 USDA whole foods.

**Why this is not a loss:** `/api/nutrition-ai/barcode-lookup` already falls back
to Open Food Facts live on a miss and writes the product into the catalog. A
trimmed product costs one second, once, and is then permanently present. The
effective catalog is still all 4.6M; Dustin just stops paying to store the 4M
nobody scans.

### 2. The ship bridge is repo-aware — v2 is shippable at all now (`aa6f61c`)

`ship-watcher.sh` lived only on Dustin's laptop, unversioned, with the target
repo as a constant. So v2 could never be shipped to; every attempt since 20 July
ended in "needs Dustin's hands".

Now the cloud names its target in `outbox/SHIP-REPO`. No file means live, so
every existing habit and every scheduled session is unchanged. Seeding a fresh
dev repo is necessarily not a fast-forward, so there is a force path, fenced
three ways: `SHIP-FORCE` must NAME the repo, the push uses `--force-with-lease`,
and the live repo is refused before anything else runs.

Both scripts are now **in the repo** at `tools/ship-bridge/`.
`ship-watcher.test.sh` — 21 assertions against throwaway repos. Every guard was
then deleted on purpose to confirm the tests fail without it. **Six of seven
did.** The seventh — the check that the bundle tip is the SHA the cloud actually
verified — passed 19/19 with the check removed, because every case wrote a
matching SHA. Case 10 exists because of that.

### 3. A dev instance can no longer redeploy the live app (`1e5c8ad`)

`vercel-deploy.yml` hard-codes the LIVE Vercel deploy hook and fires on every
push to main. Copied to v2 verbatim — which is the entire plan — **every dev
push would have redeployed `symmetry-app-omega`**, the app 27 real clients use,
and shown a green tick doing it. Now gated on `github.repository`; any other
instance uses its own `VERCEL_DEPLOY_HOOK` secret.

Also: that `curl` had no `-f`, and curl exits 0 on an HTTP 404 — a rotated hook
would have reported success on every push while nothing deployed.

`sync-from-live.yml` is the other half: a nightly one-way mirror of live main
into v2 at 03:00 Central, so dev cannot drift back into being a fork. Gated OFF
on the live repo at the job level, and it pushes to literal `origin`, so no
arrangement of secrets can aim it at live. It prints what it discarded rather
than swallowing it.

`workflowsAreInstanceSafe.test.ts` asserts the rule generally: any step naming a
live-only resource must sit behind a repository check. Reverting
`vercel-deploy.yml` to its previous contents fails 3 of its 13 assertions.

---

## THE QUEUE — take the top unfinished item

### [x] A. Bring the dev database up to live's schema — DONE, 23:40 CT

Shipped as `supabase/migrations/20260816_dev_instance_catchup.sql`, applied to
dev in seven named migrations (`dev_catchup_01`…`_07`). Verified by querying the
database afterwards, not by trusting a success response:

| | before | after |
|---|---|---|
| Tables | 53 | **88** |
| Columns | 1,087 | **1,169** — 0 still missing versus live |
| Policies | — | **166**, RLS on all 88 tables |
| Foreign keys | — | **108** |
| Hardcoded-email policies | — | **0** (live still has 14) |

**How the diff was found, and why the obvious method would have missed it.** Dev
was built from a schema *dump*, so its migration names bear no relation to the
repo's — a filename diff shows nothing useful. The two catalogs were compared
directly instead: 35 missing tables and 82 missing columns.

**The thing worth remembering.** Seven of live's policies name
`symmetrypersonaltraining@gmail.com` literally instead of calling
`is_trainer()`. Copied to dev verbatim they compile perfectly and show Dylan
**empty tables** on those screens — no error, nothing to notice, he would simply
report working features as broken and we would chase ghosts. They call
`is_trainer()` on dev, which there means Dustin + Dylan. Each rewrite is marked
in the migration.

**Still open on dev, for a later run:** seed data for the new tables
(`challenge_templates` is empty and the challenges UI reads it;
`usda_nutrient_map` likewise), and the storage buckets for `progress_photos` /
`movement_assessments` keyframes. Neither blocks a login.

**Live is untouched.** Every statement above ran against `giiovjfpbuzmrvpdglhv`
only, and every one is idempotent, so the migration file is a no-op on live.

### [x] B. Seed `symmetry-app-v2` from current live main — DONE, 23:48 CT

```
OK pushed [symmetry-app-v2]. main c5cd628 -> f2598da (FORCED - history replaced)
```

The July placeholder commit is gone. **v2's main is live main byte for byte** —
not a fork, not a rebuild from the Jul-20 spec, which was superseded anyway when
the hardcoded-email sweep landed on live on 11 Aug (`src/lib/trainer.ts`,
`NEXT_PUBLIC_TRAINER_EMAILS` / `NEXT_PUBLIC_COACH_NAME` /
`NEXT_PUBLIC_BUSINESS_NAME`). v2 differs from live by environment variables and
nothing else. That is the whole point: a configuration, not a fork.

The bridge did it unattended — cloned v2 on Dustin's laptop by itself, refused
the plain push because a fresh dev repo cannot be a fast-forward, accepted the
force only because the request named v2 explicitly, and pushed with
`--force-with-lease`.

`https://symmetry-app-v2.vercel.app` serves a login page. As of 23:50 it is
still an OLDER build — `/api/health` 404s and that route has been on live since
15 Aug — so Vercel is either mid-build or waiting on the `VERCEL_DEPLOY_HOOK`
secret. **A later run must confirm the deploy actually went green rather than
assuming the push implied it.** If `/api/health` still 404s, the deploy did not
happen and that is a finding, not a delay.

### [x] NEW — Meal plans can be scheduled ahead and seen ahead (`86727f7`), 00:55 CT

Dustin, mid-session: "there is zero logic behind me not being able to plan
ahead, schedule a meal plan and look at it ahead of time." Four causes, only one
of which had been noticed:

1. `trg_no_future_live_plan` / `trg_no_future_macro_target` raised on any future
   date. Dropped; definitions preserved in `bak_dropped_plan_guards_20260816`.
2. A plan booked ahead is written `pending` and promoted overnight, and neither
   the fetch nor `pickPlanForDate` considered `pending` — so it was invisible
   until the morning it started.
3. plan-edit, adopt-plan and `flip_due_meal_plans` all archived by status
   alone, with no date bound — so any of them could retire a plan booked for
   later. Gerard and Jerry have eleven plans booked to October; the next flip
   would have taken ten. All three now bound the archive to plans in force.

   **CORRECTION, and it was mine.** I first reported this as having already
   destroyed Dustin's v3 plan dated 24 Aug, because I found it archived with a
   future date and matched it to the bug I had just found. He questioned it and
   he was right: that row's own `change_reason` ends "SUPERSEDED by BULK v2 on
   Aug 16, 2026 — never activated". It was replaced deliberately by a plan
   starting the 17th instead of the 24th, and the reason was written down in the
   row I was looking at. I asserted a cause from a matching shape without
   reading the evidence that was already in hand — the same failure as taking a
   route's `200` for proof the feature worked. The BUG is real and the fix
   stands; it simply had not bitten yet.
4. The recipes page and the **AI coach** asked for "the newest live plan" with
   no date bound — which today is a plan dated tomorrow.

`MAX_PLAN_VERSIONS` 20 → 60: cut at twenty with eleven future rows sorting
first, only nine slots remain for history, which would have reintroduced the
Claudine bug through the back door.

**Left undone deliberately:** Dustin's 24 Aug plan is still `archived`. Restoring
it changes a real plan row and needs his word.

### [ ] C. Prove the AI plan builder actually uses the meal library

Shipped `6887ce7` — 50 meals and 20 recipes are in the plan-builder system
prompt. **Never executed against the real model.** Call
`/api/nutrition-ai/plan-build` with real targets and check whether library meal
names come back verbatim. A name that is NOT in the library verbatim is the
worse finding — nothing downstream would resolve it.

### [ ] D. The 92 unchecked writes — triage the rest

`c7d06c6` fixed the workout adjuster, which was reporting failed writes as
completed actions. A sweep found 92 candidate sites; most are legitimately
fire-and-forget (push, telemetry). Classify them. Fix any where a discarded
error is reported to a human as a completed action, and say which are genuinely
fire-and-forget. Regenerate the list by walking `src/` for
`await …from(x).insert|update|delete` whose result is not destructured.

### [ ] E. Photographs for the meal library, by URL

Dustin asked for images. Nothing here can generate or download them — but they
do not need downloading. Open Food Facts publishes an image URL for most catalog
products, and Wikimedia Commons has permissively-licensed food photography for
the 50 meals and 20 recipes. Store the URL and the attribution; costs nothing in
storage. Add a column, wire it through the meal and recipe cards, leave it null
where nothing decent exists rather than shipping a wrong photo.

### [ ] F. Micronutrients below the day level

The day total already has it — the nutrition screen's "ALL NUTRIENTS" panel,
full registry, grouped, hiding unknowns rather than showing dashes. **Do not
rebuild that; it exists.** A previous session grepped for its call site with
`grep -v dailyTotals.ts` — the one file that calls it — concluded "called from
nowhere", and shipped a duplicate.

Still missing: `FoodSearchSheet` carries fiber/sugar/sodium/satFat on its type
and scales them correctly, then renders none of them. `ComposerSheet` has no
nutrient handling at all. Use `groupedNutrients` and `pctOfDaily` from
`@/lib/nutrition/nutrients`. Write no new formatters — that is exactly what
produced the duplicate.

### [ ] G. Exercise videos — 101 unsearched

Needs a fresh WebSearch budget, which a new session has. See
`docs/EXERCISE-VIDEOS-THE-REAL-NUMBERS.md`. Six have no candidate at all; the
worst is 1,098 seconds.

### [ ] H. `coach_read` is orphaned

`CoachFocusCard` is mounted nowhere; `/api/coach/focus` is called by nothing.
Deleting both is the tidy-up — safe, but only worth doing with tests green and
nothing else in flight.

---

## RULES FOR THE OVERNIGHT SESSIONS

1. **The ship bridge must be up.** Check `outbox/watcher-alive.txt` is fresh via
   `device_list_dir`. If it is stale, do NOT start — leave a note and stop. A
   commit that never ships dies with the container.
2. **Gates before every ship:** `npx tsc --noEmit` (0 errors in `src/`),
   `npm run test:unit` (0 failed), `npx next build`. The `/login` prerender error
   about Supabase env vars is expected in the sandbox — ignore it.
3. **Mutation-test every guard you write.** Break the code on purpose, watch the
   test fail, restore. This caught a real hole tonight and two on 15 Aug.
4. **Verify against the database, not against a success response.** On 15 Aug a
   route returned `200` with correct numbers over a completely broken library.
5. **Any schema change ships as a file in `supabase/migrations/`.**
6. **OFF LIMITS without Dustin's per-item permission:** both workout loggers.
   Do not delete a programme. Back up before any destructive DB change — and if
   a row-for-row backup is the wrong call, say so and record why, as
   `bak_food_catalog_offtrim_20260816` does.
7. **Do not message any client.** Ever, without Dustin.
8. **Never write to live Supabase or the live Vercel project** for v2 work.
9. **One logical change per commit**, shipped before the next one starts.
10. **If a task turns out to be already done** — check first — tick it and move on.
11. **Update this file** as work lands. One document, not five.

---

## NEEDS DUSTIN — the whole list, nothing else

Everything above can be done without him. These cannot:

1. **`ANTHROPIC_API_KEY` on the symmetry-app-v2 Vercel project.** Copy the value
   from the live project's env vars. Without it the AI features are dead on
   Dylan's copy — food photo macros, plan building, the coach.
2. **Repo secret `UPSTREAM_SYNC_TOKEN`** on `symmetry-app-v2` (GitHub token,
   repo scope). This is what lets the nightly sync push. Without it dev drifts
   again and we are back to a fork.
3. **Repo secret `VERCEL_DEPLOY_HOOK`** on `symmetry-app-v2` — a deploy hook
   from *its own* Vercel project. Only needed if v2's Vercel is not already
   deploying from git.
4. **Invite `dylangautreaux@gmail.com` to the "Symmetry Dev" org only** —
   org `qmfsauherdswigrbhklh`, never the live org. The project transfer is
   already done, so this is the last access step.
5. **Supabase compute / disk decision** — deferred by tonight's trim, not
   removed. The catalog stops growing now; if the rest is wanted later it needs
   Pro.
6. **17 clients run out of programming on Aug 31** (task #11). His call, not a
   build task.
7. **Jerry Bourgeois — nutrition only.** Recorded in memory. No programme.
