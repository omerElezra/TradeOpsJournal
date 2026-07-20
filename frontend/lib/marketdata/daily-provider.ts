import "server-only";
import type { Candle } from "@/types";
import type { DailyBarProvider } from "@/lib/domain/enrichment";
import { VIX_SYMBOL } from "@/lib/domain/enrichment";
import { getCandles } from "./index";
import { fetchVixDailyCboe } from "./cboe-vix";

/**
 * Default DailyBarProvider for trade enrichment: daily candles via the existing
 * market-data dispatch (Yahoo keyless by default, Polygon when POLYGON_API_KEY
 * is set). ^VIX comes straight from Cboe's free history CSV — Yahoo blocks
 * datacenter IPs and Polygon gates indices behind a paid plan.
 * Swap this adapter to plug in another provider later.
 */
export const defaultDailyBarProvider: DailyBarProvider = {
  getDailyBars(symbol: string, from: number, to: number): Promise<Candle[]> {
    if (symbol === VIX_SYMBOL) return fetchVixDailyCboe(from, to);
    return getCandles(symbol, "1d", from, to);
  },
};
