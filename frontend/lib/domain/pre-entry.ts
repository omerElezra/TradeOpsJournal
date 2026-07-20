// Pre-Entry Check — pure calculation logic for the /entry-check page.
//
// Like enrichment.ts, this module is pure math over inputs passed in (an
// injected DailyBarProvider) so it stays unit-testable and environment-free.
// It computes the same stock/market context as trade enrichment but as-of an
// arbitrary timestamp (no completed trade required), plus a retrospective
// "what would have happened" forward outcome when the as-of moment is in the
// past. Same rules honored: no predictions, no invented data — anything not
// derivable is null / "UNKNOWN" and reported in dataQuality.

import type { Candle, Side } from "@/types";
import type { EntryChecklist, ScoreResult } from "./scoring";
import {
  HISTORY_CALENDAR_DAYS,
  INDEX_SYMBOLS,
  VIX_SYMBOL,
  combineMarketBias,
  computeIndexContext,
  computeStockContext,
  computeVixContext,
  marketSupportiveForTrade,
  splitBars,
  type DailyBarProvider,
  type DataQuality,
  type IndexContext,
  type MarketContext,
  type StockContext,
} from "./enrichment";

const EPS = 1e-9;

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ─── Context as-of a timestamp ───────────────────────────────────────────────

export interface PreEntryInput {
  symbol: string;
  direction: Side;
  /** ISO timestamp of the check; pass "now" for a live check. */
  asOf: string;
  /** Possible entry price; when omitted the last close before as-of is used. */
  refPrice?: number | null;
}

export interface PreEntryContext {
  symbol: string;
  direction: Side;
  asOf: string;
  mode: "live" | "retrospective";
  refPrice: number | null;
  refPriceSource: "user" | "lastClose" | null;
  lastClose: number | null;
  /** YYYY-MM-DD of the last completed daily bar before the as-of day. */
  lastCloseDate: string | null;
  stockContext: StockContext;
  marketContext: MarketContext;
  dataQuality: DataQuality;
}

function validate(input: PreEntryInput): void {
  if (!input.symbol?.trim())
    throw new Error("computePreEntryContext: symbol is required");
  if (input.direction !== "LONG" && input.direction !== "SHORT")
    throw new Error("computePreEntryContext: direction must be LONG or SHORT");
  const asOf = new Date(input.asOf).getTime();
  if (!Number.isFinite(asOf))
    throw new Error("computePreEntryContext: invalid asOf datetime");
  if (asOf > Date.now() + 86400_000)
    throw new Error("computePreEntryContext: asOf cannot be in the future");
  if (input.refPrice != null && !(input.refPrice > 0))
    throw new Error("computePreEntryContext: refPrice must be positive");
}

/**
 * Compute stock + market context as-of `input.asOf` — the pre-entry half of
 * trade enrichment. Indicators use daily closes strictly before the as-of day;
 * the as-of day's bar feeds volume only (same convention as enrichment).
 */
export async function computePreEntryContext(
  input: PreEntryInput,
  provider: DailyBarProvider,
): Promise<PreEntryContext> {
  validate(input);

  const missingInputs: string[] = [];
  const missingMarketData: string[] = [];
  const assumptions: string[] = [];
  const warnings: string[] = [];

  const asOfTs = Math.floor(new Date(input.asOf).getTime() / 1000);
  const asOfDate = utcDateKey(asOfTs * 1000);
  const mode: PreEntryContext["mode"] =
    asOfDate < utcDateKey(Date.now()) ? "retrospective" : "live";
  const from = asOfTs - HISTORY_CALENDAR_DAYS * 86400;
  const to = asOfTs + 86400;

  const fetchBars = async (symbol: string, label = symbol): Promise<Candle[] | null> => {
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
    fetchBars(input.symbol),
    fetchBars(INDEX_SYMBOLS[0]),
    fetchBars(INDEX_SYMBOLS[1]),
    fetchBars(VIX_SYMBOL, "VIX"),
  ]);

  // Stock context — history strictly before the as-of day; as-of-day bar = volume.
  let stockContext = computeStockContext([], null, 1);
  let refPrice: number | null = input.refPrice ?? null;
  let refPriceSource: PreEntryContext["refPriceSource"] = refPrice != null ? "user" : null;
  let lastClose: number | null = null;
  let lastCloseDate: string | null = null;

  if (stockBars && stockBars.length) {
    const { history, entryBar } = splitBars(stockBars, asOfDate, asOfDate);
    if (history.length) {
      const last = history[history.length - 1];
      lastClose = last.close;
      lastCloseDate = utcDateKey(last.time * 1000);
    }
    if (refPrice == null && lastClose != null) {
      refPrice = lastClose;
      refPriceSource = "lastClose";
      assumptions.push(
        `No entry price given — using the last close (${lastCloseDate}) as reference for MA distances`,
      );
    }
    if (history.length < 150)
      warnings.push(
        `Only ${history.length} daily bars before the as-of day for ${input.symbol} — long-window indicators may be null`,
      );
    if (refPrice != null) {
      stockContext = computeStockContext(history, entryBar, refPrice);
    } else {
      missingInputs.push("refPrice");
    }
    assumptions.push(
      "Indicators (MA/ATR/returns/avg volume) use daily closes strictly before the as-of day",
    );
    if (mode === "live")
      assumptions.push(
        "Live check: as-of-day volume may be a partial session; relative volume can understate",
      );
  } else if (stockBars && !stockBars.length) {
    missingMarketData.push(`${input.symbol}: provider returned no daily bars`);
  }

  // Market context (SPY + QQQ + VIX) — same split convention.
  const indexContext = (symbol: string, bars: Candle[] | null): IndexContext => {
    if (!bars || !bars.length) {
      if (bars && !bars.length)
        missingMarketData.push(`${symbol}: provider returned no daily bars`);
      return computeIndexContext(symbol, []);
    }
    const { history } = splitBars(bars, asOfDate, asOfDate);
    return computeIndexContext(symbol, history);
  };
  const spy = indexContext("SPY", spyBars);
  const qqq = indexContext("QQQ", qqqBars);
  const vix = computeVixContext(
    vixBars?.length ? splitBars(vixBars, asOfDate, asOfDate).history : [],
  );
  if (vixBars && !vixBars.length)
    missingMarketData.push("VIX: provider returned no daily bars");
  const marketBias = combineMarketBias(spy.bias, qqq.bias);
  const marketContext: MarketContext = {
    spy,
    qqq,
    vix,
    marketBias,
    marketSupportiveForTrade: marketSupportiveForTrade(marketBias, input.direction),
  };

  return {
    symbol: input.symbol,
    direction: input.direction,
    asOf: new Date(input.asOf).toISOString(),
    mode,
    refPrice: refPrice != null ? r(refPrice, 4) : null,
    refPriceSource,
    lastClose: lastClose != null ? r(lastClose, 4) : null,
    lastCloseDate,
    stockContext,
    marketContext,
    dataQuality: { missingInputs, missingMarketData, assumptions, warnings },
  };
}

// ─── Retrospective forward outcome ("what would have happened") ──────────────

export interface ForwardHorizon {
  days: number;
  /** Close of the n-th forward bar vs refPrice; null when fewer bars exist. */
  closePct: number | null;
  /** Highest high over the first n forward bars vs refPrice. */
  maxHighPct: number | null;
  /** Lowest low over the first n forward bars vs refPrice. */
  minLowPct: number | null;
}

export interface StopTargetOutcome {
  stop: number | null;
  target: number | null;
  /** AMBIGUOUS = both levels breached inside the same daily bar. */
  firstHit: "STOP" | "TARGET" | "NONE" | "AMBIGUOUS";
  /** Trading days from as-of until the first hit (1 = first forward bar). */
  hitAfterDays: number | null;
}

export interface ForwardOutcome {
  refPrice: number;
  /** Forward trading bars available (≤ the 20 examined). */
  barsAvailable: number;
  horizons: ForwardHorizon[];
  /** Null when neither stop nor target was given. */
  stopTarget: StopTargetOutcome | null;
}

const FORWARD_HORIZON_DAYS = [5, 10, 20] as const;
const FORWARD_MAX_BARS = 20;

/**
 * What the price did after the as-of day. `forwardBars` must be daily bars
 * strictly AFTER the as-of day, chronological. Percentages are signed from
 * refPrice (not direction-adjusted); stop/target hits honor the direction.
 */
export function computeForwardOutcome(
  forwardBars: Candle[],
  refPrice: number,
  direction: Side,
  plannedStop?: number | null,
  plannedTarget?: number | null,
): ForwardOutcome {
  if (!(refPrice > 0)) throw new Error("computeForwardOutcome: refPrice must be positive");
  const bars = forwardBars.slice(0, FORWARD_MAX_BARS);
  const pct = (v: number) => r(((v - refPrice) / refPrice) * 100, 4);

  const horizons: ForwardHorizon[] = FORWARD_HORIZON_DAYS.map((days) => {
    const window = bars.slice(0, days);
    if (!window.length) return { days, closePct: null, maxHighPct: null, minLowPct: null };
    return {
      days,
      closePct: window.length >= days ? pct(window[days - 1].close) : null,
      maxHighPct: pct(Math.max(...window.map((b) => b.high))),
      minLowPct: pct(Math.min(...window.map((b) => b.low))),
    };
  });

  let stopTarget: StopTargetOutcome | null = null;
  const stop = plannedStop != null && plannedStop > 0 ? plannedStop : null;
  const target = plannedTarget != null && plannedTarget > 0 ? plannedTarget : null;
  if (stop != null || target != null) {
    const long = direction === "LONG";
    let firstHit: StopTargetOutcome["firstHit"] = "NONE";
    let hitAfterDays: number | null = null;
    for (let i = 0; i < bars.length; i++) {
      const { high, low } = bars[i];
      const stopHit =
        stop != null && (long ? low <= stop + EPS : high >= stop - EPS);
      const targetHit =
        target != null && (long ? high >= target - EPS : low <= target + EPS);
      if (!stopHit && !targetHit) continue;
      firstHit = stopHit && targetHit ? "AMBIGUOUS" : stopHit ? "STOP" : "TARGET";
      hitAfterDays = i + 1;
      break;
    }
    stopTarget = { stop, target, firstHit, hitAfterDays };
  }

  return { refPrice: r(refPrice, 4), barsAvailable: bars.length, horizons, stopTarget };
}

/** Keep only bars strictly after the as-of day (UTC date-key comparison). */
export function filterForwardBars(bars: Candle[], asOfIso: string): Candle[] {
  const asOfDate = utcDateKey(new Date(asOfIso).getTime());
  return bars.filter((b) => utcDateKey(b.time * 1000) > asOfDate);
}

/** Response shape of POST /api/v1/entry-check. */
export interface EntryCheckResponse {
  context: PreEntryContext;
  forwardOutcome: ForwardOutcome | null;
}

// ─── Stored trade plan DTOs (trade_plans table) ──────────────────────────────
// Defined here (pure module) like EnrichmentRow in enrichment.ts, so client
// code can import the types without touching server-only query modules.

export type TradePlanStatus = "planned" | "entered" | "skipped" | "expired";

export interface TradePlanRow {
  id: number;
  symbol: string;
  direction: Side;
  plannedAt: string;
  refPrice: number | null;
  status: TradePlanStatus;
  context: PreEntryContext | null;
  checklist: EntryChecklist;
  score: number | null;
  scoreBreakdown: ScoreResult | null;
  forwardOutcome: ForwardOutcome | null;
  notes: string;
  linkedGroupId: string | null;
  linkedEntryTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradePlanQuery {
  status?: TradePlanStatus;
  symbol?: string;
  limit?: number;
}
