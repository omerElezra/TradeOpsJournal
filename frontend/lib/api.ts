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
import type { EnrichmentRow } from "@/lib/domain/enrichment";
import type {
  EntryCheckResponse,
  ForwardOutcome,
  PreEntryContext,
  TradePlanQuery,
  TradePlanRow,
  TradePlanStatus,
} from "@/lib/domain/pre-entry";
import type { EntryChecklist, RulePredicate, ScoringRule } from "@/lib/domain/scoring";

export interface EntryCheckRequest {
  symbol: string;
  direction: "LONG" | "SHORT";
  asOf?: string | null;
  refPrice?: number | null;
  plannedStop?: number | null;
  plannedTarget?: number | null;
}

export interface ScoringRuleInput {
  label: string;
  conditions: RulePredicate[];
  points: number;
  note: string;
  enabled: boolean;
  sortOrder?: number;
}

export interface TradePlanCreate {
  symbol: string;
  direction: "LONG" | "SHORT";
  plannedAt: string;
  refPrice: number | null;
  context: PreEntryContext | null;
  checklist: EntryChecklist;
  forwardOutcome: ForwardOutcome | null;
  notes: string;
}

/** PATCH body: light ({status, notes}) or a full edit (TradePlanCreate fields). */
export type TradePlanUpdate = Partial<TradePlanCreate> & {
  status?: TradePlanStatus;
};

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

  /** Stored trade context enrichment; null when never computed. */
  getTradeEnrichment: async (tradeId: string): Promise<EnrichmentRow | null> => {
    const res = await fetch(
      `${BASE}/api/v1/trades/${encodeURIComponent(tradeId)}/enrichment`,
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`API ${res.status}: ${detail}`);
    }
    return res.json() as Promise<EnrichmentRow>;
  },

  computeTradeEnrichment: (tradeId: string) =>
    request<EnrichmentRow>(
      `/api/v1/trades/${encodeURIComponent(tradeId)}/enrichment`,
      { method: "POST" },
    ),

  /** Compute-only pre-entry check (nothing persisted). */
  computeEntryCheck: (body: EntryCheckRequest) =>
    request<EntryCheckResponse>(`/api/v1/entry-check`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getScoringRules: () => request<ScoringRule[]>(`/api/v1/scoring-rules`),

  createScoringRule: (rule: ScoringRuleInput) =>
    request<ScoringRule>(`/api/v1/scoring-rules`, {
      method: "POST",
      body: JSON.stringify(rule),
    }),

  updateScoringRule: (id: number, patch: Partial<ScoringRuleInput>) =>
    request<ScoringRule>(`/api/v1/scoring-rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteScoringRule: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/scoring-rules/${id}`, { method: "DELETE" }),

  listTradePlans: (params: TradePlanQuery = {}) =>
    request<TradePlanRow[]>(`/api/v1/trade-plans${qs({ ...params })}`),

  createTradePlan: (body: TradePlanCreate) =>
    request<TradePlanRow>(`/api/v1/trade-plans`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTradePlan: (id: number, patch: TradePlanUpdate) =>
    request<TradePlanRow>(`/api/v1/trade-plans/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  deleteTradePlan: (id: number) =>
    request<{ ok: boolean }>(`/api/v1/trade-plans/${id}`, { method: "DELETE" }),
};
