# Unchecked database writes — the inventory

**What this is.** A sweep of `src/` for `await …from(x).insert|update|delete|upsert(…)`
where the result is never captured, so a Postgres error is discarded. **139 sites
across 60 files.**

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

## Done

- **`payments/paymentActions.ts` + `PaymentsClient.tsx` — fixed.** All three
  actions returned `Promise<void>` with the write unchecked, and every caller
  applied its optimistic state update on the very next line, unconditionally. A
  refused write looked exactly like success until the next refresh. They now
  return an error string; callers alert and skip the update. The inline amount
  editor also stays open on failure, because closing it is itself a success
  signal. Nine assertions, mutation-tested.

## Not to be touched without Dustin's per-item permission

`WorkoutLogger.tsx`, `NutritionV3Client.tsx`, `MealPlanClient.tsx` — 11 sites.
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

## Next, in priority order — by who gets lied to

1. **`schedule/actions.ts`, `schedule/scheduleActions.ts`** (6) — appointments
   and cardio/workout logs written from server actions with optimistic UI.
   Same shape as payments, same blast radius for a trainer's day.
2. **`home/messageActions.ts`** (6) — a message that appears sent and was not.
3. **`api/invite-client`, `api/create-client`, `api/create-client-from-assessment`,
   `api/complete-onboarding`, `set-password`** (7) — onboarding, where a half-written
   client is worse than a failed one.
4. **`api/challenge`, `api/program-feedback`, `api/focus-drafts`,
   `api/video-candidates/*`** — trainer-facing, lower stakes.
5. **`api/cron/*`, `api/weekly-ai`, `api/coach/focus`** — no human waiting, but a
   silent failure here is invisible for weeks. Logging is enough; alerts are not.

---

# Full inventory


### src/app/api/workout-ai/route.ts — 9 sites · **human-facing**

- `:339` `await admin.from("days").update({ label: workout.title }).eq("id", dayIdNew);`
- `:340` `await admin.from("sections").delete().eq("day_id", dayIdNew);`
- `:365` `await admin.from("prescribed_exercises").insert({`
- `:430` `await admin.from("scheduled_workouts")`
- `:435` `await admin.from("scheduled_workouts").insert({`
- `:452` `await admin.from("scheduled_workouts").update({ status: "skipped" })`
- `:457` `await admin.from("scheduled_workouts").insert({`
- `:462` `await admin.from("scheduled_workouts").update({ status: "skipped" })`
- `:475` `await admin.from("messages").insert({`

### src/lib/ai/agent-tools.ts — 9 sites · **mixed**

- `:136` `await db.from("ai_action_log").insert({ action, client_id: clientId, summary, undo });`
- `:561` `await db.from("program_assignments").update({ active: false }).eq("client_id", clientId).eq("active", true);`
- `:654` `await db.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", u.message_id as string);`
- `:656` `await db.from(u.table as string).delete().eq("id", u.id as string);`
- `:661` `await db.from("scheduled_workouts")`
- `:665` `await db.from(u.table as string).update(u.values as Record<string, unknown>).eq("id", u.id as string);`
- `:690` `await db.from("ai_action_log").update({ undo_error: failures.join("; ").slice(0, 300) }).eq("id", row.id);`
- `:710` `await db.from("ai_action_log").update({ undo_error: msg.slice(0, 300) }).eq("id", row.id);`
- `:713` `await db.from("ai_action_log").update({ undone_at: new Date().toISOString() }).eq("id", row.id);`

### src/app/(app)/workout/[dayId]/WorkoutLogger.tsx — 7 sites · **OFF-LIMITS**

- `:1247` `await supabase.from("prescribed_exercises")`
- `:1256` `await supabase.from("exercises").update({ default_tracked_fields: nf }).eq("id", exerciseId);`
- `:1279` `await supabase.from("set_logs").update({ completed: false })`
- `:1301` `await supabase.from("set_logs").upsert({`
- `:1541` `await supabase.from("set_logs").upsert(rows, { onConflict: "workout_log_id,prescribed_exercise_id,set_number" `
- `:1785` `await supabase.from("trainer_notes").insert({`
- `:1917` `await supabase.from("prescribed_exercises").update({ exercise_id: newExercise.id }).eq("id", peId);`

### src/app/(app)/home/messageActions.ts — 6 sites · **human-facing**

- `:34` `await supabase`
- `:50` `await supabase.from('messages').insert({`
- `:80` `await supabase.from('messages').insert({`
- `:113` `await supabase.from('messages').insert(rows);`
- `:118` `await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: i`
- `:147` `await supabase.from("messages").insert({ from_id: user.id, to_id: user.id, client_id: null, body, image_url: i`

### src/components/ReminderEditor.tsx — 5 sites · **human-facing**

- `:334` `await sup.from("payment_reminders").update(patch).eq("id", r.id);`
- `:361` `await sup.from("payment_reminders").update({`
- `:366` `await sup.from("client_notifications").insert({`
- `:375` `await sup.from("payment_reminders").insert({`
- `:390` `await sup.from("payment_reminders").delete().eq("id", r.id);`

### src/app/api/video-candidates/decide/route.ts — 5 sites · **human-facing**

- `:65` `await db`
- `:78` `await db.from("exercises").update({ video_url: c.previous_video_url }).eq("id", c.exercise_id);`
- `:79` `await db`
- `:115` `await db`
- `:127` `await db`

### src/app/api/challenge/route.ts — 4 sites · **human-facing**

- `:233` `await db`
- `:243` `await db.from("challenge_participants").insert({ challenge_id: liveId, client_id: cid });`
- `:260` `await db`
- `:279` `await db`

### src/app/api/ai-nudges/route.ts — 4 sites · **mixed**

- `:268` `await admin.from("ai_nudge_log").insert({`
- `:286` `await admin.from("ai_nudge_log").insert({ client_id: r.id, segment: seg, tone, sent: false, suppressed });`
- `:366` `await admin.from("ai_nudge_log").insert({`
- `:386` `await admin.from("messages").insert({`

### src/app/(app)/clients/[clientId]/day/[dayId]/WorkoutDayEditor.tsx — 4 sites · **human-facing**

- `:245` `await supabase.from("prescribed_exercises").delete().eq("id", pe.id);`
- `:299` `await supabase.from("prescribed_exercises").update({ [field]: v }).eq("id", pe.id);`
- `:310` `await supabase.from("prescribed_exercises").update({ [field]: v || null }).eq("id", pe.id);`
- `:323` `await supabase.from("prescribed_exercises").update({ cue: e.target.value || null }).eq("id", pe.id);`

### src/lib/ai/clientMemory.ts — 4 sites · **mixed**

- `:146` `await db.from("ai_chat_turns").insert(rows);`
- `:155` `await db`
- `:261` `await logUsage(clientId, "memory_fold", res.tokensIn, res.tokensOut, HAIKU_MODEL, { latencyMs: res.latencyMs, `
- `:264` `await db.from("ai_client_memory").upsert(`

### src/components/OffPlanBanner.tsx — 3 sites · **human-facing**

- `:74` `await (supabase as any).from("scheduled_workouts").insert({`
- `:117` `await (supabase as any).from("scheduled_workouts").update({ status: "skipped" })`
- `:126` `await supabase.from("offplan_workout_logs").delete().eq("id", id);`

### src/app/api/focus-drafts/route.ts — 3 sites · **human-facing**

- `:101` `await db.from("weekly_focus_drafts").update({ focus, edited_at: new Date().toISOString() }).eq("id", body.id);`
- `:114` `await db.from("weekly_focus_drafts").update({ approved_at: now }).eq("week_start", week).is("published_at", nu`
- `:116` `await db.from("weekly_focus_drafts").update({ approved_at: now }).eq("id", body.id);`

### src/app/api/cron/weekly-ai/route.ts — 3 sites · **human-facing**

- `:234` `await db.from("weekly_focus_drafts").insert({`
- `:239` `await db.from("weekly_focus_drafts")`
- `:255` `await db`

### src/app/api/program-feedback/route.ts — 3 sites · **human-facing**

- `:101` `await db`
- `:125` `await db.from("clients").update({ notes }).eq("id", cid);`
- `:144` `await db.from("messages").insert({`

### src/app/api/workout-manual/route.ts — 3 sites · **human-facing**

- `:190` `await db.from("program_assignments").insert({`
- `:393` `await db.from("sections").delete().eq("day_id", created.days);`
- `:394` `await db.from("days").delete().eq("id", created.days);`

### src/app/(app)/schedule/actions.ts — 3 sites · **human-facing**

- `:17` `await supabase.from("cardio_logs").insert({`
- `:39` `await supabase`
- `:49` `await supabase.from("workout_logs").insert({`

### src/app/(app)/schedule/scheduleActions.ts — 3 sites · **human-facing**

- `:39` `await supabase.from('appointments').update(updates).eq('id', params.appointmentId);`
- `:95` `await supabase`
- `:100` `await supabase.from('appointments').delete().eq('id', params.appointmentId);`

### src/app/(app)/clients/[clientId]/program/page.tsx — 3 sites · **human-facing**

- `:365` `await supabase.from("prescribed_exercises").insert({`
- `:394` `await supabase.from("prescribed_exercises").update({`
- `:1041` `await supabase.from("scheduled_workouts").delete().eq("id", id);`

### src/app/(app)/nutrition/MealPlanClient.tsx — 3 sites · **OFF-LIMITS**

- `:385` `await supabase.from("meal_adherence_logs").delete().eq("id", id);`
- `:853` `await supabase.from("meal_adherence_logs").update({ notes: note }).eq("id", existing.id);`
- `:946` `await supabase.from("meal_adherence_logs").delete().eq("id", existing.id);`

### src/components/MessageReactions.tsx — 2 sites · **human-facing**

- `:127` `await supabase`
- `:134` `await supabase.from("message_reactions").insert({ message_id: messageId, user_id: userId, emoji });`

### src/components/TrainerWeekDigest.tsx — 2 sites · **human-facing**

- `:197` `await supabase.from("clients").update(update).eq("id", id);`
- `:234` `await supabase.from("clients").update({ digest_snoozed_until: until }).eq("id", id);`

### src/app/api/coach/focus/route.ts — 2 sites · **human-facing**

- `:78` `await supabase.from("clients").update({ ai_focus_question: null }).eq("id", clientId);`
- `:143` `await supabase.from("clients").update(update).eq("id", clientId);`

### src/app/api/cron/goals/route.ts — 2 sites · **human-facing**

- `:99` `await db.from("client_goals").update({`
- `:145` `await db.from("client_goals").update({ rolled_to_id: (created as { id: string }).id }).eq("id", goal.id);`

### src/app/api/cron/birthdays/route.ts — 2 sites · **human-facing**

- `:137` `await db.from("birthday_posts").insert({ client_id: p.id, year: Number(tomorrowIso.slice(0, 4)), kind: "heads_`
- `:206` `await db.from("birthday_posts").insert({ client_id: p.id, year, kind: "group" });`

### src/app/api/agent/route.ts — 2 sites · **human-facing**

- `:83` `await db.from("ai_chat_sessions").update({ messages: flat, updated_at: new Date().toISOString() }).eq("id", id`
- `:85` `await db.from("ai_chat_sessions").insert({ context_type: CONTEXT_TYPE, messages: flat });`

### src/app/api/video-candidates/verify/route.ts — 2 sites · **human-facing**

- `:236` `await db`
- `:242` `await db`

### src/app/api/invite-client/route.ts — 2 sites · **human-facing**

- `:75` `await supabase.from("clients").update({ auth_user_id: authUserId }).eq("id", clientId);`
- `:79` `await admin.from("client_app_settings").upsert({`

### src/app/api/create-client-from-assessment/route.ts — 2 sites · **human-facing**

- `:123` `await admin.from("client_assessments").update({ client_id: clientRow.id }).eq("id", assessment.id);`
- `:126` `await admin.from("client_app_settings").upsert({`

### src/app/api/nutrition/plan-edit/route.ts — 2 sites · **human-facing**

- `:142` `await admin.from("meal_items").insert(edited.map((it, i) => ({ meal_id: copyId, ...it, position: i + 1 })));`
- `:182` `await admin.from("meal_items").delete().eq("meal_id", targetMealId);`

### src/app/(app)/home/notifActions.ts — 2 sites · **human-facing**

- `:6` `await supabase`
- `:14` `await supabase`

### src/app/(app)/messages/page.tsx — 2 sites · **human-facing**

- `:115` `await supabase`
- `:196` `await supabase`

### src/components/NotificationCenter.tsx — 1 site · **human-facing**

- `:85` `await Promise.all([`

### src/components/CommunityPair.tsx — 1 site · **human-facing**

- `:137` `await supabase`

### src/components/MetricCards.tsx — 1 site · **human-facing**

- `:421` `await supabase.from('metrics').upsert(`

### src/components/GroupChallenge.tsx — 1 site · **human-facing**

- `:168` `await supabase`

### src/components/ClientTakeovers.tsx — 1 site · **human-facing**

- `:689` `await supabase.from("challenge_participants").insert({ challenge_id: pick.challenge.id, client_id: meId });`

### src/components/PushRegister.tsx — 1 site · **fire-and-forget**

- `:46` `await (supabase as any).from("device_tokens").upsert(`

### src/components/ProgressPhotos.tsx — 1 site · **human-facing**

- `:237` `await supabase.from("progress_photos").delete().eq("id", p.id);`

### src/app/api/reminders/send/route.ts — 1 site · **human-facing**

- `:116` `await supabase`

### src/app/api/weekly-brief/route.ts — 1 site · **fire-and-forget**

- `:94` `await admin.from("clients").update({ week_brief_seen_week: weekStart }).eq("id", clientId);`

### src/app/api/recipes/route.ts — 1 site · **human-facing**

- `:132` `await admin.from("recipe_ingredients").delete().eq("recipe_id", recipeId);`

### src/app/api/cron/check-videos/route.ts — 1 site · **human-facing**

- `:110` `await db.from("app_feedback").insert({`

### src/app/api/feedback/describe/route.ts — 1 site · **human-facing**

- `:153` `await db.from("app_feedback").update({ image_summary: `[could not read the screenshot: ${msg}]` }).eq("id", fe`

### src/app/api/agent/session/route.ts — 1 site · **human-facing**

- `:74` `await db.from("ai_chat_sessions").delete().eq("context_type", CONTEXT_TYPE);`

### src/app/api/create-client/route.ts — 1 site · **human-facing**

- `:131` `await admin.from("client_app_settings").upsert({`

### src/app/api/complete-onboarding/route.ts — 1 site · **human-facing**

- `:46` `await admin.from("metrics").insert({`

### src/app/api/workout-assist/route.ts — 1 site · **fire-and-forget**

- `:199` `await admin.from("ai_action_log").insert({`

### src/app/api/nutrition/plan-restore/route.ts — 1 site · **human-facing**

- `:82` `await admin.from("meal_plans").update({ status: "archived" }).in("id", displace);`

### src/app/(auth)/set-password/page.tsx — 1 site · **human-facing**

- `:77` `await supabase`

### src/app/(app)/settings/SettingsClient.tsx — 1 site · **human-facing**

- `:70` `await supabase.from("trainer_settings").upsert({ user_id: userId, gcal_sync_enabled: val }, { onConflict: "use`

### src/app/(app)/home/actions.ts — 1 site · **human-facing**

- `:6` `await supabase`

### src/app/(app)/home/TrainerCalendar.tsx — 1 site · **human-facing**

- `:1348` `await supabase.from("appointments").update({`

### src/app/(app)/clients/[clientId]/AssignProgramModal.tsx — 1 site · **human-facing**

- `:35` `await supabase`

### src/app/(app)/payments/PaymentsClient.tsx — 1 site · **human-facing**

- `:709` `await supabase.from("payment_reminders").delete().eq("id", c.reminderId);`

### src/app/(app)/welcome/WelcomeClient.tsx — 1 site · **human-facing**

- `:45` `await sb.from("client_app_settings").upsert(`

### src/app/(app)/nutrition/v3/NutritionV3Client.tsx — 1 site · **OFF-LIMITS**

- `:531` `await supabase.from("meal_adherence_logs").delete().eq("id", id);`

### src/app/(app)/log-bodyfat/page.tsx — 1 site · **human-facing**

- `:137` `await supabase.from("metrics").update({ weight: __lastW.weight })`

### src/lib/useNotificationFeed.tsx — 1 site · **human-facing**

- `:230` `await markGroupRead(supabase);`

### src/lib/moveWorkout.ts — 1 site · **human-facing**

- `:69` `await sb.from("workout_logs").update({ log_date: toDate }).eq("id", logId);`
