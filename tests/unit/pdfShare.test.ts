// ============================================================================
// Unit tests — src/lib/nutrition/pdf.ts sharePdf() fallback chain.
// Run: npm run test:unit   (node --import tsx --test)
//
// Verifies the hardened chain that keeps the Grocery/Meal-Prep PDF buttons
// working inside the Capacitor Android WebView (share + <a download> can both
// silently fail there):
//   • canShare=true                   → navigator.share({files}) called
//   • canShare=false & download works → <a download> path
//   • share throws & download throws  → window.open(blobUrl,'_blank') called
//   • Capacitor native stub           → window.open('_blank') (system browser)
//
// Pure node — jsPDF's output("blob") is stubbed via a fake doc, and all browser
// globals are injected through sharePdf's deps arg (no jsdom needed).
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sharePdf } from "../../src/lib/nutrition/pdf";

// Minimal jsPDF stand-in — sharePdf only calls doc.output("blob").
const fakeDoc = { output: (_: string) => ({ __pdf: true }) } as unknown as Parameters<typeof sharePdf>[0];

// A File constructor stub (node has no File on older runtimes; be explicit).
class FakeFile {
  parts: unknown[]; name: string; type: string;
  constructor(parts: unknown[], name: string, opts?: { type?: string }) {
    this.parts = parts; this.name = name; this.type = opts?.type || "";
  }
}

function makeUrlObj() {
  const created: string[] = [];
  const revoked: string[] = [];
  return {
    created, revoked,
    createObjectURL: (_: unknown) => { const u = "blob:mock-" + created.length; created.push(u); return u; },
    revokeObjectURL: (u: string) => { revoked.push(u); },
  };
}

// A document stub whose <a> click records href/download.
function makeDocObj(opts: { throwOnCreate?: boolean } = {}) {
  const clicks: { href: string; download: string }[] = [];
  return {
    clicks,
    createElement: (_: string) => {
      if (opts.throwOnCreate) throw new Error("createElement blocked");
      const a: Record<string, unknown> = {
        href: "", download: "",
        click() { clicks.push({ href: String(a.href), download: String(a.download) }); },
        remove() { /* noop */ },
      };
      return a;
    },
    body: { appendChild: (_: unknown) => { /* noop */ } },
  } as unknown as Document;
}

describe("sharePdf fallback chain", () => {
  it("canShare=true → navigator.share({files}) called", async () => {
    const shareCalls: unknown[] = [];
    const nav = {
      canShare: (d: unknown) => { void d; return true; },
      share: async (d: unknown) => { shareCalls.push(d); },
    };
    const winOpens: string[] = [];
    const win = { open: (u: string) => { winOpens.push(u); return {}; }, location: { href: "" } };

    const outcome = await sharePdf(fakeDoc, "f.pdf", "Title", "Text", {
      nav, docObj: makeDocObj(), urlObj: makeUrlObj(), FileCtor: FakeFile as unknown as typeof File, win,
    });

    assert.equal(outcome, "shared");
    assert.equal(shareCalls.length, 1);
    const arg = shareCalls[0] as { files: unknown[] };
    assert.ok(Array.isArray(arg.files) && arg.files.length === 1, "share called with one file");
    assert.equal(winOpens.length, 0, "did not fall through to window.open");
  });

  it("canShare=false & download works → <a download> path", async () => {
    const nav = { canShare: () => false, share: async () => { throw new Error("should not be called"); } };
    const docObj = makeDocObj();
    const winOpens: string[] = [];
    const win = { open: (u: string) => { winOpens.push(u); return {}; }, location: { href: "" } };

    const outcome = await sharePdf(fakeDoc, "grocery.pdf", "T", "X", {
      nav, docObj, urlObj: makeUrlObj(), FileCtor: FakeFile as unknown as typeof File, win,
    });

    assert.equal(outcome, "downloaded");
    const clicks = (docObj as unknown as { clicks: { href: string; download: string }[] }).clicks;
    assert.equal(clicks.length, 1, "one <a> click");
    assert.equal(clicks[0].download, "grocery.pdf");
    assert.ok(clicks[0].href.startsWith("blob:"), "download used a blob URL");
    assert.equal(winOpens.length, 0, "did not need window.open");
  });

  it("share throws & download throws → window.open(blobUrl,'_blank') called", async () => {
    const nav = {
      canShare: () => true,
      share: async () => { throw new Error("share blocked in webview"); },
    };
    const docObj = makeDocObj({ throwOnCreate: true }); // download path throws
    const winOpens: { url: string; target?: string }[] = [];
    const win = {
      open: (url: string, target?: string) => { winOpens.push({ url, target }); return {}; },
      location: { href: "" },
    };

    const outcome = await sharePdf(fakeDoc, "f.pdf", "T", "X", {
      nav, docObj, urlObj: makeUrlObj(), FileCtor: FakeFile as unknown as typeof File, win,
    });

    assert.equal(outcome, "opened");
    assert.equal(winOpens.length, 1, "window.open called after share+download failed");
    assert.equal(winOpens[0].target, "_blank");
    assert.ok(winOpens[0].url.startsWith("blob:"), "opened a blob URL");
  });

  it("window.open returns null → navigates location.href to the blob URL", async () => {
    const nav = { canShare: () => true, share: async () => { throw new Error("blocked"); } };
    const docObj = makeDocObj({ throwOnCreate: true });
    const win = { open: (_: string) => null, location: { href: "" } };

    const outcome = await sharePdf(fakeDoc, "f.pdf", "T", "X", {
      nav, docObj, urlObj: makeUrlObj(), FileCtor: FakeFile as unknown as typeof File, win,
    });

    assert.equal(outcome, "opened");
    assert.ok(win.location.href.startsWith("blob:"), "fell back to location.href navigation");
  });

  it("Capacitor native stub → window.open('_blank') (system browser) preferred", async () => {
    const shareCalls: unknown[] = [];
    const nav = {
      canShare: () => true, // even though share is available, native prefers open
      share: async (d: unknown) => { shareCalls.push(d); },
    };
    const winOpens: { url: string; target?: string }[] = [];
    const win = {
      open: (url: string, target?: string) => { winOpens.push({ url, target }); return {}; },
      location: { href: "" },
      Capacitor: { isNativePlatform: () => true },
    };

    const outcome = await sharePdf(fakeDoc, "f.pdf", "T", "X", {
      nav, docObj: makeDocObj(), urlObj: makeUrlObj(), FileCtor: FakeFile as unknown as typeof File, win,
    });

    assert.equal(outcome, "opened");
    assert.equal(winOpens.length, 1, "native shell opened the system browser first");
    assert.equal(winOpens[0].target, "_blank");
    assert.equal(shareCalls.length, 0, "share NOT used on native (open preferred)");
  });
});
