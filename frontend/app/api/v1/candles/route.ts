import { NextRequest, NextResponse } from "next/server";
import { getCandles, MarketDataError } from "@/lib/marketdata";
import type { CandleInterval } from "@/types";

const INTERVALS: ReadonlySet<string> = new Set(["1m", "5m", "15m", "1h", "1d"]);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbol = sp.get("symbol")?.trim() ?? "";
  const interval = sp.get("interval") ?? "";
  const from = Number(sp.get("from"));
  const to = Number(sp.get("to"));

  if (!symbol || !INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid symbol or interval" }, { status: 400 });
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return NextResponse.json({ error: "Invalid from/to range" }, { status: 400 });
  }

  try {
    const candles = await getCandles(symbol, interval as CandleInterval, from, to);
    return NextResponse.json({ symbol, interval, candles });
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 502 },
    );
  }
}
