// POST /api/nutrition-ai/act
// Body: { message: string, clientId?: string, dayContext?: [{ position, label,
//         name, logged, kcal, p, c, f }] }  (dayContext = today's meals as the
//         v3 logger renders them)
// ONE endpoint for the "do-anything" coach chat:
//   1. Haiku extracts an action intent from the free-text message against the
//      day context (strict tool-style JSON, validated with one retry):
//      {intent, params, confirmation, reply}. Meal references resolve by
//      position OR fuzzy name/label match server-side; anything missing or
//      ambiguous is downgraded to a clarifying question — never a guess.
//   2. intent 'none' + no clarification needed → falls through to the exact
//      existing coach Q&A behavior (14-day context, same system prompt,
//      suggestions chips) so questions and actions share one endpoint.
// NOTHING mutates here — the client renders a confirmation card and executes
// via its own existing write helpers only after an explicit Confirm tap.
// Auth-checked, client-scoped, metered (feature 'chat'), Haiku.

import { NextRequest, NextResponse } from "next/server";
import { HAIKU_MODEL, modelFor, callClaudeJson } from "@/lib/ai/anthropic";
import { aiTierFor } from "@/lib/ai/tier";
import {
  ActDayMeal, ActReply, finalizeAct, validateActReply, validateCoachReply,
} from "@/lib/ai/nutrition-json";
import { logUsage } from "@/lib/ai/meter";
import { enforceMeter, missingKeyResponse, resolveAiScope } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_SYSTEM_PROMPT, assembleCoachContext } from "@/lib/ai/coach-context";
import { coachFirstNameForClient } from "@/lib/trainerResolve";
import { COACH_FIRST_NAME } from "@/lib/trainer";
import { SYMMETRY_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { assistantContext } from "@/lib/ai/assistantContext";
import { runClientAssistant } from "@/lib/ai/clientAssistantRun";

import {
  loadMemory, loadRecentTurns, memoryBlock, recordTurns,
  countUnfolded, shouldFold, foldMemory,
} from "@/lib/ai/clientMemory";

const ACT_SYSTEM_PROMPT = `You are the action extractor for the nutrition coach chat inside the Symmetry Personal Training app. The client sends a free-text message plus DAY CONTEXT: the viewed day's meals as JSON [{position, label, name, logged, kcal, p, c, f}] ("label" is the on-screen name like "M2"; "position" is the stable id you must use in params).

Decide if the message is a REQUEST TO CHANGE THE VIEWED DAY'S LOG or just a question/chat. Respond with ONLY valid JSON — no markdown, no fences — exactly:
{"intent":"swap_meal"|"move_meal"|"copy_meal"|"delete_meal"|"add_snack"|"log_meal"|"unlog_meal"|"none","params":{...},"confirmation":string|null,"reply":string}

Intents and their params:
- swap_meal — replace one meal's contents with different food. params: {"position":number|null,"meal_name":string|null,"new_name":string,"items":[{"name":string,"amount":number|null,"unit":string|null,"p":number,"c":number,"f":number,"kcal":number}]}. Estimate realistic macros per item (grams protein/carbs/fat, kcal).
- move_meal — reorder a meal to another meal's spot. params: {"from_position":number|null,"from_name":string|null,"to_position":number|null,"to_name":string|null}.
- copy_meal — duplicate a meal; the copy lands right after the "to" meal, or at the end of the day when "to" is omitted. params: same keys as move_meal (to_* may be null).
- delete_meal — remove a meal from today only. params: {"position":number|null,"meal_name":string|null}.
- add_snack — the client ate something extra / off-plan. params: {"name":string,"items":[same item shape as swap_meal]}.
- log_meal — mark a meal eaten. params: {"position":number|null,"meal_name":string|null,"adherence":"Full"|"3/4"|"1/2"|"1/4"|"Skipped"} (default "Full"; "I ate most of it" → "3/4", "half" → "1/2", etc.).
- unlog_meal — undo a logged meal. params: {"position":number|null,"meal_name":string|null}.
- none — a question, general chat, or an action you cannot fill in yet. params: {"clarify":boolean}.

Rules:
- Use "position" values EXACTLY as given in DAY CONTEXT. If the client names a meal instead, put their words in the *_name field and leave position null.
- If the message asks for an action but the target meal is ambiguous (several plausible matches) or required details are missing (e.g. "swap a meal" with no food), respond intent "none" with params {"clarify":true} and ONE short clarifying question in "reply". Never guess.
- If the message is a question or general chat, respond intent "none" with params {"clarify":false} and a brief placeholder in "reply" (a fuller coach answer is generated separately).
- TRAINING IS NOT YOURS. Anything about workouts, sessions, cardio, the schedule, moving/swapping/rescheduling a SESSION, or what to train today is handled by another part of the same coach. For those, respond intent "none" with params {"clarify":false} and an EMPTY "reply" — never a clarifying question, and never a sentence describing yourself as the meal or macro tracker. You are one part of one coach; the client must never be told to pick which part they are talking to. The word "move" is the trap: "move my cardio to tomorrow" is training, not a meal.
- "confirmation" (action intents only): ONE human sentence describing exactly what will happen, including estimated kcal and P/C/F where relevant, e.g. "Swap M4 → Salmon + rice (est 520 kcal · 42P/45C/16F)?". For intent "none" use null.
- "reply": a short, friendly coach response (1-2 sentences) to show above the confirmation card.
- You act on THE DAY BEING VIEWED, which is stated in the user turn as LOG DATE. It is usually today; it is sometimes an earlier day the client is catching up on. Either way DAY CONTEXT is that day's meals, and any action you extract applies to it. Requests about a DIFFERENT day, the plan itself, or targets → intent "none" (answer as chat).
- If LOG DATE is not today, say which day you are logging to in "confirmation" — e.g. "Add Greek yogurt to Fri Jul 31 (est 150 kcal · 15P/12C/4F)?". Confirming a write onto the wrong day is the one mistake here that quietly corrupts a closed day's numbers.`;

const MAX_DAY_MEALS = 30;

function sanitizeDayContext(raw: unknown): ActDayMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: ActDayMeal[] = [];
  for (const m of raw.slice(0, MAX_DAY_MEALS)) {
    if (!m || typeof m !== "object") continue;
    const o = m as Record<string, unknown>;
    const position = Number(o.position);
    if (!Number.isFinite(position) || position <= 0) continue;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
    if (!name) continue;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
    out.push({
      position: Math.round(position),
      label: typeof o.label === "string" ? o.label.trim().slice(0, 40) : null,
      name,
      logged: Boolean(o.logged),
      kcal: num(o.kcal), p: num(o.p), c: num(o.c), f: num(o.f),
    });
  }
  return out;
}

/** Flatten resolved params into the wire shape the confirmation card executes. */
function wireParams(act: ActReply): Record<string, unknown> {
  const p = act.params;
  switch (act.intent) {
    case "swap_meal": return { position: p.meal!.position, name: p.name, items: p.items };
    case "move_meal": return { from: p.from!.position, to: p.to!.position };
    case "copy_meal": return { from: p.from!.position, to: p.to ? p.to.position : null };
    case "delete_meal":
    case "unlog_meal": return { position: p.meal!.position };
    case "log_meal": return { position: p.meal!.position, adherence: p.adherence ?? "Full" };
    case "add_snack": return { name: p.name, items: p.items };
    default: return {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    // Conversation history. Both calls below used to send a single user turn, so
    // every message was turn one: the sheet rendered bubbles and a typing
    // indicator over a model with no memory. "Swap M4 for salmon" -> "actually
    // make it 8oz" and it had no idea what "it" was. Capped at 12 turns and 700
    // chars each so a long session cannot blow the context or the bill.
    const history: Array<{ role: "user" | "assistant"; content: string }> =
      Array.isArray(body?.history)
        ? body.history
            .filter((t: unknown): t is { role: string; content: string } =>
              !!t && typeof (t as any).content === "string" &&
              ((t as any).role === "user" || (t as any).role === "assistant"))
            .slice(-12)
            .map((t: { role: string; content: string }) => ({
              role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
              content: t.content.slice(0, 700),
            }))
        : [];
    if (!message) {
      return NextResponse.json({ error: "Say something first — tell me what you ate or what to change." }, { status: 400 });
    }
    if (message.length > 1500) {
      return NextResponse.json({ error: "That message is too long — keep it under 1500 characters." }, { status: 400 });
    }
    const day = sanitizeDayContext(body?.dayContext);
    // The day the logger is actually showing. The client writes every action to
    // this date, so the model has to be told it — it used to be instructed to
    // "only ever change TODAY's log" while the writes went wherever the user
    // had navigated. Falls back to today when absent (older clients).
    const todayCT = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const logDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.logDate || "")) ? String(body.logDate) : todayCT;
    const dayName = new Date(logDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

    const scoped = await resolveAiScope(typeof body?.clientId === "string" ? body.clientId : null);
    if (!scoped.ok) return scoped.response;
    const { supabase, clientId } = scoped.scope;
    if (!clientId) {
      return NextResponse.json({ error: "Pick a client first — the coach needs a client's data." }, { status: 400 });
    }

    const metered = await enforceMeter(clientId, "coach_action");
    if (metered) return metered;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return missingKeyResponse();

    // The tier, resolved once for both passes below.
    //
    // For an advanced-tier client this raises the EXTRACTION model, not the
    // coach one — see the note in lib/ai/anthropic.ts. Their failure mode is
    // the app misreading "move Friday to Saturday", not the coaching being
    // shallow, and a wrong parse is the app doing the wrong thing to their
    // schedule rather than merely a weak answer.
    const tier = await aiTierFor(supabase, clientId);

    // ---- pass 1: intent extraction against the day context -----------------
    const extraction = await callClaudeJson({
      meter: { clientId: clientId, feature: "coach_action" },
      apiKey,
      model: modelFor("extract", tier),
      system: ACT_SYSTEM_PROMPT,
      maxTokens: 800,
      messages: [
        ...history,
        {
          role: "user",
          content:
            `LOG DATE: ${logDate} (${dayName})${logDate === todayCT ? " — this IS today" : " — NOT today; the client is catching up on an earlier day"}\n\n` +
            `DAY CONTEXT (that day's meals, trusted):\n${JSON.stringify(day)}\n\nCLIENT MESSAGE:\n${message}`,
        },
      ],
      validate: validateActReply,
    });
    await logUsage(clientId, "coach_action", extraction.tokensIn, extraction.tokensOut, modelFor("extract", tier), { latencyMs: extraction.latencyMs, startedAt: extraction.startedAt });

    // Even a failed extraction should degrade to Q&A, not an error bubble.
    const act: ActReply = extraction.value
      ? finalizeAct(extraction.value, day)
      : { intent: "none", params: { clarify: false }, confirmation: null, reply: "" };

    if (act.intent !== "none") {
      return NextResponse.json({
        intent: act.intent,
        params: wireParams(act),
        confirmation: act.confirmation,
        reply: act.reply,
      });
    }

    // ---- ONE AI: the workout tools, offered before the nutrition answer -----
    //
    // Dustin, 12 Aug: "one AI that does all of it." Until now there were two,
    // and only the one nobody could open could do anything.
    //
    // The five client action tools shipped in `0636890` were UNREACHABLE BY
    // ANYONE: /api/ai-assistant grants them only when `!isTrainer`, while both
    // buttons that open it render only when `isTrainer && !clientMode`. So a
    // client could never open the drawer, and a trainer who could was given no
    // tools. Everything built on top — the contraindication gate, the cleared
    // pool, the write-time re-check for Gerard and Sharon — sat behind a door
    // with no handle.
    //
    // He found it by asking this very chat, from the client app, to adapt his
    // session to a hotel gym. It told him to message his trainer. He is the
    // trainer.
    //
    // WHY THIS SHAPE, AND NOT A NEW INTENT. Adding `workout_help` to the pass-1
    // schema would mean touching ACT_INTENTS, the ActReply type, the switch and
    // the client's handling of every intent — a change that ripples through the
    // nutrition path that 35 people use to log food every day, to add something
    // that path does not care about.
    //
    // Instead the tool loop runs FIRST and its answer is used ONLY IF A TOOL
    // ACTUALLY RAN. Ask about macros and the model reaches for no workout tool,
    // `toolsUsed` comes back 0, the result is discarded, and the existing coach
    // path below runs exactly as it did before — same context, same memory,
    // same suggestion chips, bit for bit. Ask to move Friday's session and a
    // tool runs and answers. The nutrition contract is untouched by
    // construction rather than by careful editing.
    //
    // Cost is one extra call on question turns. Thirty days of every AI call in
    // this app came to $2.84 against a $95 cap, so this is affordable; it is
    // metered as its own feature so it stays visible if that ever stops being
    // true.
    if (clientId && apiKey) {
      try {
        const assistantSystem =
          SYMMETRY_SYSTEM_PROMPT(await coachFirstNameForClient(supabase, clientId, COACH_FIRST_NAME)) +
          `\n\nCurrent user: Client` +
          (await assistantContext(supabase, clientId)) +
          `\n\nTODAY IS ${logDate}. Only reach for a tool when the client is asking about their ` +
          `TRAINING — their schedule, moving or swapping a session, what to do today, or logging a ` +
          `weigh-in. If they are asking about food, meals, macros or their plan, answer nothing here ` +
          `and call no tool: a different part of the coach handles nutrition and will answer them properly.` +
          `\n\nANY QUESTION ABOUT A PERIOD OF TIME — "last 3 weeks", "this month", "since I started", ` +
          `"how have I been doing", "am I being consistent", "progress lately" — MUST be answered from ` +
          `my_training_summary, called with that exact period resolved to dates. Do not answer it from the ` +
          `session list in your context and do not estimate. That list is only what they DID; it cannot ` +
          `show what they missed, so reading consistency off it makes every client look good and the ` +
          `worst attenders look best. Report the period you were asked for, not a different one, and if ` +
          `attendance is poor say so plainly and kindly rather than describing only the sessions they made.`;

        // Hoisted rather than inlined into logUsage below: the aiFeatures guard
        // test scans metering calls for the retired catch-all labels, and
        // `modelFor("chat", …)` sitting inside one reads as the old "chat"
        // feature name. Computing it once is better anyway.
        const toolModel = modelFor("chat", tier);

        const run = await runClientAssistant({
          apiKey,
          model: toolModel,
          systemPrompt: assistantSystem,
          supabase,
          clientId,
          today: logDate,
          messages: [...history, { role: "user", content: message }],
        });

        if (run.toolsUsed > 0 && run.text) {
          await logUsage(clientId, "coach_workout_tools", run.tokensIn, run.tokensOut, toolModel);
          // THE WORKOUT PATH MUST REMEMBER TOO.
          //
          // The first cut of this branch returned here directly and skipped
          // persist(), so every workout conversation was forgotten the moment
          // it ended: ask to move Friday, then say "actually make it Saturday",
          // and the coach had no idea what "it" was. Caught by counting rows in
          // ai_chat_turns after four real conversations and finding only two —
          // the nutrition one. The same way the original memory bug was caught,
          // and it would have failed just as silently, because persist()
          // swallows its errors by design.
          await persist(memDbFor(), clientId, message, run.text, apiKey);
          return NextResponse.json({ intent: "none", message: run.text });
        }
      } catch {
        // A failure here must never cost someone their nutrition answer. Fall
        // through to the coach exactly as if the tools had not been offered.
      }
    }

    // Clarifying question (ambiguous/missing reference) — return it directly.
    //
    // ⛔ THIS RUNS AFTER THE WORKOUT TOOLS, ON PURPOSE. It used to run before
    // them, and that put the whole feature back where it started.
    //
    // "Move it ill do it later today" — about a CARDIO session — was read by
    // the nutrition extractor as a possible move_meal it could not resolve, so
    // it returned its clarifying question and the workout tools were never
    // reached. Dustin got "is this a nutrition log request, or are you asking
    // me to reschedule your workout plan? I'm the meal & macro tracker here."
    // One turn earlier the same chat had correctly warned him he would end up
    // with two cardio sessions in a day, so the tools plainly worked; they were
    // simply one branch too far down.
    //
    // Order now: definite nutrition action → tools → nutrition clarification →
    // coach. A training request can no longer be intercepted by a guess about
    // meals.
    if (act.params.clarify && act.reply) {
      return NextResponse.json({ intent: "none", message: act.reply });
    }

    // ---- intent 'none' = a question → the existing coach behavior ----------
    //
    // TWO MODELS, ON PURPOSE. The extraction above is a fixed-schema pull out of
    // a short list of meals: Haiku is both right and fast at it, and the client
    // is waiting on it before anything else happens.
    //
    // This call is the opposite job. It reads fourteen days of logging, the
    // weight trend, the plan and the targets, and has to say something true and
    // useful about them. Dustin, 2026-08-12: "i want the ai functions in this
    // app to feel so accurate and personal that it blows plps minds." That is a
    // judgement task, and it is the ONE call in the client app where the model
    // is the product. Thirty days of every AI call in the whole app cost $2.84
    // against a $95 cap, so the constraint here was never money.
    // WHAT THEY HAVE TOLD YOU, as opposed to what they have logged.
    //
    // assembleCoachContext is their DATA — fourteen days of logging, the weight
    // trend, targets, plan. It made the coach sound informed while it had no
    // idea the client had ever spoken to it. This is the other half: the
    // running picture of what they have actually said, permanent and
    // per-client, plus the tail of the last real conversation so picking up
    // mid-thought feels like picking up mid-thought.
    //
    // Both are best-effort. A coach that forgets is a worse coach; a coach that
    // 500s because a memory read failed is not a coach at all.
    const context = await assembleCoachContext(supabase, clientId);

    // MEMORY GOES THROUGH THE ADMIN CLIENT, NOT THE CLIENT'S OWN.
    //
    // `scope.supabase` is the cookie-scoped client, so it is bound by RLS —
    // and ai_chat_turns / ai_client_memory deliberately have SELECT policies
    // and NO insert or update policy, because a client editing what their coach
    // remembers about them, from the browser, is not a feature.
    //
    // Which meant the first version wrote nothing at all. Every insert was
    // refused, and recordTurns swallows its errors by design (a lost turn must
    // never cost someone their answer), so it failed in total silence: the
    // coach replied perfectly and ai_chat_turns stayed on zero rows. Caught by
    // querying the table after a real conversation rather than by reading the
    // code, which is the only way this one was ever going to show up.
    const memDb = createAdminClient();
    const memory = await loadMemory(memDb, clientId);
    const remembered = memoryBlock(memory);
    // The sheet only sends what is still on screen, and it clears on close. The
    // transcript is what carries EARLIER conversations in.
    //
    // Both are loaded every time, not one or the other: dropping the transcript
    // as soon as a live thread existed meant the second message of a session
    // silently lost every previous conversation — the coach would remember you
    // on your first question and forget you on your second. The two are merged
    // by content instead, so a turn that appears in both is only sent once.
    const liveText = new Set(history.map((h) => h.content.trim()));
    const priorTurns = (await loadRecentTurns(memDb, clientId)).filter(
      (t) => !liveText.has(t.content.trim().slice(0, 700))
    );

    const coach = await callClaudeJson({
      meter: { clientId: clientId, feature: "coach_action" },
      apiKey,
      // Every coach surface in the app funnels through this route, so resolving
      // the tier here is what makes "a lot higher model across the entire app"
      // true rather than true-on-the-screens-someone-remembered.
      model: modelFor("coach", tier),
      system: COACH_SYSTEM_PROMPT(await coachFirstNameForClient(supabase, clientId, COACH_FIRST_NAME)),
      maxTokens: 900,
      messages: [
        ...priorTurns.map((t) => ({
          role: (t.role === "client" ? "user" : "assistant") as "user" | "assistant",
          content: t.content.slice(0, 700),
        })),
        ...history,
        {
          role: "user",
          content:
            (remembered ? remembered + "\n\n" : "") +
            `CONTEXT (server-assembled, trusted):\n${context}\n\nMEALS ON ${logDate} (${dayName}):\n${JSON.stringify(day)}\n\nCLIENT QUESTION:\n${message}`,
        },
      ],
      validate: validateCoachReply,
    });
    await logUsage(clientId, "coach_action", coach.tokensIn, coach.tokensOut, modelFor("coach", tier), { latencyMs: coach.latencyMs, startedAt: coach.startedAt });

    if (coach.value) {
      // Written AFTER the reply, so a failure here can never cost the client
      // their answer — and awaited rather than fired-and-forgotten, because a
      // serverless function is frozen the moment the response is returned and
      // a detached promise would simply never run.
      await persist(memDb, clientId, message, coach.value.message, apiKey);
      return NextResponse.json({ intent: "none", message: coach.value.message, suggestions: coach.value.suggestions });
    }
    // Salvage: a plain-text reply (or the extractor's placeholder) still helps.
    const fallback = coach.rawText.replace(/```(?:json)?|```/g, "").trim() || act.reply;
    if (fallback) {
      await persist(memDb, clientId, message, fallback.slice(0, 1200), apiKey);
      return NextResponse.json({ intent: "none", message: fallback.slice(0, 1200) });
    }
    return NextResponse.json({ error: "The coach couldn't answer right now — try again in a moment." }, { status: 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("nutrition-ai/act failed:", msg);
    return NextResponse.json({ error: `Coach failed — ${msg.slice(0, 120)}` }, { status: 500 });
  }
}

/**
 * Store the exchange, and redraw the running picture when enough has been said.
 *
 * Both halves are swallowed on failure: the client already has their answer,
 * and losing a turn is not worth turning a good reply into an error.
 */
async function persist(
  db: Parameters<typeof recordTurns>[0],
  clientId: string,
  clientSaid: string,
  coachSaid: string,
  apiKey: string
): Promise<void> {
  try {
    await recordTurns(
      db,
      clientId,
      [
        { role: "client", content: clientSaid },
        { role: "coach", content: coachSaid },
      ],
      "coach"
    );
    const mem = await loadMemory(db, clientId);
    const unfolded = await countUnfolded(db, clientId, mem.foldedThrough);
    if (shouldFold(mem, unfolded)) await foldMemory(db, clientId, apiKey);
  } catch (e) {
    console.error("act: persisting the exchange failed", e);
  }
}

/**
 * The admin client for memory writes.
 *
 * ai_chat_turns / ai_client_memory have SELECT policies and deliberately NO
 * insert or update policy — a client editing what their coach remembers about
 * them, from the browser, is not a feature. So memory has to go through the
 * service role, and both call sites need the same one.
 */
function memDbFor() {
  return createAdminClient();
}

export const dynamic = "force-dynamic";
