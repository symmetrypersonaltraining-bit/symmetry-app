// The client tool loop, in one place so both AI surfaces run the SAME code.
//
// Extracted from /api/ai-assistant on 14 Aug 2026 for a reason worth writing
// down, because it was invisible for a week:
//
//   The five client action tools shipped in `0636890` were UNREACHABLE BY
//   ANYONE. /api/ai-assistant grants them only when `!isTrainer`, but both
//   buttons that open it — HeaderAssist.tsx and FloatingDock.tsx — render only
//   when `isTrainer && !clientMode`. A client could not open the drawer; a
//   trainer who could was deliberately given no tools. The contraindication
//   gate, the cleared-pool filter and the write-time pool re-check for Gerard
//   and Sharon all sat behind a door with no handle.
//
//   Dustin found it the way these always get found: he asked the ✦ Coach, from
//   the client app, to adapt his session to a hotel gym — the exact case the
//   conversational layer was built for — and it told him to message his
//   trainer. He is the trainer.
//
// The ✦ Coach is the AI clients actually tap, so the tools go to it. Dustin,
// 12 Aug: "one AI that does all of it." This module is how both surfaces get
// the same behaviour without a second copy of the loop drifting away from the
// first.
//
// SAFETY IS INHERITED, NOT REIMPLEMENTED. Everything here delegates to
// runClientTool, so the three invariants in clientActions.ts hold unchanged:
// no tool takes a client_id (it is resolved from the session and passed as an
// argument), every write re-checks ownership at write time, and a gated
// client's swap is re-checked against their cleared pool by isDayInPool on top
// of the model only ever having been shown the cleared list. Two independent
// barriers. Do not add a shortcut around this file.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLIENT_TOOLS, runClientTool } from "@/lib/ai/clientActions";

export interface AssistantRunResult {
  /** The model's final text. May be empty if it only made tool calls. */
  text: string;
  /** How many tools actually ran. ZERO IS MEANINGFUL — see the note below. */
  toolsUsed: number;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Run the tool loop for one client turn.
 *
 * `toolsUsed` is the load-bearing part of the return value. The ✦ Coach calls
 * this FIRST on a question turn and only uses the answer if a tool actually
 * ran; otherwise it discards this result and falls through to the existing
 * nutrition coach, untouched. That is what keeps a route used daily by 35
 * people for food logging from changing behaviour at all when somebody asks
 * about their macros — the model simply does not reach for a workout tool, the
 * count comes back 0, and the old path answers exactly as it did before.
 *
 * Four rounds, not unbounded: every tool here is a single read or a single
 * write, so a model still going at round five is looping, and the honest
 * outcome is the text it already has rather than a bill.
 */
export async function runClientAssistant(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  supabase: SupabaseClient;
  clientId: string;
  today: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxRounds?: number;
}): Promise<AssistantRunResult> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });
  const convo: Anthropic.MessageParam[] = opts.messages
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));

  let tokensIn = 0;
  let tokensOut = 0;
  let toolsUsed = 0;
  let text = "";

  const rounds = opts.maxRounds ?? 4;

  for (let round = 0; round < rounds; round++) {
    const response: Anthropic.Message = await anthropic.messages.create({
      model: opts.model,
      max_tokens: 1024,
      system: opts.systemPrompt,
      messages: convo,
      tools: CLIENT_TOOLS,
    });

    tokensIn += response.usage?.input_tokens ?? 0;
    tokensOut += response.usage?.output_tokens ?? 0;

    text =
      response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n")
        .trim() || text;

    const calls = response.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];
    if (!calls.length) break;

    convo.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const c of calls) {
      const out = await runClientTool(
        opts.supabase,
        opts.clientId,
        c.name,
        (c.input || {}) as Record<string, unknown>,
        opts.today,
      );
      toolsUsed += 1;
      results.push({ type: "tool_result", tool_use_id: c.id, content: out });
    }
    convo.push({ role: "user", content: results });
  }

  return { text, toolsUsed, tokensIn, tokensOut };
}
