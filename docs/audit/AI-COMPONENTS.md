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
| 2 | **Weekly Focus** line in `ClientWeekSummary` | yes, written elsewhere | `weekly_sweep` | Sonnet | Sunday cron `/api/cron/weekly-ai`; the card only reads `clients.weekly_focus` |
| 3 | **Celebration line** (`MilestoneToast`, and the session-finish screen) | yes | `celebration` | Sonnet | after a session is completed |
| 4 | **Off-plan macro estimates** shown by `OffPlanToday` / `HomeMacrosCard` | yes, written elsewhere | `food_parse` / `food_photo` | Haiku / Sonnet (vision) | when the client logs the food; home only displays the stored numbers |
| 5 | `ProgrammingQuestion` | **no** | — | — | plain form; answers go to `/api/program-feedback` and to the trainer |
| 6 | `ClientTakeovers` | **no** | — | — | scripted first-run tour |
| 7 | `CommunityPair` | **no** | — | — | leaderboard read |
| 8 | Notification cards | **no** | — | — | written by the trainer in `ReminderEditor` |

So home has **four** AI elements, and only **one** of them thinks while the
client is looking at the screen. The other three are display surfaces for text
written somewhere else — which means auditing them is really auditing the cron,
the celebration route and the food parser, on the screens where those run.

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
Reads: `assembleCoachContext` (14 days of logging, weight trend, targets, the
meal plan bounded to today, the profile), the permanent per-client memory
(`ai_client_memory`), the tail of earlier conversations (`ai_chat_turns`), the
live sheet history, and the day's meals. Decides: the answer, plus up to a few
suggestion chips. Writes: the turn, and a folded memory update.

### Where it already knows to go and look something up

Two mechanisms, both real:

- **Tools** (pass 2). The prompt carries a hard instruction: *any* question about
  a period of time — "last 3 weeks", "how have I been doing", "am I being
  consistent" — **must** come from `my_training_summary` with the dates
  resolved, never from the session list already in context. That rule exists
  because the list only holds what they DID, so reading consistency off it made
  the worst attenders look best.
- **Server-assembled context** (pass 3). Everything numeric is computed in
  Postgres and handed over as trusted text; the prompt says never invent numbers,
  and the meal plan is bounded to today so it cannot answer "what's my M3" out of
  a plan that starts next week.

### Open questions for Dustin — element 1

1. **Pass 2 runs on Haiku for everyone but Gerard and Sharon.** That is the pass
   that decides whether to move a session, swap a workout, or log a weigh-in —
   i.e. the one that can do the wrong thing to somebody's week. Extraction was
   raised to Sonnet for those two on exactly that argument. Should the workout
   tools go to Sonnet for the whole roster?
2. **The coach cannot answer a training question in depth** — pass 2 answers with
   tools and returns, so a "why does my knee hurt on lunges" style question ends
   up at pass 3, which has nutrition context and no movement library. Is that the
   intent, or should the coach be able to research the movement library too?
3. **No tool reads the assessment.** The corrective side of the method
   (OHSA findings, root checkpoint, phase) is invisible to the client coach.
   Deliberate, or a gap?

*(Status: awaiting Dustin. Nothing changed in code yet.)*
