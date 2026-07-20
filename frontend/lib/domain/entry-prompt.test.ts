import { describe, expect, it } from "vitest";
import { buildEntryPrompt, plannedRr } from "./entry-prompt";
import { emptyChecklist } from "./scoring";
import type { ForwardOutcome, PreEntryContext } from "./pre-entry";

function ctx(overrides?: Partial<PreEntryContext>): PreEntryContext {
  return {
    symbol: "AAPL",
    direction: "LONG",
    asOf: "2026-05-05T14:30:00.000Z",
    mode: "live",
    refPrice: 100,
    refPriceSource: "user",
    lastClose: 99,
    lastCloseDate: "2026-05-04",
    stockContext: {
      aboveMa20: true,
      aboveMa50: true,
      aboveMa150: true,
      maAlignment: "BULLISH",
      distanceFromMa20Pct: 3.6,
      distanceFromMa50Pct: 5.9,
      distanceFromMa150Pct: 4.6,
      return5dPct: 3.4,
      return20dPct: 6.9,
      return60dPct: 0.3,
      avgVolume20d: 46_672_181,
      entryDayVolume: 49_311_712,
      relativeVolume: 1.06,
      atr14: 6.84,
      atrPct: 2.5,
    },
    marketContext: {
      spy: { symbol: "SPY", aboveMa20: true, aboveMa50: true, aboveMa200: true, return5dPct: 1, return20dPct: 2, bias: "BULLISH" },
      qqq: { symbol: "QQQ", aboveMa20: true, aboveMa50: true, aboveMa200: true, return5dPct: 1, return20dPct: 2, bias: "BULLISH" },
      vix: { level: 18.29, return5dPct: 1.5, regime: "NORMAL" },
      marketBias: "BULLISH",
      marketSupportiveForTrade: true,
    },
    dataQuality: { missingInputs: [], missingMarketData: [], assumptions: [], warnings: [] },
    ...overrides,
  };
}

const forward: ForwardOutcome = {
  refPrice: 100,
  barsAvailable: 20,
  horizons: [
    { days: 5, closePct: 6.5, maxHighPct: 6.7, minLowPct: 1.5 },
    { days: 10, closePct: 8, maxHighPct: 9.5, minLowPct: 1.5 },
    { days: 20, closePct: 12.1, maxHighPct: 14.5, minLowPct: 1.5 },
  ],
  stopTarget: { stop: 95, target: 110, firstHit: "TARGET", hitAfterDays: 7 },
};

describe("plannedRr", () => {
  it("computes long and short R:R", () => {
    expect(plannedRr(100, "LONG", 95, 110)).toBe(2);
    expect(plannedRr(100, "SHORT", 105, 90)).toBe(2);
  });

  it("returns null when levels are missing or on the wrong side", () => {
    expect(plannedRr(100, "LONG", null, 110)).toBeNull();
    expect(plannedRr(null, "LONG", 95, 110)).toBeNull();
    expect(plannedRr(100, "LONG", 105, 110)).toBeNull(); // stop above entry
    expect(plannedRr(100, "LONG", 95, 98)).toBeNull(); // target below entry
  });
});

describe("buildEntryPrompt", () => {
  it("includes the trade, measured context, checklist, score and Hebrew instruction", () => {
    const p = buildEntryPrompt({
      context: ctx(),
      checklist: {
        ...emptyChecklist(),
        setup: "VCP",
        entryConfirmation: "Breakout confirmed",
        plannedStop: 95,
        plannedTarget: 110,
        conviction: 7,
      },
      score: {
        score: 4,
        fired: [{ ruleId: 1, label: "Market bias supportive", points: 2, note: "SPY+QQQ aligned" }],
        skipped: [{ label: "Low conviction", reason: "missing data" }],
      },
      forwardOutcome: null,
      notes: "בדיקה לפני כניסה",
    });
    expect(p).toContain("Symbol: AAPL (LONG)");
    expect(p).toContain("live pre-entry check");
    expect(p).toContain("Planned R:R ≈ 2:1");
    expect(p).toContain("MA alignment: BULLISH");
    expect(p).toContain("VIX: 18.29 (regime NORMAL");
    expect(p).toContain("Entry confirmation: Breakout confirmed");
    expect(p).toContain("Market bias supportive (+2)");
    expect(p).toContain("Not evaluated (missing data): Low conviction");
    expect(p).toContain("בדיקה לפני כניסה");
    expect(p).toContain("השב בעברית");
    // Live check → no hindsight section, and task 5 asks what's missing.
    expect(p).not.toContain("What actually happened afterwards");
    expect(p).toContain("missing from this data");
  });

  it("adds the forward outcome and comparison task for retrospective checks", () => {
    const p = buildEntryPrompt({
      context: ctx({ mode: "retrospective" }),
      checklist: emptyChecklist(),
      score: null,
      forwardOutcome: forward,
      notes: "",
    });
    expect(p).toContain("RETROSPECTIVE practice");
    expect(p).toContain("What actually happened afterwards");
    expect(p).toContain("5d: close +6.5%");
    expect(p).toContain("target (110.00) was hit first after 7 trading day(s)");
    expect(p).toContain("compare your judgement");
    expect(p).toContain("(no manual read filled in)");
  });
});
