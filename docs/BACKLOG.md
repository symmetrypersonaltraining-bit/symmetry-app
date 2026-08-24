# Backlog — the single work queue

> ## 👉 23 Aug — A SECOND TRAINER, AND WHAT SHE COULD SEE
>
> **`origin/main` = `c8b9102`.**
>
> Brooke Orton got a login and found three bugs before lunch. Chasing them
> turned into a feature-by-feature sweep of a non-owner trainer's app against
> Dustin's, because his standard is: *"I want every single feature to function
> like my literal app. The only thing that changes is I have certain owner
> rights that they do not."*
>
> ### Shipped
>
> | | |
> |---|---|
> | `c5dcbc6` | Her three: `days.position` was `Date.now()` (a 32-bit int column — workout creation failed for **every** trainer, always); exercise rows could be added but never removed; the AI plan builder promised 3%/5g tolerance and checked nothing (told 160g protein, handed 198g). Plus her idea: typing macros auto-fills calories. |
> | `5c08f3e` | Inviting a trainer created an auth user and a `trainers` row and stopped. No self-client row, no client view, no nutrition toggle. `ensure_trainer_self_client()` now runs on invite; Justin, Ian, Alan and Brooke backfilled. |
> | `1c5be71` | **`ai_chat_sessions` had no trainer column.** One rolling `trainer_agent` row for the whole instance, read with the service role. Brooke opening the AI drawer would have read Dustin's thread verbatim, overwritten it with her first question, and deleted it with Clear. |
> | `75eaf92` | Four surviving `/dustin/i` name matches deciding "which of these clients is the coach". Adds `src/lib/auth/roster.ts`. |
> | `9276b31` | Prompts that named the owner in text every trainer's requests pass through (`DUSTIN'S VOICE`, `DUSTIN'S REQUEST`). |
> | `d047444` | Controls drawn to a trainer that she cannot operate: two `app_flags` switches that flip and silently revert, `/settings/ai-health` (whole-business AI spend, gated as "trainer"), `{reset:true}` on gcal-sync (empties every trainer's appointments). Plus: rankings read the `trainers` table, and Schedule → Calendar no longer links to a page that redirects. |
> | `3e5c6c7` | **"Is a trainer" is not "is this client's trainer".** Service-role routes that never re-imposed `trainer_can_see_client()`: plateaus, live-sessions, attention-drafts, focus-drafts (including *approve all*, which published), weekly-ai POST. |
> | `c8b9102` | Tutorial: a **Setting the numbers** step (her actual first question), the AI target check, and the remove-a-row control. |
>
> ## 👉 24 Aug — THE FOOD SHEET (`7b72a7c`)
>
> **Barcode.** The code Dustin sent — `048121959449` — is a **valid UPC-A**; the
> check digit verifies, so the scan worked and the fault was what came after it:
> *"Not in our database yet — want us to look it up?"* A routine cache miss,
> phrased as a failure, standing in front of a lookup that always runs. It runs
> on its own now; the only screen left is the genuine dead end where Open Food
> Facts has not heard of it either.
>
> The other half of his report was real. The detect loop took the **first**
> result of the **first** frame that decoded anything, at ~60fps — a verdict
> before the phone was level. A code now has to pass its check digit and be read
> identically **three frames running**, and an empty frame resets the run.
>
> **Say what changed.** `/api/nutrition-ai/meal-edit` — handed the meal's
> *current* items with their ids, which is what lets it answer with `remove` and
> `set` rather than only `add`. (The existing `parse` route has never been told
> what is already on the plate.) Dictation included. **Nothing is saved**: the
> reply lands in the same pending state the steppers write to and Save is still a
> deliberate press, with a line on screen saying so. Its own feature name,
> sharing `food_parse`'s daily allowance.

---

> ## 👉 24 Aug — THE FACE LIBRARY, AND AI HEALTH FOR EVERYONE
>
> **SHIPPED. `origin/main` = `7b72a7c`, live on Vercel (verified via
> /api/version at 07:20 CT on the 24th).** The bridge was offline from ~6:30pm
> to ~7:15am, so nine commits went out in one batch.
>
> ### The avatar library (`e720a01`, `cd25788`)
>
> Dustin: *"a library in all trainer apps to upload avatars to be cycled
> through... a section for each type... coded so that you use those avatars in
> appropriate places w proper emotions."*
>
> Most of it existed — `trainers.bot_set`, twenty named slots, and `faceSrc()`
> already asking for a face by emotional register. Three things did not:
>
> 1. **One image per slot.** The upload wrote `<slug>.webp` with `upsert:true`,
>    so a second upload replaced the first. `trainer_face_variants` holds many;
>    `faceSrc` picks one by a stable seed (day by default, or the thing being
>    shown) so it does not flicker or mismatch on hydration.
> 2. **No sections.** Now grouped by where they appear, with the two the app
>    draws constantly marked *start here*.
> 3. **THE FALLBACK WAS A LIE.** The upload screen and the walkthrough both said
>    anything not uploaded falls back to the standard set. `setDir()` picked ONE
>    directory for the whole set, so a half-finished set rendered **broken
>    images on the client's screen**. A trainer following the app's own advice
>    would have hit it immediately. `faceSrc` resolves per slug now.
>
> Also reversed: the group-chat bot wears the room coach's face. It didn't,
> because the room used to be shared.
>
> ### AI health (`38e029f`) — and a wrong call corrected
>
> On the 23rd I found `/settings/ai-health` gated on "is a trainer" and then
> reading the whole business's costs with the service role, and I made it
> **owner-only**. Wrong fix. The page's own header says why: *silence is the
> failure mode*. A trainer with no health page cannot tell "nobody uses this"
> from "this has been broken for my clients all week" — the exact blindness the
> page exists to end.
>
> Health is now per-trainer; the month-to-date spend stays owner-only (one key,
> one cap). `ai_usage_log` gained `trainer_id`, stamped by a **trigger** rather
> than a `logUsage()` argument — an argument is one chance to forget at every
> call site. 1,327 of 1,342 rows backfilled.
>
> ### Verified live overnight
>
> - **All seven rooms have a live challenge** as of the 7:05pm tick. Dustin's
>   rotated to *No Zero Days*; the six new rooms started at template 0.
> - **The winner announcement posted and was stamped** — Lauren, 7 days, in
>   Dustin's room. The first one that will actually be visible to anyone.
> - All six non-owner trainers messaged twice: the per-room features, then the
>   avatar library and the Gemini script.
>
> ### 👉 Eight owner-only calls left for Dustin
>
> `claude/QUESTIONS-2026-08-24-OWNER-ONLY.md`. Each has a defensible default in
> place; none are blocking. The sharpest one: **the owner currently cannot read
> another trainer's group chat** — that may be right or exactly wrong, and I did
> not change it either way.

---

> ## 👉 23 Aug — EVERY TRAINER GETS WHAT DUSTIN HAS (`4fb1da9`)
>
> Dustin: *"if I have a group chat with challenges and ai bots, and other
> trainers do not, thats not exactly like mine is it? ... if I have it on my
> trainer app, build it exactly the same on theirs."*
>
> **The rule from here: if he has it, they have it.** Owner-only is for things
> he is asked about first — billing, inviting trainers, instance-wide switches,
> whole-business cost. Nothing else.
>
> Two answers before this one were wrong in the same way: an audit that produced
> owner-only gates instead of the feature. Those gates are gone.
>
> ### What was actually broken (not just unfinished)
>
> `20260821g` split the rooms and added `group_challenges.trainer_id`, then
> stopped. Every reader and writer was still single-room, and four were live
> faults:
>
> - `generate_next_challenge()` and the `/api/challenge` create **inserted with
>   no `trainer_id`**, from pg_cron and the service role where `auth.uid()` is
>   NULL. The trigger stamped NULL; the read policy requires NOT NULL. A trainer
>   pressed Start, got `{ok:true}`, and **nobody including them could see it**.
> - *"Never two live at once"* was global — once any trainer had one, no other
>   trainer would ever get an auto-generated challenge again.
> - `announce_challenge_winner()` posted with no `group_trainer_id` → the winner
>   announcement was shown to nobody.
> - `challenge_leaderboard()` ranked **every client in the business**, so one
>   coach's clients appeared by name on another's board.
> - Starting a challenge **completed every other trainer's**; ending took an id
>   with no ownership check; `challenge_participants` was `using (true)`.
>
> ### Now
>
> One challenge, one board, one rotation, one Coach Bot and one birthday bot
> **per room**. `close_due` scores every due room instead of one per hour. The
> hourly tick generates for every active trainer. A trainer firing a bot by hand
> runs her own room. `my_group_trainer_id_for(user)` lets the service-role routes
> ask the same question the database asks.
>
> **Tonight at 7:05pm CT the tick gives all seven rooms their first challenge.**
> Dustin's just scored at 18:05 (Lauren, 7 days) and announces at 19:05 — the
> first announcement that will actually be visible.
>
> Also fixed: **Oliver Gergelj had no self-client row** — he was added after the
> 22 Aug backfill and missed it. `ensure_trainer_self_client` run; all seven
> trainers now have a client view, settings and bots.
>
> All six non-owner trainers messaged in-app. Tutorial and help updated
> (`msg-group` rewritten, new `msg-challenge` step, new `group-challenge`
> article).

---

> ### 23 Aug, later — THE GROUP ROOMS (`0bd3545`)
>
> I got this backwards earlier and wrote the wrong reason into a comment.
> **The rooms were split per trainer on 21 Aug** — a group chat is one trainer
> and their clients, never shared. Dustin: *"group chat is for trainer n their
> clients only not shared."*
>
> Reading was always correct: `messages.group_trainer_id`, the
> `stamp_group_message` trigger and the `read_own_group_messages` policy do the
> right thing. **Writing was wrong in three ways.**
>
> 1. `my_group_trainer_id()` resolves through `auth.uid()`. Every bot and the
>    trainer agent insert on the **service role**, where `auth.uid()` is NULL —
>    so the trigger stamped NULL, and the read policy requires NOT NULL. Probed
>    the live database to confirm. **Coach Bot's next post would have been the
>    first invisible one: the cron fires 5pm CT Mon/Wed/Fri, the split shipped
>    Friday, and this was caught on the Sunday.**
> 2. The agent's group branch posted as `ownerAuthUid()` — Brooke's post signed
>    as Dustin, filed in his room, her clients never seeing it.
> 3. Coach Bot's leaderboard, the birthday sweep and the push fan-out all read
>    the whole instance while posting into one room.
>
> ### Still to do here
>
> **Run the bots per room.** Both still post only in the owner's. That needs a
> **challenge and a leaderboard per trainer** — `group_challenges` is one
> instance-wide row and `v_active_challenge` is `limit 1` — so Brooke's room has
> nothing to tease yet. Until then a non-owner can preview (`?dry=1`) but not
> fire. The board and both rosters are already filtered to the room, so nothing
> leaks in the meantime.

> ### The seven — all answered and shipped (`a28ff10`)
>
> | | answer |
> |---|---|
> | `gcal_sync_runs` has no `trainer_id` | **Scope the read, not the table.** The per-trainer outcome was already inside `response -> 'trainers'` — it just had no `user_id` to match on and had been trimmed of `errors`/`unmatched_samples`. `my_gcal_sync_health()` gives the owner the whole run and every other trainer only their own slice. Table stays owner-only. |
> | The bots post as the OWNER | **Correct, and left alone** — the group chat is shared by decision. What was wrong is that any trainer could *fire* them. A real post is the owner's; `?dry=1` preview is open to everyone. |
> | `ai-nudges` files in Dustin's inbox | Scoped to the caller's roster and addressed to the caller. The scheduler keeps the whole-business sweep. **Note: the engine is switched off — it cannot message a client (`didSend = false`) and has no cron. This is tidying a thing nobody is running.** |
> | `/assessment` and `/library/*` ungated | **Real.** Server gates as layouts, so the next page under either path inherits them. |
> | Unsigned OAuth `state` | **Real, and the worst of the seven.** HMAC-signed and time-boxed, plus a session cross-check. See `src/lib/auth/oauthState.ts` for what it bought an attacker. |
> | `active !== false` vs `=== true` | One reading, all three readers. |
> | `middleware.ts` auth-id only | Resolves by auth id **or** email, like `viewer.ts`. |

> ### Still open from before
>
> - Steph's `plan_locked` was Claude's judgement call — one line to undo.
> - 10 exercise-video candidates awaiting approve/reject.
> - The 1,043 orphan scheduled workouts stay **parked**.
> - 4 `macro_target_stale_against_plan` flags: Tyler, Hassan, Robert, Gerard.
> - Hassan's plan covers day groups [1,4,6] and [2,5] — **Wednesday and Sunday
>   have no menu** and fall through to his 1800 placeholder. Dustin: leave as is.
> - Claudine's options-plan target; Madeleine's incomplete plan.

---

> ## 👉 23 Aug — THE FOOD LOGGER READS THE PLAN, AND SEVEN PLANS DO NOT ADD UP
>
> **`origin/main` = `a528124`.**
>
> Dustin: *"whatever I set for the meal plan, the macros on the day chart in the
> food logger read what the actual plan is for that day... If I change my meal
> plan each day, it needs to pick up what I'm actually at."*
>
> **It did not.** The MENU was resolved per viewed date correctly. The NUMBERS
> above it came from a `macro_targets` row, resolved once on the server for
> TODAY and passed down as a prop that never re-resolved. So the bar and the
> food under it were two independent numbers, and paging to next Monday showed
> today's target over next Monday's food. The plan-summing code already existed
> — gated on the plan being a DAY-GROUP menu, with a comment saying every
> ordinary client keeps the old path.
>
> `planDayTarget()` now lives in `dailyTotals.ts` and both surfaces read it (the
> Nutrition screen and the home ring, which are required to agree).
>
> ### ⚠️ And then the measurement, which is the real story
>
> I shipped it for everyone, THEN checked what it did to every client rather
> than only to Dustin. It moved **eleven** targets:
>
> | | shown | would become | |
> |---|---|---|---|
> | Cheyenne Martin | 2,440 | **1,480** | −960 |
> | Tyler Dorsett | 3,040 | **2,135** | −905 |
> | Madeleine Coker | 1,550 | **973** | −577 |
> | Hassan Kareem | 1,800 | 2,501 | +701 |
> | Claudine Ocon | 1,920 | 1,550 | −370 |
> | Gerard · Robert · Lauren · Sharon · Jerry · Jenn | | | +311 … −75 |
>
> **Dustin and Steph were unchanged to the gram** — which is exactly why it read
> as safe. Theirs were the only two verified.
>
> Those gaps are **incomplete plans, not wrong targets**. Cheyenne's plan sums
> to 1,480 against a 2,440 prescription. Deriving from it would have shown a
> client several hundred calories under what their trainer set, on their phone,
> in the morning.
>
> **Gated on `clients.plan_locked`** — a locked plan is authored outside the app
> and is the whole prescription by construction, which is precisely the client
> for whom the plan IS the target. Everyone else keeps `macro_targets` untouched.
> Both surfaces gate on the same condition and a test pins that they do.
>
> **New nightly check `plan_total_disagrees_with_macro_target`** (cron 17), 10%
> tolerance with a 100 kcal floor. Seven clients flag today. Nothing had ever
> compared those two rows.
>
> ### NOT changed, deliberately
>
> - **Range averages** already read logged rows only — a plan change cannot move
>   an 8-week average. Now pinned by a test. *"it needs to give me my actual
>   averages that were logged. It does not need to worry about the changes."*
> - **Adherence %** still grades every day in a range against ONE target (the
>   newest). Over a range spanning a plan change, older days are scored against
>   newer numbers. More accurate would be per-day; not moved without Dustin,
>   since it is a number he watches.
>
> ### Open for Dustin
>
> 1. **The seven plan/target gaps** — a real data problem in their own right.
> 2. Say the word and the gate widens past `plan_locked` once they line up.

> ## 🚨 22 Aug NIGHT (3) — THIRTEEN CLIENTS ARE EATING TO A NUMBER NOBODY CHOSE
>
> **`origin/main` = `d8101a2`.** ⚠️ **`20260822l` is NOT APPLIED** — the Supabase
> connector's token expired mid-session. Apply it from the SQL editor.
>
> On 23 Jul something auto-seeded a macro target of **1,800 kcal / 150P / 165C /
> 60F**, with its own rationale reading *"no bodyweight on file. Refine after
> weigh-in."* **It was never refined.** For **thirteen active clients** that
> placeholder is still their only macro target.
>
> **Six are logging food against it:**
>
> | Client | Days logged | Last |
> |---|---|---|
> | Robby Burns | **141** | today |
> | Martha Montgomery | **110** | today |
> | Krysta Ruiz-Schnitzler | 61 | 11 Aug |
> | Todd Prine | 30 | 19 Aug |
> | Hassan Kareem | 6 | 8 Aug |
> | Troy Schnitzler | 1 | 16 Jul |
>
> Seven more hold the placeholder with no logs yet: Celeste, Christine, Grant,
> Greg, Laurie, Stacie, Tim. Four archived clients also have it and are excluded.
>
> **The numbers are Dustin's to set. Nothing was changed.** What changed is the
> check: `placeholder_macro_targets` had been reporting a bare count of `17` as
> **info with no detail** since 23 Jul, which is exactly why it went unread for a
> month. It now names the clients, counts their food logs, drops archived
> clients, skips anyone whose placeholder was later superseded, and is a `warn`.
>
> **None of these clients has a `current_weight` on file**, which is what the
> placeholder was waiting for. Four of them do have weigh-ins in `metrics`
> (Robby 5, Martha 3, Todd 3, Hassan 1) — so the weight exists, it just never
> made it onto `clients.current_weight`. That is probably the same gap the
> `client_weight_drift_from_metrics` warn is pointing at from the other side.

> ## 👉 22 Aug NIGHT (2) — EVERY DATE IN THE APP IS A CENTRAL DATE NOW
>
> **`origin/main` = `9643951`.**
>
> Dustin: *"the wrong workout date is an issue. this must be fixed to be
> accurate. everything in th eentire app needs to go by the actual calendar in
> the timezone we are in and must be accurate."*
>
> An audit of all **425 files in `src/`** found **31 real faults**. Three shapes
> caused every one, and none of the three is catchable by reading a diff — they
> are all correct in Central during the day, on a developer's machine, and under
> a suite that does not pin `TZ`. They surface at 7pm, or on a client who
> travelled:
>
> | shape | what it actually is |
> |---|---|
> | `new Date().toISOString().slice(0,10)` | the **UTC** date — right for 19 hours a day |
> | `new Date().getDay()` / `.getHours()` | the **device's** weekday and hour |
> | `.toLocaleDateString()` with no `timeZone` | the **reader's** zone |
>
> **Two of the 31 wrote bad data, not just displayed it** (`2ec65a5`):
>   - **Dragging a session** built the instant in the browser's zone. The
>     AddSession modal 1,080 lines above in the same file uses `centralIso` and
>     explains why; the drag path was missed. Dragging to 9:00 AM and typing
>     9:00 AM stored different instants.
>   - **The caliper body-fat log** filed `skinfold_logs.log_date` from the
>     device's date, so a reading taken while travelling landed on the wrong day
>     and sat out of order on the trend.
>
> **The helpers** (`786e29d`), so the zone is not something anyone has to
> remember: `centralFormat` (an instant), `centralFormatDate` (a calendar date),
> `centralDateOf`, `centralHour`, `centralMinutes`, `centralTimeHHmm`. Tested
> under UTC, Asia/Tokyo, America/New_York and Pacific/Auckland, and across both
> DST boundaries.
>
> **The sweep** (`29edeba`): the client profile's training calendar rewritten
> onto date strings with no Date built for a grid cell at all — and its 4W grid
> was offsetting the month Monday-first under Sunday-first headings, so the whole
> month sat one column left of its own labels. The programming builder picked
> its week from the device weekday, so a workout dragged onto a column labelled
> Monday could write Tuesday. Plus message timestamps, notification ages, the
> assessment date, the announcement dateline, "Client Since", the DOB picker's
> upper bound, the payments board's notion of overdue, reminder urgency, the
> macro chart window, the AI cost-cap projection, and the trainer home greeting.
>
> **The guard** (`9643951`): `tests/unit/everyDateIsACentralDate.test.ts` fails
> the build on any of the three shapes. Allowlist is three entries, each stating
> why, with an assertion that it stays short — if it grows, the helper is missing
> a case. Money formatting (`(1234.5).toLocaleString`) is not dragged in.

> ## 👉 22 Aug NIGHT — THE MEAL PLAN IS THE AUTHOR'S, AND THE APP CANNOT TOUCH IT
>
> **`origin/main` = `4d2aeb4`.**
>
> Dustin: *"i plan it, I schedule it, i change it all from that project period...
> the app does not design my mesl plan, I do. fix it!"*
>
> **`441df75` — `clients.plan_locked`, on for Dustin and Steph.** A trigger on
> `meal_plans`, `meals`, `meal_items` and `macro_targets` refuses every
> PostgREST-originated write for a locked client and lets a direct session
> through, so the Command Center chat is the only hand on the plan. Reads are
> untouched — the app still displays it, and food logging (`meal_adherence_logs`)
> is unaffected.
>   - **Steph was my call, not his.** He authors her plan too. One line to undo:
>     `update public.clients set plan_locked = false where name = 'Steph Gautreaux';`
>   - Two bugs in the first version, both found by testing it rather than
>     trusting `{"success":true}`. It tested `current_user` — inside SECURITY
>     DEFINER that is the function's OWNER, always `postgres`, never the caller,
>     so it let **every** app write through while looking like it worked. And it
>     read `new.<column>` inside a CASE over `tg_table_name`, which plpgsql
>     compiles for every branch, so `new.meal_plan_id` in a `meal_plans` trigger
>     aborted the write for **every** client, locked or not. Both are pinned by
>     `tests/unit/lockedPlanIsTheAuthorsAlone.test.ts`.
>
> **`880c649` — one live plan per client per start date.** `plan-restore`
> already said in a comment that two live plans covering the same days is not
> cosmetic. It happened that night: a retried insert left Dustin and Steph each
> holding two plans marked live from 31 Aug, one of each pair with six meals and
> **zero food in them**. `resolvePlan`'s `created_at` tiebreak happened to pick
> the good one; nothing guaranteed it. Now a partial unique index, `nulls not
> distinct`. Empties removed, backed up to `bak_*_20260822_dupe_aug31`.
>
> **`d5a7ab4` — `clone_meal_plan()`.** Hand-written CTE copies inserted **zero**
> item rows three separate times during BULK v2, silently. One call now, and it
> raises rather than leaving a plan with no food in it.
>
> **The week-scoped rule, which is the actual answer to "why does this keep
> happening".** A plan runs from its `effective_date` until the next plan starts.
> There is no end date. So a one-week change is **two rows** — the change on that
> Monday, and a copy of the standing plan on the following Monday. Written as one
> row it runs forever. Dustin's ladder is now correct:
>
> | | Aug 17 | Aug 24 | Aug 31 |
> |---|---|---|---|
> | Dustin | v4 · 4213/254/381/186 | v5 · **4148/244/377/185** | v6 · 4213/254/381/186 |
> | Steph  | v3 · 1127/121/87/33   | v4 · **1105/119/87/31**   | v5 · 1127/121/87/33 |
>
> Full authoring procedure: `docs/COMMAND-CENTER-MEAL-PLANS.md`.
>
> **Checked, not assumed:** the nightly `flip_due_meal_plans` and
> `generate_rotation_plans` (pg_cron, jobs 20 and 14) still run clean under the
> new index — dry-run to 2026-12-31 and rolled back. They run as `postgres`, so
> the lock does not touch them either.
>
> **Connector note.** `RefreshMcpTools` does **not** exist in claude.ai web chat,
> and "tool not found" is returned both for a dropped connector and for a tool
> that never existed. No in-chat repair on that surface. Fix: start a new chat
> (the registry is per-conversation), else run the SQL in the Supabase editor,
> which connects as `postgres` and is allowed by the lock.

> ## 👉 22 Aug PM — THE PROGRAMME/CALENDAR SPLIT, AND THE WEEK THAT MOVED AT 7PM
>
> **`origin/main` = `7f588b7`.**
>
> **`64c2d50` — why the app kept saying he was on a programme he had finished.**
> Not recurring drift. One missing rule: `scheduled_workouts.assignment_id` was
> nullable with nothing enforcing it, so a programme could be scheduled out for
> months with no assignment row at all. His calendar was RIGHT the whole time —
> 128 bulk sessions from Monday — but nothing said which programme those days
> belonged to, so the app fell back on whatever was flagged active: two
> programmes with no future session between them.
>   - Second half, and it is what made the first repair attempt wrong:
>     `pa_enforce_program_isolation` makes programmes single-client by
>     deep-copying on a second assignment. Dustin and Tyler were scheduled onto
>     the SAME 21 bulk days; Dustin's assignment took the programme, Tyler's
>     forked it, and Tyler's 88 sessions still pointed at Dustin's copy. The
>     stamp follows the fork now, matching days by LABEL (position restarts per
>     phase, so position pairs the wrong days).
>   - **`active` is derived, not declared** — it means "has work from today
>     onward". Nobody has to remember to unset it, so nobody can forget.
>   - Result: he is on Hypertrophy Bulk, 128 sessions, next Monday 24 Aug. Zero
>     future scheduled workouts anywhere lack an assignment.
>
> **`915348c` — the week moved every evening.** `new Date().getDay()` on the
> home page is the UTC weekday on Vercel, so from 19:00 Central the week
> boundaries slid forward a day — and on a Saturday evening the strip rolled
> into next week entirely, taking adherence with it. ClientDashboard had the
> same call in the browser, so a client outside Central had the ring
> highlighting one day and naming another. Both derive from the Central date
> now; the strip is pure string arithmetic with no Date object at all. Tests run
> under `TZ=UTC` and cover both DST boundaries.
>
> **`7f588b7` — three controls that failed silently.** The New Program button
> had no `onClick` at all (now opens the assistant, which is how programmes
> actually get built). The challenge launch key was hardcoded to `2026-08`, so a
> September challenge would have reached nobody with no error. The weigh-in
> nudge used sessionStorage + the device's day, so dismissing it on a PWA bought
> minutes.
>
> **Data, all backed up first** (`bak_clients_billing_20260822`,
> `bak_program_assignments_20260822`, `bak_sw_assignment_20260822`):
> Tyler flat $300 anchor day 3 — the calendar has a recurring "Tyler $300" on
> the 3rd, and his row said `billing_type='flat'` with `flat_billing=false`,
> which is the contradiction that made him read as $15/session. No other client
> had it. Jerry marked `nutrition_only`. Lauren's and Sara's 8 open notes
> cleared.
>
> **Still open after this pass:** the two Settings switches that never save;
> the sidebar Calendar link (redundant rather than broken — Home IS the trainer
> calendar, and which one goes is his call); nutrition screens running their own
> maths; one demo video shared across several movements; Tim Yancey's two dip
> mis-entries; historical wrong-date credits (his call, not rewritten).

> ## ⛔ SETTLED — DO NOT RAISE THESE AGAIN
>
> Every line here has been explained by Dustin more than once, in some cases
> many times. If a doc or an audit tells you otherwise, the doc is stale.
>
> - **His push notifications work.** He is on the Android APK, which uses FCM
>   and `device_tokens` — his token has been there since 26 Jul. The near-empty
>   table is `push_subscriptions`, which is WEB push and is a different channel.
>   Do not tell him to turn notifications on.
> - **Jerry Bourgeois is nutrition only.** Not a gap in his programming, not a
>   client whose training was never set up. `clients.nutrition_only` is now true
>   so it is a fact in the database rather than a thing he has to keep saying.
> - **Nudges are gone.** "we are not using nudges anymore so slipping thing is
>   irrelivant." Anything about the nudge engine, the slipping bucket or the
>   unmetered sweep is dead scope, not a bug.
> - **AI spend is nowhere near the cap.** Re-measured 22 Aug night: **$8.34
>   across 1,246 calls**, 23 days in — about **$11.20/month against $95**, under
>   12% of it. July was $0.13. The testers do not need their own Claude
>   accounts. Re-measure before ever claiming otherwise.
> - **The 1,043 orphan scheduled workouts are parked.** He wants context on what
>   they actually are before anyone touches them. Do not clear them.
> - **Flat-rate clients stay flat.** "if they have no supervised days, their rate
>   is flat, dont change it ever."
> - **The food-logger tutorial is question marks on each feature**, explaining
>   that piece when tapped — not a chapter, not a docked panel.
> - **`client_training_patterns.supervised` is NOT where supervision lives.**
>   That table is empty for 20 of 22 active clients, so a query that counts
>   supervised days from it reports **zero for almost everybody** — including
>   clients with 35 supervised sessions booked. Supervision is
>   `scheduled_workouts.supervised`. Checked 22 Aug against the real column:
>   **every `monthly_adjusted` client has supervised sessions, and every `flat`
>   client is meant to be flat. There is no billing anomaly.** This trap looks
>   exactly like "half the roster is billed wrong" and it is not.
> - **Exercise videos are done.** `docs/EXERCISE-VIDEOS-THE-REAL-NUMBERS.md`
>   says 252 are missing; that is stale. Measured 22 Aug: 43 of 843 library
>   exercises have no video, and **not one of those 43 is prescribed to
>   anybody** — zero `prescribed_exercises` rows across all of them. All **636**
>   exercises that ARE programmed have a video and none is flagged bad. The only
>   live thread is **10 candidates sitting in `exercise_video_candidates` waiting
>   for Dustin to approve or reject**.

> ## ✅ SHIPPED 22 Aug (2a96cd1) — "build a plan around the foods I actually eat"
>
> **Only one slice is still open:** matching the named foods against
> `food_catalog` so the plan logs one-tap. The existing AI modes store items as
> text plus macros too, so this is at parity — changing it affects how every
> plan logs and belongs in its own pass.
>
> *(Original entry below, kept for the reasoning.)*
>
> ## 📋 the original ask
>
> Dustin, 22 Aug: *"from that menu you need an option for them to type/say what
> foods they want ai to use to build a plan that fits their macros n calories."*
>
> **Where:** the "Build my own plan" sheet —
> `src/app/(app)/nutrition/v3/NutritionV3Client.tsx` line ~2695. It offers three
> routes today:
>
> | | mode | what it does |
> |---|---|---|
> | Recommend my targets | `aiplan / consult` | 3 questions → coach picks macros → builds 5 meals |
> | Build from my targets | `aiplan / targets` | enter kcal/P/C/F → AI drafts 5 itemized meals |
> | Build manually | — | open day, build from the DB, save as plan |
>
> **The gap:** every AI route picks the FOOD for you. Nobody can say "I eat
> chicken, rice, eggs, Greek yoghurt and whatever's at Costco — work with that."
> That is how most people actually think about their diet, and a plan built from
> foods they already buy and can cook is the one they stick to.
>
> **Shape:** a fourth row, a new `aiplan` mode (`foods`), taking free text —
> **typed or dictated** (MicButton already exists and is used elsewhere in this
> file, so voice is a prop, not a build). Feed the list to the plan builder as a
> constraint: prefer these foods, hit the macro targets, say plainly when the
> targets cannot be met from that list alone and what it added to close the gap.
> Worth accepting dislikes/allergies in the same box ("no fish, no dairy") since
> people volunteer both in one breath.
>
> Match against `food_catalog` so the items become real rows with real macros
> rather than free text the rest of the app cannot log against — otherwise the
> plan looks right and one-tap logging does not work on it.
>
> ⚠️ **`NutritionV3Client.tsx` is the food logger — OFF LIMITS without per-item
> permission.** Ask before starting, even though the ask above is where the work
> goes.

> ## 👉 22 Aug — TRAINERS CAN ACTUALLY BE TRAINERS, AND PAY DETAILS ARE PRIVATE
>
> **`origin/main` = `37bbc0a`.** Live and verified on `/api/health`.
>
> **`37bbc0a` — a trainer added from inside the app was not a trainer anywhere.**
> This was the blocker for putting testers on the app. `/api/invite-trainer`
> shipped 21 Aug and does its half right: `trainers` row, `auth_user_id`
> stamped. The database agreed too — `is_trainer()` joins `auth.users` to
> `trainers` on `lower(email)`, so RLS would have let them do everything.
> The APP asked `isTrainerEmail()`, which reads `TRAINER_EMAILS`, an array
> fixed at BUILD time, in 136 places across 65 files. The first trainer invited
> would have got: middleware dropping them into the CLIENT onboarding redirect
> chain on every navigation (never reaching a page at all); the client app shell
> from `(app)/layout`, which had the right answer in `coachForViewer` eight
> lines below and discarded it; 403 from `ai/scope` on every AI route including
> their own coach; 401/403/redirect on roster, payments, assessments, invites,
> calendar sync; and `sendBroadcastMessage` returning `0` silently.
>   - `src/lib/auth/viewer.ts` — `viewerIsTrainer(db, user)`, resolved from the
>     table by `auth_user_id` then by address, the same two ways `my_trainer_id()`
>     and `is_trainer()` do it. **Fails OPEN to the build-time list**, so an
>     unreachable database cannot demote the owner in his own app.
>   - The answer is remembered per process (`noteTrainerEmail`), because client
>     components cannot await anything and were built around the synchronous
>     check.
>   - Two costs deliberately avoided: middleware short-circuits on the
>     build-time list before spending a query, and where it must ask, the
>     `trainers` lookup runs alongside the `clients` lookup that path already
>     paid for.
>   - `tests/unit/trainerAddedInApp.test.ts` fails if any route, page or action
>     goes back to deciding trainer-ness from a build-time list.
>
> **`6cee23c` — a trainer's payment handles are for their own clients only.**
> Dustin: *"I do not want anyone but their own clients seeing their pmt info."*
> RLS is ROW-level and could not say it — once a row is visible every column on
> it is, and clients legitimately need their coach's row. So SELECT on
> `trainers` is revoked from `authenticated` and re-granted column by column,
> skipping the five payment columns; `trainer_pay_details()` (SECURITY DEFINER)
> hands them back to the trainer themself and to a client of that trainer.
> **Including the owner** — Dustin cannot read another trainer's Venmo tag
> either. That is the instruction, not an oversight. Migration
> `20260822d_payment_handles_are_for_their_own_clients_only.sql`.
>   - Every reader moved to `payDestinationFor()`: `PaymentDueBanner`,
>     `PaymentsSettingsCard`, `TrainerProfileCard` (two reads now — selecting
>     the handles alongside the name would have blanked the name too),
>     `trainerResolve` (COLS dropped them outright), the tutorial's pay check.
>   - A grant cannot stop anyone WRITING the old query, only make it fail in
>     somebody's browser. A test fails instead: no `.select()` list in those
>     files may name a payment column.
>   - The trainer intake form's payment section was reworded — it used to say
>     the other trainers could see these. That is now false.
>
> **`5ce3868` + correction in `37bbc0a` — `/api/health` reports capabilities.**
> The config block added overnight reported two things as OFF that were ON:
> `push` tested only FCM while web push was configured and delivering, and
> `android_apk_url` tested an override that is unset because the default (this
> instance's own public bucket, APK there since 20 Jul) is correct. Now
> `push: {web, native}` and `android_apk: "bucket" | "override"`.
> Currently: `email_sending: true`, `ai: true`, `push.web: true`,
> `push.native: false`, `android_apk: "bucket"`.
>
> **Onboarding path checked end to end for a new trainer:** invite email →
> one-tap link → `/auth/callback?next=/welcome` (no longer diverted to the
> client `/set-password`) → `/welcome`, which already asks the `trainers` table
> and runs the trainer variant → password replaced → walkthrough.
>
> **Still open:** Coach Bot per-room; the food-logger tutorial docking decision;
> the `slipping` bucket rework; 300 future workouts on non-active assignments
> (Dustin, Maddy, Tyler, Steph) — his call; 13 open client notes, Sara Prince
> appearing 5× and possibly needing a reassessment.

> ## 👉 21 Aug — THE WEEKLY FOCUS RUNS ITSELF, AND THE TAKEOVERS ARE CULLED
>
> **`origin/main` = `7469ef9`.** Five commits, all gated, all shipped.
>
> **`2cdafed` — thirty-four clients were reading a focus line from before 9 Aug.**
> `currentWeekFocus` honoured a NULL `weekly_focus_week` as "show it" — written
> so pre-provenance rows would not vanish, except EVERY production row is a
> pre-provenance row, so the escape hatch was the rule. Bobbie Page was reading
> "3 lifts and 2 cardio days this week"; Christine Latham "It's been 9 days" on
> day 22. Guard now strict here and in `/api/weekly-brief`, which had no stamp
> check at all.
>
> **The 21 Aug handoff's diagnosis of this was WRONG in three ways** — it looked
> for feature `weekly_ai` (the route logs `weekly_sweep`), it read zero usage
> rows as proof the route never reached its metered call (metering only landed
> 13 Aug, after the last good run), and it assumed no drafts ever existed. They
> did: `cron.job_run_details` shows `publish_focus_drafts_sunday` FAILING on
> 9 Aug with `operator does not exist: text = date`, an error that can only fire
> from inside the row loop. **That bug is already fixed.** Only ONE Saturday was
> actually missed — 15 Aug.
>
> **`0d3d46d` — the sweep publishes itself, late Saturday, no approval.**
> Moved to `0 3 * * 0` (22:00 CT Saturday) so it grades seven whole days instead
> of a Sunday-to-Friday stub. Target week now derives from TOMORROW — outside
> draft mode it was `weekStartOf(today)`, which on a Saturday-night run stamps
> every line with the week that just ENDED, so all 34 would have been filtered
> out as stale the instant they published. No `?draft=1`, no drafts table, and
> `SaturdayReview` unmounted (kept in repo, like `TrainerWeekDigest`).
>   - **`/api/cron/focus-watchdog` is a SEPARATE route on pg_cron** (jobid 43,
>     Sunday 08:00 CT). The 15 Aug failure was the sweep never being invoked; an
>     alert inside it would have been just as absent. It asks the DATA one
>     question — does every active client have a focus stamped for this week —
>     which catches cron-never-fired, 500, model-junk, meter-paused and
>     one-row-failed alike. Alerts PER TRAINER (Stephanie's one client is 100% of
>     her roster). Email reuses meter.ts's Resend + marker-first pattern; push
>     uses new `SYSTEM_ALERT`, trainer-only and forced.
>   - **Dustin has NO push subscription.** There is exactly one in the whole
>     database (Lauren's, 17 Aug). Push alerts reach him only once he turns
>     notifications on in the app.
>
> **`7e226b9` — four takeovers could stack on one screen.** A lapsed client
> opening on a Sunday got SlackerScreen (z9999), the ClientTakeovers lapse
> screen (z2000), SundayWeighInReminder (z85) and the week brief (z80), all at
> once. Deleted: **SlackerScreen** (duplicated the lapse screen from ABOVE it and
> ignored `checkin_nudges_off`/`checkin_snoozed_until`, so a client who asked not
> to be nudged got a comedy wanted poster), **PrankInvoice** (expired 12 July,
> still mounted at z99999), **SundayWeighInReminder** (WeighInNudge already does
> it as a card, and it fired at DUSTIN in /client-preview), **PwaInstallBanner**
> (second install prompt, second dismiss key).
>   - `src/lib/takeoverSlot.ts` — one global claim, lowest priority wins, ordered
>     by shelf life. ClientTakeovers promised "at most ONE takeover ever" and
>     could only deliver it inside itself; now it is true of the app.
>   - Week brief is weekly again (Sun/Mon only — it fired every day while its own
>     comment said "once-weekly"), seen moved to `client_announcements_seen`
>     (per PERSON, not per device), and the marker is written on DISMISS rather
>     than on open — the old key counted "closed the app without reading" as read.
>
> **`e535dc7` — one definition of "the week".** The card measured a ROLLING
> trailing seven days for the review and printed the Sun–Sat focus line
> underneath it: two different weeks, one screen, both labelled "week". "This
> week" also put the WHOLE Sun–Sat in the denominator, so Thursday's sessions
> counted against a client on Tuesday. Both now use `weekly-numbers.ts`, which
> was right all along — **the AI was never the thing that was wrong.** Dustin's
> rule: logged vs scheduled *so far this week*, resetting at the boundary.
>
> **`7469ef9` — ten sentences of AI prose above the food logger becomes four.**
> TWO cards share that screen and neither knew about the other (coach card ~6
> sentences, weekly read 2–4). Both capped at two, both must LEAD with a real
> figure, and the coach card has an explicit sparse-data instruction. The cap
> lives in the card's own prompt, not COACH_SYSTEM_PROMPT, which is shared with
> the chat.
>
> ### OPEN, needs Dustin
> 1. **The sweep has not completed successfully since 8 Aug.** Sat 22 Aug is the
>    first real run of the new schedule. If it fails he now gets told.
> 2. **Turn on notifications in the app** so push alerts reach him.
> 3. **1,043 orphan `scheduled_workouts` rows** point at days in programmes their
>    client is no longer assigned to (11 of Dustin's own 14 that week, 8 of
>    Madeleine's 8). They inflate every denominator. Clearing them is destructive
>    → needs a `bak_` table and his go-ahead. NOT touched.
> 4. **`integrity_checks` is read by nothing** — twice a day since 1 Aug, and it
>    is holding a `critical` `anon_writable_policies` flag nobody has seen. Same
>    disease as the gcal sync runs and `ai_focus`.
> 5. **`clients.ai_focus` is written weekly for 33 clients and read by NOTHING.**
>    He said "wire it up" — but `CoachFocusCard` was removed on purpose on 1 Aug
>    because it restated the focus line and clients read the same coaching twice.
>    Decide: re-add with a different job, kill it, or repurpose it as his view.
>    The help centre still tells clients to find a card that does not exist.
> 6. **Justin Ray (justinrayaus@yahoo.com)** — third trainer, set up like
>    Stephanie plus a client toggle, plus a choice of using his own connected
>    Claude, with the tutorial branching on that choice.
> 7. **"Needs your eyes"** — pull all open client notes and clear the backlog.
> 8. `challenge-launch-2026-08` is a hardcoded key: a September challenge invites
>    nobody. `WeighInNudge` dismissal is session-scoped, so it returns after a
>    PWA restart the same day.

> ## 👉 21 Aug (overnight) — THE TUTORIAL, AND FOURTEEN MORE LIES
>
> **`origin/main` = `2702a45`.** Five commits, each gated and shipped through
> the bridge. Nothing left in the sandbox.
>
> **`17c4de5` — the cron doc said twenty runs a day; it is three hundred.**
> SCHEDULED-JOBS.md had not been touched since the 1 Aug audit and had drifted
> badly: `gcal_sync_harvest` back to every 15 minutes, `video-duration-measure`
> every 10, and three jobs added since that were written down nowhere. Re-read
> from `cron.job` and `vercel.json`. Also in that batch: `/api/reminders/send`
> lost its GET and its daily Vercel cron (the handler's entire body returned the
> string "Cron disabled — activate in Settings"; the reminders are made by
> pg_cron jobid 5 and always were), the `/api/send-reminder` tombstone deleted,
> feedback now records **who** reported it so a bug from Stephanie's app is not
> filed as one of Dustin's, three dead components removed, and the db-schema
> fixture regenerated — it was twelve columns behind production.
>
> **`c3745a0` — the food logger stops saving meals nobody asked to keep.**
> Three of the four spec items; the logger tutorial waits on where he wants it
> docked.
>   - **No forced library save.** Swap and unlogged-insert called `saveMyMeal`
>     unconditionally and said so on the button. The keep tick was deliberately
>     HIDDEN on those two paths — right, given the forced save; wrong once he
>     removed it. Now the tick is on every mode, defaults off, and nothing saves
>     without it. "it's an option but may just be a one time off plan swap."
>   - **Library reachable from the composer.** Adjust, open slots and extras
>     could already; the composer could only be typed into, so a food with real
>     numbers in `food_catalog` got re-typed and re-ESTIMATED. Needed a
>     structural change worth remembering: **only the TOP sheet in the stack
>     renders**, so pushing the library unmounts the composer. The draft now
>     lives in the parent; every route in seeds a fresh one, or a new custom
>     meal opens holding the last one's items.
>   - **"Replace…" → "Replace with library meal."** One types a meal that does
>     not exist yet, the other picks one that does.
>   - Two tests in `typedMealCanBeKept` rewritten, not relaxed — they asserted
>     the tick was hidden on exactly the paths he asked to change.
>
> **`6839d38` — three permanent reds is not a monitor, it is wallpaper.**
> `run_integrity_checks` has run twice a day since 16 Aug and NOTHING in the app
> ever displayed its table.
>   - `anon_writable_policies` matched `qual = 'true'` — the USING expression,
>     which a SELECT policy has too — so `food_catalog_read` read as an anon
>     WRITE. **The one check that could ever mean "somebody can change data they
>     do not own" was permanently red because a public food catalogue is
>     publicly readable.** Tests the COMMAND now. Reports 0.
>   - `scheduled_day_outside_assigned_program`: no date filter, so workouts back
>     to July 2024 were compared against the CURRENT assignment — finishing a
>     programme turned a client's whole history critical. 772 of 1,072 were
>     past. Scoped forward, archived excluded, names collected. 300.
>   - `supervised_workout_no_appointment`: describes a link the mover stopped
>     needing (it pairs by client+week now) and counted online-only clients who
>     can never clear. Warn, wall applied. 371 → 250.
>     `appointment_no_supervised_workout` gets the same: 14 → 1.
>   - **The reason it could rot:** `integrity_checks` had RLS on and NOT ONE
>     policy, so every browser read returned empty. Trainers can read it now,
>     and Today's Admin carries a row on a live critical (latest run only).
>
> **`0c99e19` — 199 schedule rows get their paper trail back.** Additive only:
> `assignment_id` filled via day → phase → program where exactly one assignment
> matched (no ambiguous cases). Zero dates changed. Backed up to
> `bak_sw_assignment_backfill_20260821`.
>
> **STILL OPEN — HIS CALL, NOT A REPAIR:**
>   - **300 future workouts belong to programmes that are not the client's
>     active assignment.** Dustin, Madeleine Coker, Tyler Dorsett, Steph.
>     Maddy had NO active assignment and 80 scheduled workouts (her rows linked
>     in the backfill; the assignment question stands). Dustin's active
>     assignments say "8-Week Split Block (Jun 2026)" while his calendar for the
>     next three months is "Symmetry Corrective Deload" + "Hypertrophy Bulk —
>     14 Week". Which is the truth is a decision.
>   - Of the 845 rows still unlinked, only Dustin (128) and Tyler (88) have
>     FUTURE ones. Everyone else's leftovers are past — old programmes since
>     removed, harmless.
>   - **13 client notes still open**, 5 routine ones auto-closed (backup:
>     `bak_exercise_notes_20260821b`). Two are unanswered client QUESTIONS —
>     Lauren "Both sides? Or just right side?" (24 days) and Sara Prince "Is
>     that ok?" (31 days). **Sara Prince appears five times**: upper-back
>     soreness, hip cracking, knee pain end of set 1, burning at rep 14, and
>     "I need to review this one in person." That reads like a reassessment.
>   - **Exercise videos: one clip standing in for several different movements.**
>     Bobbie Page, 13 Aug: "The video attached to this movement doesn't really
>     help." She is right, and it generalises — Balance Disc Split Stance Hold /
>     Squat / Tandem Stance Hold share one video; Foam Roll Glute Max / Glutes /
>     Roll Glute Medius with Ball share one; Band and Dumbbell Bent Over Rear
>     Delt Fly share one. Belongs with the 252-missing-videos item.
>   - **The `slipping` bucket is close to inverted** — full evidence in
>     `claude/NUDGE-SLIPPING-BUCKET-EVIDENCE.md`. Jerry Bourgeois did 1 of 1
>     programmed (100%) and is flagged; Sharon Rambo did 0 of 13 (0%) and is
>     not. Dustin asked to look at this together.

> **`2890d28` — the nightly nudge sweep is off. The engine is kept.**
> Dustin, 21 Aug: "stop that for now. keep engine for later if i decide to add
> it back." It was writing a message about every active client, in his voice,
> every night — ~30 a run, 657 rows — into a table nothing in the app reads.
> The client-DM path went on 13 Aug and nothing replaced it.
>   - **Unscheduled** (`vercel.json`). That entry was what actually fired it,
>     and it explains a thing that never fitted: the cron string says Mondays,
>     the rows land nightly at 9:10pm CT — Vercel running a daily job whenever
>     it likes.
>   - **Flag-gated** on `app_flags.nudges_live` (false), checked before anything
>     can spend, so an off sweep cannot pay for itself. That flag existed, was
>     read by nothing, and a comment in the route described it as the safety
>     mechanism anyway. Reviving = one row, no deploy.
>   - `segment.ts`, the guardrails and `nudgeSegments.test.ts` untouched, with a
>     test asserting they still exist.
>
> **STILL OPEN, for whoever revives it:**
>   1. **It was never metered.** The route calls `logUsage(…, "nudge_sweep", …)`
>      and `ai_usage_log` has ZERO rows for that feature, despite the model
>      demonstrably running (the drafts are LLM prose). ~900 calls/month sat
>      outside the $95 ceiling. NOT fixed — diagnosing it properly needs the
>      route to actually run. The `$14.44/month` figure quoted for the trainer
>      decision is what is MEASURED and excludes this.
>   2. **`slipping` mislabels people who are following their programme.** The
>      rule is `w7 <= 3 && w30 <= 10`, which for a client programmed 2–3x/week
>      is normal. Grant Weever, Hassan Kareem and Krysta Ruiz-Schnitzler all
>      trained within a day or two and were tagged slipping; the copy then reads
>      "good session yesterday… can you fit one more in before Sunday?" It needs
>      to compare against that client's PROGRAMMED frequency, not a constant.
>   3. **There is nowhere for a draft to land.** Turning the sweep on again
>      without answering that just refills a table nobody opens.
>
> **Trainer AI, decided 21 Aug.** New trainers get the in-app AI by default,
> and are ENCOURAGED to connect their own Claude — framed as the upgrade that
> lets them run every client from Claude chat instead of the app, not as a cost
> measure. Cost scales with CLIENTS, not trainers: $0.42/client/month measured
> across 34 clients, $14.44/month total, heaviest single client $4.30. Four
> trainers at ~30 clients each ≈ $50/month against the $95 ceiling. A trainer
> with no AI must get a tutorial that BRANCHES every AI step to its manual
> equivalent — not a bolt-on chapter, and not hidden steps.

> **`be2b58c` — the calendar stops outranking the person who moved the workout.**
> Two rules, 21 Aug, both in his words.
>   - **The online-only wall is populated.** "Tyler, Bobbie, Celeste, Robert,
>     Gerard, krysta, Troy, Maddy, sharon gautreaux, me, steph, these do not get
>     moved automatically due to schedule." Eleven clients now carry
>     `online_only`. The mover already skipped the flag in all three branches;
>     the PROPOSAL detector did not, so their appointments kept arriving as
>     decisions about a rule already made. Six pending proposals superseded —
>     the queue went from seven to one (Greg Lennon, real).
>   - **A manual move is final.** "make sure if anyone moves a workout manually
>     it stays regardless of gcal sessions." The guard existed and was correct
>     BY ACCIDENT: all seven manual paths set `moved_from_date`, none sets
>     `moved_by`, so `moved_from_date is null or moved_by = 'calendar_sync'`
>     came out NULL and the row fell out of the WHERE. The luck ran out once
>     calendar_sync had moved a row: it stamped `'calendar_sync'`, a human
>     moving it afterwards changed only `moved_from_date`, the guard PASSED, and
>     the next sync dragged the workout back off the chosen day — on exactly the
>     sessions most likely to have been moved already. `trg_stamp_workout_mover`
>     (BEFORE UPDATE) now stamps the mover; the sync identifies itself with a
>     transaction-local `symmetry.mover`, and everything else is a person.
>     Verified in a rolled-back transaction against production: app move, sync
>     move, human overriding the sync. 66 historical rows backfilled to
>     `'manual'`.
>   - The detector also stops proposing to re-cover a day the trainer uncovered
>     himself by moving that week's workout.
>   - **Drift found:** `detect_schedule_changes` had been replaced in the
>     database by `20260821171049` (orphan/pairing machinery and the 'moved' and
>     'cancelled' reasons removed, because he removed the approval step) and
>     that migration was never written into `supabase/migrations`. The repo
>     still described the 16 Aug design. Now carried in full, with the gap
>     explained. Four tests in `detectorAbsenceIsNotASignal` were guarding the
>     deleted machinery — rewritten to assert it stays deleted.
>   - Backups: `bak_clients_online_only_20260821`,
>     `bak_scheduled_workouts_movedby_20260821`.

> **`b23a2d7` + `cec6bcb` — the tutorial is audible, findable, and dismissible.**
> Reported off the first phone test: "there is no voice on tutorial and needs to
> be easier to find for new trainers", then "give trainers the option to turn
> this tutorial off once they're done with it." All three shipped 21 Aug.
>   - **Voice.** All 51 recordings were on disk and served; `narrate()` built a
>     `new Audio(url)` per line, and mobile refuses a never-unlocked element
>     started from an effect. So the tap on "Voice on" played step one and every
>     step after it was silent — the browser-TTS fallback included, because it
>     needs the same gesture. One element for the life of the tab, unlocked in a
>     real tap and reused by swapping `.src`. `go()` spends the Next/Back tap on
>     that unlock before changing step.
>   - **Findable.** The control is a play button at the top of the step card,
>     shown whenever a recording OR browser TTS exists — it used to be gated on
>     TTS alone, which hid 51 mp3s that need none. The guide itself now has three
>     doors: a "Start here" card at the top of Home (with progress, gone once
>     every step is seen), a Setup guide entry at the foot of the sidebar, and
>     the original Settings card.
>   - **Dismissible.** `trainer_settings.tutorial_dismissed_at`, per trainer,
>     NOT the `app_flags` switch — the first trainer to finish must not take the
>     guide away from the next one being onboarded. Reversible from the
>     tutorial's last screen and from Settings; `/tutorial` keeps working either
>     way. `useTutorialVisibility` owns both switches, and defaults the opposite
>     way to `lib/flags.ts` on a failed read.
>   - Copy no longer names the coach — a second and third trainer are coming.

> **`318d559` — the new-trainer tutorial. BUILT, AND SWITCHED OFF.**
> Thirteen chapters, forty-one steps, the whole app end to end. Narrated, and it
> remembers where you stopped. `/tutorial` redirects to /home until
> `trainer_tutorial_live` is turned on in **Settings → Experience → New-trainer
> walkthrough**. Dustin reviews it before a real trainer meets it.
>   - It describes the app that exists, **including what is broken** — the
>     Calendar link that bounces to Home, the dead New Program button, the two
>     Settings switches that show state they never save.
>   - Per-trainer Claude accounts are marked NOT BUILT YET, and the very next
>     step says out loud that a trainer who does not want one loses nothing.
>   - The final checklist is **read from the account, not ticked** — photo, pay
>     details, calendar, first client, first programme, first message,
>     notifications.
>   - `src/lib/speech.ts` is now the app's one speaking primitive, and
>     `narrate()` prefers a pre-recorded file over the browser voice. **That is
>     the Chatterbox seam** — recording it in Dustin's voice becomes setting
>     `audioUrl` on a step and nothing else.
>
> **`9a5d4af` — fourteen more places the app said it worked when it had not.**
> The inventory ended "Next — nothing, deliberately". It was wrong. Pausing a
> payment, deleting a payment record, **marking a reminder sent after the email
> had already gone out** (so it gets sent again tomorrow), a weigh-in card that
> ticks regardless, "this can't be undone" on a photo that stayed in the
> database, a calendar drag, a half-completed swap reporting "try again",
> assigning a programme without closing the last one (**a client on two**), a
> dismissed notice that came back, the calendar-sync switch, recipe ingredients
> that **double** rather than replace, plan-restore leaving two live meal plans,
> a goal reached again every morning, and birthday wishes repeating for three
> days. Worst of them: `WelcomeClient` writes the flag middleware reads, so an
> unchecked failure **loops a brand-new client on the welcome screen forever**.
> 67 → 33. `tests/unit/uncheckedWrites.test.ts` now runs the sweep every commit
> and each fix is pinned individually. Mutation-tested both ways.
>
> **`2702a45` — the plan builder was ignoring nineteen of the twenty recipes.**
> Asked to verify rather than assume. `libraryPromptBlock()` offers meals AND
> recipes; the matcher only ever searched the meals. Measured: 50/50 meals
> substituted, **1/20 recipes** — and that one only because "Turkey Chili" is
> also a meal, so picking the recipe returned a meal 127 kcal heavier. Now
> 70/70. **Still open: one call against the real model.** There is no Anthropic
> key in a sandbox, so "does Claude copy the names verbatim" needs one run in
> Dustin's environment. Everything downstream of the reply is proven.
>
> **Two documents, no code:**
>   - `docs/AI-COST-PER-TRAINER.md` — the AI cost question, ending in three
>     decisions for Dustin. Headline: the $95 cap is **global**, so a test
>     trainer can pause AI for his paying clients. Recommends per-trainer
>     budgets first, then per-trainer app tokens so a trainer's own Claude works
>     their own side of the app — and recommends **against** storing anyone's
>     Anthropic key. Names the dangerous shortcut explicitly: giving a trainer
>     the Supabase MCP connector bypasses RLS completely and undoes every
>     boundary shipped on 20 Aug.
>   - `docs/RETIRING-THE-SECOND-INSTANCE.md` — the steps, all of them left for
>     Dustin to run, plus the honest note that one instance for every trainer is
>     a **weaker** boundary than two databases and what that obliges.
>   - `docs/ADDING-A-TRAINER.md` corrected: it still claimed "a trainer sees ALL
>     clients… NOT yet multi-tenancy", which stopped being true on 20 Aug.
>
> **Waiting on Dustin:** review the tutorial and test it on Stephanie's account;
> the three AI-cost decisions; whether to execute the instance retirement; and
> Chatterbox, which was explicitly for today, not last night.

> ## 👉 20 Aug — BILLING REBUILT, STEPHANIE IS A TRAINER
>
> **`origin/main` = `26e11d3`.** Everything below shipped today.
>
> **Billing rebuilt end to end.** Dustin's rule, his words: *"$640 for 2 x a week,
> their monthly on due date is $640 minus any cancelled sessions based on that
> monthly rate divided by the number of sessions (8)... cancelled sessions are
> only to be deducted when i mark them cancelled (orange) in my gcal."* The old
> rule was `sessions_trained x rate`, and 16 of 20 open reminders disagreed with
> the payment markers in his own calendar — $2,660 under, $318 over, in ONE
> cycle. New `monthly_adjusted` billing type, a Billing & Schedule tab, client-
> visible dates/cycle/detail, billing records both sides, and all 20 reminders
> rebuilt. Nothing emailed.
>
> **Provisional lock** — a reminder cannot be sent until the cycle closes
> (7 days before due). Enforced in the send route, not just the button.
>
> **Workout logger data loss** — three faults: nothing typed was saved until the
> tick; a failed liveness READ was treated as a deletion and wiped the draft; the
> tick went green on failed writes. All fixed. Two existing tests were pinning
> the bug and had to be rewritten.
>
> **Calendar sync** — hourly narrow window (was twice daily), sync health on the
> home screen (the run log had never been read by anything), unmatched events
> counted and listed, and the reconcile guard made proportional. It could
> previously delete every future appointment from a fetch that returned 1% of
> the calendar.
>
> **Nutrition** — micronutrients now reach storage (0 of 937 logs had them
> despite 26 carrying them on their items), and a scanned barcode food can be
> corrected.
>
> **MULTI-TRAINER IS LIVE — Stephanie is a trainer.** Ownership + RLS (phases
> 1–2), then her own clients, her own name on coach messages, her own money
> (phases 3–7), then her own calendar (phase 8, below). See
> `claude/PLAN-SECOND-TRAINER.md` and `claude/PLAN-SECOND-TRAINER-DECISIONS.md`.
> RLS verified four ways against a throwaway second trainer: she saw 0 clients
> and the full 843-exercise shared library; given one client she saw exactly
> that one; the owner still sees all 35. 41 policies scoped. Her trainer row
> reuses the client account she already had, so she switches trainer ↔ client
> view exactly like Dustin does.
>
> **Calendar sync is now per trainer.** Three things were load-bearing on "there
> is exactly one trainer", and every one of them fails silently:
>
> | | was | now |
> |---|---|---|
> | `gcal_get_tokens()` | `LIMIT 1`, no `ORDER BY` — an arbitrary Google account | takes `p_user_id`; owner-first when omitted, so the default is deterministic |
> | `gcal_get_clients()` | the whole roster — Dustin's calendar could match "Sarah" to one of Stephanie's clients and bill it to the wrong trainer | takes `p_trainer_id`; "unique first name" now means unique *within that trainer's roster* |
> | `gcal_reconcile_*()` | deletes future rows absent from the seen-event list — trainer A's list does not contain trainer B's events, so A's first run would delete B's entire future schedule, and the "more than half the window" guard would NOT fire because from A's side the deletion looks legitimate | takes `p_trainer_id` |
>
> `/api/gcal-sync` runs the fetch/match/write body once per connected trainer,
> sequentially (each pass can write thousands of rows inside a 60s budget), and
> one trainer's dead credential no longer aborts the other's sync. The
> whole-table `gcal_clear_appointments()` and the three roster-wide recalcs run
> ONCE, outside the loop. `synced`/`payments` stay at the top level because
> `GcalSyncButton` and the Settings buttons read them.
>
> Scoping is a **no-op today** and that was checked against live data before it
> shipped, not assumed: 465 future appointments and 698 payment rows in the
> window, identical unscoped and scoped to Dustin. `clients.trainer_id` is NOT
> NULL, so no row can fall out of every trainer's scope.
>
> Two more single-tenant footguns found on the way and fixed:
> - **Disconnect revoked the wrong grant.** It read tokens unqualified but
>   cleared `.eq('user_id', user.id)`. Stephanie pressing Disconnect would have
>   revoked DUSTIN's Google grant at Google and cleared her own empty row — his
>   sync dead, the database still saying he was connected.
> - **Schedule actions patched the wrong calendar.** `updateGCalEvent`,
>   `setGCalEventColor` and `deleteGCalEvent` all edited "the trainer's"
>   calendar unqualified. They now name the signed-in viewer.
>
> Pinned by `tests/unit/gcalMultiTrainer.test.ts` (12 tests) and
> `tests/mutate-gcal-multitrainer.sh` — 15 mutations, 15 caught.
>
> **STILL NEEDS STEPHANIE, and only she can do it:** connect her Google Calendar
> at Settings → Connect. Claude cannot perform sign-ins. Until she does,
> `gcal_list_connected_trainers()` returns only Dustin and her sync simply does
> not run — no error, no half state.
>
> **Five more `limit(1)` trainer lookups, fixed the same day.** Every one of
> them read `trainer_settings.select("user_id").limit(1)`, each with a comment
> claiming that table "holds the single trainer auth user id". It holds one row
> per trainer with a calendar connected — so all five become a coin flip the
> moment Stephanie connects hers, and none of them error:
>
> | route | was | now |
> |---|---|---|
> | `/api/coach-escalate` | arbitrary trainer | the client's own coach |
> | `/api/program-feedback` | arbitrary trainer | the client's own coach |
> | `/api/cron/birthdays` | arbitrary trainer | the owner (shared group chat) |
> | `/api/cron/coachbot` | arbitrary trainer | the owner (shared group chat) |
> | agent `send_message` | arbitrary trainer, both branches | owner for the group, the client's coach for a DM |
> | `/api/workout-ai` | `clients` where `email = TRAINER_EMAIL OR name ILIKE '%Dustin%'` — a NAME match, which would happily return the other Gautreaux | the client's own coach |
> | `/api/ai-nudges` | `clients` where `email = TRAINER_EMAIL` | the owner (the digest is roster-wide) |
>
> **Deliberately left on the owner:** `/api/celebration`'s "coach Dustins
> lifted" novelty unit, and the nightly nudge digest above. Splitting the digest
> per trainer is Dustin's call, not a default to slide in.
>
> This is what `src/lib/trainerResolve.ts` was written for in `aef27de`, and it
> had **zero importers** until now — dead code that also failed to typecheck the
> instant anything used it (`Promise` where supabase-js returns a thenable, and
> an unused `order` member whose `options?: unknown` alone broke assignability).
> `tests/unit/coachEscalation.test.ts` had to be rewritten: it *required* the
> `trainer_settings` grab, so a passing suite was enforcing the bug. Pinned by
> `tests/unit/trainerInbox.test.ts` (10 tests) and `tests/mutate-trainer-inbox.sh`
> — 12 mutations, 12 caught, one of which only started failing after the test's
> fake database was taught to project the SELECT column list.
>
> **KNOWN NOT DONE:** the Claude trainer agent (`execTrainerTool`) still has no
> trainer identity — it takes `(db, name, input)` and acts roster-wide, and its
> calendar tools fall back to the owner's calendar. That is fine while Dustin is
> the only one driving it; it is the piece to build when Stephanie wants to run
> her clients through Claude herself.

> ## 👉 20 Aug LATE — NO CROSSOVER: MONEY, NOTIFICATIONS, NAMES, FACES
>
> **`origin/main` = `57ad884`.**
>
> **Sixteen RLS policies still named Dustin** — including all four money tables
> and `appointments`. Each was wrong BOTH ways: Stephanie was locked out of her
> own clients' billing, and `is_trainer()` would have handed her Dustin's entire
> book. All now go through `trainer_can_see_client(client_id)`. `device_tokens`
> was `is_trainer()` for ALL commands: any trainer could read and write every
> push token in the system. `trainer_settings` had an owner-wide policy on a
> table holding Google refresh tokens in plaintext.
> Probed live: she sees 1/1/1/0/0/0 of her own probe rows and the shared
> 843-exercise library; the owner sees everything and exactly one
> `trainer_settings` row — his own.
>
> **The AI agent bypasses RLS** (service role, gated on an `isTrainer` boolean).
> `execTrainerTool` now requires a caller identity, scopes every read, fails
> closed on unclassified tables, refuses a client not on the caller's roster,
> and books on the caller's own calendar.
>
> **Seven "which coach?" lookups** — escalations, programming answers,
> self-built-workout notices and agent DMs now reach the client's own coach;
> group chat, birthdays, coachbot and the nudge digest stay with the owner
> deliberately. One of them matched a trainer **by first name**, which with two
> Gautreauxes is a coin flip dressed as a lookup.
>
> **A client of Stephanie's was seeing Dustin** — two photographs of him
> (`/coach-flex.webp` ~1 session in 38, `/coach-head.webp` on every big PR), his
> bodyweight in the "coach Dustins lifted" unit, his "DG" monogram on every
> weekly focus card, "Dr. Gautreaux's Diagnosis", "Dustin messaged you", and a
> privacy policy telling them their progress photos are visible to him.
> `COACH_NAME` is ONE BUILD-TIME ENV VAR: this was never fixable by
> configuration. `src/lib/coachIdentity.ts` + `CoachProvider` resolve the
> viewer's coach once, server-side. The fallback is the owner's NAME and **no
> face** — a generic name is a small wrong, another trainer's photograph is the
> thing this prevents.
>
> **Every AI prompt** was a module constant evaluated at import. All are
> functions of a coach name now, resolved per client (or per signed-in trainer
> for the agent). `isCoachThemselves` was an email allowlist — the day
> Stephanie joined it, her own nutrition card told the model she WAS Dustin, in
> the masculine.
>
> **Two SQL migrations that existed only in prod are now in the repo.** An audit
> could not find `p_trainer_id` anywhere while the running code passed it to
> three RPCs and called a fourth that was not defined here.
>
> **NINE tests were pinning single-trainer behaviour** and had to be rewritten.
> A green suite was enforcing the bug in every case.
>
> ### NEEDS DUSTIN
> - **Stephanie must connect her own Google Calendar** (Settings → Connect).
>   Only she can; Claude cannot perform sign-ins. Until she does her sync simply
>   does not run — no error, no half state.
> - **Her avatar**: send the image and it goes in `trainers.avatar_url`. That
>   ONE column now drives the coach badge, the celebration card and her group
>   posts — group chat used to read `clients.avatar_url`, a different column.
> - **Read the privacy policy** (`src/app/privacy/page.tsx`). It now says "your
>   coach", states trainers cannot see each other's clients, and discloses the
>   owner's access explicitly — because RLS does grant it, so silence was the
>   inaccurate version. It is a legal notice about health data.
> - **The cartoon bot (`AiBadge`) is still global on purpose** — it means "the
>   app wrote this", not "your coach wrote this". If her clients should see
>   different bot art, say so; it is a separate decision from the coach face.
> - **An owner announcement still reaches HER clients too** (full-screen, forced,
>   no opt-out) because `trainer_can_see_client` short-circuits for the owner.
>   Intended?
> - **The nightly nudge digest stays owner-wide.** Splitting it per trainer is
>   your call.
>
> ### DONE 21 Aug — HER FACE, HER BOTS, HER SANDBOX
> Dustin sent two 15-tile sticker sheets. Sliced to 30 circular 256px webp
> avatars and mapped onto all 20 moods in `src/lib/ai/faces.ts`.
> - `trainers.bot_set` names a folder under `/public/bots`; NULL = the original
>   set, so the owner is untouched and a trainer added later degrades to it
>   rather than to a broken image. Hers is `steph`.
> - `trainers.avatar_url` = `/coach/steph.webp` — one column now drives the
>   coach badge, the celebration card AND her group posts.
> - **The group chat keeps ONE bot** (the default set) on purpose: shared room,
>   one voice.
> - **Three of her 20 faces carry another gym's logo** — `flex`, `cool`,
>   `hydrate` came off the mixed sheet because there was no Symmetry-branded
>   flex, thumbs-up or water-bottle tile. Unreadable at 18–40px; regenerate
>   those three if it matters.
> - **Sandbox client** `Demo Client (Stephanie)` — 12 weigh-ins, macro targets,
>   3 weeks of history and 2 weeks ahead on the calendar. Inert by construction:
>   `.invalid` email, no `auth_user_id` (cannot be messaged or pushed),
>   `billing_type = 'none'`, reminders off, excluded from the leaderboard. Safe
>   to archive whenever. It has no avatar of its own — initials, which is what a
>   real new client looks like; putting the coach's cartoon on a fake person
>   would be the confusing option.
>
> ### CLOSED 21 Aug — the tail of the name sweep
> - **Trainer-facing prompts** now take the signed-in trainer: `weekly-brief`,
>   `workout-assist`, `nutrition-ai/plan-build`, `assessment-recommend`, plus
>   the `agent-tools` tool descriptions (which the model reads).
> - **The two group-chat bots** are handed the OWNER's name explicitly rather
>   than reading a constant. One shared room, one voice — as a decision now, not
>   a coincidence that holds while the constant happens to be right.
> - **The install manifest names nobody.** It is one file per deployment,
>   fetched before any session exists and baked into the home-screen install, so
>   "with Dustin" and a "Message Dustin" shortcut went to every client of both
>   trainers. No dynamic route needed — the copy simply should not name a coach.
> - **Client-facing error copy** says "your coach": `ai/scope`, `ai/meter`,
>   `workout-manual`, `recipes`, `ai-assistant`, `plan-build`. Easy to miss
>   because nobody reads it until something has already gone wrong.
> - **`PrankInvoice` cannot fire on a trainer** — both the automatic path and
>   `?prank=1`, which ignored the expiry date.
> - `exclude_from_rankings` **— the earlier note here was WRONG.** Both
>   leaderboard routes go through `unrankedClientIds` in `src/lib/rankings.ts`,
>   which excludes anyone on the trainer list; her address is on it, so she is
>   already off the board and the DB column being false is harmless. Checked.
>
> ### DECIDED 21 Aug — do not "fix" these
> - **An owner announcement reaches EVERY client of BOTH trainers.** Dustin:
>   "yes for announcements about the app all clients need to get it." It is the
>   owner branch of `trainer_can_see_client` and it looks exactly like a scoping
>   hole. Written into `sendBroadcastMessage` and pinned by a test.
> - **Three of her faces carry the other gym's logo** (`flex`, `cool`,
>   `hydrate`). Dustin: "leave them better bodies logo was intentional." Noted
>   in `faces.ts` so nobody regenerates the sheet over it.
>
> ### KNOWN NOT DONE
> - Claudine's 20 Aug report was checked and was **not a bug** — the move worked
>   (`moved_from_date` 08-22 → `scheduled_date` 08-20). The empty-looking day was
>   her own replace-then-delete. A `replaced_by` column was started for it and
>   dropped again rather than left half-wired.

> ## 👉 AI REVAMP — Dustin wants to rework these himself. Do not guess.
>
> Raised 21 Aug: *"revamping the ai generated nudge is on list as well as other
> ai functions I want to make a few adjustments."*
>
> 1. **The AI-generated nudge** (`/api/ai-nudges`). The whole thing: who gets
>    one, how often, what it may say, how it reads. The escalation ladder in
>    `faces.ts` (`lapseMood`, `QUIET_DAYS`) and the segment logic in the route
>    are the two halves to look at together.
> 2. **The nightly "who's drifting" digest**, same route — currently roster-wide
>    and owner-only: every client of both trainers segmented into one message
>    that only Dustin receives, escalation list included. Splitting it per
>    trainer is the obvious change, but he wants to rethink the shape, so it
>    lives here rather than in a fix list.
> 3. **Other AI functions — adjustments to come.** Not yet named. The surfaces,
>    so the conversation has a list: the nutrition coach card and `/act`
>    (`coach-context.ts`), the weekly focus line (`focus-suggestions`), the
>    weekly sweep (`cron/weekly-ai`), the celebration line, Coach Bot, the
>    birthday bot, `attention-drafts`, the trainer agent, `workout-ai`,
>    `workout-assist`.
>
> All of these are per-coach as of 21 Aug — every prompt is a function of a
> resolved coach name — so changing behaviour is now a change to behaviour and
> not a fight with a build-time constant.

> ## QUEUED — added 20 Aug, details to be locked
>
> - **Near-real-time calendar sync.** `trainer_settings` already has
>   `google_sync_token` and `google_channel_id` and nothing reads them. Google
>   push notifications + a sync token replaces the full poll entirely. Would make
>   the hourly narrow run unnecessary.
> - **Food logger interaction rework** — adding a meal, replacing a meal, editing
>   a meal. Dustin: "Will lock details later."
> - **Garmin / Apple / Google Health import** — parked by Dustin, 20 Aug.

> ## 👉 18 Aug — the wrong-date credit, twice, and what actually causes it
>
> **`origin/main` = `9033065`.**
>
> Dustin, 18 Aug: *"hassan has 2 workouts today, I logged one but 2nd one is
> showing."* Same shape as his own on the 17th, one day after that fix shipped,
> and the fix did not catch it.
>
> **THE CAUSE, now known for certain — it is the in-logger EXERCISE SWAP.**
> `swap_exercise()` calls `fork_day_for_client()`, which clones the shared
> library day into a private copy (`days.swapped_from_day_id`, `created_by
> 'swap'`) and repoints that scheduled row at the copy. That is correct — one
> client's swap must not rewrite everybody's workout. But it means **any client
> who swaps an exercise mid-session moves the day underneath their own open
> logger.** This is not rare and it is not going away; it fires every time
> somebody taps swap. Hassan's fork was created at 13:38:31, mid-session.
>
> - `5cef2f4` **the day id was never an identity.** Completion now matches the
>   whole swap FAMILY — the day, its root, and every fork of that root — so
>   which of the two ids the logger happens to hold stops mattering. The point
>   is not that the family finds the row; it is that finding it means the past
>   and future fallbacks are never reached, and both wrong credits came from
>   reaching them. Pull-forward widened the same way. Degrades safely: if `days`
>   cannot be read the family is still `[the opened day]`, i.e. today's
>   behaviour. 25 mutations, all caught; **two of the new ones were not caught
>   on the first run and the gap was in the test, not the code.**
> - `9033065` **the reach-back had no bound.** Found while confirming Hassan's
>   repair: Todd Prine's 23 June session was closed by a workout done 14 August
>   — 52 days. Jennifer Day 42, Stacie Weever 42. The fallback walked backwards
>   until it hit anything still 'scheduled'. Now stopped at seven days, the same
>   window pull-forward uses, with a test pinning the two constants equal.
>   Deliberately opening an old card is a different path and stays unbounded.
>
> **Hassan's data was repaired by hand** (18 Aug completed and linked, 11 Aug
> back to scheduled; backup `bak_sw_hassan_20260818`). The historical rows above
> are NOT rewritten — months old, some may have been deliberate, and nothing in
> the data distinguishes the two after the fact. **Dustin's call.**
>
> Also shipped earlier on the 18th: `eba6a1d` add-to-tomorrow and the delete
> that removed the wrong session, `d083b6d`/`2dc971c` photo-logged meals
> editable (Megan), `3a096d9` the logger no longer re-renders four times a
> second while you rest.
>
> **Still open, not diagnosed:** the Stair Master completion that wrote nothing
> at all (PART 2c of `docs/HANDOFF-2026-08-17-PM.md`); why the delete removed a
> different row than the one tapped. **Dustin's call:** whether to RUN
> `generate_scheduled_workouts` (58 inserts, dry-run verified, not on cron);
> Tyler Dorsett's $15 session rate, Robert Miller's null rate, Madeleine Coker's
> $75/0 sessions.


> ## 👉 17 Aug PM — START AT `docs/HANDOFF-2026-08-17-PM.md`
>
> Supersedes the morning handoff's task list. `docs/HANDOFF-COMPLETE-8-17.md` is
> still the right read for HOW work gets done here (shipping, gates, mutation
> testing, the recurring bug shapes).
>
> **The two emergencies are closed.** Supabase is on Pro + Small — verified from
> the database itself, `max_connections` 90 and 512 MB shared buffers — managed
> daily backups are on, and the storage ceiling went 500 MB → 8 GB.
>
> **Four commits shipped, `origin/main` = `52fc120`:**
>
> - `128e7da` replacing a workout removes the one it replaces, and can PROVE it.
>   The morning handoff named the wrong button: he used "Add a workout", not the
>   swap picker, and could not have used the swap picker because it never listed
>   his own saved workouts. Swap now has search and his own workouts; Add asks
>   replace-or-add.
> - `4b5a351` two existing guards were passing on broken code — a comment
>   satisfied a structural assertion, and a fixed-size source slice decided what
>   a test could see.
> - `5c7ac2f` the third copy of the occupancy bug, in `generate_scheduled_workouts`.
>   Seven pattern-days were being refused, not three. Plus his second rule: a
>   session a human moved off a date is not put back.
> - `52fc120` foods log as "1 egg". The data was already in
>   `food_catalog.serving_options` and nothing in the app had ever read it.
>
> **Later the same day, from one question — "is everything in the group msg live
> in app now?":**
>
> - `b1a95d4` the recipe library could NEVER be published. A trigger rewrote
>   every library recipe back to private on insert because it decides with
>   `is_trainer()` and the service role has no `auth.uid()`. The insert
>   succeeded, an UPDATE reported 20 rows and RETURNED 20 ids, and `updated_at`
>   moved — three "successful" migrations changed nothing. **Read the value
>   back.** 20 recipes now live; shared library 14 → 34.
> - `8aea0c2` My Meals splits into Mine and Library. The flag was already
>   computed and thrown away by the state type. Also: delete was offered on
>   shared rows, and for Dustin it SUCCEEDED — removing a meal from all 30
>   clients from inside his own list.
> - `3f831cc` the group message, every claim fact-checked:
>   `docs/GROUP-MESSAGE-READY-2026-08-17.md`. **Written, not sent. He sends it.**
>
> **Evening, from his screenshots:**
>
> - `7d3f53c` finishing a workout credited the wrong DATE. A fork mid-session
>   moved the day underneath the open logger, so it fell through to the make-up
>   fallback and marked **10 August** done. It now uses the row the session was
>   opened from, which a fork cannot move.
> - `c38148d` the logger shows full movement names again — a 2-line clamp added
>   4 Aug (`0a512b4`) was cutting them off.
> - 🔴 **STILL OPEN, NOT DIAGNOSED:** his Stair Master was completed and the app
>   wrote NOTHING — no log, no sets, no off-plan row. Reaching Complete inserts
>   a log, so this is not a missed tap. See PART 2c of the handoff for what was
>   ruled out and what would settle it.
> - The group message IS POSTED to the group chat, and was rewritten in place as
>   plain text: nothing in the app renders markdown, so `**bold**` showed as
>   literal asterisks to all 30 clients.
>
> **Open, and Dustin's call:** whether to RUN the generator (58 inserts,
> dry-run verified, not on cron).


> ## 👉 17 Aug — START AT `docs/HANDOFF-COMPLETE-8-17.md`
>
> Complete session handoff: every connection, the shipping protocol, the working
> rules, what is already done, and the full ordered task list with the reasoning
> behind each item. Written so a fresh session needs nothing from chat history.
>
> **The two things that outrank all code work:**
>
> 1. **There are NO database backups**, and the database is **364 MB of a 500 MB
>    hard ceiling** — at 500 MB Supabase forces it read-only and the app stops
>    accepting weigh-ins. 30 clients' history with no restore path.
> 2. **This morning's outage was disk I/O starvation on the NANO tier**, not CPU
>    — 96 buffers taking 10 seconds, ~60x slower than NANO's own throttled floor.
>    CPU read 10% *because* everything was blocked on disk. Same disease as
>    15 Aug. It will recur. `docs/DATABASE-DECISION-8-17.md` has the diagnosis,
>    the options and the prices.
>
> Open build work, in order: the swap not removing the workout it replaces
> (diagnosed, two questions outstanding for Dustin), library search on swap,
> adding a food by unit rather than grams, the group message, and the third copy
> of the occupancy bug in `generate_scheduled_workouts`.


> ## 16 Aug — the calendar detector, and why no move could ever apply
>
> Dustin's spec, in his words: *"My programmed schedule is the default and it
> persists. The ABSENCE of an appointment is not a signal and must never flag or
> move anything. An appointment is a POSITIVE signal that can move a workout.
> Nothing else."*
>
> **Fixed and verified live. Three faults, and the second two were not in the
> spec — they were found while checking the first.**
>
> 1. **`reason='orphaned'` reported the default state as an error.** A
>    supervised session sitting exactly where it was programmed, with no Google
>    appointment on that date, raised a proposal. 10 pending, 8 of them Todd
>    Prine's, all false — his recurring series had lapsed while his programming
>    was right. Gone. Orphans are still *computed*, because pairing needs them,
>    but an orphan nothing can absorb now emits nothing.
> 2. **Approving a move could never move anything.** The occupancy guard in
>    `resolve_schedule_proposal()` had no `supervised` filter, so a client's own
>    unsupervised homework on the target date read as "occupied". Simulated
>    against all six pending moves: *supervised* rows on the target date were
>    **0 for every one of them**. Six proposals, six guaranteed no-ops. The
>    feature had never applied a single one.
> 3. **A move that did fire would have moved the whole day.** The update matched
>    `client_id + scheduled_date`, not the proposal's own
>    `scheduled_workout_id` — 2 rows for Greg Lennon, 3 for Sariah Duncan. It
>    now targets that one session, with `from_date` kept only as a staleness
>    guard.
>
> Also found live: **two contradictory pending moves for one session.** Sariah
> Duncan's 19 Aug session had a move to the 18th *and* a move to the 20th, from
> two different nightly runs; the open-proposal unique index keys on `to_date`,
> so nothing stopped it. Each run now retires a pending move it no longer agrees
> with, and pairing picks the **nearest** date rather than sort order.
>
> **Verified against the database, not a success response:** zero pending
> `orphaned`; zero proposals for clients with no future appointments; zero
> sessions with more than one pending move; the function run twice by hand
> returns 82 both times (idempotent); `scheduled_workouts` unchanged — 4,421
> rows, 0 deleted, and the 3 rows updated in 24h are two client logs and one of
> Dustin's own edits at 15:21 UTC, before any of this ran.
>
> **Nothing was deleted.** 11 pending proposals were *superseded*, with every id
> and its previous status recorded in `bak_scp_superseded_20260816`. Both
> function definitions are captured verbatim in
> `bak_detect_schedule_changes_20260816` and
> `bak_resolve_schedule_proposal_20260816` — rollback is `select def` and run it.
>
> Approval stays manual. Nothing auto-applies, and the detector is still on.
>
> Guards: `tests/unit/detectorAbsenceIsNotASignal.test.ts` (20 assertions),
> mutation-tested by `tests/mutate-detector.sh` — **28 mutations, 28 caught**.
> Two holes were found and closed that way: renaming `_scd_orphan` satisfied a
> prefix match, and four mutations that were silently no-ops.
>
> **Still open, and it is Dustin's call, not a build task:**
> `google_channel_id` and `google_sync_token` are both NULL, so the calendar
> only resyncs at 4am. Registering a Google watch channel would give same-day
> pickup. The sync itself is healthy — it does not need fixing.

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
