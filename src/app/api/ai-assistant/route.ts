import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

import { resolveAiScope, enforceMeter } from "@/lib/ai/scope";
import { logUsage } from "@/lib/ai/meter";
import { SYMMETRY_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { isTrainerEmail, COACH_FIRST_NAME } from "@/lib/trainer";
import { modelFor } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import { assistantContext } from "@/lib/ai/assistantContext";

const SYSTEM_PROMPT = SYMMETRY_SYSTEM_PROMPT;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // This is the CLIENT side of the AI drawer — AIAssistant sends the trainer
    // to /api/agent and everybody else here. It was authenticated but entirely
    // unmetered: no per-client daily cap and, worse, no kill switch, so its
    // spend was invisible to the $95 ceiling. Thirty-five clients with an
    // uncapped chat box is the one shape of this app that can produce a
    // surprising bill.
    const scoped = await resolveAiScope(null);
    if (!scoped.ok) return scoped.response;
    const capped = await enforceMeter(scoped.scope.clientId, "client_assistant");
    if (capped) return capped;

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
        { error: `AI assistant not configured yet. Ask ${COACH_FIRST_NAME} to add ANTHROPIC_API_KEY to Vercel.` },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const isTrainer = isTrainerEmail(user.email);

    let systemPrompt = SYSTEM_PROMPT;
    systemPrompt += `\n\nCurrent user: ${isTrainer ? `Trainer (${COACH_FIRST_NAME})` : "Client"} — ${user.email}`;

    // What it actually knows about the person typing.
    //
    // It knew NOTHING before this — system prompt and a page string — so "what
    // am I doing today" got a general answer about the app instead of their
    // session. Compact by design: this is the highest-volume AI surface there
    // is, and the full coach context on every message would be the single most
    // expensive change available. See lib/ai/assistantContext.ts.
    //
    // It also carries the cleared-pool gate for the clients who have one, which
    // is the FIRST place that gate is enforced on a free-text surface. Their
    // AI cannot name a movement it was never handed.
    systemPrompt += await assistantContext(supabase, scoped.scope.clientId);
    if (context) systemPrompt += `\n\nPage context:\n${context}`;

    // Haiku for the roster, Sonnet for the clients who use this drawer AS the
    // app rather than as a side panel. The tier lookup fails to 'standard', so
    // an outage cannot quietly put thirty-five people on the expensive model.
    const model = modelFor("chat", await aiTierFor(supabase, scoped.scope.clientId));

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-20),
    });

    await logUsage(
      scoped.scope.clientId ?? null,
      "client_assistant",
      response.usage?.input_tokens ?? 0,
      response.usage?.output_tokens ?? 0,
      model,
    );

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ message: text });
  } catch (err: any) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}
