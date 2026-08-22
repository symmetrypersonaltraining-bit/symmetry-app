// ============================================================================
// Only a trainer, in the trainer app, gets the trainer agent.
//
// Dustin, 22 Aug, the same day he added three more trainers: "I need you to be
// very careful at making sure this only happens from the trainer app, not from
// any client's app... no clients can have this function. So there needs to be a
// very strong guard up for that."
//
// WHY THIS ONE MATTERS MORE THAN MOST. The trainer agent reads any client on
// the caller's roster, rewrites programmes, moves calendar sessions, changes
// macro targets and messages real people — and its tools run on the SERVICE
// ROLE, which bypasses RLS completely. Everywhere else in this app RLS is the
// backstop when a check is wrong. Here there is no backstop underneath. If the
// gate is wrong, a client is holding the trainer's console.
//
// So the decision is a pure function, and every way in is enumerated rather
// than reasoned about.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  trainerGate,
  gateMessage,
  inClientModeFrom,
  activeTrainerRow,
  CLIENT_MODE_COOKIE,
} from "../../src/lib/ai/trainerGate.ts";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ACTIVE = { id: "t1", active: true };

describe("the gate — every way in", () => {
  it("an active trainer in the trainer app is allowed", () => {
    const v = trainerGate({ trainerRow: ACTIVE, inClientMode: false });
    assert.equal(v.allowed, true);
    assert.equal(v.allowed && v.trainerId, "t1");
  });

  it("a client is refused", () => {
    // The whole point. A client has no trainers row at all.
    const v = trainerGate({ trainerRow: null, inClientMode: false });
    assert.equal(v.allowed, false);
    assert.equal(v.allowed === false && v.reason, "not-a-trainer");
  });

  it("a DEACTIVATED trainer is refused", () => {
    // trainers.active existed and nothing read it, so deactivating somebody
    // took away nothing: they kept the agent and kept their roster. With more
    // trainers arriving, removing one has to actually remove them.
    const v = trainerGate({ trainerRow: { id: "t2", active: false }, inClientMode: false });
    assert.equal(v.allowed, false);
    assert.equal(v.allowed === false && v.reason, "deactivated");
  });

  it("a trainer in CLIENT VIEW is refused", () => {
    // Client View is the client app. If the console is unreachable there, it is
    // unreachable on every screen a client has — which is the cheapest way to
    // be sure of the thing he actually asked for.
    const v = trainerGate({ trainerRow: ACTIVE, inClientMode: true });
    assert.equal(v.allowed, false);
    assert.equal(v.allowed === false && v.reason, "client-mode");
  });

  it("a deactivated trainer in client view is still refused", () => {
    assert.equal(trainerGate({ trainerRow: { id: "t3", active: false }, inClientMode: true }).allowed, false);
  });

  it("there is no input that allows without an active row", () => {
    // Exhaustive over the whole input space, so a future edit that adds an
    // early return cannot open a hole nobody enumerated.
    for (const row of [null, { id: "x", active: false }, { id: "x", active: true }]) {
      for (const inClientMode of [true, false]) {
        const v = trainerGate({ trainerRow: row, inClientMode });
        const shouldAllow = row !== null && row.active && !inClientMode;
        assert.equal(v.allowed, shouldAllow, `row=${JSON.stringify(row)} clientMode=${inClientMode}`);
      }
    }
  });
});

describe("the row lookup keys on the authenticated identity", () => {
  function db(rows: unknown, error: unknown = null) {
    const seen: { table?: string; col?: string; val?: string; cols?: string } = {};
    return {
      seen,
      from: (t: string) => { seen.table = t; return {
        select: (c: string) => { seen.cols = c; return {
          eq: (col: string, v: string) => { seen.col = col; seen.val = v; return {
            limit: () => Promise.resolve({ data: rows, error }),
          }; },
        }; },
      }; },
    };
  }

  it("matches auth_user_id, never email", () => {
    // trainerForAuthUser falls back to matching a trainers row by EMAIL. That
    // is right for naming a coach who has not signed in yet, and wrong for an
    // authorization decision: an address is a field on a row, not proof of who
    // is holding the phone.
    const d = db([{ id: "t1", active: true }]);
    return activeTrainerRow(d, "auth-1").then((row) => {
      assert.deepEqual(row, { id: "t1", active: true });
      assert.equal(d.seen.table, "trainers");
      assert.equal(d.seen.col, "auth_user_id", "the lookup is matching on something other than the signed-in identity");
      assert.equal(d.seen.val, "auth-1");
      assert.match(String(d.seen.cols), /active/, "active is not even selected, so it can never be checked");
    });
  });

  it("no auth user means no row", async () => {
    assert.equal(await activeTrainerRow(db([{ id: "t1", active: true }]), null), null);
    assert.equal(await activeTrainerRow(db([{ id: "t1", active: true }]), undefined), null);
  });

  it("an unreadable trainers table DENIES rather than grants", async () => {
    // Fail-closed. A query error here must never be read as "fine, carry on".
    assert.equal(await activeTrainerRow(db(null, { message: "boom" }), "auth-1"), null);
  });

  it("a row with active missing or not true is not active", async () => {
    const r1 = await activeTrainerRow(db([{ id: "t1" }]), "auth-1");
    assert.equal(r1?.active, false, "a null active column read as active");
    const r2 = await activeTrainerRow(db([{ id: "t1", active: "yes" }]), "auth-1");
    assert.equal(r2?.active, false, "a non-boolean active read as active");
  });
});

describe("client mode is detected before the cookie settles", () => {
  it("the explicit marker counts on its own", () => {
    // The app renders ?as=client on the first paint, before the cookie has
    // propagated. A guard that waits for the cookie has a window where it is
    // wrong, and that window is exactly page load.
    assert.equal(inClientModeFrom(undefined, "client"), true);
    assert.equal(inClientModeFrom(null, "client"), true);
  });

  it("the cookie counts on its own", () => {
    assert.equal(inClientModeFrom("1", null), true);
  });

  it("neither means trainer app", () => {
    assert.equal(inClientModeFrom(undefined, null), false);
    assert.equal(inClientModeFrom("0", undefined), false);
  });
});

describe("the route enforces it, not the button", () => {
  const route = strip(read("src/app/api/agent/route.ts"));

  it("/api/agent runs the gate", () => {
    assert.match(route, /trainerGate\(\{/, "the agent route no longer runs the gate — the button would be the only thing standing between a client and the console");
    assert.match(route, /activeTrainerRow\(admin, scope\.userId\)/, "the route is not looking up an ACTIVE trainer by auth id");
    assert.match(route, /inClientModeFrom\(/, "the route does not refuse client mode");
  });

  it("it refuses before doing any work", () => {
    // The CALL, not the import at the top of the file.
    const gateAt = route.indexOf("trainerGate({");
    const toolsAt = route.indexOf("execTrainerTool(admin");
    assert.ok(gateAt > -1, "the gate is not called at all");
    assert.ok(toolsAt > -1, "the tool executor is not called — this test has stopped watching anything");
    assert.ok(gateAt < toolsAt, "the gate runs after the tools are reachable");
  });

  it("the trainer it acts as is the one the gate approved", () => {
    // Not "a trainer row that happens to match by email" — the same id the
    // gate authorized, or 403.
    assert.match(route, /me\.id !== verdict\.trainerId/, "the caller identity can diverge from the one that was authorized");
    assert.match(route, /trainerId: verdict\.trainerId/, "the tools run as a trainer the gate did not approve");
  });
});

describe("the UI cannot offer it where the route would refuse", () => {
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));
  const page = strip(read("src/app/(app)/workout/[dayId]/page.tsx"));
  const drawer = strip(read("src/components/AIAssistant.tsx"));

  it("the logger's AI button routes on trainerApp", () => {
    assert.match(logger, /function openAssistant\(\)/, "the button no longer chooses which assistant to open");
    assert.match(logger, /if \(trainerApp\) \{/, "the button does not check which app it is in");
    assert.match(logger, /symmetry:open-ai/, "the trainer branch does not open the trainer assistant");
  });

  it("trainerApp excludes client view, not just non-trainers", () => {
    assert.match(page, /const trainerApp = isTrainer && !inClientMode;/,
      "trainerApp is true for a trainer in Client View — that is the client app, and the console does not belong there");
  });

  it("the drawer itself refuses to render in client view", () => {
    // It is mounted in the ROOT layout, so it exists on every screen a client
    // ever sees. Rendering nothing for them has to include Client View.
    assert.match(drawer, /CLIENT_MODE_COOKIE/, "the trainer drawer does not check client mode");
    // Trainer-ness is the database's answer since 37bbc0a (viewerIsTrainer), so
    // a trainer invited from inside the app gets the drawer. The client-mode
    // half is what has to survive on top of that.
    assert.match(
      drawer,
      /if \(!inClientMode && \(await viewerIsTrainer\(sb, data\?\.user\)\)\) setIsTrainer\(true\)/,
      "the drawer's gate dropped the client-mode half, or stopped asking the database who is a trainer",
    );
  });

  it("the cookie name is shared, so the two halves cannot drift", () => {
    for (const [file, code] of [["page", page], ["drawer", drawer]] as const) {
      assert.ok(
        !/"symmetry_client_mode"/.test(code),
        `${file} hardcodes the cookie name instead of importing CLIENT_MODE_COOKIE — rename it once and the guard silently stops matching`,
      );
    }
    assert.equal(CLIENT_MODE_COOKIE, "symmetry_client_mode");
  });
});

describe("what the refusal says", () => {
  it("client mode gets a message you can act on", () => {
    assert.match(gateMessage("client-mode"), /Switch back to trainer view/);
  });

  it("everything else says nothing about why", () => {
    // Never confirm to a client whether a trainers row exists for them.
    assert.equal(gateMessage("not-a-trainer"), "Trainer only.");
    assert.equal(gateMessage("deactivated"), "Trainer only.");
  });
});
