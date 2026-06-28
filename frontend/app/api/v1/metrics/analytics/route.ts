import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups } from "@/lib/queries/trades";

function r2(n: number) { return Math.round(n * 100) / 100; }

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));
  const [groups] = await loadGroups(start, end);

  const closed = groups
    .filter(g => g.status === "CLOSED" && g.exitTime !== null)
    .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());

  // ── P&L per trade (chronological) ────────────────────────────────────────
  const pnlPerTrade = closed.map(g => ({
    t: g.exitTime!.toISOString(),
    netPnl: r2(g.netPnl),
    result: g.result,
    symbol: g.symbol,
    holdingMinutes: g.holdingMinutes,
  }));

  // ── By symbol ─────────────────────────────────────────────────────────────
  const symMap = new Map<string, { netPnl: number; wins: number; losses: number; tradeCount: number; capital: number }>();
  for (const g of closed) {
    const e = symMap.get(g.symbol) ?? { netPnl: 0, wins: 0, losses: 0, tradeCount: 0, capital: 0 };
    e.netPnl   += g.netPnl;
    e.wins     += g.result === "WIN"  ? 1 : 0;
    e.losses   += g.result === "LOSS" ? 1 : 0;
    e.tradeCount++;
    e.capital  += g.avgEntry * g.qty;
    symMap.set(g.symbol, e);
  }
  const bySymbol = [...symMap.entries()]
    .map(([symbol, v]) => ({
      symbol,
      netPnl:    r2(v.netPnl),
      wins:      v.wins,
      losses:    v.losses,
      tradeCount: v.tradeCount,
      returnPct: v.capital > 0 ? r2((v.netPnl / v.capital) * 100) : 0,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);

  // ── By month (YYYY-MM) ────────────────────────────────────────────────────
  const monthMap = new Map<string, { netPnl: number; wins: number; losses: number; tradeCount: number }>();
  for (const g of closed) {
    const d = g.exitTime!;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const e = monthMap.get(key) ?? { netPnl: 0, wins: 0, losses: 0, tradeCount: 0 };
    e.netPnl   += g.netPnl;
    e.wins     += g.result === "WIN"  ? 1 : 0;
    e.losses   += g.result === "LOSS" ? 1 : 0;
    e.tradeCount++;
    monthMap.set(key, e);
  }
  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v, netPnl: r2(v.netPnl) }));

  return NextResponse.json({ pnlPerTrade, bySymbol, byMonth });
}
