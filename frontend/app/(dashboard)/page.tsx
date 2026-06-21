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
  formatDateTime,
  formatPercent,
  pnlIntent,
} from "@/lib/format";


export default function DashboardPage() {
  const { range } = useRange();
  const { data: metrics, isLoading: metricsLoading } = useMetrics(range);
  const { data: cash, isLoading: cashLoading } = useCashSummary(range);

  const netPnlAfterFees =
    metrics && cash ? metrics.netPnl - cash.cashFxCommissionPaid : null;

  const estimatedAccountValue =
    cash && netPnlAfterFees != null
      ? cash.netDepositedUsd + netPnlAfterFees
      : null;

  const totalCommissionPaid =
    metrics && cash
      ? Math.abs(metrics.totalCommission) + cash.cashFxCommissionPaid
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Account and portfolio snapshot.</p>
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
            description="Sum of all deposit amounts"
            intent="neutral"
            isLoading={cashLoading}
          />
          <MetricCard
            label="Total Deposited ILS"
            value={cash ? formatNumber(cash.totalDepositedIls) + " ₪" : "—"}
            description="Qty × Rate for USD.ILS deposits"
            intent="neutral"
            isLoading={cashLoading}
          />
          {/* Only show Net Deposited when there are actual withdrawals */}
          {(!cash || cash.totalWithdrawnUsd > 0) && (
            <MetricCard
              label="Net Deposited USD"
              value={cash ? formatCurrency(cash.netDepositedUsd) : "—"}
              description="Deposited − Withdrawn"
              intent={cash && cash.netDepositedUsd >= 0 ? "positive" : "negative"}
              isLoading={cashLoading}
            />
          )}
          {(!cash || cash.totalWithdrawnIls > 0) && (
            <MetricCard
              label="Net Deposited ILS"
              value={cash ? formatNumber(cash.netDepositedIls) + " ₪" : "—"}
              description="Deposited − Withdrawn in ILS"
              intent={cash && cash.netDepositedIls >= 0 ? "positive" : "negative"}
              isLoading={cashLoading}
            />
          )}
          <MetricCard
            label="Est. Account Value"
            value={estimatedAccountValue != null ? formatCurrency(estimatedAccountValue) : "—"}
            description="Net Deposited + Net P&L (closed trades only, excl. open positions)"
            intent={estimatedAccountValue != null ? pnlIntent(estimatedAccountValue) : "neutral"}
            isLoading={cashLoading || metricsLoading}
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
            value={metrics ? formatCurrency(metrics.realizedPnlGross) : "—"}
            description="Gross P&L from closed trades, before commission"
            intent={metrics ? pnlIntent(metrics.realizedPnlGross) : "neutral"}
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Total Commission Paid"
            value={totalCommissionPaid != null ? formatCurrency(totalCommissionPaid) : "—"}
            description="Trade commission + Cash/FX commission"
            intent="negative"
            isLoading={metricsLoading || cashLoading}
          />
          <MetricCard
            label="Net P&L After Fees"
            value={netPnlAfterFees != null ? formatCurrency(netPnlAfterFees) : "—"}
            description="netPnl (after trade comm) − Cash/FX commission"
            intent={netPnlAfterFees != null ? pnlIntent(netPnlAfterFees) : "neutral"}
            isLoading={metricsLoading || cashLoading}
          />
          <MetricCard
            label="Net ROI"
            value={metrics ? formatPercent(metrics.netRoi) : "—"}
            description="Net P&L / capital deployed in trades"
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
            description="Open + Closed trades"
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Open Trades"
            value={metrics ? String(metrics.openTrades) : "—"}
            description="Trades with no exit yet"
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Closed Trades"
            value={metrics ? String(metrics.closedTrades) : "—"}
            description="Fully exited trades"
            intent="neutral"
            isLoading={metricsLoading}
          />
          <MetricCard
            label="Last Trade Date"
            value={metrics?.lastTradeDate ? formatDateTime(metrics.lastTradeDate) : "—"}
            description="Most recent closed trade exit"
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
