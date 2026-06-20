import { NextResponse } from "next/server";

// Deprecated — use /api/reminders/send instead
export async function POST() {
  return NextResponse.json({ error: "Use /api/reminders/send instead" }, { status: 410 });
}
