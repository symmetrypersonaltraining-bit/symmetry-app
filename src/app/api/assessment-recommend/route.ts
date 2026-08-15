import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { resolveAiScope, enforceMeter } from '@/lib/ai/scope';
import { logUsage } from '@/lib/ai/meter';
import { COACH_NAME } from "@/lib/trainer";
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
  
  const prompt = `You are ${COACH_NAME}'s AI programming assistant for Symmetry Corrective. Based on this client assessment, recommend a starting program and write a brief assessment summary.

PROGRAMMING PHILOSOPHY (NASM Corrective, internal only - never use this language with clients):
- Movement assessment drives corrective backbone
- Goals layer on top as training emphasis
- Phase 1 = corrective only, Phase 2 = corrective warm-up + moderate weight, Phase 3 = corrective + heavy lifting
- Combine programs only when assessment requires it (e.g., back pain with ankle root)

PROGRAM ROUTING:
- APT / Low back arch → APT Correction Program
- Rounded shoulders / Arms fall forward → Scapular Precision Program  
- Forward head → Scapular Precision Program
- Knee valgus → Knee Stability & Strength Program
- Feet turn out / forward lean (ankle) → Foundation + Ankle & Posterior Chain (combined)
- Lateral asymmetry → Asymmetrical Weight Shift & Lumbar Decompression
- Hip issues / replacement → Hip Replacement & Chronic Hip Pain Program
- Balance / neuro deficit → Neurological Rehab & Balance Program
- No major findings → route purely by goal
Goals layer: Female hypertrophy → Female Aesthetics | Bodybuilding → 5-Day Split | Limited days → 3-Day Split | Older/deconditioned → Longevity & Active Aging | Maintenance → Maintenance

CLIENT ASSESSMENT DATA:
${JSON.stringify(data, null, 2)}

Respond with JSON only:
{
  "recommended_program": "Program name",
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
  
  return NextResponse.json(result);
}
