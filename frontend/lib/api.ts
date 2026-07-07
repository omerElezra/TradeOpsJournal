import type {
  AccountTransaction,
  AccountTxnQuery,
  AccountTxnSummary,
  AccrualData,
  AnalyticsData,
  CandleQuery,
  CandlesResponse,
  CashQuery,
  CashSummary,
  CashTransaction,
  DeleteResult,
  EquityPoint,
  ExecutionQuery,
  Insight,
  JournalEntry,
  JournalListItem,
  ManualCashInput,
  ManualInsertResult,
  ManualTradeInput,
  MetricsSummary,
  Paginated,
  Range,
  RawExecutionRow,
  TradeGroup,
  TradeGroupDetail,
  TradeQuery,
  TransactionsSummary,
} from "@/types";

// Empty BASE → all requests go to the same Next.js origin (relative URLs).
// The FastAPI backend is no longer used — routes live under /api/v1/*.
const BASE = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      // Auth: attach Supabase JWT here when auth is wired up.
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  getMetrics: (range: Range) =>
    request<MetricsSummary>(`/api/v1/metrics/summary${qs({ range })}`),

  getEquityCurve: (range: Range) =>
    request<EquityPoint[]>(`/api/v1/metrics/equity-curve${qs({ range })}`),

  getTrades: (params: TradeQuery) =>
    request<Paginated<TradeGroup>>(`/api/v1/trades${qs({ ...params })}`),

  getTrade: (id: string) =>
    request<TradeGroupDetail>(`/api/v1/trades/${encodeURIComponent(id)}`),

  getInsights: (range: Range) =>
    request<Insight[]>(`/api/v1/insights${qs({ range })}`),

  getJournal: (range: Range) =>
    request<JournalListItem[]>(`/api/v1/journal${qs({ range })}`),

  upsertJournal: (body: Omit<JournalEntry, "id" | "updatedAt">) =>
    request<JournalEntry>(`/api/v1/journal`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getExecutions: (params: ExecutionQuery) =>
    request<Paginated<RawExecutionRow>>(`/api/v1/executions${qs({ ...params })}`),

  addManualTrades: (trades: ManualTradeInput[]) =>
    request<ManualInsertResult>(`/api/v1/trades/manual`, {
      method: "POST",
      body: JSON.stringify(trades),
    }),

  deleteExecution: (tradeId: string) =>
    request<DeleteResult>(`/api/v1/executions/${encodeURIComponent(tradeId)}`, {
      method: "DELETE",
    }),

  getCash: (params: CashQuery) =>
    request<Paginated<CashTransaction>>(`/api/v1/cash${qs({ ...params })}`),

  addManualCash: (txns: ManualCashInput[]) =>
    request<ManualInsertResult>(`/api/v1/cash/manual`, {
      method: "POST",
      body: JSON.stringify(txns),
    }),

  deleteCash: (transactionId: string) =>
    request<DeleteResult>(`/api/v1/cash/${encodeURIComponent(transactionId)}`, {
      method: "DELETE",
    }),

  getCashSummary: (range: Range) =>
    request<CashSummary>(`/api/v1/cash/summary${qs({ range })}`),

  getTransactionsSummary: () =>
    request<TransactionsSummary>(`/api/v1/transactions/summary`),

  getAccountTxns: (params: AccountTxnQuery) =>
    request<Paginated<AccountTransaction>>(`/api/v1/account-transactions${qs({ ...params })}`),

  getAccountTxnSummary: (range: Range) =>
    request<AccountTxnSummary>(`/api/v1/account-transactions/summary${qs({ range })}`),

  getInterestAccruals: (range: Range) =>
    request<AccrualData>(`/api/v1/interest-accruals${qs({ range })}`),

  getAnalytics: (range: Range) =>
    request<AnalyticsData>(`/api/v1/metrics/analytics${qs({ range })}`),

  getCandles: (params: CandleQuery) =>
    request<CandlesResponse>(`/api/v1/candles${qs({ ...params })}`),
};
