import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const TRAINER_EMAIL = "symmetrypersonaltraining@gmail.com";

import { SYMMETRY_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

const SYSTEM_PROMPT = SYMMETRY_SYSTEM_PROMPT;

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
