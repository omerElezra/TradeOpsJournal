// Automatic Trade Context Enrichment — pure calculation logic.
//
// No "server-only" import here: this module is pure math over inputs passed in
// (trade fields + daily bars from an injected provider), so it stays unit-testable
// and free of environment access. Server concerns (default market-data provider,
// persistence) live in lib/marketdata/daily-provider.ts and lib/queries/enrichment.ts.
//
// Rules honored throughout: no recommendations, no predictions, no invented data —
// anything not derivable from the inputs is null / "UNKNOWN" and reported in
// dataQuality.

import type { Candle, Side, TradeResult } from "@/types";

const EPS = 1e-9;

// ─── Input / output types ─────────────────────────────────────────────────────

/** Raw broker fields of one completed round-trip trade (kept separate from output). */
export interface EnrichmentTradeInput {
  symbol: string;
  direction: Side;
  entryDatetime: string; // ISO
  exitDatetime: string;  // ISO
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  fees?: number | null;
  plannedStopLoss?: number | null;
  plannedTargetPrice?: number | null;
}

/** Pluggable source of daily OHLCV bars (unix-seconds timestamps, UTC). */
export interface DailyBarProvider {
  getDailyBars(symbol: string, from: number, to: number): Promise<Candle[]>;
}

export type Trend = "BULLISH" | "BEARISH" | "MIXED" | "UNKNOWN";

export interface BasicResult {
  grossPnl: number;
  netPnl: number;
  pnlPercent: number;
  holdingPeriodMinutes: number;
  result: TradeResult;
}

export interface RiskReward {
  plannedRiskPerShare: number | null;
  plannedRewardPerShare: number | null;
  plannedRr: number | null;
  actualRMultiple: number | null;
}

export interface StockContext {
  aboveMa20: boolean | null;
  aboveMa50: boolean | null;
  aboveMa150: boolean | null;
  maAlignment: Trend;
  distanceFromMa20Pct: number | null;
  distanceFromMa50Pct: number | null;
  distanceFromMa150Pct: number | null;
  return5dPct: number | null;
  return20dPct: number | null;
  return60dPct: number | null;
  avgVolume20d: number | null;
  entryDayVolume: number | null;
  relativeVolume: number | null;
  atr14: number | null;
  atrPct: number | null;
}

export interface IndexContext {
  symbol: string;
  aboveMa20: boolean | null;
  aboveMa50: boolean | null;
  aboveMa200: boolean | null;
  return5dPct: number | null;
  return20dPct: number | null;
  bias: Trend;
}

export type VixRegime = "LOW" | "NORMAL" | "ELEVATED" | "EXTREME" | "UNKNOWN";

export interface VixContext {
  /** Last VIX close before the entry day. */
  level: number | null;
  return5dPct: number | null;
  regime: VixRegime;
}

export interface MarketContext {
  spy: IndexContext;
  qqq: IndexContext;
  vix: VixContext;
  marketBias: Trend;
  marketSupportiveForTrade: boolean | null;
}

export interface TradeJourney {
  highestPriceDuringTrade: number | null;
  lowestPriceDuringTrade: number | null;
  mfe: number | null;
  mae: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  exitEfficiencyPct: number | null;
}

export interface DataQuality {
  missingInputs: string[];
  missingMarketData: string[];
  assumptions: string[];
  warnings: string[];
}

/** Stored enrichment row DTO (trade_context_enrichment table). */
export interface EnrichmentRow {
  groupId: string | null;
  schemaVersion: number;
  enrichment: TradeContextEnrichment;
  computedAt: string;
}

/** Calculated enrichment — stored separately from the raw broker trade. */
export interface TradeContextEnrichment {
  symbol: string;
  direction: Side;
  entryDatetime: string;
  exitDatetime: string;
  basicResult: BasicResult;
  riskReward: RiskReward;
  stockContext: StockContext;
  marketContext: MarketContext;
  tradeJourney: TradeJourney;
  dataQuality: DataQuality;
}

// ─── Small numeric helpers ────────────────────────────────────────────────────

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Simple moving average of the last `n` values; null when history is short. */
export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const tail = values.slice(-n);
  return tail.reduce((s, v) => s + v, 0) / n;
}

/** % return over the last `n` bars of `closes`; null when history is short. */
export function nBarReturnPct(closes: number[], n: number): number | null {
  if (closes.length < n + 1) return null;
  const last = closes[closes.length - 1];
  const base = closes[closes.length - 1 - n];
  if (Math.abs(base) < EPS) return null;
  return r((last / base - 1) * 100, 4);
}

/** ATR(14) as a simple mean of the last 14 true ranges; needs 15 bars. */
export function atr14(bars: Candle[]): number | null {
  const n = 14;
  if (bars.length < n + 1) return null;
  const tail = bars.slice(-(n + 1));
  let sum = 0;
  for (let i = 1; i < tail.length; i++) {
    const prevClose = tail[i - 1].close;
    const { high, low } = tail[i];
    sum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return sum / n;
}

// ─── Section calculators (pure, exported for tests) ──────────────────────────

export function computeBasicResult(t: EnrichmentTradeInput): BasicResult {
  const sign = t.direction === "LONG" ? 1 : -1;
  const grossPnl = sign * (t.exitPrice - t.entryPrice) * t.quantity;
  const fees = t.fees ?? 0;
  const netPnl = grossPnl - Math.abs(fees);
  const costBasis = t.entryPrice * t.quantity;
  const pnlPercent = costBasis > EPS ? (netPnl / costBasis) * 100 : 0;
  const holdingMs =
    new Date(t.exitDatetime).getTime() - new Date(t.entryDatetime).getTime();
  const result: TradeResult =
    Math.abs(netPnl) < EPS ? "BREAKEVEN" : netPnl > 0 ? "WIN" : "LOSS";
  return {
    grossPnl: r(grossPnl, 2),
    netPnl: r(netPnl, 2),
    pnlPercent: r(pnlPercent, 4),
    holdingPeriodMinutes: Math.round(holdingMs / 60000),
    result,
  };
}

export function computeRiskReward(
  t: EnrichmentTradeInput,
  netPnl: number,
  warnings: string[],
): RiskReward {
  const sign = t.direction === "LONG" ? 1 : -1;

  let plannedRiskPerShare: number | null = null;
  if (t.plannedStopLoss != null) {
    const risk = sign * (t.entryPrice - t.plannedStopLoss);
    if (risk > EPS) {
      plannedRiskPerShare = r(risk, 4);
    } else {
      warnings.push(
        "Planned stop is not on the protective side of entry — R-based metrics omitted",
      );
    }
  }

  let plannedRewardPerShare: number | null = null;
  if (t.plannedTargetPrice != null) {
    const reward = sign * (t.plannedTargetPrice - t.entryPrice);
    if (reward > EPS) {
      plannedRewardPerShare = r(reward, 4);
    } else {
      warnings.push(
        "Planned target is not on the profit side of entry — planned R/R omitted",
      );
    }
  }

  const plannedRr =
    plannedRiskPerShare != null && plannedRewardPerShare != null
      ? r(plannedRewardPerShare / plannedRiskPerShare, 4)
      : null;

  const actualRMultiple =
    plannedRiskPerShare != null && t.quantity > 0
      ? r(netPnl / (plannedRiskPerShare * t.quantity), 4)
      : null;

  return { plannedRiskPerShare, plannedRewardPerShare, plannedRr, actualRMultiple };
}

/** Stacking rule: price above rising stack = BULLISH, below = BEARISH, else MIXED. */
export function computeMaAlignment(
  price: number,
  ma20: number | null,
  ma50: number | null,
  ma150: number | null,
): Trend {
  if (ma20 == null || ma50 == null || ma150 == null) return "UNKNOWN";
  if (price > ma20 && ma20 > ma50 && ma50 > ma150) return "BULLISH";
  if (price < ma20 && ma20 < ma50 && ma50 < ma150) return "BEARISH";
  return "MIXED";
}

/**
 * Technical context of the traded stock as of entry.
 * `history` = completed daily bars strictly BEFORE the entry day (the entry-day
 * close is unknown at entry time); `entryBar` = the entry day's bar, used only
 * for volume fields.
 */
export function computeStockContext(
  history: Candle[],
  entryBar: Candle | null,
  entryPrice: number,
): StockContext {
  const closes = history.map((b) => b.close);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma150 = sma(closes, 150);

  const dist = (ma: number | null) =>
    ma != null && Math.abs(ma) > EPS ? r(((entryPrice - ma) / ma) * 100, 4) : null;

  const volumes = history
    .map((b) => b.volume)
    .filter((v): v is number => v != null);
  const avgVolume20d = sma(volumes, 20);
  const entryDayVolume = entryBar?.volume ?? null;
  const relativeVolume =
    avgVolume20d != null && avgVolume20d > EPS && entryDayVolume != null
      ? r(entryDayVolume / avgVolume20d, 4)
      : null;

  const atr = atr14(history);
  const lastClose = closes.length ? closes[closes.length - 1] : null;

  return {
    aboveMa20: ma20 != null ? entryPrice > ma20 : null,
    aboveMa50: ma50 != null ? entryPrice > ma50 : null,
    aboveMa150: ma150 != null ? entryPrice > ma150 : null,
    maAlignment: computeMaAlignment(entryPrice, ma20, ma50, ma150),
    distanceFromMa20Pct: dist(ma20),
    distanceFromMa50Pct: dist(ma50),
    distanceFromMa150Pct: dist(ma150),
    return5dPct: nBarReturnPct(closes, 5),
    return20dPct: nBarReturnPct(closes, 20),
    return60dPct: nBarReturnPct(closes, 60),
    avgVolume20d: avgVolume20d != null ? r(avgVolume20d, 0) : null,
    entryDayVolume,
    relativeVolume,
    atr14: atr != null ? r(atr, 4) : null,
    atrPct:
      atr != null && lastClose != null && lastClose > EPS
        ? r((atr / lastClose) * 100, 4)
        : null,
  };
}

/** Index (SPY/QQQ) context from completed bars before the entry day. */
export function computeIndexContext(symbol: string, history: Candle[]): IndexContext {
  const closes = history.map((b) => b.close);
  const lastClose = closes.length ? closes[closes.length - 1] : null;
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);

  let bias: Trend = "UNKNOWN";
  if (lastClose != null && ma50 != null && ma200 != null) {
    if (lastClose > ma50 && ma50 > ma200) bias = "BULLISH";
    else if (lastClose < ma50 && ma50 < ma200) bias = "BEARISH";
    else bias = "MIXED";
  }

  return {
    symbol,
    aboveMa20: lastClose != null && ma20 != null ? lastClose > ma20 : null,
    aboveMa50: lastClose != null && ma50 != null ? lastClose > ma50 : null,
    aboveMa200: lastClose != null && ma200 != null ? lastClose > ma200 : null,
    return5dPct: nBarReturnPct(closes, 5),
    return20dPct: nBarReturnPct(closes, 20),
    bias,
  };
}

/** Volatility regime from the last VIX close before entry. */
export function computeVixContext(history: Candle[]): VixContext {
  const closes = history.map((b) => b.close);
  const level = closes.length ? closes[closes.length - 1] : null;
  let regime: VixRegime = "UNKNOWN";
  if (level != null) {
    regime =
      level < 15 ? "LOW" : level < 20 ? "NORMAL" : level < 30 ? "ELEVATED" : "EXTREME";
  }
  return {
    level: level != null ? r(level, 2) : null,
    return5dPct: nBarReturnPct(closes, 5),
    regime,
  };
}

export function combineMarketBias(spy: Trend, qqq: Trend): Trend {
  if (spy === "UNKNOWN" || qqq === "UNKNOWN") return "UNKNOWN";
  if (spy === qqq) return spy;
  return "MIXED";
}

/** Long is supported by a BULLISH market, short by a BEARISH one. */
export function marketSupportiveForTrade(
  bias: Trend,
  direction: Side,
): boolean | null {
  if (bias === "UNKNOWN") return null;
  return (
    (direction === "LONG" && bias === "BULLISH") ||
    (direction === "SHORT" && bias === "BEARISH")
  );
}

/**
 * Price journey between entry and exit from daily bars covering the holding
 * window (entry day … exit day, inclusive). MFE/MAE are measured from entry
 * price against the window's extremes and floored at 0.
 */
export function computeTradeJourney(
  journeyBars: Candle[],
  t: EnrichmentTradeInput,
  plannedRiskPerShare: number | null,
): TradeJourney {
  if (!journeyBars.length) {
    return {
      highestPriceDuringTrade: null,
      lowestPriceDuringTrade: null,
      mfe: null,
      mae: null,
      mfePct: null,
      maePct: null,
      mfeR: null,
      maeR: null,
      exitEfficiencyPct: null,
    };
  }

  const highest = Math.max(...journeyBars.map((b) => b.high));
  const lowest = Math.min(...journeyBars.map((b) => b.low));
  const long = t.direction === "LONG";
  const mfe = Math.max(0, long ? highest - t.entryPrice : t.entryPrice - lowest);
  const mae = Math.max(0, long ? t.entryPrice - lowest : highest - t.entryPrice);

  const pct = (v: number) =>
    t.entryPrice > EPS ? r((v / t.entryPrice) * 100, 4) : null;
  const inR = (v: number) =>
    plannedRiskPerShare != null && plannedRiskPerShare > EPS
      ? r(v / plannedRiskPerShare, 4)
      : null;

  // Share of the maximum favorable excursion actually captured at exit.
  const capturedPerShare = long
    ? t.exitPrice - t.entryPrice
    : t.entryPrice - t.exitPrice;
  const exitEfficiencyPct =
    mfe > EPS ? r((capturedPerShare / mfe) * 100, 4) : null;

  return {
    highestPriceDuringTrade: r(highest, 4),
    lowestPriceDuringTrade: r(lowest, 4),
    mfe: r(mfe, 4),
    mae: r(mae, 4),
    mfePct: pct(mfe),
    maePct: pct(mae),
    mfeR: inR(mfe),
    maeR: inR(mae),
    exitEfficiencyPct,
  };
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export const INDEX_SYMBOLS = ["SPY", "QQQ"] as const;
/** Yahoo/Polygon symbol for the CBOE volatility index (mapped per provider). */
export const VIX_SYMBOL = "^VIX";
/** Calendar days of history fetched before entry (~280 trading days ≥ MA150 needs). */
export const HISTORY_CALENDAR_DAYS = 420;

export function splitBars(bars: Candle[], entryDate: string, exitDate: string) {
  const history: Candle[] = [];
  const journey: Candle[] = [];
  let entryBar: Candle | null = null;
  for (const b of bars) {
    const d = utcDateKey(b.time * 1000);
    if (d < entryDate) history.push(b);
    if (d === entryDate) entryBar = b;
    if (d >= entryDate && d <= exitDate) journey.push(b);
  }
  return { history, entryBar, journey };
}

function emptyStockContext(): StockContext {
  return computeStockContext([], null, 1);
}

function validate(t: EnrichmentTradeInput): void {
  if (!t.symbol?.trim()) throw new Error("enrichTradeContext: symbol is required");
  if (t.direction !== "LONG" && t.direction !== "SHORT")
    throw new Error("enrichTradeContext: direction must be LONG or SHORT");
  if (!(t.entryPrice > 0) || !(t.exitPrice > 0))
    throw new Error("enrichTradeContext: entry/exit price must be positive");
  if (!(t.quantity > 0)) throw new Error("enrichTradeContext: quantity must be positive");
  const entry = new Date(t.entryDatetime).getTime();
  const exit = new Date(t.exitDatetime).getTime();
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || exit < entry)
    throw new Error("enrichTradeContext: invalid entry/exit datetimes");
}

/**
 * Compute the full context enrichment for one completed trade.
 * Market data comes only from the injected provider; every metric that cannot
 * be derived is null/UNKNOWN and accounted for in dataQuality.
 */
export async function enrichTradeContext(
  trade: EnrichmentTradeInput,
  provider: DailyBarProvider,
): Promise<TradeContextEnrichment> {
  validate(trade);

  const missingInputs: string[] = [];
  const missingMarketData: string[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (trade.fees == null) {
    missingInputs.push("fees");
    assumptions.push("fees missing — net P&L assumes zero fees");
  }
  if (trade.plannedStopLoss == null) missingInputs.push("plannedStopLoss");
  if (trade.plannedTargetPrice == null) missingInputs.push("plannedTargetPrice");

  const basicResult = computeBasicResult(trade);
  const riskReward = computeRiskReward(trade, basicResult.netPnl, warnings);

  const entryTs = Math.floor(new Date(trade.entryDatetime).getTime() / 1000);
  const exitTs = Math.floor(new Date(trade.exitDatetime).getTime() / 1000);
  const entryDate = utcDateKey(entryTs * 1000);
  const exitDate = utcDateKey(exitTs * 1000);
  const from = entryTs - HISTORY_CALENDAR_DAYS * 86400;

  const fetchBars = async (
    symbol: string,
    to: number,
    label = symbol,
  ): Promise<Candle[] | null> => {
    try {
      return await provider.getDailyBars(symbol, from, to);
    } catch (err) {
      missingMarketData.push(
        `${label}: ${err instanceof Error ? err.message : "daily bars unavailable"}`,
      );
      return null;
    }
  };

  const [stockBars, spyBars, qqqBars, vixBars] = await Promise.all([
    fetchBars(trade.symbol, exitTs + 2 * 86400),
    fetchBars(INDEX_SYMBOLS[0], entryTs + 86400),
    fetchBars(INDEX_SYMBOLS[1], entryTs + 86400),
    fetchBars(VIX_SYMBOL, entryTs + 86400, "VIX"),
  ]);

  // Stock technical context + journey
  let stockContext = emptyStockContext();
  let tradeJourney = computeTradeJourney([], trade, riskReward.plannedRiskPerShare);
  if (stockBars && stockBars.length) {
    const { history, entryBar, journey } = splitBars(stockBars, entryDate, exitDate);
    if (history.length < 150)
      warnings.push(
        `Only ${history.length} daily bars before entry for ${trade.symbol} — long-window indicators may be null`,
      );
    stockContext = computeStockContext(history, entryBar, trade.entryPrice);
    tradeJourney = computeTradeJourney(journey, trade, riskReward.plannedRiskPerShare);
    if (!journey.length)
      missingMarketData.push(`${trade.symbol}: no daily bars in the holding window`);
    else
      assumptions.push(
        "MFE/MAE/exit efficiency use daily highs/lows — entry/exit-day extremes may fall outside the actual holding window",
      );
    assumptions.push(
      "Indicators (MA/ATR/returns/avg volume) use daily closes strictly before the entry day",
      "Entry-day volume is the full session volume even for intraday entries",
    );
  } else if (stockBars && !stockBars.length) {
    missingMarketData.push(`${trade.symbol}: provider returned no daily bars`);
  }

  // Market context (SPY + QQQ)
  const indexContext = (symbol: string, bars: Candle[] | null): IndexContext => {
    if (!bars || !bars.length) {
      if (bars && !bars.length)
        missingMarketData.push(`${symbol}: provider returned no daily bars`);
      return computeIndexContext(symbol, []);
    }
    const { history } = splitBars(bars, entryDate, exitDate);
    return computeIndexContext(symbol, history);
  };
  const spy = indexContext("SPY", spyBars);
  const qqq = indexContext("QQQ", qqqBars);
  const vix = computeVixContext(
    vixBars?.length ? splitBars(vixBars, entryDate, exitDate).history : [],
  );
  if (vixBars && !vixBars.length)
    missingMarketData.push("VIX: provider returned no daily bars");
  const marketBias = combineMarketBias(spy.bias, qqq.bias);
  const marketContext: MarketContext = {
    spy,
    qqq,
    vix,
    marketBias,
    marketSupportiveForTrade: marketSupportiveForTrade(marketBias, trade.direction),
  };

  return {
    symbol: trade.symbol,
    direction: trade.direction,
    entryDatetime: new Date(trade.entryDatetime).toISOString(),
    exitDatetime: new Date(trade.exitDatetime).toISOString(),
    basicResult,
    riskReward,
    stockContext,
    marketContext,
    tradeJourney,
    dataQuality: { missingInputs, missingMarketData, assumptions, warnings },
  };
}
