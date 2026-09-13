import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// The module only touches `window` inside its functions, so a static import is
// safe before the stub below exists.
import {
  saveOffPlanDraft, readOffPlanDraft, clearOffPlanDraft, DRAFT_TTL_MS,
} from "../../src/lib/nutrition/offPlanDraft";

/**
 * Dustin, 13 Sep 2026, after the 12 Sep fix shipped: *"off plan photo still
 * drops off."*
 *
 * That fix stopped router.refresh() tearing the sheet down, which was real and
 * is still fixed. What it assumed is that the React tree survives the camera at
 * all — and on Android it frequently does not. The OS reclaims the WebView
 * while the camera app is in front and the PWA is RELOADED on return. There is
 * no component identity to preserve when there is no component.
 *
 * So the sheet's work is mirrored out of React. These run the store directly;
 * a DOM is stubbed because sessionStorage is the whole point of the module.
 */

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

function freshWindow() {
  (globalThis as { window?: unknown }).window = { sessionStorage: new MemoryStorage() };
}
freshWindow();



const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

test("a photo taken and then analysed comes back after the page dies", () => {
  freshWindow();
  saveOffPlanDraft({
    mode: "photo",
    text: "",
    photo: PHOTO,
    est: { desc: "Cheesecake slice", k: 370, p: 6, c: 40, f: 21, items: [{ n: "Cheesecake", a: "1 slice" }] },
  });
  const back = readOffPlanDraft()!;
  assert.equal(back.mode, "photo", "not the menu — that is the whole report");
  assert.equal(back.photo, PHOTO);
  assert.equal((back.est as { desc: string }).desc, "Cheesecake slice");
});

test("a photo taken but not yet analysed still comes back", () => {
  // The page is likeliest to die during the request. Coming back to the photo
  // and a retry beats coming back to an empty sheet.
  freshWindow();
  saveOffPlanDraft({ mode: "photo", text: "", photo: PHOTO, est: null });
  const back = readOffPlanDraft()!;
  assert.equal(back.mode, "photo");
  assert.equal(back.photo, PHOTO);
  assert.equal(back.est, null);
});

test("typed text in progress is kept too", () => {
  freshWindow();
  saveOffPlanDraft({ mode: "typed", text: "chipotle bowl, double chicken", photo: null, est: null });
  assert.equal(readOffPlanDraft()!.text, "chipotle bowl, double chicken");
});

test("an untouched sheet stores nothing", () => {
  freshWindow();
  saveOffPlanDraft({ mode: "pick", text: "", photo: null, est: null });
  assert.equal(readOffPlanDraft(), null, "sitting on the menu is not work in progress");
});

test("a draft from half an hour ago is not offered", () => {
  freshWindow();
  saveOffPlanDraft({ mode: "photo", text: "", photo: PHOTO, est: null });
  const raw = JSON.parse((globalThis as { window: { sessionStorage: MemoryStorage } }).window.sessionStorage.getItem("symmetry_offplan_draft")!);
  raw.at = Date.now() - DRAFT_TTL_MS - 1000;
  (globalThis as { window: { sessionStorage: MemoryStorage } }).window.sessionStorage.setItem("symmetry_offplan_draft", JSON.stringify(raw));
  assert.equal(readOffPlanDraft(), null, "it should not offer to log yesterday's snack");
});

test("an enormous photo is dropped rather than failing the save", () => {
  freshWindow();
  saveOffPlanDraft({ mode: "photo", text: "kept", photo: "d".repeat(3_000_001), est: null });
  const back = readOffPlanDraft()!;
  assert.equal(back.photo, null, "the photo goes");
  assert.equal(back.text, "kept", "the rest of the draft does not");
});

test("storage that throws never breaks logging a meal", () => {
  (globalThis as { window?: unknown }).window = {
    sessionStorage: {
      getItem() { throw new Error("private window"); },
      setItem() { throw new Error("quota"); },
      removeItem() { throw new Error("nope"); },
    },
  };
  assert.doesNotThrow(() => saveOffPlanDraft({ mode: "photo", text: "", photo: PHOTO, est: null }));
  assert.equal(readOffPlanDraft(), null);
  assert.doesNotThrow(() => clearOffPlanDraft());
});

test("garbage in storage is ignored, not thrown", () => {
  freshWindow();
  (globalThis as { window: { sessionStorage: MemoryStorage } }).window.sessionStorage.setItem("symmetry_offplan_draft", "{not json");
  assert.equal(readOffPlanDraft(), null);
});

/** And the screen has to actually use it. */
const SCREEN = readFileSync(join(process.cwd(), "src/app/(app)/nutrition/v3/NutritionV3Client.tsx"), "utf8");

test("the sheet reads the draft on mount and mirrors every change back", () => {
  assert.match(SCREEN, /const d = readOffPlanDraft\(\);/, "read back on mount");
  assert.match(SCREEN, /saveOffPlanDraft\(\{ mode, text, photo: photoData, est \}\)/, "and mirrored");
  assert.match(SCREEN, /if \(!restored\.current\) return;/,
    "the first render must not wipe the draft it is about to read");
});

test("the photo is kept BEFORE the analysis, not after it", () => {
  const setAt = SCREEN.indexOf("setPhotoData(`data:image/jpeg;base64,${base64}`)");
  const fetchAt = SCREEN.indexOf('fetch("/api/analyze-meal-photo"');
  assert.ok(setAt > 0 && setAt < fetchAt, "the page is likeliest to die during the request");
});

test("the draft is cleared when it is committed or abandoned", () => {
  assert.match(SCREEN, /clearOffPlanDraft\(\);\n\s*await onCommit\(/, "logged");
  assert.match(SCREEN, /onClose=\{\(\) => \{ clearOffPlanDraft\(\); onClose\(\); \}\}/, "closed");
});

test("a restored draft can still upload its photo, having no File", () => {
  assert.match(SCREEN, /if \(photoFile\) return \(await compressPhoto\(photoFile\)\)\.blob;/);
  assert.match(SCREEN, /await \(await fetch\(photoData\)\)\.blob\(\)/, "the data URL turns back into the same blob");
});
