import type { AccountTxnQuery, CashQuery, ExecutionQuery, Range, TradeQuery } from "@/types";

export const qk = {
  metrics: (range: Range) => ["metrics", range] as const,
  equity: (range: Range) => ["equity", range] as const,
  trades: (params: TradeQuery) => ["trades", params] as const,
  trade: (id: string) => ["trade", id] as const,
  insights: (range: Range) => ["insights", range] as const,
  executions: (params: ExecutionQuery) => ["executions", params] as const,
  cash: (params: CashQuery) => ["cash", params] as const,
  cashSummary: (range: Range) => ["cashSummary", range] as const,
  transactionsSummary: () => ["transactionsSummary"] as const,
  accountTxns: (params: AccountTxnQuery) => ["accountTxns", params] as const,
  accountTxnsSummary: (range: Range) => ["accountTxnsSummary", range] as const,
  analytics: (range: Range) => ["analytics", range] as const,
};
