// ============================================================================
// Unit tests — the new-trainer tutorial (src/lib/tutorial/script.ts).
//
// The tutorial is CONTENT, and the failure mode of content is not a crash. It
// is a step that tells a new trainer to tap a button which was renamed eight
// months ago, or a route that 404s, or a narration line that a speech
// synthesiser reads out as "slash A I slash". Nobody notices any of that until
// a real new trainer is sitting in front of it feeling stupid.
//
// So these tests check the things a reviewer will not: that every route named
// in the walkthrough actually exists as a page in this repo, that narration is
// speakable, that nothing claims a person's name on an instance-neutral app,
// and that "preview" is used for the one feature that genuinely is not built.
//
// Pure node, no browser, no network.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  TUTORIAL,
  SETUP_CHECKS,
  allSteps,
  stepCount,
} from "../../src/lib/tutorial/script.ts";

const ROOT = process.cwd();

/** Does this route resolve to a real page.tsx under src/app? */
function routeExists(route: string): boolean {
  const rel = route.replace(/^\//, "");
  // Route groups are directories in parentheses that do not appear in the URL,
  // so a route may live under any of them.
  const groups = fs
    .readdirSync(path.join(ROOT, "src/app"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("("))
    .map((e) => e.name);
  const candidates = [
    path.join(ROOT, "src/app", rel, "page.tsx"),
    ...groups.map((g) => path.join(ROOT, "src/app", g, rel, "page.tsx")),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

describe("tutorial — structure", () => {
  it("has chapters, and every chapter has steps", () => {
    assert.ok(TUTORIAL.length >= 10, `only ${TUTORIAL.length} chapters — the walkthrough is meant to cover the whole app`);
    for (const c of TUTORIAL) {
      assert.ok(c.steps.length > 0, `chapter ${c.id} has no steps`);
      assert.ok(c.blurb.length > 0, `chapter ${c.id} has no blurb`);
    }
  });

  it("every id is unique", () => {
    const ids = allSteps().map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate step id — the player stores progress by id, so a duplicate makes one step mark the other as read");
    const cids = TUTORIAL.map((c) => c.id);
    assert.equal(new Set(cids).size, cids.length, "duplicate chapter id");
  });

  it("stepCount agrees with allSteps", () => {
    assert.equal(stepCount(), allSteps().length);
  });
});

describe("tutorial — every route it sends you to is real", () => {
  it("no step links to a page that does not exist", () => {
    const bad = allSteps()
      .filter((s) => s.route)
      .filter((s) => !routeExists(s.route!))
      .map((s) => `${s.id} → ${s.route}`);
    assert.deepEqual(bad, [], `steps pointing at routes with no page.tsx:\n  ${bad.join("\n  ")}`);
  });

  it("no checklist item links to a page that does not exist", () => {
    const bad = SETUP_CHECKS.filter((c) => !routeExists(c.route)).map((c) => `${c.key} → ${c.route}`);
    assert.deepEqual(bad, [], `checklist items pointing nowhere:\n  ${bad.join("\n  ")}`);
  });

  it("a step with a route has a label for the button", () => {
    for (const s of allSteps()) {
      if (s.route) assert.ok(s.routeLabel, `${s.id} has a route but no routeLabel`);
    }
  });
});

describe("tutorial — the narration is speakable", () => {
  const steps = allSteps();

  it("every step has narration and body", () => {
    for (const s of steps) {
      assert.ok(s.narration.trim().length > 0, `${s.id} has no narration`);
      assert.ok(s.body.length > 0, `${s.id} has no body`);
      assert.ok(s.title.trim().length > 0, `${s.id} has no title`);
    }
  });

  it("narration contains nothing a speech synthesiser mangles", () => {
    // Each of these is read aloud literally and sounds wrong: a slash becomes
    // "slash", parentheses vanish mid-sentence, "e.g." becomes "e g", and a
    // bullet is read as nothing at all leaving two sentences fused.
    const banned: [RegExp, string][] = [
      [/\//, "a slash — write it as a word"],
      [/[()]/, "parentheses — say it in a sentence instead"],
      [/\be\.g\.|\bi\.e\./i, "e.g. or i.e. — write 'for example'"],
      [/[•·]|^\s*[-*]\s/m, "a bullet — narration is spoken, not listed"],
      [/\betc\.?\b/i, "etc — name the last item instead"],
      [/&/, "an ampersand — write 'and'"],
      [/\d+%/, "a percent sign — write 'per cent' or reword"],
    ];
    const problems: string[] = [];
    for (const s of steps) {
      for (const [re, why] of banned) {
        if (re.test(s.narration)) problems.push(`${s.id}: ${why}`);
      }
    }
    assert.deepEqual(problems, [], `narration that will not read aloud cleanly:\n  ${problems.join("\n  ")}`);
  });

  it("no narration line is long enough to lose somebody", () => {
    const long = steps.filter((s) => s.narration.length > 900).map((s) => `${s.id} (${s.narration.length} chars)`);
    assert.deepEqual(long, [], `narration too long to listen to in one go:\n  ${long.join("\n  ")}`);
  });
});

describe("tutorial — instance neutrality", () => {
  it("names no person and no studio", () => {
    // The whole point is that a second trainer runs this on their own clients
    // and every word still fits. The moment it says a name it stops being a
    // tutorial and becomes somebody's induction.
    const names = /\b(dustin|gautreaux|stephanie|steph|symmetry|sevens|everfit|dylan|robert|claudine)\b/i;
    const hits: string[] = [];
    for (const s of allSteps()) {
      const blob = [s.title, s.narration, ...s.body].join(" ");
      const m = blob.match(names);
      if (m) hits.push(`${s.id}: "${m[0]}"`);
    }
    for (const c of TUTORIAL) {
      const m = [c.title, c.blurb].join(" ").match(names);
      if (m) hits.push(`chapter ${c.id}: "${m[0]}"`);
    }
    assert.deepEqual(hits, [], `the tutorial names somebody:\n  ${hits.join("\n  ")}`);
  });

  it("refers to the instance owner by role, not by name", () => {
    const mentionsOwner = allSteps().some((s) => /\bthe owner\b/i.test([s.narration, ...s.body].join(" ")));
    assert.ok(mentionsOwner, "the walkthrough never explains the owner's role — a new trainer needs to know who can see everything");
  });
});

describe("tutorial — honesty about what exists", () => {
  it("the connected-Claude-account step is marked preview, not live", () => {
    const step = allSteps().find((s) => s.id === "ai-own-account");
    assert.ok(step, "the step about using your own Claude account is missing");
    assert.equal(
      step!.status,
      "preview",
      "per-trainer AI billing is designed and not built. Marking it live puts a new trainer on a hunt for a button that does not exist — and the first thing they will conclude is that they are the problem.",
    );
  });

  it("nothing else is silently preview", () => {
    const previews = allSteps().filter((s) => s.status === "preview").map((s) => s.id);
    assert.deepEqual(previews, ["ai-own-account"], `unexpected preview steps: ${previews.join(", ")} — either build it or say why here`);
  });

  it("says out loud that a Claude account is optional", () => {
    const blob = allSteps().map((s) => [s.narration, ...s.body].join(" ")).join(" ");
    assert.match(
      blob,
      /do not need one|not a requirement/i,
      "a trainer who does not want a paid Claude account must be told, in the tutorial, that everything still works",
    );
  });

  it("warns about what is actually rough, and does not invent roughness", () => {
    const blob = allSteps().map((s) => [s.narration, ...s.body].join(" ")).join(" ").toLowerCase();

    // This used to demand warnings about THREE broken controls. On 22 Aug two
    // of them were fixed and the third turned out never to have existed, so
    // the warnings themselves became the inaccuracy:
    //
    //   New Program button   had no onClick at all; now opens the assistant,
    //                        which is how programmes actually get built
    //   payment reminders    a toggle that saved nothing, for an automatic
    //                        send that does not exist; replaced with copy
    //                        saying reminders go out when you approve them
    //   "the weekly digest"  no such switch is anywhere in the codebase
    //
    // The rule this test exists for is unchanged and is the one below: the
    // tutorial must be honest about rough edges. What changed is that being
    // honest now means saying LESS. A tutorial that tells a new trainer three
    // things are broken when one is costs exactly what the original silence
    // cost — they stop trusting it, and they stop reporting real faults
    // because they assume it is another known one.
    assert.match(blob, /back to home|bounces you to home/i,
      "the Calendar-to-Home redirect is the one real rough edge left and is not mentioned");

    for (const [claim, what] of [
      [/new program button does nothing/i, "the New Program button, which now works"],
      [/do not (actually )?save|they do not save/i, "settings toggles that no longer exist"],
      [/weekly digest/i, "a weekly digest switch that is nowhere in the app"],
    ] as [RegExp, string][]) {
      assert.ok(!claim.test(blob),
        `the tutorial still warns about ${what} — a warning that is no longer true ` +
        `teaches a new trainer to distrust the tutorial`);
    }
  });
});

describe("tutorial — the setup checklist", () => {
  it("every check key used by a step exists in SETUP_CHECKS", () => {
    const keys = new Set(SETUP_CHECKS.map((c) => c.key));
    for (const s of allSteps()) {
      if (s.check) assert.ok(keys.has(s.check), `${s.id} references unknown check "${s.check}"`);
    }
  });

  it("every check has a hint that says why it matters", () => {
    for (const c of SETUP_CHECKS) {
      assert.ok(c.label.length > 0, `${c.key} has no label`);
      assert.ok(c.hint.length > 20, `${c.key} has a hint too thin to be useful`);
    }
  });

  it("covers the things that actually stop a trainer working", () => {
    const keys = SETUP_CHECKS.map((c) => c.key);
    for (const must of ["pay", "client", "program"]) {
      assert.ok(keys.includes(must as never), `the checklist does not check "${must}"`);
    }
  });
});

describe("tutorial — voice is swappable for a recording", () => {
  it("every step carries an audioUrl slot, null until recorded", () => {
    // This is what makes recording the narration in a real voice a content
    // change rather than a rewrite: set the URL, the player prefers it.
    const missing = allSteps().filter((s) => !("audioUrl" in s)).map((s) => s.id);
    assert.deepEqual(missing, [], `steps with no audioUrl slot: ${missing.join(", ")}`);
  });
});
