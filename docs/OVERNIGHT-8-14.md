# Overnight build — night of 13/14 Aug

**Read the three questions in Section 2 before you sleep. Everything else can wait.**

Nothing in Section 1 needs you. Section 2 is where I'd be blocked at 3am if you
don't answer. Section 3 is what I will not touch without you awake.

---

## 1 · What I'll build while you sleep — no approval needed

Ordered by risk to you, safest first. Each ships on its own with the full gates
(`tsc` clean in `src/`, unit suite green, `next build` compiles) and goes out
through the bridge as its own commit, so you can revert any one of them.

### 1a. Conversational control for Gerard & Sharon — the main event

The gate and the model tier are already live. This is the layer that talks.

- "I don't want to do this one today" → offers from **their** cleared pool only
- "what should I do today?" → **one** recommendation + one line of why
- "move Friday to Saturday" → reschedules, in place, no duplicate row
- "my back is bad today" → their low-back variant
- "we're short on time" → their 20-minute variant

Built on what shipped tonight: the pool filter, the derived movement vocabulary
(44 movements for Gerard, 30 for Sharon), and the fixed swap that renames itself.
The model never sees a workout it isn't allowed to offer, so it can't offer one.

**Also:** a much bigger, more obvious AI button for the two of them only. The
standard one is 56px in a corner — fine for Lauren, not for someone 71 holding
the phone at arm's length.

### 1b. The exercise videos — 101 still have none

**Only doable in a fresh session** (the search budget is per-session and this
one's is spent), so this is the first thing tomorrow rather than tonight. The
151 already found need one press of **"Measure and fill them in"** on
**Library → Exercise Videos** — that's a you-job, 30 seconds.

### 1c. Goals on the Progress screen

Mock-up v2 is in your artifacts. Building in the order that keeps it safe:
`client_goals` table → read-only goal card + chart → the 7-day weigh-in nudge →
goal context into the Progress coach.

**Nothing existing moves.** Goals are new cards above what's already there; the
only edit to an existing file is three lines mounting them. No existing chart
component gets touched, so no existing chart can break.

### 1d. Smaller, all self-contained

- The three open feedback items, triaged: custom workout from the schedule page
  (probably just surfacing the "OR SKIP THE AI" path that already exists), full
  nutrients everywhere, wearable imports (scoped only — it needs your sign-in).
- Update `docs/CLIENT-UPDATE-DRAFT.md` as tonight's items land.

---

## 2 · Three questions — answer these and I'm unblocked all night

**Q1. The two AI marks in the workout logger.** The "Ask your coach" button and
the "AI Programming Note" sheet still wear generic icons instead of the AI face —
the only two places left in the app. It's swapping two icons for two components:
no logic, no layout, no behaviour. The logger is off limits without your say-so,
so I've left them. **Yes or no?**

**Q2. Rebuild your parents' gym days, or leave them?** The duplicate-row bug is
fixed at the database now, so it can't recur. But their Mon/Wed/Fri days were
built by the loop that caused it. I merged them down to one row each, which is
correct — **but every scheduled date now points at the same row**, which is how
it's supposed to work and is not how you built it. If you'd rather rebuild them
cleanly with the right pattern, say so and I'll leave them alone tonight.
**Default if you don't answer: leave them, they're correct as-is.**

**Q3. How far do I go on "the AI can do anything in the app for them"?** Tonight
I'll cover workouts — swap, reschedule, recommend, swap a movement inside a
session. The rest of "anything" is nutrition, weigh-ins, messages, settings.
**Default if you don't answer: workouts only tonight, the rest tomorrow with you
awake.** They're the highest-stakes users in the app and I'd rather widen that
blast radius while you can see it.

---

## 3 · What I will NOT do while you're asleep

- Touch either workout logger (unless Q1 is a yes)
- Delete any programme, or any client's logged history
- Send anything to a client — no messages, no notifications, no group posts
- Change anything for a client other than Gerard and Sharon
- Send the client update message

---

## Where things stand

**Shipped tonight:** `111a9cb` celebrations · `2d108bb` video pipeline ·
`7b531aa` coach escalation · `221e71e` AI faces + DM path killed ·
`da1441a` Bug B · `7988209` Bug A · `90e4626` per-client AI tier ·
`c75914a` contraindication gate · `da9f9d1` duplicate-row root cause.

**Open feedback: 3 items**, all triaged into the list. 99 resolved.

**Waiting on you, whenever:** press "Measure and fill them in" on Library →
Exercise Videos · send the client update · the Jennifer Day 30 Jul double-count
(which of her two records survives).

**Fixed and no longer needing you:** the Fat Loss Cardio Phase 3 duplicate —
kept the original as you said, removed the copy, backed up to
`bak_dustin_dup_aug1_20260814`. Zero duplicate days left in the whole database.
