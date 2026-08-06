# Backlog

Things parked deliberately, so they survive the conversation they came up in.

---

## 1. Two finished commits that cannot be deployed (BLOCKED — not a code problem)

**Parked 2026-08-05 at Dustin's request.** Nothing here needs building. Both
commits are written, tested and committed on `main`; they are stuck at the push.

```
74c3ced  See the meal plan days ahead, instead of flipping it live on the morning
ce99a63  Some machines get easier as the number goes up
```

**The blocker.** `git push` is refused by the git proxy:

> access denied by the git proxy: `symmetrypersonaltraining-bit/symmetry-app` is
> not in this session's authorized repository set, so the proxy will not inject
> a credential for it. To fix, add the repository to the session's sources.

Every push earlier the same day succeeded, so the authorization dropped
mid-session. Retried four times; it is not transient and not fixable from inside
the session.

**Two ways to land it:**

1. Add `symmetry-app` back to the Cowork session's sources, then push.
2. Apply the patch that was delivered in chat — `git am symmetry-2-fixes.patch`
   from the repo root — then push.

**Until then, both bugs are still live for clients:**

- Tim Yancey's assisted dips and Machine Assisted Pull Ups still read backwards.
  The card says "hasn't moved in 4 weeks" on a lift where he went 140 → 110 and
  doubled the reps, and his PRs on those movements still cannot fire.
- The meal plan still only shows today, so a plan scheduled for next week stays
  invisible until someone switches it on that morning.

**Half-applied? No.** The `exercises.load_is_assistance` migration is already on
the live database and is inert without the code — the currently-deployed build
simply ignores the column. Nothing is in a broken intermediate state.

---

## 2. Make "trainer" a setting instead of an email address

See `docs/MULTI-TRAINER-BACKLOG.md`. Parked 2026-08-04. Do it before scaling,
not after — it is what stands between Dustin and a second trainer, and it is why
Dylan's instance is a fork rather than a configuration.

---

## 3. Health app sync

Parked by request 2026-08-04. Handoff written and ready:
`docs/HEALTH-SYNC-HANDOFF.md`, plus `docs/GARMIN-APPLICATION-DRAFT.md`.
Blocked on nothing technical — it was deprioritised behind the iPhone build.

---

## 4. Still open, smaller

- **iOS TestFlight**: ~45 minutes of App Store Connect setup only Dustin can do.
  Steps in `docs/IOS-RELEASE-CHECKLIST.md`. Everything on the build side is
  pre-flighted.
- **Rotate the GitHub PAT.** It was pasted into a chat and should be considered
  compromised regardless of anything else here.
- **Dustin's 4 Aug duplicate log.** He logged Arms A twice — once into each of
  two duplicate cards — with different weights (Preacher Curl 20 vs 35, Pushdown
  60 vs 80). Both were left in place rather than guessing which is real. Say
  which and the other gets cleared.
- **~358 hardcoded colours** across ~40 files, outside the theme system.
- **64 pending schedule proposals** awaiting review.
