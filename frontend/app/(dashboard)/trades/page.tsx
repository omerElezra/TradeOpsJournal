"use client";

import { TradeTable } from "@/components/table/trade-table";
import { MetricCard } from "@/components/metrics/metric-card";
import { useMetrics } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatNumber, formatPercent } from "@/lib/format";

export default function TradesPage() {
  const { range } = useRange();
  const { data, isLoading } = useMetrics(range);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Every round-trip, grouped from raw executions.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Wins"
          value={data ? `${data.wins} (${formatPercent(data.winRate)})` : "—"}
          intent="positive"
          isLoading={isLoading}
        />
        <MetricCard
          label="Losses"
          value={
            data
              ? `${data.losses} (${formatPercent(
                  data.totalTrades > 0
                    ? (data.losses / data.totalTrades) * 100
                    : 0,
                )})`
              : "—"
          }
          intent="negative"
          isLoading={isLoading}
        />
        <MetricCard
          label="Total Trades"
          value={data ? String(data.totalTrades) : "—"}
          intent="neutral"
          isLoading={isLoading}
        />
        <MetricCard
          label="Total Commission"
          value={data ? formatNumber(data.totalCommission) : "—"}
          intent={data && data.totalCommission < 0 ? "negative" : "neutral"}
          isLoading={isLoading}
        />
      </section>

      <TradeTable variant="full" pageSize={50} />
    </div>
  );
}
