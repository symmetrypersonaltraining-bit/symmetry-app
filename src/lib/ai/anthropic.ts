// Thin Anthropic wrapper for the nutrition AI endpoints: one place for model
// ids and a strict-JSON call helper (validate + exactly one retry on bad JSON).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai/nutrition-json";

// Aliases track the latest snapshot; dated ids elsewhere in the app keep working.
export const HAIKU_MODEL = "claude-haiku-4-5";
export const SONNET_MODEL = "claude-sonnet-4-6";

export interface JsonCallResult<T> {
  value: T | null;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Calls Claude expecting ONLY valid JSON back. If extraction/validation fails,
 * retries once with the previous reply + a corrective instruction. Token usage
 * is accumulated across attempts so metering charges for what was actually used.
 */
export async function callClaudeJson<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  validate: (raw: unknown) => T | null;
}): Promise<JsonCallResult<T>> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  let tokensIn = 0;
  let tokensOut = 0;
  let rawText = "";
  let messages: Anthropic.MessageParam[] = [...opts.messages];

  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
    });
    tokensIn += resp.usage?.input_tokens ?? 0;
    tokensOut += resp.usage?.output_tokens ?? 0;
    rawText = resp.content[0]?.type === "text" ? resp.content[0].text : "";

    const parsed = extractJson(rawText);
    const valid = parsed == null ? null : opts.validate(parsed);
    if (valid) return { value: valid, rawText, tokensIn, tokensOut };

    // One corrective retry: show the model its own reply and demand pure JSON.
    messages = [
      ...messages,
      { role: "assistant", content: rawText || "(empty reply)" },
      {
        role: "user",
        content:
          "That response was not valid JSON matching the required schema. Respond again with ONLY the JSON object — no prose, no markdown fences, no explanations.",
      },
    ];
  }
  return { value: null, rawText, tokensIn, tokensOut };
}
