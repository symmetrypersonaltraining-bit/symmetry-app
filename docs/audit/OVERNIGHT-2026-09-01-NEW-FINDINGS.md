# Found while fixing — 1 Sep 2026

Things nobody had reported, turned up by chasing something else. All verified
against live data or running code, not inferred from a document.

---

## Fixed on the spot

**A `$0` invoice could be approved and emailed.** Zero is a legitimate
arithmetic answer under all three billing rules and never a legitimate thing to
send. The per-session path already carried a warning about a zero cycle and it
stopped nothing — a warning beside a live Approve button is a label, not a
guard. Now blocking, overridable. Found because Sharon Rambo's next half-cycle
computes to exactly $0.

**Deleting an invoice re-opened the invoice generator.** Its only guard is "skip
anyone who already has a pending or sent row", so deleting the row removes the
guard — and its catch-up pass has no date window, it takes the next future
calendar payment of any date. Deleting Robert's invoice would have raised a
fresh $300 reminder the next morning, off his 1 October calendar event, a full
day before his archive date could shut the generator out.

**`generate_due_payment_reminders()` never checked `archived_at`.** A client who
left but still had a recurring payment event in Google Calendar would have been
invoiced daily, forever. Nobody had hit it because nobody had been archived
while their calendar payments were still syncing — three clients were archived
this week.

**Archiving never touched nutrition.** Tina Haley was archived on 13 August and
her meal plan has been `status='live'` ever since, sitting in every live-plan
read. Archiving now retires the plan.

**The AI brief and the week card disagreed about adherence.** Both counted
swapped-out sessions in the denominator. Fixing only the card would have moved
the disagreement rather than removed it, so both changed.

**A test asserted a literal string, and broke on a correct change.**
`workoutsScheduled: sw.length` was asserted verbatim. Its intent — the brief and
the card count the same way — still held, so it now asserts that instead of the
old spelling.

**Comments quoting old code were tripping the rules that banned it.** Three new
source-reading tests had to strip comments first: an explanation of a bug must
not fail the test about the bug.

---

## Noted, not fixed

**The truncation ban has a hole.** `readsCannotTruncate.test.ts` bans a
`.limit(n)` ABOVE the server's 1,000-row cap, because that is the shape that
looks careful and is not. It does not catch a small, deliberate-looking limit on
a list that is then searched in the browser — which is the same bug wearing a
smaller number, and is exactly what #33 was. There is no general way to spot
"fetched, then filtered locally" from the source, so I named the case rather
than pretending to a rule. **Worth a sweep**: any other query whose result is
filtered client-side.

**`plan-build` still asks the model for totals it never reads.** The prompt
requests a `totals` object; `validatePlanDraft` recomputes them in code and
`r.totals` is referenced nowhere. Dead weight that costs output tokens and
invites the model to do arithmetic nobody uses. (The rest of #21 is genuinely
fixed — drift is now labelled on screen in amber.)

**The Accept button is not dimmed on a drifted plan.** `NutritionV3Client.tsx`
line ~3756. The panel says the plan misses the target by +38 g protein and the
button beside it is unchanged, so a plan that has just been declared off-target
can be saved with one tap.

**The drift sentence names only kcal and protein.** `drift.c` and `drift.f` are
computed and never shown.

**`estMacros` still coerces a null macro to 0 at read time.** I fixed the photo
route so the COLUMN records an unknown honestly, but the reader still turns it
into a zero. Half-honest is better than not, and finishing it means making the
day total nullable — a bigger change than tonight warranted.

**326 workout logs are `completed = true` with no `completed_at`.** I changed
the challenge board's predicate rather than backfilling, because backfilling
means inventing a time of day nobody recorded. If you ever want `completed_at`
to be trustworthy, that is a separate decision about what to write into it.

**`billing_credits` and `half_price_sessions` are dead columns.** Both forced to
0 on every write, read by nothing that matters. Harmless, but they invite the
next person to think they mean something.
