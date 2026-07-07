import "server-only";
import type { Candle, CandleInterval } from "@/types";
import { fetchCandlesYahoo } from "./yahoo";
import { fetchCandlesPolygon } from "./polygon";

export { MarketDataError } from "./errors";

/**
 * Provider selection:
 *  - MARKET_DATA_PROVIDER=yahoo|polygon forces one
 *  - otherwise Polygon when POLYGON_API_KEY is set, else Yahoo (keyless)
 */
export async function getCandles(
  symbol: string,
  interval: CandleInterval,
  from: number,
  to: number,
): Promise<Candle[]> {
  const key = process.env.POLYGON_API_KEY;
  const provider =
    process.env.MARKET_DATA_PROVIDER ?? (key ? "polygon" : "yahoo");

  if (provider === "polygon") {
    if (!key) throw new Error("MARKET_DATA_PROVIDER=polygon requires POLYGON_API_KEY");
    return fetchCandlesPolygon(symbol, interval, from, to, key);
  }
  return fetchCandlesYahoo(symbol, interval, from, to);
}
