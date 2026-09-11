# Symmetry app — standing rules for every session

Read this before touching anything. These are not suggestions; each one exists
because breaking it cost real time or real money.

## 0. READ `docs/SESSION-HANDOFF.md` FIRST, AND UPDATE IT BEFORE YOU FINISH

That file is the living handoff: current state, how shipping works, what just
shipped, what is open, and the gotchas that have already cost time. It is not
dated and it is not archived — there is one of it. The `docs/HANDOFF-*.md` files
with dates in the name are history; do not read them for current state and do
not create another one.

**Every session ends by updating it.** The bar Dustin set: a brand-new session
reading only that file, this one, `docs/BACKLOG.md` and
`docs/audit/AUDIT-RESUME.md` picks up with nothing lost, and without asking him
a single question he has already answered.

Deeper background lives in `docs/audit/`, in `docs/STANDING-RULE-INVARIANTS.md`
(why bugs kept recurring, and the "STOP RE-REPORTING THESE" list) and in
`docs/DB-READ-GUIDE.md` (how this schema actually behaves).

**Switching from a Cowork session to Claude Code? Read
`docs/START-HERE-CLAUDE-CODE.md` once.** It covers what changes, what retires,
and the docs that were moved into this repo because Claude Code cannot read the
Cowork project.

---

## 1. THE TUTORIAL IS THE SPEC. KEEP IT TRUE.

`src/lib/tutorial/script.ts` is the written record of **exactly how this app is
supposed to work, at every level**. It is three things at once:

- what a new user is taught,
- the reference we check behaviour against when something looks wrong,
- and the backup record of intended behaviour if the code and the intent ever
  disagree.

Its own header already says it: *"Every step describes what the app ACTUALLY
does today. A tutorial that promises a button which does not exist is worse than
no tutorial: the trainer stops trusting the whole thing at the first one they
cannot find."*

**So: any change to what a screen does, or to what a control does, updates the
tutorial in the same commit.** Not later, not in a follow-up. A new feature, a
removed button, a renamed card, a changed calculation, a bug fix that changes
observable behaviour — all of it.

This is enforced, not trusted: `.github/workflows/tutorial-current.yml` fails a
push that changes screen code without touching the tutorial or the screen
walkthrough. If a change genuinely does not alter anything a user could observe
— a refactor, a type fix, a performance change — say so in the commit message:

    Tutorial: n/a — <one line saying why nothing observable changed>

That line is deliberately a sentence and not a flag. It forces a decision
instead of silence, and it leaves the reasoning in the history.

Anything designed but not built is `status: "preview"` and says so out loud.
**Nothing marked `live` may be aspirational.**

### Known gap

The tutorial today is **trainer-only** — 59 steps, gated on
`trainer_tutorial_live`, mounted in the trainer sidebar. There is no client
tutorial. Dustin wants one ("usable for new clients"). Until it exists, the
client-facing half of the record lives in
`docs/audit/SCREEN-WALKTHROUGH.md`, which is being built screen by screen and is
written to be turned into client tutorial steps directly.

---

## 2. THE SCREEN WALKTHROUGH IS THE OTHER HALF OF THE RECORD

`docs/audit/SCREEN-WALKTHROUGH.md` records, per screen: what it is for in
Dustin's words, every control on it, what each control should do, what it
actually does, and the decisions settled while walking it.

Keep it current for the same reason and by the same rule. A control that changes
behaviour changes its row.

---

## 3. HARD RULES

- **Both workout loggers are off limits** without per-item permission.
- **Reps come from the programmed target, weights from history.** Never "fix"
  reps to autoload from history.
- **Never delete a programme** without asking.
- **Back up to a `bak_*` table before any destructive database change.**
- **Central time, never UTC.** After 7pm Central the UTC date is already
  tomorrow, and that has broken dated writes before.
- **Capacitor dependencies stay out of `package.json`.**
- **A `package.json` change ships with a synced lockfile** — CI runs `npm ci`.
- **No `any`, no `@ts-ignore`, no `@ts-expect-error`** to silence a type error.
  If the generated types are wrong about the database, relax the one field and
  write down why.
- **A CONFIRMED CHANGE GETS PUSHED, AND MERGED, IN THE SAME BREATH.** Dustin,
  9 Sep 2026: *"i want everything pushed upon confirmation every time not leave
  it for me im using code specifically for that reason if i confirm a fix or
  update you push it period moving forward."*

  A whole day of nutrition work sat on a branch and he opened the app and found
  nothing had changed — *"the visual rebuild of the nutrition page never
  landed"* — because it was pushed but never merged, and Vercel deploys from
  `main`. Pushing to a branch is not shipping.

  So: he confirms it → gates → commit → push → **open the PR and merge it**.
  Do not stop at the branch and do not hand him the merge. The only reason to
  pause is a gate that is red or a conflict that needs his call.

## 4. HOW WORK IS DONE

- **Read before writing.** Inspect the file and its dependencies first. Verify
  column names, constraints and RLS against the live schema — never from memory.
  A grep that returns nothing is not proof; open the file.
- **One logical change per commit.** No refactors riding along with a fix.
- **Prove the fix was needed.** Run the new test against the unfixed code and
  watch it fail. A check that cannot fail is not a check.
- **Never leave main red.**

## 4b. WHICH SURFACE YOU ARE IN DECIDES HOW YOU SHIP

**Claude Code:** you have the repo and credentials — `git push`, and that is
all. Do not build a bundle, do not look for an outbox, do not investigate auth.
For database work you need the Supabase MCP or a service-role key; if you have
neither, say so rather than reasoning about data you cannot read.

**Cowork cloud session:** you cannot push. Commit, bundle incrementally, and
send it through the ship bridge — `docs/SESSION-HANDOFF.md` section 2 has the
sequence and the two traps that waste a round trip.

The old rule that everything must run in the cloud so he can watch from his
phone retired on 8 Sep 2026: he runs Claude Code from the Claude mobile app, so
it is just as visible and it ships without the bridge.

## 5. GATES BEFORE EVERY PUSH

    npx tsc --noEmit      # 0 errors in src/
    npm run test:unit     # 0 failed
    npx next build        # "Compiled successfully"

The `/login` prerender error about Supabase env vars is expected in a sandbox
without them. Ignore it.

## 6. WHEN A CHECK DISAGREES WITH HOW DUSTIN WORKS, THE CHECK CHANGES

Not the client, not the data, and never a request for him to explain again.
Read the "STOP RE-REPORTING THESE" section of
`docs/STANDING-RULE-INVARIANTS.md` before raising any roster or coverage
concern. That list exists because the same non-problems were reported back to
him four and five times.
