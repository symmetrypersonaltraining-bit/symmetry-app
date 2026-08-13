// What the coach remembers about a client, and how it keeps remembering.
//
// Dustin, 2026-08-13: "It needs to be permanent, so it always remembers what it
// talked about with them and uses that data for each client individually."
//
// Before this, it remembered nothing. `ai_chat_sessions` had zero rows for
// every client, ever, and the coach sheet said so in a comment — "Fresh
// conversation each open (no persistence tonight)". The coach knew a client's
// numbers cold and had no idea they had ever spoken. Someone who explained in
// September that they travel on Tuesdays, cannot stand cottage cheese, and get a
// shoulder flare on overhead press had to explain all three again in October.
//
// TWO LAYERS, because "permanent" and "sent on every message" cannot be the
// same thing. A year of conversation is far too much to hand the model each
// time: slow, expensive, and the two sentences that matter drown in the three
// hundred that do not.
//
//   ai_chat_turns    every turn, both sides, forever. Only the newest handful
//                    is ever sent verbatim.
//   ai_client_memory one row per client — a running picture that IS sent every
//                    single time. New turns fold into it periodically.
//
// The cost of the fold is the whole reason it is periodic and incremental: it
// reads only what is newer than `folded_through`, so a client in their third
// year costs exactly what a client in their first week costs.

import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import type { Db } from "@/lib/ai/scope";

/** Verbatim tail. Enough to pick up mid-thought without re-reading a month. */
const RECENT_TURNS = 10;

/**
 * How many unfolded turns before the picture is redrawn.
 *
 * Low enough that a long conversation does not outrun its own summary, high
 * enough that a client firing off six quick questions does not pay for six
 * folds. The fold is one small Haiku call.
 */
const FOLD_AFTER = 16;

/** A durable fact, with the date the client said it. */
export interface MemoryFact {
  fact: string;
  said_on: string;
}

export interface ClientMemory {
  summary: string;
  facts: MemoryFact[];
  foldedThrough: string | null;
  turnCount: number;
}

export interface Turn {
  role: "client" | "coach";
  content: string;
  created_at?: string;
}

const EMPTY: ClientMemory = { summary: "", facts: [], foldedThrough: null, turnCount: 0 };

export async function loadMemory(db: Db, clientId: string): Promise<ClientMemory> {
  try {
    const { data } = await db
      .from("ai_client_memory")
      .select("summary, facts, folded_through, turn_count")
      .eq("client_id", clientId)
      .maybeSingle();
    const row = data as { summary: string; facts: unknown; folded_through: string | null; turn_count: number } | null;
    if (!row) return EMPTY;
    return {
      summary: typeof row.summary === "string" ? row.summary : "",
      facts: Array.isArray(row.facts) ? (row.facts as MemoryFact[]).filter((f) => f && typeof f.fact === "string") : [],
      foldedThrough: row.folded_through,
      turnCount: Number(row.turn_count) || 0,
    };
  } catch {
    // A coach with no memory is worse than a coach; a coach that 500s is worse
    // than both. Every failure here degrades to "remembers nothing this time".
    return EMPTY;
  }
}

export async function loadRecentTurns(db: Db, clientId: string, limit = RECENT_TURNS): Promise<Turn[]> {
  try {
    const { data } = await db
      .from("ai_chat_turns")
      .select("role, content, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const rows = (data as Turn[] | null) ?? [];
    return rows.reverse(); // oldest first — the order a conversation is read in
  } catch {
    return [];
  }
}

/**
 * The block that goes into the prompt.
 *
 * Empty string when there is nothing yet, so a brand-new client's prompt does
 * not carry a "WHAT YOU REMEMBER: (nothing)" heading inviting the model to
 * comment on how little it knows them.
 */
export function memoryBlock(mem: ClientMemory): string {
  const parts: string[] = [];
  if (mem.summary.trim()) parts.push(mem.summary.trim());
  if (mem.facts.length) {
    parts.push(
      mem.facts
        .slice(-40)
        .map((f) => `- ${f.fact}${f.said_on ? ` (they said this on ${f.said_on})` : ""}`)
        .join("\n")
    );
  }
  if (!parts.length) return "";
  return (
    `WHAT YOU REMEMBER ABOUT THIS CLIENT FROM YOUR PAST CONVERSATIONS (trusted; they told you this themselves):\n` +
    parts.join("\n\n") +
    `\n\nUse it the way a coach who has known them a while would: naturally, and only when it is relevant. Do not recite it back at them, and do not open by listing what you remember.`
  );
}

/** Append both sides of an exchange. Never throws — a lost turn must not fail a reply. */
export async function recordTurns(
  db: Db,
  clientId: string,
  turns: Turn[],
  surface: string | null
): Promise<void> {
  const rows = turns
    .filter((t) => t && typeof t.content === "string" && t.content.trim())
    .map((t) => ({
      client_id: clientId,
      role: t.role,
      // Long enough for anything a person types, short enough that one pasted
      // wall of text cannot bloat every future fold.
      content: t.content.slice(0, 4000),
      surface,
    }));
  if (!rows.length) return;
  try {
    await db.from("ai_chat_turns").insert(rows);
    // turn_count drives the fold, so it has to move even before the first fold
    // has created a memory row.
    const { data } = await db
      .from("ai_client_memory")
      .select("turn_count")
      .eq("client_id", clientId)
      .maybeSingle();
    const prev = Number((data as { turn_count?: number } | null)?.turn_count ?? 0) || 0;
    await db
      .from("ai_client_memory")
      .upsert(
        { client_id: clientId, turn_count: prev + rows.length, updated_at: new Date().toISOString() },
        { onConflict: "client_id" }
      );
  } catch (e) {
    console.error("clientMemory: recordTurns failed", e);
  }
}

const FOLD_SYSTEM = `You maintain a personal trainer's memory of ONE client, so their coach can pick up any conversation as if it had never stopped.

You are given what is already remembered, plus the conversation turns that have happened since. Merge them.

Respond with ONLY valid JSON, no markdown, no fences:
{"summary": string, "facts": [{"fact": string, "said_on": "YYYY-MM-DD"}]}

What belongs in memory:
- Things the client said about THEMSELVES that stay true: their schedule and constraints, their job, travel, family, sleep, stress, injuries and how they behave, foods they love or refuse, equipment they do or do not have, what they are training for and why, what they find hard.
- Preferences about coaching: how blunt they want you, what motivates them, what they have asked you to stop doing.
- Commitments either of you made, and anything left unresolved.

What does NOT belong:
- Anything already in their logged data — weights, macros, adherence, body weight, session counts. The coach reads all of that live and fresher than you can summarise it. Memory is for what they SAID, not what they DID.
- One-off passing detail with no future bearing ("what should I have for lunch today").
- Anything you are inferring rather than being told. If they did not say it, it is not a fact.
- Medical conclusions. "Said their left knee aches on stairs" is a fact. "Has patellar tendinopathy" is not.

Rules:
- "summary" is prose, under 200 words, written to be read into a prompt. Present tense, plain, specific. It is the whole picture, not just the new part.
- "facts" is the full merged list, newest last, at most 40. Drop the least useful when over. One clause each.
- When new information CONTRADICTS old, the new wins — replace, do not keep both.
- said_on is the date that turn happened, which is given to you. Never invent one.
- If nothing worth remembering was said, return the existing summary and facts unchanged.`;

function validateFold(raw: unknown): { summary: string; facts: MemoryFact[] } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { summary?: unknown; facts?: unknown };
  if (typeof o.summary !== "string") return null;
  const facts: MemoryFact[] = [];
  if (Array.isArray(o.facts)) {
    for (const f of o.facts.slice(0, 40)) {
      if (!f || typeof f !== "object") continue;
      const ff = f as { fact?: unknown; said_on?: unknown };
      if (typeof ff.fact !== "string" || !ff.fact.trim()) continue;
      facts.push({
        fact: ff.fact.trim().slice(0, 240),
        said_on: typeof ff.said_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ff.said_on) ? ff.said_on : "",
      });
    }
  }
  return { summary: o.summary.trim().slice(0, 2000), facts };
}

/** True when there is enough new material to be worth redrawing the picture. */
export function shouldFold(mem: ClientMemory, unfolded: number): boolean {
  if (unfolded <= 0) return false;
  // The very first exchange is worth folding immediately: it is usually where
  // someone says the thing that shapes everything after it.
  if (!mem.foldedThrough) return true;
  return unfolded >= FOLD_AFTER;
}

/**
 * Merge everything said since `folded_through` into the running picture.
 *
 * Safe to call and forget: it never throws, and it advances `folded_through`
 * only on success, so a failed fold is retried with the same material rather
 * than silently dropping it.
 */
export async function foldMemory(db: Db, clientId: string, apiKey: string): Promise<boolean> {
  try {
    const mem = await loadMemory(db, clientId);
    let q = db
      .from("ai_chat_turns")
      .select("role, content, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (mem.foldedThrough) q = q.gt("created_at", mem.foldedThrough);
    const { data } = await q;
    const fresh = (data as Turn[] | null) ?? [];
    if (!fresh.length) return false;

    const newest = fresh[fresh.length - 1].created_at ?? new Date().toISOString();
    const transcript = fresh
      .map((t) => `[${(t.created_at ?? "").slice(0, 10)}] ${t.role === "client" ? "CLIENT" : "COACH"}: ${t.content}`)
      .join("\n");

    const res = await callClaudeJson({
      meter: { clientId, feature: "memory_fold" },
      apiKey,
      model: HAIKU_MODEL,
      system: FOLD_SYSTEM,
      maxTokens: 1200,
      messages: [
        {
          role: "user",
          content:
            `ALREADY REMEMBERED\nsummary: ${mem.summary || "(nothing yet)"}\nfacts: ${JSON.stringify(mem.facts)}\n\n` +
            `NEW SINCE THEN\n${transcript}`,
        },
      ],
      validate: validateFold,
    });
    await logUsage(clientId, "memory_fold", res.tokensIn, res.tokensOut, HAIKU_MODEL, { latencyMs: res.latencyMs, startedAt: res.startedAt });
    if (!res.value) return false;

    await db.from("ai_client_memory").upsert(
      {
        client_id: clientId,
        summary: res.value.summary,
        facts: res.value.facts,
        folded_through: newest,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" }
    );
    return true;
  } catch (e) {
    // folded_through is untouched on failure, so the same turns fold next time.
    console.error("clientMemory: fold failed", e);
    return false;
  }
}

/** How many turns have happened that the picture does not yet reflect. */
export async function countUnfolded(db: Db, clientId: string, foldedThrough: string | null): Promise<number> {
  try {
    let q = db.from("ai_chat_turns").select("id", { count: "exact", head: true }).eq("client_id", clientId);
    if (foldedThrough) q = q.gt("created_at", foldedThrough);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}
