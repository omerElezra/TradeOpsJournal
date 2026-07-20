import { NextRequest, NextResponse } from "next/server";
import { validateRule } from "@/lib/domain/scoring";
import { deleteScoringRule, updateScoringRule } from "@/lib/queries/scoring-rules";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  // Lightweight toggles (enabled/sortOrder) skip full-rule validation; anything
  // touching the rule definition itself must pass validateRule.
  const definitionChanged =
    body.label !== undefined || body.conditions !== undefined || body.points !== undefined;
  if (definitionChanged) {
    const checked = validateRule(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    return NextResponse.json(await updateScoringRule(id, checked.rule));
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.sortOrder === "number") patch.sortOrder = body.sortOrder;
  if (typeof body.note === "string") patch.note = body.note;
  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  return NextResponse.json(await updateScoringRule(id, patch));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "Invalid rule id" }, { status: 400 });
  await deleteScoringRule(id);
  return NextResponse.json({ ok: true });
}
