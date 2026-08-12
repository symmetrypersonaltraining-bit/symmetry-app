// Typing a decimal into a controlled number input.
//
// Claudine Ocon, 11 Aug 2026, building a recipe:
//   "Recipe works but cant type decimals in weight for each ingredient"
//
// She was trying to enter 1.5 lbs of ground beef and could only ever get "1".
//
// WHY. The input was controlled directly off a NUMBER:
//
//   value={it.amount ?? ""}
//   onChange={(e) => setIng(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) })}
//
// Type "1"   -> Number("1")   = 1    -> renders "1"    ✅
// Type "1."  -> Number("1.")  = 1    -> renders "1"    ❌ the dot is erased
//
// React re-renders from the number, so the trailing decimal point can never
// survive a keystroke and the second digit has nowhere to attach. The field is
// not rejecting decimals — it is deleting the point the instant it is typed,
// which is why it looks like the keyboard is broken rather than like a bug.
//
// The same shape appears on the P/C/F fields beside it, and `|| 0` there adds a
// second fault: clearing the box to retype snaps it straight back to 0.
//
// THE RULE: while someone is typing, the TEXT is the source of truth. A number
// is derived from it. Never round-trip the text through Number() mid-edit.

/** Strip anything that cannot appear in a decimal, and allow only one point. */
export function sanitizeNumericText(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const first = cleaned.indexOf(".");
  if (first === -1) return cleaned;
  // Keep the first point, drop the rest: "1.5.2" -> "1.52"
  return cleaned.slice(0, first + 1) + cleaned.slice(first + 1).replace(/\./g, "");
}

/**
 * The number a piece of in-progress text currently represents.
 * Returns null for anything not yet a usable figure — "", ".", "1." — so the
 * caller can hold the previous value rather than committing a half-typed one.
 */
export function parseNumericText(text: string): number | null {
  if (!text || text === "." ) return null;
  // "1." is mid-edit, not the number 1 — treat it as incomplete so nothing
  // downstream records a value the user has not finished typing.
  if (text.endsWith(".")) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Text to show for a stored value when the field is not being edited. */
export function formatNumericValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(value);
}
