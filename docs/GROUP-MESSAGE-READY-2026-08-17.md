# Group message — Version A, fact-checked and ready

**17 Aug 2026. Every claim below was checked against the live app and database,
not against the changelog. Claude does not send this. Dustin sends it.**

---

## THE MESSAGE

> Morning everyone 👋
>
> **Notifications are live, and you control all of them.** Settings →
> Notifications. Turn off any you don't want — I'd much rather you switch off
> the ones that aren't useful than mute the whole app, because muting takes your
> payment reminders with it.
>
> **While you're in there, hit "Turn on notifications."** This is new, and it's
> the reason the group has been quiet: until now the app genuinely could not
> reach most of you. Messages were going out and your phone was never told.
>
> A couple of things worth knowing about how it works:
>
> · **You've always been able to see messages in the app** — the badge on the
>   Messages tab and the bell at the top have been there the whole time, and
>   they'll show you anything you missed whenever you open it.
> · **What's new is your phone telling you without you opening it.** That's what
>   the switch does. Nothing changes about what's in the app; it changes whether
>   you find out at the time.
> · If you only turn one thing on, make it **Messages from Dustin** — that's me,
>   personally, not the AI coach. I don't want you missing something I've sent
>   you directly.
>
> **On iPhone:** the app has to be on your home screen first, or notifications
> can't work at all. Share button → Add to Home Screen. Ten seconds. On Android
> it just works.
>
> **What's new since I last posted:**
>
> · **Micronutrients in the food logger.** Pick a food and tap "Show nutrients"
>   and you get the full panel for the portion you're about to log — not just
>   protein, carbs and fat. If a food doesn't have the data it says so rather
>   than showing you zeros.
> · **Log food the way you actually eat it.** Hard boiled eggs come up as
>   "1 egg", not "100 grams of egg". Type 2 and you get two eggs' worth.
> · **A meal and recipe library.** 50 built meals and 34 recipes with weighed
>   portions and checked macros — drop one straight into your plan instead of
>   building it item by item. My Meals now has two tabs so your own saved meals
>   aren't buried in the shared ones.
> · **Meal plans can be scheduled ahead now.** If I've built you something that
>   starts next Monday, you can look at it today. It'll tell you when it starts.
> · **Move a workout anywhere.** Any session, any day, past or future, logged or
>   not. No more asking me.
> · **Swapping a workout actually swaps it.** Before, the old one stayed on your
>   day next to the new one. And you can search the library now instead of
>   scrolling.
> · **The app is a good deal faster** — I moved it onto a bigger server this
>   afternoon.
>
> Tell me what's working and what isn't. Use the in-app feedback button for bugs
> so they land somewhere I'll actually see them, and use this chat for anything
> else — I'd genuinely like it to be busier in here.

---

## WHAT WAS CHECKED, AND WHAT CHANGED FROM THE 16 AUG DRAFT

### The blocker is gone

`/api/push/subscribe` returns `configured: true` with a real public key.
Version A is safe. Nobody lands on "your coach is still finishing this off".

Push subscriptions are still **0**, which is correct and is the whole point of
sending this: each person has to press the button on their own device, and it is
per device.

### Verified true, unchanged

| Claim | Evidence |
|---|---|
| In-app notifications, badge, bell | present and independent of push |
| "Messages from Dustin" toggle | exists by that exact name, alongside Messages from clients, Announcements, Group chat, Reactions |
| 50 library meals | 50 rows, and the nutrition screen explicitly loads the shared ones for clients |
| Meal plans scheduled ahead | 18 future-dated pending plans; the two triggers that blocked them are gone |
| Move a workout anywhere | no date restriction anywhere in the move code, and it carries the workout log with it |
| Faster | true as of this afternoon — Pro + Small |

### Changed, and why

**"20 cook-from-scratch recipes" → "34 recipes".** The 20 were invisible. They
were stored `private` and the Shared library tab asks for `public`; a trigger
had been silently demoting them on insert because the library builder runs as a
service with nobody signed in. Fixed and published today — the tab now holds
your 20 plus the 14 older ones you asked to keep. **34 is what a client will
actually count.**

**"Pick a food and you'll see the full panel" → "tap Show nutrients".** The
panel is real and it is in both the food search and the composer, but it is
collapsed behind a "Show nutrients (12)" button. One tap, not automatic.

**Two lines added** for things that shipped today and that clients will notice:
logging food by unit, and the swap actually replacing the workout.

**"I cleared out something on the back end that was slowing everything down"
→ "I moved it onto a bigger server this afternoon."** The original wording
described a different change. What actually made it faster today was the Pro +
Small upgrade.

### Left alone

The iPhone "Add to Home Screen" paragraph stays — Dustin confirmed a mix of both
platforms on 17 Aug, and without it notifications cannot work at all on iOS.

---

## BEFORE IT GOES OUT

- [ ] Read it in your own voice and change anything that isn't how you'd say it.
- [ ] **You send it.** Claude does not message clients.
- [ ] Worth expecting: people will turn on notifications over the next few days,
      not all at once. The count starting at 0 and staying low for an hour is
      normal, not a fault.
