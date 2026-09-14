# NOTES FOR THE AI WALK — things ruled on before we got there

Decisions Dustin has made that the AI/Messages walk has to build on rather than
re-open. Nothing here is a proposal; each one is his, in his words, with what
has already shipped against it.

---

## THE GROUP CHAT BECOMES A COMMUNITY  ·  14 Sep 2026

> *"Put in notes for the ai walk, we are going to make the group chat function
> like Facebook essentially. We will rename it as well maybe community?"*

The direction: the group chat stops being a **message thread** and becomes a
**feed** — posts, reactions, comments — the way Facebook works, under a name
that says so. **"Community"** is his working title, not settled.

### Why it came up, and what is already done about it

He raised it first on 11 Sep, about the noise:

> *"On messages, currently, we have PRs, finished workouts. Things like that
> are all shared as messages in the group chat. I don't want any of that posted
> in that group chat anymore… I want to create a notifications either bar or a
> bell or something within messages that does not pop up anywhere else…
> messages from me or messages from other clients still go through the original
> notification protocol."*

and then acted on the first half on 14 Sep:

> *"Go ahead n get rid of sharing the prs n completed workout options for group
> chat. This will need to be adjusted in celebration screen at end of workouts
> to remove that option as well."*

**Shipped 14 Sep — every automatic or app-prompted post of a PR or a finished
workout is gone:**

| where | what went |
|---|---|
| `CelebrationScreen` | the **automatic** PR post — a PR posted itself into the thread the moment the screen rendered, silently, with no way to decline and a sessionStorage key so closing the screen could not undo it |
| `CelebrationScreen` | the manual **"Share to group"** button, and the "👊 Posted to the group" line that reported the auto-post |
| `AchievementCard` | **"Post it in the group"** — the week card's text version. The image itself is untouched: Share and Save image both stay |

**Still posting to the group, deliberately left alone** — none of these is a PR
or a finished workout, and all four are a person choosing to post rather than
the app deciding for them. They are the walk's to rule on, in the new shape:

- `Leaderboard` — "Post my streak" (consistency standings)
- `GroupChallenge` — "📣 Post the standings"
- `FunMoments` — "Tell the group" (a rest day)
- `ProgressPhotos` — a photo, and a before/after pair

### What the walk still has to decide

1. **The name.** "Community" is his suggestion and he flagged it as a maybe.
   It appears in the bottom nav, the page title, notification copy and push
   text — one decision, several places.
2. **Feed or thread.** Posts with reactions and comments is a different data
   shape from `messages`. Whether it is a new table or a view over the existing
   one is the first real design call.
3. **The notification split — HIS 11 SEP RULING, NOT YET BUILT.** A bell or bar
   inside Messages for app events, which **does not push anywhere else**;
   messages from him or from other clients keep the existing push. **Mock-up
   only** was the instruction, and even that is not started.
4. **What earns a post now.** With the automatic ones gone, the feed is empty
   unless somebody posts. Whether wins come back as an *offer* (post this?)
   rather than an *action* is open — and is the distinction that made the old
   behaviour wrong.
5. **The four survivors above** — keep, convert to feed posts, or drop.

---

## THE CELEBRATION SCREENS: AN AVATAR ON EVERY CARD  ·  14 Sep 2026

> *"Also on celebration screens, get rid of the one w my actual face/head only
> its too goofy."* … *"Swap it w another avatar. I want all those celebrations
> to have an avatar. Those screens need to look polished n professional, fun,
> encouraging."*

**The halo card stays; the head went.** `/coach-head.webp` — a cutout of his
head, nothing else, bobbing in a golden halo on any big PR, captioned *"Coach
Dustin has materialised"* — is replaced by the **`pr` avatar** at the same size
in the same halo. The card was never the problem. The copy moved with the
image: a sticker cannot "materialise" and "will not be answering questions",
which was written for a photograph of a real person.

One thing got better as a side effect: the card was gated on `hasCoachFace`,
because without a photo there was nothing to put in the halo that was not a
stranger's face. The avatar is always there, so **a client of any trainer can
now get the best card in the set** — they never could before.

**`/coach-flex.webp` on variant 26 stays.** He asked about the head one only.

**Every variant now carries an avatar — 37 of 37, up from 10.** The rotation
used to swing between a card with a character on it and a bare slab of copy,
which reads as two different apps rather than one with a sense of humour.

The mood is resolved **once for the whole screen** from what actually happened
in the session — a PR, a long streak, a goal hit — not per card. A card picking
its own would have the avatar celebrating a PR on a day there was not one.

Still open for the walk, since "polished and professional" is a bar and not a
change: the cards vary a lot in density and tone (EMERGENCY ALERT, BREAKING
NEWS, The Quiet One), and nobody has walked the rotation card by card with him
to say which earn their place.

### The rule underneath the coach photos

From when another trainer's client hit a PR and got a full-screen photo of a
man they had never met: the two `/coach-*.webp` files are cutouts of the OWNER,
so they are used only for the owner. Another coach gets their own round avatar
in the same slot, and a coach with no avatar gets neither — the card is skipped
and a different one shows.
