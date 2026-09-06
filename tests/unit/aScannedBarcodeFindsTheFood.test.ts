// A SCANNED BARCODE AND A STORED BARCODE ARE THE SAME NUMBER.
//
// USDA stores the GTIN-14 form, zero-padded: Apple Jacks is 00038000162367.
// The scanner in his phone reads the box and emits the UPC-A printed on it:
// 038000162367. The lookup was a single exact match on the scan, so the Oreo
// packet next to it — stored at 12 characters — came back, and the Apple Jacks
// did not exist. Both are in the catalogue. Only the padding differed.
//
// These checks fail against the old `.eq(barcode, scanned)` lookup, which is
// the point: every one of them describes a box that would not scan.

import test from "node:test";
import assert from "node:assert/strict";
import { barcodeCandidates, barcodeCore, normalizeBarcode } from "../../src/lib/nutrition/barcode.ts";

test("the USDA GTIN-14 spelling is offered for a scanned UPC-A", () => {
  assert.ok(barcodeCandidates("038000162367").includes("00038000162367"));
});

test("the scanned UPC-A spelling is offered for a stored GTIN-14", () => {
  assert.ok(barcodeCandidates("00038000162367").includes("038000162367"));
});

test("every padding of one number has the same core", () => {
  assert.equal(barcodeCore("038000162367"), "38000162367");
  assert.equal(barcodeCore("00038000162367"), "38000162367");
  assert.equal(barcodeCore("38000162367"), "38000162367");
});

test("the candidates cover the lengths the catalogue actually holds", () => {
  const c = barcodeCandidates("044000032029");
  for (const len of [11, 12, 13, 14]) {
    assert.ok(c.some((b) => b.length === len), `no candidate of length ${len}`);
  }
});

test("the scan itself is always one of the candidates", () => {
  assert.ok(barcodeCandidates("044000032029").includes("044000032029"));
});

test("a number is never truncated to fit a shorter barcode length", () => {
  assert.ok(barcodeCandidates("2000000000001").every((b) => b.length >= 13));
});

test("whatever the scanner puts round the digits is stripped", () => {
  assert.equal(normalizeBarcode(" 038000-162367 "), "038000162367");
  assert.equal(normalizeBarcode(null), "");
});

test("a non-barcode yields no candidates rather than a stray zero", () => {
  assert.deepEqual(barcodeCandidates(""), []);
  assert.deepEqual(barcodeCandidates("abc"), []);
});
