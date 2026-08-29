# Test record — overnight run, 28–29 Aug 2026

Every claim in the review list is backed by an entry here. The rule this repo
now runs on: **assert on an answer, never on the presence of code**, and prove a
new check goes **red first** against the broken version.

---

## ⚠️ READ THIS BEFORE TRUSTING A TEST SUMMARY

**`npm run test:unit | tail -N` DOES NOT SHOW THE RUN TOTAL.** It shows the last
sub-suite's own summary. I read `41 passed, 0 failed` from it three times and
put that number in three commit messages. The real total at that moment was
**2,509 passed and 1 FAILED** — and the failure was mine.

Use this instead:

```
npm run test:unit 2>&1 | grep -E "^# (pass|fail|skipped)"
```

The failure: `everyDateIsACentralDate.test.ts` — *"100 hand-rolled copies of
centralToday(), ceiling is 99. Import centralToday() from @/lib/central-time
instead of copying the idiom again."* I had inlined
`new Date().toLocaleDateString('en-CA', {timeZone:'America/Chicago'})` in the
assessment form and become the hundredth. Fixed by importing the helper. The
suite was right and my reading of it was wrong.

**Current state: 2,510 passed, 0 failed, 5 skipped.**

---

## 1. Cancel destroys the sets of a finished workout — #1

Ran against the live database on a scratch row, cleaned up afterwards.

| Step | Result | Meaning |
|---|---|---|
| Build a COMPLETED workout with 3 sets | log created, 3 sets | the shape that was being destroyed |
| **NEW** code: `delete … where id=X and completed=false` | **matched 0 rows** | discardSession refuses and returns |
| sets on disk after | **3** | the training data survived |
| workout row after | **1**, still complete | nothing touched |
| **OLD** code: `delete from set_logs where workout_log_id=X` | **destroyed 3 of 3** | ⬅ the bug, reproduced |
| workout row after the old code | **1**, still complete | why adherence looked fine while data was gone |
| **NEW** code on an UNFINISHED session | **matched 1 row** | discard still works |
| its 4 sets after the cascade | **0** | `ON DELETE CASCADE` does the work |
| orphaned `set_logs` anywhere in the table | **0** | no debris |
| scratch rows left behind | **0** | cleaned up |

⚠️ **A measurement trap worth recording.** My first cleanup query reported "4
sets still there" and "2 scratch rows left". Both were wrong: CTEs in one
statement read the same snapshot and do not see each other's writes. Re-queried
separately, the real answers were 0 and 0. I nearly filed "the cascade is
broken" as a finding.

**Regression check added** (`live_audit.sql` #12), scoped to sessions created
after the fix so it starts green. **Red-first proof:** same expression with the
bound moved back to 1 Aug returns `FAIL, 9 sessions`.

---

## 2. Feedback readable and deletable by every trainer — #3

Impersonated tester **Justin Ray's real JWT** inside a rolled-back transaction —
the same method that originally proved the hole.

| | before | after |
|---|---|---|
| owner-filed rows the tester can SEE | 66 | **0** |
| owner-filed rows the tester can DELETE | 66 | **0** |
| rows the OWNER can still see | 106 | **106** |

That last row matters: a lockdown that locks Dustin out is a different bug, not
a fix. **Red-first proof** for the new check: the identical expression run
against `exercise_notes`, which still has its `FOR ALL` policies, returns FAIL.

---

## 3. The open redirect — #2

Route deleted. Verified first that **nothing in `src/` calls it**, and that every
legitimate client-mode toggle sets the cookie from the page itself
(`document.cookie` in `TrainerLayoutWrapper`) — which is exactly why the
`httpOnly` cookie the route planted could not be cleared by the in-app toggle.

**Still to verify after deploy:** request the URL against production and expect
404. Not yet done — Vercel had not redeployed at the time of writing.

---

## 4. The truncation family — #28–#34

| Read | Rows it needed | What arrived |
|---|---|---|
| Trainer calendar | 4,589 live, **2,063 today-or-future** | 1,000, oldest first, last dated **29 Jul** |
| `days` picker ×2 | 1,167 | 1,000, and *which* 167 vanished changed per load (no `.order()`) |
| Workout Library counts | 3,369 sections + 10,866 prescriptions | ~9% |

**Library counts, measured against the new SQL aggregate** — of **1,112** days
that have exercises, the old read showed **471 as "0 exercises"**, gave a
**wrong non-zero count for 629**, and got **12** right.

⚠️ **The detector cried wolf and that is the more useful finding.** It flagged
`day/[dayId]/page.tsx:29`, whose statement is `.eq("id", dayId).maybeSingle()` —
one row, by primary key. Guards for both already existed and neither ran: the
window was a fixed 700 characters and that statement carries a nine-line
comment; `stripComments()` blanks comments to spaces to preserve line numbers,
so the blanked text still ate the window. **So the family is 6 real sites, not
7.**

**Detector proof, after fixing it:** static audit clean → dropped in a probe
file containing a genuinely unfiltered read of `prescribed_exercises` → **flagged
it, exit 1** → removed the probe → **clean again**. A check that cannot fail is
not a check.

---

## 5. "Add a banana" logs a cup of mashed banana — #47

Ran the **real exported `householdServing()`** against **real catalogue rows**.

| | before | after |
|---|---|---|
| `Bananas, raw` | 1 cup, mashed — 225 g | **1 extra small — 81 g** |
| `Bagel, Thomas` | 1 bagel — 95 g | 1 bagel — 95 g (unchanged) |

⚠️ **My first fix was also wrong, and only real data caught it.** "Any piece
beats a volume" produced `Nuts, almonds → 1 almond = 1 g`. It looked right
because I tested against rows **I had invented**, which contained a "1 medium"
banana and a "1 slice" cheddar — neither exists on the real row. Test data you
write yourself agrees with you.

⚠️ **And my "59,477 rows default to a cup" figure is misleading.** Pulling 120
real cup-carrying rows showed almost all are **branded** rows shaped
`[100 g, 1 oz, "0.25 cup (28 g)"]`, where the cup **is** the manufacturer's
label serving and defaulting to it is correct. The fault is specific to USDA
whole-food rows. The fix is scoped to those.

---

## 6. Madeleine Coker's date of birth — #64

Verified the client CAN already self-serve: RLS policy `client_update_own_clients`
lets a client write their own row, and the in-app prompt validates input (no
future date, no year < 1900). It had simply **never fired for her**, because it
triggered only on a *missing* date and hers was present (2026-08-04).

Widened to treat an impossible date as no date. Bounded the intake form with
`max={centralToday()}` — the trainer-side form that created her record had no
upper bound, which is how the date got in.

---

## Gates, every commit

`npx tsc --noEmit` → 0 errors in `src/` · `npm run test:unit` → **2,510 pass,
0 fail** · `npx next build` → *Compiled successfully* (the `/login` prerender
error about Supabase env vars is expected in the sandbox) · `node
scripts/audit/static-audit.mjs` → clean.
