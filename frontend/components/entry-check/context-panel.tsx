"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  Section,
  TrendBadge,
  VixBadge,
  YesNo,
  num,
  pct,
} from "@/components/trades/context-badges";
import { formatNumber } from "@/lib/format";
import type { PreEntryContext } from "@/lib/domain/pre-entry";

export function ContextPanel({ ctx }: { ctx: PreEntryContext }) {
  const { stockContext: sc, marketContext: mc, dataQuality: dq } = ctx;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-foreground">Measured Context</CardTitle>
        <span className="text-xs text-muted-foreground">
          {ctx.refPrice != null && (
            <>
              Ref price {formatNumber(ctx.refPrice)}
              {ctx.refPriceSource === "lastClose"
                ? ` (last close ${ctx.lastCloseDate ?? ""})`
                : ""}
            </>
          )}
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section title={`${ctx.symbol} as of ${ctx.asOf.slice(0, 10)}`}>
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
          <Item label="As-of Day Volume">{num(sc.entryDayVolume, 0)}</Item>
          <Item label="Relative Volume">
            {sc.relativeVolume != null ? `${formatNumber(sc.relativeVolume)}×` : "—"}
          </Item>
          <Item label="ATR14 (ATR%)">
            {num(sc.atr14)} ({pct(sc.atrPct, 1)})
          </Item>
        </Section>

        <Section title="Market">
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
          <Item label="VIX">
            {mc.vix?.level != null ? formatNumber(mc.vix.level) : "—"}
          </Item>
          <Item label="VIX Regime">
            <VixBadge regime={mc.vix?.regime ?? "UNKNOWN"} />
          </Item>
          <Item label="VIX 5d Change">{pct(mc.vix?.return5dPct ?? null, 1)}</Item>
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
      </CardContent>
    </Card>
  );
}
