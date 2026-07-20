import "server-only";
import type { Candle, CandleInterval } from "@/types";
import { MarketDataError } from "./errors";

/** OHLCV candles from Polygon.io aggregates. Free tier: 5 req/min, 2y history. */

const POLYGON_RANGE: Record<CandleInterval, { mult: number; unit: string }> = {
  "1m": { mult: 1, unit: "minute" },
  "5m": { mult: 5, unit: "minute" },
  "15m": { mult: 15, unit: "minute" },
  "1h": { mult: 1, unit: "hour" },
  "1d": { mult: 1, unit: "day" },
};

/**
 * IBKR class-share symbols use a space ("BRK B"); Polygon uses a dot ("BRK.B").
 * Yahoo-style index symbols ("^VIX") map to Polygon's indices namespace ("I:VIX"),
 * which requires the (free) Indices plan on the API key.
 */
function toPolygonTicker(symbol: string): string {
  const s = symbol.trim();
  if (s.startsWith("^")) return `I:${s.slice(1)}`;
  return s.replace(/\s+/g, ".");
}

interface PolygonAggsResponse {
  status?: string;
  error?: string;
  message?: string;
  results?: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
}

export async function fetchCandlesPolygon(
  symbol: string,
  interval: CandleInterval,
  from: number,
  to: number,
  apiKey: string,
): Promise<Candle[]> {
  const { mult, unit } = POLYGON_RANGE[interval];
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(toPolygonTicker(symbol))}` +
    `/range/${mult}/${unit}/${from * 1000}/${to * 1000}` +
    `?adjusted=true&sort=asc&limit=50000&apiKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) {
    throw new MarketDataError(
      "Polygon rate limit reached (5 requests/min on the free tier) — wait a minute and retry",
      429,
    );
  }
  const body = (await res.json().catch(() => ({}))) as PolygonAggsResponse;
  if (!res.ok) {
    throw new MarketDataError(
      `Polygon returned ${res.status}: ${body.error ?? body.message ?? "unknown error"}`,
    );
  }
  return (body.results ?? []).map((r) => ({
    time: Math.floor(r.t / 1000),
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v ?? null,
  }));
}
