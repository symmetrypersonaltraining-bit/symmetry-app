import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

import { resolveAiScope, enforceMeter } from "@/lib/ai/scope";
import { logUsage } from "@/lib/ai/meter";
import { SYMMETRY_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { isTrainerEmail } from "@/lib/trainer";
import { coachForViewer } from "@/lib/coachIdentity";
import { modelFor } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import { assistantContext } from "@/lib/ai/assistantContext";
import { runClientAssistant } from "@/lib/ai/clientAssistantRun";
import { CT_TODAY } from "@/lib/ai/coach-context";



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
        { error: "AI assistant not configured yet. Ask your coach to add ANTHROPIC_API_KEY to Vercel." },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey });
    const isTrainer = isTrainerEmail(user.email);

    // WHOSE app this is. The prompt used to be a module constant carrying the
    // owner's name, credentials and biography, and the line below told the
    // model that any trainer signed in was him — so Stephanie's session opened
    // with "Current user: Trainer (Dustin)".
    const me = await coachForViewer(supabase as never, user.id);
    let systemPrompt = SYMMETRY_SYSTEM_PROMPT(me.firstName, me.name);
    systemPrompt += `\n\nCurrent user: ${isTrainer ? `Trainer (${me.name})` : "Client"} — ${user.email}`;

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

    // ── THE TOOL LOOP ────────────────────────────────────────────────────────
    //
    // Dustin, on his parents: "I need their AI to be able to do anything they
    // need to do in that app for them so they don't have to figure it out."
    // Answering accurately was half of it; this is the half where it can
    // actually move a workout rather than describing where the button is.
    //
    // Tools are offered ONLY to a resolved client. A trainer here goes to
    // /api/agent, which has its own much larger toolset — and CLIENT_TOOLS is a
    // separate list rather than a filtered view of that one, precisely so that
    // send_message and set_macro_targets are not names this route could utter
    // even if something talked it into trying.
    //
    // Four rounds, not unbounded. Every tool here is a single read or a single
    // write; a model still going at round five is looping, and the honest
    // outcome is the text it has rather than a bill.
    const canAct = !isTrainer && !!scoped.scope.clientId;
    const today = CT_TODAY();

    // The loop itself now lives in lib/ai/clientAssistantRun so the ✦ Coach can
    // run the SAME code rather than a second copy that drifts. See that file for
    // why: these tools were unreachable by anyone for a week because this route
    // grants them only to clients while both buttons that open it render only
    // for trainers.
    let text = "";
    let totalIn = 0;
    let totalOut = 0;

    if (canAct) {
      const run = await runClientAssistant({
        apiKey,
        model,
        systemPrompt,
        supabase,
        clientId: scoped.scope.clientId as string,
        today,
        messages,
      });
      text = run.text;
      totalIn = run.tokensIn;
      totalOut = run.tokensOut;
    } else {
      // A trainer here gets plain chat; /api/agent has their much larger toolset.
      const anthropic = new Anthropic({ apiKey });
      const response = await anthropic.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      });
      totalIn = response.usage?.input_tokens ?? 0;
      totalOut = response.usage?.output_tokens ?? 0;
      text = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as Anthropic.TextBlock).text)
        .join("\n")
        .trim();
    }

    await logUsage(scoped.scope.clientId ?? null, "client_assistant", totalIn, totalOut, model);

    return NextResponse.json({ message: text });
  } catch (err: any) {
    console.error("AI assistant error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}
