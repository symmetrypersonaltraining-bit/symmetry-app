// SWITCHING VIEWS MUST NOT DEPEND ON A COOKIE RACE.
//
// Dustin, 22 Aug: "my app is currently opening to client view when i hit
// trainer toggle!!!!" — and, minutes later, the same fault the other way round:
// "once i switch to client its getting stuck. if i wait it goes back but huge
// lag."
//
// Every page decided client view as
//
//     as === "client"  ||  cookie symmetry_client_mode === "1"
//
// Entering client view was hardened deliberately: the ?as=client marker forces
// the client branch on the FIRST server render whatever the cookie says.
// LEAVING it had no marker. The toggle pushed a bare /home and relied entirely
// on `document.cookie = "symmetry_client_mode=; max-age=0"` having propagated
// before the RSC request left the browser. When it had not — or when Next
// served a /home payload prefetched while still in client mode — the server saw
// the cookie set and rendered the client dashboard.
//
// The "huge lag" is the same fault wearing a different coat: rendering the
// wrong branch runs the TRAINER's all-clients schedule query, measured at
// ~1.8s against production, so picking the wrong side reads as a freeze rather
// than as a wrong screen.
//
// A marker in one direction only is not a fix, it is half of one.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Every page that decides which of the two apps to render. */
const PAGES = [
  "src/app/(app)/home/page.tsx",
  "src/app/(app)/workout/page.tsx",
  "src/app/(app)/nutrition/page.tsx",
  "src/app/(app)/messages/page.tsx",
  "src/app/(app)/settings/page.tsx",
];

test("both directions have a marker, on every page that branches", () => {
  for (const p of PAGES) {
    const c = code(read(p));
    assert.match(c, /"client"/, p + " has no ?as=client marker");
    assert.match(c, /"trainer"/,
      p + " honours ?as=client but not ?as=trainer, so LEAVING client view is " +
      "decided by the cookie alone — the exact race that showed a trainer the " +
      "client dashboard");
  }
});

test("the toggle carries a marker whichever way it goes", () => {
  const c = code(read("src/components/TrainerLayoutWrapper.tsx"));
  assert.match(c, /\/home\?as=client/, "entering client view has no marker");
  assert.match(c, /\/home\?as=trainer/,
    "leaving client view pushes a bare /home, so a stale cookie or a payload " +
    "prefetched in the other mode decides which app renders");
  assert.ok(!/router\.push\(next \? "\/home\?as=client" : "\/home"\)/.test(c),
    "the bare-/home push is still there");
});

test("the trainer marker WINS over the cookie, rather than merely existing", () => {
  // Ordering is the whole point: `cookie || as === "trainer"` would still let a
  // stale cookie decide. The trainer marker has to be checked first.
  for (const p of ["src/app/(app)/home/page.tsx", "src/app/(app)/workout/page.tsx",
                   "src/app/(app)/nutrition/page.tsx"]) {
    const c = code(read(p));
    const trainerAt = c.indexOf('"trainer"');
    const cookieAt = c.indexOf("symmetry_client_mode");
    assert.ok(trainerAt > -1 && cookieAt > -1, p + " is missing one of the two");
    assert.ok(trainerAt < cookieAt,
      p + " reads the cookie before honouring ?as=trainer, so the cookie still wins");
  }
});
