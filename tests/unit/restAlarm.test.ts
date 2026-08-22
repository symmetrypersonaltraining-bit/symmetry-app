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
import { alarmPlan, alarmWavDataUri, REST_VIBRATE } from "../../src/lib/restAlarm.ts";

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

describe("the alarm does not wear the UI's preferences", () => {
  const alarm = strip(read("src/lib/restAlarm.ts"));
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));

  // THE bug behind "1 tiny tiny chirp... its not vibrating either".
  //
  // The first version rang through fx(), the app's tap-feedback layer.
  // soundEnabled() defaults to FALSE — it needs an explicit opt-in in Settings
  // — so on any phone where nobody had turned Sounds on, the alarm played
  // nothing at all. And hapticsEnabled(), a switch about whether BUTTONS buzz,
  // could silence a rest timer.
  it("the rest timer does not ring through fx()", () => {
    assert.ok(
      !/fx\("rest/.test(logger),
      'the rest alarm is back on fx(). soundEnabled() defaults to false, so that makes it silent for anyone who has not opted in to button chirps.',
    );
    assert.ok(
      !/soundEnabled|hapticsEnabled/.test(alarm),
      "the alarm is reading the UI sound or haptics preference. Those govern tap feedback; an alarm the user started does not ask them for permission to ring.",
    );
  });

  it("it plays at full volume, with no quiet setting of its own", () => {
    assert.match(alarm, /el\.volume = 1;/, "the alarm no longer plays at full volume");
  });
});

describe("it is heard with the phone on vibrate", () => {
  const alarm = strip(read("src/lib/restAlarm.ts"));

  // "can it go by media volume so when my phone is on vibrate it still works?"
  // An <audio> element rides Android's media stream, which is independent of
  // the ringer. A notification's own sound follows the ringer, so on vibrate it
  // makes no noise — which is why the audio fires whether or not the page is
  // hidden, and the notification is additional rather than instead.
  it("the sound is an audio element, not a notification sound", () => {
    assert.match(alarm, /new Audio\(alarmSource\(\)\)/, "the alarm no longer plays its own audio");
  });

  it("the audio plays whether or not the page is hidden", () => {
    const playAt = alarm.indexOf("el.play()");
    const hiddenBranch = alarm.indexOf("if (hidden)");
    assert.ok(playAt > -1, "nothing plays the alarm audio");
    assert.ok(hiddenBranch > -1, "the hidden branch is gone — the notification will never fire");
    assert.ok(
      playAt < hiddenBranch,
      "the audio moved inside the visibility branch. Off screen it would then rely on the notification sound, which follows the ringer and is silent on vibrate.",
    );
  });

  it("the notification is not silent either", () => {
    assert.match(alarm, /silent: false/, "the notification went silent, so a locked phone gets nothing but a vibration");
    assert.match(alarm, /vibrate: REST_VIBRATE/, "the notification carries no vibration pattern");
  });
});

describe("the sound itself", () => {
  it("is more than a chirp", () => {
    // "that chirp is way too weak." Six beeps over about a second and a half,
    // near full scale — not one 0.22s tone at a fifth of amplitude.
    const uri = alarmWavDataUri();
    assert.match(uri, /^data:audio\/wav;base64,/);
    const bytes = Buffer.from(uri.split(",")[1], "base64");
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", "not a valid WAV");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
    const rate = bytes.readUInt32LE(24);
    const dataBytes = bytes.readUInt32LE(40);
    const seconds = dataBytes / 2 / rate;
    assert.ok(seconds > 1.2, `the alarm is only ${seconds.toFixed(2)}s long — that is a chirp again`);
  });

  it("peaks near full scale", () => {
    const bytes = Buffer.from(alarmWavDataUri().split(",")[1], "base64");
    let peak = 0;
    for (let i = 44; i < bytes.length - 1; i += 2) peak = Math.max(peak, Math.abs(bytes.readInt16LE(i)));
    assert.ok(peak > 28000, `peak sample is ${peak} of 32767 — the alarm is quiet by construction`);
  });

  it("fades its edges so it does not click", () => {
    // A square wave starting at full amplitude clicks, and on a phone speaker a
    // click reads as distortion rather than volume.
    const bytes = Buffer.from(alarmWavDataUri().split(",")[1], "base64");
    const first = Math.abs(bytes.readInt16LE(44));
    assert.ok(first < 4000, `the waveform starts at ${first} — that is a click, not a fade`);
  });
});

describe("arming happens while a gesture is in hand", () => {
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));
  const alarm = strip(read("src/lib/restAlarm.ts"));

  it("the element is created when the rest starts, not when it ends", () => {
    // Autoplay policy: a fresh Audio created and played with no user gesture
    // can be refused outright. Starting a rest IS a gesture — you tapped a set.
    assert.match(logger, /alarm\.current = armRestAlarm\(\)/, "the alarm is not armed on mount any more");
    assert.match(alarm, /export function armRestAlarm/, "arming is gone; the alarm will be created at ring time and may be blocked");
  });

  it("the overlay waits for the sound before closing", () => {
    // Closing instantly releases the audio element mid-ring, which is its own
    // way of producing a "tiny chirp".
    assert.match(logger, /window\.setTimeout\(\(\) => onDone\(\), 1800\)/, "the rest overlay closes before the alarm has finished");
  });

  it("there is a way to hear it without doing a set", () => {
    const settings = strip(read("src/app/(app)/settings/SettingsClient.tsx"));
    assert.match(settings, /testRestAlarm\(\)/, "the test button is gone — the only way to check the alarm is to train and wait");
  });
});

describe("the pieces that make it survive a locked screen", () => {
  const logger = strip(read("src/app/(app)/workout/[dayId]/WorkoutLogger.tsx"));
  const alarm = strip(read("src/lib/restAlarm.ts"));
  const sw = strip(read("public/sw.js"));

  it("the timer holds the page awake for the length of the rest", () => {
    // A tab making sound is not frozen. Without this the timer never reaches
    // zero with the screen off, and none of the above matters. armRestAlarm()
    // takes the hold, so arming and keeping awake cannot get separated.
    assert.match(alarm, /const releaseAwake = holdPageAwake\(\);/, "arming no longer holds the page awake — a backgrounded rest will not reach zero");
    assert.match(logger, /armRestAlarm\(\)/, "the timer never arms, so nothing holds it awake");
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
