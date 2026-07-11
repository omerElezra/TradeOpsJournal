import "server-only";
import type { Candle } from "@/types";
import type { DailyBarProvider } from "@/lib/domain/enrichment";
import { getCandles } from "./index";

/**
 * Default DailyBarProvider for trade enrichment: daily candles via the existing
 * market-data dispatch (Yahoo keyless by default, Polygon when POLYGON_API_KEY
 * is set). Swap this adapter to plug in another provider later.
 */
export const defaultDailyBarProvider: DailyBarProvider = {
  getDailyBars(symbol: string, from: number, to: number): Promise<Candle[]> {
    return getCandles(symbol, "1d", from, to);
  },
};
