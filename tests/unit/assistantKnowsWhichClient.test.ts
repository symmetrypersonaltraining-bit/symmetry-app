// THE ASSISTANT MUST KNOW WHOSE WORKOUT IT IS LOOKING AT.
//
// Dustin, 22 Aug, mid-session with a client, asking the AI inside the logger
// for "a summary on progress for last 4 weeks":
//
//   "The ID c35193c6-11b6-4953-9e5c-aa54042a63dd isn't matching any client or
//    workout record in the database… Can you tell me which client this is for?"
//
// It was told the wrong thing about the id, twice over. /workout/<id> carries a
// `days` id — a day TEMPLATE inside a programme, shared by every client on that
// programme — and the context line called it "scheduled workout id". So the
// model looked for a scheduled_workouts row that does not exist, and then for a
// client, which a `days` row can never be.
//
// The client was in the URL the whole time: a trainer opens a client's session
// as /workout/<dayId>?forClient=<clientId>, which is how the page itself knows
// whose workout to render. Nothing read it.
//
// Same fault in /api/workout-assist, which derived the client by looking that
// same day id up in scheduled_workouts — always null, so applying an adjustment
// answered "Pick a client first" while standing inside that client's workout.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ASSISTANT = "src/components/AIAssistant.tsx";
const ROUTE = "src/app/api/workout-assist/route.ts";

test("the id in /workout/<id> is called a day id, because that is what it is", () => {
  const c = code(read(ASSISTANT));
  assert.match(c, /focusDayId/, "the path id is not named for what it is");
  assert.ok(!/focusWorkoutId/.test(c),
    "still calls a days.id a workout id — that is what sent the model looking " +
    "for a scheduled_workouts row that cannot exist");
});

test("the assistant reads the client out of the URL", () => {
  const c = code(read(ASSISTANT));
  assert.match(c, /["']forClient["']/,
    "?forClient= is how the logger itself knows whose session this is, and the " +
    "assistant sitting on top of it must use the same answer");
  assert.match(c, /focusClientId/, "nothing carries the client into the request");
});

test("the page context names the client id and says not to ask", () => {
  const c = code(read(ASSISTANT));
  const ctx = c.slice(c.indexOf("const pageContext"), c.indexOf("const pageContext") + 900);
  assert.match(ctx, /client_id \$\{focusClientId\}/,
    "the client id is not in the context, so the model has to ask");
  assert.match(ctx, /do not ask which client/i,
    "without this the model asks anyway — it did, in the middle of a session");
  assert.match(ctx, /NOT a client/,
    "the day id must be labelled as not-a-client, or it gets tried as one");
});

test("useSearchParams is NOT how it reads the query", () => {
  const c = code(read(ASSISTANT));
  // This component mounts in the app layout, on every page. useSearchParams()
  // opts the whole tree out of static rendering and failed the build on /404
  // with "should be wrapped in a suspense boundary".
  assert.ok(!/useSearchParams/.test(c),
    "useSearchParams here breaks the build for every statically rendered page");
  assert.match(c, /new URLSearchParams\(window\.location\.search\)/,
    "the query string is read some other, unchecked way");
});

test("workout-assist trusts the client it is given before guessing", () => {
  const c = code(read(ROUTE));
  const at = c.indexOf("let clientId = scope.clientId;");
  assert.ok(at > -1, "the client resolution moved; re-check this guard");
  const block = c.slice(at, at + 900);
  assert.match(block, /if \(body\.clientId\) clientId = body\.clientId;/,
    "the route ignores an explicitly supplied client and goes back to inferring one");
  const explicitAt = block.indexOf("body.clientId");
  const lookupAt = block.indexOf("focusWorkoutId");
  assert.ok(explicitAt < lookupAt || lookupAt === -1,
    "the scheduled_workouts guess runs before the client it was handed");
});
