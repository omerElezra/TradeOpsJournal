// Builds a self-contained AI-coach prompt from a pre-entry check: the measured
// context, the trader's manual read, the rule-based score and (for
// retrospective checks) what actually happened. Pure string building — the
// user copies the result into any AI model.

import type { Side } from "@/types";
import type { StockContext, MarketContext } from "./enrichment";
import type { ForwardOutcome, PreEntryContext } from "./pre-entry";
import type { EntryChecklist, ScoreResult } from "./scoring";

export interface EntryPromptInput {
  context: PreEntryContext;
  checklist: EntryChecklist;
  score: ScoreResult | null;
  forwardOutcome: ForwardOutcome | null;
  notes: string;
}

const fmt = (v: number | null | undefined, digits = 2): string =>
  v != null ? v.toFixed(digits) : "n/a";

const pct = (v: number | null | undefined, digits = 1): string =>
  v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%` : "n/a";

const yn = (v: boolean | null | undefined): string =>
  v == null ? "unknown" : v ? "yes" : "no";

/** Planned R/R from ref price + stop/target, honoring direction. */
export function plannedRr(
  refPrice: number | null,
  direction: Side,
  stop: number | null,
  target: number | null,
): number | null {
  if (refPrice == null || stop == null || target == null) return null;
  const sign = direction === "LONG" ? 1 : -1;
  const risk = sign * (refPrice - stop);
  const reward = sign * (target - refPrice);
  if (!(risk > 0) || !(reward > 0)) return null;
  return Math.round((reward / risk) * 100) / 100;
}

function stockLines(sc: StockContext): string[] {
  return [
    `- MA alignment: ${sc.maAlignment}; above MA20/50/150: ${yn(sc.aboveMa20)} / ${yn(sc.aboveMa50)} / ${yn(sc.aboveMa150)}`,
    `- Distance from MA20/50/150: ${pct(sc.distanceFromMa20Pct)} / ${pct(sc.distanceFromMa50Pct)} / ${pct(sc.distanceFromMa150Pct)}`,
    `- Returns 5d/20d/60d: ${pct(sc.return5dPct)} / ${pct(sc.return20dPct)} / ${pct(sc.return60dPct)}`,
    `- Relative volume: ${sc.relativeVolume != null ? `${fmt(sc.relativeVolume)}×` : "n/a"} (day volume ${fmt(sc.entryDayVolume, 0)}, 20d avg ${fmt(sc.avgVolume20d, 0)})`,
    `- ATR(14): ${fmt(sc.atr14)} (${pct(sc.atrPct)} of price)`,
  ];
}

function marketLines(mc: MarketContext): string[] {
  return [
    `- SPY: ${mc.spy.bias}, QQQ: ${mc.qqq.bias}, combined bias: ${mc.marketBias}, supportive for this trade: ${yn(mc.marketSupportiveForTrade)}`,
    `- VIX: ${fmt(mc.vix.level)} (regime ${mc.vix.regime}, 5d change ${pct(mc.vix.return5dPct)})`,
  ];
}

function checklistLines(c: EntryChecklist): string[] {
  const lines: string[] = [];
  const add = (label: string, v: string | number | null) => {
    if (v != null && v !== "") lines.push(`- ${label}: ${v}`);
  };
  add("Recent trend", c.recentTrend);
  add("Volume vs trend", c.volumeVsTrend);
  if (c.maRelation.length) lines.push(`- Moving averages: ${c.maRelation.join(", ")}`);
  add("Technical setup", c.setup);
  add("Entry confirmation", c.entryConfirmation);
  add("Candle pattern", c.candlePattern);
  if (c.openGaps.length) lines.push(`- Open gaps: ${c.openGaps.join(", ")}`);
  if (c.supportResFib.length)
    lines.push(`- Support/Resistance/Fibonacci: ${c.supportResFib.join(", ")}`);
  add("Conviction (1-10)", c.conviction);
  if (!lines.length) lines.push("- (no manual read filled in)");
  return lines;
}

function scoreLines(s: ScoreResult): string[] {
  const lines = [
    `Total: ${s.score >= 0 ? "+" : ""}${s.score} (sum of my own transparent rules)`,
  ];
  if (s.fired.length) {
    lines.push("Fired rules:");
    for (const f of s.fired)
      lines.push(`- ${f.label} (${f.points >= 0 ? "+" : ""}${f.points})${f.note ? ` — ${f.note}` : ""}`);
  } else {
    lines.push("Fired rules: none");
  }
  if (s.skipped.length)
    lines.push(
      `Not evaluated (missing data): ${s.skipped.map((x) => x.label).join("; ")}`,
    );
  return lines;
}

function forwardLines(fo: ForwardOutcome): string[] {
  const lines = [
    `From reference price ${fmt(fo.refPrice)} over the next ${fo.barsAvailable} trading days:`,
  ];
  for (const h of fo.horizons)
    lines.push(
      `- ${h.days}d: close ${pct(h.closePct)}, max high ${pct(h.maxHighPct)}, min low ${pct(h.minLowPct)}`,
    );
  const st = fo.stopTarget;
  if (st) {
    const what =
      st.firstHit === "STOP"
        ? `stop (${fmt(st.stop)}) was hit first after ${st.hitAfterDays} trading day(s)`
        : st.firstHit === "TARGET"
          ? `target (${fmt(st.target)}) was hit first after ${st.hitAfterDays} trading day(s)`
          : st.firstHit === "AMBIGUOUS"
            ? `both stop and target were breached inside the same daily bar (day ${st.hitAfterDays}) — inconclusive on daily data`
            : "neither stop nor target was hit in the window";
    lines.push(`- Stop/target outcome: ${what}`);
  }
  return lines;
}

/** Build the full copy-paste prompt for an external AI model. */
export function buildEntryPrompt(input: EntryPromptInput): string {
  const { context: ctx, checklist, score, forwardOutcome, notes } = input;
  const retro = ctx.mode === "retrospective";
  const rr = plannedRr(ctx.refPrice, ctx.direction, checklist.plannedStop, checklist.plannedTarget);

  const parts: string[] = [];

  parts.push(
    "You are an experienced, no-nonsense swing-trading coach. Evaluate the stock entry below and tell me honestly whether it is a good entry and a good trade plan. Be direct and critical — do not flatter the setup.",
    "",
    "## Trade under evaluation",
    `- Symbol: ${ctx.symbol} (${ctx.direction})`,
    `- Check time: ${ctx.asOf} (${retro ? "RETROSPECTIVE practice — first judge it as if we are at that moment, without hindsight" : "live pre-entry check, position not opened yet"})`,
    `- Reference entry price: ${fmt(ctx.refPrice)} (${ctx.refPriceSource === "user" ? "my intended entry" : `last daily close ${ctx.lastCloseDate ?? ""}`})`,
    `- Planned stop: ${fmt(checklist.plannedStop)} / Planned target: ${fmt(checklist.plannedTarget)}${rr != null ? ` / Planned R:R ≈ ${rr}:1` : ""}`,
  );

  parts.push(
    "",
    "## Measured technical context (computed from daily bars strictly before the check day)",
    "Stock:",
    ...stockLines(ctx.stockContext),
    "Market:",
    ...marketLines(ctx.marketContext),
  );

  const dq = ctx.dataQuality;
  const dqNotes = [...dq.warnings, ...dq.missingMarketData, ...dq.assumptions];
  if (dqNotes.length) {
    parts.push("Data-quality notes:", ...dqNotes.map((n) => `- ${n}`));
  }

  parts.push("", "## My manual chart read", ...checklistLines(checklist));

  if (notes.trim()) parts.push("", "## My notes", notes.trim());

  if (score) parts.push("", "## My rule-based pre-entry score", ...scoreLines(score));

  if (retro && forwardOutcome) {
    parts.push(
      "",
      "## What actually happened afterwards (do NOT use this for the initial judgement — only for the comparison in task 5)",
      ...forwardLines(forwardOutcome),
    );
  }

  parts.push(
    "",
    "## Your task",
    "1. Grade this entry A-F as of the check time and explain the top 3 reasons for the grade.",
    "2. What are the biggest risks in this setup, and what price action would invalidate it?",
    "3. Judge my entry discipline: is this a confirmed entry or anticipation/FOMO? Use my 'Entry confirmation' answer and the measured data.",
    "4. Propose a better plan if you see one: entry trigger, stop placement and target — anchor them to the MAs and ATR above.",
    retro && forwardOutcome
      ? "5. Now compare your judgement with what actually happened afterwards: what did the outcome confirm or refute about the analysis? What is the one lesson to carry into the next trade?"
      : "5. What important information is missing from this data that I should check before entering?",
    "",
    "השב בעברית.",
  );

  return parts.join("\n");
}
