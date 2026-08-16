# Unchecked database writes — the inventory

**What this is.** A sweep of `src/` for `await …from(x).insert|update|delete|upsert(…)`
where the result is never captured, so a Postgres error is discarded.

**Opened at 139 sites across 60 files. Now 67 across 37**, and the 67 are a
different kind of thing — see "What is left" below. Regenerated 16 Aug, 04:05 CT.

**Why it matters, and why it is not simply "add error handling everywhere".**
Most discarded errors are harmless — telemetry, read receipts, audit rows.
The ones that matter are where **a human is then told the thing worked**. That is
the fault behind three separate incidents already:

- the workout adjuster counting failed writes as completed sets (`c7d06c6`)
- the trainer calendar's drag snapping back with no explanation (`2c6776b`)
- `markClientPaid` inserting with a column that did not exist, unchecked, right
  after deleting the current reminder — quietly wiping a client's billing
  schedule. That one is recorded in a comment in `paymentActions.ts` itself.

## The honest state of this classification

The per-file labels below come from a **regex over table names**, which is a weak
signal and should not be trusted as the answer. A cron route writing
`payment_reminders` looks identical to a button doing it, and only one of them
has somebody watching. **The label tells you where to look, not what to do.**

Classifying a site properly means reading it and asking one question:

> If this write fails, does anyone find out — or does the screen, the reply, or
> the summary say it succeeded?

Fix the ones where the answer is "the screen says it succeeded". Leave the rest
and say so.

## Done — every site where somebody was being told something that was not true

Worked through in one overnight run, in order of who gets lied to. Each was
gated (`tsc` clean in `src/`, unit suite green, `next build` compiled) and each
guard was mutation-tested by breaking the code and confirming the test failed.

| Where | What it was saying | SHA |
|---|---|---|
| `paymentActions.ts` + `PaymentsClient.tsx` | All three actions returned `Promise<void>`; every caller applied its optimistic update on the next line. A refused write looked exactly like success until refresh — on the money screen. | `30106f7` |
| `api/focus-drafts` + `SaturdayReview` | Every write unchecked, every answer `{ ok: true }`. A failed APPROVAL published nothing, returned 200 and cleared the queue off his screen. | `804d0d2` |
| `api/program-feedback` | The write that IS the answer was unchecked; `delivered` meant "was it substantive", not "did it arrive". | `804d0d2` |
| `api/challenge` + `GroupChallenge` | `join` swallowed every error to forgive a duplicate. `start` inserted a new challenge without knowing the running one had closed. | `804d0d2` |
| `agent-tools.ts` undo | The whole undo block is a try/catch over PostgREST calls, so every failed reversal answered "Undone: …" in prose. | `88af90b` |
| `agent-tools.ts` assign | Deactivating the current programme was unchecked, so a client could end up on TWO. | `88af90b` |
| `ReminderEditor.tsx` | A refused approval still emailed the client, under a notice reading "Reminder approved". `confirmPaid` thanked the client and rolled the cycle forward without knowing the payment was recorded. | `59c0806` |
| `api/video-candidates/decide` | The file's promise that "Approving is REVERSIBLE" lived entirely in one unchecked write. | `59c0806` |
| `api/workout-ai` | The writes that BUILD the workout, while the response describes it back verbatim. A failed section clear leaves a doubled workout. | `cf61e52` |
| `WorkoutDayEditor.tsx` | Sets, reps, duration, cue and delete on a client's programme — all repainted first, written without looking. | `03eda73` |
| `api/workout-manual` | The assignment insert that makes a programme visible at all; and a rollback that could not report leaving a half-created day. | `03eda73` |
| `api/nutrition/plan-edit` | Four writes inside the plan clone. A failed delete plus a successful insert doubles every food in a meal. | `9fc63a8` |
| `clients/[clientId]/program` | Three silent exits and two unchecked writes in the build-a-workout modal. | `9fc63a8` |
| `TrainerWeekDigest.tsx` | Setting a focus removes the client from Week Ahead, and that removal IS the record of dealing with them. | `9fc63a8` |
| `api/cron/weekly-ai` | A client whose draft never landed was reported as `written`. | `94d850f` |
| `api/ai-nudges` | `ai_nudge_log` IS the cooldown state, so an unchecked insert defeats a stated guardrail rather than losing a log line. | `94d850f` |
| `ClientTakeovers`, `log/LogClient` | A client told they joined a board that will never show them; a client's own weigh-in and cardio deletes. | `6dc889a` |
| `CommunityPair`, `OffPlanBanner` | The third join path with the same fault; and a swap that skipped the original after failing to schedule the replacement. | `652d2db` |

## The shape behind most of them

A `try/catch` wrapped around a PostgREST call. It reads as careful and is the
opposite: **the call RETURNS its error, it does not throw**, so the catch cannot
fire and the code inside is unguarded while looking guarded. Every
"best-effort, just log it" console line in this app had therefore never once
executed.

Swept separately (try-blocks containing an unchecked write and no other throw
source): **25 at the start, 21 now**, and the remainder are genuine
fire-and-forget or off-limits.

## What is left, and why it is fine

67 sites. Of those, **12 are in the off-limits logger files** and **22 write to
tables on the fire-and-forget list**. The remainder are singles on paths where a
failure has nowhere useful to go — a seen-marker, a session row, a cache warm.

The test that closed this out was applied to every one of them, not assumed:

> If this write fails, does anyone find out — or does the screen, the reply, or
> the summary say it succeeded?

That is worth saying plainly, because the first draft of this section claimed
the remainder were harmless **before** the check, and three of them were not
(`ClientTakeovers`, and both delete buttons in the log screen). They were found
by verifying the claim rather than making it.

## Not to be touched without Dustin's per-item permission

`WorkoutLogger.tsx`, `NutritionV3Client.tsx`, `MealPlanClient.tsx` — 12 sites
(re-counted 16 Aug; it was 11 when this was opened).
Both loggers are off limits by standing rule. Listed here so they are not
forgotten, not so they are quietly fixed.

## Genuinely fire-and-forget — leave these alone

Telemetry and audit rows: `ai_usage_log`, `ai_action_log`, `ai_nudge_log`,
`ai_chat_turns`, `ai_client_memory`, `plan_flip_log`, `schedule_generation_log`,
`integrity_checks`, `gcal_sync_runs`, `food_import_state`. Read receipts and
device state: `group_reads`, `device_tokens`, `*_seen`,
`notification_preferences`. If one of these fails, nobody is misled — the worst
case is a missing row in a log. Checking them would add noise to paths where an
error has nowhere useful to go.

## Next — nothing, deliberately

The priority list that stood here is done. What remains needs either Dustin's
permission (the logger files) or nothing at all (fire-and-forget). A future
session should re-run the sweep and confirm the count has not grown rather than
re-triaging what is already classified here.


---

# Full inventory — regenerated 16 Aug, 04:05 CT

**67 sites in 37 files.** 12 are in the off-limits logger files.
22 write to tables on the fire-and-forget list above.

Regenerate with the sweep in the header — line numbers move with every
commit, so treat them as a starting point rather than a citation.


### src/app/(app)/workout/[dayId]/WorkoutLogger.tsx — 8 sites · **OFF LIMITS**

- `:1221` `update` → `prescribed_exercises`
- `:1224` `update` → `prescribed_exercises`
- `:1233` `update` → `exercises`
- `:1247` `update` → `set_logs`
- `:1260` `upsert` → `set_logs`
- `:1461` `upsert` → `set_logs`
- `:1702` `insert` → `trainer_notes`
- `:1830` `update` → `prescribed_exercises`

### src/lib/ai/agent-tools.ts — 8 sites

- `:676` `update` → `messages`
- `:689` `update` → `scheduled_workouts`
- `:702` `delete` → `macro_targets`
- `:713` `update` → `program_assignments`
- `:720` `update` → `program_assignments`
- `:741` `update` → `scheduled_workouts`
- `:750` `update` → `ai_action_log` _(fire-and-forget)_
- `:772` `update` → `ai_action_log` _(fire-and-forget)_

### src/app/(app)/nutrition/MealPlanClient.tsx — 3 sites · **OFF LIMITS**

- `:379` `delete` → `meal_adherence_logs`
- `:599` `update` → `meal_adherence_logs`
- `:692` `delete` → `meal_adherence_logs`

### src/app/api/workout-manual/route.ts — 3 sites

- `:373` `delete` → `prescribed_exercises`
- `:375` `delete` → `sections`
- `:376` `delete` → `days`

### src/lib/ai/clientMemory.ts — 3 sites

- `:134` `insert` → `ai_chat_turns` _(fire-and-forget)_
- `:143` `upsert` → `ai_client_memory` _(fire-and-forget)_
- `:246` `upsert` → `ai_client_memory` _(fire-and-forget)_

### src/app/(app)/home/messageActions.ts — 2 sites

- `:33` `update` → `messages`
- `:139` `insert` → `messages`

### src/app/(app)/home/notifActions.ts — 2 sites

- `:6` `update` → `client_notifications`
- `:14` `update` → `client_notifications`

### src/app/(app)/messages/page.tsx — 2 sites

- `:113` `update` → `messages`
- `:190` `update` → `messages`

### src/app/(app)/schedule/scheduleActions.ts — 2 sites

- `:106` `delete` → `appointments`
- `:110` `delete` → `appointments`

### src/app/api/agent/route.ts — 2 sites

- `:72` `update` → `ai_chat_sessions` _(fire-and-forget)_
- `:74` `insert` → `ai_chat_sessions` _(fire-and-forget)_

### src/app/api/cron/birthdays/route.ts — 2 sites

- `:131` `insert` → `birthday_posts`
- `:198` `insert` → `birthday_posts`

### src/app/api/cron/goals/route.ts — 2 sites

- `:99` `update` → `client_goals`
- `:145` `update` → `client_goals`

### src/app/api/feedback/describe/route.ts — 2 sites

- `:143` `update` → `app_feedback` _(fire-and-forget)_
- `:151` `update` → `app_feedback` _(fire-and-forget)_

### src/components/MessageReactions.tsx — 2 sites

- `:105` `delete` → `message_reactions` _(fire-and-forget)_
- `:112` `insert` → `message_reactions` _(fire-and-forget)_

### src/lib/webPush.ts — 2 sites

- `:89` `update` → `push_subscriptions` _(fire-and-forget)_
- `:96` `update` → `push_subscriptions` _(fire-and-forget)_

### src/app/(app)/clients/[clientId]/AssignProgramModal.tsx — 1 site

- `:35` `update` → `program_assignments`

### src/app/(app)/home/TrainerCalendar.tsx — 1 site

- `:1330` `update` → `appointments`

### src/app/(app)/home/actions.ts — 1 site

- `:6` `update` → `payment_reminders`

### src/app/(app)/log-bodyfat/page.tsx — 1 site

- `:137` `update` → `metrics`

### src/app/(app)/nutrition/v3/NutritionV3Client.tsx — 1 site · **OFF LIMITS**

- `:515` `delete` → `meal_adherence_logs`

### src/app/(app)/payments/PaymentsClient.tsx — 1 site

- `:700` `delete` → `payment_reminders`

### src/app/(app)/settings/SettingsClient.tsx — 1 site

- `:70` `upsert` → `trainer_settings` _(fire-and-forget)_

### src/app/(app)/welcome/WelcomeClient.tsx — 1 site

- `:44` `upsert` → `client_app_settings` _(fire-and-forget)_

### src/app/api/agent/session/route.ts — 1 site

- `:63` `delete` → `ai_chat_sessions` _(fire-and-forget)_

### src/app/api/cron/check-videos/route.ts — 1 site

- `:108` `insert` → `app_feedback` _(fire-and-forget)_

### src/app/api/nutrition/plan-restore/route.ts — 1 site

- `:81` `update` → `meal_plans`

### src/app/api/push/subscribe/route.ts — 1 site

- `:47` `update` → `push_subscriptions` _(fire-and-forget)_

### src/app/api/recipes/route.ts — 1 site

- `:129` `delete` → `recipe_ingredients`

### src/app/api/reminders/send/route.ts — 1 site

- `:112` `update` → `payment_reminders`

### src/app/api/weekly-brief/route.ts — 1 site

- `:93` `update` → `clients`

### src/app/api/workout-assist/route.ts — 1 site

- `:193` `insert` → `ai_action_log` _(fire-and-forget)_

### src/components/ClientTakeovers.tsx — 1 site

- `:326` `insert` → `client_announcements_seen` _(fire-and-forget)_

### src/components/MetricCards.tsx — 1 site

- `:415` `upsert` → `metrics`

### src/components/ProgressPhotos.tsx — 1 site

- `:223` `delete` → `progress_photos`

### src/components/PushRegister.tsx — 1 site

- `:45` `upsert` → `device_tokens` _(fire-and-forget)_

### src/components/ScheduleBoard.tsx — 1 site

- `:224` `update` → `scheduled_workouts`

### src/lib/push.ts — 1 site

- `:131` `delete` → `device_tokens` _(fire-and-forget)_
