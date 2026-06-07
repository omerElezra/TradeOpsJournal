# Project Status

**Last updated:** June 2026

## Current State

TradeOpsJournal is a working Next.js web application deployed to Vercel, backed by Supabase. The original Streamlit UI and the intermediate FastAPI backend have been replaced.

## Repository Structure

| Path | Role |
|---|---|
| `frontend/` | Next.js 14 app — API routes + React UI |
| `frontend/app/api/v1/` | Server-side route handlers (replaces FastAPI) |
| `frontend/lib/domain/` | Pure TypeScript trade grouping + metric logic |
| `frontend/lib/queries/` | Supabase read/write functions |
| `frontend/lib/supabase/server.ts` | Admin Supabase client (server-only) |
| `frontend/components/` | React UI components |
| `scripts/ingest.py` | Gmail → IBKR CSV → Supabase ingestion |
| `scripts/get_gmail_token.py` | One-time Gmail OAuth token helper |
| `scripts/run_migration.py` | Apply SQL migrations via Supabase API |
| `scripts/migrations/` | DDL migrations for Supabase |
| `.github/workflows/daily_ingest.yml` | Daily ingestion GitHub Actions workflow |
| `requirements.txt` | Python deps for ingestion scripts |
| `archive/` | Superseded code (Streamlit, FastAPI, Docker) |

## Implemented Functionality

### Ingestion

- Gmail OAuth2 authentication via refresh token.
- Searches for IBKR Activity Flex CSV emails.
- Parses STK (stock) and CASH (FX/cash) execution rows.
- Handles IBKR timestamp formats including EDT/EST/UTC suffixes and DD/MM/YYYY.
- Deduplicates via `trade_id` / `transaction_id` on upsert.
- Runs automatically Mon–Fri at 08:00 UTC via GitHub Actions.

### Domain Logic (server-side TypeScript)

- FIFO round-trip trade grouping by symbol.
- Win rate, gross profit/loss, profit factor.
- Net P&L, average win/loss, expectancy.
- Net ROI, max drawdown.
- Equity curve (cumulative P&L over time).
- R-multiple (net P&L / planned risk, when journal has risk amount).
- Holding time in minutes.

### API Layer

All routes under `/api/v1/`:

| Route | Status |
|---|---|
| `GET /metrics/summary` | Working |
| `GET /metrics/equity-curve` | Working |
| `GET /trades` | Working — pagination, sort, filter by symbol/side/result |
| `GET /trades/:id` | Working — includes executions, markers, journal |
| `GET /executions` | Working — paginated raw fills |
| `GET /cash` | Working — paginated cash transactions |
| `GET /cash/summary` | Working |
| `POST /journal` | Working — upserts journal entry |
| `GET /insights` | Stub — returns empty array |

### UI

- Dashboard with KPI row and equity curve card.
- Trade table with sort and filter controls.
- Trade detail page with execution breakdown.
- Cash / transactions page.
- Journal entry editing per trade.
- PWA manifest — installable to phone home screen via "Add to Home Screen".
- Dark theme, responsive layout.

## Known Gaps

| Area | Status |
|---|---|
| Authentication | Not implemented. App is unprotected — keep URL private or use Vercel password protection. |
| Equity curve chart | `EquityCurveCard` renders placeholder — Recharts not yet installed. |
| AI insights | `/api/v1/insights` returns empty array. No AI backend exists yet. |
| Journal UI completeness | Basic journal fields work; full review flow (screenshots, post-trade analysis) not built. |
| PWA icons | `public/icons/icon-192.png` and `icon-512.png` placeholder paths referenced in manifest — actual icon files not yet added. |
| Short selling | Trade grouping assumes long trades. Shorts may not group correctly. |
| Options / multi-leg | Not supported in grouping or metrics. |
