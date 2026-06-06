import { NextResponse } from "next/server";

// AI insights are not yet implemented — returns empty array.
// Future: query an ai_insights table or call an LLM-based service here.
export async function GET() {
  return NextResponse.json([]);
}
