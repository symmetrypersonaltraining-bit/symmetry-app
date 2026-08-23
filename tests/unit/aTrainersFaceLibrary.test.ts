// A TRAINER'S FACE LIBRARY.
//
// Dustin, 23 Aug: "can we create a library in all trainer apps to upload
// avatars to be cycled through? a section for each type: group msg bot, ai
// cards, celebrations, etc. needs to be coded so that you use those avatars in
// appropriate places w proper emotions."
//
// Most of this already existed. `trainers.bot_set` + 20260822c gave every
// trainer twenty named slots, and faceSrc() already asked for a face by
// emotional register rather than by filename. What was missing:
//
//   1. Many images per slot — the upload wrote `<slug>.webp` with upsert:true,
//      so a second upload REPLACED the first and nothing could be cycled.
//   2. Sections — twenty slots in one flat grid with no answer to "which first".
//   3. And a live fault: the promised fallback did not exist. setDir() picked
//      ONE directory for the whole set, so an uploaded set missing a slug
//      emitted a URL for a file that is not there and rendered a BROKEN IMAGE.
//      Both the upload screen and the walkthrough told trainers to upload a few
//      now and the rest later, which is precisely how you hit it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { faceSrc, uploadedSetName, type FaceLibrary } from "../../src/lib/ai/faces.ts";
import { FACE_SECTIONS, UPLOADABLE_SECTIONS, FACE_SLUGS, faceSlot } from "../../src/lib/ai/faceSlots.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const SET = uploadedSetName("t1");

// ── the fallback that was promised and never existed ───────────────────────

test("a slug the trainer has not uploaded falls back to a real file", () => {
  const lib: FaceLibrary = { neutral: ["https://x/neutral-1.webp"] };
  // Uploaded → theirs.
  assert.equal(faceSrc("neutral", SET, lib), "https://x/neutral-1.webp");
  // NOT uploaded → the stock file, which exists. Before this it was
  // `<supabase>/…/bots/u-t1/hydrate.webp` — a 404 and a broken image.
  assert.equal(faceSrc("hydrate", SET, lib), "/bots/hydrate.webp");
  assert.ok(existsSync(join(ROOT, "public/bots/hydrate.webp")), "the fallback target must exist");
});

test("every slot falls back to a file that is actually on disk", () => {
  const missing: string[] = [];
  for (const slug of FACE_SLUGS) {
    const src = faceSrc(slug as never, SET, {});
    assert.ok(src.startsWith("/bots/"), `${slug} did not fall back to the stock set: ${src}`);
    if (!existsSync(join(ROOT, "public", src))) missing.push(src);
  }
  assert.deepEqual(missing, [], "a half-finished library would render broken images for:\n" + missing.join("\n"));
});

test("a named set still falls back within its own folder", () => {
  // Stephanie's set is committed under /public/bots/steph — a slug she is
  // missing should reach for HER stock file, not the owner's.
  assert.equal(faceSrc("hydrate", "steph", {}), "/bots/steph/hydrate.webp");
});

test("no set at all is unchanged", () => {
  assert.equal(faceSrc("neutral", null, {}), "/bots/neutral.webp");
  assert.equal(faceSrc(undefined, null, {}), "/bots/neutral.webp");
  assert.equal(faceSrc("not-a-mood" as never, null, {}), "/coachbot.png");
});

// ── cycling ────────────────────────────────────────────────────────────────

test("several images in a slot are all reachable", () => {
  const lib: FaceLibrary = { neutral: ["a", "b", "c"] };
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(faceSrc("neutral", SET, lib, `seed-${i}`));
  assert.deepEqual([...seen].sort(), ["a", "b", "c"], "some uploads would never be shown");
});

test("the same seed always gives the same face", () => {
  const lib: FaceLibrary = { neutral: ["a", "b", "c", "d", "e"] };
  const once = faceSrc("neutral", SET, lib, "msg-42");
  for (let i = 0; i < 50; i++) {
    assert.equal(faceSrc("neutral", SET, lib, "msg-42"), once,
      "a face that changes between renders flickers, and mismatches on hydration");
  }
});

test("one image in a slot is that image, whatever the seed", () => {
  const lib: FaceLibrary = { pr: ["only.webp"] };
  assert.equal(faceSrc("pr", SET, lib, "x"), "only.webp");
  assert.equal(faceSrc("pr", SET, lib, "y"), "only.webp");
});

test("different slugs with the same seed do not lock to the same index", () => {
  // The seed is combined with the slug, so a card showing two faces on one day
  // does not show variant 0 of both every time.
  const lib: FaceLibrary = { neutral: ["n0", "n1", "n2", "n3"], happy: ["h0", "h1", "h2", "h3"] };
  const pairs = new Set<string>();
  for (let d = 0; d < 40; d++) {
    pairs.add(faceSrc("neutral", SET, lib, `day${d}`)!.slice(1) + faceSrc("happy", SET, lib, `day${d}`)!.slice(1));
  }
  assert.ok(pairs.size > 4, "the two slots move in lockstep");
});

// ── sections ───────────────────────────────────────────────────────────────

test("every uploadable slot appears in exactly one section", () => {
  const counts = new Map<string, number>();
  for (const sec of UPLOADABLE_SECTIONS) {
    for (const slug of sec.slugs) counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const missing = FACE_SLUGS.filter((s) => !counts.has(s));
  const twice = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s);
  assert.deepEqual(missing, [], "a slot nobody can find on the upload screen");
  assert.deepEqual(twice, [], "a slot that appears in two sections");
});

test("no section names something that is not a slot", () => {
  for (const sec of UPLOADABLE_SECTIONS) {
    for (const slug of sec.slugs) {
      assert.ok(faceSlot(slug), `${sec.id} lists "${slug}", which has no slot`);
    }
  }
});

test("the check-in ladder is shown whole, even the rung that is not a slot", () => {
  // `quiet` reuses the `thinking` art on purpose — someone who never logged has
  // done nothing to disappoint anyone — but the ladder reads wrong on screen
  // with the top rung missing.
  const checkins = FACE_SECTIONS.find((s) => s.id === "checkins")!;
  assert.ok(checkins.slugs.includes("quiet_note"), "the ladder is missing its third rung");
  const uploadable = UPLOADABLE_SECTIONS.find((s) => s.id === "checkins")!;
  assert.ok(!uploadable.slugs.includes("quiet_note"), "a non-slot reached the upload grid");
});

test("the sections a trainer should do first are marked", () => {
  const first = FACE_SECTIONS.filter((s) => s.priority === 1).map((s) => s.id);
  assert.deepEqual(first, ["everyday", "celebrations"]);
  for (const s of FACE_SECTIONS) assert.ok(s.blurb.length > 40, `${s.id} has no real explanation`);
});

// ── the upload screen ──────────────────────────────────────────────────────

test("an upload no longer overwrites the last one", () => {
  const ui = read("src/components/TrainerFaceSetCard.tsx");
  assert.ok(!/upsert: true/.test(ui), "upsert:true is back — a second upload replaces the first");
  assert.match(ui, /\$\{slug\}-\$\{Date\.now\(\)\}\.webp/, "uploads do not get a unique name");
  assert.match(ui, /from\("trainer_face_variants"\)[\s\S]{0,200}\.insert\(/, "the row the app reads is never written");
});

test("a failed row removes the file it could not register", () => {
  const ui = read("src/components/TrainerFaceSetCard.tsx");
  const i = ui.indexOf("if (rowErr || !ins)");
  assert.ok(i > 0, "an insert failure is not handled");
  assert.match(ui.slice(i, i + 260), /storage\.from\(BUCKET\)\.remove\(\[path\]\)/,
    "a file with no row is invisible forever and still counts against storage");
});

test("removing a variant deletes the row before the file", () => {
  const ui = read("src/components/TrainerFaceSetCard.tsx");
  const i = ui.indexOf("async function removeVariant");
  assert.ok(i > 0);
  const body = ui.slice(i, i + 900);
  const rowIdx = body.indexOf('from("trainer_face_variants").delete()');
  const fileIdx = body.indexOf("storage.from(BUCKET).remove");
  assert.ok(rowIdx > 0 && fileIdx > 0);
  assert.ok(rowIdx < fileIdx,
    "a deleted file with a surviving row is a broken image on a client's screen");
});

test("the screen is built from the sections, not one flat grid", () => {
  const ui = read("src/components/TrainerFaceSetCard.tsx");
  assert.match(ui, /UPLOADABLE_SECTIONS\.map/);
  assert.match(ui, /Add another/, "there is no way to put a second image in a slot");
  assert.match(ui, /aria-label=\{`Remove one \$\{slot\.label\} face`\}/, "removal is mouse-only");
});

// ── the migration ──────────────────────────────────────────────────────────

test("the table is scoped to the room, both ways", () => {
  const p = "supabase/migrations/20260823d_a_trainers_face_library.sql";
  assert.ok(existsSync(join(ROOT, p)));
  const sql = read(p);
  // A CLIENT must be able to read their own coach's faces or none of this shows.
  assert.match(sql, /trainer_id = public\.my_group_trainer_id\(\) or trainer_id = public\.my_trainer_id\(\)/);
  // Writing is your own library only.
  assert.match(sql, /using \(trainer_id = public\.my_trainer_id\(\)\)\s*\n\s*with check \(trainer_id = public\.my_trainer_id\(\)\)/);
  assert.match(sql, /unique \(trainer_id, storage_path\)/, "a retried upload could register one file twice");
});

test("the coach identity carries the library and defaults to empty", async () => {
  const { DEFAULT_COACH } = await import("../../src/lib/coachIdentity.ts");
  assert.deepEqual(DEFAULT_COACH.faces, {}, "a coach with no library must not inherit somebody else's");
  const src = read("src/lib/coachIdentity.ts");
  assert.match(src, /async function libraryFor/);
  assert.match(src, /catch \{\s*\n\s*return \{\};\s*\n\s*\}/,
    "a library that cannot be read should fall back to stock, not throw on every screen");
});
