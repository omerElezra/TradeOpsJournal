import "server-only";
import type { Candle } from "@/types";
import { MarketDataError } from "./errors";

/**
 * Daily VIX OHLC straight from Cboe's public history CSV (keyless, CDN-hosted).
 * Yahoo blocks datacenter IPs and Polygon gates indices behind a paid plan, so
 * this is the reliable free source for the volatility index. No volume data.
 */

const VIX_HISTORY_URL =
  "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchVixDailyCboe(from: number, to: number): Promise<Candle[]> {
  const res = await fetch(VIX_HISTORY_URL, {
    headers: { "User-Agent": UA, Accept: "text/csv" },
    // The file updates once per day — cache it for an hour.
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new MarketDataError(`Cboe VIX history returned ${res.status}`);
  }

  const text = await res.text();
  const candles: Candle[] = [];
  // Header: DATE,OPEN,HIGH,LOW,CLOSE — dates are MM/DD/YYYY.
  for (const line of text.split("\n").slice(1)) {
    const [date, open, high, low, close] = line.trim().split(",");
    if (!date || !close) continue;
    const [mm, dd, yyyy] = date.split("/");
    const time = Math.floor(Date.parse(`${yyyy}-${mm}-${dd}T00:00:00Z`) / 1000);
    if (!Number.isFinite(time) || time < from || time > to) continue;
    candles.push({
      time,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: null,
    });
  }
  return candles;
}
