"use client";

import { useRange } from "@/components/range-context";
import { useMetrics } from "@/hooks/use-metrics";
import { useEquityCurve } from "@/hooks/use-metrics";
import { useAnalytics } from "@/hooks/use-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EquityCurveChart } from "@/components/charts/equity-curve-chart";
import { WinLossDonut } from "@/components/charts/win-loss-donut";
import { PnlBars } from "@/components/charts/pnl-bars";
import { SymbolPnlChart } from "@/components/charts/symbol-pnl-chart";
import { MonthlyPnlChart } from "@/components/charts/monthly-pnl-chart";

function ChartCard({
  title,
  subtitle,
  loading,
  children,
  className,
  skeletonH = "h-52",
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  children: React.ReactNode;
  className?: string;
  skeletonH?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-baseline justify-between">
          <CardTitle className="text-sm font-medium text-foreground">{title}</CardTitle>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className={`${skeletonH} w-full`} /> : children}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { range } = useRange();
  const { data: metrics, isLoading: metricsLoading } = useMetrics(range);
  const { data: equity,  isLoading: equityLoading }  = useEquityCurve(range);
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(range);

  const minDrawdown = equity?.length
    ? Math.min(...equity.map(p => p.drawdown ?? 0))
    : 0;

  const totalPnl = analytics?.bySymbol.reduce((s, r) => s + r.netPnl, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Equity curve, distributions, and performance breakdown.
        </p>
      </div>

      {/* Row 1: Key stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricsLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-4"><Skeleton className="h-8 w-full" /></CardContent></Card>
            ))
          : metrics && [
              { label: "Profit Factor", value: metrics.profitFactor.toFixed(2) },
              { label: "Expectancy",    value: `$${metrics.expectancy.toFixed(2)}` },
              { label: "Avg Win",       value: `$${metrics.avgWin.toFixed(2)}`,       color: "text-positive" },
              { label: "Avg Loss",      value: `$${metrics.avgLoss.toFixed(2)}`,      color: "text-negative" },
              { label: "Best Trade",    value: `$${metrics.bestTrade.toFixed(2)}`,    color: "text-positive" },
              { label: "Worst Trade",   value: `$${metrics.worstTrade.toFixed(2)}`,   color: "text-negative" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-sm font-semibold tabular ${color ?? ""}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Row 2: P&L per Trade */}
      <ChartCard
        title="P&L per Trade"
        subtitle={analytics ? `${analytics.pnlPerTrade.length} closed trades` : undefined}
        loading={analyticsLoading}
      >
        <PnlBars data={analytics?.pnlPerTrade ?? []} height={220} />
      </ChartCard>

      {/* Row 3: Equity Curve + Win/Loss Donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Equity Curve"
          subtitle={
            equity?.length
              ? `${equity.length} trades · max dd $${Math.abs(minDrawdown).toFixed(0)}`
              : undefined
          }
          loading={equityLoading}
          className="lg:col-span-2"
          skeletonH="h-64"
        >
          <EquityCurveChart data={equity ?? []} height={260} showDrawdown />
        </ChartCard>

        <ChartCard
          title="Win / Loss Breakdown"
          subtitle={metrics ? `${metrics.closedTrades} closed` : undefined}
          loading={metricsLoading}
          skeletonH="h-48"
        >
          <WinLossDonut
            wins={metrics?.wins ?? 0}
            losses={metrics?.losses ?? 0}
            breakevens={metrics?.breakevens ?? 0}
            winRate={metrics?.winRate ?? 0}
          />
        </ChartCard>
      </div>

      {/* Row 4: Monthly P&L + Symbol Performance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard
          title="Monthly P&L"
          subtitle={analytics ? `${analytics.byMonth.length} months` : undefined}
          loading={analyticsLoading}
          className="lg:col-span-2"
        >
          <MonthlyPnlChart data={analytics?.byMonth ?? []} height={220} />
        </ChartCard>

        <ChartCard
          title="P&L by Symbol"
          subtitle={analytics ? `${analytics.bySymbol.length} symbols` : undefined}
          loading={analyticsLoading}
          skeletonH="h-64"
        >
          <SymbolPnlChart data={analytics?.bySymbol ?? []} totalPnl={totalPnl} />
        </ChartCard>
      </div>
    </div>
  );
}
