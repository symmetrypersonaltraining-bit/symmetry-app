# Still needs you — 1 Sep 2026

Nothing here is blocked on work. Each one is a decision only you can make,
ordered by what it costs to leave open.

---

## 0. Sariah has TWO payment series in your calendar — she will be billed twice in October

Added later on 1 Sep, and this one has a deadline.

Adding her to the 30th did not move her; it added a **second** recurring $700
beside the one on the 3rd that has run since July. Both are in Google Calendar,
both sync, and both go out to December:

| month | events |
|-------|--------|
| Sep | 3rd, 30th |
| Oct | 3rd, 30th |
| Nov | 3rd, 30th |
| Dec | 3rd, 30th |

August and September's pairs are close enough together that the generator's new
ten-day guard treats them as one payment. **October's pair is 27 days apart,
which looks exactly like an ordinary monthly gap** — so she would be invoiced
$700 twice, $1,400 for eight sessions at $87.50.

**The calendar is the source of truth, so this has to be fixed there: delete the
recurring payment on the 3rd in Google Calendar.** Deleting the rows in the
database only brings them back on the next sync. A new integrity check,
`two_payment_series_one_month`, will keep flagging her until it is done.

### And the question I could not answer for you

You said "we just missed a pmt". I do not think one was missed, and I did not
want to raise an invoice on a guess.

Her 3 September invoice ($525, sent 28 Aug) covers the cycle **27 Jul – 27 Aug**.
An invoice dated 30 August would cover **23 Jul – 23 Aug** — the same month.
Billing both charges her twice for one month of training. Her August payment of
$700 was made on the 3rd and is marked paid.

So on the evidence the 30th is the same payment on a different day, not an extra
one. If you know otherwise — she owes for a period I cannot see — say so and I
will raise it.

Her anchor is moved to the 30th either way, so from now on she is picked up on
the 30th.

---

## 1. 1,128 rows of AI-guessed nutrition, growing ~19 a day  (#19)

Across 18 clients. Every day this stays open adds about 19 more. Three separate
questions, and they can be answered separately:

- **The rows that exist.** Leave them, flag them on screen as estimates, or
  recompute the ones that now have a catalogue match?
- **What happens next time** a photo shows a food we cannot look up: log nothing
  and ask, or log it with no macros rather than guessed ones?
- **`estimated: true`** was adopted on the meal-edit path on 28 Aug — an estimate
  that says it is one. Confirm that is the pattern everywhere and I will close
  the rest of this.

This is the one I would answer first.

---

## 2. Does joining a challenge mean anything?  (#43, membership half)

I fixed the scoring tonight — the board and the app now agree on what "finished"
means. The other half is a product decision.

`challenge_leaderboard` ranks **every ranked client in the room**, joined or not.
`challenge_participants` is written by Join/Leave and read only to set a cosmetic
`has_joined` flag. So three people currently rank on a challenge they never
joined, and the Join button implies something it does not do.

Either the roster should inner-join `challenge_participants` (joining gates the
board), or the button should stop pretending (the challenge is gym-wide and Join
just sets a badge). Both are one change; I do not know which you meant.

---

## 3. Steph has two macro-target rows on the same day  (N2)

2026-06-02, 1600 kcal and 1370 kcal, written by the same import in the same
millisecond — so ordering by `created_at` cannot separate them either. "Current
macros" for that date is whatever Postgres hands back first.

Both are historical; her live target is unaffected. I did **not** guess which to
delete. It is now surfaced by a new integrity check
(`duplicate_macro_targets_same_day`). Tell me which row is real and I will drop
the other and add the unique index that stops it recurring.

---

## 4. Christine's paid $640 from 22 July

You said delete all. I kept the one **paid** row — it is the record that money
changed hands, and the surviving half of the July double-charge you flagged
(the duplicate 29 July row had already been removed by another session).
Deleting it erases the only evidence of a refund question that was never
settled. Backed up in `bak_payment_reminders_christine_20260831`. Say the word.

---

## 5. Sharon Rambo's next invoice comes to $0

Four cancellations in a row, 18–29 Aug, against a 4-session half-cycle. It
blocks rather than sends now, and says "talk to them instead". You can override
it if you want the $0 on record. Flagging it because it is a conversation, not a
billing bug.

---

## 6. The four with no programming  (#56, #61)

Alan Meier, Ian Christman, Justin Ray, Oliver Gergelj — no programming, and all
four are also active trainer accounts. Testers, or real clients waiting? #61
(five new trainers with an empty Client View and no way to fill it) depends
entirely on the answer.

---

## 7. Smaller, still yours

- **#38 — what a streak counts.** Home says 10, the card beneath says 4,
  Progress says none. Four implementations. Pick the definition and I will make
  it one.
- **#62 — the approval queue.** `weekly_focus_drafts` has 0 rows; the sweep
  publishes AI copy straight to clients, against your own approval-before-live
  rule. Restore the queue, or accept auto-publish?
- **#58 — 70 scheduled workouts** point at an assignment from a different
  programme; separately 576 have no assignment at all. Repair the 70 (with a
  `bak_` first)? And do you want me to look at the 576?
- **#68 — deleting a weigh-in.** Only the client can, and only their last five.
  Should the trainer app be able to delete any of them?
- **#52 / #55 — micronutrient backfill.** 0 of 8,789 verified `usda` rows carry
  a panel (one bad import; `usda_generic` is fine). Two importers have been
  frozen since 16 Aug still claiming "running". Backfill, or park it?
- **#63 — Barbell Bench Press** has a third-party tutorial that got in outside
  the review queue. Watch it: keep or clear.
- **#64 — Madeleine's real date of birth**, and whether to send the drafted
  message asking for it.
- **#66 — `MacrosProgressChart`** is built, correct, and mounted nowhere, while
  Nutrition tells clients to open Progress to see it. Home, Progress, or both?
- **#70 — two cron jobs are permanent no-ops.** Delete or repair.
