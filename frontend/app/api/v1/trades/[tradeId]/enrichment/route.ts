import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups, journalKey } from "@/lib/queries/trades";
import { enrichTradeContext } from "@/lib/domain/enrichment";
import type { EnrichmentTradeInput } from "@/lib/domain/enrichment";
import { defaultDailyBarProvider } from "@/lib/marketdata/daily-provider";
import { fetchEnrichment, upsertEnrichment } from "@/lib/queries/enrichment";
import { MarketDataError } from "@/lib/marketdata";
import type { GroupedTrade } from "@/lib/domain/models";

async function findGroup(tradeId: string): Promise<{
  group: GroupedTrade | null;
  journal: Map<string, Record<string, unknown>>;
}> {
  const [start, end] = resolveRange("all");
  const [groups, journal] = await loadGroups(start, end);
  return { group: groups.find((g) => g.id === tradeId) ?? null, journal };
}

/** Returns the stored enrichment for a trade (404 if never computed). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params;
  const { group } = await findGroup(tradeId);
  if (!group) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

  const row = await fetchEnrichment(group.symbol, group.entryTime.toISOString());
  if (!row) {
    return NextResponse.json(
      { error: "Enrichment not computed for this trade" },
      { status: 404 },
    );
  }
  return NextResponse.json(row);
}

/** Computes the enrichment from broker data + journal plan, stores and returns it. */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ tradeId: string }> },
) {
  const { tradeId } = await params;
  const { group, journal } = await findGroup(tradeId);
  if (!group) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  if (group.status !== "CLOSED" || group.exitTime == null || group.avgExit == null) {
    return NextResponse.json(
      { error: "Enrichment requires a completed (closed) trade" },
      { status: 400 },
    );
  }

  const jrow = journal.get(journalKey(group.symbol, group.entryTime));
  const input: EnrichmentTradeInput = {
    symbol: group.symbol,
    direction: group.side,
    entryDatetime: group.entryTime.toISOString(),
    exitDatetime: group.exitTime.toISOString(),
    entryPrice: group.avgEntry,
    exitPrice: group.avgExit,
    quantity: group.qty,
    fees: group.commission,
    plannedStopLoss: jrow?.planned_stop != null ? Number(jrow.planned_stop) : null,
    plannedTargetPrice: jrow?.planned_target != null ? Number(jrow.planned_target) : null,
  };

  try {
    const enrichment = await enrichTradeContext(input, defaultDailyBarProvider);
    const row = await upsertEnrichment(
      group.symbol,
      group.entryTime.toISOString(),
      group.id,
      enrichment,
    );
    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
