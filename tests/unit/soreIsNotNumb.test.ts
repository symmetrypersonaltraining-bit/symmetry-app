import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { triageBlock, triageSymptoms, type Triage } from "../../src/lib/ai/symptomTriage";
import { SYMPTOM, isSymptomNote } from "../../src/lib/trainingNoteRouting";

// The one-tier list in trainingNoteRouting has worked since 15 Aug: it is what
// decides whether a client's note buzzes Dustin's phone, and it is why
// Claudine's "left knee has been feeling uncomfortable" reached him on 12 Aug.
//
// But it treats "sore" and "numb" identically, because for ROUTING they are
// identical — both mean send it to him. For a coach talking to a client they
// are opposites. Sore legs are expected and get coached. A numb hand is a
// refer-out: not diagnosed, not worked around, no exercises offered.
//
// Dustin, 5 Sep, on what happens then: (a) — the coach OFFERS to send it and
// the client chooses. "but make sure there is a route built in for me to
// respond to them quickly."

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const t = (tier: Triage["tier"], ...matched: string[]): Triage => ({ tier, matched });

test("a red flag is never coached, worked around, or guessed at", () => {
  const b = triageBlock(t("red_flag", "numbness"));
  assert.match(b, /STOP/);
  assert.match(b, /do not work around/i);
  assert.match(b, /Not a modification, not a lighter version/);
  assert.match(b, /Do not diagnose it and do not\s+speculate/, "the ban on speculating about what it might be is gone");
  assert.match(b, /Do not send it yourself; they send it/, "it now sends on its own — Dustin chose (a), the client sends");
  assert.match(b, /want me to send this to Dustin/i, "it no longer offers to send, so a red flag can end in silence");
});

test("an ordinary symptom is a question first, then an actual answer", () => {
  const b = triageBlock(t("ordinary", "sore"));
  assert.match(b, /your reply is a QUESTION, not an\s+answer/);
  assert.match(b, /Not three/, "the cap is gone and interrogation is its own failure");
  assert.match(
    b,
    /Do not ask and then hand it over anyway/,
    "nothing stops it asking two questions and then punting — which is worse than not asking",
  );
  assert.match(b, /do not ask again/i, "it can now re-ask something they already answered");
});

test("a message with nothing in it gets no block at all", () => {
  assert.equal(triageBlock(t("none")), "", "an empty triage now injects text into every ordinary turn");
});

test("the red tier and the ordinary tier stay different things", () => {
  const red = triageBlock(t("red_flag", "chest pain"));
  const ord = triageBlock(t("ordinary", "sore"));
  assert.ok(!/STOP/.test(ord), "an ordinary symptom now stops the coach — that is the Bobbie Page failure again");
  assert.ok(!/your reply is a QUESTION/.test(red), "a red flag now asks clarifying questions instead of handing it over");
});

test("the vocabulary lives in the database, not in the prompt", () => {
  const src = read("src/lib/ai/symptomTriage.ts");
  assert.match(src, /from\("symptom_flags"\)/, "the list moved back into code — a safety list in a prompt is one a model can forget");
  assert.match(
    src,
    /if \(rows\.length\) CACHE =/,
    "an empty read is cached again, which disarms the red-flag list for ten minutes at exactly the wrong moment",
  );
});

test("the matching rule is the same one that already decides his phone buzzes", () => {
  // Two different answers to "does this mention pain" is how the phone buzzes
  // for something the coach did not react to, or the reverse.
  const src = read("src/lib/ai/symptomTriage.ts");
  assert.match(src, /\(\^\|\[\^a-z\]\)/, "the word-boundary rule diverged from isSymptomNote");
  // And the old list still works, unchanged.
  assert.ok(isSymptomNote("my knee is sore"), "the original routing test broke");
  assert.ok(SYMPTOM.includes("numb"), "the routing vocabulary lost a word this depends on");
});

test("an escalation reaches him now, and lands in the thread", () => {
  const esc = read("src/app/api/coach-escalate/route.ts");
  assert.match(esc, /sendPushToUser\(/, "the escalation pushes nothing again — he finds out when he next looks");
  assert.match(esc, /url: `\/messages\?client=\$\{me\.id\}`/, "the push no longer deep-links to their thread, which is the fast route he asked for");
  assert.match(esc, /const triage = await triageSymptoms/, "urgency is no longer re-derived on the server");
  assert.match(
    esc,
    /a flag a browser can set is a flag anything can set/,
    "the note explaining why urgency is not trusted from the body is gone",
  );
  assert.match(esc, /urgent,/, "the message is no longer marked urgent");
});

// ── THE FAILURE MODE THAT MATTERS ──────────────────────────────────────────
//
// Found by running the triage with no database reachable: every message came
// back "none", including "my hand went numb". A safety gate whose failure mode
// is SILENTLY OFF is worse than no gate — the prompt, the escalation and the
// urgent push all then behave as though the message were about a sore quad.
//
// These run with no service key, which is the sandbox's normal state, so they
// exercise the fallback path every time rather than only when something breaks.

test("a red flag still fires when the table cannot be read", async () => {
  for (const m of [
    "my hand went numb during the press",
    "I get pins and needles down my arm",
    "felt a bit lightheaded on the treadmill",
    "my knee gave out on the stairs",
    "chest pain when I walk uphill",
  ]) {
    const r = await triageSymptoms(m);
    assert.equal(r.tier, "red_flag", `"${m}" was not caught by the compiled floor`);
    assert.ok(r.matched.length, `"${m}" matched nothing`);
  }
});

test("the floor does not fire on ordinary language", async () => {
  // A floor that catches everything is a gate that stops every conversation,
  // which is the Bobbie Page failure wearing a safety hat.
  for (const m of [
    "can I swap leg press for hack squat",
    "what did I press last time",
    "my legs are really sore from squats",
    "can we move friday to saturday",
  ]) {
    const r = await triageSymptoms(m);
    assert.notEqual(r.tier, "red_flag", `"${m}" was wrongly treated as a refer-out`);
  }
});
