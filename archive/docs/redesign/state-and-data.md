# State & Data Strategy — TradeOpsJournal Redesign

> How data flows from Supabase → FastAPI → Next.js, and the exact JSON contracts
> the UI consumes.

---

## 1. Fetching Strategy

### Tooling
- **React Query (TanStack Query)** — the single client cache for all server data.
  Chosen over SWR for richer pagination, `keepPreviousData`, and mutation/invalidation
  ergonomics that the TanStack Table integration benefits from.
- **Typed fetch client** (`lib/api.ts`) — thin wrapper over `fetch` that injects the
  Supabase JWT and base URL. No axios needed.
- **Supabase JS client** — used **only** for auth + realtime + trivial journal writes
  (Path B from `architecture.md`).

### Decision matrix — which source for which data

| Data need | Source | Why |
|---|---|---|
| KPI summary | FastAPI `/metrics/summary` | derived math |
| Equity curve | FastAPI `/metrics/equity-curve` | derived series |
| Grouped trade history | FastAPI `/trades` | grouping + pagination |
| Single trade detail | FastAPI `/trades/{id}` | grouping + executions |
| AI insights | FastAPI `/insights` | LLM orchestration (mock now) |
| Auth/session | Supabase JS | identity |
| Realtime "new trade" | Supabase JS channel | push from ingest |
| Journal note upsert | Supabase JS (or FastAPI `/journal`) | simple CRUD, no math |

### Rendering split (App Router)
- **Server Components** prefetch KPI summary on first load (fast, SEO-irrelevant but
  fast first paint) using React Query's `HydrationBoundary`.
- **Client Components** own anything interactive: TradeTable, DateRangePicker,
  AIInsightPanel.

### Pagination
Server-driven, **cursor-based** for `/trades` (stable under new ingests). React Query
`useInfiniteQuery` or page-index with `keepPreviousData` for the TanStack table.

### Caching defaults
```ts
new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, gcTime: 5*60_000, refetchOnWindowFocus: false },
  },
});
```

### Query keys (`lib/query-keys.ts`)
```ts
export const qk = {
  metrics:  (range: Range) => ["metrics", range] as const,
  equity:   (range: Range) => ["equity", range] as const,
  trades:   (params: TradeQuery) => ["trades", params] as const,
  trade:    (id: string) => ["trade", id] as const,
  insights: (range: Range) => ["insights", range] as const,
};
```

---

## 2. API Endpoints (FastAPI)

| Method | Path | Query params | Returns |
|---|---|---|---|
| GET | `/api/v1/metrics/summary` | `range` | `MetricsSummary` |
| GET | `/api/v1/metrics/equity-curve` | `range`, `interval` | `EquityPoint[]` |
| GET | `/api/v1/trades` | `cursor`, `limit`, `sort`, `dir`, `symbol`, `side`, `result`, `range` | `Paginated<TradeGroup>` |
| GET | `/api/v1/trades/{id}` | — | `TradeGroupDetail` |
| GET | `/api/v1/insights` | `range` | `Insight[]` |
| POST | `/api/v1/journal` | body `JournalUpsert` | `JournalEntry` |

`range` accepts `7d | 30d | 90d | ytd | all` or `from`/`to` ISO dates.

---

## 3. JSON Schemas / TypeScript Interfaces

> These live in `types/index.ts` and mirror FastAPI Pydantic models 1:1.

### Shared
```ts
type Side = "LONG" | "SHORT";
type TradeResult = "WIN" | "LOSS" | "BREAKEVEN";
type Range = "7d" | "30d" | "90d" | "ytd" | "all";

interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
  total: number;
}
```

### `MetricsSummary` (powers KPI cards)
```ts
interface MetricsSummary {
  range: { from: string; to: string };     // ISO
  totalTrades: number;                      // round-trips, not executions
  winRate: number;                          // 0–100
  profitFactor: number;                     // grossProfit / grossLoss
  netRoi: number;                           // 0–100 (% of deployed capital)
  netPnl: number;                           // absolute, base currency
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;                       // per-trade expected value
  maxDrawdown: number;                      // absolute or %
  // deltas vs previous comparable range (for MetricCard.delta)
  deltas: {
    winRate?: number;
    profitFactor?: number;
    netRoi?: number;
    totalTrades?: number;
  };
  currency: string;                         // "USD"
}
```

Example payload:
```json
{
  "range": { "from": "2026-05-01T00:00:00Z", "to": "2026-05-31T23:59:59Z" },
  "totalTrades": 48,
  "winRate": 62.5,
  "profitFactor": 2.13,
  "netRoi": 8.4,
  "netPnl": 4210.55,
  "grossProfit": 7980.10,
  "grossLoss": -3769.55,
  "avgWin": 266.0,
  "avgLoss": -209.4,
  "expectancy": 87.7,
  "maxDrawdown": -1180.25,
  "deltas": { "winRate": 3.1, "profitFactor": 0.22, "netRoi": 1.4, "totalTrades": 6 },
  "currency": "USD"
}
```

### `TradeGroup` (a round-trip; one row in TradeTable)
```ts
interface TradeGroup {
  id: string;                  // stable group id (symbol + entryTime hash)
  symbol: string;
  side: Side;
  status: "OPEN" | "CLOSED";
  result: TradeResult;
  entryTime: string;           // ISO — matches trade_journal.entry_time
  exitTime: string | null;
  qty: number;                 // position size (max)
  avgEntry: number;
  avgExit: number | null;
  netPnl: number;              // after commissions
  realizedPnl: number;         // from IBKR realized_pnl sum
  commission: number;
  returnPct: number;           // trade ROI %
  rMultiple: number | null;    // (pnl / riskAmount) if journal risk set
  holdingMinutes: number | null;
  currency: string;
  // light journal overlay (from trade_journal)
  setup: string | null;
  psychTags: string[];
  hasNotes: boolean;
}
```

### `TradeGroupDetail` (extends `TradeGroup` for /trades/[id])
```ts
interface TradeGroupDetail extends TradeGroup {
  executions: Execution[];     // raw rows from `trades`
  journal: JournalEntry | null;
  markers: TradeMarker[];      // derived buy/sell points for chart
}

interface Execution {
  tradeId: string;             // trades.trade_id
  execTime: string;            // ISO
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  proceeds: number | null;
  commission: number | null;
  realizedPnl: number | null;
}

interface TradeMarker {
  time: number;                // epoch seconds (Lightweight Charts)
  price: number;
  side: "BUY" | "SELL";
  qty: number;
}
```

### `EquityPoint`
```ts
interface EquityPoint {
  t: string;                   // ISO timestamp
  equity: number;              // cumulative net pnl / account equity
  drawdown?: number;
}
```

### `JournalEntry` (maps to `trade_journal` table)
```ts
interface JournalEntry {
  id?: number;
  symbol: string;
  entryTime: string;           // ISO — UNIQUE(symbol, entry_time)
  setup: string | null;
  psychTags: string[];
  notes: string;
  plannedStop: number | null;
  plannedTarget: number | null;
  riskAmount: number | null;
  updatedAt?: string;
}

interface JournalUpsert extends Omit<JournalEntry, "id" | "updatedAt"> {}
```

### `Insight` (AI panel — mock now, real later)
```ts
interface Insight {
  id: string;
  type: "STRENGTH" | "WEAKNESS" | "PATTERN" | "WARNING" | "SUGGESTION";
  title: string;
  summary: string;             // LLM textual analysis
  recommendation?: string;
  confidence: number;          // 0–1
  evidenceTradeIds: string[];  // links back to TradeGroup.id (auditability)
  status: "new" | "accepted" | "dismissed";
  createdAt: string;
}
```

Mock response shape (today):
```json
[
  {
    "id": "mock-1",
    "type": "PATTERN",
    "title": "Overtrading on red days",
    "summary": "Your loss rate climbs to 71% after two consecutive losing trades, suggesting revenge trading.",
    "recommendation": "Set a 2-loss daily stop.",
    "confidence": 0.0,
    "evidenceTradeIds": [],
    "status": "new",
    "createdAt": "2026-05-31T12:00:00Z"
  }
]
```

---

## 4. Hooks (thin React Query wrappers)

```ts
// hooks/use-metrics.ts
export const useMetrics = (range: Range) =>
  useQuery({ queryKey: qk.metrics(range), queryFn: () => api.getMetrics(range) });

// hooks/use-trades.ts
export const useTrades = (params: TradeQuery) =>
  useInfiniteQuery({
    queryKey: qk.trades(params),
    queryFn: ({ pageParam }) => api.getTrades({ ...params, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
    initialPageParam: null,
  });

// hooks/use-insights.ts
export const useInsights = (range: Range) =>
  useQuery({ queryKey: qk.insights(range), queryFn: () => api.getInsights(range) });
```

### Journal mutation (Path B example)
```ts
export const useSaveJournal = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: JournalUpsert) => api.upsertJournal(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trades"] }),
  });
};
```

---

## 5. Global UI State (non-server)

Keep it minimal — most state is server state in React Query.

| State | Tool | Scope |
|---|---|---|
| Theme (dark default) | `next-themes` | app |
| Selected date range | URL search param + small Zustand store | app |
| Sidebar collapsed | `localStorage` + Zustand | app |
| Table sort/filter/page | TanStack Table state (local) + synced to query | page |

> Rule: **server data → React Query**, **ephemeral UI → Zustand/local**, **shareable
> filters → URL search params** so dashboards are linkable.

---

## 6. Data Mapping Notes (Supabase → DTO)

- A **TradeGroup** is built in FastAPI by grouping `trades` rows by `symbol` and the
  session/entry window, FIFO-matching BUY/SELL to derive `avgEntry/avgExit/netPnl`.
  This matches the existing `trade_journal` `UNIQUE(symbol, entry_time)` grouping key.
- `rMultiple` is only non-null when the linked `trade_journal.risk_amount` exists.
- `cash_transactions` (FX) are excluded from trade metrics but can feed a separate
  "Cash & FX" view later; they affect base-currency normalization only.
- `currency` defaults to `USD`; multi-currency normalization happens in FastAPI.
