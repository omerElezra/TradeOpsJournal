"use client";

import * as React from "react";
import { Pencil, RefreshCw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  useDeleteTradePlan,
  useTradePlans,
  useUpdateTradePlan,
} from "@/hooks/use-entry-check";
import { buildEntryPrompt } from "@/lib/domain/entry-prompt";
import { emptyChecklist } from "@/lib/domain/scoring";
import { CopyPromptButton } from "./copy-prompt-button";
import type { TradePlanRow, TradePlanStatus } from "@/lib/domain/pre-entry";

const STATUS_CYCLE: TradePlanStatus[] = ["planned", "entered", "skipped", "expired"];

const STATUS_CLS: Record<TradePlanStatus, string> = {
  planned: "border-border bg-accent text-foreground",
  entered: "border-positive/50 bg-positive/10 text-positive",
  skipped: "border-border bg-background text-muted-foreground",
  expired: "border-negative/40 bg-negative/5 text-muted-foreground",
};

function planPrompt(plan: TradePlanRow): string | null {
  if (!plan.context) return null;
  return buildEntryPrompt({
    context: plan.context,
    checklist: { ...emptyChecklist(), ...plan.checklist },
    score: plan.scoreBreakdown,
    forwardOutcome: plan.forwardOutcome,
    notes: plan.notes,
  });
}

/**
 * Return % of the stock from the plan's reference price until now. Fetched
 * lazily on click (never on page load — the market-data provider is
 * rate-limited); clicking again refreshes with the latest price.
 */
function ReturnSincePlan({ plan }: { plan: TradePlanRow }) {
  const refPrice = plan.refPrice ?? plan.context?.refPrice ?? null;
  const [result, setResult] = React.useState<{ pct: number; price: number } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  if (refPrice == null) return null;

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const now = Math.floor(Date.now() / 1000);
      const res = await api.getCandles({
        symbol: plan.symbol,
        interval: "1d",
        from: now - 14 * 86400,
        to: now,
      });
      const last = res.candles[res.candles.length - 1];
      if (!last) throw new Error("no candles");
      setResult({ pct: ((last.close - refPrice) / refPrice) * 100, price: last.close });
    } catch {
      setFailed(true);
    }
    setLoading(false);
  };

  const favorable =
    result != null &&
    (plan.direction === "LONG" ? result.pct > 0 : result.pct < 0);
  const cls =
    result == null
      ? "border-border bg-background text-muted-foreground"
      : favorable
        ? "border-positive/50 bg-positive/10 text-positive"
        : "border-negative/40 bg-negative/10 text-negative";
  const title =
    result == null
      ? failed
        ? "Price fetch failed — click to retry (provider may be rate-limited)"
        : `Stock return since the plan (from ${formatNumber(refPrice)}) — click to fetch the current price`
      : `${formatNumber(refPrice)} → ${formatNumber(result.price)} since the plan — click to refresh`;

  return (
    <button
      type="button"
      className={`tabular inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
      title={title}
      onClick={refresh}
    >
      <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
      {result != null
        ? `${result.pct >= 0 ? "+" : ""}${result.pct.toFixed(1)}%`
        : failed
          ? "retry"
          : "now?"}
    </button>
  );
}

function PlanRow({
  plan,
  onEdit,
  active,
}: {
  plan: TradePlanRow;
  onEdit?: (plan: TradePlanRow) => void;
  active: boolean;
}) {
  const update = useUpdateTradePlan();
  const del = useDeleteTradePlan();

  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-md border p-2.5 ${
        active ? "border-primary/50 bg-primary/5" : "border-border"
      }`}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        title="Open this plan in the form for full editing"
        onClick={() => onEdit?.(plan)}
      >
        <p className="text-sm font-medium">
          {plan.symbol}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {plan.direction} · {formatDateTime(plan.plannedAt)}
          </span>
          {active && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] text-primary">
              <Pencil className="h-2.5 w-2.5" />
              editing
            </span>
          )}
        </p>
        {plan.notes && (
          <p dir="auto" className="truncate text-xs text-muted-foreground">
            {plan.notes}
          </p>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <ReturnSincePlan plan={plan} />
        {plan.score != null && (
          <span
            className={`tabular text-sm font-semibold ${
              plan.score > 0 ? "text-positive" : plan.score < 0 ? "text-negative" : ""
            }`}
          >
            {plan.score > 0 ? `+${plan.score}` : plan.score}
          </span>
        )}
        <button
          type="button"
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLS[plan.status]}`}
          title="Click to cycle status"
          onClick={() =>
            update.mutate({
              id: plan.id,
              patch: {
                status:
                  STATUS_CYCLE[
                    (STATUS_CYCLE.indexOf(plan.status) + 1) % STATUS_CYCLE.length
                  ],
              },
            })
          }
        >
          {plan.status}
        </button>
        {plan.context && (
          <CopyPromptButton iconOnly buildPrompt={() => planPrompt(plan)} />
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          title="Edit this plan (full form)"
          onClick={() => onEdit?.(plan)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-negative"
          title="Delete plan"
          onClick={() => del.mutate(plan.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function RecentPlans({
  onEdit,
  editingId,
}: {
  onEdit?: (plan: TradePlanRow) => void;
  editingId?: number | null;
}) {
  const { data: plans, isLoading } = useTradePlans({ limit: 10 });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Recent Plans</CardTitle>
        <p className="text-xs text-muted-foreground">
          Click a plan to load it into the form and edit any of its parameters.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !plans?.length ? (
          <p className="text-sm text-muted-foreground">
            No saved plans yet — run a check and save it to start building your
            pre-entry track record.
          </p>
        ) : (
          <ul className="space-y-2">
            {plans.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                onEdit={onEdit}
                active={editingId === plan.id}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
