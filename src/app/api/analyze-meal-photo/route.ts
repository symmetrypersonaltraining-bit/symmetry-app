import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { imageBase64, mimeType = 'image/jpeg' } = await req.json();

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: imageBase64 } },
        { type: 'text', text: 'Analyze this food photo and estimate the macros. Respond with JSON only: { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "description": "brief description of what you see" }' }
      ]
    }]
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const match = text.match(/\{[\s\S]*\}/);
  const result = match ? JSON.parse(match[0]) : { error: 'Could not parse' };
  return NextResponse.json(result);
}

export const dynamic = 'force-dynamic';
