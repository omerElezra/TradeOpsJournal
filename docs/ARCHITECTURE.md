# Architecture

## Overview

TradeOpsJournal is a single-user private trading journal. There is no separate backend service — the Next.js app handles both the UI and the server-side API.

```
IBKR CSV → Gmail → GitHub Actions → scripts/ingest.py → Supabase
                                                              │
                                              Next.js (Vercel)
                                              /api/v1/* route handlers
                                              lib/domain/ (server-only TS)
                                                              │
                                              React UI (browser / PWA)
```

## Components

### Ingestion pipeline

**File:** `scripts/ingest.py`

Runs daily via GitHub Actions (Mon–Fri 08:00 UTC). Also runnable locally.

- Authenticates to Gmail via OAuth2 refresh token.
- Searches for IBKR Activity Flex CSV emails.
- Downloads and parses STK (stock) and CASH (FX/cash) execution rows.
- Deduplicates using `trade_id` / `transaction_id`.
- Upserts records into Supabase (`trades`, `cash_transactions`).

### Supabase database

Stores all raw data. Three tables are used by the app:

| Table | Contents |
|---|---|
| `trades` | Individual stock execution fills from IBKR |
| `cash_transactions` | Cash and FX execution rows from IBKR |
| `trade_journal` | User-written journal notes per trade group |

See [`DATA_MODEL.md`](DATA_MODEL.md) for full schema.

### Next.js application (`frontend/`)

Deployed to Vercel. No Docker, no separate backend.

**API route handlers** (`frontend/app/api/v1/`):

| Route | Purpose |
|---|---|
| `GET /api/v1/metrics/summary` | KPI summary for a date range |
| `GET /api/v1/metrics/equity-curve` | Equity curve data points |
| `GET /api/v1/trades` | Paginated grouped trade list |
| `GET /api/v1/trades/:id` | Single trade detail with executions |
| `GET /api/v1/executions` | Raw execution fills (paginated) |
| `GET /api/v1/cash` | Cash transactions (paginated) |
| `GET /api/v1/cash/summary` | Cash summary metrics |
| `POST /api/v1/journal` | Upsert journal entry for a trade |
| `GET /api/v1/insights` | AI insights (stub — returns empty for now) |

**Server-only domain logic** (`frontend/lib/domain/`):

| Module | Purpose |
|---|---|
| `grouping.ts` | FIFO round-trip trade grouping from raw executions |
| `metrics.ts` | Win rate, profit factor, ROI, equity curve, max drawdown, etc. |
| `ranges.ts` | Date range resolution (7d / 30d / 90d / ytd / all) |
| `models.ts` | Internal TypeScript types for domain objects |

All `lib/domain/` files are marked `import "server-only"` — they never run in the browser.

**Supabase client** (`frontend/lib/supabase/server.ts`):

Uses the service role key, server-side only. Never exposed to the browser.

**React UI** (`frontend/components/`, `frontend/app/(dashboard)/`):

Client-side display only. Uses TanStack Query to fetch from the `/api/v1/*` routes.

## Data Flow

```
Browser (React)
  │  TanStack Query → GET /api/v1/metrics/summary
  ▼
Next.js Route Handler (server)
  │  resolveRange()
  │  loadGroups(start, end)
  │    ├── fetchExecutions() → Supabase trades table
  │    └── fetchJournalMap() → Supabase trade_journal table
  │  groupExecutions() → FIFO grouping
  │  calculateMetrics() → KPI numbers
  └→ NextResponse.json(summary)
  ▼
Browser renders KPI cards
```

## Deployment

| Layer | Service | Cost |
|---|---|---|
| Web app | Vercel Hobby | Free |
| Database + Auth | Supabase Free | Free |
| Ingestion cron | GitHub Actions | Free |

No VPS, no Docker, no backend hosting needed.

## What does NOT exist yet

- Authentication (Supabase Auth / login screen). Currently anyone with the URL can read the app. Protect by keeping the Vercel deployment URL private or adding Vercel password protection.
- AI insights backend. The `/api/v1/insights` route returns an empty array placeholder.
- Mobile push notifications.
- Chart library for equity curve visualization (Recharts not yet installed — the `EquityCurveCard` component renders a placeholder).
