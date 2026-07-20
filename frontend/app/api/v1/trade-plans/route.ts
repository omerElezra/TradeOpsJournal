import { NextRequest, NextResponse } from "next/server";
import { buildScoringFacts, emptyChecklist, evaluateScore } from "@/lib/domain/scoring";
import type { EntryChecklist, ScoreResult } from "@/lib/domain/scoring";
import type { ForwardOutcome, PreEntryContext } from "@/lib/domain/pre-entry";
import { listScoringRules } from "@/lib/queries/scoring-rules";
import {
  insertTradePlan,
  listTradePlans,
  type TradePlanStatus,
} from "@/lib/queries/trade-plans";
import type { Side } from "@/types";

const STATUSES: TradePlanStatus[] = ["planned", "entered", "skipped", "expired"];

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const status = STATUSES.includes(statusRaw as TradePlanStatus)
    ? (statusRaw as TradePlanStatus)
    : undefined;
  const symbol = sp.get("symbol")?.trim().toUpperCase() || undefined;
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : undefined;
  return NextResponse.json(await listTradePlans({ status, symbol, limit }));
}

/**
 * Save a pre-entry check as a trade plan. The score is recomputed server-side
 * from the current enabled rules — the client's live score is only a preview —
 * and stored as a frozen breakdown alongside the context snapshot.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  const direction: Side = body.direction === "SHORT" ? "SHORT" : "LONG";
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

  const row = await insertTradePlan({
    symbol,
    direction,
    plannedAt,
    refPrice: typeof body.refPrice === "number" ? body.refPrice : null,
    context,
    checklist,
    score,
    scoreBreakdown,
    forwardOutcome: (body.forwardOutcome as ForwardOutcome | null) ?? null,
    notes: typeof body.notes === "string" ? body.notes : "",
  });
  return NextResponse.json(row);
}
