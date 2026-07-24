"use client";

// Nutrition v3 — live barcode scanner overlay (nested above the food sheet).
// Native BarcodeDetector + getUserMedia rear camera → requestAnimationFrame
// detect loop. Graceful fallbacks: browsers without BarcodeDetector (e.g. iOS
// Safari) and denied/errored camera get a manual "enter barcode number" input
// that runs the same lookup. The camera stream is always torn down on decode,
// close, or unmount — no leaked getUserMedia tracks.

import { useEffect, useRef, useState } from "react";

// BarcodeDetector isn't in the TS DOM lib yet — minimal shapes for what we use.
type DetectedBarcode = { rawValue: string };
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

type Status = "starting" | "scanning" | "denied" | "error";

const CORNERS = [
  { v: "top", h: "left", br: "18px 0 0 0" },
  { v: "top", h: "right", br: "0 18px 0 0" },
  { v: "bottom", h: "left", br: "0 0 0 18px" },
  { v: "bottom", h: "right", br: "0 0 18px 0" },
] as const;

export default function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const doneRef = useRef(false);

  const supported = typeof window !== "undefined" && detectorCtor() != null;
  const [status, setStatus] = useState<Status>(supported ? "starting" : "error");
  const [manual, setManual] = useState("");

  // Idempotent full teardown — safe to call from decode, close, and unmount.
  function stopCamera() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
      } catch {
        /* ignore */
      }
      v.srcObject = null;
    }
  }

  function finish(code: string) {
    const raw = code.replace(/\D/g, "");
    if (doneRef.current || raw.length < 6) return;
    doneRef.current = true;
    stopCamera();
    onDetected(raw);
  }

  useEffect(() => {
    const Ctor = detectorCtor();
    if (!Ctor) return; // no BarcodeDetector → manual-entry fallback, no camera
    let cancelled = false;

    (async () => {
      try {
        detectorRef.current = new Ctor({ formats: FORMATS });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled || doneRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (!v) {
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          return;
        }
        v.srcObject = stream;
        v.setAttribute("playsinline", "true");
        v.muted = true;
        await v.play().catch(() => {});
        if (cancelled || doneRef.current) return;
        setStatus("scanning");

        const tick = async () => {
          if (cancelled || doneRef.current) return;
          const vid = videoRef.current;
          const det = detectorRef.current;
          if (vid && det && vid.readyState >= 2) {
            try {
              const codes = await det.detect(vid);
              if (codes && codes.length && codes[0]?.rawValue) {
                finish(String(codes[0].rawValue));
                return;
              }
            } catch {
              /* transient per-frame detect error — keep looping */
            }
          }
          if (!cancelled && !doneRef.current) rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name;
        setStatus(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    stopCamera();
    onClose();
  }

  const showManual = status === "denied" || status === "error";

  return (
    <div
      className="fixed inset-0 z-[1300] flex flex-col"
      style={{ background: "#000" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)", paddingBottom: 12 }}
      >
        <div className="min-w-0">
          <h3 className="font-extrabold text-base" style={{ color: "#fff" }}>
            Scan barcode
          </h3>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            {status === "scanning"
              ? "Point the rear camera at a product barcode"
              : status === "starting"
                ? "Starting camera…"
                : status === "denied"
                  ? "Camera access needed"
                  : "Enter the barcode number"}
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Close scanner"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.14)", color: "#fff", fontSize: 14 }}
        >
          ✕
        </button>
      </div>

      {/* Camera view + reticle */}
      {!showManual && (
        <div className="relative flex-1 overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "cover" }}
          />
          {/* Scan-frame reticle */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              style={{
                width: "72%",
                maxWidth: 320,
                aspectRatio: "1.6 / 1",
                borderRadius: 18,
                boxShadow: "0 0 0 100vmax rgba(0,0,0,0.45)",
                position: "relative",
              }}
            >
              {CORNERS.map((c, i) => {
                const edge = "3px solid var(--brand-primary)";
                const style: React.CSSProperties = { position: "absolute", width: 34, height: 34, borderRadius: c.br };
                if (c.v === "top") style.top = -2;
                else style.bottom = -2;
                if (c.h === "left") style.left = -2;
                else style.right = -2;
                if (c.v === "top") style.borderTop = edge;
                else style.borderBottom = edge;
                if (c.h === "left") style.borderLeft = edge;
                else style.borderRight = edge;
                return <span key={i} style={style} />;
              })}
            </div>
          </div>
          {/* Manual-entry escape hatch, always available under the camera */}
          <div className="absolute inset-x-0 bottom-0 px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
            <ManualEntry manual={manual} setManual={setManual} onSubmit={() => finish(manual)} onSurface />
          </div>
        </div>
      )}

      {/* Fallback: no camera (unsupported / denied / error) → manual entry */}
      {showManual && (
        <div className="flex-1 flex flex-col justify-center px-6">
          {status === "denied" && (
            <p className="text-sm mb-4 text-center" style={{ color: "rgba(255,255,255,0.85)" }}>
              We couldn't access the camera. Allow camera access in your browser settings to scan,
              or type the barcode number below.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm mb-4 text-center" style={{ color: "rgba(255,255,255,0.85)" }}>
              {supported
                ? "The camera isn't available on this device — type the barcode number below."
                : "Live scan isn't supported in this browser — type the barcode number below."}
            </p>
          )}
          <ManualEntry manual={manual} setManual={setManual} onSubmit={() => finish(manual)} />
          <p className="text-xs mt-4 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
            Live scan works best on Android / Chrome.
          </p>
        </div>
      )}
    </div>
  );
}

function ManualEntry({
  manual,
  setManual,
  onSubmit,
  onSurface,
}: {
  manual: string;
  setManual: (v: string) => void;
  onSubmit: () => void;
  onSurface?: boolean;
}) {
  const valid = manual.replace(/\D/g, "").length >= 6;
  return (
    <div
      className="flex gap-2"
      style={onSurface ? { background: "rgba(0,0,0,0.4)", borderRadius: 14, padding: 8 } : undefined}
    >
      <input
        value={manual}
        onChange={(e) => setManual(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onSubmit();
        }}
        inputMode="numeric"
        placeholder="Enter barcode number"
        style={{
          flex: 1,
          minWidth: 0,
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 15,
          outline: "none",
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!valid}
        className="px-4 rounded-xl text-sm font-bold text-white flex-shrink-0"
        style={{ background: "var(--brand-primary)", opacity: valid ? 1 : 0.45 }}
      >
        Look up
      </button>
    </div>
  );
}
