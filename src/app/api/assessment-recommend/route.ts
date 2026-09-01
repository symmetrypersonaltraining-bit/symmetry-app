import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveAiScope, enforceMeter } from '@/lib/ai/scope';
import { logUsage } from '@/lib/ai/meter';
import { coachForViewer } from "@/lib/coachIdentity";
import { HAIKU_MODEL } from "@/lib/ai/anthropic";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  // This had NO auth check and NO metering: anyone who knew the URL could burn
  // Dustin's Anthropic budget a request at a time, and none of it counted
  // toward the $95 kill switch. It is reachable from the assessment page, so it
  // was not even obscure.
  const scoped = await resolveAiScope(null);
  if (!scoped.ok) return scoped.response;
  if (!scoped.scope.isTrainer) return NextResponse.json({ error: 'Trainer only' }, { status: 403 });
  const paused = await enforceMeter(null, "assessment_rec");
  if (paused) return paused;

  const data = await req.json();

  // The trainer using it, not the owner. This is trainer-facing, so no client
  // ever saw the wrong name — it just told the model Stephanie was Dustin.
  const me = await coachForViewer(scoped.scope.supabase as never, scoped.scope.userId);
  const coachName = me.name;

  // THE PROMPT NAMED THIRTEEN PROGRAMMES AND EIGHT OF THEM DO NOT EXIST.
  //
  // The routing block below was written by hand and never reconciled with the
  // `programs` table, so it offered "Scapular Precision Program" (the real one
  // is "Scapular Stability & Shoulder Mechanics"), "APT Correction Program"
  // (it is "APT Correction"), "5-Day Split" ("5-Day Bodybuilding Split") and
  // so on. Nothing downstream checked: the route returned whatever came back
  // verbatim and the assessment page rendered it as free text, so a trainer was
  // shown a confident recommendation for a programme they could not open.
  //
  // Reading the real list makes a hallucinated name impossible, and the model
  // returns the id so the answer resolves to an actual row. Live, shared
  // programmes only -- drafts are not something to start a client on, and a
  // personal programme belongs to one client already.
  const { data: programRows } = await scoped.scope.supabase
    .from("programs")
    .select("id, name, category")
    .is("personal_for_client_id", null)
    .eq("status", "live")
    .order("name");
  // The table carries duplicate names (the same block seeded per trainer), so
  // one entry per name, or the model is asked to choose between identical
  // options and the list is three times longer than it needs to be.
  const byName = new Map<string, { id: string; name: string; category: string | null }>();
  for (const r of (programRows ?? []) as { id: string; name: string; category: string | null }[]) {
    if (!byName.has(r.name)) byName.set(r.name, r);
  }
  const catalogue = [...byName.values()];
  const programList = catalogue
    .map((r) => `- ${r.name}${r.category ? ` (${r.category})` : ""} [id: ${r.id}]`)
    .join("\n");

  const prompt = `You are ${coachName}'s AI programming assistant for Symmetry Corrective. Based on this client assessment, recommend a starting program and write a brief assessment summary.

PROGRAMMING PHILOSOPHY (NASM Corrective, internal only - never use this language with clients):
- Movement assessment drives corrective backbone
- Goals layer on top as training emphasis
- Phase 1 = corrective only, Phase 2 = corrective warm-up + moderate weight, Phase 3 = corrective + heavy lifting
- Combine programs only when assessment requires it (e.g., back pain with ankle root)

PROGRAM ROUTING. These describe the SHAPE of the programme a finding calls for.
Match the shape to a real name from the catalogue at the end of this prompt:
- APT / low back arch → anterior pelvic tilt correction
- Rounded shoulders / arms fall forward → scapular stability and shoulder mechanics
- Forward head → scapular stability and shoulder mechanics
- Knee valgus → knee stability and strength
- Feet turn out / forward lean (ankle) → a foundation block combined with ankle and posterior chain
- Lateral asymmetry → asymmetrical weight shift and lumbar decompression
- Hip issues / replacement → the hip replacement and chronic hip pain protocol
- Balance / neuro deficit → neurological rehab and balance
- No major findings → route purely by goal
Goals layer: Female hypertrophy → female aesthetics | Bodybuilding → the 5-day split | Limited days → the 3-day split | Older/deconditioned → longevity / active ageing | Maintenance → maintenance

THE PROGRAMMES THAT ACTUALLY EXIST. The routing above describes the SHAPE of a
programme; these are the only real names. Choose one from this list and nothing
else, and return its id exactly as written. If no programme is a good match,
pick the closest and say so in the rationale.
${programList}

CLIENT ASSESSMENT DATA:
${JSON.stringify(data, null, 2)}

Respond with JSON only:
{
  "recommended_program": "the exact name from the list above",
  "recommended_program_id": "the id from the list above",
  "recommended_phase": "P1",
  "primary_corrective_finding": "One sentence",
  "program_rationale": "2-3 sentences explaining why this program for this client",
  "key_considerations": ["consideration 1", "consideration 2", "consideration 3"],
  "assessment_summary": "3-4 sentence client-friendly summary of their assessment results and what you'll be working on together"
}`;

  const message = await client.messages.create({
    // Was pinned to a DATED snapshot ('claude-haiku-4-5-20251001'), which is
    // worse than a plain literal: it survives a model rotation by continuing to
    // call a version everything else has left behind.
    model: HAIKU_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  await logUsage(null, "assessment_rec", message.usage?.input_tokens ?? 0, message.usage?.output_tokens ?? 0, HAIKU_MODEL);

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Could not parse recommendation' };

  // Trust the id, not the prose. A model can still mistype a name; it cannot
  // invent an id that resolves. When the id matches a real row the name is
  // rewritten from the row, so what the trainer reads is what they can open.
  const chosen = catalogue.find((r) => r.id === result?.recommended_program_id)
    ?? catalogue.find((r) => r.name === result?.recommended_program);
  if (chosen) {
    result.recommended_program = chosen.name;
    result.recommended_program_id = chosen.id;
  } else if (result?.recommended_program) {
    // Say so rather than presenting an unresolvable name as a decision.
    result.recommended_program_unmatched = true;
  }

  return NextResponse.json(result);
}
