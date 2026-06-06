import "server-only";
import { createHash } from "crypto";
import type { GroupedTrade, RawExecution } from "./models";

const EPS = 1e-9;

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

function stableGroupId(symbol: string, entryTime: Date): string {
  return createHash("sha1")
    .update(`${symbol}|${entryTime.toISOString()}`)
    .digest("hex")
    .slice(0, 16);
}

function signed(ex: RawExecution): number {
  return ex.action === "BUY" ? ex.quantity : -ex.quantity;
}

function vwap(execs: RawExecution[]): number {
  const total = execs.reduce((s, e) => s + e.quantity, 0);
  if (total < EPS) return 0;
  return execs.reduce((s, e) => s + e.price * e.quantity, 0) / total;
}

function buildGroup(symbol: string, execs: RawExecution[], closed: boolean): GroupedTrade {
  const first = execs[0];
  const side: "LONG" | "SHORT" = first.action === "BUY" ? "LONG" : "SHORT";
  const openAction = first.action;

  const entryExecs = execs.filter(e => e.action === openAction);
  const exitExecs = execs.filter(e => e.action !== openAction);

  const entryQty = entryExecs.reduce((s, e) => s + e.quantity, 0);
  const exitQty = exitExecs.reduce((s, e) => s + e.quantity, 0);
  const avgEntry = vwap(entryExecs);
  const avgExit = exitExecs.length > 0 ? vwap(exitExecs) : null;
  const matchedQty = exitExecs.length > 0 ? Math.min(entryQty, exitQty) : 0;

  const commission = execs.reduce((s, e) => s + (e.commission ?? 0), 0);
  const realized = execs.reduce((s, e) => s + (e.realizedPnl ?? 0), 0);
  const hasRealized = execs.some(e => e.realizedPnl !== null);

  let pricePnl = 0;
  if (closed && avgExit !== null) {
    pricePnl = side === "LONG"
      ? (avgExit - avgEntry) * matchedQty
      : (avgEntry - avgExit) * matchedQty;
  }

  const netPnl = (hasRealized ? realized : pricePnl) + commission;
  const result: "WIN" | "LOSS" | "BREAKEVEN" =
    !closed || Math.abs(netPnl) < EPS ? "BREAKEVEN" : netPnl > 0 ? "WIN" : "LOSS";

  const costBasis = avgEntry * entryQty;
  const returnPct = costBasis > EPS ? (netPnl / costBasis) * 100 : 0;

  const exitTime = closed ? execs[execs.length - 1].execTime : null;
  const holdingMinutes =
    exitTime !== null ? Math.floor((exitTime.getTime() - first.execTime.getTime()) / 60000) : null;

  return {
    id: stableGroupId(symbol, first.execTime),
    symbol,
    side,
    status: closed ? "CLOSED" : "OPEN",
    result,
    entryTime: first.execTime,
    exitTime,
    qty: entryQty,
    avgEntry: r(avgEntry, 6),
    avgExit: avgExit !== null ? r(avgExit, 6) : null,
    netPnl: r(netPnl, 2),
    realizedPnl: r(realized, 2),
    commission: r(commission, 2),
    returnPct: r(returnPct, 4),
    holdingMinutes,
    currency: first.currency,
    executions: execs,
  };
}

function groupSymbol(symbol: string, execs: RawExecution[]): GroupedTrade[] {
  const sorted = [...execs].sort((a, b) => a.execTime.getTime() - b.execTime.getTime());
  const groups: GroupedTrade[] = [];
  let position = 0;
  let bucket: RawExecution[] = [];

  for (const ex of sorted) {
    if (Math.abs(position) < EPS) bucket = [];
    bucket.push(ex);
    position += signed(ex);
    if (Math.abs(position) < EPS && bucket.length > 0) {
      groups.push(buildGroup(symbol, [...bucket], true));
      bucket = [];
    }
  }

  if (bucket.length > 0) groups.push(buildGroup(symbol, bucket, false));
  return groups;
}

export function groupExecutions(executions: RawExecution[]): GroupedTrade[] {
  const bySymbol = new Map<string, RawExecution[]>();
  for (const ex of executions) {
    const list = bySymbol.get(ex.symbol) ?? [];
    list.push(ex);
    bySymbol.set(ex.symbol, list);
  }

  const all: GroupedTrade[] = [];
  for (const [symbol, execs] of bySymbol) {
    all.push(...groupSymbol(symbol, execs));
  }

  return all.sort((a, b) => b.entryTime.getTime() - a.entryTime.getTime());
}
