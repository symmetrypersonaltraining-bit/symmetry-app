// POST /api/feedback/describe — read the screenshot, once, at submit time.
//
// Dustin: "we need a way fir you to get the images moving firward so things
// dint get missed."
//
// The problem is concrete. Jennifer Day has filed ten pieces of feedback and
// ALL TEN carry a screenshot. For several of them the picture IS the report:
// "Another print screen" is the entire transcript of one, and three others say
// a version of "this field is wrong" without saying which field, because the
// image was meant to carry that. Those PNGs sit in storage where nothing reads
// them — not a search, not a list, not whoever is fixing the bug a week later.
// Five of hers sat unread for two days.
//
// So the screenshot is described ONCE, right after it uploads, and the text
// lands on the row. After that it behaves like any other text: searchable,
// greppable, readable from a query, and legible to whoever picks the report up.
//
// WHY AT SUBMIT AND NOT ON DEMAND. Reading it later means something has to
// remember to, which is the failure being fixed. One call, at the only moment
// we are certain the image exists and someone cares about it.
//
// The description is deliberately literal — what is on screen, what the numbers
// say, what looks wrong — not a diagnosis. A guess about the cause recorded as
// fact is worse than no note at all, because the next person reads it as
// findings rather than as a description.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAiScope } from "@/lib/ai/scope";
import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

const PROMPT = `You are reading a screenshot a personal-training client attached to an in-app bug report.

Describe WHAT IS ON THE SCREEN, concretely and literally, in 2-4 sentences:
- which screen it appears to be (workout logger, nutrition, schedule, dashboard…)
- the exercise, meal or item named on it, exactly as written
- the specific fields, values, units and labels visible — especially anything the client is likely pointing at (an input that says reps when it should say weight, a number that looks doubled, a video player showing an error)
- any visible error text, verbatim

Rules:
- Report what you can SEE. Never infer the cause, never propose a fix, never say what "should" happen.
- Quote on-screen text exactly, including numbers and units.
- If the image is unreadable or shows nothing useful, say exactly that in one sentence.
- No preamble. Start with the description.`;

export async function POST(req: Request) {
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;

  let body: { feedbackId?: string; imageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { feedbackId, imageUrl } = body;
  if (!feedbackId || !imageUrl) return NextResponse.json({ error: "Missing feedbackId or imageUrl" }, { status: 400 });

  // Only our own storage. An arbitrary URL here would turn this into a
  // fetch-anything proxy that happens to be authenticated.
  let host: string;
  try {
    host = new URL(imageUrl).hostname;
  } catch {
    return NextResponse.json({ error: "Bad image URL" }, { status: 400 });
  }
  if (!host.endsWith(".supabase.co")) {
    return NextResponse.json({ error: "Unsupported image host" }, { status: 400 });
  }

  const db = createAdminClient();
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const mediaType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED.has(mediaType)) throw new Error(`unsupported type ${mediaType}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("image too large");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("no API key");
    // Haiku: this is describing what is on a screen, not reasoning about it.
    // Cheap enough that every screenshot can be read without anyone weighing
    // up whether it is worth it — which is the point.
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/png", data: buf.toString("base64") } },
            { type: "text", text: "Describe this screenshot." },
          ],
        },
      ],
    });
    const text = msg.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim()
      .slice(0, 2000);
    if (text) await db.from("app_feedback").update({ image_summary: text }).eq("id", feedbackId);
    return NextResponse.json({ ok: true, summary: text });
  } catch (err) {
    // NEVER let this fail the report. The feedback row is already saved with its
    // image; a missing description is a smaller loss than a client tapping send
    // and seeing an error, which teaches them not to bother next time.
    const msg = err instanceof Error ? err.message : "describe failed";
    try {
      await db.from("app_feedback").update({ image_summary: `[could not read the screenshot: ${msg}]` }).eq("id", feedbackId);
    } catch { /* the report itself is intact either way */ }
    return NextResponse.json({ ok: false, error: msg });
  }
}
