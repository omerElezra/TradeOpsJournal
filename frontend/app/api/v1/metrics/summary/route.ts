import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups } from "@/lib/queries/trades";
import * as m from "@/lib/domain/metrics";

function r(n: number, d: number) {
  return Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));

  const span = end.getTime() - start.getTime();
  const [[groups], [prevGroups]] = await Promise.all([
    loadGroups(start, end),
    loadGroups(new Date(start.getTime() - span), start),
  ]);

  const closed = groups.filter(g => g.status === "CLOSED");
  const lastDate = m.lastTradeDate(groups);

  return NextResponse.json({
    range: { from: start.toISOString(), to: end.toISOString() },
    totalTrades: m.totalTrades(groups),
    openTrades: m.openTradesCount(groups),
    closedTrades: m.totalTrades(groups),
    wins: closed.filter(g => g.result === "WIN").length,
    losses: closed.filter(g => g.result === "LOSS").length,
    breakevens: closed.filter(g => g.result === "BREAKEVEN").length,
    winRate: m.winRate(groups),
    profitFactor: m.profitFactor(groups),
    netRoi: m.netRoi(groups),
    netPnl: m.netPnl(groups),
    grossProfit: m.grossProfit(groups),
    grossLoss: m.grossLoss(groups),
    avgWin: m.avgWin(groups),
    avgLoss: m.avgLoss(groups),
    expectancy: m.expectancy(groups),
    maxDrawdown: m.maxDrawdown(groups),
    totalCommission: r(closed.reduce((s, g) => s + g.commission, 0), 2),
    bestTrade: m.bestTrade(groups),
    worstTrade: m.worstTrade(groups),
    totalTradeVolume: m.totalVolume(groups),
    lastTradeDate: lastDate ? lastDate.toISOString() : null,
    currency: groups[0]?.currency ?? "USD",
    deltas: {
      winRate: r(m.winRate(groups) - m.winRate(prevGroups), 4),
      profitFactor: r(m.profitFactor(groups) - m.profitFactor(prevGroups), 4),
      netRoi: r(m.netRoi(groups) - m.netRoi(prevGroups), 4),
      totalTrades: m.totalTrades(groups) - m.totalTrades(prevGroups),
    },
  });
}
