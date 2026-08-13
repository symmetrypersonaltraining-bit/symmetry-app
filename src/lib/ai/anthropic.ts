// Thin Anthropic wrapper for the nutrition AI endpoints: one place for model
// ids and a strict-JSON call helper (validate + exactly one retry on bad JSON).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai/nutrition-json";
import { logFailure } from "@/lib/ai/meter";
import type { AiFeature } from "@/lib/ai/meter-core";

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
 *
 * `fallbackSystem` is a LAST-DITCH third attempt with a simpler prompt, run
 * only if both normal attempts failed. It exists because of a real outage: the
 * parse endpoint was asked for 33 micronutrients per food, blew through its
 * 900-token ceiling, truncated mid-JSON, and failed BOTH attempts - so a
 * feature that had worked for months started answering "AI estimating isn't
 * reachable right now" for everyone. The corrective retry made it worse, since
 * it appends the truncated reply to the conversation and asks again.
 *
 * The rule this encodes: a nice-to-have enrichment must never be able to take
 * the core answer down with it. If the rich reply will not come back, ask for
 * the plain one rather than returning nothing.
 */
export async function callClaudeJson<T>(opts: {
  apiKey: string;
  model: string;
  system: string;
  maxTokens: number;
  messages: Anthropic.MessageParam[];
  validate: (raw: unknown) => T | null;
  /** Simpler prompt for one final attempt if the normal two both fail. */
  fallbackSystem?: string;
  /**
   * Record failures against this surface.
   *
   * Seventeen routes call through this helper and every one of them had the
   * same blind spot: `logUsage` runs only on the SUCCESS path, so a call that
   * threw, or that came back as unparseable JSON three times running, spent
   * tokens and left no trace at all. From the data it looked identical to
   * nobody using the feature.
   *
   * Callers keep logging their own successes — this only fills the hole. Pass
   * the meter and a failure becomes a row.
   */
  meter?: { clientId: string | null; feature: AiFeature };
}): Promise<JsonCallResult<T>> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  let tokensIn = 0;
  let tokensOut = 0;
  let rawText = "";
  let messages: Anthropic.MessageParam[] = [...opts.messages];

  const startedAt = new Date();
  const t0 = Date.now();
  const fail = async (err: unknown) => {
    if (!opts.meter) return;
    await logFailure(opts.meter.clientId, opts.meter.feature, opts.model, err, {
      latencyMs: Date.now() - t0,
      startedAt,
      tokensIn,
      tokensOut,
    });
  };

  try {
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

    // Both attempts failed. If a simpler prompt was supplied, ask once more with
    // the ORIGINAL user message only - deliberately not the accumulated thread,
    // which by now contains the truncated replies that caused the failure.
    if (opts.fallbackSystem) {
      const resp = await client.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.fallbackSystem,
        messages: [...opts.messages],
      });
      tokensIn += resp.usage?.input_tokens ?? 0;
      tokensOut += resp.usage?.output_tokens ?? 0;
      const fbText =
        resp.content[0]?.type === "text" ? resp.content[0].text : "";
      const parsed = extractJson(fbText);
      const valid = parsed == null ? null : opts.validate(parsed);
      if (valid) return { value: valid, rawText: fbText, tokensIn, tokensOut };
      rawText = fbText || rawText;
    }

    // Every attempt reached the model and none produced usable JSON. Tokens were
    // spent, the caller is about to tell the user the feature is unavailable, and
    // before 13 Aug this was completely invisible.
    await fail(
      new Error(
        `No valid JSON after ${opts.fallbackSystem ? 3 : 2} attempts` +
          (rawText
            ? ` (last reply began: ${rawText.slice(0, 120)})`
            : " (empty reply)"),
      ),
    );
    return { value: null, rawText, tokensIn, tokensOut };
  } catch (e) {
    // Network, auth, rate limit, timeout, overload. Record it, then rethrow so
    // the caller's own error handling is completely unchanged.
    await fail(e);
    throw e;
  }
}
