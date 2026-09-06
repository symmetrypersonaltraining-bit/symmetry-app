// A scanned barcode and a stored barcode are the same number written down two
// different ways.
//
// USDA stores the GTIN-14 form, zero-padded on the left: Apple Jacks is
// 00038000162367. The scanner in his phone reads the same box and emits the
// UPC-A printed on it: 038000162367. Open Food Facts rows, imported earlier,
// used whatever the contributor typed. So the catalogue holds the one product
// at 8, 11, 12, 13 and 14 characters, and until now the lookup was a single
// exact `.eq("barcode", scanned)` — which found the row only when the padding
// happened to agree. Scan an Oreo packet and you got the Oreos; scan the Apple
// Jacks next to it and the app told you it had never heard of it.
//
// The number is the same number. Strip the leading zeros and it is 38000162367
// either way. These helpers make the comparison on that common form.

/** Digits only. Scanners and typed fallbacks both come through here. */
export function normalizeBarcode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\D/g, "") : "";
}

/** The padding-free identity of a barcode: leading zeros removed. */
export function barcodeCore(raw: unknown): string {
  const digits = normalizeBarcode(raw);
  if (!digits) return "";
  return digits.replace(/^0+/, "") || "0";
}

/** The GTIN lengths the catalogue actually holds (see the table above). */
const GTIN_LENGTHS = [8, 11, 12, 13, 14] as const;

/**
 * Every spelling of one barcode that the catalogue might be storing: the scan
 * itself, its zero-stripped core, and that core padded back out to each GTIN
 * length. Feed this to `.in("barcode", …)` so the row is found whichever way
 * it was written.
 */
export function barcodeCandidates(raw: unknown): string[] {
  const digits = normalizeBarcode(raw);
  const core = barcodeCore(digits);
  if (!core) return [];
  const out = new Set<string>([digits, core]);
  for (const len of GTIN_LENGTHS) {
    if (core.length <= len) out.add(core.padStart(len, "0"));
  }
  return [...out].filter(Boolean);
}
