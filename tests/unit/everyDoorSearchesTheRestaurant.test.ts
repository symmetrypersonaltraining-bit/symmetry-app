// ============================================================================
// EVERY DOOR SEARCHES THE RESTAURANT.
//
// Dustin, 12 Sep 2026: *"Fix it now and make it work moving forward!"*
//
// The web lookup shipped first on the path that failed twice — the coach chat
// and "describe what you ate", both of which price through priceNamedFoods.
// There are two more doors into the same log, and on 12 Sep both still asked a
// model to recall restaurant macros:
//
//   THE PHOTO. Its prompt already said "base the macros on that chain's
//   OFFICIAL published nutrition" — with no way to read it. That instruction
//   can only be obeyed from memory, which is the thing being designed out.
//
//   THE ADJUST SHEET (/nutrition-ai/meal-edit). It calls resolveFood directly
//   and passed no context at all, so even the 11 Sep restaurant handling never
//   reached it.
//
// One more trap here, and it is the kind that takes a feature down silently:
// the photo route read `message.content[0]` for its JSON. The moment a tool is
// declared, block 0 is a server_tool_use and the reply parses as nothing —
// "Could not read the photo" for every client, every time.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { textFromBlocks } from "@/lib/nutrition/webNutrition";

const SRC = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PHOTO = SRC("src/app/api/analyze-meal-photo/route.ts");
const EDIT = SRC("src/app/api/nutrition-ai/meal-edit/route.ts");

describe("every door searches the restaurant", () => {
  it("the JSON survives a reply that starts with a tool block", () => {
    // Shaped like a real search reply: the model searches, then answers.
    const blocks = [
      { type: "server_tool_use", id: "t1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "t1", content: [] },
      { type: "text", text: '{"calories":' },
      { type: "text", text: "820}" },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const joined = textFromBlocks(blocks as any);
    assert.equal(joined.replace(/\n/g, ""), '{"calories":820}',
      "every text block, in order — not just content[0]");
  });

  it("the photo route can actually read a menu instead of remembering one", () => {
    assert.match(PHOTO, /web_search_20260209/, "the photo path must carry the search tool");
    assert.match(PHOTO, /source_url/, "…and record the page it read");
    assert.doesNotMatch(PHOTO, /message\.content\[0\]\.type === 'text'/,
      "content[0] is a tool block once a tool is declared; the reply would never parse");
    assert.match(PHOTO, /textFromBlocks/, "it must join every text block");
    assert.match(PHOTO, /pause_turn/, "a long search pauses the turn rather than failing");
  });

  it("the Adjust sheet carries the restaurant like every other door", () => {
    assert.match(EDIT, /context\?: string \| null/, "MealEditOp must carry context");
    assert.match(EDIT, /resolveFood\(\{ db: admin, apiKey, clientId \}, op\.name \|\| "", op\.amount, op\.unit, op\.context \?\? null\)/,
      "…and hand it to the resolver, which is what reaches the web lookup");
    assert.match(EDIT, /"context":string\|null/, "the prompt must ask for it");
  });
});
