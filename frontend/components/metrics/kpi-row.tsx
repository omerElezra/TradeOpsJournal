"use client";

import { MetricCard } from "@/components/metrics/metric-card";
import { useMetrics } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatNumber, formatPercent } from "@/lib/format";

export function KpiRow() {
  const { range } = useRange();
  const { data, isLoading } = useMetrics(range);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Win Rate"
        value={data ? formatPercent(data.winRate) : "—"}
        delta={data?.deltas.winRate}
        deltaLabel="vs prev period"
        intent={data && data.winRate >= 50 ? "positive" : "neutral"}
        isLoading={isLoading}
      />
      <MetricCard
        label="Profit Factor"
        value={data ? formatNumber(data.profitFactor) : "—"}
        delta={data?.deltas.profitFactor}
        intent={data && data.profitFactor >= 1 ? "positive" : "negative"}
        isLoading={isLoading}
      />
      <MetricCard
        label="Net ROI"
        value={data ? formatPercent(data.netRoi) : "—"}
        delta={data?.deltas.netRoi}
        intent={data && data.netRoi >= 0 ? "positive" : "negative"}
        isLoading={isLoading}
      />
      <MetricCard
        label="Total Trades"
        value={data ? String(data.totalTrades) : "—"}
        delta={data?.deltas.totalTrades}
        intent="neutral"
        isLoading={isLoading}
      />
    </section>
  );
}
