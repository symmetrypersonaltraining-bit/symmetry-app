# Needs your answer — nothing below was touched

Dustin, 28 Aug: *"keep a list of the rest that you need me for."* This is it.
Each one is a real choice, not a thing I could look up. Answer inline and the
next run picks them up.

---

## Answered already, recorded here so they are not asked twice

- **Logger permission** — *"logger permission yes"*. Taken as covering #1, #5
  and #6, the three items on that line. #1 is done; #5 and #6 are queued.
- **#3 testers and feedback** — *"no testers don't see feedback"*. Done.
- **#9 Christine's duplicate $640** — *"christine already paid last time, she
  owes now though 1 pmt."* Read as: leave the July duplicate alone, the current
  invoice stands. **One thing still open — see #10 below.**
- **#22 the nudge sweep** — *"nudge should be gone period."* Frozen at the
  database level, proved, still holding at 0 rows since.

---

## 1. #10 — is Christine's current invoice $320 or $400?

You said she owes one payment. The open question is which figure.

Billed **$320** (4 × $80) under the rule in force on 31 July. Under the rule you
set on **20 August** the same cycle computes to **$400** (5 × $80). It is due
22 Aug and now a week overdue. The nightly recalculation deliberately will not
touch an invoice that has been sent, so it will stay $320 until somebody says
otherwise.

> **YOUR ANSWER:**

## 2. #58 — you asked what this one is

70 scheduled workouts carry an `assignment_id` pointing at a **different
programme** than the one the workout's own day belongs to. In plain terms: the
session on the calendar says it is part of Programme A, but the workout it
actually opens comes from Programme B.

What it breaks: anything that reasons about "which programme is this client on"
— coverage checks, progression, and the phase a session is counted against. It
does not corrupt the workout itself, which is why nobody noticed.

Separately the integrity checker reports **576** scheduled workouts with **no
assignment at all**.

To fix it I would back up to a `bak_` table first, then repoint each of the 70
at the assignment that matches its day's programme.

> **YOUR ANSWER (repair the 70? and shall I look at the 576 too?):**

## 3. #23 — verify-food: you said "not sure"

What it does: takes an **existing** catalogue row, overwrites its calories and
macros with model output, and stamps it `verified = true` — in the table every
other AI surface now reads. No backup. It has **never been called** once, but it
is deployed and reachable by any logged-in client.

Why it is not a legitimate exception: a legitimate one would **create** a food
the database lacks. This one rewrites a food that is already there.

Three ways to go:

| | what happens |
|---|---|
| **Delete it** | simplest. Nothing calls it, nothing loses a feature |
| **Review queue** | it writes a proposal you approve; the live row is never touched until you say so |
| **Leave it** | it stays live and reachable |

My recommendation is the **review queue** — it keeps the capability you wanted
without letting a model overwrite a verified row. I did not act, because
"not sure" is not a yes.

> **YOUR ANSWER:**

## 4. #47 — should "1 oz" be the default portion for cheese, nuts and meat?

The banana fix is done. But most verified USDA rows carry only **"100 g"** and
**"1 oz"** and nothing else — cheddar, almonds, every chicken breast. Those still
fall through to the weight default.

An ounce is a real portion a person uses, and it is the label serving. Making it
the default would be better for those foods **and would change the default
portion on tens of thousands of catalogue rows**. That is a product decision
about how logging feels, not a bug fix, so I left it.

> **YOUR ANSWER (default to 1 oz where there is no piece? yes/no):**

## 5. #19 — 1,128 rows of AI-guessed nutrition, and growing

Still accumulating at roughly 19 rows a day while this sits open. Three
questions:

- **The existing rows:** leave / flag visibly as estimates / recompute what can
  be recomputed.
- **When a photo shows a food the database lacks:** log nothing and ask, or log
  it with no macros so the meal is at least recorded?
- **Your other session already chose something adjacent** — meal-edit can now
  return model figures marked `estimated: true`. Confirm that is the pattern you
  want and I will apply it everywhere.

> **YOUR ANSWER:**

## 6. #56 — Alan Meier, Ian Christman, Justin Ray, Oliver Gergelj

No programming, no assignments, nothing. All four are also **active trainer
accounts** added 22–23 Aug alongside Stephanie and Brooke Orton — which reads as
testers. But if any one is a real person waiting on a programme, that is a
different problem.

> **YOUR ANSWER (testers, or real clients?):**

## 7. #38 — what should a streak count?

Home says 10, the card under it says 4, Progress says none. Four
implementations, four rule sets. My reading of your 26 July note: **anything
scheduled that gets logged, and a rest day does not break it.** I will not pick
this for you.

> **YOUR ANSWER:**

## 8. #62 — restore the weekly-focus approval queue?

`weekly_focus_drafts` has zero rows, nothing writes to it, and the sweep
publishes AI copy straight to your clients. Your standing rule is approval
before client-live, so the current behaviour contradicts it — but restoring the
queue means a weekly job for you.

> **YOUR ANSWER (restore the queue, or accept auto-publish?):**

## 9. #63 — the bench press video

Live now on **Barbell Bench Press**: `youtube.com/watch?v=_FkbD0FhgVE`. A
different third-party tutorial from the one you had removed, written straight
into the database outside the review queue. Only you can judge the clip.

> **YOUR ANSWER (keep or clear):**

## 10. #64 — a message to Madeleine, and her real date of birth

The app will now prompt her automatically at her next login and she can fix it
herself. I did **not** send her a message: writing to a client in your voice,
unattended, is not mine to do.

Draft, if you want to send one — one tap:

> *"Hey Madeleine — quick one. The app has your birthday down wrong and it'll
> try to celebrate it on the wrong day. Next time you open it you'll get a
> prompt to set it; takes two seconds. Thanks!"*

If you know her real date of birth I can set it directly instead.

> **YOUR ANSWER:**

## 11. #35 — how pushy should the notification prompt be?

Push currently reaches 3 people out of 36. The fix is a prompt on the home
screen where clients actually are. Once and never again / once a week until they
act / a persistent card until dismissed.

> **YOUR ANSWER:**

## 12. #52 — fill in the missing micronutrients?

**0 of 8,789** verified rows from the `usda` source carry a nutrient panel. The
neighbouring `usda_generic` source is fine — 12,825 of 12,844 have them. So this
is one import that came in without nutrients, not the whole catalogue: a
targeted backfill of one source, not a rebuild. Two related jobs
(`off_micros_backfill`, `off_bulk`) have been **frozen since 16 Aug** still
claiming to be running.

> **YOUR ANSWER (backfill? restart the frozen jobs?):**

## 13. #66 — where does the daily calorie/macros chart go?

Built, correct, mounted nowhere, while the Nutrition screen tells clients to
open Progress for a chart that is not there. Home, Progress, or both?

> **YOUR ANSWER:**


## 14. Verified food rows that carry no household measure

Raised by your cream cheese report on 29 Aug. The unit picker was never the
fault — it offers whatever household servings the **row** declares. The row you
opened declared none, and the search was indifferent to that. Fixed: a row you
can portion now ranks above one that only knows weights.

But **verified rows still outrank portionable ones, deliberately** — a verified
USDA row with accurate macros and no tablespoon beats an unverified crowd row
that has one. Being correct outranks being convenient, which I think is your
rule, but it has a consequence:

Measured across six spreadable foods, the top hit is portionable for **cream
cheese, butter, mayonnaise and sour cream** — and for **peanut butter and olive
oil** it is a verified row offering only "100 g" and "1 oz". So those two still
open on grams.

Filling that gap means **adding gram-per-tablespoon weights to verified rows**.
USDA publishes them. I did not do it, because writing nutrition numbers into
your food database from my own recall is exactly the thing your standing rule
forbids, and I have been wrong four times tonight on numbers I was confident
about.

Three ways to go:

| | what happens |
|---|---|
| **Import them** | pull the household gram weights from USDA's own dataset for the verified rows. Sourced, no guessing. A job, not a fix |
| **You add them as you hit them** | the sheet already has "These numbers look wrong — fix them"; a "one tbsp weighs ___" control would make it your data |
| **Leave it** | those foods open in grams; the picker still lets you type oz |

Same shape as **#12** (the missing micronutrients on the `usda` source) — one
import that came in without a field.

> **YOUR ANSWER:**

---

## And one that is not on the audit list

**The Movement Method storage problem is unsolved, not solved.** 135 documents
and 5.2 MB have to stay in the Claude Project because a scheduled cloud run
reads them at 02:00 with your laptop shut. A private repo does not work — a
cloud session cannot authenticate to one. The public repo does not work — the
engine packs carry client names (176 hits across three files). Everything is
archived and safe; the question is where a 2am run can reach that is not public.
You said you want to revisit this together, so it is here rather than decided.
