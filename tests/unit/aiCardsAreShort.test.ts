// ============================================================================
// The nutrition cards are short, and every one of them leads with a number.
//
// Dustin, 21 Aug: "same goes for the nutrition ai card. this needs to be
// accurate to their actual numbers that week. what is good, what needs to be
// done to stay on track to their goals. personal and accurate. thhis one needs
// to be a bit condensed its way too long. keep it short and straight to the
// point on what their stats are looking like compared to logging and where they
// can improove."
//
// There are TWO AI cards on the nutrition screen, not one: the proactive coach
// card (/api/nutrition-ai/coach with no question) and the weekly "YOUR WEEK"
// read (clients.ai_food_focus, written by the sweep). They were allowed ~6 and
// 2-4 sentences, so together they could put ten sentences of prose above the
// food logger.
//
// The length rule lives in the CARD's own prompt, not in COACH_SYSTEM_PROMPT,
// because that prompt is shared with the coach chat — where a two-sentence cap
// would make every answer curt. A future edit that "tidies up" by moving the
// limit into the shared prompt would silently truncate the chat.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

describe("the proactive coach card is two sentences and starts with a number", () => {
  const src = read("src/app/api/nutrition-ai/coach/route.ts");
  const cardPrompt = src.slice(src.indexOf("No question was asked"));
  const body = cardPrompt.slice(0, cardPrompt.indexOf("`;") + 2);

  it("caps the card at two sentences", () => {
    assert.match(body, /TWO sentences/, "the coach card lost its length cap — it sits above the food logger, not in a chat");
  });

  it("requires a real figure in the first sentence", () => {
    assert.match(
      body,
      /must state a real number/,
      "the card no longer has to name a number, which is how it drifts back to generic encouragement",
    );
  });

  it("has a stated behaviour for sparse data", () => {
    // Without this it invents a trend from two logged days.
    assert.match(body, /too little logged data/, "the sparse-data instruction is gone");
  });
});

describe("the shared coach prompt is NOT where the card's limit lives", () => {
  it("the chat is still allowed a full answer", () => {
    const ctx = read("src/lib/ai/coach-context.ts");
    assert.match(
      ctx,
      /"message": up to ~6 sentences/,
      "COACH_SYSTEM_PROMPT was shortened. That prompt is shared with the coach CHAT; the card's limit belongs in the card's own prompt.",
    );
  });
});

describe("the weekly food read is two sentences", () => {
  const src = read("src/app/api/cron/weekly-ai/route.ts");

  it("is capped", () => {
    assert.match(src, /"foodFocus": TWO sentences/, "the weekly food read lost its cap");
  });

  it("must lead with a figure rather than an adjective", () => {
    const rule = src.slice(src.indexOf('"foodFocus": TWO sentences'));
    assert.match(
      rule.slice(0, 400),
      /a real figure, not an adjective/,
      "the weekly food read no longer has to state a number",
    );
  });

  it("still never sets a macro target", () => {
    // Unchanged rule, pinned because shortening a prompt is how it gets lost.
    assert.match(src, /Never set a new macro target/, "the food read is allowed to change targets again");
  });
});
