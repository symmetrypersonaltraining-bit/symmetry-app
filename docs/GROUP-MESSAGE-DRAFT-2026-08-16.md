# Group message — DRAFT, not sent

**Status: Dustin has approved sending. One blocker left, and it is his to clear.**

Dustin, 16 Aug: "show me msg draft then I need you to send it out. also they
will still get in app notifications right? they just dont get push until they
set it up. am I understanding that correctly? if so, make sure clear
instructions on that are in that draft"

## The answer to his question, checked against the code

**Yes on in-app, with one thing that matters, and one correction.**

In-app notifications work now and do not depend on push at all:

- `useNotificationFeed` polls for unread messages every ~15s
- the nav tab badge lights up (`useUnreadCount`)
- the bell lists the message, and taps through to the thread it came from
- `MessageNotifier` slides a red banner in and gives a short buzz when the
  message is from a person rather than an automation

**The thing that matters:** that banner only fires *while the app is open*. So
with no push, the only way anybody finds out is by opening the app. In-app
notifications tell them what they missed; push is what makes them look.

**The correction, and it is the blocker:** it is not "until they set it up." It
is until **Dustin** puts the VAPID keys in Vercel. Verified live —
`/api/push/subscribe` returns `{"configured":false,"publicKey":null}` and there
are 0 rows in `push_subscriptions`. A client who follows the draft's main
instruction today sees this, with no switch to press:

> **Push notifications aren't set up yet**
> Your coach is still finishing this off. The switches below will work once
> it's live.

Sending 29 people to a screen that says their coach has not finished is worse
than sending nothing. **Not sent. Two ways forward, in the summary to Dustin.**

---

## The draft — VERSION A, to send once the VAPID keys are in

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

## The draft — VERSION B, safe to send right now

Identical, minus the notification ask, which cannot be acted on yet. Keeps the
group moving today without sending anybody to a dead screen.

> Morning everyone 👋
>
> A few things have landed in the app since I last posted:
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
> One thing while I've got you: **check the Messages tab and the bell now and
> then.** If there's a badge on either, there's something in there for you. I'm
> in the middle of getting your phone to tell you properly without you having to
> look — I'll post again the moment that's ready, and it'll be worth turning on.
>
> Tell me what's working and what isn't. Use the in-app feedback button for bugs
> so they land somewhere I'll actually see them, and use this chat for anything
> else — I'd genuinely like it to be busier in here.

---

## Before either goes out

- [ ] Dustin picks A or B, and changes whatever doesn't sound like him.
- [ ] **A only:** VAPID keys in Vercel, and `/api/push/subscribe` returning
      `configured:true` — checked, not assumed.
- [ ] Check the iPhone line matches how his clients are actually installed. If
      most are on Android it is noise and should be cut.
- [ ] Claude does not send this. Dustin confirms the final text first.
