import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE CLIENT'S AI MUST BE ABLE TO REACH ITS OWN TOOLS.
 *
 * The five client action tools shipped in `0636890` — my_schedule,
 * my_workout_options, move_my_workout, swap_my_workout, log_my_weight — were
 * UNREACHABLE BY ANYONE for a week, and nothing failed. Two gates pointed in
 * opposite directions:
 *
 *   /api/ai-assistant   grants tools when   !isTrainer          (clients only)
 *   HeaderAssist.tsx    renders its button  isTrainer && !clientMode
 *   FloatingDock.tsx    renders its button  isTrainer && !clientMode
 *
 * A client could never open the drawer. A trainer who could was deliberately
 * given no tools. Everything built on top — the contraindication gate, the
 * cleared-pool filter, the write-time pool re-check for Gerard and Sharon —
 * sat behind a door with no handle, and every test passed the whole time,
 * because each half was correct on its own.
 *
 * Dustin found it the way these always get found. He asked the ✦ Coach, from
 * the client app, to adapt his session to a hotel gym — the exact case the
 * conversational layer was built for — and it told him to message his trainer.
 * He is the trainer. His words: "it should react the way we talked about it
 * reacting. That's literally why we designed it."
 *
 * The fix is one AI, per his call on 12 Aug: the ✦ Coach — the one clients
 * actually tap — now runs the tool loop itself. This test pins the property
 * that was missing, not the implementation: THE COACH A CLIENT CAN OPEN HAS
 * THE TOOLS.
 */

const ROOT = process.cwd();

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

const ACT = codeOnly(readFileSync(join(ROOT, "src/app/api/nutrition-ai/act/route.ts"), "utf8"));

test("the coach clients actually open can run the workout tools", () => {
  assert.match(
    ACT,
    /runClientAssistant\(/,
    "the ✦ Coach no longer runs the client tool loop. It is the AI clients can open; " +
      "if it cannot act, the tools are unreachable again and the app goes back to telling " +
      "people to message their trainer about their own workout.",
  );
});

test("the nutrition path is untouched when no tool runs", () => {
  // The whole safety argument for putting tools on a route 35 people use daily
  // to log food is this condition. If the result is ever used unconditionally,
  // a macros question starts being answered by the tool model without the
  // coach's 14-day context, memory or suggestion chips.
  assert.match(
    ACT,
    /if \(run\.toolsUsed > 0 && run\.text\)/,
    "the coach now uses the tool-loop answer without checking that a tool actually ran. " +
      "A nutrition question would bypass assembleCoachContext, client memory and the " +
      "suggestion chips — the existing path must remain the default.",
  );
});

test("a failure in the tool loop cannot cost someone their nutrition answer", () => {
  const idx = ACT.indexOf("runClientAssistant(");
  const around = ACT.slice(Math.max(0, idx - 1200), idx + 1200);
  assert.match(
    around,
    /try\s*\{/,
    "the tool loop is no longer wrapped in try/catch; an error there would 500 a route " +
      "that 35 people use to log food",
  );
});

test("both AI surfaces share ONE tool loop", () => {
  const assistant = codeOnly(readFileSync(join(ROOT, "src/app/api/ai-assistant/route.ts"), "utf8"));
  assert.match(
    assistant,
    /runClientAssistant\(/,
    "/api/ai-assistant has its own copy of the loop again. Two copies drift, and the one " +
      "nobody opens is the one that stops being maintained",
  );
  assert.doesNotMatch(
    assistant,
    /runClientTool\(/,
    "the assistant route calls runClientTool directly again — that is the second copy",
  );
});

test("safety is delegated, never reimplemented", () => {
  const runner = codeOnly(readFileSync(join(ROOT, "src/lib/ai/clientAssistantRun.ts"), "utf8"));

  assert.match(
    runner,
    /runClientTool\(/,
    "the shared runner no longer delegates to runClientTool. Every safety invariant lives " +
      "there: no tool takes a client_id, every write re-checks ownership, and a gated " +
      "client's swap is re-checked against their cleared pool at write time",
  );
  assert.match(
    runner,
    /CLIENT_TOOLS/,
    "the runner no longer uses CLIENT_TOOLS. That list is deliberately separate from the " +
      "trainer agent's twenty, so send_message and set_macro_targets are names this path " +
      "could not utter even if something talked it into trying",
  );
  // The clientId is passed in and handed to the tool, never taken from model input.
  assert.match(
    runner,
    /opts\.clientId,/,
    "the runner no longer passes the session-resolved clientId to runClientTool — if that " +
      "ever comes from the model, a user can talk their way into another client's data",
  );
});

test("the workout path remembers the exchange, same as the nutrition path", () => {
  /**
   * The first cut of the tool branch returned directly and skipped persist(),
   * so every workout conversation was forgotten the moment it ended: ask to
   * move Friday, say "actually make it Saturday", and the coach had no idea
   * what "it" was.
   *
   * Caught by counting rows in ai_chat_turns after four real conversations and
   * finding only two — the nutrition one. Exactly how the ORIGINAL memory bug
   * on this route was found, and it would have failed just as silently, because
   * persist() swallows its errors by design so a lost turn never costs someone
   * their answer.
   */
  const idx = ACT.indexOf("run.toolsUsed > 0");
  assert.ok(idx > -1, "the tool-result branch is gone");
  const branch = ACT.slice(idx, idx + 600);

  assert.match(
    branch,
    /await persist\(/,
    "the workout branch returns without calling persist() — workout conversations are " +
      "forgotten, while nutrition ones are remembered, and nothing anywhere errors",
  );
  // persist must come BEFORE the return, or it never runs.
  assert.ok(
    branch.indexOf("await persist(") < branch.indexOf("return NextResponse.json"),
    "persist() is called after the return, so it never executes",
  );
});

test("the workout tools run BEFORE the nutrition clarifying question", () => {
  /**
   * This ordering IS the feature. With the clarify return first, "Move it ill
   * do it later today" — about a cardio session — was read by the nutrition
   * extractor as a move_meal it could not resolve, so it asked a clarifying
   * question and the workout tools were never reached. Dustin got "is this a
   * nutrition log request, or are you asking me to reschedule your workout
   * plan? I'm the meal & macro tracker here", one turn after the same chat had
   * correctly warned him about double-booking his cardio.
   *
   * The tools worked. They were one branch too far down. Put the clarify back
   * in front and the whole feature returns to being unreachable for exactly the
   * phrasings people actually use.
   */
  const tools = ACT.indexOf("runClientAssistant(");
  const clarify = ACT.indexOf("act.params.clarify && act.reply");
  assert.ok(tools > -1 && clarify > -1, "one of the two branches is gone");
  assert.ok(
    tools < clarify,
    "the nutrition clarifying question runs BEFORE the workout tools again — a training " +
      "request phrased with the word 'move' will be intercepted by a guess about meals",
  );
});

test("the extractor is told training is not its business", () => {
  assert.match(
    ACT,
    /TRAINING IS NOT YOURS/,
    "the intent extractor no longer knows to stay out of training requests, so it will " +
      "keep guessing move_meal on 'move my cardio'",
  );
  assert.match(
    ACT,
    /never a sentence describing yourself as the meal or macro tracker/,
    "the extractor may again introduce itself as the meal tracker. It is ONE coach; a " +
      "client must never be asked to pick which part of it they are talking to",
  );
});
