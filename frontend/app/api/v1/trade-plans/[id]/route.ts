import { NextRequest, NextResponse } from "next/server";
import { buildScoringFacts, emptyChecklist, evaluateScore } from "@/lib/domain/scoring";
import type { EntryChecklist, ScoreResult } from "@/lib/domain/scoring";
import type { ForwardOutcome, PreEntryContext } from "@/lib/domain/pre-entry";
import { listScoringRules } from "@/lib/queries/scoring-rules";
import {
  deleteTradePlan,
  updateTradePlan,
  type TradePlanPatch,
  type TradePlanStatus,
} from "@/lib/queries/trade-plans";

const STATUSES: TradePlanStatus[] = ["planned", "entered", "skipped", "expired"];

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Light patch ({status, notes}) or a full edit of the plan (symbol, direction,
 * plannedAt, refPrice, context, checklist, forwardOutcome, notes). A full edit
 * recomputes the score server-side from the current enabled rules — same
 * authority as POST /api/v1/trade-plans — and updates the row in place.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const isFullEdit = body.checklist !== undefined || body.context !== undefined;

  const patch: TradePlanPatch = {};
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as TradePlanStatus))
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    patch.status = body.status as TradePlanStatus;
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (isFullEdit) {
    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    const plannedAt =
      typeof body.plannedAt === "string" && Number.isFinite(Date.parse(body.plannedAt))
        ? new Date(body.plannedAt).toISOString()
        : null;
    if (!plannedAt)
      return NextResponse.json({ error: "plannedAt must be a valid datetime" }, { status: 400 });

    const context = (body.context as PreEntryContext | null) ?? null;
    const checklist: EntryChecklist = {
      ...emptyChecklist(),
      ...((body.checklist as Partial<EntryChecklist> | null) ?? {}),
    };

    let score: number | null = null;
    let scoreBreakdown: ScoreResult | null = null;
    if (context) {
      const rules = await listScoringRules();
      scoreBreakdown = evaluateScore(
        rules.filter((r) => r.enabled),
        buildScoringFacts(context, checklist),
      );
      score = scoreBreakdown.score;
    }

    patch.symbol = symbol;
    patch.direction = body.direction === "SHORT" ? "SHORT" : "LONG";
    patch.plannedAt = plannedAt;
    patch.refPrice = typeof body.refPrice === "number" ? body.refPrice : null;
    patch.context = context;
    patch.checklist = checklist;
    patch.score = score;
    patch.scoreBreakdown = scoreBreakdown;
    patch.forwardOutcome = (body.forwardOutcome as ForwardOutcome | null) ?? null;
    if (patch.notes === undefined) patch.notes = "";
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  return NextResponse.json(await updateTradePlan(id, patch));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  await deleteTradePlan(id);
  return NextResponse.json({ ok: true });
}
