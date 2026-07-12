import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const data = await req.json();
  
  const prompt = `You are Dustin Gautreaux's AI programming assistant for Symmetry Corrective. Based on this client assessment, recommend a starting program and write a brief assessment summary.

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
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Could not parse recommendation' };
  
  return NextResponse.json(result);
}
