import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import {
  computeGroupSnapshot,
  journalDto,
  journalKey,
  loadGroups,
  upsertJournal,
} from "@/lib/queries/trades";
import type { Range } from "@/types";

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

/** List journaled trades in a range: trade stats merged with journal inputs. */
export async function GET(request: NextRequest) {
  const range = (request.nextUrl.searchParams.get("range") ?? "all") as Range;
  const [start, end] = resolveRange(range);
  const [groups, journal] = await loadGroups(start, end);

  const items = groups.flatMap((g) => {
    const jrow = journal.get(journalKey(g.symbol, g.entryTime));
    if (!jrow) return [];
    return [{
      tradeId: g.id,
      symbol: g.symbol,
      side: g.side,
      status: g.status,
      result: g.result,
      entryTime: g.entryTime.toISOString(),
      exitTime: g.exitTime?.toISOString() ?? null,
      netPnl: g.netPnl,
      returnPct: g.returnPct,
      currency: g.currency,
      journal: journalDto(jrow),
    }];
  });

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;

  // Snapshot the round-trip group this journal belongs to (id + member fills)
  const snapshot = await computeGroupSnapshot(
    String(body.symbol),
    String(body.entryTime),
  );

  const row = await upsertJournal({
    symbol: body.symbol,
    entry_time: body.entryTime,
    group_id: snapshot?.group_id ?? null,
    execution_ids: snapshot?.execution_ids ?? [],
    // Pre-entry checklist
    candle_pattern: body.candlePattern ?? null,
    recent_trend: body.recentTrend ?? null,
    volume_vs_trend: body.volumeVsTrend ?? null,
    ma_relation: body.maRelation ?? [],
    open_gaps: body.openGaps ?? [],
    support_res_fib: body.supportResFib ?? [],
    // Planning & setup
    setup: body.setup ?? null,
    planned_stop: body.plannedStop ?? null,
    planned_target: body.plannedTarget ?? null,
    risk_amount: body.riskAmount ?? null,
    conviction_level: intOrNull(body.convictionLevel, 1, 10),
    // Execution & psychology
    entry_reason: body.entryReason ?? null,
    exit_reason: body.exitReason ?? null,
    psych_tags: body.psychTags ?? [],
    // Review
    trade_score: intOrNull(body.tradeScore, 1, 10),
    mistakes_tags: body.mistakesTags ?? [],
    notes: body.notes ?? "",
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json(journalDto(row));
}
