// ============================================================================
// A BARCODE SCANS ON A PHONE THAT IS NOT CHROME FOR ANDROID.
//
// Dustin, 14 Sep 2026: *"Edit items bar code scanner doesn't work chevk the
// log."*
//
// The log had nothing about the scanner, because the scanner never wrote to it.
// What the log DID have was his user agent, from an unrelated crash four days
// earlier:
//
//   Mozilla/5.0 (Linux; Android 16; SM-S938U Build/BP4A.251205.006; wv) …
//                                                                    ^^
// `wv` is Android WebView, not Chrome. BarcodeDetector — the only decoder the
// scanner had — exists in Chrome for Android and does not exist in WebView, and
// has never existed in any version of iOS Safari, which is what the iPhone
// clients in that same table are on.
//
// So `detectorCtor()` returned null, the camera was never opened, and the
// scanner went straight to "type the barcode number below". It was not broken
// that day. It had only ever worked on Chrome for Android.
//
// THE TEST: decode a real EAN-13 barcode with no browser, no camera and no
// BarcodeDetector anywhere in the process. It is drawn here from the EAN-13
// specification rather than loaded as a fixture, so what is being decoded is a
// barcode and not a picture somebody once said was one.
//
// Against the code before the fix this cannot even be written: there was no
// decoder to call. Delete the ZXing branch of createDecoder and the second
// case below fails on a browser with no BarcodeDetector, which is the phone in
// Dustin's pocket.
// ============================================================================

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createDecoder,
  greyscale,
  loadZxing,
  nativeDetectorCtor,
} from "../../src/lib/nutrition/barcodeDecode";

// ── Drawing an EAN-13, from the spec ────────────────────────────────────────
// 95 modules: 101 | 6×7 left | 01010 | 6×7 right | 101. The first digit is not
// drawn at all — it is carried by WHICH parity each of the six left digits uses.

const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

function ean13Modules(code: string): string {
  assert.equal(code.length, 13, "EAN-13 is thirteen digits");
  const d = code.split("").map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (parity[i] === "L" ? L : G)[d[i + 1]];
  bits += "01010";
  for (let i = 7; i < 13; i++) bits += R[d[i]];
  return bits + "101";
}

/**
 * Modules → a greyscale image, quiet zones included. The quiet zone is not
 * decoration: a reader that cannot find white either side of the start guard
 * gives up, and leaving it off is the classic way a hand-made fixture "proves"
 * a working decoder is broken.
 */
function ean13Image(code: string, scale = 3, quiet = 12, height = 40) {
  const bits = ean13Modules(code);
  const width = (bits.length + quiet * 2) * scale;
  const grey = new Uint8ClampedArray(width * height).fill(255);
  for (let m = 0; m < bits.length; m++) {
    if (bits[m] !== "1") continue;
    const x0 = (quiet + m) * scale;
    for (let y = 0; y < height; y++) {
      for (let x = x0; x < x0 + scale; x++) grey[y * width + x] = 0;
    }
  }
  return { grey, width, height };
}

describe("a barcode scans on a phone that is not Chrome for Android", () => {
  it("decodes an EAN-13 with no BarcodeDetector in the process", async () => {
    // The condition on Dustin's phone, stated rather than assumed.
    assert.equal(
      (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector,
      undefined,
      "this test is only meaningful where the native API is absent",
    );

    const zxing = await loadZxing();
    const { grey, width, height } = ean13Image("0049000042566"); // Coca-Cola 12oz

    // TWELVE DIGITS BACK, NOT THIRTEEN, AND THAT IS CORRECT. An EAN-13 that
    // begins with 0 *is* a UPC-A, and that is how a scanner reports it — the
    // leading zero is the encoding, not part of the number on the packet.
    // Nothing downstream has to care, because barcodeCandidates() already looks
    // a code up under every GTIN zero-padding; this row is here so the next
    // person to read a 12-digit result does not treat it as a misread.
    assert.equal(zxing.decode(grey, width, height), "049000042566");
  });

  it("reads a second, unrelated code — so it is decoding, not remembering", async () => {
    const zxing = await loadZxing();
    // Not a leading zero, so this one comes back as the full EAN-13.
    const { grey, width, height } = ean13Image("5449000000996"); // Coke, EU
    assert.equal(zxing.decode(grey, width, height), "5449000000996");
  });

  it("says nothing rather than guessing at a blank frame", async () => {
    const zxing = await loadZxing();
    const width = 300, height = 40;
    assert.equal(zxing.decode(new Uint8ClampedArray(width * height).fill(255), width, height), null);
  });

  it("hands back a decoder even when the native one is missing", async () => {
    assert.equal(nativeDetectorCtor(), null, "no window here, so no native detector");
    const { kind, detector } = await createDecoder();
    // THE LINE THAT WOULD HAVE CAUGHT THIS. Before the fix there was no
    // decoder at all in this case — the scanner opened onto a keyboard.
    assert.equal(kind, "zxing");
    assert.equal(typeof detector.detect, "function");
  });

  it("greyscales with the right stride", () => {
    // Two pixels: pure white, pure black. A stride bug turns the second pixel
    // into the first one's alpha and the whole frame decodes as noise.
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const grey = greyscale(rgba, 2);
    assert.equal(grey.length, 2);
    assert.ok(grey[0] > 250, `white should stay white, got ${grey[0]}`);
    assert.equal(grey[1], 0);
  });
});
