// Nutrition v3 — client orchestrator for server-generated PDFs.
// Requests the PDF from /api/nutrition/pdf (server builds + uploads to public
// storage, returns a URL), then copies the link to the clipboard (proven to
// work in Dustin's Capacitor WebView) and opens it in the system browser.
// Dependency-injectable + guarded so it's unit-testable and never throws for
// a copy/open failure — only for a genuine request failure.

export interface PdfLinkBody {
  clientId: string;
  kind: "grocery" | "prep";
  days: number;
  startDate: string;
}

export interface PdfLinkDeps {
  fetchFn?: typeof fetch;
  clipboard?: { writeText: (t: string) => Promise<void> } | null;
  openFn?: (url: string, target?: string) => void;
  documentObj?: Document;
}

// Clipboard copy with the same execCommand fallback the old grocery share uses.
export async function copyLink(url: string, deps?: PdfLinkDeps): Promise<boolean> {
  const clip = deps?.clipboard !== undefined ? deps.clipboard : (typeof navigator !== "undefined" ? navigator.clipboard : null);
  if (clip?.writeText) {
    try { await clip.writeText(url); return true; } catch { /* fall through */ }
  }
  const doc = deps?.documentObj ?? (typeof document !== "undefined" ? document : undefined);
  if (doc) {
    try {
      const ta = doc.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      doc.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = doc.execCommand("copy");
      ta.remove();
      return !!ok;
    } catch { /* noop */ }
  }
  return false;
}

// POST to the route, copy the returned link, open it. Returns url + copied flag.
// Throws (with a message) only when the request itself fails.
export async function generatePdfLink(body: PdfLinkBody, deps?: PdfLinkDeps): Promise<{ url: string; copied: boolean }> {
  const doFetch = deps?.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!doFetch) throw new Error("No network available.");
  const res = await doFetch("/api/nutrition/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.error || !json.url) {
    throw new Error((json && json.error) || `PDF request failed (${res.status}).`);
  }
  const url = String(json.url);
  const copied = await copyLink(url, deps);
  // Best-effort open in the system browser (cross-origin storage URL → the
  // Capacitor shell hands it to Chrome). Never fatal.
  try {
    const open = deps?.openFn ?? (typeof window !== "undefined" ? (u: string, t?: string) => window.open(u, t) : undefined);
    open?.(url, "_blank");
  } catch { /* noop */ }
  return { url, copied };
}
