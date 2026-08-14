import test from "node:test";
import assert from "node:assert/strict";

/**
 * THE MIC HAS TO WORK ON THE PHONE, NOT IN THE BROWSER I TESTED IT IN.
 *
 * Every other test in this repo reads source off disk. This one RUNS
 * startDictation, because the bug it is here to prevent is invisible to source
 * inspection and invisible to a desktop browser:
 *
 *   NutritionV3Client's "Say it out loud" built `webkitSpeechRecognition`
 *   itself. That API does not exist in the Capacitor WebView — the shell
 *   Dustin's ~35 clients actually run — so voice logging fell through to
 *   "isn't supported on this device" on every real phone, and worked
 *   perfectly on the laptop of anyone checking whether it worked.
 *
 * The property is engine SELECTION: inside the shell, dictation must go to the
 * native plugin; in a plain browser, to the Web Speech API; with neither, it
 * must say so rather than fail silently. A mic that quietly does nothing is
 * indistinguishable from a broken one, which is how this stayed broken.
 *
 * These run against a fabricated `window`, so they test the decision the real
 * code makes, on both platforms, from a machine that is neither.
 */

type Win = Record<string, unknown>;

async function withWindow<T>(w: Win, fn: (start: typeof import("../../src/lib/dictation").startDictation) => Promise<T>): Promise<T> {
  const g = globalThis as unknown as { window?: Win };
  const had = "window" in g;
  const prev = g.window;
  g.window = w;
  try {
    // Fresh import per case: the module reads `window` at call time, but a
    // cached module across cases makes a false pass easy to write by accident.
    const mod = await import(`../../src/lib/dictation?case=${Math.random()}`);
    return await fn(mod.startDictation);
  } finally {
    if (had) g.window = prev;
    else delete g.window;
  }
}

/** A browser that has Web Speech. Records whether it was constructed. */
function browserWindow(): Win & { started: () => number } {
  let starts = 0;
  class FakeSR {
    lang = "";
    interimResults = false;
    maxAlternatives = 1;
    continuous = false;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onresult: ((e: unknown) => void) | null = null;
    start() {
      starts++;
      this.onstart?.();
      this.onresult?.({ results: { 0: { 0: { transcript: "eight ounces of chicken" } } } });
      this.onend?.();
    }
    stop() { /* noop */ }
  }
  const w: Win = { webkitSpeechRecognition: FakeSR };
  return Object.assign(w, { started: () => starts });
}

test("inside the native shell it uses the phone's recogniser, NOT the browser API", async () => {
  let nativeStarts = 0;
  let browserConstructed = false;
  class NeverUseMe { constructor() { browserConstructed = true; } start() { /* noop */ } stop() { /* noop */ } }

  const heard: string[] = [];
  await withWindow(
    {
      // A Capacitor WebView advertises BOTH: the bridge, and (uselessly) nothing
      // for speech. We deliberately also expose a browser API here — if the
      // implementation ever prefers it, this test fails, which is the bug.
      webkitSpeechRecognition: NeverUseMe,
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          SpeechRecognition: {
            available: async () => ({ available: true }),
            requestPermissions: async () => ({}),
            start: async () => { nativeStarts++; return { matches: ["eight ounces of chicken"] }; },
            stop: async () => {},
          },
        },
      },
    },
    async (startDictation) => {
      startDictation({ onResult: (t) => heard.push(t) });
      // The native path is async by construction (permissions, then start).
      await new Promise((r) => setTimeout(r, 30));
    },
  );

  assert.equal(nativeStarts, 1, "the native speech plugin was never started inside the shell");
  assert.equal(
    browserConstructed,
    false,
    "dictation reached for webkitSpeechRecognition while running inside the Capacitor " +
      "WebView. That API does not exist there on a real device — this is exactly the bug " +
      "that made voice logging dead on every client's phone while passing on a laptop.",
  );
  assert.deepEqual(heard, ["eight ounces of chicken"], "the transcript never reached the caller");
});

test("in a plain browser it falls back to Web Speech and delivers the transcript", async () => {
  const heard: string[] = [];
  let started = false;
  let ended = false;
  const w = browserWindow();
  await withWindow(w, async (startDictation) => {
    startDictation({
      onResult: (t) => heard.push(t),
      onStart: () => { started = true; },
      onEnd: () => { ended = true; },
      onUnavailable: () => assert.fail("reported unavailable in a browser that has Web Speech"),
    });
    await new Promise((r) => setTimeout(r, 10));
  });

  assert.equal(w.started(), 1, "the browser recogniser was never started");
  assert.ok(started && ended, "onStart/onEnd never fired — the button can never leave its 'listening' state");
  assert.deepEqual(heard, ["eight ounces of chicken"]);
});

test("no engine at all reports unavailable — it does not throw and does not go quiet", async () => {
  // Both halves matter. A throw takes the screen down; silence is a mic that
  // looks broken with nothing to tell the person.
  let reason = "";
  let threw = false;
  await withWindow({}, async (startDictation) => {
    try {
      const h = startDictation({ onResult: () => assert.fail("produced text with no engine"), onUnavailable: (r) => { reason = r; } });
      assert.equal(typeof h.stop, "function", "startDictation must always return a stoppable handle");
      h.stop();
    } catch {
      threw = true;
    }
  });
  assert.equal(threw, false, "startDictation threw instead of reporting unavailable");
  assert.match(reason, /no-engine/, `expected a specific reason, got "${reason}"`);
});

test("a denied microphone is reported as denied, not as 'unsupported'", async () => {
  // These need OPPOSITE things from the person holding the phone: one is a
  // settings toggle, the other is "type it instead". One shared message is how
  // a fixable permission prompt reads as a broken feature.
  let reason = "";
  const w = browserWindow();
  (w as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = class {
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onresult: ((e: unknown) => void) | null = null;
    lang = ""; interimResults = false; maxAlternatives = 1; continuous = false;
    start() { this.onerror?.({ error: "not-allowed" }); }
    stop() { /* noop */ }
  };
  await withWindow(w, async (startDictation) => {
    startDictation({ onResult: () => {}, onUnavailable: (r) => { reason = r; } });
    await new Promise((r) => setTimeout(r, 10));
  });
  assert.match(
    reason,
    /not-allowed/,
    `the real error code is swallowed — got "${reason}". MicButton keys its permission ` +
      `message off this string; without it, a denied mic tells people their device is ` +
      `unsupported and they stop trying.`,
  );
});

test("a pause is not a failure", async () => {
  // "no-speech" fires whenever somebody taps the mic and thinks for a second.
  // Reporting it makes a perfectly working mic pop an error nearly every use —
  // and once a mic has cried wolf, nobody reports the real breakage.
  let flagged = "";
  const w = browserWindow();
  (w as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = class {
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onresult: ((e: unknown) => void) | null = null;
    lang = ""; interimResults = false; maxAlternatives = 1; continuous = false;
    start() { this.onerror?.({ error: "no-speech" }); }
    stop() { /* noop */ }
  };
  await withWindow(w, async (startDictation) => {
    startDictation({ onResult: () => {}, onUnavailable: (r) => { flagged = r; } });
    await new Promise((r) => setTimeout(r, 10));
  });
  assert.equal(flagged, "", `a silent pause was reported to the user as "${flagged}"`);
});

test("stop() after the caller has moved on cannot deliver text into a closed sheet", async () => {
  // Android allows ONE recogniser. A sheet closed mid-dictation that keeps its
  // recogniser both holds the slot (breaking the NEXT mic anywhere in the app)
  // and can fire onResult into unmounted state.
  const heard: string[] = [];
  let nativeStops = 0;
  await withWindow(
    {
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          SpeechRecognition: {
            available: async () => ({ available: true }),
            requestPermissions: async () => ({}),
            start: async () => { await new Promise((r) => setTimeout(r, 25)); return { matches: ["too late"] }; },
            stop: async () => { nativeStops++; },
          },
        },
      },
    },
    async (startDictation) => {
      const h = startDictation({ onResult: (t) => heard.push(t) });
      h.stop(); // the sheet closed
      await new Promise((r) => setTimeout(r, 60));
    },
  );

  assert.ok(nativeStops > 0, "stop() never released the native recogniser — Android has only one, so the next mic in the app silently fails to start");
  assert.deepEqual(heard, [], "a stopped recogniser still delivered its transcript to a caller that had gone away");
});
