# Project Status

## Current State

TradeOpsJournal is a Python-based automated trading journal for IBKR activity statements.

The current implementation supports:

- Gmail ingestion of IBKR Activity Flex CSV attachments.
- Parsing stock execution rows from IBKR CSV files.
- Parsing cash / FX execution rows from IBKR CSV files.
- Deduplicated upsert into Supabase.
- A Streamlit dashboard for P&L, trade grouping, executions, and cash/FX transactions.
- Daily scheduled ingestion through GitHub Actions.

## Repository Structure

| Path | Role |
|---|---|
| `app/streamlit_app.py` | Streamlit UI and analytics logic. |
| `scripts/ingest.py` | Gmail → IBKR CSV parsing → Supabase ingestion pipeline. |
| `scripts/get_gmail_token.py` | One-time local Gmail OAuth refresh-token helper. |
| `scripts/migrations/001_trade_journal.sql` | DDL migration that creates the `trade_journal` table. |
| `scripts/run_migration.py` | Helper to apply SQL migrations via the Supabase Management API. |
| `.github/workflows/daily_ingest.yml` | Daily and manual GitHub Actions ingestion workflow. |
| `requirements.txt` | Python runtime dependencies. |
| `.env.example` | Required local environment variable template. |
| `README.md` | Quick-start setup instructions. |

## Implemented Functionality

### Ingestion

- Authenticates to Gmail using OAuth2 refresh-token credentials.
- Searches Gmail for messages from `Info@inter-il.com` with subject `Activity Flex`, attachments, and a configurable lookback window.
- Paginates Gmail results with up to 500 messages per page.
- Downloads the first CSV attachment from each matching email.
- Parses common IBKR CSV encodings: UTF-8, Latin-1, and CP1252.
- Handles IBKR timestamp strings with timezone suffixes such as `EDT`, `EST`, and `UTC`.
- Separates `STK` executions from `CASH` executions.
- Generates stable unique IDs using IBKR `TradeID` when available, with hash fallback.
- Upserts stock trades into `trades` using `trade_id` conflict handling.
- Upserts cash/FX transactions into `cash_transactions` using `transaction_id` conflict handling.
- Prints detailed ingestion summaries for local runs and GitHub Actions logs.

### Streamlit Dashboard

- Reads Supabase data with a five-minute cache.
- Supports date filtering: all time, today, this week, this month, YTD, or custom range.
- Displays overview metrics:
  - Gross P&L
  - Commission
  - Net P&L
  - Win rate
  - Closed trades count
  - Average P&L per closed trade
  - Best day
  - Worst day
- Displays charts:
  - Daily P&L bar chart
  - Equity curve
  - P&L by symbol
- Groups executions into full trades by symbol and position closure.
- Shows open and closed trade status.
- Shows execution-level details for every grouped trade.
- Shows all executions in a sortable table.
- Shows cash/FX transaction metrics and inferred USD/ILS movement.
- Displays per-trade journaling controls inside each trade expander: setup selection, psychological tags, and free-text notes persisted to Supabase.

### Automation

- GitHub Actions runs ingestion Monday-Friday at 08:00 UTC.
- Manual workflow dispatch supports configurable `days_back` and `timeout_minutes`.
- Workflow uses Python 3.11 and pip dependency caching.

## Current Limitations

| Area | Limitation |
|---|---|
| Database alignment | The documentation now includes the expected schema, but the live Supabase project still needs to be verified or migrated to include `exec_time` and `cash_transactions`. |
| Authentication | Streamlit currently uses `SUPABASE_SERVICE_KEY`; this is acceptable only in trusted server-side environments and must not be exposed to browsers. |
| Trade grouping | Trade grouping is position-based per symbol and may not fully support shorts, partial exits, options, multi-leg strategies, or complex scaling behavior. |
| AI coaching | No AI, question generation, or behavioral feedback loop exists yet. |
| User input | The journal captures setup, psych tags, and notes per trade. Screenshots, plan thesis, and post-trade reviews are not yet supported. |
| Testing | No automated tests are currently present. |
| Packaging | No `pyproject.toml`, app factory, or formal module structure exists yet. |

## Immediate Recommended Fixes

1. Update Supabase schema to match the current code.
2. Add automated tests for parsing, transformation, ID generation, and trade grouping.
3. Split Streamlit UI, Supabase access, trade analytics, and formatting helpers into modules.
4. Add AI coaching questions once sufficient journal entries are collected to provide meaningful context.
5. Move toward a secure web architecture where privileged Supabase keys are used only server-side.

## Current Development Priority

The project should first become a reliable structured trading journal. The AI coach should be added after the system captures enough context about each trade to evaluate decision quality.
