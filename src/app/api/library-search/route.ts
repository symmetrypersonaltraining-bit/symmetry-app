// POST /api/library-search — plain-English search over the workout library.
//
// Dustin, 4 Sep: "ai shouod be wired into this as well to be able to have ai
// search fir what they want but it needs to interpret what we say, search the
// library and accurately give options to sort through."
//
// The important word there is OPTIONS. This does not pick a workout and it
// never writes anything. It turns a sentence into a filter over the facets on
// `days`, runs that filter, and hands back a list to choose from — plus the
// filter it used, so the caller can show what it understood and the person can
// correct it by tapping a chip instead of rephrasing.
//
// WHY THE MODEL DOES NOT SEE THE LIBRARY. Handing 1,195 labels to Haiku on
// every keystroke would be slow, expensive, and worse: it would invent day ids,
// or return a workout that reads right and does not exist. It only ever emits a
// filter over a fixed vocabulary — Postgres decides what actually matches, and
// every id in the response came out of the database.
//
// Falls back to a keyword search when the model is unavailable or the key is
// missing, so the box never simply stops working.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, callClaudeJson } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, resolveAiScope } from "@/lib/ai/scope";

export const runtime = "nodejs";

/** The closed vocabulary. The model may only choose from these. */
const REGIONS = ["upper", "lower", "core", "full"] as const;
const FOCUS = ["chest", "back", "shoulders", "biceps", "triceps", "arms", "core", "glutes", "legs", "ankle", "hips", "neck", "full-body"] as const;
const MODALITY = ["strength", "cardio", "mobility", "conditioning", "functional", "rehab"] as const;
const INTENT = ["hypertrophy", "strength", "fat-loss", "corrective", "rehab", "mobility", "balance", "prep", "at-home", "solo"] as const;
const DIFFICULTY = ["beginner", "intermediate", "advanced"] as const;

interface Filter {
  region?: string | null;
  focus?: string[];
  modality?: string[];
  intent?: string[];
  difficulty?: string[];
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
  const region = typeof r.region === "string" && (REGIONS as readonly string[]).includes(r.region.toLowerCase())
    ? r.region.toLowerCase()
    : null;
  const keywords = Array.isArray(r.keywords)
    ? r.keywords.map((k) => String(k).trim()).filter((k) => k.length > 1).slice(0, 6)
    : [];
  return {
    region,
    focus: pick(r.focus, FOCUS),
    modality: pick(r.modality, MODALITY),
    intent: pick(r.intent, INTENT),
    difficulty: pick(r.difficulty, DIFFICULTY),
    keywords,
    reading: typeof r.reading === "string" ? r.reading.slice(0, 160) : "",
  };
}

const SYSTEM = `You turn a person's plain-English request for a workout into a FILTER over a fixed vocabulary. You never name a workout and you never invent one — a database does the matching.

Reply with JSON only:
{
  "region": one of ${REGIONS.join(" | ")} or null,
  "focus": subset of [${FOCUS.join(", ")}],
  "modality": subset of [${MODALITY.join(", ")}],
  "intent": subset of [${INTENT.join(", ")}],
  "difficulty": subset of [${DIFFICULTY.join(", ")}],
  "keywords": up to 6 words to match against the workout's name and description,
  "reading": one short sentence, addressed to the person, saying what you understood
}

Rules:
- Be GENEROUS. A filter that is too tight returns nothing, and an empty list is
  far worse than a slightly long one. When in doubt, leave a field empty.
- Only set "region" when the request is clearly about one half of the body.
- Body parts go in "focus". What the session is FOR goes in "intent".
- "something for my sore lower back" is intent rehab or corrective, not focus back
  — focus back means training the back as a muscle group.
- Put proper nouns, equipment and anything you have no category for in "keywords".
- "reading" is what the person will see. Write it as one plain sentence, no jargon.`;

export async function POST(req: NextRequest) {
  const scoped = await resolveAiScope();
  if (!scoped.ok) return scoped.response;
  const { supabase, clientId } = scoped.scope;

  let body: { query?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const query = (body.query || "").trim();
  if (!query) return NextResponse.json({ error: "empty query" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let filter: Filter = { region: null, focus: [], modality: [], intent: [], difficulty: [], keywords: [], reading: "" };
  let interpreted = false;

  if (apiKey) {
    const gate = await enforceMeter(clientId, "library_search");
    if (gate) return gate;
    const out = await callClaudeJson<Filter>({
      apiKey,
      model: HAIKU_MODEL,
      system: SYSTEM,
      maxTokens: 400,
      messages: [{ role: "user", content: query }],
      validate,
      meter: { clientId, feature: "library_search" },
    });
    if (out.value) {
      filter = out.value;
      interpreted = true;
      await logUsage(clientId, "library_search", out.tokensIn, out.tokensOut, HAIKU_MODEL, {
        latencyMs: out.latencyMs,
        startedAt: out.startedAt,
      });
    }
  }

  // No model, or the model could not be understood: the words themselves are a
  // perfectly good keyword search, and a search box that stops working is worse
  // than one that is merely literal.
  if (!interpreted) {
    filter.keywords = query.split(/\s+/).filter((w) => w.length > 2).slice(0, 6);
    filter.reading = "";
  }

  let q = supabase
    .from("days")
    .select("id, label, description, difficulty, exercise_count, region, focus_tags, modality_tags, intent_tags")
    .gt("exercise_count", 0);

  if (filter.region) q = q.eq("region", filter.region);
  if (filter.focus?.length) q = q.overlaps("focus_tags", filter.focus);
  if (filter.modality?.length) q = q.overlaps("modality_tags", filter.modality);
  if (filter.intent?.length) q = q.overlaps("intent_tags", filter.intent);
  if (filter.difficulty?.length) q = q.in("difficulty", filter.difficulty);

  const { data, error } = await q.limit(400);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string; label: string | null; description: string | null; difficulty: string | null;
    exercise_count: number | null; region: string | null;
    focus_tags: string[] | null; modality_tags: string[] | null; intent_tags: string[] | null;
  };
  const rows = (data || []) as Row[];
  const words = (filter.keywords || []).map((k) => k.toLowerCase()).filter(Boolean);

  // Keyword hits rank; they do not exclude. A filter that already matched on
  // facets should not throw away a good result because the person's wording
  // does not appear in the label.
  const scored = rows
    .map((r) => {
      const hay = ((r.label || "") + " " + (r.description || "")).toLowerCase();
      let score = 0;
      for (const w of words) {
        if ((r.label || "").toLowerCase().includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score || (a.r.label || "").localeCompare(b.r.label || ""));

  // If nothing matched the words at all, the facets are still a real answer —
  // but if there were words AND facets and nothing scored, prefer the facet
  // matches over an empty screen rather than pretending the search failed.
  const anyHits = scored.some((s) => s.score > 0);
  const results = (anyHits && words.length ? scored.filter((s) => s.score > 0) : scored).slice(0, 60).map((s) => s.r);

  return NextResponse.json({
    interpreted,
    reading: filter.reading || "",
    filter: {
      region: filter.region || null,
      focus: filter.focus || [],
      modality: filter.modality || [],
      intent: filter.intent || [],
      difficulty: filter.difficulty || [],
      keywords: filter.keywords || [],
    },
    count: results.length,
    results,
  });
}
