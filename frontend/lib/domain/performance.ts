import "server-only";
import type { GroupedTrade } from "./models";

const EPS = 1e-9;

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

/** GroupedTrade enriched with journal annotations. */
export interface AnnotatedTrade extends GroupedTrade {
  setup: string | null;
  plannedStop: number | null;   // price-based initial stop loss
  riskAmount: number | null;    // dollar-based risk (fallback for R calc)
}

export interface PerformanceFilter {
  setup?: string;
  side?: "LONG" | "SHORT";
}

export interface HoldingTimeStats {
  avgMinutes: number;
  display: string;      // "2d 4h 30m"
  tradeCount: number;
}

export interface PerformanceReport {
  filter: PerformanceFilter;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;

  // 1. Win Rate — target > 45%
  winRate: number;

  // 2. Profit Factor — target > 1.5
  profitFactor: number;

  // 3. System Expectancy — target > 0
  // Formula: (winRate * avgWin) - (lossRate * |avgLoss|)
  expectancy: number;

  // 4. Avg Win / Avg Loss ratio — target > 2.0
  winLossRatio: number;

  // 5. Cumulative R-Value — target: growing positive
  cumulativeR: number;
  rValueCount: number;   // number of trades with a calculable R

  // 6. Max Drawdown % — target < 15–20%
  maxDrawdownPct: number;

  // 7. Avg Holding Time split by outcome
  holdingTime: {
    winners: HoldingTimeStats;
    losers: HoldingTimeStats;
    // "healthy" = losers held <= winners; "warning" = reverse; "insufficient_data" = <1 group
    bias: "healthy" | "warning" | "insufficient_data";
  };

  raw: {
    grossProfit: number;
    grossLoss: number;
    avgWin: number;
    avgLoss: number;
    netPnl: number;
  };
}

// ─── Annotation helper ────────────────────────────────────────────────────────

/**
 * Merge a GroupedTrade with its journal row from fetchJournalMap().
 * Pass undefined for journal if the trade has no journal entry.
 */
export function buildAnnotatedTrade(
  trade: GroupedTrade,
  journal: Record<string, unknown> | undefined,
): AnnotatedTrade {
  return {
    ...trade,
    setup: (journal?.setup as string | null) ?? null,
    plannedStop: journal?.planned_stop != null ? Number(journal.planned_stop) : null,
    riskAmount: journal?.risk_amount != null ? Number(journal.risk_amount) : null,
  };
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function applyClosed(trades: AnnotatedTrade[]): AnnotatedTrade[] {
  return trades.filter(t => t.status === "CLOSED");
}

function applyFilter(trades: AnnotatedTrade[], filter: PerformanceFilter): AnnotatedTrade[] {
  let out = trades;
  if (filter.setup) out = out.filter(t => t.setup === filter.setup);
  if (filter.side) out = out.filter(t => t.side === filter.side);
  return out;
}

// ─── Individual metric calculators ────────────────────────────────────────────

function calcWinRate(closed: AnnotatedTrade[]): number {
  if (!closed.length) return 0;
  return round((closed.filter(t => t.result === "WIN").length / closed.length) * 100, 4);
}

function calcGrossProfit(closed: AnnotatedTrade[]): number {
  return round(closed.filter(t => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0), 2);
}

function calcGrossLoss(closed: AnnotatedTrade[]): number {
  return round(closed.filter(t => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0), 2);
}

function calcProfitFactor(grossProfit: number, grossLoss: number): number {
  const absLoss = Math.abs(grossLoss);
  if (absLoss < EPS) return grossProfit > 0 ? round(grossProfit, 4) : 0;
  return round(grossProfit / absLoss, 4);
}

function calcAvgWin(closed: AnnotatedTrade[]): number {
  const wins = closed.filter(t => t.result === "WIN").map(t => t.netPnl);
  return wins.length ? round(wins.reduce((s, v) => s + v, 0) / wins.length, 2) : 0;
}

function calcAvgLoss(closed: AnnotatedTrade[]): number {
  const losses = closed.filter(t => t.result === "LOSS").map(t => t.netPnl);
  return losses.length ? round(losses.reduce((s, v) => s + v, 0) / losses.length, 2) : 0;
}

/**
 * System Expectancy: (winRate% * avgWin) - (lossRate% * |avgLoss|)
 * Expresses the statistical edge per trade in dollar terms.
 */
function calcExpectancy(
  closed: AnnotatedTrade[],
  avgWin: number,
  avgLoss: number,
): number {
  if (!closed.length) return 0;
  const winRate = closed.filter(t => t.result === "WIN").length / closed.length;
  const lossRate = closed.filter(t => t.result === "LOSS").length / closed.length;
  return round(winRate * avgWin - lossRate * Math.abs(avgLoss), 2);
}

function calcWinLossRatio(avgWin: number, avgLoss: number): number {
  const absLoss = Math.abs(avgLoss);
  if (absLoss < EPS) return avgWin > 0 ? round(avgWin, 4) : 0;
  return round(avgWin / absLoss, 4);
}

/**
 * Cumulative R-Value — sum of per-trade R across all closed trades.
 * R = directional PnL per share / risk per share (price-based).
 * Falls back to netPnl / riskAmount if plannedStop is absent.
 * Trades with neither plannedStop nor riskAmount are excluded (R undefined).
 */
function calcCumulativeR(closed: AnnotatedTrade[]): [number, number] {
  let total = 0;
  let count = 0;

  for (const trade of closed) {
    if (trade.avgExit === null) continue;

    // Price-based R (preferred): uses planned stop loss
    if (trade.plannedStop !== null) {
      const riskPerShare = Math.abs(trade.avgEntry - trade.plannedStop);
      if (riskPerShare < EPS) continue;
      const pnlPerShare =
        trade.side === "LONG"
          ? trade.avgExit - trade.avgEntry
          : trade.avgEntry - trade.avgExit;
      total += pnlPerShare / riskPerShare;
      count++;
      continue;
    }

    // Dollar-based R fallback: uses journaled risk_amount
    if (trade.riskAmount !== null && Math.abs(trade.riskAmount) > EPS) {
      total += trade.netPnl / Math.abs(trade.riskAmount);
      count++;
    }
  }

  return [round(total, 4), count];
}

/**
 * Max Drawdown expressed as a percentage of the running equity peak.
 * Trades are ordered by exit time (chronological equity curve).
 * Returns 0 if equity never goes positive (no meaningful peak to measure from).
 */
function calcMaxDrawdownPct(closed: AnnotatedTrade[]): number {
  const sorted = [...closed]
    .filter(t => t.exitTime !== null)
    .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());

  if (!sorted.length) return 0;

  let cumulative = 0;
  let peak = 0;
  let maxDDPct = 0;

  for (const trade of sorted) {
    cumulative += trade.netPnl;
    peak = Math.max(peak, cumulative);
    if (peak > EPS) {
      const ddPct = ((cumulative - peak) / peak) * 100;
      maxDDPct = Math.min(maxDDPct, ddPct);
    }
  }

  return round(maxDDPct, 4);
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);
  return parts.join(" ") || "0m";
}

function avgHoldingMinutes(trades: AnnotatedTrade[]): number {
  const minutes = trades.map(t => t.holdingMinutes).filter((m): m is number => m !== null);
  if (!minutes.length) return 0;
  return Math.round(minutes.reduce((s, m) => s + m, 0) / minutes.length);
}

function calcHoldingTime(closed: AnnotatedTrade[]): PerformanceReport["holdingTime"] {
  const winners = closed.filter(t => t.result === "WIN");
  const losers = closed.filter(t => t.result === "LOSS");

  const avgWinMinutes = avgHoldingMinutes(winners);
  const avgLossMinutes = avgHoldingMinutes(losers);

  const hasData = winners.some(t => t.holdingMinutes !== null) &&
                  losers.some(t => t.holdingMinutes !== null);

  const bias = !hasData
    ? "insufficient_data" as const
    : avgLossMinutes <= avgWinMinutes
    ? "healthy" as const
    : "warning" as const;

  return {
    winners: { avgMinutes: avgWinMinutes, display: formatMinutes(avgWinMinutes), tradeCount: winners.length },
    losers: { avgMinutes: avgLossMinutes, display: formatMinutes(avgLossMinutes), tradeCount: losers.length },
    bias,
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute a full performance report for the given trades.
 *
 * @param trades   AnnotatedTrade[] — GroupedTrade enriched with journal data
 * @param filter   Optional filter by setup tag and/or trade direction
 */
export function computePerformanceReport(
  trades: AnnotatedTrade[],
  filter: PerformanceFilter = {},
): PerformanceReport {
  const filtered = applyFilter(trades, filter);
  const closed = applyClosed(filtered);

  const winCount = closed.filter(t => t.result === "WIN").length;
  const lossCount = closed.filter(t => t.result === "LOSS").length;
  const breakevenCount = closed.filter(t => t.result === "BREAKEVEN").length;

  const grossProfit = calcGrossProfit(closed);
  const grossLoss = calcGrossLoss(closed);
  const avgWin = calcAvgWin(closed);
  const avgLoss = calcAvgLoss(closed);
  const [cumulativeR, rValueCount] = calcCumulativeR(closed);

  return {
    filter,
    tradeCount: closed.length,
    winCount,
    lossCount,
    breakevenCount,

    winRate: calcWinRate(closed),
    profitFactor: calcProfitFactor(grossProfit, grossLoss),
    expectancy: calcExpectancy(closed, avgWin, avgLoss),
    winLossRatio: calcWinLossRatio(avgWin, avgLoss),
    cumulativeR,
    rValueCount,
    maxDrawdownPct: calcMaxDrawdownPct(closed),
    holdingTime: calcHoldingTime(closed),

    raw: {
      grossProfit,
      grossLoss,
      avgWin,
      avgLoss,
      netPnl: round(closed.reduce((s, t) => s + t.netPnl, 0), 2),
    },
  };
}
