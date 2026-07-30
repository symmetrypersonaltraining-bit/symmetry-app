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

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { SONNET_MODEL } from "@/lib/ai/anthropic";
import { logUsage } from "@/lib/ai/meter";
import { resolveAiScope, enforceMeter, missingKeyResponse, Db } from "@/lib/ai/scope";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyProposal, loadDayTree, CT_TODAY, Proposal } from "@/lib/ai/workoutAdjust";
import { assembleCoachContext, assembleTrainingContext } from "@/lib/ai/coach-context";

export const runtime = "nodejs";

const SYSTEM = `You are Dustin's in-app AI for Symmetry Personal Training — his corrective + physique coaching business. You work exactly like chatting with Claude about his clients: you can look up ANY client, read everything about them, and make changes for him, especially programming. Be direct, concrete, and useful. Dustin is the only user; act on his behalf.

Use the tools to get real data before answering — never guess a client's numbers, program, or macros. To act on a client, first find them (find_clients) unless an id is already in context, then read what you need, then make the change with the write tools and tell him plainly what you did.

Programming rules you must always honor:
- NEVER program Olympic/power lifts (cleans, snatches, jerks, high pulls, push press) or strongman.
- Pull-ups are ALWAYS "Machine Assisted Pull Up" — never weighted. Barbell hip thrust → "Hip Thrust Machine".
- Sevens Gym equipment only: cable rig, dumbbells, barbells + racks, leg press, GHD, Smith, kettlebells, pendulum squat, belt squat, battle ropes, treadmill, plyo boxes, bands, med/stability balls, pull-up bar, hip thrust machine, machine assisted pull up. NOT available: rower/erg, elliptical, cable fly machine.
- Corrective progression is pain/quality-gated. NASM language stays internal — never client-facing.

Writing workouts: adjust_workout only touches THIS client's scheduled sessions (it clones a shared template into a client-owned copy first). Use scope "one" for a single session or "series" for all upcoming sessions of that workout — if it's ambiguous, ask Dustin which he wants before a big change. Reference the exact SW-id / section_id / pe_id from client_workouts.

Keep replies tight. After a change, confirm exactly what you did in one or two sentences.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "find_clients", description: "Find clients by name (partial, case-insensitive). Omit query to list all clients. Returns id, name, primary_goal.", input_schema: { type: "object", properties: { query: { type: "string", description: "name fragment; omit to list all" } } } },
  { name: "client_overview", description: "Full snapshot of one client: profile, goals, injuries, latest weight/body-fat + trend, active program + current phase, macro targets, workout adherence/streak.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "client_workouts", description: "The client's upcoming scheduled workouts with full exercise detail — includes the SW-id, section_id and pe_id required to adjust them.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "client_nutrition", description: "The client's live meal plan (meals + foods + macros), current macro targets, recent daily totals, and averages vs targets.", input_schema: { type: "object", properties: { client_id: { type: "string" } }, required: ["client_id"] } },
  { name: "adjust_workout", description: "Change a client's scheduled workout (swap/modify/remove/add exercises). Clones a library day into a client-owned copy — never edits the master library.", input_schema: { type: "object", properties: {
    client_id: { type: "string" },
    scheduled_workout_id: { type: "string", description: "the SW-id from client_workouts" },
    scope: { type: "string", enum: ["one", "series"], description: "'one' = just that session; 'series' = all upcoming sessions of that workout" },
    summary: { type: "string", description: "one plain-English sentence describing the change" },
    changes: { type: "array", items: { type: "object", properties: {
      op: { type: "string", enum: ["swap", "modify", "remove", "add"] },
      pe_id: { type: "string", description: "for swap/modify/remove" },
      section_id: { type: "string", description: "for add" },
      to_exercise: { type: "string", description: "for swap: new exercise name" },
      exercise: { type: "string", description: "for add: exercise name" },
      type: { type: "string", enum: ["weight", "reps", "time"], description: "for add" },
      sets: { type: "number" }, reps: { type: "string" }, load: { type: "string" }, duration: { type: "string" }, note: { type: "string" },
    }, required: ["op"] } },
  }, required: ["client_id", "scheduled_workout_id", "scope", "changes", "summary"] } },
  { name: "set_macro_targets", description: "Set a client's daily macro targets. Creates a new dated target version effective today (history is kept).", input_schema: { type: "object", properties: {
    client_id: { type: "string" }, calories: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fats: { type: "number" }, rationale: { type: "string" },
  }, required: ["client_id", "calories", "protein", "carbs", "fats"] } },
];

async function execTool(db: Db, name: string, input: Record<string, unknown>): Promise<string> {
  try {
    if (name === "find_clients") {
      const q = typeof input.query === "string" ? input.query.trim() : "";
      let query = db.from("clients").select("id, name, primary_goal").order("name").limit(60);
      if (q) query = db.from("clients").select("id, name, primary_goal").ilike("name", `%${q}%`).order("name").limit(60);
      const { data } = await query;
      return JSON.stringify(data || []);
    }
    const clientId = typeof input.client_id === "string" ? input.client_id : "";
    if (!clientId) return "Error: client_id required.";

    if (name === "client_overview") {
      const [profRes, mRes, apRes, mtRes] = await Promise.all([
        db.from("clients").select("name, email, date_of_birth, experience_level, primary_goal, secondary_goals, training_frequency, days_per_week, injuries_limitations, injuries, current_weight, current_body_fat_pct, notes, start_date").eq("id", clientId).maybeSingle(),
        db.from("metrics").select("metric_date, weight, body_fat_pct").eq("client_id", clientId).order("metric_date", { ascending: false }).limit(6),
        db.from("program_assignments").select("program_id, programs(name, phases(label, position))").eq("client_id", clientId).eq("active", true).limit(1).maybeSingle(),
        db.from("macro_targets").select("calories, protein, carbs, fats, effective_date").eq("client_id", clientId).order("effective_date", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const training = await assembleTrainingContext(db, clientId);
      return JSON.stringify({ profile: profRes.data, recent_metrics: mRes.data, active_program: apRes.data, macro_targets: mtRes.data, training_context: training });
    }

    if (name === "client_workouts") {
      const today = CT_TODAY();
      const { data: sws } = await db.from("scheduled_workouts").select("id, scheduled_date, status, day_id").eq("client_id", clientId).is("deleted_at", null).eq("status", "scheduled").gte("scheduled_date", today).order("scheduled_date").limit(10);
      const out: string[] = [];
      for (const sw of ((sws as { id: string; scheduled_date: string; day_id: string }[]) || [])) {
        const day = await loadDayTree(db, sw.day_id);
        out.push(`[SW-id ${sw.id}] ${sw.scheduled_date} — ${day?.label || "workout"}`);
        for (const s of (day?.sections || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
          out.push(`  Section "${s.client_facing_name || s.internal_name}" (section_id ${s.id}):`);
          for (const pe of (s.prescribed_exercises || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0))) {
            out.push(`    - [pe_id ${pe.id}] ${pe.exercises?.name || "exercise"} ${pe.sets ?? ""}x${pe.volume_value ?? ""}${pe.load_descriptor ? ` (${pe.load_descriptor})` : ""}${pe.cue ? ` — ${pe.cue}` : ""}`);
          }
        }
      }
      return out.length ? out.join("\n") : "No upcoming scheduled workouts.";
    }

    if (name === "client_nutrition") {
      const ctx = await assembleCoachContext(db, clientId);
      return ctx;
    }

    if (name === "adjust_workout") {
      const proposal: Proposal = {
        scheduled_workout_id: String(input.scheduled_workout_id || ""),
        reason: "", summary: typeof input.summary === "string" ? input.summary : "",
        changes: Array.isArray(input.changes) ? (input.changes as Proposal["changes"]) : [],
      };
      const scope = input.scope === "series" ? "series" : "one";
      const res = await applyProposal(db, clientId, proposal, scope);
      return res.message;
    }

    if (name === "set_macro_targets") {
      const today = CT_TODAY();
      const row = {
        client_id: clientId,
        calories: Math.round(Number(input.calories) || 0),
        protein: Math.round(Number(input.protein) || 0),
        carbs: Math.round(Number(input.carbs) || 0),
        fats: Math.round(Number(input.fats) || 0),
        effective_date: today,
        rationale: typeof input.rationale === "string" ? input.rationale : null,
      };
      const { error } = await db.from("macro_targets").insert(row);
      if (error) return `Error setting macro targets: ${error.message}`;
      return `Set macro targets effective ${today}: ${row.calories} kcal, ${row.protein}P / ${row.carbs}C / ${row.fats}F.`;
    }

    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool error: ${(e as Error).message}`;
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return missingKeyResponse();

  let body: { messages?: { role: string; content: string }[]; pageContext?: string };
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

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages: Anthropic.MessageParam[] = incoming
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  if (!messages.length) return NextResponse.json({ error: "No message." }, { status: 400 });

  const system = body.pageContext ? `${SYSTEM}\n\nCurrent page context (what Dustin is looking at): ${body.pageContext}` : SYSTEM;

  const client = new Anthropic({ apiKey });
  let tokensIn = 0, tokensOut = 0;
  try {
    for (let i = 0; i < 8; i++) {
      const resp = await client.messages.create({ model: SONNET_MODEL, max_tokens: 1600, system, tools: TOOLS, messages });
      tokensIn += resp.usage?.input_tokens ?? 0;
      tokensOut += resp.usage?.output_tokens ?? 0;

      if (resp.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: resp.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of resp.content) {
          if (block.type === "tool_use") {
            const out = await execTool(admin, block.name, (block.input as Record<string, unknown>) || {});
            results.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      if (scope.clientId) await logUsage(scope.clientId, "chat", tokensIn, tokensOut, SONNET_MODEL);
      return NextResponse.json({ message: text || "(done)" });
    }
    if (scope.clientId) await logUsage(scope.clientId, "chat", tokensIn, tokensOut, SONNET_MODEL);
    return NextResponse.json({ message: "That took several steps — tell me the next thing and I'll keep going." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("agent failed:", msg);
    return NextResponse.json({ error: `Agent error — ${msg.slice(0, 140)}` }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
