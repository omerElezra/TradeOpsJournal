import { describe, expect, it } from "vitest";
import type { Candle } from "@/types";
import type { DailyBarProvider } from "./enrichment";
import {
  computeForwardOutcome,
  computePreEntryContext,
  filterForwardBars,
} from "./pre-entry";

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

function fakeProvider(bySymbol: Record<string, Candle[]>): DailyBarProvider {
  return {
    async getDailyBars(symbol, from, to) {
      const bars = bySymbol[symbol];
      if (!bars) throw new Error(`no data for ${symbol}`);
      return bars.filter((b) => b.time >= from && b.time <= to);
    },
  };
}

const ASOF = "2026-01-05T15:00:00Z"; // a Monday
const marketBars = {
  SPY: trendBars("2026-01-04", 260, 400, 0.5),
  QQQ: trendBars("2026-01-04", 260, 300, 0.5),
  "^VIX": trendBars("2026-01-04", 260, 14, 0),
};

// ─── computePreEntryContext ──────────────────────────────────────────────────

describe("computePreEntryContext", () => {
  it("validates inputs", async () => {
    const p = fakeProvider({});
    await expect(
      computePreEntryContext({ symbol: "", direction: "LONG", asOf: ASOF }, p),
    ).rejects.toThrow("symbol");
    await expect(
      computePreEntryContext(
        { symbol: "T", direction: "LONG", asOf: "nonsense" },
        p,
      ),
    ).rejects.toThrow("asOf");
    await expect(
      computePreEntryContext(
        {
          symbol: "T",
          direction: "LONG",
          asOf: new Date(Date.now() + 3 * 86400_000).toISOString(),
        },
        p,
      ),
    ).rejects.toThrow("future");
    await expect(
      computePreEntryContext(
        { symbol: "T", direction: "LONG", asOf: ASOF, refPrice: -1 },
        p,
      ),
    ).rejects.toThrow("refPrice");
  });

  it("falls back to the last close as reference price and records the assumption", async () => {
    const provider = fakeProvider({
      TEST: trendBars("2026-01-04", 200, 50, 0.5),
      ...marketBars,
    });
    const ctx = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: ASOF },
      provider,
    );
    expect(ctx.refPriceSource).toBe("lastClose");
    expect(ctx.refPrice).toBe(ctx.lastClose);
    expect(ctx.lastCloseDate).toBe("2026-01-04");
    expect(ctx.dataQuality.assumptions.join(" ")).toContain("last close");
    // Uptrend history → bullish stock context computed from bars strictly before as-of.
    expect(ctx.stockContext.maAlignment).toBe("BULLISH");
    expect(ctx.stockContext.aboveMa20).toBe(true);
  });

  it("uses the user refPrice when given", async () => {
    const provider = fakeProvider({
      TEST: trendBars("2026-01-04", 200, 50, 0.5),
      ...marketBars,
    });
    const ctx = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: ASOF, refPrice: 10 },
      provider,
    );
    expect(ctx.refPriceSource).toBe("user");
    expect(ctx.refPrice).toBe(10);
    // Far below every MA
    expect(ctx.stockContext.aboveMa20).toBe(false);
  });

  it("excludes the as-of day from history and uses its bar only for volume", async () => {
    const history = trendBars("2026-01-04", 200, 50, 0.5);
    const asOfDayBar = bar("2026-01-05", 999, { volume: 5_000_000 });
    const provider = fakeProvider({ TEST: [...history, asOfDayBar], ...marketBars });
    const ctx = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: ASOF },
      provider,
    );
    // last close comes from Jan 4, not the 999 close of the as-of day
    expect(ctx.lastCloseDate).toBe("2026-01-04");
    expect(ctx.lastClose).not.toBe(999);
    expect(ctx.stockContext.entryDayVolume).toBe(5_000_000);
  });

  it("detects live vs retrospective mode", async () => {
    const provider = fakeProvider({
      TEST: trendBars("2026-01-04", 200, 50, 0.5),
      ...marketBars,
    });
    const retro = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: ASOF },
      provider,
    );
    expect(retro.mode).toBe("retrospective");

    const today = new Date().toISOString();
    const liveProvider = fakeProvider({ TEST: [], SPY: [], QQQ: [], "^VIX": [] });
    const live = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: today },
      liveProvider,
    );
    expect(live.mode).toBe("live");
  });

  it("survives provider failures with nulls and missingMarketData", async () => {
    const provider = fakeProvider({}); // everything throws
    const ctx = await computePreEntryContext(
      { symbol: "TEST", direction: "LONG", asOf: ASOF },
      provider,
    );
    expect(ctx.refPrice).toBeNull();
    expect(ctx.stockContext.maAlignment).toBe("UNKNOWN");
    expect(ctx.marketContext.marketBias).toBe("UNKNOWN");
    expect(ctx.marketContext.vix.regime).toBe("UNKNOWN");
    expect(ctx.dataQuality.missingMarketData.length).toBeGreaterThanOrEqual(4);
  });

  it("computes market context and supportiveness for the direction", async () => {
    const provider = fakeProvider({
      TEST: trendBars("2026-01-04", 260, 50, 0.5),
      ...marketBars,
    });
    const ctx = await computePreEntryContext(
      { symbol: "TEST", direction: "SHORT", asOf: ASOF },
      provider,
    );
    expect(ctx.marketContext.marketBias).toBe("BULLISH");
    expect(ctx.marketContext.marketSupportiveForTrade).toBe(false);
  });
});

// ─── computeForwardOutcome ───────────────────────────────────────────────────

describe("computeForwardOutcome", () => {
  const forward = (n: number, start = 100, step = 1) =>
    trendBars("2026-02-13", n, start, step); // dates irrelevant to the math

  it("computes horizons and nulls short windows", () => {
    const out = computeForwardOutcome(forward(12), 100, "LONG");
    expect(out.barsAvailable).toBe(12);
    const [h5, h10, h20] = out.horizons;
    expect(h5.days).toBe(5);
    expect(h5.closePct).toBe(4); // 5th bar close = 104
    expect(h10.closePct).toBe(9);
    expect(h20.closePct).toBeNull(); // only 12 bars
    expect(h20.maxHighPct).toBe(12); // max high = 111+1 = 112 → +12%
    expect(h20.minLowPct).toBe(-1); // first bar low = 99
  });

  it("returns null horizons when no forward bars exist", () => {
    const out = computeForwardOutcome([], 100, "LONG", 95, 110);
    expect(out.barsAvailable).toBe(0);
    expect(out.horizons.every((h) => h.closePct == null)).toBe(true);
    expect(out.stopTarget?.firstHit).toBe("NONE");
  });

  it("detects stop-first for a long", () => {
    const bars = [bar("2026-02-02", 98), bar("2026-02-03", 92, { low: 91 })];
    const out = computeForwardOutcome(bars, 100, "LONG", 95, 120);
    expect(out.stopTarget?.firstHit).toBe("STOP");
    expect(out.stopTarget?.hitAfterDays).toBe(2);
  });

  it("detects target-first for a long", () => {
    const bars = [bar("2026-02-02", 104, { high: 111 })];
    const out = computeForwardOutcome(bars, 100, "LONG", 95, 110);
    expect(out.stopTarget?.firstHit).toBe("TARGET");
    expect(out.stopTarget?.hitAfterDays).toBe(1);
  });

  it("flags both-in-one-bar as AMBIGUOUS", () => {
    const bars = [bar("2026-02-02", 100, { high: 112, low: 93 })];
    const out = computeForwardOutcome(bars, 100, "LONG", 95, 110);
    expect(out.stopTarget?.firstHit).toBe("AMBIGUOUS");
  });

  it("mirrors stop/target for shorts", () => {
    // Short from 100: stop above (105), target below (90).
    const stopHit = computeForwardOutcome(
      [bar("2026-02-02", 104, { high: 106 })],
      100,
      "SHORT",
      105,
      90,
    );
    expect(stopHit.stopTarget?.firstHit).toBe("STOP");
    const targetHit = computeForwardOutcome(
      [bar("2026-02-02", 92, { low: 89 })],
      100,
      "SHORT",
      105,
      90,
    );
    expect(targetHit.stopTarget?.firstHit).toBe("TARGET");
  });

  it("returns NONE when neither level is reached and null stopTarget without levels", () => {
    const bars = [bar("2026-02-02", 101)];
    expect(computeForwardOutcome(bars, 100, "LONG", 90, 120).stopTarget?.firstHit).toBe(
      "NONE",
    );
    expect(computeForwardOutcome(bars, 100, "LONG").stopTarget).toBeNull();
  });
});

describe("filterForwardBars", () => {
  it("keeps only bars strictly after the as-of day", () => {
    const bars = [bar("2026-01-04", 1), bar("2026-01-05", 2), bar("2026-01-06", 3)];
    const out = filterForwardBars(bars, ASOF);
    expect(out.map((b) => b.close)).toEqual([3]);
  });
});
