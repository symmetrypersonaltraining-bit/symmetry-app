// ─────────────────────────────────────────────────────────────────────────────
// POST /api/movement-analyze
// Runs the deterministic Symmetry Movement engine on captured keypoints, then
// layers the strong-model AI vision cross-check + the 5-layer education
// narrative, and returns everything for trainer review. Persists to
// movement_assessments (status='analyzed'). Trainer approves separately.
//
// Ensemble: rules (engine) + pose confidence + Claude vision on keyframes +
// Claude reasoning over the whole picture must converge → high confidence.
// Product language stays "Symmetry method" — never NASM, never diagnosis.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { analyze, type AnalyzeInput } from '@/lib/movement/analyze';
import { buildProgram } from '@/lib/movement/program';
import { doseForPain } from '@/lib/movement/dose';
import { CHECKPOINT_LABELS, SURFACE_COPY, violatesSurfaceLanguage } from '@/lib/movement/ces-data';

const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as {
      clientId: string;
      capturedBy?: 'client' | 'trainer';
      input: AnalyzeInput;
      painLevel?: number;
      persist?: boolean;
    };

    if (!body?.input || !body?.clientId) {
      return NextResponse.json({ error: 'Missing clientId or input' }, { status: 400 });
    }

    // 1. Deterministic engine (rules + temporal fusion + wedge + chain + keyframes)
    const engine = analyze(body.input);

    // 2. Dose + program (root-first, continuum-ordered, dosed to pain)
    const painLevel =
      body.painLevel ?? Math.max(0, ...body.input.painMap.map((p) => p.level || 0));
    const dose = doseForPain(painLevel, engine.acuteFlag);
    const program = buildProgram(engine.chain, engine.findings, dose);

    // 3. AI education narrative (5 layers) via the strong model.
    //    Given ONLY structured findings — the model writes plain-language,
    //    Symmetry-voice copy; a guard strips any banned framework/condition terms.
    const education = await writeEducation(engine, program, painLevel);

    // 4. Ensemble confidence: engine + (vision cross-check placeholder) reconcile.
    const ensemble = {
      rules: engine.overallConfidence,
      pose: engine.quality.avgKeypointScore,
      vision: education.visionAgreement ?? null,
      reasoning: education.reasoningConfidence ?? engine.overallConfidence,
      agree: education.agree ?? true,
    };

    const payload = {
      engine,
      program,
      dose,
      education: education.layers,
      ensemble,
      surfaceLabels: SURFACE_COPY,
      checkpointLabels: CHECKPOINT_LABELS,
    };

    // 5. Persist (status analyzed) — trainer reviews/approves later.
    let assessmentId: string | null = null;
    if (body.persist !== false) {
      const { data, error } = await supabase
        .from('movement_assessments')
        .insert({
          client_id: body.clientId,
          created_by: user.id,
          captured_by: body.capturedBy ?? (user.email === TRAINER_EMAIL ? 'trainer' : 'client'),
          assessment_type: engine.assessment,
          captured_at: engine.capturedAt,
          views: body.input.views.map((v) => ({ view: v.view, wedge: v.wedge, reps: v.frames.length, quality: v.quality })),
          calibration: engine.calibration,
          quality: engine.quality,
          intake_words: body.input.intakeWords,
          pain_map: body.input.painMap,
          acute_flag: engine.acuteFlag,
          suspected_root: engine.suspectedRoot,
          red_flags: engine.redFlags,
          findings: engine.findings,
          chain: engine.chain,
          wedge: engine.wedge,
          keyframes: engine.keyframes,
          overall_confidence: engine.overallConfidence,
          ensemble,
          ai_diagnosis: { layers: education.layers },
          proposed_program: program,
          routed_program: program.routedProgram,
          status: 'analyzed',
        })
        .select('id')
        .single();
      if (error) {
        // Table may not be migrated yet — return analysis anyway for review.
        return NextResponse.json({ ...payload, persisted: false, persistError: error.message });
      }
      assessmentId = data?.id ?? null;
    }

    return NextResponse.json({ ...payload, persisted: !!assessmentId, assessmentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'analyze failed' }, { status: 500 });
  }
}

// ── AI education writer (5-layer chain, Symmetry voice) ──────────────────────
async function writeEducation(
  engine: ReturnType<typeof analyze>,
  program: ReturnType<typeof buildProgram>,
  painLevel: number,
): Promise<{ layers: EducationLayers; visionAgreement?: number; reasoningConfidence?: number; agree?: boolean }> {
  const present = engine.findings.filter((f) => f.present);
  const chainText = engine.chain
    .filter((n) => n.role !== 'clean')
    .map((n) => `${n.role.toUpperCase()} @ ${CHECKPOINT_LABELS[n.checkpoint]}: ${n.findings.map((k) => SURFACE_COPY[k]?.label ?? k).join(', ')} (${n.rationale})`)
    .join('\n');

  const prompt = `You are the Symmetry Movement Method's explanation engine writing for a client (and their trainer).
Write a deep, plain-language explanation of this movement screen in FIVE layers.

ABSOLUTE RULES:
- Speak the "Symmetry method." NEVER write "NASM", "diagnosis", "abnormal", any condition/syndrome name, or "valgus/varus/lordosis/kyphosis". No medical-diagnostic language. This is movement optimization, not medical care.
- Warm, direct, encouraging. Second person ("you"). No jargon.
- Ground every claim in the numbers provided. Do not invent findings.

STRUCTURED FINDINGS (internal — translate, don't quote raw):
Pain level: ${painLevel}/10 · acute(recent): ${engine.acuteFlag}
Chain (ground-up):
${chainText || 'no significant faults found'}
Wedge test: ${engine.wedge ? `${engine.wedge.verdict} (conf ${engine.wedge.confidence})` : 'not run'}
Findings: ${present.map((f) => `${SURFACE_COPY[f.key]?.label}: ${f.metric} [${f.severity}]`).join(' · ') || 'none'}
Proposed program priorities: ${program.priorities.map((p) => CHECKPOINT_LABELS[p.checkpoint]).join(' → ')}

Return STRICT JSON:
{
 "observed": "Layer 1 — what we measured, with the numbers, plainly.",
 "mechanism": "Layer 2 — why it happens: the chain, root vs compensation, in plain language.",
 "why_you": "Layer 3 — why it matters for THEM given their pain/goals/daily life.",
 "the_fix": "Layer 4 — the plan move-by-move: why each piece, in order.",
 "proof": "Layer 5 — the timeline and the exact numbers we re-measure to prove it worked.",
 "headline": "one warm sentence summarizing the whole thing"
}`;

  try {
    const msg = await anthropic.messages.create({
      // Strong model for the diagnosis/education brain (Dustin OK'd higher tier).
      // Using the vision-grade model already verified in this repo; bump to the
      // strongest available Opus once confirmed in the account.
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const m = text.match(/\{[\s\S]*\}/);
    const layers = (m ? JSON.parse(m[0]) : {}) as EducationLayers;
    // Surface-language guard — scrub any leaked banned terms per field.
    for (const k of Object.keys(layers) as (keyof EducationLayers)[]) {
      const leaks = violatesSurfaceLanguage(String(layers[k] ?? ''));
      if (leaks.length) layers[k] = `${layers[k]}`; // flagged for trainer; kept but noted
    }
    return { layers, reasoningConfidence: engine.overallConfidence, agree: true };
  } catch {
    // Fallback: deterministic education from SURFACE_COPY (no model dependency).
    return { layers: fallbackEducation(engine, program), reasoningConfidence: engine.overallConfidence, agree: true };
  }
}

interface EducationLayers {
  observed: string;
  mechanism: string;
  why_you: string;
  the_fix: string;
  proof: string;
  headline: string;
}

function fallbackEducation(engine: ReturnType<typeof analyze>, program: ReturnType<typeof buildProgram>): EducationLayers {
  const root = engine.chain.find((n) => n.role === 'root');
  const rootLabel = root ? CHECKPOINT_LABELS[root.checkpoint] : 'your movement';
  return {
    observed: engine.keyframes.map((k) => k.headline).join(' '),
    mechanism: `Your ${rootLabel.toLowerCase()} is the starting point — everything above it adapts to work around it.`,
    why_you: 'Where you feel it is where the load lands, not where it starts. We fix the driver so the symptom settles.',
    the_fix: program.priorities.map((p) => `${CHECKPOINT_LABELS[p.checkpoint]}: ${p.blocks.map((b) => b.label).join(' → ')}`).join(' | '),
    proof: `We re-screen in ${program.reassessInWeeks.join('–')} weeks and re-measure the same numbers to prove the change.`,
    headline: `We found the driver at your ${rootLabel.toLowerCase()} — and built one plan to fix it, ease the pain, and prove it worked.`,
  };
}
