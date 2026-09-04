// POST /api/movement-search — plain-English search over the MOVEMENT library.
//
// The sibling of /api/library-search, and deliberately the same shape: a
// sentence in, a filter over a closed vocabulary out. It never picks an
// exercise, never writes, and never sees the library — the picker holds all 858
// movements in memory and does the matching itself, so every result is a real
// row and the model cannot invent a lift that does not exist.
//
// Muscle group is matched loosely on purpose. The column is free text that has
// been typed by hand over a year — "Chest" and "chest", "Legs" and "Lower Body"
// — so the filter normalises rather than trusting the stored casing.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";

export const runtime = "nodejs";

const MUSCLE = ["chest", "back", "shoulders", "biceps", "triceps", "arms", "core", "glutes", "legs", "ankle", "hips", "neck", "full-body", "mobility"] as const;
const MODALITY = ["strength", "power", "functional", "conditioning", "mobility"] as const;
const EQUIPMENT = ["bodyweight", "dumbbells", "barbells", "kettlebells", "cable", "machine", "bands", "boxes", "foam roller", "lacrosse ball", "stability ball", "medicine ball", "pull-up bar", "leg press", "smith machine", "treadmill", "ghd", "battle ropes", "balance disc", "mat", "sandbag", "rower", "flexbar"] as const;

interface Filter {
  muscle?: string[];
  modality?: string[];
  equipment?: string[];
  keywords?: string[];
  reading?: string;
}

const pick = (v: unknown, allowed: readonly string[]): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.map((x) => String(x).toLowerCase().trim()).filter((x) => allowed.includes(x))))
    : [];

function validate(raw: unknown): Filter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    muscle: pick(r.muscle, MUSCLE),
    modality: pick(r.modality, MODALITY),
    equipment: pick(r.equipment, EQUIPMENT),
    keywords: Array.isArray(r.keywords)
      ? r.keywords.map((k) => String(k).trim()).filter((k) => k.length > 1).slice(0, 6)
      : [],
    reading: typeof r.reading === "string" ? r.reading.slice(0, 160) : "",
  };
}

const SYSTEM = `You turn a request for an EXERCISE into a filter over a fixed vocabulary. You never name an exercise — a list of real movements is filtered by what you return.

Reply with JSON only:
{
  "muscle": subset of [${MUSCLE.join(", ")}],
  "modality": subset of [${MODALITY.join(", ")}],
  "equipment": subset of [${EQUIPMENT.join(", ")}],
  "keywords": up to 6 words to match against the movement's name,
  "reading": one short sentence, addressed to the person, saying what you understood
}

Rules:
- Be GENEROUS. Too tight returns nothing, and an empty list is much worse than a
  slightly long one. When in doubt, leave a field empty.
- Put the movement pattern itself in "keywords" — press, hinge, squat, row, curl,
  lunge, carry, bridge. That is usually the most useful thing you can extract.
- "something for my shoulder that doesn't need weights" is muscle shoulders,
  equipment bodyweight or bands — not a keyword search for that whole sentence.
- Never guess at equipment that was not implied.
- "reading" is what the person will see. One plain sentence, no jargon.`;

export async function POST(req: NextRequest) {
  const scoped = await resolveAiScope();
  if (!scoped.ok) return scoped.response;
  const { clientId } = scoped.scope;

  let body: { query?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ error: "empty query" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No key is not an outage. The words are a perfectly good name search.
    return NextResponse.json({
      interpreted: false,
      reading: "",
      filter: { muscle: [], modality: [], equipment: [], keywords: query.split(/\s+/).filter((w) => w.length > 2).slice(0, 6) },
    });
  }

  const gate = await enforceMeter(clientId, "movement_search");
  if (gate) return gate;

  const out = await callClaudeJson<Filter>({
    apiKey,
    model: HAIKU_MODEL,
    system: SYSTEM,
    maxTokens: 350,
    messages: [{ role: "user", content: query }],
    validate,
    meter: { clientId, feature: "movement_search" },
  });

  if (!out.value) {
    return NextResponse.json({
      interpreted: false,
      reading: "",
      filter: { muscle: [], modality: [], equipment: [], keywords: query.split(/\s+/).filter((w) => w.length > 2).slice(0, 6) },
    });
  }

  await logUsage(clientId, "movement_search", out.tokensIn, out.tokensOut, HAIKU_MODEL, {
    latencyMs: out.latencyMs,
    startedAt: out.startedAt,
  });

  return NextResponse.json({
    interpreted: true,
    reading: out.value.reading || "",
    filter: {
      muscle: out.value.muscle || [],
      modality: out.value.modality || [],
      equipment: out.value.equipment || [],
      keywords: out.value.keywords || [],
    },
  });
}
