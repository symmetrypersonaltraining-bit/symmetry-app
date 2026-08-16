# Group message — DRAFT, not sent

**Status: waiting on Dustin.** Two reasons it has not gone out.

1. **It was 12:50am when he asked.** Buzzing every phone in the middle of the
   night — with a message asking people to turn notifications ON — is the most
   reliable way to get the group muted permanently, which is the opposite of the
   goal.
2. **It would currently reach two people.** Until the VAPID keys are set (see
   below), push cannot deliver to anyone but Dustin and Hassan. Sending
   "set your notifications up" before the feature can reach anybody is asking
   people to act on advice that does not yet work.

**Send it after push is live, in the morning.** Then "turn your notifications
on" is something they can actually do, and the message itself will be the first
thing that proves it works.

---

## The draft

> Morning everyone 👋
>
> **First thing: you control your own notifications.** Settings → Notifications.
> You can turn any of them off, and I'd rather you switch off the ones you don't
> want than mute the whole app — muting takes your payment reminders with it.
>
> **While you're in there, hit "Turn on notifications".** This is new, and it's
> the reason the group has been quiet: until now the app genuinely could not
> reach most of you. Messages were going out and your phone was never told. If
> you only switch one thing on, make it **Messages from Dustin** — that's me,
> personally, not the AI coach. I don't want you missing something I've sent you
> directly.
>
> On iPhone you'll need the app added to your home screen first for
> notifications to work. Share button → Add to Home Screen. Takes ten seconds.
>
> **What's new since I last posted:**
>
> · **Micronutrients everywhere in the food logger.** Pick a food and you'll see
>   the full panel for the portion you're about to log — not just protein, carbs
>   and fat. If a food doesn't have the data it says so rather than showing you
>   zeros.
> · **A meal and recipe library.** 50 built meals and 20 cook-from-scratch
>   recipes with weighed portions and checked macros. Drop one straight into
>   your plan instead of building it item by item.
> · **Meal plans can be scheduled ahead now.** If I've built you something that
>   starts next Monday, you can look at it today. It'll tell you when it starts.
> · **Move a workout anywhere.** Any session, any day, past or future, logged or
>   not. No more asking me.
> · **The app is a good deal faster** — I cleared out something on the back end
>   that was slowing everything down.
>
> Tell me what's working and what isn't. Use the in-app feedback button for bugs
> so they land somewhere I'll actually see them, and use this chat for anything
> else — I'd genuinely like it to be busier in here.

---

## Before it goes out

- [ ] VAPID keys in Vercel (below) — otherwise the notification advice is moot.
- [ ] Dustin reads it and changes whatever does not sound like him.
- [ ] Check the iPhone line is right for however his clients are actually
      installed. If most are on Android this is noise and should be cut.
