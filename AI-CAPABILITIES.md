# What the AI can do, screen by screen

Written 2026-08-01 from the code, not from memory. Where something does not work,
it says so.

---

## Trainer app

### Every screen — the round **AI** button, top right

Opens the "Symmetry AI" drawer. This is the agent, and it is the only place in
the app that can **act** rather than answer. Runs on Sonnet with the service-role
key, so row-level security is not a constraint on it.

It has six tools:

| Tool | Reads / writes | What it reaches |
|---|---|---|
| `find_clients` | read | Any client by partial name, or the whole roster |
| `client_overview` | read | Profile, goals, injuries, notes, last 6 metrics, program + phase, macro targets, 30/7-day adherence, streak, weigh-in recency, body-comp trajectory |
| `client_workouts` | read | Next 10 scheduled sessions, full exercise tree, with the ids needed to edit them |
| `client_nutrition` | read | Live meal plan, macro targets, recent daily totals, averages vs targets |
| `adjust_workout` | **write** | Swap / modify / remove / add exercises, on one session or the whole upcoming series |
| `set_macro_targets` | **write** | New dated macro targets (history preserved) |

`adjust_workout` clones a library day into a client-owned copy before editing, so
the master library is never touched by AI.

**It executes immediately — no confirmation step, no undo.** That is a deliberate
trade for speed, but worth knowing before asking it to change a series.

### Client profile → **🤖 AI Workout Assist**

Chat about a client's programming, then **Apply** — either to one date or to all
upcoming sessions. Unlike the header agent, this one always shows you the
proposal first and waits for the tap.

### Trainer home
- **Week ahead** — opening a client's focus editor auto-loads three AI-written
  focus options. Tap to fill, then edit before saving. Falls back to rule-based
  options silently if the AI is unavailable.
- **Saturday review** — approve or edit next week's focus for all 35 clients.
  The lines are written by the Saturday cron; the review screen itself is not an
  AI call.

### Workout logger (running a client's session)
- **Weekly brief** on the client's first session of the week: derived facts with
  one AI line on top. Acknowledging it marks the week seen.

### Assessment → **Generate Recommendation**
Program + phase + written summary from the assessment answers.

### Movement screen
Deterministic movement engine plus one AI call that writes the client-facing
explanation. The AI never decides the findings — it only puts them in plain
language, and a guard scrubs clinical terms out of the surface copy.

### Nutrition, viewing a client
You get the client's own AI surfaces (coach, plan builder, photo, parse), metered
against **their** daily caps, not yours.

---

## Client app

### Nutrition logger — the ✦ button
The coach sheet. Ask anything, or say what you ate. It can propose:
swap a meal · move a meal · copy a meal · delete a meal · add a snack ·
log a meal · unlog a meal.

Actions always come back as a confirmation card — **the AI never writes without a
tap.** As of today the card names the day it will write to whenever that is not
today, because the logger remembers which date you were last looking at.

### Nutrition logger — everything else
- **AI parse items →** free text to itemised macros
- **✦ Off-plan (photo / text)** photo of a meal to macros, including fibre,
  sugar, sodium and saturated fat
- **✦ Build me a plan from targets** / **✦ Recommend my targets** — a five-meal
  plan draft; nothing is saved until confirmed
- **Your week** card — written by the Sunday sweep from last week's real numbers
- The ✦ insight card — one proactive observation per day

### Workout logger — **🏋️ Create / Replace Workout**
Three modes: replace today's workout, "what do you have?" (photograph the
equipment in front of you), and "what did you do?" (log an activity after the
fact). This one **does** write — it creates the session and messages the trainer.

### Workout complete
An AI-written celebration line, plus PR detection. Never blocks the celebration
if the AI is slow or down.

### Client home
The **Focus** line and the fortnightly **programming check-in** are AI-written,
but by the weekly sweep rather than live.

### Messages, Progress, Settings, Schedule
No AI. Deliberately.

---

## Limits and cost control

Per-client daily caps, reset at midnight Central, in `client_app_settings`:

| Bucket | Column | Default |
|---|---|---|
| chat (coach, act, focus, briefs, celebration, assist) | `ai_daily_chat_limit` | 15 (yours: 120) |
| food parse | `ai_daily_parse_limit` | 20 |
| meal photo | `ai_daily_photo_limit` | 15 |
| plan build | `ai_daily_plan_build_limit` | 1 |
| workout build | `workout_build_daily_limit` | 8 |

Feature switches: `coach_enabled`, `workout_ai`, `nutrition_v3`, `nudges_enabled`.

**Global kill switch: $95/month.** Past it, every metered route returns a
friendly "AI is paused" instead of calling the model, and you get one email a
day. Month to date is currently about **$0.05**.

### Three holes in that, fixed today

1. `ai_usage_log` had a CHECK constraint listing only six feature names. The code
   logs two more — `workout_build` (which is **Sonnet**, the most expensive thing
   a client can trigger) and the `kill_switch_notice` marker. Both inserts failed
   the constraint, and the logger swallows errors by design so a metering failure
   can't break a working feature. Net effect: **every Sonnet workout build was
   invisible to the spend cap**, the 8/day workout-build limit was never actually
   enforced, and **the "AI paused" email could never have been sent**, because
   the notifier bails when the marker insert fails.
2. The trainer agent only logged its usage when you resolved to a client row.
   Its Sonnet spend could have gone uncounted entirely. Now unconditional.
3. `client_app_settings` had two plan-build limit columns — the code read one,
   a human editing settings would reach for the other. Merged into one.

---

## What the trainer AI still cannot do

Your stated goal is *"anything I can do from the Claude chat, in case I run out
of usage."* It is not there yet. Honest list, roughly by daily value:

1. **Send or read messages.** Cannot message a client or the group, cannot read
   your inbox.
2. **Create, move, or cancel a scheduled session.** It edits the *contents* of an
   existing session only. (The client-facing workout AI can create sessions; the
   trainer agent cannot.)
3. **Assign a program or advance a phase.**
4. **Record a weigh-in, body fat, or measurement.**
5. **Build or assign a meal plan.** `set_macro_targets` is its only nutrition
   write.
6. **Edit a client profile** — goals, injuries, fees, notes, frequency.
7. **Change any setting or limit**, including its own.
8. **Touch the master library** — programs, phases, library days, the exercise
   library.
9. **Payments, fees, reminders.**
10. **Challenges, leaderboard, movement approvals, app feedback, AI spend.**

And four shape-level gaps that matter as much as the list above:

- **No general read.** Six fixed queries; anything outside them is invisible.
  There is no SQL tool and no table browser, so it cannot answer a question
  nobody anticipated.
- **No images.** Text only — you cannot paste a form-check photo or a whiteboard
  program into it. (The client-facing photo flows do take images.)
- **No memory.** History lives in the drawer's React state and is gone on
  navigation or refresh.
- **No confirmation or undo** on its two write tools.

Closing 1, 2, 3 and 4 plus a general read tool would cover most of what you'd
otherwise open a Claude chat for. That is the next meaningful build on this
front, and it is a real one — not an afternoon.

---

## Loose ends found while mapping this

- `/api/ai-assistant` has **no reachable UI** any more, and no metering or kill
  switch. Dead code with a live API key attached.
- `/api/nutrition/analyze-meal` and `/api/assessment-recommend` have **no auth
  check at all** and no metering. The first has no caller; the second is reachable
  from the assessment page.
- `/api/movement-analyze` runs Sonnet with no metering and no kill switch.
- `/api/nutrition-ai/verify-food` can correct `food_catalog` macros and has no
  caller anywhere.
- `/api/ai-nudges` can write messages to clients and never calls the usage
  logger, so its spend does not count toward the $95 cap.
- `AttentionFeed` and its draft-a-message endpoint are built but not mounted.
