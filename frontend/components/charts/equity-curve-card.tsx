"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquityCurve } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatSignedCurrency } from "@/lib/format";

/**
 * Placeholder for TradingView Lightweight Charts. The chart mount point is a single
 * <div ref> so dropping the library in later requires zero layout change.
 */
export function EquityCurveCard() {
  const { range } = useRange();
  const { data, isLoading } = useEquityCurve(range);

  const last = data?.[data.length - 1];

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-foreground">Equity Curve</CardTitle>
        {last && (
          <span
            className={`tabular text-sm font-medium ${
              last.equity >= 0 ? "text-positive" : "text-negative"
            }`}
          >
            {formatSignedCurrency(last.equity)}
          </span>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex h-[360px] items-center justify-center rounded-md border border-dashed border-border bg-background/40">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-6 w-6" />
              <span className="text-sm">
                {data && data.length
                  ? `${data.length} closed trades — chart renders here`
                  : "No closed trades in range"}
              </span>
              <span className="text-xs">TradingView Lightweight Charts mount point</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
