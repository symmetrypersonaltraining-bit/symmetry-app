// ============================================================================
// The AI answers the period it was asked about, from measured numbers.
//
// Dustin, 22 Aug: "the ai needs to answer the time frame that we ask for
// period." He had asked for a three-week summary of a client who had completed
// 7 of 45 scheduled sessions in thirty days, and been told:
//
//   "Consistency is solid. You've hit 6 days a week like you're supposed to."
//
// Nothing in that was invented. Five things compounded:
//
//   1. the CLIENT PROFILE block said "Trains 6x/week" — the PROGRAMMED target,
//      in the present indicative, indistinguishable from a fact
//   2. the chat context carried a block headed "what they actually did" and no
//      denominator anywhere, and a list of completed sessions can never show a
//      miss — so the worse somebody's attendance, the better the list looks
//   3. no builder had a 21-day window, so a three-week question had nothing to
//      answer with
//   4. memory_fold wrote the resulting claim down as a fact nine seconds later
//   5. and the memory header handed it back as "they told you this themselves"
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CLIENT_TOOLS } from "../../src/lib/ai/clientActions.ts";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("any period can be asked for", () => {
  const tool = CLIENT_TOOLS.find((t) => t.name === "my_training_summary");

  it("the tool exists and takes a date range", () => {
    assert.ok(tool, "there is no way to ask for a period — fixed windows cannot answer 'since I started'");
    const props = (tool!.input_schema as { properties: Record<string, unknown>; required?: string[] });
    assert.ok(props.properties.from, "no `from`");
    assert.ok(props.properties.to, "no `to`");
    assert.deepEqual(props.required, ["from"], "the period is optional, so the model can call it vaguely and get a default it did not ask for");
  });

  it("its description forbids reading consistency off the session list", () => {
    // The whole failure in one sentence: that list contains only what they DID.
    assert.match(
      tool!.description,
      /only what they DID|cannot show what they missed/i,
      "nothing warns the model that the completed-session list makes every client look consistent",
    );
  });

  it("it is named as the ONLY way to answer a period", () => {
    assert.match(tool!.description, /ONLY WAY TO ANSWER A QUESTION ABOUT A TIME PERIOD/i);
  });
});

describe("the numbers it returns are the ones that expose a gap", () => {
  const impl = strip(read("src/lib/ai/clientActions.ts"));
  const block = impl.slice(impl.indexOf('name === "my_training_summary"'), impl.indexOf('name === "my_schedule"'));

  it("reports missed sessions, not only completed ones", () => {
    for (const field of ["missed", "attendance_pct", "missed_sessions", "longest_gap_days", "days_since_last_completed"]) {
      assert.ok(block.includes(field + ":"), `the summary does not report ${field} — the shape of the original bug is that only successes were visible`);
    }
  });

  it("only counts a session as missed once its date has passed", () => {
    // Otherwise every client looks worse the further ahead their coach
    // programmes, which would be a new lie in the opposite direction.
    assert.match(block, /scheduled_date <= today/, "future sessions are being counted as misses");
    assert.match(block, /attendance_pct counts only sessions whose date has passed/, "nothing tells the model what the percentage is over");
  });

  it("refuses a backwards range instead of returning nonsense", () => {
    assert.match(block, /from > to/, "an inverted range is not caught");
  });
});

describe("the plan is never stated as attendance", () => {
  const ctx = strip(read("src/lib/ai/coach-context.ts"));

  it("the profile line says the frequency is a plan", () => {
    assert.ok(
      !/`Trains \$\{freq\}x\/week`/.test(ctx),
      'the profile is back to "Trains 6x/week" — present tense, indicative, and indistinguishable from attendance',
    );
    assert.match(ctx, /this is the PLAN, not what they have actually done/,
      "the programmed frequency is no longer labelled as a plan");
  });

  it("it says so out loud when the two frequency columns disagree", () => {
    // days_per_week and training_frequency disagree on real rows — 6 and 3 for
    // the client this was found on. Silently preferring one is how a plan
    // number becomes a fact nobody questions.
    assert.match(ctx, /the two disagree/, "a disagreement between the frequency columns is hidden again");
  });
});

describe("the chat context carries a denominator", () => {
  const ac = strip(read("src/lib/ai/assistantContext.ts"));

  it("attendance is computed against SCHEDULED sessions", () => {
    assert.match(ac, /async function adherenceLine/, "the chat coach has no attendance figure again");
    assert.match(ac, /scheduled_workouts/, "attendance is not being measured against what was scheduled");
    assert.match(ac, /completed vs SCHEDULED/, "the line does not say what the denominator is");
  });

  it("the denominator is stated BEFORE the list of wins", () => {
    const adhAt = ac.indexOf("if (adherence) lines.push(adherence)");
    const histAt = ac.indexOf("if (history) lines.push(history)");
    assert.ok(adhAt > -1 && histAt > -1);
    assert.ok(adhAt < histAt, "the attendance line reads as a footnote to a list of successes rather than the frame for it");
  });

  it("a future session is not a miss here either", () => {
    assert.match(ac, /r\.scheduled_date <= today/, "sessions that have not happened yet are counted against the client");
  });
});

describe("a wrong answer cannot become a permanent one", () => {
  const mem = strip(read("src/lib/ai/clientMemory.ts"));

  it("the fold is told the COACH lines are its own output", () => {
    // This is the loop that made it stick: the assistant's claim was folded in
    // as something said in the conversation, then read back as fact.
    assert.match(mem, /COACH LINES ARE YOUR OWN PREVIOUS OUTPUT/i,
      "the fold still cannot tell its own past output from testimony");
    assert.match(mem, /does NOT become true by being remembered/i);
  });

  it("consistency judgements are banned from memory outright", () => {
    assert.match(
      mem,
      /ANY judgement about attendance, consistency, adherence, streaks/i,
      "memory can record how consistent somebody is again — and it is computed live, so it will be wrong",
    );
  });

  it("the header no longer claims the client said it", () => {
    assert.ok(
      !/they told you this themselves/.test(mem),
      "folded prose is being presented as the client's own first-hand testimony again",
    );
    assert.match(mem, /recollection, not measurement/i, "nothing marks memory as outranked by live data");
  });
});

describe("the coach is told to use the tool for a period", () => {
  const route = strip(read("src/app/api/nutrition-ai/act/route.ts"));

  it("period questions are routed to the tool by name", () => {
    assert.match(route, /my_training_summary/, "the prompt never mentions the tool, so it will answer from context instead");
    assert.match(route, /ANY QUESTION ABOUT A PERIOD OF TIME/i);
  });

  it("and told to report the period asked for", () => {
    assert.match(route, /Report the period you were asked for, not a different one/i,
      "nothing stops it answering 30 days when three weeks were asked for");
  });

  it("and told to say so when attendance is poor", () => {
    assert.match(route, /say so plainly and kindly/i, "the model may still describe only the sessions they made");
  });
});
