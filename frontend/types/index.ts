/** Shared types — mirror backend Pydantic DTOs (camelCase JSON). */

export type Side = "LONG" | "SHORT";
export type TradeResult = "WIN" | "LOSS" | "BREAKEVEN";
export type TradeStatus = "OPEN" | "CLOSED";
export type Range = "7d" | "30d" | "90d" | "ytd" | "all";

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}

export interface MetricDeltas {
  winRate?: number;
  profitFactor?: number;
  netRoi?: number;
  totalTrades?: number;
}

export interface MetricsSummary {
  range: { from: string; to: string };
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  profitFactor: number;
  netRoi: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  maxDrawdown: number;
  totalCommission: number;
  deltas: MetricDeltas;
  currency: string;
}

export interface EquityPoint {
  t: string;
  equity: number;
  drawdown?: number;
}

export interface TradeGroup {
  id: string;
  symbol: string;
  side: Side;
  status: TradeStatus;
  result: TradeResult;
  entryTime: string;
  exitTime: string | null;
  qty: number;
  avgEntry: number;
  avgExit: number | null;
  netPnl: number;
  realizedPnl: number;
  commission: number;
  returnPct: number;
  rMultiple: number | null;
  holdingMinutes: number | null;
  currency: string;
  setup: string | null;
  psychTags: string[];
  hasNotes: boolean;
}

export interface Execution {
  tradeId: string;
  execTime: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  proceeds: number | null;
  commission: number | null;
  realizedPnl: number | null;
}

export interface TradeMarker {
  time: number;
  price: number;
  side: "BUY" | "SELL";
  qty: number;
}

export interface JournalEntry {
  id?: number;
  symbol: string;
  entryTime: string;
  setup: string | null;
  psychTags: string[];
  notes: string;
  plannedStop: number | null;
  plannedTarget: number | null;
  riskAmount: number | null;
  updatedAt?: string;
}

export interface TradeGroupDetail extends TradeGroup {
  executions: Execution[];
  journal: JournalEntry | null;
  markers: TradeMarker[];
}

export type InsightType =
  | "STRENGTH"
  | "WEAKNESS"
  | "PATTERN"
  | "WARNING"
  | "SUGGESTION";

export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  summary: string;
  recommendation?: string | null;
  confidence: number;
  evidenceTradeIds: string[];
  status: "new" | "accepted" | "dismissed";
  createdAt: string;
}

export interface TradeQuery {
  range?: Range;
  cursor?: string | null;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
  symbol?: string;
  side?: Side;
  result?: TradeResult;
}

export interface RawExecutionRow {
  tradeId: string;
  execTime: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  proceeds: number | null;
  commission: number | null;
  realizedPnl: number | null;
  currency: string;
}

export interface CashTransaction {
  transactionId: string;
  execTime: string;
  symbol: string;
  description: string | null;
  action: string | null;
  currency: string | null;
  quantity: number;
  rate: number | null;
  netCash: number | null;
  commission: number | null;
  txnType: string | null;  // "deposit" | "sweep"
}

export interface CashSummary {
  totalTransactions: number;
  netCash: number;
  totalInflows: number;
  totalOutflows: number;
  totalCommission: number;
  totalDepositedUsd: number;
}

export interface ExecutionQuery {
  range?: Range;
  cursor?: string | null;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
  symbol?: string;
  action?: string;
}

export interface CashQuery {
  range?: Range;
  cursor?: string | null;
  limit?: number;
  sort?: string;
  dir?: "asc" | "desc";
  symbol?: string;
}
