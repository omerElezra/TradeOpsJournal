import type {
  CashQuery,
  CashSummary,
  CashTransaction,
  EquityPoint,
  ExecutionQuery,
  Insight,
  JournalEntry,
  MetricsSummary,
  Paginated,
  Range,
  RawExecutionRow,
  TradeGroup,
  TradeGroupDetail,
  TradeQuery,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

  upsertJournal: (body: Omit<JournalEntry, "id" | "updatedAt">) =>
    request<JournalEntry>(`/api/v1/journal`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getExecutions: (params: ExecutionQuery) =>
    request<Paginated<RawExecutionRow>>(`/api/v1/executions${qs({ ...params })}`),

  getCash: (params: CashQuery) =>
    request<Paginated<CashTransaction>>(`/api/v1/cash${qs({ ...params })}`),

  getCashSummary: (range: Range) =>
    request<CashSummary>(`/api/v1/cash/summary${qs({ range })}`),
};
