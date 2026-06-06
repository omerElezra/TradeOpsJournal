import "server-only";
import type { GroupedTrade } from "./models";

const EPS = 1e-9;

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function closed(trades: GroupedTrade[]) {
  return trades.filter(t => t.status === "CLOSED");
}

export function winRate(trades: GroupedTrade[]) {
  const c = closed(trades);
  if (!c.length) return 0;
  return r((c.filter(t => t.result === "WIN").length / c.length) * 100, 4);
}

export function grossProfit(trades: GroupedTrade[]) {
  return r(closed(trades).filter(t => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0), 2);
}

export function grossLoss(trades: GroupedTrade[]) {
  return r(closed(trades).filter(t => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0), 2);
}

export function profitFactor(trades: GroupedTrade[]) {
  const gp = grossProfit(trades);
  const gl = Math.abs(grossLoss(trades));
  if (gl < EPS) return gp > 0 ? r(gp, 4) : 0;
  return r(gp / gl, 4);
}

export function netPnl(trades: GroupedTrade[]) {
  return r(closed(trades).reduce((s, t) => s + t.netPnl, 0), 2);
}

export function avgWin(trades: GroupedTrade[]) {
  const wins = closed(trades).filter(t => t.result === "WIN").map(t => t.netPnl);
  return wins.length ? r(wins.reduce((s, v) => s + v, 0) / wins.length, 2) : 0;
}

export function avgLoss(trades: GroupedTrade[]) {
  const losses = closed(trades).filter(t => t.result === "LOSS").map(t => t.netPnl);
  return losses.length ? r(losses.reduce((s, v) => s + v, 0) / losses.length, 2) : 0;
}

export function expectancy(trades: GroupedTrade[]) {
  const c = closed(trades);
  if (!c.length) return 0;
  return r(c.reduce((s, t) => s + t.netPnl, 0) / c.length, 2);
}

export function netRoi(trades: GroupedTrade[]) {
  const c = closed(trades);
  const capital = c.reduce((s, t) => s + t.avgEntry * t.qty, 0);
  if (capital < EPS) return 0;
  return r((netPnl(trades) / capital) * 100, 4);
}

export function totalTrades(trades: GroupedTrade[]) {
  return closed(trades).length;
}

export function rMultiple(net: number, risk: number | null | undefined): number | null {
  if (risk == null || Math.abs(risk) < EPS) return null;
  return r(net / Math.abs(risk), 2);
}

export interface EquityCurvePoint {
  t: Date;
  equity: number;
  drawdown: number;
}

export function equityCurve(trades: GroupedTrade[]): EquityCurvePoint[] {
  const c = closed(trades)
    .filter(t => t.exitTime !== null)
    .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());

  const points: EquityCurvePoint[] = [];
  let cumulative = 0;
  let peak = 0;
  for (const t of c) {
    cumulative += t.netPnl;
    peak = Math.max(peak, cumulative);
    points.push({ t: t.exitTime!, equity: r(cumulative, 2), drawdown: r(cumulative - peak, 2) });
  }
  return points;
}

export function maxDrawdown(trades: GroupedTrade[]) {
  const curve = equityCurve(trades);
  if (!curve.length) return 0;
  return r(Math.min(...curve.map(p => p.drawdown)), 2);
}
