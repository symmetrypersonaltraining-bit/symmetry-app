// ============================================================================
// A CARD THAT COMPLAINS GIVES YOU THE BUTTON.
//
// Dustin, 13 Sep, 8:37am, on the trainer home:
//   *"I hit sync n it showed green check but still says this. Also it tells me
//    clients need focus and shows me drafts when I click but doesn't give me
//    any options to regenerate or activate the drafts."*
//
// TWO CARDS, THE SAME FAULT: each reports a problem and then has nothing behind
// it.
//
//   THE SYNC CARD reads `gcal_sync_runs`, and **only the scheduler ever writes
//   that table** — grepping src/ for it returned the card and the generated
//   types, nothing else. So `/api/gcal-sync`, which is what the button calls,
//   left no trace at all. The green tick is the button's own local state. The
//   card could not have changed, then or after a reload, however well the sync
//   worked. (It worked: 687 sessions, 00:25 Central. The card was reporting the
//   last SCHEDULED run, 8 hours earlier, and was right to.)
//
//   THE FOCUS CARD lists who has no line and lets him read the ones that exist,
//   and stops. `/api/cron/weekly-ai` has accepted a signed-in trainer POST for
//   weeks — the owner may sweep the whole roster — so the capability was there
//   and simply had no control wired to it. His only remedies were to wait for
//   Saturday or to go and poke a cron log, which the card literally tells him
//   to do.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SYNC_ROUTE = SRC("src/app/api/gcal-sync/route.ts");
const SYNC_CARD = SRC("src/components/SyncHealth.tsx");
const SYNC_BUTTON = SRC("src/components/GcalSyncButton.tsx");
const FOCUS_CARD = SRC("src/components/WeeklyFocusHealth.tsx");

describe("a card that complains gives you the button", () => {
  it("a manual sync writes a run, or the card can never see it", () => {
    assert.match(SYNC_ROUTE, /gcal_sync_runs/,
      "the route the button calls must record the run it just did");
    assert.match(SYNC_ROUTE, /source: ["']manual["']/,
      "…marked manual, so a hand sync is tellable from the scheduler's");
  });

  it("the sync card reloads when the button finishes", () => {
    assert.match(SYNC_BUTTON, /onDone/, "the button must be able to say it is done");
    assert.match(SYNC_CARD, /onDone=/, "…and the card must listen");
    assert.match(SYNC_CARD, /const load = /,
      "the fetch has to be callable again, not trapped in a one-shot effect");
  });

  it("the focus card can write the missing lines", () => {
    assert.match(FOCUS_CARD, /cron\/weekly-ai/, "the sweep it needs already accepts a trainer POST");
    assert.match(FOCUS_CARD, /Write the missing/i, "…and there has to be something to press");
  });

  it("it says what it is doing and does not let you double-fire it", () => {
    assert.match(FOCUS_CARD, /busy|running/i, "a sweep is one model call per client — say it is running");
    assert.match(FOCUS_CARD, /disabled=/, "and refuse a second tap while it runs");
  });
});
