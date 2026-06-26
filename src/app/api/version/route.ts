import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "dev";
  return NextResponse.json(
    { sha },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
