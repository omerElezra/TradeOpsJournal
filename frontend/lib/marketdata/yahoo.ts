import "server-only";
import type { Candle, CandleInterval } from "@/types";
import { MarketDataError } from "./errors";

/**
 * OHLCV candles from the (unofficial) Yahoo Finance v8 chart API.
 * No API key needed; requires a browser User-Agent or Yahoo rejects the request.
 */

const YAHOO_INTERVAL: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "60m",
  "1d": "1d",
};

/** Yahoo caps intraday history depth (seconds back from now). */
const MAX_AGE_SECONDS: Record<CandleInterval, number> = {
  "1m": 29 * 86400,
  "5m": 59 * 86400,
  "15m": 59 * 86400,
  "1h": 729 * 86400,
  "1d": Number.MAX_SAFE_INTEGER,
};

/** Yahoo also caps the span of a single 1m request. */
const MAX_SPAN_1M = 7 * 86400;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** IBKR class-share symbols use a space ("BRK B"); Yahoo uses a dash ("BRK-B"). */
export function toYahooSymbol(symbol: string): string {
  return symbol.trim().replace(/\s+/g, "-");
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp?: number[];
      indicators: {
        quote: Array<{
          open: Array<number | null>;
          high: Array<number | null>;
          low: Array<number | null>;
          close: Array<number | null>;
          volume: Array<number | null>;
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

export async function fetchCandlesYahoo(
  symbol: string,
  interval: CandleInterval,
  from: number,
  to: number,
): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  let period1 = Math.max(from, now - MAX_AGE_SECONDS[interval]);
  const period2 = Math.min(to, now);
  if (interval === "1m" && period2 - period1 > MAX_SPAN_1M) {
    period1 = period2 - MAX_SPAN_1M;
  }
  if (period1 >= period2) {
    throw new MarketDataError(
      `No ${interval} data available this far back for ${symbol}`,
      422,
    );
  }

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol))}` +
    `?period1=${period1}&period2=${period2}` +
    `&interval=${YAHOO_INTERVAL[interval]}&includePrePost=true&events=`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 429) {
    throw new MarketDataError(
      "Yahoo Finance is rate-limiting this network — set POLYGON_API_KEY to use Polygon instead",
      429,
    );
  }
  if (!res.ok) {
    throw new MarketDataError(`Yahoo Finance returned ${res.status} for ${symbol}`);
  }

  const body = (await res.json()) as YahooChartResponse;
  if (body.chart.error) {
    throw new MarketDataError(
      `Yahoo Finance: ${body.chart.error.description || body.chart.error.code}`,
    );
  }
  const result = body.chart.result?.[0];
  const quote = result?.indicators.quote?.[0];
  if (!result?.timestamp || !quote) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({
      time: result.timestamp[i],
      open,
      high,
      low,
      close,
      volume: quote.volume[i] ?? null,
    });
  }
  return candles;
}
