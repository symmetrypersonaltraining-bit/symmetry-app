# Client update — group message draft

> # ✅ SENT — 14 Aug 2026, 4:24pm
>
> Posted to the GROUP CHAT as ONE message (`messages.is_group = true`,
> id `a4900327-b2ea-437c-a3a8-cff40bff2a16`, 11,176 chars).
>
> **NOT as a per-client broadcast.** I had 29 individual `is_broadcast` rows
> queued and Dustin stopped it: *"Updates go in the group message that goes to
> everybody. All updates always go to the group chat."* The takeover channel
> exists and works; it is not for updates. Remember this next time.
>
> ## (original clearance note)
>
> The block on this message was that item 1 advertised a coach that could act,
> and the five client action tools were unreachable by anyone. That is fixed and
> PROVEN, not assumed: all four write tools were exercised against the real
> tables (move, swap, add, log weight), a real client's writes were verified
> under real RLS, and `add_my_workout` turned out to be writing a `source` value
> the database rejects — every call had failed since it shipped. Fixed in
> `07268f5` / `0b213ed`.
>
> Dustin gave the go-ahead at 4pm on 14 Aug. **Every numbered claim below has
> been checked against live data today.** Two were edited because they had
> become false since drafting — see the video section.

**Status:** DRAFT, not sent. Copy the block below the line into the group chat.
Add to it as tonight's items land; the "Still coming" section is the parking
spot for anything not shipped yet.

**Last updated:** 14 Aug 2026 (overnight) — everything below is live. Every
numbered item in the message is shipped; nothing in it is aspirational.

**Two items added overnight:** the demo videos (which the 13 Aug note below
correctly predicted would earn a line once the queue was worked — it has been)
and the food database. Both are genuinely client-visible, which is the bar for
being in this message at all.

---

Big update — a lot has changed in the app over the last two days, and most of it
needs you to actually poke at it before I know it's right. Everything below is
live right now. Force-close the app and open it again so you get the new version.

**Please break it and tell me.** Screenshot anything that looks wrong, and say
what phone you're on. That's how the last round of these got fixed.

---

**1. There's a coach in the app now, and it's on every screen**

Look bottom-right — the little round picture of me. Tap it anywhere.

It knows *your* stuff: your program, what you've lifted, your macros, your
logging, your weight trend. Not general fitness advice — yours.

It also knows which screen you're on. Open it on your workout and it asks about
today's session. Open it on Nutrition and it's on your meals. Open it on
Progress and it'll tell you what your numbers actually mean.

Ask it anything. "Is this weight right for me?" "Am I losing fat or is that
water?" "What should I focus on this week?" "My shoulder's bugging me." If it's
something that needs a real decision from me, it'll tell you to come ask me
rather than guess — that's on purpose.

**Test it:** open it on three different screens and ask something real. Tell me
if an answer is wrong, vague, or sounds like a robot.

---

**2. It remembers you now**

This is the big one. Anything you tell it, it keeps — permanently.

Tell it once that you travel Tuesdays, that you can't stand cottage cheese, that
overhead pressing bothers your left shoulder, that you only have dumbbells at
home. You never have to say it again. Weeks later it'll still know, and it'll
factor it in without being reminded.

Before this it started from scratch every single time you opened it.

**Test it:** tell it something about yourself today. Come back tomorrow, ask a
related question, and see whether it remembered. Tell me if it forgets.

---

**3. It can actually change things for you — meals AND workouts**

The coach can do the work instead of just talking about it. Say it in plain
English:

Meals: *"Swap M4 for salmon and rice"* · *"I ate a cookie"* · *"Move M2 to after
my workout"* · *"I only ate half of M3"*

Workouts: *"Move Friday's session to Saturday"* · *"Swap tomorrow for something
I can do in a hotel room"* · *"Add a second walk today"* · *"Log my weight at
183"*

It'll show you exactly what it's about to do and wait for you to tap Confirm.
**Nothing changes until you confirm it.**

If you're on a corrective programme, it will only ever offer you sessions I've
cleared for you — that's enforced on my side, not left up to the AI.

**Test it:** log a real off-plan thing by just typing what you ate.

---

**4. You can log a weigh-in again**

This one was properly broken and I'm sorry — there was no way to enter a weight
from anywhere in the app.

Now: **Home → tap your Body Weight card → "Log a weigh-in."** Date, weight, body
fat if you have it. Your recent weigh-ins are right underneath.

iPhone people: the card also wouldn't scroll far enough to reach the button.
Fixed.

**Test it:** log your current weight. If anything about that screen is awkward,
tell me.

---

**5. Swapping a workout no longer forces the AI to build you one**

If you're travelling, the gym's packed, or you just want to do something else,
you now get a choice instead of one option.

**Workout tab → "Create / Replace Workout."** The AI options are still there
(build me a substitute, use what I have, log what I did), and underneath them
there's now **"OR SKIP THE AI"**:

- **Swap for one I pick** — choose a cardio or basic session from the library. Nothing generated, no invented warm-up.
- **I did something else** — just type it. Recorded straight away, I see it.

This was Lauren's catch — she swapped the stair master for a walk and it wanted
to build a whole new session around it.

**Also:** to change *one* movement inside a session without touching the rest,
open the workout and tap the **swap arrows** on the exercise. That's always
worked and it's the right tool for "the leg press is taken."

---

**6. Buttons that did nothing now do something**

There was a bug making floating buttons jump off-screen the instant you pressed
them — so the press never registered. It hit sixteen buttons, including **"Start
session and log"** and every X to close a chart or video.

If something's been ignoring your taps for a while, that was probably it. Try it
again and tell me if anything still doesn't respond.

---

**7. You should stop getting logged out**

The app was quietly signing you out about once an hour. That's fixed — you
should stay signed in now. Tell me if you get kicked to the login screen again.

---

**8. The end-of-workout screen is personal now, and there's a lot more of it**

When you finish a session, the line you get is written from that day's actual
numbers — your sets, your volume, your streak, your PR — not a stock phrase. The
face changes to match: hit a PR and you get the one flexing.

There are now **38 different finish screens** and you'll get a different one
most sessions. Some are jokes. A couple deliberately aren't — you'll know the
ones when they land.

**Test it:** finish a few sessions and tell me if any of them read wrong for the
day you'd just had. That's the one I most want to hear about.

---

**9. If you go quiet, you'll hear from me — and you can tell it to stop**

If it's been a while since anything came through, you'll get a one-screen
check-in when you open the app. It's measured against *your* normal, not a fixed
number of days — if you've never been a daily logger, you won't get told off for
not being one.

**It has an off switch, and I mean it.** Three options on that screen:

- **Not for a month** — snoozes it for 30 days.
- **Don't show again** — turns it off permanently.
- **Tell Dustin why** — opens Messages, and honestly this is the most useful one.

It can only appear twice per quiet spell, then it stops on its own until you're
back and later drop off again. If it ever shows up at a moment that feels wrong,
tap "Don't show again" and then tell me — that's a bug on my end, not on yours.

---

**10. You can hand any answer straight to me**

Under everything the coach says there's a small **"Send this to Dustin."** Tap
it and I get your question *and* the answer it gave you, in Messages, and I'll
come back to you there.

Use it whenever the answer doesn't fit your situation, or you just want it from
me. That's what it's for — you're not going over anyone's head.

**The AI never does this on its own.** Nothing from your chat reaches me unless
you tap that. If you want me to see something, tap it; if you don't, I never
know it was asked.

---

**11. Birthdays**

If it's your birthday you'll get the screen when you open the app, and you'll get
a shout in the group chat. If I don't have your date yet the app will ask you
once, and "not now" costs you nothing — it'll ask again in a month.

---

**12. Smaller things from the last couple of days**

- **Per-set rest timer** in the logger — it now follows the set it's timing.
- **Distance** is a real field, so walks, runs and rows record properly.
- Your **calendar and program** look six months ahead instead of three.
- **Notes** in the logger — you can see what you're typing again.
- **Assisted machines** (assisted pull-ups, assisted dips) now count a PR the
  right way round: less help is progress, not less weight.
- Your **meal plan** shows eight weeks ahead instead of flipping over each morning.
- **Help & Tutorials** in Settings if you're stuck on anything.
- Logging a workout for **yesterday** now records it on yesterday, not on the
  clock time you typed it.
- **iPhone pop-up cards** — several would run off the bottom of the screen so you
  couldn't reach the buttons. Nine of them fixed. If you find another, tell me.

---

**Demo videos on a lot more exercises**

If you've ever tapped an exercise name expecting to see how it's done and got
nothing, that's mostly fixed. **788 of 839 exercises now have a demo**, up from
595 two days ago. They're short on purpose — most are under half a minute, and
none run past a minute. You want to see the movement mid-set, not watch someone
talk.

There are still some without one. If you hit an exercise where the video is
missing — or, worse, where it's the *wrong* movement — tell me which one. A
wrong demo is worse than none and I'd rather pull it than leave it up.

---

**The food database is now enormous, and getting bigger every minute**

Searching for food should stop coming up empty. It's gone from about 180,000
foods to **over 1.35 million**, nearly all with barcodes, and it's still
importing every minute.

That means: scan a barcode, get the actual product. Search a brand name, find
it. Full nutrition on each one, and you can set your own serving size instead of
being stuck with whatever it assumes.

**Test it:** search for the most obscure thing in your cupboard. If it's not in
there, screenshot it and send it to me — that's exactly the gap I want to know
about.

---

**Talk to it instead of typing — every AI box has a microphone now**

Anywhere you can type to the coach, there's a mic button next to it. Tap it,
say it, tap it again. It adds to whatever you'd already typed rather than wiping
it, and while it's listening the button goes red and moves so you can tell from
arm's length that it's actually hearing you.

This one was properly broken before today and I didn't know: voice logging your
food worked perfectly on a computer and did nothing at all on a phone. If you
tried it once and gave up, try it again.

**Test it:** log a meal by talking. Tell me if it mishears you badly or if the
button ever looks stuck.

---

**Typing a workout in now actually puts it on your calendar**

If you did something off-plan and typed it in — a run, a class, a hike — it used
to save somewhere I could see but your schedule couldn't. Your week looked
untouched afterwards and it counted toward nothing.

Now it lands on your calendar as a completed session, the same as anything else,
and it counts. Todd found this one today.

**Anything you typed in before today has been moved over** — you don't need to
re-enter it.

---

**Full nutrition detail, not just the four numbers**

Foods are getting fibre, sugar, sodium, cholesterol, potassium, calcium, iron,
magnesium, the B vitamins, vitamin D — around thirty nutrients where the data
exists. Every whole food in there (chicken, rice, almonds, salmon, the things
your plan is built from) now has the full lab panel behind it.

Packaged and barcoded products are patchier, and that's not something I can fix
by trying harder — a nutrition label legally only has to list about fifteen
things, so for most branded products nobody ever measured the rest. Where I show
you a number, it's a real one.

---

**What I need from you**

Use it normally for a couple of days and tell me:

1. Anything that doesn't respond when you tap it — and what phone you're on.
2. Anything the coach says that's wrong, or that you had to repeat yourself about.
3. Anything you went looking for and couldn't find.

Reply here or message me directly. — Dustin

---

## STILL COMING (do not send — working list)

**All six are now done.** Kept for the record of what each became.

~~1. Response-time tracking~~ DONE (trainer-side, not in the client message)
~~2. Sheet-height sweep~~ DONE for client screens — folded into item 12. The
   workout logger is still on the old sizing and gets its own commit.
~~3. Ten more end-of-workout celebration screens~~ DONE (`111a9cb`) — folded
   into item 8 above. 38 in the rotation now.
~~4. Coach escalation~~ DONE — client-approved only, per Dustin's call on the
   trigger ("Client taps 'Send this to Dustin'") and the exclusions ("only what
   client apporve to be escalated"). Now item 10 above.
~~5. The coach inside the workout logger itself~~ DONE (`47da1c3`) — already
   covered by item 1's "it's on every screen", so no separate item needed.
~~6. The go-quiet check-in~~ DONE and live — now item 9 above.

~~**Not for the client message:** exercise demo videos, 252 of 847 missing~~
**DONE overnight 14 Aug** — and it earned its own section above, as predicted.

Final state: **703 of 839 exercises have a video**, up from 595. 108 applied
automatically, averaging **18.6 seconds**, none over 30.

**Two things Dustin should do before sending, both quick:**

1. **129 candidates came back over 30 seconds** and were deliberately NOT
   applied. They sit at **Library → Exercise Videos** under "Found, but not
   used". Some will be the only decent demo of that movement — take those. The
   rest can stay unused.
2. **136 exercises still have no video and no candidate left.** Four of those
   are ones I binned on purpose because the search result was the wrong
   movement, and one of those matters clinically: *Lunge to Balance Sagittal
   Plane* had been matched to a **transverse** lunge. Wrong plane. The others
   were Sandbag Step up, Lateral Bound to Toe Touch, and Medicine Ball Slam
   with Squat (a toss, not a slam). They are recoverable from
   `bak_video_candidates_dropped_20260814` if you disagree.

The message above asks clients to report a wrong video. Worth meaning it: the
108 that went in were matched by search on name alone and nobody has watched
them.

## DELIBERATELY EXCLUDED (trainer-only, not client-facing)

AI health page, undo on workout edits, spend cap and per-feature metering, model
routing, the client-memory internals. Move any of these up if you want clients
to know about them.
