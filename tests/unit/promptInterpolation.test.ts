import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// `${COACH_FIRST_NAME}` inside a DOUBLE-QUOTED string is not a placeholder — it
// is twenty literal characters. It type-checks, it lints, it reads correctly at
// a glance, and it ships. One sat in the coach context for every client with no
// weigh-in on file, so the model was handed:
//
//   "a first weigh-in would let ${COACH_FIRST_NAME} track progress"
//
// SCOPE, AND WHY IT IS NARROW
// The general version of this check — "any ${identifier} inside any quoted
// string" — was attempted four times: as three regexes and then as a
// hand-written scanner tracking quote, comment and template-nesting state.
// Every version produced false positives on real, correct code: a template
// between two quoted strings, a line from the middle of a multi-line prompt, a
// template nested inside another, JSX text containing an apostrophe, regex
// literals containing ${}. Doing it properly needs a real TypeScript parser.
//
// So this checks the thing that actually broke instead: the handful of
// interpolated constants that appear in prompts. That is a plain substring
// search with no parsing, it cannot false-positive, and it covers the bug —
// prompts interpolate these names and almost nothing else.

const ROOT = process.cwd();

/** The constants that appear inside prompt and context strings. */
const PROMPT_CONSTANTS = [
  "COACH_FIRST_NAME",
  "COACH_FULL_NAME",
  "BUSINESS_NAME",
  "TRAINER_EMAIL",
  "BRAND_NAME",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Is the character at `idx` inside a template literal?
 *
 * Counts unescaped backticks from the start of the file: an odd number before
 * you means a template is open. No parser, no line-level guessing — and crucially
 * it is correct for MULTI-LINE templates, which is what every prompt in this app
 * is and what defeated every earlier attempt at this check.
 */
/** Is `idx` inside a /* ... *\/ or {/* ... *\/} comment? */
function insideBlockComment(src: string, idx: number): boolean {
  const open = Math.max(src.lastIndexOf("/*", idx), src.lastIndexOf("{/*", idx));
  if (open === -1) return false;
  const close = src.indexOf("*/", open);
  return close === -1 || close > idx;
}

function insideTemplate(src: string, idx: number): boolean {
  let ticks = 0;
  for (let i = 0; i < idx; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "`") ticks++;
  }
  return ticks % 2 === 1;
}

test("prompt constants are never interpolated inside a quoted string", () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const src = fs.readFileSync(file, "utf8");
    for (const name of PROMPT_CONSTANTS) {
      const token = "${" + name + "}";
      let from = 0;
      for (;;) {
        const at = src.indexOf(token, from);
        if (at === -1) break;
        from = at + token.length;
        if (insideTemplate(src, at)) continue; // correct usage

        const lineStart = src.lastIndexOf("\n", at) + 1;
        // Backtick parity counts NESTED templates twice and lands back on even,
        // so `${a ? `x ${CONST}` : ""}` reads as unquoted. A backtick earlier on
        // the same line clears that without weakening the JSX case, which never
        // has one.
        if (src.slice(lineStart, at).includes("`")) continue;

        const lineNo = src.slice(0, at).split("\n").length;
        const lineText = src.split("\n")[lineNo - 1] ?? "";
        const trimmed = lineText.trim();
        // The fix documents this bug by quoting it; comments do not ship.
        // Comments do not ship. Covers line comments, block-comment bodies, and
        // JSX {/* ... */} — including their continuation lines, which do not
        // start with a comment marker of their own.
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("{/*") ||
          insideBlockComment(src, at)
        ) continue;
        offenders.push(`${path.relative(ROOT, file)}:${lineNo}  ${trimmed.slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `A prompt constant is quoted rather than backticked, so it reaches the model as\n` +
      `literal characters:\n  ${offenders.join("\n  ")}`
  );
});

test("the check catches the real thing and clears the correct form", () => {
  const broken = 'const a = "let ${COACH_FIRST_NAME} know";';
  assert.equal(insideTemplate(broken, broken.indexOf("${")), false, "the shipped bug would not have been caught");

  const fixed = "const a = `let ${COACH_FIRST_NAME} know`;";
  assert.equal(insideTemplate(fixed, fixed.indexOf("${")), true, "the corrected line would still be flagged");

  // The case that defeated four earlier attempts: a line pulled from the middle
  // of a multi-line prompt, with an apostrophe on it.
  const multiline = [
    "const SYSTEM = `You are a coach.",
    "Writing workouts: it only touches THIS client's sessions.",
    "Ask ${COACH_FIRST_NAME} before a big change.`;",
  ].join("\n");
  assert.equal(insideTemplate(multiline, multiline.indexOf("${")), true, "multi-line template misread as quoted");
});
