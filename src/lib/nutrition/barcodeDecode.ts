// Turning a camera frame into a barcode number, on the phones people actually
// hold — not just the ones with the new API.
//
// WHY THIS FILE EXISTS
//
// Dustin, 14 Sep 2026: "Edit items bar code scanner doesn't work chevk the log."
// The log had nothing, because nothing was ever written. What the log DID have
// was his user agent, from an unrelated crash on 10 Sep:
//
//   Mozilla/5.0 (Linux; Android 16; SM-S938U Build/BP4A.251205.006; wv) …
//                                                                    ^^
// That `wv` is the whole story. It means Android WebView, not Chrome. The
// scanner was built on BarcodeDetector, which Chrome for Android has and
// WebView does not — and neither does any version of iOS Safari, which is what
// every iPhone client is on. So `detectorCtor()` returned null, the camera was
// never started at all, and the scanner opened straight onto a black screen
// with a keyboard and "type the barcode number below". Exactly what he saw.
//
// It was never broken for him specifically. It had never worked for anybody who
// was not on Chrome for Android, which is close to nobody.
//
// SO: BarcodeDetector STAYS as the fast path where it exists — it is hardware
// accelerated and costs nothing — and everywhere else we decode the frame
// ourselves with ZXing. The ZXing import is dynamic so its ~200 KB only ever
// reaches a device that needs it, and never touches the nutrition bundle.
//
// The frame-to-number step is deliberately a plain function over a greyscale
// array with no canvas and no DOM in it, so it can be run against a barcode in
// a test rather than only against a phone.

export type DetectedBarcode = { rawValue: string };

export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

/** What we ask the NATIVE detector for. Lower case — that API's spelling. */
export const NATIVE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

export type DecoderKind = "native" | "zxing";

export function nativeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

/**
 * RGBA bytes → one luminance byte per pixel, which is all a barcode reader
 * wants. Green-weighted, the same average ZXing itself uses, so a red-on-white
 * or blue-on-white label reads the same as a black one.
 *
 * Exported because it is the one arithmetic step between the camera and the
 * decoder, and an off-by-one in the stride silently produces noise rather than
 * an error.
 */
export function greyscale(rgba: Uint8ClampedArray, pixels: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  for (let i = 0, j = 0; i < pixels; i++, j += 4) {
    out[i] = (rgba[j] * 77 + rgba[j + 1] * 151 + rgba[j + 2] * 28) >> 8;
  }
  return out;
}

/** A loaded ZXing, reduced to the one thing this app asks of it. */
export interface ZxingDecoder {
  decode(grey: Uint8ClampedArray, width: number, height: number): string | null;
}

let zxingPromise: Promise<ZxingDecoder> | null = null;

/**
 * Load ZXing and hand back a decode function. Cached: the readers it allocates
 * are reused frame to frame, which is the difference between a scanner that
 * keeps up with the camera and one that stutters.
 */
export function loadZxing(): Promise<ZxingDecoder> {
  if (!zxingPromise) {
    zxingPromise = (async (): Promise<ZxingDecoder> => {
      const {
        BarcodeFormat,
        BinaryBitmap,
        DecodeHintType,
        HybridBinarizer,
        MultiFormatReader,
        RGBLuminanceSource,
      } = await import("@zxing/library");

      const hints = new Map<number, unknown>();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
      ]);
      const reader = new MultiFormatReader();
      // setHints once + decodeWithState per frame is ZXing's own advice for a
      // continuous scan; decode(bitmap, hints) reallocates every reader on
      // every frame.
      reader.setHints(hints);

      return {
        decode(grey, width, height) {
          try {
            const source = new RGBLuminanceSource(grey, width, height);
            const bitmap = new BinaryBitmap(new HybridBinarizer(source));
            return reader.decodeWithState(bitmap).getText();
          } catch {
            // NotFoundException on most frames — that is the normal case while
            // someone lines the packet up, not an error worth surfacing.
            return null;
          }
        },
      };
    })();
  }
  return zxingPromise;
}

/**
 * The longest edge we hand the decoder.
 *
 * A 1080p frame is four times the work for no more accuracy: a barcode filling
 * a third of the frame is still ~300px of bars at this size, far more than the
 * ~95 modules EAN-13 needs. Bigger than this and the loop falls behind the
 * camera on a mid-range phone, which reads as "it won't scan".
 */
export const MAX_DECODE_EDGE = 960;

/**
 * A ZXing-backed detector with the same shape as the native one, so the scan
 * loop does not have to know which it got.
 */
export function zxingDetector(zxing: ZxingDecoder): BarcodeDetectorLike {
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;

  return {
    async detect(source: CanvasImageSource): Promise<DetectedBarcode[]> {
      const v = source as HTMLVideoElement;
      const sw = v.videoWidth || 0;
      const sh = v.videoHeight || 0;
      if (!sw || !sh) return [];

      const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));

      if (!canvas) canvas = document.createElement("canvas");
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx = null;
      }
      // willReadFrequently or the browser keeps round-tripping the canvas to
      // the GPU and back once a frame.
      if (!ctx) ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return [];

      ctx.drawImage(v, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      const text = zxing.decode(greyscale(data, w * h), w, h);
      return text ? [{ rawValue: text }] : [];
    },
  };
}

/**
 * The decoder this browser can actually use. Native where it exists, ZXing
 * everywhere else — and the kind comes back with it so the screen can say
 * which one it is running and the log can record it.
 */
export async function createDecoder(): Promise<{ kind: DecoderKind; detector: BarcodeDetectorLike }> {
  const Ctor = nativeDetectorCtor();
  if (Ctor) {
    try {
      return { kind: "native", detector: new Ctor({ formats: NATIVE_FORMATS }) };
    } catch {
      // Present but unusable — Chrome throws here when the platform's own
      // barcode service is missing. Fall through rather than giving up.
    }
  }
  return { kind: "zxing", detector: zxingDetector(await loadZxing()) };
}
