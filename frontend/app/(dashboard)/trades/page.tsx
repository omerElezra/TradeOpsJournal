"use client";

import { TradeTable } from "@/components/table/trade-table";
import { MetricCard } from "@/components/metrics/metric-card";
import { useMetrics } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatCurrency, formatNumber, formatPercent, pnlIntent } from "@/lib/format";

export default function TradesPage() {
  const { range } = useRange();
  const { data, isLoading } = useMetrics(range);

  const netTradingPnlAfterCommission =
    data ? data.netPnl : null;

  const lossRate =
    data && data.closedTrades > 0
      ? (data.losses / data.closedTrades) * 100
      : 0;

  const profitFactorDisplay =
    data
      ? data.grossLoss === 0
        ? data.grossProfit > 0
          ? "∞"
          : "N/A"
        : formatNumber(data.profitFactor)
      : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Every round-trip, grouped from raw executions.
        </p>
      </div>

      {/* Primary Metrics */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Primary
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Total Trades"
            value={data ? String(data.totalTrades) : "—"}
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Open Trades"
            value={data ? String(data.openTrades) : "—"}
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Closed Trades"
            value={data ? String(data.closedTrades) : "—"}
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Win Rate"
            value={data ? formatPercent(data.winRate) : "—"}
            delta={data?.deltas.winRate}
            deltaLabel="vs prev period"
            intent={data && data.winRate >= 50 ? "positive" : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Wins"
            value={
              data
                ? `${data.wins} (${formatPercent(data.winRate)})`
                : "—"
            }
            intent="positive"
            isLoading={isLoading}
          />
          <MetricCard
            label="Losses"
            value={
              data
                ? `${data.losses} (${formatPercent(lossRate)})`
                : "—"
            }
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Realized P&L"
            value={data ? formatCurrency(data.netPnl) : "—"}
            intent={data ? pnlIntent(data.netPnl) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Net Trading P&L After Commission"
            value={
              netTradingPnlAfterCommission != null
                ? formatCurrency(netTradingPnlAfterCommission)
                : "—"
            }
            intent={
              netTradingPnlAfterCommission != null
                ? pnlIntent(netTradingPnlAfterCommission)
                : "neutral"
            }
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Quality Metrics */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quality
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Trade Commission Paid"
            value={data ? formatCurrency(Math.abs(data.totalCommission)) : "—"}
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Average Win"
            value={data ? formatCurrency(data.avgWin) : "—"}
            intent="positive"
            isLoading={isLoading}
          />
          <MetricCard
            label="Average Loss"
            value={data ? formatCurrency(Math.abs(data.avgLoss)) : "—"}
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Best Trade"
            value={data ? formatCurrency(data.bestTrade) : "—"}
            intent={data ? pnlIntent(data.bestTrade) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Worst Trade"
            value={data ? formatCurrency(data.worstTrade) : "—"}
            intent={data ? pnlIntent(data.worstTrade) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Profit Factor"
            value={data ? profitFactorDisplay : "—"}
            delta={data?.deltas.profitFactor}
            intent={data && data.profitFactor >= 1 ? "positive" : "negative"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Breakeven Trades"
            value={data ? String(data.breakevens) : "—"}
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Total Trade Volume"
            value={data ? formatCurrency(data.totalTradeVolume) : "—"}
            intent="neutral"
            isLoading={isLoading}
          />
        </div>
      </div>

      <TradeTable variant="full" pageSize={50} />
    </div>
  );
}
