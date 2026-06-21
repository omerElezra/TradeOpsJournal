"use client";

import { TradeTable } from "@/components/table/trade-table";
import { MetricCard } from "@/components/metrics/metric-card";
import { useMetrics } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatCurrency, formatPercent, pnlIntent } from "@/lib/format";

export default function TradesPage() {
  const { range } = useRange();
  const { data, isLoading } = useMetrics(range);

  const lossRate =
    data && data.closedTrades > 0
      ? (data.losses / data.closedTrades) * 100
      : 0;

  const profitFactorDisplay = data
    ? data.grossLoss === 0
      ? data.grossProfit > 0 ? "∞" : "N/A"
      : formatCurrency(data.profitFactor).replace("$", "")
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
            description="Open + Closed"
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Open Trades"
            value={data ? String(data.openTrades) : "—"}
            description="No exit recorded yet"
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Closed Trades"
            value={data ? String(data.closedTrades) : "—"}
            description="Fully exited trades"
            intent="neutral"
            isLoading={isLoading}
          />
          <MetricCard
            label="Wins"
            value={data ? `${data.wins} (${formatPercent(data.winRate)})` : "—"}
            description="Closed trades with P&L > 0 (win rate %)"
            intent="positive"
            isLoading={isLoading}
          />
          <MetricCard
            label="Losses"
            value={data ? `${data.losses} (${formatPercent(lossRate)})` : "—"}
            description="Closed trades with P&L < 0 (loss rate %)"
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Realized P&L"
            value={data ? formatCurrency(data.realizedPnlGross) : "—"}
            description="Gross P&L before trade commission"
            intent={data ? pnlIntent(data.realizedPnlGross) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Net Trading P&L After Commission"
            value={data ? formatCurrency(data.netPnl) : "—"}
            description="Realized P&L − trade commissions"
            intent={data ? pnlIntent(data.netPnl) : "neutral"}
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
            description="Sum of |commission| for all closed trades"
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Average Win"
            value={data ? formatCurrency(data.avgWin) : "—"}
            description="Gross profit / win count"
            intent="positive"
            isLoading={isLoading}
          />
          <MetricCard
            label="Average Loss"
            value={data ? formatCurrency(Math.abs(data.avgLoss)) : "—"}
            description="|Gross loss| / loss count"
            intent="negative"
            isLoading={isLoading}
          />
          <MetricCard
            label="Best Trade"
            value={data ? formatCurrency(data.bestTrade) : "—"}
            description="Highest single trade net P&L"
            intent={data ? pnlIntent(data.bestTrade) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Worst Trade"
            value={data ? formatCurrency(data.worstTrade) : "—"}
            description="Lowest single trade net P&L"
            intent={data ? pnlIntent(data.worstTrade) : "neutral"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Profit Factor"
            value={data ? profitFactorDisplay : "—"}
            description="Gross profit / |gross loss|"
            delta={data?.deltas.profitFactor}
            intent={data && data.profitFactor >= 1 ? "positive" : "negative"}
            isLoading={isLoading}
          />
          <MetricCard
            label="Total Trade Volume"
            value={data ? formatCurrency(data.totalTradeVolume) : "—"}
            description="Sum of |entry price × qty|"
            intent="neutral"
            isLoading={isLoading}
          />
        </div>
      </div>

      <TradeTable variant="full" pageSize={50} />
    </div>
  );
}
