# Showing this project to someone outside it

Written **10 Sep 2026, night Central**, for the question: *what are the options
for sharing this whole project with someone so she can see where it is and
judge whether she can help finish it?*

---

## First, the thing to settle before anything is sent

⚠️ **The repo is public and it names real clients.** Not a hypothetical —
counted on 10 Sep:

- **121 tracked files** mention a client by name.
- `docs/MORNING-2026-08-15.md` has a named client's **weight and body fat
  percentage** in a table.
- `docs/audit/FIX-QUEUE.md` has named clients' **monthly fees**.
- Two clients' **personal email addresses** appear in `docs/BACKLOG.md` and
  `docs/RLS-DURING-LOGGING-2026-09-05.md`.

This is already true whether or not anything is shared. It happened because the
docs are written the way the work is discussed, and nobody chose it.

**The fix is one toggle:** GitHub → the repo → Settings → General → Change
visibility → **Private**. Vercel keeps deploying from a private repo with no
change. The only thing that changes is that a Cowork sandbox needs the PAT to
clone, which it already has. It does not scrub git history — but it stops the
exposure immediately, costs nothing, and can be done in thirty seconds.

Do that first. Then choose from the options below.

---

## The options

### 1. A review packet built for her — *recommended*

One page that answers the actual question she has been asked: what exists, what
it does, how much it is really used, what is left, and where help would land.
Aggregate numbers only, no client named anywhere.

**Why this rather than sending the documents.** There are ~90 docs in the repo
and ~156 in the Cowork project. They are a work log, not a status report —
written for whoever picks up the thread tomorrow, not for someone deciding
whether to get involved. Handing them over is handing over a search problem.
Anyone reviewing this needs the shape first and the depth on request.

Cost: none. Shareable by link. Already built — see the bottom of this file.

### 2. Give her the app

She is a client, so she may already have a login. Ten minutes inside the thing
tells a reviewer more than any document: 50 screens, the workout logger, the
food photo capture, the coach chat. If she should see the trainer side too, a
second account can be made a trainer with one SQL statement
(`docs/ADDING-A-TRAINER.md`) — though note there is **no per-trainer data
partition yet**, so a trainer account sees the whole roster. For a review, a
screen-share of the trainer side is the safer version.

Cost: none. Highest signal per minute of anything here.

### 3. The GitHub repo

Everything is already in it and it is already public: 123k lines, 50 pages, 71
API routes, 115 migrations, and the whole doc trail including the investor
research. Send one link and she has all of it.

Right for a **technical** reviewer — someone who would actually be writing code,
or judging whether the codebase is sound. Wrong as a first impression for anyone
else. And **do the visibility toggle above first**, then add her as a
collaborator so she keeps access.

### 4. A Google Drive folder

Already proven — "Symmetry Investor Package" and "Symmetry Engine Archive" both
exist and both share by adding her Google account. Right for the documents that
are genuinely documents: the proposal, the research, the plan. Wrong for code.

Cost: none.

### 5. Share the Cowork project itself

The tidiest-sounding option, and the one that does not work today.
**Project sharing is Team and Enterprise only** — a Pro or Max individual
account cannot share a project with anyone. It would mean moving to a Team plan
and adding her as a member, billed per seat, at which point she sees the project
and all 156 docs directly and can work in it.

That is worth doing **if she joins properly** and is going to be in here every
week. It is a lot of ceremony for a review.

### 6. Not recommended: a document dump

Exporting all 156 project docs and sending them. It is the most literal reading
of "get her all the documents" and the least useful thing that could be done
with an hour. Roughly 60 of them are the `*-PASS*` series a scheduled task wrote
six times a day against a stale brief, and another 30 were archived off in
September as duplicated source. What is left is a chronological work log with no
entry point.

If she asks for depth after the packet, the answer is the repo (option 3), not a
zip.

---

## What this adds up to

Toggle the repo private tonight. Send her **the review packet** and **a login**.
Keep the Drive folder for the investor documents she already has. Offer the repo
when she asks a question the packet cannot answer — and if she is going to be
here every week, that is the point to consider a Team plan.

---

## Where the packet is

Published as a shareable page — https://claude.ai/code/artifact/5bcf729f-7f35-45af-b4f7-129091792e52 (private until shared from its own share menu). The source is
`docs/investor/app-inventory-summary.md` plus the live database counts taken on
11 Sep; rebuild it from those rather than editing numbers by hand. The link
lives in `docs/SESSION-HANDOFF.md` section 5 alongside the investor proposal.
