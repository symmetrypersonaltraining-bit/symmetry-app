import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { extractJson } from '@/lib/ai/nutrition-json';
import { logUsage, pausedBody, assertNotPaused, checkAndLog, AiPaused, CapExceeded, capBody } from '@/lib/ai/meter';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const TRAINER_EMAIL = 'symmetrypersonaltraining@gmail.com';

// POST /api/analyze-meal-photo
// Body: { imageBase64, mimeType?, text?, logId?, clientId? }
// - text: optional client-typed description analyzed alongside the photo.
// - logId: when provided (v3 flow logs first, analyzes after), the SUCCESSFUL
//   analysis is persisted to that meal_adherence_logs row in ONE update:
//   off_plan_macros jsonb + est_* numeric fields + analysis_status='complete'
//   (+ macros_pending=false). Response stays backward compatible for callers
//   that still insert client-side.
export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg', text, logId, clientId: requestedClientId } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'No image received — please retake the photo.' });
    }
    // Vercel request limit is ~4.5MB; the client compresses before upload, but guard anyway.
    if (imageBase64.length > 4_000_000) {
      return NextResponse.json({ error: 'Photo too large — please retake (it will be compressed automatically).' });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const media = allowed.includes(mimeType) ? mimeType : 'image/jpeg';

    // ---- auth / client scoping (soft — legacy callers may not send clientId) ----
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isTrainer = !!user && user.email === TRAINER_EMAIL;
    let ownClientId: string | null = null;
    if (user) {
      const { data: byAuth } = await supabase.from('clients').select('id').eq('auth_user_id', user.id).maybeSingle();
      ownClientId = byAuth?.id ?? null;
      if (!ownClientId && user.email) {
        const { data: byEmail } = await supabase.from('clients').select('id').eq('email', user.email).maybeSingle();
        ownClientId = byEmail?.id ?? null;
      }
    }
    let clientId: string | null = null;
    if (typeof requestedClientId === 'string' && requestedClientId) {
      if (!isTrainer && requestedClientId !== ownClientId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      clientId = requestedClientId;
    } else {
      clientId = ownClientId;
    }

    // ---- metering: global kill switch always; per-client daily cap when scoped ----
    try {
      if (clientId) await checkAndLog(clientId, 'photo');
      else await assertNotPaused();
    } catch (e) {
      if (e instanceof AiPaused) return NextResponse.json(pausedBody());
      if (e instanceof CapExceeded) return NextResponse.json(capBody(e), { status: 429 });
      console.error('analyze-meal-photo: meter error (failing open)', e);
    }

    const extraText = typeof text === 'string' && text.trim() ? `\n\nThe client also typed this about the meal: "${text.trim().slice(0, 500)}". Use it (e.g. restaurant name, item names, quantities) alongside the photo.` : '';

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: 'You are a precise nutrition-estimation assistant for a physique coach. Prefer official restaurant or brand nutrition data over visual guesses, count items exactly, and avoid over-estimating calories and fat. Always respond with valid JSON only, no markdown and no prose outside the JSON.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 } },
          { type: 'text', text: 'Analyze this food photo and estimate the macros as accurately as possible. Use official nutrition data, not just visual estimation, whenever possible. If the photo or the accompanying text contains a receipt, packaging, a menu, or food from an identifiable restaurant or chain (for example Wing Snob, Buffalo Wild Wings, Chipotle, or anything ordered via UberEats or DoorDash), IDENTIFY THE RESTAURANT and the specific items, then base the macros on that chain\'s OFFICIAL published nutrition for those exact items and quantities rather than guessing visually. Count discrete items precisely (for example the number of wings, tenders, or slices) and multiply by the known per-item macros. Wings from wing chains are commonly OVER-estimated on calories and fat, so anchor to official per-wing values (a typical bone-in wing is about 80 to 100 kcal plain) rather than inflating. Only fall back to pure visual estimation when no brand or chain is identifiable. Respond with JSON only: { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "description": "what you see, including the restaurant or item and whether macros came from official data or a visual estimate", "restaurant": string or null (the identified chain/restaurant name), "source": "restaurant_official" when the macros come from a chain\'s official published nutrition, otherwise "visual_estimate" }' + extraText }
        ]
      }]
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const result = extractJson(responseText);

    // Log usage regardless of parse outcome — the tokens were spent.
    await logUsage(clientId, 'photo', message.usage?.input_tokens ?? 0, message.usage?.output_tokens ?? 0, MODEL);

    if (!result || typeof result !== 'object' || result.calories == null) {
      return NextResponse.json({ error: 'Could not read the photo — try again or enter macros manually.' });
    }

    const kcal = Math.round(Number(result.calories) || 0);
    const protein = Math.round((Number(result.protein_g) || 0) * 10) / 10;
    const carbs = Math.round((Number(result.carbs_g) || 0) * 10) / 10;
    const fats = Math.round((Number(result.fat_g ?? result.fats_g) || 0) * 10) / 10;
    const description = typeof result.description === 'string' && result.description ? result.description : 'Photo meal';
    const source = result.source === 'restaurant_official' ? 'restaurant_official' : 'visual_estimate';

    // Structured JSONB for the nightly rollup / charts / AI — the est_* fields
    // and this object are ALWAYS written together so they can never disagree.
    const offPlanMacros: Record<string, unknown> = {
      kcal,
      protein,
      carbs,
      fats,
      description,
      estimated: true,
      source,
    };
    if (result.restaurant && typeof result.restaurant === 'string') offPlanMacros.restaurant = result.restaurant;

    // ---- persist to the adherence log row (single update) when targeted ----
    let saved = false;
    if (logId && typeof logId === 'string' && user) {
      const { data: logRow } = await supabase
        .from('meal_adherence_logs')
        .select('id, client_id')
        .eq('id', logId)
        .maybeSingle();
      if (logRow && (isTrainer || logRow.client_id === ownClientId)) {
        const { error: updErr } = await supabase
          .from('meal_adherence_logs')
          .update({
            off_plan_macros: offPlanMacros,
            est_kcal: kcal,
            est_protein: protein,
            est_carbs: carbs,
            est_fats: fats,
            analysis_status: 'complete',
            macros_pending: false,
          })
          .eq('id', logRow.id);
        if (updErr) console.error('analyze-meal-photo: log update failed', updErr.message);
        else saved = true;
      } else {
        console.error('analyze-meal-photo: logId not found or not owned by caller');
      }
    }

    // Backward-compatible payload + the structured fields for v3 callers.
    return NextResponse.json({
      calories: kcal,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fats,
      description,
      source,
      restaurant: offPlanMacros.restaurant ?? null,
      off_plan_macros: offPlanMacros,
      analysis_status: 'complete',
      saved,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('analyze-meal-photo failed:', msg);
    // Always return JSON (never an HTML error page) so the app can show a clean message.
    return NextResponse.json({ error: `Analysis failed — ${msg.slice(0, 120)}` });
  }
}

export const dynamic = 'force-dynamic';
