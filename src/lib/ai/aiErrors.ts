/**
 * WHAT A PERSON IS TOLD WHEN THE MODEL DOES NOT ANSWER.
 *
 * Dustin, 13 Sep 2026, testing the photo logger and then the plan builder:
 * *"photo didn't work, says credit balance issue"* … *"same issue with creating
 * a plan with ai"*.
 *
 * He was right, and the cause was not the app: `ai_usage_log` shows every call
 * from 10:42 Central failing with
 *
 *   400 invalid_request_error — "Your credit balance is too low to access the
 *   Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."
 *
 * across food_parse, coach_card and plan_build alike.
 *
 * ── THE BUG IS THAT HE SAW THAT SENTENCE ───────────────────────────────────
 *
 * The routes were appending the provider's raw message to their own: `Analysis
 * failed — ${msg.slice(0, 120)}`. On his phone that is merely confusing. On a
 * CLIENT's phone it is a stranger being shown his billing status, and it tells
 * them nothing they can act on.
 *
 * So the raw text stays where it belongs — `ai_usage_log.error`, with the
 * request id, which is how this was diagnosed in one query — and the screen
 * gets a sentence written for the person reading it. The four cases below are
 * separated because they need OPPOSITE things from whoever is holding the
 * phone: wait, try again, tell the trainer, or nothing at all.
 */

export type AiFailureKind = "billing" | "busy" | "auth" | "unknown";

export function classifyAiError(err: unknown): AiFailureKind {
  const raw = (err instanceof Error ? err.message : String(err ?? "")).toLowerCase();
  if (/credit balance|billing|quota|insufficient[_ ]funds|payment/.test(raw)) return "billing";
  if (/overloaded|rate[_ ]?limit|429|529|timeout|timed out|econnreset|fetch failed/.test(raw)) return "busy";
  if (/invalid[_ ]?api[_ ]?key|authentication|401|403|not configured/.test(raw)) return "auth";
  return "unknown";
}

/**
/** The sentence to show. Never the provider's own words. */
export function aiErrorMessage(err: unknown): string {
  switch (classifyAiError(err)) {
    case "billing":
    case "auth":
      // DELIBERATELY THE SAME SENTENCE FOR BOTH, AND FOR EVERYONE.
      //
      // "Your credit balance is too low" is the provider talking to the
      // account holder, and it reached a screen. On a client's phone that is a
      // stranger being shown someone else's billing status and told nothing
      // they can act on. The real text keeps its place in ai_usage_log.error
      // with the request id — which is how this was diagnosed in one query —
      // and is never what a person reads.
      //
      // Both cases are the whole AI surface being down rather than this one
      // request failing, so neither offers a retry: "try again" is honest for
      // a busy model and a lie for an unfunded account.
      return "The AI is unavailable right now — this is on our side, not yours. Log it by hand and it still counts.";
    case "busy":
      return "The AI is busy right now — give it a few seconds and try again.";
    default:
      return "That didn't work — try again, or enter it by hand.";
  }
}

/**
 * True when the whole AI surface is down rather than this one request failing.
 *
 * Worth separating because it changes what the screen should offer: a retry
 * button is honest for "busy" and a lie for "out of credit".
 */
export function isAiOutage(err: unknown): boolean {
  const k = classifyAiError(err);
  return k === "billing" || k === "auth";
}
