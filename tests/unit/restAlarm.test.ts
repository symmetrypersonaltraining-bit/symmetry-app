// ============================================================================
// The rest timer has to go off with the phone in a pocket.
//
// Dustin, 22 Aug: "lets make the timer in workout logger buzz phone and ding
// loud even if phone is closed or not on workout screen."
//
// Three separate failures had to be fixed and each one alone is enough to make
// the alarm useless:
//   1. it counted ticks, so a backgrounded phone throttled it and it rang late
//   2. a frozen tab cannot ring at all, whatever it counts
//   3. navigator.vibrate() is ignored by Chrome from a hidden page
//
// The decisions live in pure functions precisely so they can be tested without
// waiting ninety seconds with a phone in a drawer.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { alarmPlan, alarmMode, ringRestAlarm, REST_VIBRATE } from "../../src/lib/restAlarm.ts";

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the countdown is derived, never counted", () => {
  const start = 1_700_000_000_000;
  const ends = start + 90_000;

  it("reads the time left from the clock", () => {
    assert.equal(alarmPlan(start, ends, false).secondsLeft, 90);
    assert.equal(alarmPlan(start + 30_000, ends, false).secondsLeft, 60);
    assert.equal(alarmPlan(start + 89_500, ends, false).secondsLeft, 1);
  });

  it("a page frozen past the end wakes up overdue and rings at once", () => {
    // THE bug. A ticking counter that misses sixty seconds comes back thinking
    // it has sixty seconds left. This comes back knowing it is late.
    const plan = alarmPlan(start + 150_000, ends, false);
    assert.equal(plan.secondsLeft, 0, "a frozen page resumed the countdown instead of finishing it");
    assert.ok(plan.fire, "an overdue timer did not ring on wake");
  });

  it("never shows a negative countdown", () => {
    assert.equal(alarmPlan(start + 200_000, ends, true).secondsLeft, 0);
  });

  it("rings exactly once, however long it stays overdue", () => {
    // Without this an overdue timer rings on every repaint — four times a
    // second, from a pocket.
    assert.ok(alarmPlan(ends, ends, false).fire);
    assert.ok(!alarmPlan(ends + 1_000, ends, true).fire);
    assert.ok(!alarmPlan(ends + 60_000, ends, true).fire);
  });

  it("does not ring early", () => {
    assert.ok(!alarmPlan(ends - 1, ends, false).fire);
  });
});

describe("how it rings depends on whether you are looking", () => {
  it("hidden goes to a notification", () => {
    // The whole point. Chrome ignores navigator.vibrate() from a hidden page
    // and audio from a frozen one is unreliable; the OS is the only thing that
    // can ring a locked phone.
    assert.equal(alarmMode(true, true), "notify");
  });

  it("visible stays in the app", () => {
    // No notification for something already on screen — that just leaves a
    // stale card in the shade after a set.
    assert.equal(alarmMode(false, true), "inapp");
  });

  it("falls back to the in-app tone when notifications are not available", () => {
    assert.equal(alarmMode(true, false), "inapp");
  });
});

describe("ringing does the right thing", () => {
  function spy() {
    const calls: string[] = [];
    let notified: Record<string, unknown> | null = null;
    let buzzed: number[] | null = null;
    return {
      calls,
      get notified() { return notified; },
      get buzzed() { return buzzed; },
      ding: () => calls.push("ding"),
      vibrate: (p: number[]) => { calls.push("vibrate"); buzzed = p; },
      notify: (t: string, o: Record<string, unknown>) => { calls.push("notify"); notified = { title: t, ...o }; },
    };
  }

  it("on screen: sound and buzz, no notification", () => {
    const s = spy();
    ringRestAlarm({ hidden: false, ding: s.ding, vibrate: s.vibrate, notify: s.notify });
    assert.deepEqual(s.calls, ["ding", "vibrate"]);
    assert.deepEqual(s.buzzed, REST_VIBRATE);
  });

  it("pocket: a notification carrying its own vibration", () => {
    const s = spy();
    ringRestAlarm({ hidden: true, ding: s.ding, vibrate: s.vibrate, notify: s.notify }, "Dumbbell Row");
    assert.deepEqual(s.calls, ["notify"]);
    assert.equal(s.notified?.silent, false, "a silent notification defeats the entire request");
    assert.deepEqual(s.notified?.vibrate, REST_VIBRATE);
    assert.equal(s.notified?.tag, "symmetry-rest", "without a tag every rest stacks another card in the shade");
    assert.match(String(s.notified?.body), /Dumbbell Row/, "the notification does not say what is next");
  });

  it("a failing vibrate never takes the sound down with it", () => {
    const calls: string[] = [];
    ringRestAlarm({
      hidden: false,
      ding: () => calls.push("ding"),
      vibrate: () => { throw new Error("no vibration motor"); },
    });
    assert.deepEqual(calls, ["ding"]);
  });

  it("the notification is tagged so the click handler can tell it apart", () => {
    const s = spy();
    ringRestAlarm({ hidden: true, ding: s.ding, notify: s.notify });
    assert.deepEqual((s.notified?.data as { kind?: string })?.kind, "rest");
  });
});

describe("the pieces that make it survive a locked screen", () => {
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));
  const alarm = strip(read("src/lib/restAlarm.ts"));
  const sw = strip(read("public/sw.js"));

  it("the timer holds the page awake for the length of the rest", () => {
    // A tab making sound is not frozen. Without this the timer never reaches
    // zero with the screen off, and none of the above matters.
    assert.match(logger, /holdPageAwake\(\)/, "the keepalive is gone — a backgrounded rest will not reach zero");
    assert.match(alarm, /loop = true/, "the keepalive track does not loop, so it stops holding after one pass");
  });

  it("the keepalive is released, and reference counted", () => {
    // A silent track left playing is a battery drain nobody can see or stop.
    assert.match(alarm, /keepAliveHolders/, "the keepalive is not reference counted — two timers and one release kills both");
    assert.match(alarm, /\.pause\(\)/, "nothing ever stops the keepalive");
  });

  it("the timer no longer decrements a counter", () => {
    assert.ok(
      !/setRemaining\(r => r - 1\)/.test(logger),
      "the rest timer is counting ticks again — a backgrounded phone throttles that and it will ring late",
    );
    assert.match(logger, /alarmPlan\(now, endsAt/, "the countdown is not derived from a wall-clock end time");
  });

  it("tapping the rest alarm does not throw you out of the workout", () => {
    // The default notification target is /messages. Navigating there mid-set,
    // from an alarm you tapped to dismiss, would lose the session.
    assert.match(sw, /const focusOnly = data\.kind === "rest";/, "the rest alarm is back to navigating on click");
    assert.match(sw, /if \(!focusOnly && "navigate" in client\)/, "clicking the rest alarm navigates away from the logger");
  });

  it("it says so when it cannot ring a locked phone", () => {
    // Without permission the alarm can only ring on screen. Better they learn
    // that before putting the phone down than after missing a set.
    assert.match(logger, /canRingLocked/, "nothing tells the client the alarm is limited to this screen");
  });
});
