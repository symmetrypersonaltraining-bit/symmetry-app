# The Waco run — state, and the plan for ~9 days

Written 11 Aug 2026, end of a long session. `origin/main` = `e26d7c5`.
653 tests, 0 failures. All three gates green.

---

## 1. Where the app actually is

**16 commits shipped today.** The short version:

- **Two live client bugs fixed.** Lauren's logger reported a *saved* workout as
  a failure; Claudine couldn't type a decimal because the field deleted her
  decimal point as she typed it. Both were the same shape of mistake — code
  that re-derived state and clobbered what the user had just done.
- **Duplicate schedules closed at both ends**: the copy-week path that created
  them, and a unique index so they cannot exist.
- **Full micronutrients** now flow from AI → plan → totals → UI (33 nutrients,
  grouped, with % of daily value).
- **The app stopped being single-tenant.** Trainer identity is a setting, the
  coach is found by login rather than by the name "Dustin", ~100 pieces of copy
  and every AI prompt name the configured coach, and the APK/OAuth/peak-week
  values follow the instance instead of pointing at Symmetry.
- **Help & Tutorials landed in the shared repo** — it had only ever existed in
  Dylan's fork, so retiring that fork would have deleted it.

**Guard tests now fail the build** on: a hardcoded trainer email, a hardcoded
coach name, an identity check done with `===`, or a lookup that finds a person
by name. Those four mistakes cannot come back quietly.

## 2. What is blocked, and on whom

| Thing | Blocked on | Cost |
|---|---|---|
| Dylan's whole instance | `DUMP-SCHEMA.bat` + the connection string | 5 min |
| iPhone clients / Apple Health later | iOS TestFlight, App Store Connect clicks | ~45 min |

Everything else on the list is mine to do.

---

## 3. The plan — Dustin's picks, in this order

He chose: **nutrition finish**, **AI coach approval loop**, **AI voice
everywhere**. Health Connect 2–6 is deliberately parked.

### Build 1 — Finish nutrition (≈1.5 days) · FIRST

Backlog 4, steps 4 and 5. Two jobs:

1. **Backfill `food_catalog.micros`** from the USDA / Open Food Facts import.
   197,826 rows already carry the legacy four; the rest of the panel is
   available upstream for many of them.
2. **`MealPlanClient.tsx` and `NutritionAverages.tsx` bypass the canonical
   calculators entirely** — their own queries, their own maths. They will never
   pick up any of the micronutrient work, and more importantly they can already
   disagree with the rest of the app about the same day. That is worth fixing
   for its own sake, not just for micros.

**Why first:** it closes something already in flight, and a screen that computes
its own version of a number is a bug that gets reported as "the app is wrong"
with no way to tell which screen is lying.

### Build 2 — AI coach approval loop (≈3 days)

Backlog 4b. Dustin's own idea: the AI drafts a message, **it lands in his inbox
for approve / edit / skip**, it sends under his name, and **what he changed
becomes the training signal**.

Build on what exists rather than starting fresh:

- `/api/ai-nudges` already runs preview-first (`send` defaults false, writes
  `ai_nudge_log` with `sent=false`, digests to Dustin). That IS the
  approve-before-send skeleton — it just has no way for him to say yes.
- `/api/attention-drafts` is the existing "AI drafts, trainer reviews" pattern.
- `client_private_profiles.coach_notes` is trainer-only and is the natural home
  for learned per-client preferences. No new table needed for v1.

The learning is the point, and **the diff between what the AI wrote and what he
actually sent** is the highest-signal, lowest-effort version of it.

### Build 3 — AI voice everywhere (≈2 days) · LAST, deliberately

~15 system prompts: nudges, coach chat, weekly brief, focus, celebration, coach
bot, birthdays, the workout and meal-plan builders.

**It goes after Build 2 on purpose.** Once the approval loop exists, every
rewritten prompt gets judged by Dustin approving or editing its output — so the
voice work is measured against what he actually sends instead of against
someone's taste. Doing it first would mean tuning blind.

### Remaining ~2–3 days

- **The tutorial rewrite** he parked for Waco (see `HANDOFF-8-11.md`). Needs
  walking the app together, screen by screen, plus a decision on how drift gets
  caught by something other than someone remembering.
- **Finish Dylan's instance** once the schema lands (~half a day).
- Backlog 1 (custom workout from the schedule page), hygiene, the demo account.

---

## 4. Standing rules for big builds

Learned the hard way, today and before:

- **One logical change per commit, gates before every push.** `npx tsc --noEmit`
  (0 errors in `src/`), `npm run test:unit`, `npx next build`. The `/login`
  prerender error in the sandbox is expected — missing env vars, not a fault.
- **Never end a session with work only in the sandbox.** The container is
  deleted when the session ends.
- **Both workout loggers are off limits** without per-item permission.
- **Back up to a `bak_*` table before any destructive DB change**, and ask
  before deleting a programme.
- **A fix is not done until the failure it causes is impossible to reintroduce
  quietly.** Every guard test in `tests/unit/trainerIdentity.test.ts` exists
  because the same class of bug came back once already.
- **Verify against real data, not against the code.** Today's two worst finds —
  Lauren's duplicate log and the schedule duplicates sharing a `created_at` to
  the microsecond — came from querying the database, not from reading the file.
