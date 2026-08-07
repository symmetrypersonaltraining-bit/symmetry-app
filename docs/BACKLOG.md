# Backlog — the single work queue

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

## 1. Custom workout from the schedule page  ← NEXT

`app_feedback` `73fcd284`, 2026-08-06, client-app, from Dustin.

> "Need full add workout custom from schedule page not just pick from library"

Today the schedule page only offers "pick from library". The full custom builder
exists elsewhere — this is about reaching it from the schedule page. Check
whether the AI "Create / Replace Workout" builder (shipped `900af2b`) can be
mounted here rather than building a second one.

## 2. Duplicate-programme bug — INVESTIGATE, DELETE NOTHING

Three copies of **"Knee Stability & Strength"** exist (one 17 Jun, two 25 Jul;
one has zero scheduled rows). This is almost certainly the same root cause that
produced Dustin's triple-logged Arms A on 4 Aug: **one session scheduled by
three different sources** (`claude`, `trainer`, `client_self_assign` — confirmed
in `scheduled_workouts.source`).

Fixing the duplicate *programmes* without fixing whatever writes duplicate
*schedule rows* leaves the real bug in place. Find the write path first.
**Ask Dustin before deleting any programme.**

## 3. Add box bridge and ball bridge to the library

`app_feedback` `8aa820a9`, 2026-08-05. Needs name, modality, video URL, default
tracked fields.

## 4. Full nutrients in the food logger

`app_feedback` `2c2df05f`, 2026-08-04. Currently protein/carbs/fats only —
`meal_items` has no kcal column and everything downstream computes 4P + 4C + 9F.
"Full nutrients" means fibre, sugar, sodium, micros: a schema change plus every
surface that reads macros. **Scope with Dustin before touching** — how far past
fibre/sugar/sodium does he actually want to go?

## 5. Pull from Garmin / Google / Apple

`app_feedback` `95f11695`, 2026-07-29, from Todd Prine. Plan already written:
`docs/HEALTH-SYNC-HANDOFF.md` + `docs/GARMIN-APPLICATION-DRAFT.md`. Phase 0
shipped 2026-08-04. Parked behind the iPhone build, not blocked technically.
This feedback row can be closed against that work.

## 6. Make "trainer" a setting instead of an email address

`docs/MULTI-TRAINER-BACKLOG.md`. 63 call sites across 62 files plus the
`is_trainer()` SQL function. ~a day. Do it before scaling, not after — it is
what stands between Dustin and a second trainer, and why Dylan's instance is a
fork rather than a configuration.

## 7. iOS TestFlight

~45 minutes of App Store Connect clicks **only Dustin can do**. Steps in
`docs/IOS-RELEASE-CHECKLIST.md`. Build side is pre-flighted.

## 8. Smaller / hygiene

- **Tim Yancey dip data.** His 4 Jul Assisted Dip records `20.00` assist and
  18 Jul has an empty `0.00 x0` set. Both look like mis-entries and will poison
  any all-time-best comparison now that assisted lifts are scored correctly.
- **~358 hardcoded colours** across ~40 files, outside the theme system.
- **64 pending schedule proposals** awaiting review.
- **Coach ranking decision.** The coach can now join a challenge, but joining
  does NOT make him ranked — that is `clients.exclude_from_rankings`, untouched
  on purpose. Dustin should say whether joining should imply ranked.

## 9. Security — outstanding

- **Old GitHub PATs still in plaintext** inside `COWORK-INSTRUCTIONS.md`. The
  live token was rotated 2026-08-07; these older ones were not removed.
- A stray `.ghtoken` copy sits on the **Desktop** alongside ~8 obsolete
  `push-sym*` helper files from the dead Chrome-token era. Delete them.
