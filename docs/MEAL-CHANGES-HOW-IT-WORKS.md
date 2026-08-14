# Changing a meal — how it works from here on out

*Written 14 Aug 2026, after Claudine's report. Shipped in `49f129f`, `e026f87`.*

---

## The two things a person can mean

There have always been two, and the app now keeps them visibly apart on every
screen where a meal can be changed.

### 1. Just today

**What it does:** writes that one day's change onto that day's log. The plan
doesn't move. Tomorrow shows the plan again.

**What it's for:** ate three-quarters of the rice, swapped tonight's dinner for
the chilli you cooked, skipped the granola. Nine times out of ten this is what
somebody means.

**Where it is:**

| Screen | Control |
|---|---|
| Nutrition logger → tap a meal → Adjust / edit | **Save for today — totals update ✓** |
| Recipes → open a recipe | **🍽️ Log this to today** |

Both are the primary button — filled, top of the stack.

### 2. Every day, from now on

**What it does:** changes the menu itself from today forward. Because the plan
you're on is *Dustin's*, it doesn't overwrite it — it takes a copy, marks the
copy **BUILT BY YOU**, applies the change to the copy, and files his original
under **Plan versions**.

**What it's for:** "I'm never eating that, put my thing there instead."

**Where it is:**

| Screen | Control |
|---|---|
| Nutrition logger → Adjust / edit | **📌 Save to my plan — every day** |
| Recipes → open a recipe | **Choose the meal it replaces… → 📌 Replace it in my plan — every day** |

Both are the secondary button — outlined, below the one-day one. The recipe one
now **asks once** before it fires, and the confirm names the meal, names the
recipe, says *from today on — not just today*, and says days already logged stay
as they were.

---

## What was actually broken

Three separate things, and they compounded.

**1. The recipe control didn't say what it did.** It said *"Put it in my plan
as…"* and the button said *"📌 Add"*. Both describe adding a thing to a list.
What it did was replace that meal's entire contents in her plan, from that day
forward, every day, with no confirm. She was trying to eat her recipe that
night.

**2. Past days were being redrawn against today's plan.** When the plan is
copied, the old version gets archived. The screen only ever looked up **live**
plans, so the archived one dropped out and every past day fell through to
today's menu. Last week got redrawn as this week, retroactively.

**3. Her "I didn't eat that" zeros came back.** Those are stored on each day's
log keyed by *item ID*. The copy created brand-new item rows with new IDs, so on
a past day her override keys matched nothing and every item rendered at its full
planned amount — putting calories back into days that were already finished.

That third one is why the number on her screen changed, not just the words.

---

## What changed

**History resolves against the plan that actually governed it.** A version's
reign is `[its effective_date, the next version's)`. Live vs archived says which
one is *current*, not which one governed last Tuesday. Superseded versions stay
in the candidate set now, so a past day is drawn with the menu and the item IDs
it was logged under. Her zeros match again.

A live plan can never be out-sorted by an archived one, so a plan that was
scheduled and then cancelled stays harmless. And for a past day with genuinely
no plan on file, the answer is *no plan* — not a menu that didn't govern it.

**The permanent option announces itself.** Word is REPLACE, names the meal, says
every day, asks once.

**You can undo it.** The version timeline has said *"restorable anytime"* since
it was built and there was no button behind it. There is now — **↩ Make this my
plan again** on every archived version. It archives whatever it displaces rather
than deleting it, so the restore is itself undoable, and it leaves day-group
siblings alone (restoring a weekday menu won't take a Saturday menu down).

---

## Guard tests

- `planHistoryIsNotRewritten.test.ts` — built from Claudine's real plan IDs and
  dates. Fails if the resolver goes back to live-only, or if the past falls back
  to the current plan again.
- `permanentPlanChangeIsObvious.test.ts` — fails if the recipe control goes back
  to "Add", if the confirm step disappears, if the permanent option ends up above
  the one-day one, or if restore stops being reachable.

---

## Still worth checking

Her **13 Aug** totals (the 3,058 kcal in her screenshot) were computed while
those items were un-removed. Today's row is keyed to the current plan's item IDs
so it should be right now — worth having her reload and confirm the number
before reading anything into it.
