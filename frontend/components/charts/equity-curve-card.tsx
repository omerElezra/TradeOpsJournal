"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEquityCurve } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import { formatSignedCurrency } from "@/lib/format";
import { EquityCurveChart } from "./equity-curve-chart";

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
      <CardContent className="flex-1">
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : (
          <EquityCurveChart data={data ?? []} height={260} />
        )}
      </CardContent>
    </Card>
  );
}
