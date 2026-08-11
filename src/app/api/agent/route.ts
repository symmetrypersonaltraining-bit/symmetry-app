// POST /api/agent — the trainer's in-app AI, working like a full Claude chat for
// managing clients. It can look up ANY client, read anything (profile, program,
// scheduled workouts, nutrition, metrics, adherence), and make changes —
// especially programming — through a set of tools. Trainer-only.
//
// Writes go through the SAME safe paths the rest of the app uses (workoutAdjust
// clones library days into client-owned copies; macro targets are versioned by
// effective_date), so the agent can't corrupt the master library or clobber
// history. It executes directly and narrates what it did, like chatting with
// Claude. Model: Sonnet (tool use). Body: { messages:[{role,content}], pageContext? }.

import { APP_GUIDE_TRAINER } from "@/lib/ai/app-guide";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { SONNET_MODEL } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { resolveAiScope, enforceMeter, missingKeyResponse, Db } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRAINER_TOOLS, execTrainerTool } from "@/lib/ai/agent-tools";
import { CONTEXT_TYPE, MAX_TURNS } from "./session/route";
import { COACH_FIRST_NAME, BUSINESS_NAME } from "@/lib/trainer";

export const runtime = "nodejs";

const SYSTEM = `You are ${COACH_FIRST_NAME}'s in-app AI for ${BUSINESS_NAME} — his corrective + physique coaching business. You work exactly like chatting with Claude about his clients: you can look up ANY client, read everything about them, and make changes for him, especially programming. Be direct, concrete, and useful. ${COACH_FIRST_NAME} is the only user; act on his behalf.

Use the tools to get real data before answering — never guess a client's numbers, program, or macros. To act on a client, first find them (find_clients) unless an id is already in context, then read what you need, then make the change with the write tools and tell him plainly what you did.

Programming rules you must always honor:
- NEVER program Olympic/power lifts (cleans, snatches, jerks, high pulls, push press) or strongman.
- Pull-ups are ALWAYS "Machine Assisted Pull Up" — never weighted. Barbell hip thrust → "Hip Thrust Machine".
- Sevens Gym equipment only: cable rig, dumbbells, barbells + racks, leg press, GHD, Smith, kettlebells, pendulum squat, belt squat, battle ropes, treadmill, plyo boxes, bands, med/stability balls, pull-up bar, hip thrust machine, machine assisted pull up. NOT available: rower/erg, elliptical, cable fly machine.
- Corrective progression is pain/quality-gated. NASM language stays internal — never client-facing.

Writing workouts: adjust_workout only touches THIS client's scheduled sessions (it clones a shared template into a client-owned copy first). Use scope "one" for a single session or "series" for all upcoming sessions of that workout — if it's ambiguous, ask ${COACH_FIRST_NAME} which he wants before a big change. Reference the exact SW-id / section_id / pe_id from client_workouts.

THE CALENDAR. book_session, move_session and cancel_session write to GOOGLE, not to the app. Google is the source of truth and the app syncs from it, so this is the only safe direction — and it means a change shows in the app on the next sync rather than instantly. Say so. Never delete a session to cancel it: cancel_session colours it orange, which is how the app and the billing recognise a cancellation. A booked event's title must contain the client's name or the sync cannot match it to them, and an unmatched event is an unbilled session — book_session handles that, don't override the title with something that drops the name.

MESSAGES GO TO REAL PEOPLE. Before send_message, show ${COACH_FIRST_NAME} the exact text and wait, unless he has already told you what to say. An announcement (group + announcement:true) puts a full-screen takeover in front of all 35 clients — only when he asks for something that loud.

ANYTHING YOU CHANGE CAN BE TAKEN BACK. Every write is logged; recent_actions lists them and undo_action reverses one. If you get something wrong, undo it and say so rather than layering another change on top. Workout edits are the exception — they have no faithful inverse, so be sure before applying one to a series.

query_table is the fallback for anything the specific tools don't cover — it reads any allow-listed table with simple filters. Prefer the purpose-built tools when they fit; they return better-shaped context.

Keep replies tight. After a change, confirm exactly what you did in one or two sentences.

${APP_GUIDE_TRAINER}
`;

/**
 * Persist the conversation so the drawer still has it after a navigation.
 *
 * IMAGE PAYLOADS ARE STRIPPED. A few megabytes of base64 per turn, forty turns
 * deep, in a jsonb column that is read on every drawer open, is not a memory —
 * it is a liability. The turn is kept with a "[photo]" marker so the thread
 * still reads correctly; the picture itself lives only for the session it was
 * sent in. If he needs the model to look again, he sends it again.
 *
 * Never throws. A failure to remember must not fail the answer that was already
 * produced.
 */
async function saveSession(db: Db, incoming: { role: string; content: unknown }[], reply: string): Promise<void> {
  try {
    const flat = [...incoming, { role: "assistant", content: reply }]
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        if (typeof m.content === "string") return { role: m.role, content: m.content };
        if (!Array.isArray(m.content)) return null;
        const parts = (m.content as { type?: string; text?: string }[])
          .map((b) => (b?.type === "text" ? b.text || "" : b?.type === "image" ? "[photo]" : ""))
          .filter(Boolean);
        return parts.length ? { role: m.role, content: parts.join(" ") } : null;
      })
      .filter(Boolean)
      .slice(-MAX_TURNS);

    const { data: existing } = await db
      .from("ai_chat_sessions").select("id").eq("context_type", CONTEXT_TYPE)
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();
    const id = (existing as { id: string } | null)?.id;

    if (id) {
      await db.from("ai_chat_sessions").update({ messages: flat, updated_at: new Date().toISOString() }).eq("id", id);
    } else {
      await db.from("ai_chat_sessions").insert({ context_type: CONTEXT_TYPE, messages: flat });
    }
  } catch (e) {
    console.error("agent: session save failed", e);
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return missingKeyResponse();

  // `content` is a string for an ordinary turn, or an array of Anthropic
  // content blocks when the turn carries an image. Anything else is dropped.
  type InBlock = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
  let body: { messages?: { role: string; content: string | InBlock[] }[]; pageContext?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  const { scope } = scoped;
  if (!scope.isTrainer) return NextResponse.json({ error: "Trainer only" }, { status: 403 });

  // Only the global kill switch applies to the trainer's own agent — no per-client
  // daily cap (passing null skips the cap, keeps the kill switch).
  const paused = await enforceMeter(null, "chat");
  if (paused) return paused;

  const admin = createAdminClient() as unknown as Db;
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  // ~5MB of base64 is roughly 3.7MB of image. Beyond that the request is slow
  // enough on a phone that it reads as broken, and the model gains nothing from
  // the extra pixels.
  const MAX_IMAGE_B64 = 5_000_000;
  const MAX_IMAGES = 4;
  let imageCount = 0;

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages: Anthropic.MessageParam[] = [];
  for (const m of incoming) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const role = m.role as "user" | "assistant";

    if (typeof m.content === "string") {
      if (m.content.trim()) messages.push({ role, content: m.content });
      continue;
    }
    if (!Array.isArray(m.content)) continue;

    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const b of m.content) {
      if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        blocks.push({ type: "text", text: b.text });
      } else if (b && b.type === "image" && b.source?.type === "base64") {
        // Validate rather than trust: an unbounded or wrong-typed image is a
        // 400 from Anthropic that surfaces to Dustin as "Agent error", which
        // tells him nothing about what to do differently.
        if (imageCount >= MAX_IMAGES) continue;
        if (!ALLOWED_IMAGE.has(b.source.media_type)) continue;
        if (typeof b.source.data !== "string" || b.source.data.length > MAX_IMAGE_B64) continue;
        imageCount++;
        blocks.push({ type: "image", source: { type: "base64", media_type: b.source.media_type as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: b.source.data } });
      }
    }
    if (blocks.length) messages.push({ role, content: blocks });
  }
  if (!messages.length) return NextResponse.json({ error: "No message." }, { status: 400 });

  const system = body.pageContext ? `${SYSTEM}\n\nCurrent page context (what ${COACH_FIRST_NAME} is looking at): ${body.pageContext}` : SYSTEM;

  const client = new Anthropic({ apiKey });
  let tokensIn = 0, tokensOut = 0;
  try {
    for (let i = 0; i < 14; i++) {
      const resp = await client.messages.create({ model: SONNET_MODEL, max_tokens: 1600, system, tools: TRAINER_TOOLS, messages });
      tokensIn += resp.usage?.input_tokens ?? 0;
      tokensOut += resp.usage?.output_tokens ?? 0;

      if (resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            const out = await execTrainerTool(admin, block.name, (block.input as Record<string, unknown>) || {});
            results.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      await saveSession(admin, incoming, text);
      // Unconditional. This used to be gated on `scope.clientId`, so if the
      // trainer had no clients row the entire agent's SONNET spend went
      // unlogged — invisible to the $95 monthly kill switch, which is the one
      // thing meant to stop a runaway bill. logUsage takes a null client_id and
      // the spend rollups group by month, not by client.
      await logUsage(scope.clientId ?? null, "chat", tokensIn, tokensOut, SONNET_MODEL);
      return NextResponse.json({ message: text || "(done)" });
    }
    await logUsage(scope.clientId ?? null, "chat", tokensIn, tokensOut, SONNET_MODEL);
    return NextResponse.json({ message: "That took several steps — tell me the next thing and I'll keep going." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("agent failed:", msg);
    return NextResponse.json({ error: `Agent error — ${msg.slice(0, 140)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
