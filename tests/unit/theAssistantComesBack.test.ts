import test from "node:test";
import assert from "node:assert/strict";
import { watchTrainerMode, TrainerModeDeps } from "../../src/lib/auth/trainerMode.ts";

/**
 * THE AI BUTTON WAS THERE AND NOTHING OPENED.
 *
 * Dustin, 9 Sep, on Todd Prine's page: *"trainer ai assistant is gone!!"* — with
 * the header AI button visible in the screenshot.
 *
 * Both of those are true at once because two components answered the same
 * question separately and only one of them could change its mind. HeaderAssist
 * re-read the client-mode cookie every two seconds, so the BUTTON came back.
 * AIAssistant asked once at mount, folded the cookie into the same latched
 * boolean, and ends in `if (!isTrainer) return null` — so the DRAWER did not,
 * until the page was fully reloaded.
 *
 * These tests drive the two ways that latch strands him, with time and auth
 * injected so neither is a wait.
 */

const fakeDeps = (over: Partial<TrainerModeDeps> = {}) => {
  const timers: (() => void)[] = [];
  const deps: TrainerModeDeps = {
    getUser: async () => ({ id: "u1", email: "symmetrypersonaltraining@gmail.com" }),
    isTrainer: async (u) => !!u,
    inClientMode: () => false,
    setInterval: (fn: () => void) => { timers.push(fn); return timers.length - 1; },
    clearInterval: () => {},
    ...over,
  };
  return { deps, tick: () => timers.forEach((f) => f()) };
};

const settle = () => new Promise((r) => setTimeout(r, 0));

test("the assistant comes back — leaving client view returns it without a reload", async () => {
  // The exact sequence: he is in Client View, comes back to the trainer app,
  // the cookie clears. The button already recovers on its own timer; the
  // assistant has to recover on the same one.
  let clientMode = true;
  const seen: boolean[] = [];
  const { deps, tick } = fakeDeps({ inClientMode: () => clientMode });

  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  assert.deepEqual(seen, [false], "in client view the assistant is correctly unavailable");

  clientMode = false;
  tick();
  assert.deepEqual(seen, [false, true], "out of client view it must come back on its own");
  stop();
});

test("the assistant comes back — a session that arrives late is not a demotion", async () => {
  // supabase.auth.getUser() can resolve before the session is restored on a
  // cold start. viewerIsTrainer returns false on its FIRST line for a null
  // user, before the fail-open-to-the-build-time-list it documents. One
  // unlucky moment at mount used to kill the drawer for the life of the page.
  let user: { id: string; email: string } | null = null;
  let fireAuthChange = () => {};
  const seen: boolean[] = [];
  const { deps } = fakeDeps({
    getUser: async () => user,
    onAuthChange: (cb) => { fireAuthChange = cb; return () => {}; },
  });

  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  assert.deepEqual(seen, [false]);

  user = { id: "u1", email: "symmetrypersonaltraining@gmail.com" };
  fireAuthChange();
  await settle();
  assert.deepEqual(seen, [false, true], "the session landed and nothing was listening");
  stop();
});

test("the assistant comes back — a dropped request does not close it mid-sentence", async () => {
  // The other direction of the same lesson. Once he is known to be a trainer,
  // a failed or empty re-check must not yank the drawer shut while he is
  // typing in it. Signing out unmounts the app; a flaky network does not.
  let fail = false;
  let fireAuthChange = () => {};
  const seen: boolean[] = [];
  const { deps } = fakeDeps({
    getUser: async () => { if (fail) throw new Error("network"); return { id: "u1", email: "d@x.com" }; },
    onAuthChange: (cb) => { fireAuthChange = cb; return () => {}; },
  });

  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  assert.deepEqual(seen, [true]);

  fail = true;
  fireAuthChange();
  await settle();
  assert.deepEqual(seen, [true], "still just the one emit — it must not have closed");
  stop();
});

test("the assistant comes back — client view still closes it, which is the guard", async () => {
  // Dustin, 22 Aug, adding three trainers: "no clients can have this function.
  // So there needs to be a very strong guard up for that." Recovering must not
  // weaken it: entering Client View closes the assistant on the same timer.
  let clientMode = false;
  const seen: boolean[] = [];
  const { deps, tick } = fakeDeps({ inClientMode: () => clientMode });

  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  assert.deepEqual(seen, [true]);

  clientMode = true;
  tick();
  assert.deepEqual(seen, [true, false], "client view must shut it, every time");
  stop();
});

test("the assistant comes back — a non-trainer is never handed it", async () => {
  const seen: boolean[] = [];
  const { deps, tick } = fakeDeps({ isTrainer: async () => false });
  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  tick();
  assert.deepEqual(seen, [false]);
  stop();
});

test("the assistant comes back — it stops asking once it is torn down", async () => {
  let clientMode = true;
  const seen: boolean[] = [];
  const { deps, tick } = fakeDeps({ inClientMode: () => clientMode });
  const stop = watchTrainerMode(deps, (v) => seen.push(v));
  await settle();
  stop();
  clientMode = false;
  tick();
  assert.deepEqual(seen, [false], "no emits after unmount");
});
