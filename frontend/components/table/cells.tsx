import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatSignedCurrency } from "@/lib/format";
import type { Side, TradeResult } from "@/types";

export function PnLCell({ value, currency }: { value: number; currency?: string }) {
  return (
    <span
      className={cn(
        "tabular font-medium",
        value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-muted-foreground",
      )}
    >
      {formatSignedCurrency(value, currency)}
    </span>
  );
}

export function SideBadge({ side }: { side: Side }) {
  return (
    <Badge variant={side === "LONG" ? "positive" : "negative"}>{side}</Badge>
  );
}

export function ResultBadge({ result }: { result: TradeResult }) {
  const variant =
    result === "WIN" ? "positive" : result === "LOSS" ? "negative" : "neutral";
  return <Badge variant={variant}>{result}</Badge>;
}
