import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'No image received — please retake the photo.' });
    }
    // Vercel request limit is ~4.5MB; the client compresses before upload, but guard anyway.
    if (imageBase64.length > 4_000_000) {
      return NextResponse.json({ error: 'Photo too large — please retake (it will be compressed automatically).' });
    }
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const media = allowed.includes(mimeType) ? mimeType : 'image/jpeg';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'You are a precise nutrition-estimation assistant for a physique coach. Prefer official restaurant or brand nutrition data over visual guesses, count items exactly, and avoid over-estimating calories and fat. Always respond with valid JSON only, no markdown and no prose outside the JSON.',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 } },
          { type: 'text', text: 'Analyze this food photo and estimate the macros as accurately as possible. Use official nutrition data, not just visual estimation, whenever possible. If the photo shows a receipt, packaging, menu, or food from an identifiable restaurant or chain (for example Wing Snob, Buffalo Wild Wings, or anything ordered via UberEats or DoorDash), identify the restaurant and the specific items, then base the macros on that chain OFFICIAL published nutrition for those exact items and quantities rather than guessing visually. Count discrete items precisely (for example the number of wings, tenders, or slices) and multiply by the known per-item macros. Wings from wing chains are commonly OVER-estimated on calories and fat, so anchor to official per-wing values (a typical bone-in wing is about 80 to 100 kcal plain) rather than inflating. Only fall back to pure visual estimation when no brand or chain is identifiable. Respond with JSON only: { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "description": "what you see, including the restaurant or item and whether macros came from official data or a visual estimate" }' }
        ]
      }]
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const match = text.match(/\{[\s\S]*\}/);
    const result = match ? JSON.parse(match[0]) : { error: 'Could not read the photo — try again or enter macros manually.' };
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('analyze-meal-photo failed:', msg);
    // Always return JSON (never an HTML error page) so the app can show a clean message.
    return NextResponse.json({ error: `Analysis failed — ${msg.slice(0, 120)}` });
  }
}

export const dynamic = 'force-dynamic';
