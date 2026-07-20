"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useComputeEnrichment, useEnrichment } from "@/hooks/use-enrichment";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  Item,
  Section,
  TrendBadge,
  VixBadge,
  YesNo,
  num,
  pct,
} from "@/components/trades/context-badges";
import type { TradeContextEnrichment } from "@/lib/domain/enrichment";
import type { TradeGroupDetail } from "@/types";

function EnrichmentBody({ e }: { e: TradeContextEnrichment }) {
  const { riskReward: rr, stockContext: sc, marketContext: mc, tradeJourney: tj, dataQuality: dq } = e;
  return (
    <div className="space-y-5">
      <Section title="Risk / Reward">
        <Item label="Planned Risk /sh">{num(rr.plannedRiskPerShare)}</Item>
        <Item label="Planned Reward /sh">{num(rr.plannedRewardPerShare)}</Item>
        <Item label="Planned R/R">
          {rr.plannedRr != null ? `${formatNumber(rr.plannedRr)} : 1` : "—"}
        </Item>
        <Item label="Actual R">
          {rr.actualRMultiple != null ? `${formatNumber(rr.actualRMultiple)}R` : "—"}
        </Item>
      </Section>

      <Section title={`${e.symbol} at entry`}>
        <Item label="MA Alignment">
          <TrendBadge trend={sc.maAlignment} />
        </Item>
        <Item label="Above MA20 / 50 / 150">
          <YesNo value={sc.aboveMa20} /> / <YesNo value={sc.aboveMa50} /> /{" "}
          <YesNo value={sc.aboveMa150 ?? null} />
        </Item>
        <Item label="Dist MA20 / 50 / 150">
          {pct(sc.distanceFromMa20Pct, 1)} / {pct(sc.distanceFromMa50Pct, 1)} /{" "}
          {pct(sc.distanceFromMa150Pct ?? null, 1)}
        </Item>
        <Item label="Return 5d / 20d / 60d">
          {pct(sc.return5dPct, 1)} / {pct(sc.return20dPct, 1)} / {pct(sc.return60dPct, 1)}
        </Item>
        <Item label="Avg Volume 20d">{num(sc.avgVolume20d, 0)}</Item>
        <Item label="Entry Day Volume">{num(sc.entryDayVolume, 0)}</Item>
        <Item label="Relative Volume">
          {sc.relativeVolume != null ? `${formatNumber(sc.relativeVolume)}×` : "—"}
        </Item>
        <Item label="ATR14 (ATR%)">
          {num(sc.atr14)} ({pct(sc.atrPct, 1)})
        </Item>
      </Section>

      <Section title="Market at entry">
        <Item label="SPY">
          <TrendBadge trend={mc.spy.bias} />
        </Item>
        <Item label="QQQ">
          <TrendBadge trend={mc.qqq.bias} />
        </Item>
        <Item label="Market Bias">
          <TrendBadge trend={mc.marketBias} />
        </Item>
        <Item label="Supports Trade">
          <YesNo value={mc.marketSupportiveForTrade} />
        </Item>
        <Item label="VIX at entry">
          {mc.vix?.level != null ? formatNumber(mc.vix.level) : "—"}
        </Item>
        <Item label="VIX Regime">
          <VixBadge regime={mc.vix?.regime ?? "UNKNOWN"} />
        </Item>
        <Item label="VIX 5d Change">{pct(mc.vix?.return5dPct ?? null, 1)}</Item>
      </Section>

      <Section title="Trade journey">
        <Item label="High / Low">
          {num(tj.highestPriceDuringTrade)} / {num(tj.lowestPriceDuringTrade)}
        </Item>
        <Item label="MFE">
          {num(tj.mfe)} ({pct(tj.mfePct, 1)}
          {tj.mfeR != null ? ` · ${formatNumber(tj.mfeR)}R` : ""})
        </Item>
        <Item label="MAE">
          {num(tj.mae)} ({pct(tj.maePct, 1)}
          {tj.maeR != null ? ` · ${formatNumber(tj.maeR)}R` : ""})
        </Item>
        <Item label="Exit Efficiency">{pct(tj.exitEfficiencyPct, 1)}</Item>
      </Section>

      {(dq.missingInputs.length > 0 ||
        dq.missingMarketData.length > 0 ||
        dq.warnings.length > 0 ||
        dq.assumptions.length > 0) && (
        <div className="space-y-1 rounded-md border border-border bg-accent/40 p-3 text-xs text-muted-foreground">
          {dq.warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
          {dq.missingMarketData.map((m) => (
            <p key={m}>✕ Market data: {m}</p>
          ))}
          {dq.missingInputs.length > 0 && (
            <p>✕ Missing inputs: {dq.missingInputs.join(", ")}</p>
          )}
          {dq.assumptions.map((a) => (
            <p key={a}>ℹ {a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function TradeContextCard({ trade }: { trade: TradeGroupDetail }) {
  const { data: row, isLoading } = useEnrichment(trade.id);
  const compute = useComputeEnrichment(trade.id);
  const closed = trade.status === "CLOSED";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-foreground">Trade Context</CardTitle>
        <div className="flex items-center gap-3">
          {row && (
            <span className="text-xs text-muted-foreground">
              Computed {formatDateTime(row.computedAt)}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!closed || compute.isPending}
            onClick={() => compute.mutate()}
          >
            {row ? (
              <RefreshCw
                className={`mr-1.5 h-3.5 w-3.5 ${compute.isPending ? "animate-spin" : ""}`}
              />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            {compute.isPending ? "Computing…" : row ? "Recompute" : "Compute"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : row ? (
          <EnrichmentBody e={row.enrichment} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {closed
              ? "No context computed yet. Compute derives objective entry/exit metrics — R-multiples, technical and market context, MFE/MAE — from broker data and daily candles."
              : "Context enrichment is available once the trade is closed."}
          </p>
        )}
        {compute.isError && (
          <p className="mt-3 text-sm text-negative">
            {compute.error instanceof Error ? compute.error.message : "Failed to compute"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
