"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  CandlestickChart,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingViewWidget } from "@/components/charts/tradingview-widget";
import { useCandles } from "@/hooks/use-candles";
import { C } from "@/lib/chart-theme";
import {
  INTERVALS,
  INTERVAL_LABEL,
  chartWindow,
  intervalAvailable,
  tradingViewUrl,
} from "@/lib/chart-timeframes";
import type { CandleInterval, TradeGroupDetail } from "@/types";

type ChartMode = "journal" | "tradingview";

// Large chart: most of the viewport, never below 480px.
const CHART_STYLE: React.CSSProperties = { height: "70vh", minHeight: 480 };

export function TradePriceChart({ trade }: { trade: TradeGroupDetail }) {
  const [interval, setInterval] = useState<CandleInterval>("1d");
  // User default: TradingView embed. Switching to "My fills" shows markers
  // on real candles when the data API is reachable.
  const [modeChoice, setModeChoice] = useState<ChartMode | null>("tradingview");
  const [collapsed, setCollapsed] = useState(true);

  const range = useMemo(
    () => chartWindow(trade.entryTime, trade.exitTime, interval),
    [trade.entryTime, trade.exitTime, interval],
  );

  // Don't hit the candles API while the TradingView embed (or nothing) is shown.
  const { data, isLoading, error } = useCandles(
    {
      symbol: trade.symbol,
      interval,
      from: range.from,
      to: range.to,
    },
    modeChoice !== "tradingview" && !collapsed,
  );

  const hasCandles = Boolean(data && data.candles.length > 0);
  const mode: ChartMode =
    modeChoice ?? (hasCandles || isLoading ? "journal" : "tradingview");
  const autoFellBack = modeChoice === null && mode === "tradingview";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-foreground">Price & Executions</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border p-0.5">
            {(["journal", "tradingview"] as const).map((m) => (
              <Button
                key={m}
                variant={mode === m ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setModeChoice(m)}
              >
                {m === "journal" ? "My fills" : "TradingView"}
              </Button>
            ))}
          </div>
          <div className="flex items-center rounded-md border border-border p-0.5">
            {INTERVALS.map((iv) => {
              const available =
                mode === "tradingview" || intervalAvailable(iv, trade.entryTime);
              return (
                <Button
                  key={iv}
                  variant={iv === interval ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5"
                  disabled={!available}
                  title={
                    available
                      ? undefined
                      : `No ${INTERVAL_LABEL[iv]} history this far back`
                  }
                  onClick={() => setInterval(iv)}
                >
                  {INTERVAL_LABEL[iv]}
                </Button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" asChild>
            <a
              href={tradingViewUrl(trade.symbol, interval)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in TradingView
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={collapsed ? "Show chart" : "Hide chart"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent>
          {mode === "tradingview" ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {autoFellBack &&
                  `${error instanceof Error ? error.message : "No candle data for this window"} — showing the live TradingView chart. `}
                The embedded TradingView chart can&apos;t draw your fills — switch
                to &quot;My fills&quot; to see buy/sell markers.
              </p>
              <TradingViewWidget symbol={trade.symbol} interval={interval} />
            </div>
          ) : isLoading ? (
            <Skeleton className="w-full" style={CHART_STYLE} />
          ) : !hasCandles ? (
            <div
              className="flex items-center justify-center rounded-md border border-dashed border-border bg-background/40"
              style={CHART_STYLE}
            >
              <div className="flex max-w-md flex-col items-center gap-2 px-4 text-center text-muted-foreground">
                <CandlestickChart className="h-6 w-6" />
                <span className="text-sm">
                  {error
                    ? "Market data isn't reachable from this network right now."
                    : `No price data for ${trade.symbol} in this window`}
                </span>
                <span className="text-xs">
                  Fill markers need candle data — try from home Wi-Fi, or use
                  the TradingView tab for a live chart meanwhile.
                </span>
              </div>
            </div>
          ) : (
            <JournalChart
              trade={trade}
              interval={interval}
              candles={data!.candles}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function JournalChart({
  trade,
  interval,
  candles,
}: {
  trade: TradeGroupDetail;
  interval: CandleInterval;
  candles: NonNullable<ReturnType<typeof useCandles>["data"]>["candles"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || candles.length === 0) return;

    // lightweight-charts renders unix timestamps as UTC; shift intraday bars
    // so the axis shows browser-local time (matches the executions table).
    const shift = (t: number) =>
      interval === "1d" ? t : t - new Date(t * 1000).getTimezoneOffset() * 60;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: C.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      rightPriceScale: { borderColor: C.tooltip.border },
      timeScale: {
        borderColor: C.tooltip.border,
        timeVisible: interval !== "1d",
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: C.positive,
      downColor: C.negative,
      wickUpColor: C.positive,
      wickDownColor: C.negative,
      borderVisible: false,
    });

    const bars = candles.map((c) => ({
      time: shift(c.time) as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(bars);

    // Snap each execution to the bar it falls in (last bar time <= exec time).
    const times = bars.map((b) => b.time as number);
    const snap = (t: number): number => {
      let lo = 0;
      let hi = times.length - 1;
      let ans = times[0];
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] <= t) {
          ans = times[mid];
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return ans;
    };

    const markers: SeriesMarker<Time>[] = [...trade.markers]
      .sort((a, b) => a.time - b.time)
      .map((m) => ({
        time: snap(shift(m.time)) as UTCTimestamp,
        position: m.side === "BUY" ? "belowBar" : "aboveBar",
        color: m.side === "BUY" ? C.positive : C.negative,
        shape: m.side === "BUY" ? "arrowUp" : "arrowDown",
        text: `${m.side === "BUY" ? "B" : "S"} ${m.qty}`,
      }));
    createSeriesMarkers(series, markers);

    const priceLine = (
      price: number,
      title: string,
      color: string,
      lineStyle: LineStyle,
    ) =>
      series.createPriceLine({
        price,
        title,
        color,
        lineWidth: 1,
        lineStyle,
        axisLabelVisible: true,
      });

    priceLine(trade.avgEntry, "Entry", C.neutral, LineStyle.Solid);
    if (trade.avgExit != null) {
      priceLine(trade.avgExit, "Exit", C.text, LineStyle.Solid);
    }
    if (trade.journal?.plannedStop != null) {
      priceLine(trade.journal.plannedStop, "Stop", C.negative, LineStyle.Dashed);
    }
    if (trade.journal?.plannedTarget != null) {
      priceLine(trade.journal.plannedTarget, "Target", C.positive, LineStyle.Dashed);
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, interval, trade]);

  return <div ref={containerRef} className="w-full" style={CHART_STYLE} />;
}
