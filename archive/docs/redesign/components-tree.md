# Component Tree — TradeOpsJournal Redesign

> React component hierarchy, Shadcn UI dependencies, and custom component contracts.

---

## 1. Shadcn UI Components to Install

```bash
npx shadcn@latest init        # dark theme, zinc base, CSS variables

npx shadcn@latest add \
  button card badge table tabs separator skeleton \
  dropdown-menu select input checkbox \
  sheet tooltip avatar scroll-area sonner \
  dialog popover calendar command pagination
```

| Shadcn primitive | Used by |
|---|---|
| `card`, `badge`, `separator` | MetricCard, panels, layout |
| `table` | (styling base under TanStack) TradeTable |
| `dropdown-menu`, `select`, `checkbox`, `input` | TableToolbar filters, column visibility |
| `popover` + `calendar` | DateRangePicker |
| `command` | global search (⌘K) |
| `sheet` | mobile sidebar |
| `tabs` | Analytics / detail views |
| `skeleton` | all loading states |
| `tooltip`, `avatar`, `scroll-area` | topbar, AI panel |
| `sonner` | "new trade synced" toasts |
| `dialog` | journal note editor |
| `pagination` | TradeTable footer |

---

## 2. Component Hierarchy

```
<RootLayout>                          # providers: Theme, QueryClient, Sonner
└─ <DashboardLayout>
   ├─ <Sidebar>
   │  ├─ <SidebarBrand/>
   │  ├─ <SidebarNav>
   │  │  └─ <SidebarNavItem/> (x N)
   │  └─ <SidebarFooter/>          # settings, collapse toggle
   ├─ <Topbar>
   │  ├─ <SidebarTrigger/>         # mobile Sheet open
   │  ├─ <DateRangePicker/>        # drives global query range
   │  ├─ <GlobalSearch/>           # ⌘K command
   │  ├─ <SyncStatusBadge/>        # last ingest time / live
   │  └─ <UserMenu/>
   └─ <main>
      └─ {page}

# ---- Page: Dashboard Overview (/) ----
<DashboardPage>
├─ <KpiRow>
│  ├─ <MetricCard/>  (Win Rate)
│  ├─ <MetricCard/>  (Profit Factor)
│  ├─ <MetricCard/>  (Net ROI)
│  └─ <MetricCard/>  (Total Trades)
├─ <OverviewMainRow>
│  ├─ <EquityCurveCard/>          # chart placeholder
│  └─ <AIInsightPanel/>           # mock empty-state
└─ <TradeTable/>                  # compact variant

# ---- Page: Trades (/trades) ----
<TradesPage>
└─ <TradeTable/>                  # full variant
   ├─ <TableToolbar>
   │  ├─ <TableSearch/>
   │  ├─ <TableFacetFilter/> (symbol, side, result)
   │  ├─ <DateRangePicker/>
   │  └─ <ColumnVisibilityMenu/>
   ├─ <DataTable/>                # TanStack <-> Shadcn table
   │  ├─ <DataTableHeader/>       # sortable headers
   │  ├─ <DataTableRow/>          # -> <PnLCell/>, <SideBadge/>, <SymbolCell/>
   │  └─ <DataTableEmpty/> / <DataTableSkeleton/>
   └─ <DataTablePagination/>

# ---- Page: Trade Detail (/trades/[id]) ----
<TradeDetailPage>
├─ <TradeSummaryHeader/>          # symbol, R-multiple, net pnl
├─ <TradeChartCard/>              # placeholder w/ buy/sell marker slot
├─ <ExecutionList/>               # raw executions in the round-trip
└─ <JournalEditor/>               # notes, tags, setup, planned stop/target

# ---- Page: Insights (/insights) ----
<InsightsPage>
└─ <AIInsightPanel variant="full"/>
   └─ <InsightCard/> (x N)
```

---

## 3. Custom Component Contracts

### `<MetricCard/>`
```ts
interface MetricCardProps {
  label: string;                 // "Win Rate"
  value: string;                 // pre-formatted by caller: "62.4%"
  delta?: number;                // +/- vs previous range, e.g. 3.1
  deltaLabel?: string;           // "vs prev 30d"
  intent?: "positive" | "negative" | "neutral"; // accent color
  icon?: React.ReactNode;
  sparkline?: number[];          // optional mini-trend (future)
  isLoading?: boolean;           // -> <Skeleton/>
}
```

### `<TradeTable/>`
```ts
interface TradeTableProps {
  variant?: "compact" | "full";  // overview vs /trades
  initialFilters?: TradeFilters;
  pageSize?: number;             // default 25
}
// Internally owns TanStack table state + React Query.
// Renders TableToolbar, DataTable, DataTablePagination.
```

### `<DataTable/>` (generic, reusable)
```ts
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  pageCount: number;             // server-driven pagination
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
}
```

### `<PnLCell/>` / `<SideBadge/>`
```ts
interface PnLCellProps { value: number; currency?: string; showSign?: boolean; }
interface SideBadgeProps { side: "LONG" | "SHORT"; }
```

### `<EquityCurveCard/>`
```ts
interface EquityCurveCardProps {
  series?: EquityPoint[];        // [{ t: ISOString, equity: number }]
  isLoading?: boolean;
  // Renders a fixed-height card; mounts Lightweight Charts later via internal ref.
}
```

### `<TradeChartCard/>` (detail)
```ts
interface TradeChartCardProps {
  symbol: string;
  candles?: Candle[];            // future OHLC feed
  markers?: TradeMarker[];       // buy/sell points from executions
  isLoading?: boolean;
}
interface TradeMarker { time: number; price: number; side: "BUY" | "SELL"; qty: number; }
```

### `<AIInsightPanel/>`
```ts
interface AIInsightPanelProps {
  variant?: "compact" | "full";
  insights?: Insight[];          // empty -> friendly empty-state
  isLoading?: boolean;
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
}
```

### `<InsightCard/>`
```ts
interface InsightCardProps {
  insight: Insight;              // see state-and-data.md
  onAccept?: (id: string) => void;
  onDismiss?: (id: string) => void;
}
```

### `<DateRangePicker/>`
```ts
interface DateRangePickerProps {
  value: { from: Date; to: Date };
  onChange: (range: { from: Date; to: Date }) => void;
  presets?: ("7d" | "30d" | "90d" | "YTD" | "ALL")[];
}
```

### `<JournalEditor/>`
```ts
interface JournalEditorProps {
  tradeGroupId: string;
  initial?: JournalEntry;        // notes, psychTags, setup, plannedStop/Target, riskAmount
  onSaved?: (entry: JournalEntry) => void;  // upserts via Supabase (Path B)
}
```

### `<SyncStatusBadge/>`
```ts
interface SyncStatusBadgeProps {
  lastSyncAt?: string;           // ISO; from latest created_at
  status: "live" | "stale" | "error";
}
```

---

## 4. Suggested Frontend Folder Structure

```
frontend/
  app/                          # routes (see ui-layout-and-routing.md)
  components/
    layout/   (Sidebar, Topbar, ...)
    metrics/  (MetricCard, KpiRow)
    table/    (TradeTable, DataTable, cells, toolbar)
    charts/   (EquityCurveCard, TradeChartCard)
    ai/       (AIInsightPanel, InsightCard)
    journal/  (JournalEditor)
    ui/       (shadcn-generated primitives)
  lib/
    api.ts            # typed FastAPI client
    supabase.ts       # browser client (Path B)
    query-keys.ts     # React Query keys
    format.ts         # currency/percent/number formatters
  types/
    index.ts          # shared interfaces (see state-and-data.md)
  hooks/
    use-metrics.ts
    use-trades.ts
    use-insights.ts
```
