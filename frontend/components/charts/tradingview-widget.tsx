"use client";

import { memo, useEffect, useRef } from "react";
import type { CandleInterval } from "@/types";

/**
 * Official TradingView Advanced Chart embed. Data flows browser → TradingView,
 * so it works even where server-side market data APIs are blocked.
 */

const TV_INTERVAL: Record<CandleInterval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "1d": "D",
};

/** IBKR class-share symbols use a space ("BRK B"); TradingView uses a dot. */
function toTvSymbol(symbol: string): string {
  return symbol.trim().replace(/\s+/g, ".");
}

function TradingViewWidgetInner({
  symbol,
  interval,
}: {
  symbol: string;
  interval: CandleInterval;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The embed's autosize mode doesn't reliably inherit percentage heights,
    // so give the iframe an explicit pixel height (~70% of the viewport).
    const height = Math.max(480, Math.round(window.innerHeight * 0.7));
    container.style.height = `${height}px`;

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: toTvSymbol(symbol),
      interval: TV_INTERVAL[interval],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      theme: "dark",
      style: "1", // candlesticks
      locale: "en",
      allow_symbol_change: false,
      withdateranges: true,
      hide_side_toolbar: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
      width: "100%",
      height,
    });

    container.replaceChildren(widget, script);
    return () => container.replaceChildren();
  }, [symbol, interval]);

  return <div ref={containerRef} className="tradingview-widget-container w-full" />;
}

export const TradingViewWidget = memo(TradingViewWidgetInner);
