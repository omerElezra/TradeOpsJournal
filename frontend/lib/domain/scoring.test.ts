import { describe, expect, it } from "vitest";
import type { PreEntryContext } from "./pre-entry";
import {
  DEFAULT_RULES,
  buildScoringFacts,
  describeConditions,
  emptyChecklist,
  evaluateScore,
  validateRule,
  type EntryChecklist,
  type ScoringFacts,
  type ScoringRule,
} from "./scoring";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function ctx(overrides?: {
  stock?: Partial<PreEntryContext["stockContext"]>;
  market?: Partial<PreEntryContext["marketContext"]>;
  direction?: "LONG" | "SHORT";
}): PreEntryContext {
  return {
    symbol: "TEST",
    direction: overrides?.direction ?? "LONG",
    asOf: "2026-07-01T14:00:00.000Z",
    mode: "live",
    refPrice: 100,
    refPriceSource: "user",
    lastClose: 99,
    lastCloseDate: "2026-06-30",
    stockContext: {
      aboveMa20: true,
      aboveMa50: true,
      aboveMa150: true,
      maAlignment: "BULLISH",
      distanceFromMa20Pct: 3,
      distanceFromMa50Pct: 6,
      distanceFromMa150Pct: 12,
      return5dPct: 2,
      return20dPct: 5,
      return60dPct: 10,
      avgVolume20d: 1_000_000,
      entryDayVolume: 1_500_000,
      relativeVolume: 1.5,
      atr14: 2,
      atrPct: 2,
      ...overrides?.stock,
    },
    marketContext: {
      spy: {
        symbol: "SPY",
        aboveMa20: true,
        aboveMa50: true,
        aboveMa200: true,
        return5dPct: 1,
        return20dPct: 2,
        bias: "BULLISH",
      },
      qqq: {
        symbol: "QQQ",
        aboveMa20: true,
        aboveMa50: true,
        aboveMa200: true,
        return5dPct: 1,
        return20dPct: 2,
        bias: "BULLISH",
      },
      vix: { level: 14, return5dPct: -2, regime: "LOW" },
      marketBias: "BULLISH",
      marketSupportiveForTrade: true,
      ...overrides?.market,
    },
    dataQuality: {
      missingInputs: [],
      missingMarketData: [],
      assumptions: [],
      warnings: [],
    },
  };
}

function rule(overrides: Partial<ScoringRule>): ScoringRule {
  return {
    id: 1,
    label: "test rule",
    conditions: [],
    points: 1,
    note: "",
    enabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

// ─── buildScoringFacts ───────────────────────────────────────────────────────

describe("buildScoringFacts", () => {
  it("flattens context and checklist", () => {
    const checklist: EntryChecklist = { ...emptyChecklist(), conviction: 8, setup: "VCP" };
    const facts = buildScoringFacts(ctx(), checklist);
    expect(facts["stockContext.aboveMa20"]).toBe(true);
    expect(facts["stockContext.distanceFromMa20Pct"]).toBe(3);
    expect(facts["marketContext.vix.regime"]).toBe("LOW");
    expect(facts["checklist.conviction"]).toBe(8);
    expect(facts["checklist.setup"]).toBe("VCP");
  });

  it("derives trendAgainstDirection per direction", () => {
    const bearish = { stock: { maAlignment: "BEARISH" as const } };
    expect(
      buildScoringFacts(ctx(bearish), emptyChecklist())["derived.trendAgainstDirection"],
    ).toBe(true);
    expect(
      buildScoringFacts(ctx({ ...bearish, direction: "SHORT" }), emptyChecklist())[
        "derived.trendAgainstDirection"
      ],
    ).toBe(false);
    expect(
      buildScoringFacts(ctx({ stock: { maAlignment: "UNKNOWN" } }), emptyChecklist())[
        "derived.trendAgainstDirection"
      ],
    ).toBeNull();
  });

  it("derives vixAgainstDirection only for longs in risk-off regimes", () => {
    const elevated = ctx({
      market: { vix: { level: 25, return5dPct: 10, regime: "ELEVATED" } },
    });
    expect(buildScoringFacts(elevated, emptyChecklist())["derived.vixAgainstDirection"]).toBe(
      true,
    );
    const short = ctx({
      direction: "SHORT",
      market: { vix: { level: 25, return5dPct: 10, regime: "ELEVATED" } },
    });
    expect(buildScoringFacts(short, emptyChecklist())["derived.vixAgainstDirection"]).toBe(
      false,
    );
    const unknown = ctx({
      market: { vix: { level: null, return5dPct: null, regime: "UNKNOWN" } },
    });
    expect(
      buildScoringFacts(unknown, emptyChecklist())["derived.vixAgainstDirection"],
    ).toBeNull();
  });
});

// ─── evaluateScore ───────────────────────────────────────────────────────────

describe("evaluateScore", () => {
  const facts: ScoringFacts = {
    num: 5,
    flag: true,
    trend: "BULLISH",
    missing: null,
  };

  it("evaluates every numeric op", () => {
    const cases: Array<[string, number, boolean]> = [
      ["gt", 4, true],
      ["gt", 5, false],
      ["gte", 5, true],
      ["lt", 6, true],
      ["lt", 5, false],
      ["lte", 5, true],
      ["eq", 5, true],
    ];
    for (const [op, value, fires] of cases) {
      const r = evaluateScore(
        [rule({ conditions: [{ field: "num", op: op as never, value }], points: 2 })],
        facts,
      );
      expect(r.score, `${op} ${value}`).toBe(fires ? 2 : 0);
    }
  });

  it("evaluates boolean and enum ops", () => {
    expect(
      evaluateScore([rule({ conditions: [{ field: "flag", op: "isTrue" }] })], facts).score,
    ).toBe(1);
    expect(
      evaluateScore([rule({ conditions: [{ field: "flag", op: "isFalse" }] })], facts).score,
    ).toBe(0);
    expect(
      evaluateScore(
        [rule({ conditions: [{ field: "trend", op: "eq", value: "BULLISH" }] })],
        facts,
      ).score,
    ).toBe(1);
    expect(
      evaluateScore(
        [rule({ conditions: [{ field: "trend", op: "neq", value: "BEARISH" }] })],
        facts,
      ).score,
    ).toBe(1);
    expect(
      evaluateScore(
        [rule({ conditions: [{ field: "trend", op: "in", value: ["BULLISH", "MIXED"] }] })],
        facts,
      ).score,
    ).toBe(1);
    expect(
      evaluateScore(
        [rule({ conditions: [{ field: "trend", op: "in", value: ["BEARISH"] }] })],
        facts,
      ).score,
    ).toBe(0);
  });

  it("requires all AND conditions to hold", () => {
    const both = rule({
      conditions: [
        { field: "flag", op: "isTrue" },
        { field: "num", op: "gt", value: 10 },
      ],
      points: 3,
    });
    expect(evaluateScore([both], facts).score).toBe(0);
    expect(evaluateScore([both], { ...facts, num: 11 }).score).toBe(3);
  });

  it("skips rules over missing data with a reason, never a silent zero", () => {
    const r = evaluateScore(
      [rule({ label: "needs missing", conditions: [{ field: "missing", op: "gt", value: 1 }] })],
      facts,
    );
    expect(r.score).toBe(0);
    expect(r.fired).toHaveLength(0);
    expect(r.skipped).toEqual([
      { label: "needs missing", reason: "missing data: missing" },
    ]);
  });

  it("treats UNKNOWN enum values as missing", () => {
    const r = evaluateScore(
      [rule({ conditions: [{ field: "trend", op: "eq", value: "BULLISH" }] })],
      { trend: "UNKNOWN" },
    );
    expect(r.skipped).toHaveLength(1);
  });

  it("ignores disabled rules and rules without conditions", () => {
    const r = evaluateScore(
      [
        rule({ enabled: false, conditions: [{ field: "flag", op: "isTrue" }], points: 5 }),
        rule({ label: "empty", conditions: [], points: 5 }),
      ],
      facts,
    );
    expect(r.score).toBe(0);
    expect(r.skipped).toEqual([{ label: "empty", reason: "rule has no conditions" }]);
  });

  it("does not throw on malformed rules", () => {
    const r = evaluateScore(
      [rule({ conditions: [{ field: "nope", op: "gt", value: 1 }] })],
      facts,
    );
    expect(r.skipped[0].reason).toContain("unknown field");
  });

  it("sums fired points including negatives", () => {
    const r = evaluateScore(
      [
        rule({ label: "a", conditions: [{ field: "flag", op: "isTrue" }], points: 2 }),
        rule({ label: "b", conditions: [{ field: "num", op: "gt", value: 1 }], points: -3 }),
      ],
      facts,
    );
    expect(r.score).toBe(-1);
    expect(r.fired.map((f) => f.label)).toEqual(["a", "b"]);
  });
});

// ─── DEFAULT_RULES over real facts ───────────────────────────────────────────

describe("DEFAULT_RULES", () => {
  const asRules = DEFAULT_RULES.map((r, i) => ({ ...r, id: i + 1 }));

  it("fires positives for a supportive long setup", () => {
    const facts = buildScoringFacts(ctx(), { ...emptyChecklist(), conviction: 8 });
    const r = evaluateScore(asRules, facts);
    expect(r.fired.map((f) => f.label)).toEqual([
      "Above MA20 with supportive volume",
      "Market bias supportive",
    ]);
    expect(r.score).toBe(4);
  });

  it("penalizes entering without confirmation", () => {
    const noConf = buildScoringFacts(ctx(), {
      ...emptyChecklist(),
      entryConfirmation: "FOMO / chasing",
    });
    const r = evaluateScore(asRules, noConf);
    expect(r.fired.map((f) => f.label)).toContain("Entered without confirmation");

    const confirmed = buildScoringFacts(ctx(), {
      ...emptyChecklist(),
      entryConfirmation: "Breakout confirmed",
    });
    expect(
      evaluateScore(asRules, confirmed).fired.map((f) => f.label),
    ).not.toContain("Entered without confirmation");
  });

  it("penalizes an overextended chase in a risk-off market", () => {
    const facts = buildScoringFacts(
      ctx({
        stock: { distanceFromMa20Pct: 9, relativeVolume: 0.8, maAlignment: "BEARISH" },
        market: {
          vix: { level: 32, return5dPct: 20, regime: "EXTREME" },
          marketBias: "BEARISH",
          marketSupportiveForTrade: false,
        },
      }),
      { ...emptyChecklist(), conviction: 3 },
    );
    const r = evaluateScore(asRules, facts);
    expect(r.fired.map((f) => f.label)).toEqual([
      "Overextended from MA20",
      "VIX elevated against direction",
      "Against prevailing trend",
      "Low conviction",
    ]);
    expect(r.score).toBe(-9);
  });
});

// ─── validateRule ────────────────────────────────────────────────────────────

describe("validateRule", () => {
  const good = {
    label: "ok",
    conditions: [{ field: "stockContext.aboveMa20", op: "isTrue" }],
    points: 2,
    note: "",
    enabled: true,
  };

  it("accepts a valid rule", () => {
    expect(validateRule(good).ok).toBe(true);
  });

  it("rejects bad shapes", () => {
    expect(validateRule(null).ok).toBe(false);
    expect(validateRule({ ...good, label: " " }).ok).toBe(false);
    expect(validateRule({ ...good, points: 0 }).ok).toBe(false);
    expect(validateRule({ ...good, points: 11 }).ok).toBe(false);
    expect(validateRule({ ...good, points: 1.5 }).ok).toBe(false);
    expect(validateRule({ ...good, conditions: [] }).ok).toBe(false);
    expect(
      validateRule({ ...good, conditions: [{ field: "nope", op: "isTrue" }] }).ok,
    ).toBe(false);
    // op incompatible with field type
    expect(
      validateRule({
        ...good,
        conditions: [{ field: "stockContext.aboveMa20", op: "gt", value: 1 }],
      }).ok,
    ).toBe(false);
    // number field needs a numeric value
    expect(
      validateRule({
        ...good,
        conditions: [{ field: "stockContext.relativeVolume", op: "gte", value: "x" }],
      }).ok,
    ).toBe(false);
    // enum "in" needs a string array
    expect(
      validateRule({
        ...good,
        conditions: [{ field: "marketContext.vix.regime", op: "in", value: "LOW" }],
      }).ok,
    ).toBe(false);
  });

  it("accepts every DEFAULT_RULE", () => {
    for (const r of DEFAULT_RULES) expect(validateRule(r).ok, r.label).toBe(true);
  });
});

describe("describeConditions", () => {
  it("renders a human-readable summary", () => {
    expect(
      describeConditions([
        { field: "stockContext.aboveMa20", op: "isTrue" },
        { field: "stockContext.relativeVolume", op: "gte", value: 1.1 },
      ]),
    ).toBe("Above MA20 is true AND Relative volume (×) ≥ 1.1");
  });
});
