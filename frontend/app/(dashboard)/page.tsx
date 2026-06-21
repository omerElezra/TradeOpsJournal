"use client";

import { MetricCard } from "@/components/metrics/metric-card";
import { EquityCurveCard } from "@/components/charts/equity-curve-card";
import { AIInsightPanel } from "@/components/ai/ai-insight-panel";
import { useMetrics } from "@/hooks/use-metrics";
import { useCashSummary } from "@/hooks/use-cash";
import { useRange } from "@/components/range-context";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatDateTime,
  pnlIntent,
} from "@/lib/format";

export default function DashboardPage() {
  const { range } = useRange();
  const { data: metrics, isLoading: metricsLoading } = useMetrics(range);
  const { data: cash, isLoading: cashLoading } = useCashSummary(range);

  const netPnlAfterFees =
    metrics && cash
      ? metrics.netPnl - cash.cashFxCommissionPaid
      : null;

  const totalCommissionPaid =
    metrics && cash
      ? Math.abs(metrics.totalCommission) + cash.cashFxCommissionPaid
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Account and portfolio snapshot.
        </p>
      </div>

      {/* Account Snapshot */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Account Snapshot
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Total Deposited USD"
            value={cash ? formatCurrency(cash.totalDepositedUsd) : "—"}
            intent="neutral"
            isLoading={cashLoading}
          />
          <MetricCard
            label="Total Deposited ILS"
            value={cash ? formatNumber(cash.totalDepositedIls) + " ₪" : "—"}
            intent="neutral"
            isLoading={cashLoading}
          />
          <MetricCard
            label="Net Deposited USD"
            value={cash ? formatCurrency(cash.netDepositedUsd) : "—"}
            intent={cash && cash.netDepositedUsd >= 0 ? "positive" : "negative"}
            isLoading={cashLoading}
          />
          <MetricCard
            label="Net Deposited ILS"
            value={cash ? formatNumber(cash.netDepositedIls) + " ₪" : "—"}
            intent={cash && cash.netDepositedIls >= 0 ? "positive" : "negative"}
            isLoading={cashLoading}
          />
          <MetricCard
            label="Current Account Value"
            value="N/A"
            intent="neutral"
            isLoading={false}
          />
          <MetricCard
            label="Available Cash"
            value="N/A"
            intent="neutral"
            isLoading={false}
          />
          <MetricCard
            label="Open Positions Value"
            value="N/A"
            intent="neutral"
            isLoading={false}
          />
        </div>
      </div>

      {/* Performance Snapshot */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Performance
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Realized P&L"
            value={metrics ? formatCurrency(metrics.netPnl) : "—"}
            intent={metrics ? pnlIntent(metrics.netPnl) : "neutral"}
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Unrealized P&L"
            value="N/A"
            intent="neutral"
            isLoading={false}
          />
          <MetricCard
            label="Total Commission Paid"
            value={totalCommissionPaid != null ? formatCurrency(totalCommissionPaid) : "—"}
            intent="negative"
            isLoading={metricsLoading || cashLoading}
          />
          <MetricCard
            label="Net P&L After Fees"
            value={netPnlAfterFees != null ? formatCurrency(netPnlAfterFees) : "—"}
            intent={netPnlAfterFees != null ? pnlIntent(netPnlAfterFees) : "neutral"}
            isLoading={metricsLoading || cashLoading}
          />
          <MetricCard
            label="Net ROI"
            value={metrics ? formatPercent(metrics.netRoi) : "—"}
            delta={metrics?.deltas.netRoi}
            deltaLabel="vs prev period"
            intent={metrics && metrics.netRoi >= 0 ? "positive" : "negative"}
            isLoading={metricsLoading}
          />
        </div>
      </div>

      {/* Activity Snapshot */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Total Trades"
            value={metrics ? String(metrics.totalTrades) : "—"}
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Open Trades"
            value={metrics ? String(metrics.openTrades) : "—"}
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Closed Trades"
            value={metrics ? String(metrics.closedTrades) : "—"}
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Last Trade Date"
            value={
              metrics?.lastTradeDate
                ? formatDateTime(metrics.lastTradeDate)
                : "—"
            }
            intent="neutral"
            isLoading={metricsLoading}
          />
        </div>
      </div>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EquityCurveCard />
        </div>
        <div className="lg:col-span-1">
          <AIInsightPanel variant="compact" />
        </div>
      </section>
    </div>
  );
}
