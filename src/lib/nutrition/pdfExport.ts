// Nutrition v3 — server-side PDF export helper. Builds the PDF bytes (jsPDF)
// and uploads them to the public Supabase Storage 'exports' bucket, returning
// the public URL. Kept separate from the route so it's unit-testable with a
// fake storage object. No Next/request imports here.

import { pdfBytes, PdfCtx } from "./pdf";

// Minimal shape of supabase admin `.storage` we use — lets tests inject a fake.
export interface StorageLike {
  from(bucket: string): {
    upload(path: string, body: Uint8Array | Buffer, opts?: { contentType?: string; upsert?: boolean }): Promise<{ error: { message: string } | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
}

function shortRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const EXPORTS_BUCKET = "exports";

// Builds + uploads the PDF, returns its public URL. Throws on upload failure.
export async function buildAndUploadPdf(
  storage: StorageLike,
  clientId: string,
  kind: "grocery" | "prep",
  ctx: PdfCtx,
): Promise<string> {
  const bytes = pdfBytes(ctx, kind);
  const path = `${clientId}/${kind}-${ctx.todayISO}-${shortRandom()}.pdf`;
  const { error } = await storage.from(EXPORTS_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(error.message || "Storage upload failed");
  const { data } = storage.from(EXPORTS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
