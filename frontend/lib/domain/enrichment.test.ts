import { describe, expect, it } from "vitest";
import type { Candle } from "@/types";
import {
  combineMarketBias,
  computeBasicResult,
  computeIndexContext,
  computeMaAlignment,
  computeRiskReward,
  computeStockContext,
  computeTradeJourney,
  enrichTradeContext,
  marketSupportiveForTrade,
  type DailyBarProvider,
  type EnrichmentTradeInput,
} from "./enrichment";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function bar(date: string, close: number, opts?: Partial<Candle>): Candle {
  return {
    time: Math.floor(Date.parse(`${date}T14:30:00Z`) / 1000),
    open: opts?.open ?? close,
    high: opts?.high ?? close + 1,
    low: opts?.low ?? close - 1,
    close,
    volume: opts?.volume ?? 1_000_000,
  };
}

/** `n` consecutive daily bars ending at `endDate` with linearly changing closes. */
function trendBars(endDate: string, n: number, start: number, step: number): Candle[] {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const bars: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const date = new Date(end - (n - 1 - i) * 86400_000).toISOString().slice(0, 10);
    bars.push(bar(date, start + i * step));
  }
  return bars;
}

const baseTrade: EnrichmentTradeInput = {
  symbol: "TEST",
  direction: "LONG",
  entryDatetime: "2026-01-05T15:00:00Z",
  exitDatetime: "2026-01-07T20:00:00Z",
  entryPrice: 100,
  exitPrice: 108,
  quantity: 10,
  fees: 2,
  plannedStopLoss: 95,
  plannedTargetPrice: 115,
};

// ─── Basic result ────────────────────────────────────────────────────────────

describe("computeBasicResult", () => {
  it("computes long P&L", () => {
    const r = computeBasicResult(baseTrade);
    expect(r.grossPnl).toBe(80); // (108-100)*10
    expect(r.netPnl).toBe(78); // minus 2 fees
    expect(r.pnlPercent).toBe(7.8); // 78 / 1000
    expect(r.result).toBe("WIN");
    expect(r.holdingPeriodMinutes).toBe(2 * 24 * 60 + 5 * 60);
  });

  it("computes short P&L", () => {
    const r = computeBasicResult({
      ...baseTrade,
      direction: "SHORT",
      entryPrice: 100,
      exitPrice: 90,
      fees: null,
    });
    expect(r.grossPnl).toBe(100); // (100-90)*10
    expect(r.netPnl).toBe(100); // no fees known → assumed 0
    expect(r.result).toBe("WIN");
  });

  it("flags a losing short and breakeven", () => {
    const loss = computeBasicResult({
      ...baseTrade,
      direction: "SHORT",
      exitPrice: 105,
      fees: 0,
    });
    expect(loss.grossPnl).toBe(-50);
    expect(loss.result).toBe("LOSS");

    const be = computeBasicResult({ ...baseTrade, exitPrice: 100, fees: 0 });
    expect(be.result).toBe("BREAKEVEN");
  });
});

// ─── Risk / reward ───────────────────────────────────────────────────────────

describe("computeRiskReward", () => {
  it("computes planned risk, reward, RR and actual R for a long", () => {
    const rr = computeRiskReward(baseTrade, 78, []);
    expect(rr.plannedRiskPerShare).toBe(5); // 100 - 95
    expect(rr.plannedRewardPerShare).toBe(15); // 115 - 100
    expect(rr.plannedRr).toBe(3);
    expect(rr.actualRMultiple).toBe(1.56); // 78 / (5*10)
  });

  it("computes R metrics for a short", () => {
    const rr = computeRiskReward(
      {
        ...baseTrade,
        direction: "SHORT",
        entryPrice: 100,
        exitPrice: 90,
        plannedStopLoss: 104,
        plannedTargetPrice: 92,
      },
      100,
      [],
    );
    expect(rr.plannedRiskPerShare).toBe(4);
    expect(rr.plannedRewardPerShare).toBe(8);
    expect(rr.plannedRr).toBe(2);
    expect(rr.actualRMultiple).toBe(2.5); // 100 / (4*10)
  });

  it("returns nulls for R-based metrics when the stop is missing", () => {
    const rr = computeRiskReward({ ...baseTrade, plannedStopLoss: null }, 78, []);
    expect(rr.plannedRiskPerShare).toBeNull();
    expect(rr.plannedRr).toBeNull();
    expect(rr.actualRMultiple).toBeNull();
    expect(rr.plannedRewardPerShare).toBe(15); // target alone still computable
  });

  it("rejects a stop on the wrong side with a warning", () => {
    const warnings: string[] = [];
    const rr = computeRiskReward({ ...baseTrade, plannedStopLoss: 105 }, 78, warnings);
    expect(rr.plannedRiskPerShare).toBeNull();
    expect(rr.actualRMultiple).toBeNull();
    expect(warnings.length).toBe(1);
  });
});

// ─── MA alignment ────────────────────────────────────────────────────────────

describe("computeMaAlignment", () => {
  it("classifies bullish, bearish, mixed, unknown", () => {
    expect(computeMaAlignment(110, 105, 100, 95)).toBe("BULLISH");
    expect(computeMaAlignment(90, 95, 100, 105)).toBe("BEARISH");
    expect(computeMaAlignment(110, 100, 105, 95)).toBe("MIXED");
    expect(computeMaAlignment(110, 105, null, 95)).toBe("UNKNOWN");
  });

  it("derives alignment from real bar history", () => {
    const up = computeStockContext(trendBars("2026-01-04", 250, 100, 0.5), null, 230);
    expect(up.maAlignment).toBe("BULLISH");
    expect(up.aboveMa20).toBe(true);
    expect(up.aboveMa200).toBe(true);

    const down = computeStockContext(trendBars("2026-01-04", 250, 250, -0.5), null, 120);
    expect(down.maAlignment).toBe("BEARISH");
  });

  it("is UNKNOWN with insufficient history", () => {
    const ctx = computeStockContext(trendBars("2026-01-04", 30, 100, 0.5), null, 120);
    expect(ctx.maAlignment).toBe("UNKNOWN"); // no MA50/MA200
    expect(ctx.aboveMa20).toBe(true); // MA20 still available
    expect(ctx.return60dPct).toBeNull();
  });
});

// ─── Market bias ─────────────────────────────────────────────────────────────

describe("market bias", () => {
  const bull = computeIndexContext("SPY", trendBars("2026-01-04", 250, 100, 0.5));
  const bear = computeIndexContext("QQQ", trendBars("2026-01-04", 250, 250, -0.5));
  const unknown = computeIndexContext("QQQ", []);

  it("classifies index bias from MAs", () => {
    expect(bull.bias).toBe("BULLISH");
    expect(bear.bias).toBe("BEARISH");
    expect(unknown.bias).toBe("UNKNOWN");
  });

  it("combines SPY+QQQ", () => {
    expect(combineMarketBias("BULLISH", "BULLISH")).toBe("BULLISH");
    expect(combineMarketBias("BEARISH", "BEARISH")).toBe("BEARISH");
    expect(combineMarketBias("BULLISH", "BEARISH")).toBe("MIXED");
    expect(combineMarketBias("BULLISH", "UNKNOWN")).toBe("UNKNOWN");
  });

  it("maps bias to trade support", () => {
    expect(marketSupportiveForTrade("BULLISH", "LONG")).toBe(true);
    expect(marketSupportiveForTrade("BULLISH", "SHORT")).toBe(false);
    expect(marketSupportiveForTrade("BEARISH", "SHORT")).toBe(true);
    expect(marketSupportiveForTrade("MIXED", "LONG")).toBe(false);
    expect(marketSupportiveForTrade("UNKNOWN", "LONG")).toBeNull();
  });
});

// ─── Trade journey ───────────────────────────────────────────────────────────

describe("computeTradeJourney", () => {
  const journey = [
    bar("2026-01-05", 104, { high: 106, low: 98 }),
    bar("2026-01-06", 109, { high: 110, low: 103 }),
    bar("2026-01-07", 108, { high: 109, low: 105 }),
  ];

  it("computes MFE/MAE and exit efficiency for a long", () => {
    const j = computeTradeJourney(journey, baseTrade, 5);
    expect(j.highestPriceDuringTrade).toBe(110);
    expect(j.lowestPriceDuringTrade).toBe(98);
    expect(j.mfe).toBe(10); // 110 - 100
    expect(j.mae).toBe(2); // 100 - 98
    expect(j.mfePct).toBe(10);
    expect(j.maePct).toBe(2);
    expect(j.mfeR).toBe(2); // 10 / 5
    expect(j.maeR).toBe(0.4);
    expect(j.exitEfficiencyPct).toBe(80); // captured 8 of 10
  });

  it("mirrors MFE/MAE for a short", () => {
    const short: EnrichmentTradeInput = {
      ...baseTrade,
      direction: "SHORT",
      entryPrice: 110,
      exitPrice: 101,
    };
    const j = computeTradeJourney(journey, short, null);
    expect(j.mfe).toBe(12); // 110 - 98
    expect(j.mae).toBe(0); // never above 110
    expect(j.mfeR).toBeNull(); // no stop
    expect(j.exitEfficiencyPct).toBe(75); // captured 9 of 12
  });

  it("returns nulls without journey bars", () => {
    const j = computeTradeJourney([], baseTrade, 5);
    expect(j.mfe).toBeNull();
    expect(j.exitEfficiencyPct).toBeNull();
  });
});

// ─── Full orchestration with a fake provider ─────────────────────────────────

describe("enrichTradeContext", () => {
  const stockBars = [
    ...trendBars("2026-01-04", 250, 30, 0.25), // closes end ≈92 → entry 100 above stacked MAs
    bar("2026-01-05", 104, { high: 106, low: 98, volume: 3_000_000 }),
    bar("2026-01-06", 109, { high: 110, low: 103 }),
    bar("2026-01-07", 108, { high: 109, low: 105 }),
  ];
  const fakeProvider: DailyBarProvider = {
    async getDailyBars(symbol) {
      if (symbol === "TEST") return stockBars;
      if (symbol === "SPY") return trendBars("2026-01-04", 250, 400, 1);
      if (symbol === "QQQ") return trendBars("2026-01-04", 250, 300, 1);
      throw new Error(`unexpected symbol ${symbol}`);
    },
  };

  it("produces a full enrichment object", async () => {
    const e = await enrichTradeContext(baseTrade, fakeProvider);
    expect(e.basicResult.netPnl).toBe(78);
    expect(e.riskReward.plannedRr).toBe(3);
    expect(e.stockContext.maAlignment).toBe("BULLISH");
    expect(e.stockContext.atr14).not.toBeNull();
    expect(e.stockContext.relativeVolume).toBe(3); // 3M vs 1M avg
    expect(e.marketContext.marketBias).toBe("BULLISH");
    expect(e.marketContext.marketSupportiveForTrade).toBe(true);
    expect(e.tradeJourney.mfe).toBe(10);
    expect(e.tradeJourney.exitEfficiencyPct).toBe(80);
    expect(e.dataQuality.missingInputs).toEqual([]);
    expect(e.dataQuality.missingMarketData).toEqual([]);
    expect(e.dataQuality.assumptions.length).toBeGreaterThan(0);
  });

  it("degrades to UNKNOWN/null when market data is unavailable", async () => {
    const failing: DailyBarProvider = {
      async getDailyBars() {
        throw new Error("provider down");
      },
    };
    const e = await enrichTradeContext(baseTrade, failing);
    expect(e.basicResult.netPnl).toBe(78); // broker-only math still works
    expect(e.stockContext.maAlignment).toBe("UNKNOWN");
    expect(e.stockContext.atr14).toBeNull();
    expect(e.marketContext.marketBias).toBe("UNKNOWN");
    expect(e.marketContext.marketSupportiveForTrade).toBeNull();
    expect(e.tradeJourney.mfe).toBeNull();
    expect(e.dataQuality.missingMarketData.length).toBe(3);
  });

  it("reports missing optional inputs", async () => {
    const e = await enrichTradeContext(
      { ...baseTrade, fees: null, plannedStopLoss: null, plannedTargetPrice: null },
      fakeProvider,
    );
    expect(e.dataQuality.missingInputs).toEqual([
      "fees",
      "plannedStopLoss",
      "plannedTargetPrice",
    ]);
    expect(e.riskReward.actualRMultiple).toBeNull();
    expect(e.tradeJourney.mfeR).toBeNull();
  });
});
