import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { photoUrl, offPlanNotes, mealContext } = await req.json();
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
    }

    const messages: { role: string; content: unknown[] }[] = [];
    const userContent: unknown[] = [];

    if (photoUrl) {
      // Fetch image and convert to base64
      const imgRes = await fetch(photoUrl);
      const buf = await imgRes.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: contentType, data: b64 },
      });
    }

    const plannedMeal = mealContext?.plannedMeal || "unknown meal";
    const mealSlot = mealContext?.slot || "unknown slot";
    const clientName = mealContext?.clientName || "the client";

    let textPrompt = `${clientName} was supposed to eat ${mealSlot}: ${plannedMeal}.`;
    if (offPlanNotes) textPrompt += ` They noted: "${offPlanNotes}".`;
    if (photoUrl) textPrompt += " Analyze this food photo.";
    textPrompt += ' Estimate the macros of what was actually consumed. Return ONLY valid JSON with these exact keys: {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "description": string, "deviation_from_plan": string}. Be concise and practical.';

    userContent.push({ type: "text", text: textPrompt });
    messages.push({ role: "user", content: userContent });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 256,
        system: "You are a nutrition coach analyzing food intake. Always respond with valid JSON only, no markdown, no explanation.",
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Anthropic error: ${err}` }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    
    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Invalid response from Claude" }, { status: 500 });
    }
    
    const macros = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, macros });
    
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}