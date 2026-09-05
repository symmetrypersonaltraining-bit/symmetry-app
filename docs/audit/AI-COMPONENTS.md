# AI components, screen by screen

Step 0 of the audit (added 4 Sep 2026, at Dustin's request):

> "we need to go through the logic and thinking for each ai component on every
> screen... i want to make sure each ai function is doing exactly what i want it
> to do."

For every AI element on a screen, written down BEFORE any code changes:

- **reads** — what goes into the prompt
- **decides** — what the model is allowed to choose
- **writes** — what lands in the database
- **when** — what makes it run
- **model** — which model, and why that one

Then the three acceptance tests Dustin set (5 Sep 2026):

1. **Model** — is the right model on this job, everywhere it runs?
2. **Behaviour** — does it interact with clients and answer the way he planned?
3. **Research** — does it know to go and look something up rather than answer
   from what happens to be in its context?

---

## HOME (client) — inventory

Rendered by `src/app/(app)/home/ClientDashboard.tsx`. Inventoried from the code,
not from memory, per the audit rule.

| # | Element | AI | Feature (meter) | Model | Runs when |
|---|---------|----|----|-------|-----------|
| 1 | **The Coach** — `BigCoachBar` (in-flow, Gerard + Sharon) and the ✦ FAB (`GlobalCoach`), both opening `CoachChatSheet` → `/api/nutrition-ai/act` | yes | `coach_action`, `coach_workout_tools` | 3 calls per message — see below | client sends a message |
| 2 | **Weekly Focus** line in `ClientWeekSummary` | yes, written by a cron | `weekly_sweep` | Sonnet (both tiers) | Saturday night `/api/cron/weekly-ai`; the card only reads `clients.weekly_focus` |

**Home has exactly two AI elements.** Dustin, 5 Sep, scoping this pass: the
celebration line and the off-plan macro estimates belong to the screens they
run on (`WorkoutLogger` and the food logger), not here.

**Nothing that pops up or takes over the screen on home uses AI.** Checked in
code, all zero AI calls: `ClientTakeovers` (the first-run tour),
`MilestoneToast`, `MilestoneBadges`, `StreakFlame`, `RestDaySlip` /
`FunMoments`. Their copy is hard-written strings with the client's numbers
interpolated. `CelebrationScreen` is the only takeover in the app that IS
written by a model, and it renders inside `WorkoutLogger`, not on home.

Also not AI: `ProgrammingQuestion` (a form — though the QUESTION it asks is
written by the same weekly cron, so it is really a display surface for
element 2), `CommunityPair`, the notification cards (trainer-written in
`ReminderEditor`).

---

## THE BAR — set by Dustin, 5 Sep 2026

> "the main thing i want is any ai needs a very detailed way of thinking to
> make sure its accurate to each client and relevant to them."

So the test for every AI element in this app is not "does it produce sensible
text". It is:

- **Could this output have been written about a different client?** If yes, it
  failed. Every sentence has to be anchored to something only true of this
  person.
- **Is every claim in it traceable to a row?** Not "sounds right" — pointable
  at a number, a session, a logged day, something they said.
- **Does the prompt ask for anything the data does not contain?** That is the
  worst failure mode, because it does not error — it invents. An instruction the
  context cannot support is a licence to make something up.
- **Does it know THIS client** — their injuries, their goal, what they have
  already told the coach, what they were told last week?

---

## HOME — element 1: The Coach

One route serves every coach surface in the app: `/api/nutrition-ai/act`. Home,
nutrition, workout, messages — same door. That is deliberate ("one AI that does
all of it", 12 Aug), and it is why getting this one right fixes it everywhere.

### What happens on one message — three passes, in order

**Pass 1 — extraction.** `modelFor("extract", tier)` → **Haiku** (Sonnet for the
advanced tier: Gerard, Sharon). `ACT_SYSTEM_PROMPT`, max 800 tokens.
Reads: the last 12 turns, the day's meals as the logger is showing them, the log
date, and the message. Decides: is this a definite nutrition **action** (log,
swap, move a meal…) or not. If yes, it returns the action and stops — no further
model call. Writes: nothing directly; the client applies the action.

**Pass 2 — the workout tools.** `modelFor("chat", tier)` → **Haiku** (Sonnet
advanced). `SYMMETRY_SYSTEM_PROMPT` + `assistantContext` + app guide, with seven
client tools: `my_schedule`, `my_workout_options`, `move_my_workout`,
`swap_my_workout`, `add_my_workout`, `log_my_weight`, `my_training_summary`.
Runs only if pass 1 found no action. Its answer is used **only if a tool
actually ran** — otherwise it is thrown away and pass 3 runs untouched.
Writes: schedule changes, weigh-ins, and the conversation turn.

**Pass 3 — the coach answer.** `modelFor("coach", tier)` → **Sonnet, always,
both tiers**. `COACH_SYSTEM_PROMPT`, max 900 tokens.
Reads: `assembleCoachContext` — profile (name, primary + secondary goal,
experience, programmed days/week flagged as PLAN not attendance,
**injuries/limitations**, coaching-since), 14 days of logging, the weight trend,
targets, the meal plan bounded to today — plus the permanent per-client memory
(`ai_client_memory`), the tail of earlier conversations (`ai_chat_turns`), the
live sheet history, and the day's meals. Decides: the answer, plus suggestion
chips. Writes: the turn, and a folded memory update.

### Against the bar

The Coach passes the "could this be about someone else" test better than
anything else in the app: it has the profile, the injuries, 14 days of their
real numbers, and a memory of what they have said. What it does NOT have is a
required **order of thinking** — it is a single-shot answer with a large
context, so how much of that context it actually consults varies by question.

The two places where it IS forced to think in a fixed order are the two that
were paid for in bugs:
- any question about a period of time **must** call `my_training_summary` with
  the dates resolved, never answer off the session list in context (that list is
  only what they DID, so it made the worst attenders look best);
- numbers are computed in Postgres and handed over as trusted text, with "never
  invent numbers", and the meal plan is bounded to today so it cannot quote a
  plan that starts next week.

### Open question for Dustin — element 1

**Pass 2 runs on Haiku for 33 of 35 clients.** That is the pass that decides
whether to move a session, swap a workout, or log a weigh-in — the one that can
do the wrong thing to somebody's week. Extraction was raised to Sonnet for
Gerard and Sharon on exactly that argument. Should the workout tools go to
Sonnet for the whole roster?

---

## HOME — element 2: the Weekly Focus

Written once a week by `/api/cron/weekly-ai`, Saturday night, on **Sonnet** for
everyone. One model call produces four things: `focus` (the line on the week
card), `coachRead`, `foodFocus`, and — fortnightly — the
`programmingQuestion` that `ProgrammingQuestion` asks. Dustin's own hand-set
focus always wins over the model's.

### What it is handed, per client

Genuinely per-client and genuinely numeric — `weeklyNumbersBlock` computes it
all in advance and hands it over as trusted text:

- last week and this-week-so-far, each labelled COMPLETE or PARTIAL
- days food was logged, out of the window
- average kcal/P/C/F across completed logged days (today excluded on purpose)
- signed deltas vs target, marked SOURCE OF TRUTH, do not recompute
- adherence, decomposed into consistency × accuracy, with the definition
- sessions completed of sessions scheduled
- weight at the start and end of the week and the signed change

Plus: the client's name and `primary_goal`. That is all.

### Against the bar — three real gaps

**1. The prompt asks for something the data does not contain.** The
`programmingQuestion` instruction says, verbatim: *"if they skipped legs twice,
ask about that; if every session ran long, ask about session length."* The model
is handed **`- Training: 3 of 4 scheduled sessions completed.`** — a count. It
is not told which sessions, which movements, which body parts, or how long
anything took. It cannot know they skipped legs twice. An instruction to ground
a question in detail the context does not hold is an instruction to invent one,
and it will read as confident and specific and be made up. This is the clearest
failure of the bar anywhere in the app.

**2. It does not know who the client is beyond one word.** The coach chat gets
injuries/limitations, experience level, secondary goals, programmed frequency,
coaching-since. The weekly writer gets `name` and `primary_goal`. So the focus
for a client with a repaired rotator cuff, and the focus for a competitive
lifter, are written from the same picture.

**3. It has no memory and no history of itself.** It never reads
`ai_client_memory` — so the focus can contradict something the client told the
coach three days ago. And it never reads **last week's focus** — so it cannot
say "you held last week's focus, add one notch", cannot avoid repeating the same
line four weeks running, and cannot notice it is contradicting itself.

### Proposed fix — the thinking spec for element 2

Not a prompt reword. Give it the material the bar requires, then require it to
reason in a fixed order:

- add to the context: injuries/limitations, experience, secondary goals,
  programmed frequency; the **per-session detail** for both weeks (which day,
  which sections/region, completed or not) so "skipped legs twice" is knowable;
  the client's memory block; and **last week's focus and whether it was met**.
- require, before writing: name the one thing that changed most between the two
  weeks and cite its number; state whether last week's focus was met; check the
  new focus against the injuries; confirm the focus is not a repeat.
- and where the data genuinely cannot support a grounded programming question,
  write **no question** rather than a plausible one — the route already drops a
  question that describes the coming week, so the machinery for dropping one
  exists.

*(Status: element 1 awaiting Dustin's model call on pass 2. Element 2 gaps found
and proposed; nothing changed in code yet.)*
