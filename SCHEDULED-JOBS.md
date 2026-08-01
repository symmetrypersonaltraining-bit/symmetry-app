# Scheduled jobs — the whole picture

Audited 2026-08-01 at Dustin's request: *"we need to go through all scheduled
tasks and make sure we actually need them all... it's going to eat up usage like
crazy."*

Runs and durations below are measured from `cron.job_run_details`, not estimated.

## What changed in the audit

| | before | after | why |
|---|---|---|---|
| `off-bulk-import` | every minute, **1,440 runs/day, 7.74s each = 3.1 hours of database time per day** | **paused** | Backfilling Open Food Facts. It had reached 179,835 of 4,626,862 records — about 4% — at roughly 25k/day, so **another ~173 days** of running every minute to finish. 179k foods is already far more than 35 clients will search, and the logger also has AI parsing for anything missing. This one job was ~99% of all scheduled database work. |
| `gcal_sync_15min` | every 15 min (96/day), full 7,292-event pull + 4,664-row upsert each time | `gcal_sync_12h`, **2/day** | Dustin's call. The 15-minute cadence was inherited from an old GitHub Action, never chosen. Manual Sync Now covers anything urgent. |
| `gcal_sync_harvest` | every 5 min (288/day) | **4/day**, just after each sync | 288 runs a day to record the outcome of 2. |
| `/api/gcal-sync` Vercel cron | daily 14:00 UTC | **removed** | pg_cron owns this schedule now; it was a third daily run nobody asked for, and removing it frees a Vercel cron slot. |
| `/api/cron/weekly-ai` | Sunday 06:00 CT, published straight to clients | **Saturday 06:00 CT, `?draft=1`** | Focus lines are drafts Dustin approves on Saturday instead of publishing unread. |
| — | — | **`publish_focus_drafts_sunday`** added | Sunday 06:00 CT fallback publish. No AI, no HTTP. |
| — | — | **`challenge_cycle_hourly`** added | Scores Sunday 6pm CT, announces and regenerates at 7pm. Hourly because pg_cron is UTC-only and a fixed UTC time drifts an hour at every DST change; the tick reads the local clock instead. Costs 0.06s a run. |

**Net: ~1,730 scheduled runs a day down to about 20.**

## Live jobs

| job | schedule (UTC) | what it does |
|---|---|---|
| `gcal_sync_12h` | `0 9,21 * * *` | Google Calendar → appointments + payments. 4am / 4pm CT. |
| `gcal_sync_harvest` | `5,20 9,21 * * *` | Records each sync's outcome into `gcal_sync_runs` (pg_net is async). |
| `challenge_cycle_hourly` | `5 * * * *` | Scores/closes a due challenge, announces the winner, generates next week's. No-ops except Sunday evening. |
| `publish_focus_drafts_sunday` | `0 11 * * 0` | Publishes any focus draft Dustin didn't approve on Saturday. |
| `generate-payment-reminders` | `0 13 * * *` | Due payment reminders. |
| `calendar_derived_consistency` | `5 11,14,23 * * *` | Supervised workouts follow their appointment; recalculates pending reminder amounts. |
| `detect_schedule_changes_12h` | `30 11,23 * * *` | Builds the schedule-change approval queue. |
| `integrity_checks_12h` | `25 11,23 * * *` | Data integrity sweep. |
| `autoclose-stale-workout-logs` | `0 9 * * *` | Closes workout logs left open. |
| `generate_rotation_plans_daily` | `20 6 * * *` | Meal-plan rotation. |
| `flip_due_meal_plans_daily` | `10 6 * * *` | Activates meal plans whose start date has arrived. |

Vercel crons (`vercel.json`): `/api/reminders/send` daily, `/api/cron/weekly-ai?draft=1` Saturday.

## Resuming the food import

Nothing was deleted. `food_import_state` keeps the cursor (205,300), so it picks
up exactly where it stopped:

```sql
select cron.schedule('off-bulk-import', '*/5 * * * *',
  $$ select public.import_off_bulk(30,100)
     where exists (select 1 from public.food_import_state s
                   where s.source='off_bulk' and s.status <> 'done') $$);
update public.food_import_state set status='running' where source='off_bulk';
```

Note the `*/5` rather than `* * * * *` — a fifth of the load, and the finish date
was never close enough for the difference to matter.

## A bug the audit found

`detect_schedule_changes_12h` was **failing every run** on a unique-constraint
violation (`uq_scp_open`). Every INSERT in that function has `on conflict do
nothing`; the step that pairs an "orphaned" and an "uncovered" proposal into one
"moved" is an UPDATE and had no such guard.

The function is one transaction, so the violation rolled back *everything* — not
just the pair. No orphaned, uncovered, cancelled or retired proposals were being
written at all, on the job that feeds the approval queue payments depend on, and
it reported the failure nowhere a human would see it. Fixed 2026-08-01; the first
clean run produced **64 pending proposals**.
