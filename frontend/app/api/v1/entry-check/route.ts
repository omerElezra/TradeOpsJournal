import { NextRequest, NextResponse } from "next/server";
import {
  computeForwardOutcome,
  computePreEntryContext,
  filterForwardBars,
  type EntryCheckResponse,
  type ForwardOutcome,
  type PreEntryInput,
} from "@/lib/domain/pre-entry";
import { defaultDailyBarProvider } from "@/lib/marketdata/daily-provider";
import { MarketDataError } from "@/lib/marketdata";
import type { Side } from "@/types";

/**
 * Compute-only pre-entry check: stock + market context as-of a timestamp
 * (now when omitted), plus the retrospective forward outcome for past
 * timestamps. Persists nothing — saving a plan is POST /api/v1/trade-plans.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  const direction: Side = body.direction === "SHORT" ? "SHORT" : "LONG";
  const asOf =
    typeof body.asOf === "string" && body.asOf ? body.asOf : new Date().toISOString();
  const refPrice = typeof body.refPrice === "number" ? body.refPrice : null;
  const plannedStop = typeof body.plannedStop === "number" ? body.plannedStop : null;
  const plannedTarget = typeof body.plannedTarget === "number" ? body.plannedTarget : null;

  const input: PreEntryInput = { symbol, direction, asOf, refPrice };

  try {
    const context = await computePreEntryContext(input, defaultDailyBarProvider);

    let forwardOutcome: ForwardOutcome | null = null;
    if (context.mode === "retrospective" && context.refPrice != null) {
      const asOfTs = Math.floor(new Date(context.asOf).getTime() / 1000);
      try {
        const bars = await defaultDailyBarProvider.getDailyBars(
          symbol,
          asOfTs,
          asOfTs + 45 * 86400,
        );
        forwardOutcome = computeForwardOutcome(
          filterForwardBars(bars, context.asOf),
          context.refPrice,
          direction,
          plannedStop,
          plannedTarget,
        );
      } catch (err) {
        context.dataQuality.missingMarketData.push(
          `${symbol} forward bars: ${err instanceof Error ? err.message : "unavailable"}`,
        );
      }
    }

    return NextResponse.json({ context, forwardOutcome } satisfies EntryCheckResponse);
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof Error && err.message.startsWith("computePreEntryContext:")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
