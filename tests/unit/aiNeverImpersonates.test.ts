import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE APP MUST NEVER SIGN A MESSAGE AS DUSTIN.
 *
 * Bobbie Page, in her own thread with him, 13 Aug 2026:
 *
 *     "Is this ai or Dustin chatting?"
 *
 * She was replying to a warm, specific, personal-sounding message — "Bobbie, 10
 * workouts in the last 30 days and you got one in today, that base is real" —
 * that a model wrote and that the app rendered as **You**. Nineteen of those
 * went out that night, to nineteen people.
 *
 * The old header of /api/ai-nudges described this as intentional: "these
 * messages go out in Dustin's name." It read like a safety note. It was the
 * defect, written down and mistaken for a feature.
 *
 * Why this is worth a test rather than a comment: the damage is not the nudge.
 * It is that once a client cannot tell a Dustin message from a generated one,
 * EVERY message he actually writes loses its weight — and the client who works
 * it out later doesn't just discount the bot, they go back and re-read the real
 * ones wondering. That is unrecoverable, it costs nothing to prevent, and the
 * thing that prevents it is one field that is very easy to forget on a new
 * insert. Forgetting it produces no error and looks fine in review; the only
 * symptom is a client asking Bobbie's question, months later, if they bother.
 *
 * So: any route that writes to `messages` on the app's behalf sets
 * sender_kind. MessagesClient keys `isBot` off it, ahead of from_id, so the
 * field alone is what makes the bubble render as Coach Bot.
 */

const ROOT = process.cwd();

/**
 * Routes that write a message the APP composed. Each must set sender_kind.
 *
 * Routes that forward something a HUMAN wrote are deliberately absent —
 * program-feedback (the client's own answer) and coach-escalate (the client
 * deliberately handing their own question over). Those genuinely come from the
 * person whose id is on from_id, and marking them as the bot would be its own
 * small lie in the other direction.
 */
const APP_AUTHORED = [
  "src/app/api/ai-nudges/route.ts",
  "src/app/api/cron/birthdays/route.ts",
  "src/app/api/cron/coachbot/route.ts",
  "src/app/api/workout-ai/route.ts",
];

test("every message the app writes is signed as the bot", () => {
  const missing: string[] = [];
  for (const rel of APP_AUTHORED) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    // Count inserts into `messages` and the sender_kind fields near them. Any
    // insert without one is an impersonation waiting to happen.
    const inserts = [...src.matchAll(/\.from\("messages"\)\s*\.insert\(\{/g)];
    const marks = [...src.matchAll(/sender_kind:\s*"coachbot"/g)];
    if (inserts.length === 0) missing.push(`${rel}: no message insert found — has this route moved?`);
    else if (marks.length < inserts.length) {
      missing.push(`${rel}: ${inserts.length} message insert(s), only ${marks.length} marked as the bot`);
    }
  }
  assert.deepEqual(
    missing,
    [],
    "an app-written message would render as if Dustin typed it:\n  " + missing.join("\n  "),
  );
});

test("the nudge prompt does not tell the model to write as Dustin", () => {
  const src = readFileSync(join(ROOT, "src/app/api/ai-nudges/route.ts"), "utf8");
  const at = src.indexOf("const SYSTEM =");
  const prompt = src.slice(at, src.indexOf("`;", at));
  // The original opening line was "You write short re-engagement messages FROM
  // Dustin... they look like he wrote them." Marking the row as the bot while
  // the copy still says "I've been watching your logs" is only half a fix — the
  // bubble says Coach Bot and the words say Dustin.
  // `${coachFirstName}` since 20 Aug: the prompt became a function of the
  // client's own coach, because as a module constant it named the owner to
  // every client of every trainer — and then told them to take the question to
  // him. What this test guards is unchanged: the model must be told it is NOT
  // the coach.
  assert.ok(
    !/look like \$\{coachFirstName\} wrote them/.test(prompt),
    "the prompt still asks for copy that impersonates the coach",
  );
  assert.match(
    prompt,
    /NOT from \$\{coachFirstName\}/,
    "the prompt no longer tells the model it is not writing as the coach",
  );
  assert.match(
    prompt,
    /const SYSTEM = \(coachFirstName: string/,
    "the prompt is back to a module constant, so it names one trainer to everybody's clients",
  );
});

test("the bot bubble is decided by sender_kind, ahead of who sent it", () => {
  // If isMe were evaluated first, a bot message whose from_id is the trainer
  // would render as "You" no matter what sender_kind said — and every fix above
  // would be silently undone by one reordered line.
  const src = readFileSync(join(ROOT, "src/app/(app)/messages/MessagesClient.tsx"), "utf8");
  assert.match(src, /const isBot = m\.sender_kind === "coachbot";/);
  assert.match(
    src,
    /const isMe = !isBot && m\.from_id === currentUserId;/,
    "isMe no longer defers to isBot — a bot message from the trainer would render as 'You'",
  );
});

test("no new route writes to messages without being listed here", () => {
  // A route added later is the actual risk: it will copy an existing insert,
  // and half the existing inserts were wrong until today. This fails on any
  // unreviewed writer so the decision gets made rather than inherited.
  const KNOWN = new Set([
    ...APP_AUTHORED,
    "src/app/api/program-feedback/route.ts", // the client's own answer
    "src/app/api/coach-escalate/route.ts", // the client handing over their own question
    "src/app/(app)/home/messageActions.ts", // Dustin typing, in person
    // The trainer agent's send_message tool. Classified HUMAN-authored, and
    // this one is a real judgement rather than an obvious call.
    //
    // Dustin telling his agent "message Lauren about Thursday" is dictation —
    // he is the author and the agent is the typewriter, so signing it as the
    // bot would be its own lie in the other direction, and would make his own
    // outgoing messages look automated.
    //
    // THE RESIDUAL RISK, recorded so it is a known position rather than an
    // oversight: this holds only while the agent sends what he asked for and
    // nothing else. If it ever composes and sends on its own initiative — a
    // scheduled sweep, a "helpfully followed up", an autonomous loop — that is
    // the Bobbie Page situation again with his name on it, and this line is
    // wrong. Flagged to Dustin 13 Aug; he decides.
    "src/lib/ai/agent-tools.ts",
  ]);
  const found = execSync(`grep -rl 'from("messages")' src/ --include=*.ts --include=*.tsx || true`, {
    encoding: "utf8",
    cwd: ROOT,
  })
    .split("\n")
    .filter(Boolean)
    .filter((f) => {
      const s = readFileSync(join(ROOT, f), "utf8");
      return /\.from\("messages"\)\s*\.insert\(/.test(s);
    });
  const unknown = found.filter((f) => !KNOWN.has(f));
  assert.deepEqual(
    unknown,
    [],
    "a new route writes messages and has not been classified as app-authored or human-authored:\n  " +
      unknown.join("\n  "),
  );
});
