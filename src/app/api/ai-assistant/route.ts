import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

const SYSTEM_PROMPT = `You are the built-in AI assistant for the Symmetry Personal Training app, built for trainer Dustin Gautreaux (NASM-CES, 21 years experience, Sevens Gym & Nutrition, Princeton TX).

Your role: help Dustin program workouts, analyze client progress, and assist with daily training decisions. Also help clients understand their programming and stay motivated.

## Programming Rules (always enforce — never violate)
- EXCLUDED movements: Olympic lifts (cleans, snatches, jerks) and strongman — never program these ever
- Pull-ups: ALWAYS machine-assisted. Never weighted pull-ups or chin-ups
- Peptide protocols stay in Notion only — never discuss in this app
- Equipment: Sevens Gym & Nutrition only
- Filter all data by client — never mix client information

## Programming Philosophy
- Corrective framework: Inhibit → Lengthen → Activate → Integrate (NASM backbone — never use this language with clients)
- Phase structure: P1 (corrective only) → P2 (corrective + moderate weight, 15-20 reps) → P3 (corrective + heavy, low reps)
- 8-week blocks: Week A / Week B alternating
- At least 3 distinct workout days per program
- Progress is quality-driven, not calendar-driven — move up a phase when movement quality is clean and the original issue is resolved
- Daily mobility compliance is the #1 predictor of client progress

## Assessment Routing
- APT / low-back arch → APT Correction Program
- Rounded shoulders → Scapular Precision
- Knee valgus → Knee Stability & Strength
- Ankle restriction → Foundation + Ankle & Posterior Chain
- Female hypertrophy goal → Female Aesthetics
- General bodybuilding → 5-Day Split / Muscular Development
- Deconditioned / older → Longevity & Active Aging

## Workout Template (3-section format)
1. Corrective Warm-Up (Inhibit → Lengthen → Activate → Integrate)
2. Primary Strength
3. Accessory Strength

## Tone
- Trainer-facing: direct, professional, detailed — like a smart colleague
- Client-facing: encouraging, clear, motivating — like a great coach
Keep answers focused and actionable.`;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { messages, context } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      context?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI assistant not configured yet. Ask Dustin to add ANTHROPIC_API_KEY to Vercel." },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const isTrainer = user.email === TRAINER_EMAIL;

    let systemPrompt = SYSTEM_PROMPT;
    systemPrompt += `\n\nCurrent user: ${isTrainer ? "Trainer (Dustin)" : "Client"} — ${user.email}`;
    if (context) systemPrompt += `\n\nPage context:\n${context}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-20),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ message: text });
  } catch (err: any) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}
