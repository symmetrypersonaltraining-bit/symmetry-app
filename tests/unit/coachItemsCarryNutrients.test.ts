import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A MEAL LOGGED THROUGH THE COACH MUST CARRY ITS NUTRIENTS.
 *
 * `app_feedback 2c2df05f`, 4 Aug: "Need to track full nutrients on everywhere
 * in food logger." The word doing the work is EVERYWHERE — it worked in the
 * food-search sheet and nowhere else.
 *
 * Measured 14 Aug: of 34 custom meals logged since 11 Aug, only 6 carried any
 * nutrient. Every layer was individually correct, which is why it survived a
 * review:
 *
 *   · the parse route ASKS the model for micros (since da30c87)
 *   · validateActReply SANITISES and KEEPS them
 *   · CustomItem HAS fi/su/so/sf fields
 *   · upsertLog DERIVES est_* from those fields
 *   · the day totals read est_* correctly
 *
 * The break was a type. `CoachActionItem` had no `micros` field, so the values
 * were dropped the instant a parsed item crossed into the UI, and
 * `aiItemsToCustom` then mapped an object that no longer had them. Nothing
 * threw. Nothing logged. The number was simply absent, and absent is
 * indistinguishable from "this food has no fibre" unless you go and count rows.
 *
 * The identical meal built by hand in the food sheet recorded fibre and sodium
 * fine, which is what made it look like a display problem for three handoffs
 * running.
 *
 * ABSENT MUST STAY ABSENT. A nutrient the model did not report is UNKNOWN, not
 * zero — writing 0 claims the food contains none of it and quietly drags the
 * day's total down. That rule is the reason the mapping below is conditional
 * rather than defaulting.
 */

const ROOT = process.cwd();
const SHEET = join(ROOT, "src/app/(app)/nutrition/v3/CoachChatSheet.tsx");
const CLIENT = join(ROOT, "src/app/(app)/nutrition/v3/NutritionV3Client.tsx");

function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

test("CoachActionItem still has somewhere to put nutrients", () => {
  const code = codeOnly(readFileSync(SHEET, "utf8"));
  const iface = code.slice(
    code.indexOf("export interface CoachActionItem"),
    code.indexOf("export type CoachActionAdherence"),
  );
  assert.ok(iface.length > 0, "CoachActionItem interface not found");
  assert.match(
    iface,
    /micros\?:/,
    "CoachActionItem lost its micros field — parsed nutrients get dropped at the type boundary again, " +
      "silently, exactly as they were before 14 Aug",
  );
});

test("aiItemsToCustom maps all four nutrients onto the custom item", () => {
  const code = codeOnly(readFileSync(CLIENT, "utf8"));
  const fn = code.slice(
    code.indexOf("function aiItemsToCustom"),
    code.indexOf("function rowByPosition"),
  );
  assert.ok(fn.length > 0, "aiItemsToCustom not found");

  for (const [key, short] of [
    ["fiber", "fi"],
    ["sugar", "su"],
    ["sodium", "so"],
    ["sat_fat", "sf"],
  ] as const) {
    assert.ok(
      fn.includes(short + ":") && fn.includes(key),
      `aiItemsToCustom no longer carries ${key} -> ${short}; a coach-logged meal will record no ${key}`,
    );
  }
});

test("a nutrient the model omitted is left absent, never written as zero", () => {
  const code = codeOnly(readFileSync(CLIENT, "utf8"));
  const fn = code.slice(
    code.indexOf("function aiItemsToCustom"),
    code.indexOf("function rowByPosition"),
  );

  // Conditional spreads are what keep an unreported nutrient out of the object
  // entirely. A `?? 0` or `|| 0` anywhere in here would turn "unknown" into a
  // claim of zero and drag the day's total down.
  assert.doesNotMatch(
    fn,
    /(fi|su|so|sf)\s*:\s*[^,}]*(\?\?|\|\|)\s*0/,
    "a nutrient is being defaulted to 0 in aiItemsToCustom. Absent means UNKNOWN; " +
      "0 is a claim the food contains none of it, and it silently lowers the day's total",
  );
  assert.match(
    fn,
    /\.\.\.\(num\(m\.fiber\)\s*!==\s*undefined/,
    "the conditional spread guarding fiber is gone — unreported nutrients can now be written as values",
  );
});

test("validateActReply still preserves micros, which is what makes the mapping worth having", () => {
  const json = codeOnly(readFileSync(join(ROOT, "src/lib/ai/nutrition-json.ts"), "utf8"));
  assert.match(
    json,
    /sanitizeNutrients\(it\.micros\s*\?\?\s*it\.nutrients\)/,
    "the act validator stopped sanitising per-item micros — the UI mapping would then have nothing to carry",
  );
});
