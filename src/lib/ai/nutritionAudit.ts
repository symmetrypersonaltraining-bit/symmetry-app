/**
 * EVERY AI NUMBER LEAVES A RECEIPT.
 *
 * Dustin, 13 Sep 2026: *"We need a log from these on all client apps so you can
 * catch where we need to improve … build a log so I can have you check for
 * screw ups in future."*
 *
 * ── WHY meal_adherence_logs IS NOT THIS ──────────────────────────────────────
 *
 * Three bad meals in three days were each found the same way round: he noticed,
 * and the cause was then reverse-engineered out of the log row afterwards. That
 * row holds the ANSWER — 634 kcal, 2,100 kcal — and none of the working:
 *
 *   - which food name the parser actually asked for ("bacon", separately, on
 *     12 Sep — the thing that double-counted the burger),
 *   - which catalogue row answered it, or whether a published page was read,
 *   - whether the number is a marked estimate or a measured row,
 *   - what could not be priced at all and therefore silently left the total.
 *
 * Without those, every fault is found by the client and diagnosed by inference.
 * This writes them down at the moment the decision is made, on every client's
 * app, so the question becomes a query instead of an investigation.
 *
 * ── IT MUST NEVER BREAK A MEAL ───────────────────────────────────────────────
 *
 * An audit trail that can fail a log is worse than no audit trail. Every call
 * is fire-and-forget and every error is swallowed: a client logging dinner does
 * not care that the receipt did not save, and must never be told about it.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type AuditSurface =
  | "parse"       // "describe what you ate"
  | "act"         // the coach chat's action extractor
  | "meal_edit"   // the Adjust sheet
  | "photo"       // a photographed meal
  | "plan_build"  // the AI plan builder
  | "recipe_ai";  // the AI recipe writer

export interface AuditItem {
  /** The name the model asked for — the half meal_adherence_logs never keeps. */
  requested?: string | null;
  /** What actually answered: the row's name, or the page's. */
  name: string;
  amount?: number | null;
  unit?: string | null;
  p?: number;
  c?: number;
  f?: number;
  kcal?: number;
  /** The food_catalog row, when one answered. Null for a page or a guess. */
  food_id?: string | null;
  verified?: boolean;
  /** True when nothing could price it and the last-resort estimate did. */
  estimated?: boolean;
  /** The published page, for a restaurant or branded lookup. */
  source_url?: string | null;
}

/**
 * Record one AI nutrition request and what it priced.
 *
 * Deliberately NOT awaited by its callers — see the header. It returns a
 * promise so a test can await it; in a route, call it with `void`.
 */
export async function logNutritionAi(entry: {
  clientId: string | null;
  surface: AuditSurface;
  requestText?: string | null;
  model?: string | null;
  intent?: string | null;
  items?: AuditItem[];
  unresolved?: string[];
  totals?: { kcal: number; p: number; c: number; f: number } | null;
}): Promise<void> {
  try {
    const items = entry.items ?? [];
    const unresolved = entry.unresolved ?? [];
    await createAdminClient()
      .from("ai_nutrition_log")
      .insert({
        client_id: entry.clientId,
        surface: entry.surface,
        // Enough to reproduce the request, capped so one pasted essay cannot
        // make the audit table the biggest thing in the database.
        request_text: entry.requestText ? entry.requestText.slice(0, 2000) : null,
        model: entry.model ?? null,
        intent: entry.intent ?? null,
        // `items` and `totals` are jsonb columns; the generated Json type is a
        // recursive union that a typed interface does not structurally satisfy,
        // even though the value is plain JSON. Serialising through JSON.parse
        // is the honest conversion rather than a cast that hides a real shape
        // mismatch — if an item ever held something unserialisable, this throws
        // into the catch below instead of writing a broken row.
        items: JSON.parse(JSON.stringify(items)),
        unresolved,
        totals: entry.totals ? JSON.parse(JSON.stringify(entry.totals)) : null,
        any_estimated: items.some((i) => i.estimated === true),
        any_unresolved: unresolved.length > 0,
      });
  } catch {
    // Never surfaces, never throws, never fails a meal. See the header.
  }
}
