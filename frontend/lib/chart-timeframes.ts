import type { CandleInterval } from "@/types";

/** Client-safe helpers for picking a chart timeframe/window from trade data. */

export const INTERVALS: CandleInterval[] = ["1m", "5m", "15m", "1h", "1d"];

export const INTERVAL_LABEL: Record<CandleInterval, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1H",
  "1d": "1D",
};

export const BAR_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "1d": 86400,
};

/**
 * How far back Yahoo serves each interval (days). Slightly under Yahoo's real
 * limits (30/60/730) to leave headroom for the pre-entry padding.
 */
export const INTERVAL_MAX_AGE_DAYS: Record<CandleInterval, number> = {
  "1m": 25,
  "5m": 55,
  "15m": 55,
  "1h": 720,
  "1d": Number.POSITIVE_INFINITY,
};

const DAY = 86400;

export function tradeAgeDays(entryTime: string): number {
  return (Date.now() / 1000 - Date.parse(entryTime) / 1000) / DAY;
}

export function intervalAvailable(interval: CandleInterval, entryTime: string): boolean {
  return tradeAgeDays(entryTime) <= INTERVAL_MAX_AGE_DAYS[interval];
}

/** Pick a sensible default interval from holding time, clamped by data availability. */
export function autoInterval(
  holdingMinutes: number | null,
  entryTime: string,
): CandleInterval {
  const hold = holdingMinutes ?? 0;
  let candidate: CandleInterval;
  if (hold <= 60) candidate = "1m";
  else if (hold <= 390) candidate = "5m"; // one US session
  else if (hold <= 3 * 24 * 60) candidate = "15m";
  else if (hold <= 30 * 24 * 60) candidate = "1h";
  else candidate = "1d";

  while (!intervalAvailable(candidate, entryTime)) {
    const next = INTERVALS[INTERVALS.indexOf(candidate) + 1];
    if (!next) return "1d";
    candidate = next;
  }
  return candidate;
}

/** Time window around the trade: ~50 bars of context on each side. */
export function chartWindow(
  entryTime: string,
  exitTime: string | null,
  interval: CandleInterval,
): { from: number; to: number } {
  const entry = Math.floor(Date.parse(entryTime) / 1000);
  const now = Math.floor(Date.now() / 1000);
  const exit = exitTime ? Math.floor(Date.parse(exitTime) / 1000) : now;
  const pad = BAR_SECONDS[interval] * 50;
  return {
    from: entry - pad,
    to: Math.min(now, exit + pad),
  };
}

const TV_INTERVAL: Record<CandleInterval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1h": "60",
  "1d": "D",
};

/** Deep link to the full TradingView chart (class shares: "BRK B" → "BRK.B"). */
export function tradingViewUrl(symbol: string, interval: CandleInterval): string {
  const tvSymbol = symbol.trim().replace(/\s+/g, ".");
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}&interval=${TV_INTERVAL[interval]}`;
}
