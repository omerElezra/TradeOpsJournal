import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tip } from "@/components/journal/form-controls";
import { METRIC_HELP } from "@/lib/help";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  delta?: number;
  deltaLabel?: string;
  intent?: "positive" | "negative" | "neutral";
  isLoading?: boolean;
}

export function MetricCard({
  label,
  value,
  description,
  delta,
  deltaLabel,
  intent = "neutral",
  isLoading,
}: MetricCardProps) {
  const valueColor =
    intent === "positive"
      ? "text-positive"
      : intent === "negative"
        ? "text-negative"
        : "text-foreground";

  return (
    <Card className="h-28">
      <CardContent className="flex h-full flex-col justify-between p-5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {METRIC_HELP[label] ? (
            <span className="group relative cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
              {label}
              <Tip text={METRIC_HELP[label]} />
            </span>
          ) : (
            label
          )}
        </span>

        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-end justify-between">
              <span className={cn("tabular text-2xl font-semibold", valueColor)}>
                {value}
              </span>
              {delta !== undefined && <DeltaPill delta={delta} label={deltaLabel} />}
            </div>
            {description && (
              <span className="text-[10px] leading-tight text-muted-foreground/60">
                {description}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeltaPill({ delta, label }: { delta: number; label?: string }) {
  const up = delta >= 0;
  return (
    <span
      className={cn(
        "tabular flex items-center gap-0.5 text-xs font-medium",
        up ? "text-positive" : "text-negative",
      )}
      title={label}
    >
      {up ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {Math.abs(delta).toFixed(1)}
    </span>
  );
}
