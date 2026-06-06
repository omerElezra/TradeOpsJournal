# TradeOps Journal — Frontend

Next.js 14 (App Router) + React 18 + TypeScript + Tailwind + TanStack Query/Table.
Dark-mode-first, minimalist trading dashboard. The frontend renders only — **all
metrics are calculated by the FastAPI backend**.

## Stack

- **Next.js 14** App Router, **React 18**, **TypeScript**
- **Tailwind CSS** + hand-added shadcn-style primitives (`components/ui/`)
- **TanStack Query** (server state) + **TanStack Table** (trade grid)
- **next-themes** (dark default), **lucide-react** icons, JetBrains Mono

> shadcn primitives were added manually (no CLI / network in this environment).
> When online you can re-sync them with `npx shadcn@latest add ...` if desired.

## Getting started

```bash
cd frontend
npm install          # run when network is available
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

Set the API base in `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The backend (`../backend`) must be running for data to load:

```bash
cd ../backend
pip install -r ../requirements.txt   # run when network is available
uvicorn app.main:app --reload        # http://localhost:8000
```

## Structure

```
app/
  (dashboard)/
    layout.tsx           # sidebar + topbar + RangeProvider
    page.tsx             # Overview: KPIs · equity + AI · trade table
    trades/page.tsx      # full trade history
    trades/[tradeId]/    # trade detail (executions + chart slot)
    analytics/ journal/ insights/ settings/   # placeholders
  layout.tsx             # root: theme + query providers
  globals.css            # dark-first design tokens
components/
  layout/                # sidebar, topbar
  metrics/               # metric-card, kpi-row
  charts/                # equity-curve-card (TradingView slot)
  ai/                    # ai-insight-panel
  table/                 # trade-table, columns, cells
  ui/                    # card, badge, button, skeleton, table
  range-context.tsx      # global date-range selector
hooks/                   # use-metrics, use-trades
lib/                     # api client, format, utils, query-keys
types/                   # DTOs mirroring backend (camelCase)
```

## Data flow

- **Analytics path:** Next.js → FastAPI → Supabase (KPIs, equity, trades, insights).
- **Direct path (future):** Next.js → Supabase JS for auth / realtime / journal CRUD.

The frontend never computes a metric — it requests them from `/api/v1/*`.
