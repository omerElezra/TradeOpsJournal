import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups, journalKey } from "@/lib/queries/trades";
import { rMultiple } from "@/lib/domain/metrics";
import type { GroupedTrade } from "@/lib/domain/models";

function toDetail(g: GroupedTrade, journal: Map<string, Record<string, unknown>>) {
  const jrow = journal.get(journalKey(g.symbol, g.entryTime));
  return {
    id: g.id,
    symbol: g.symbol,
    side: g.side,
    status: g.status,
    result: g.result,
    entryTime: g.entryTime.toISOString(),
    exitTime: g.exitTime?.toISOString() ?? null,
    qty: g.qty,
    avgEntry: g.avgEntry,
    avgExit: g.avgExit,
    netPnl: g.netPnl,
    realizedPnl: g.realizedPnl,
    commission: g.commission,
    returnPct: g.returnPct,
    rMultiple: rMultiple(g.netPnl, jrow?.risk_amount != null ? Number(jrow.risk_amount) : null),
    holdingMinutes: g.holdingMinutes,
    currency: g.currency,
    setup: (jrow?.setup as string | null) ?? null,
    psychTags: ((jrow?.psych_tags as string[] | null) ?? []),
    hasNotes: !!(jrow && String(jrow.notes ?? "").trim()),
    executions: g.executions.map(e => ({
      tradeId: e.tradeId,
      execTime: e.execTime.toISOString(),
      action: e.action,
      quantity: e.quantity,
      price: e.price,
      proceeds: e.proceeds,
      commission: e.commission,
      realizedPnl: e.realizedPnl,
    })),
    markers: g.executions.map(e => ({
      time: Math.floor(e.execTime.getTime() / 1000),
      price: e.price,
      side: e.action,
      qty: e.quantity,
    })),
    journal: jrow
      ? {
          id: jrow.id,
          symbol: String(jrow.symbol),
          entryTime: String(jrow.entry_time),
          setup: (jrow.setup as string | null) ?? null,
          psychTags: ((jrow.psych_tags as string[] | null) ?? []),
          notes: String(jrow.notes ?? ""),
          plannedStop: jrow.planned_stop != null ? Number(jrow.planned_stop) : null,
          plannedTarget: jrow.planned_target != null ? Number(jrow.planned_target) : null,
          riskAmount: jrow.risk_amount != null ? Number(jrow.risk_amount) : null,
          updatedAt: jrow.updated_at ? String(jrow.updated_at) : undefined,
        }
      : null,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params;
  const [start, end] = resolveRange("all");
  const [groups, journal] = await loadGroups(start, end);
  const g = groups.find(g => g.id === tradeId);
  if (!g) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  return NextResponse.json(toDetail(g, journal));
}
