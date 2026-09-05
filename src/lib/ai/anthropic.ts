// Thin Anthropic wrapper for the nutrition AI endpoints: one place for model
// ids and a strict-JSON call helper (validate + exactly one retry on bad JSON).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "@/lib/ai/nutrition-json";
import { logFailure } from "@/lib/ai/meter";
import type { AiFeature } from "@/lib/ai/meter-core";

// Aliases track the latest snapshot; dated ids elsewhere in the app keep working.
// WHICH MODEL GOES WHERE
//
// Dustin asked, 2026-08-13: "should we upgrade the model of ai for this stuff
// for better function?" Thirty days of every AI call in the entire app — 672
// calls across both models — cost $2.84 against a $95 monthly cap. So price was
// never the thing deciding this, and pretending otherwise was making the app
// worse for a rounding error.
//
// The split is by JOB, not by importance:
//
//   HAIKU — pulling a fixed shape out of short text. Parsing a meal, extracting
//   an action intent from one sentence against a list of meals, reading a
//   barcode payload, describing a screenshot. The answer is checkable, the
//   schema is validated, and the client is WAITING on it. Speed is the feature.
//
//   SONNET — anything a person reads as coaching. The coach's answer to a real
//   question, the weekly focus, the Sunday sweep, the nudge, the sentence on the
//   celebration screen. These read fourteen days of logging, a weight trend, a
//   plan and a set of targets, and have to say something true and specific about
//   them. "i want the ai functions in this app to feel so accurate and personal
//   that it blows plps minds" — that is this list, and on this list the model IS
//   the product.
//
// /api/nutrition-ai/act runs BOTH in one request, in that order, for exactly
// this reason. See the comment at its fall-through.
export const HAIKU_MODEL = "claude-haiku-4-5";
export const SONNET_MODEL = "claude-sonnet-4-6";

// ─────────────────────────────────────────────────────────────────────────────
// THE ADVANCED TIER — for clients who use the AI *as* the interface
//
// Dustin, 2026-08-13, about his parents Gerard (71) and Sharon:
//
//   "I need their AI to be able to do anything they need to do in that app for
//    them so they don't have to figure it out."
//
// and, on the budget:
//
//   "I need them to have this access, but I don't wanna go over that ninety
//    five dollars a month. So we need to use a better model than everybody
//    else, but don't take it too far."
//
// THE FIRST VERSION OF THIS PUT THEM ON OPUS. The real usage log says that was
// wrong, and by a lot. Averages over the last 30 days: a coach call is 5,139 in
// / 546 out, an extraction is 1,452 / 155. So:
//
//   ten AI interactions a day, each         Opus coach   $72/mo
//   twenty a day, each                      Opus coach  $144/mo
//   thirty a day, each                      Opus coach  $216/mo
//
// against a $95 ceiling that also has to cover the other thirty clients. Two
// people who use the app by talking to it will clear ten a day without trying.
// The tier would have tripped the cap and silently degraded them to the
// fallback — landing on exactly the two clients least able to cope with a worse
// answer, and neither of them would report it. They would conclude the app had
// got confusing and stop opening it.
//
// SO THE TIER RAISES COMPREHENSION, NOT PRICE.
//
// Their failure mode is not "the coaching advice is not deep enough". Sonnet is
// already the top coaching model here and it is genuinely good at that. Their
// failure mode is the app MISUNDERSTANDING WHAT THEY SAID — "move Friday to
// Saturday", "my back is bad today", "I don't want to do this one". That is the
// EXTRACTION step, and extraction runs on Haiku for everybody because it is
// fast and the client is waiting.
//
// For these two, that trade is backwards. A wrong parse is not a slow answer,
// it is the app doing the wrong thing to their schedule — and they have no
// fallback UI to go and fix it with. So the advanced tier moves EXTRACTION up
// to Sonnet and leaves the coach answer where it already was.
//
//   ten a day each, both steps on Sonnet    $18/mo
//   twenty a day each                       $36/mo
//
// Comfortably inside the ceiling, and it targets the thing that actually breaks
// for them. "A better model than everybody else, but don't take it too far" —
// this is exactly that, aimed at the right half of the request.
export type AiTier = "standard" | "advanced";

/**
 * The model for a job, given the client's tier.
 *
 * `kind` is the JOB — the split the file header describes. The tier only ever
 * moves a job UP, and today it moves exactly one: extraction, from Haiku to
 * Sonnet, for clients who talk to the app instead of navigating it.
 */
export function modelFor(kind: "extract" | "coach" | "chat" | "tools", tier: AiTier = "standard"): string {
  if (kind === "extract") return tier === "advanced" ? SONNET_MODEL : HAIKU_MODEL;
  // TOOLS — a client turn where the action tools are actually in the model's
  // hands: move a session, swap a workout, add one, log a weigh-in.
  //
  // Dustin, 5 Sep, on finding this pass was Haiku for 33 of 35 clients: "go."
  //
  // The argument is the one that already moved EXTRACTION to Sonnet for Gerard
  // and Sharon, and it turns out to apply to everybody. A wrong answer from the
  // coach is a weak paragraph the client can push back on in the next message.
  // A wrong TOOL CALL is the app doing something to their week — a session on
  // the wrong day, the wrong workout swapped in, a weigh-in on the wrong date —
  // and nobody re-reads their own schedule to check it happened correctly. The
  // failure is silent and it is durable, which is exactly the profile that
  // justified the tier in the first place.
  //
  // This does NOT put chat on Sonnet. Chat is thirty-five people typing
  // whenever they like and is metered by volume; it stays where it was. Only
  // the turns holding a tool move, and those are a small share of them.
  if (kind === "tools") return SONNET_MODEL;
  // CHAT — the ✦ drawer, the free-text box on every screen.
  //
  // This one is metered by VOLUME rather than by importance, which is why it
  // does not simply return Sonnet like "coach" does. "Coach" fires a handful of
  // times a day per client, on a schedule; chat is thirty-five people typing
  // whenever they feel like it, and it was the one surface in the app with no
  // cap and no kill switch until 12 Aug. Putting all of them on Sonnet is a
  // straight multiple on the biggest call volume there is.
  //
  // But it is also the surface Gerard and Sharon USE AS THE APP. Everyone else
  // types into it occasionally and navigates with their thumbs; those two ask
  // it to do the navigating. A misread there is not a slightly flat answer, it
  // is the app doing the wrong thing for someone with no fallback UI to go and
  // undo it with.
  //
  // So: Haiku for the roster, Sonnet for the two who talk to the app. Same
  // shape as extraction, same reasoning, and the cost lands on two people
  // rather than thirty-five.
  if (kind === "chat") return tier === "advanced" ? SONNET_MODEL : HAIKU_MODEL;
  return SONNET_MODEL;
}

export interface JsonCallResult<T> {
  value: T | null;
  rawText: string;
  tokensIn: number;
  tokensOut: number;
  /**
   * How long the call took, and when it started.
   *
   * This helper already measured both — but only used them when the call FAILED,
   * so every successful row in ai_usage_log had a null latency and the health
   * page could only ever show a dash for "typical time". Returned now so the
   * caller's logUsage can carry it. Pass them straight through; do not re-time
   * around the call, or the number includes whatever else the route was doing.
   */
  latencyMs: number;
  startedAt: Date;
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
      if (valid) return { value: valid, rawText, tokensIn, tokensOut, latencyMs: Date.now() - t0, startedAt };

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
      if (valid) return { value: valid, rawText: fbText, tokensIn, tokensOut, latencyMs: Date.now() - t0, startedAt };
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
    return { value: null, rawText, tokensIn, tokensOut, latencyMs: Date.now() - t0, startedAt };
  } catch (e) {
    // Network, auth, rate limit, timeout, overload. Record it, then rethrow so
    // the caller's own error handling is completely unchanged.
    await fail(e);
    throw e;
  }
}
