"use client";

import { Sparkles, Lightbulb, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInsights } from "@/hooks/use-metrics";
import { useRange } from "@/components/range-context";
import type { Insight, InsightType } from "@/types";

const ICONS: Record<InsightType, typeof Lightbulb> = {
  STRENGTH: TrendingUp,
  WEAKNESS: AlertTriangle,
  PATTERN: Sparkles,
  WARNING: AlertTriangle,
  SUGGESTION: Lightbulb,
};

export function AIInsightPanel({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { range } = useRange();
  const { data, isLoading } = useInsights(range);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Sparkles className="h-4 w-4 text-primary" />
        <CardTitle className="text-foreground">AI Insights</CardTitle>
        <Badge variant="neutral" className="ml-auto">
          beta
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        {isLoading ? (
          <>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </>
        ) : data && data.length ? (
          data
            .slice(0, variant === "compact" ? 3 : data.length)
            .map((i) => <InsightCard key={i.id} insight={i} />)
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const Icon = ICONS[insight.type];
  return (
    <div className="rounded-md border border-border bg-background/40 p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm font-medium">{insight.title}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {insight.summary}
      </p>
      {insight.recommendation && (
        <p className="mt-2 text-xs font-medium text-foreground">
          → {insight.recommendation}
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
      <Sparkles className="h-6 w-6" />
      <p className="text-sm">Your AI coach is analyzing soon</p>
      <p className="text-xs">Insights about your trading behavior will appear here.</p>
    </div>
  );
}
