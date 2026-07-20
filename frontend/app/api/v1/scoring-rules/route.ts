import { NextRequest, NextResponse } from "next/server";
import { validateRule } from "@/lib/domain/scoring";
import { insertScoringRule, listScoringRules } from "@/lib/queries/scoring-rules";

export async function GET() {
  return NextResponse.json(await listScoringRules());
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const checked = validateRule(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  return NextResponse.json(await insertScoringRule(checked.rule));
}
