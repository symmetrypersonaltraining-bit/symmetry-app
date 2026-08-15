# Two client messages — DRAFTS. Nothing has been sent.

Both were drafted in the previous session and never confirmed sent; the sandbox
holding them is gone, so they are re-written here. **Nothing goes to a client
without Dustin's explicit go-ahead** — these are for him to approve, edit, or
bin.

Both are individual messages to one person, so they go in that person's thread,
**not** the group chat. (The group-chat rule is for *updates to everybody*.)

---

## 1 · Robby Burns — the save he couldn't find

**Why now:** he typed a meal, logged it, and went looking for a way to keep it
for next time. There wasn't one on that screen. As of last night there is —
a "Keep this in My Meals" tick sits right above the log button. His complaint is
fixed, and telling him so closes the loop rather than leaving him thinking he
missed something obvious.

> Hey Robby — you were right, and it wasn't you missing it.
>
> When you typed out a meal and logged it, there was genuinely no way to save it
> from that screen. The save existed, but it was buried in a menu and only
> showed up *after* the meal was already on your plan, which isn't where you
> were looking.
>
> That's fixed. Next time you type a meal, there's a "Keep this in My Meals" tick
> right above the log button — tap it and the meal is saved, so you can log the
> same thing again in one tap instead of typing it out.
>
> Thanks for saying something. That one was worth fixing.

**Shorter, if you'd rather:**

> Hey Robby — you weren't missing it, it genuinely wasn't there. There's now a
> "Keep this in My Meals" tick right above the log button when you type a meal.
> Tap it and you can re-log the same thing in one tap next time. Thanks for
> flagging it.

---

## 2 · Megan — the recipe builder

**⚠️ I could not find a Megan in your client list.** Searched `clients` for
"megan" and "meagan" and got nothing; the only Burns is Robby. So either she is
a prospect, she is under a different name in the system, or she is someone you
know outside the app. **Tell me who she is and where this should go** — I have
not guessed.

**Why now:** she asked for a recipe builder that hits her macros. It shipped
(`42c67c8`) and is live under "BUILD ME ONE THAT HITS MY MACROS" on the recipes
screen.

> Hey Megan — the thing you asked for is in the app now.
>
> On the recipes screen there's a "Build me one that hits my macros" panel. Tell
> it what you've got in the kitchen and what you're aiming for, and it builds a
> recipe around those numbers rather than handing you something and hoping.
>
> It tells you honestly whether it landed: green if it hit your target, amber if
> it got close but not quite. It's right about two times in three, and when it
> misses it's usually a bit short on protein — it'll say so rather than pretend.
>
> Have a go and tell me what you think. If it's consistently missing in the same
> direction for you, that's fixable.

**On the honesty in that second-to-last paragraph:** I'd keep it. The builder
computes the real totals from the ingredients and ignores what the model claims
— the first live call asked for 45P/55C/18F, produced 49/71/23, and wrote
"lands almost exactly on target" underneath. Telling her the hit rate up front
means the first miss reads as expected rather than broken.

---

## Also outstanding, and not drafted

The **group message** about last night's work. I have not written one, on
purpose. Most of what shipped is invisible to clients — an outage they slept
through, an auth change, writes that had never worked. The two things they would
notice are Robby's save and Megan's recipe builder, and both are better as
individual messages to the people who asked.

If you want something in the group chat, say so and I will draft it. It would be
one row, `is_group = true`, `is_broadcast = false` — the group chat, never the
per-client takeover.
