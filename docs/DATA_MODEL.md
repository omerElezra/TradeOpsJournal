# Data Model

## Overview

Three Supabase tables are used by the current application:

| Table | Role |
|---|---|
| `trades` | Individual stock execution fills (from IBKR ingestion) |
| `cash_transactions` | Cash and FX execution rows (from IBKR ingestion) |
| `trade_journal` | User journal notes per trade group (written from the UI) |

---

## Table: `trades`

Stores individual stock execution fills parsed from IBKR `STK` rows.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | — | Internal PK |
| `trade_id` | `TEXT` UNIQUE | Yes | Stable execution ID — IBKR `TradeID` or hash fallback |
| `trade_date` | `DATE` | Yes | Date from execution timestamp |
| `exec_time` | `TIMESTAMPTZ` | Yes | Execution timestamp — used for grouping and sorting |
| `symbol` | `TEXT` | Yes | Stock symbol |
| `action` | `TEXT` | Yes | `BUY` or `SELL` |
| `quantity` | `NUMERIC` | Yes | Absolute execution quantity |
| `price` | `NUMERIC` | Yes | Execution price |
| `proceeds` | `NUMERIC` | No | Net cash proceeds from IBKR |
| `commission` | `NUMERIC` | No | IBKR commission |
| `realized_pnl` | `NUMERIC` | No | FIFO realized P&L from IBKR |
| `currency` | `TEXT` | No | Currency, default `USD` |
| `source` | `TEXT` | Yes | `ibkr` (CSV ingest) or `manual` (UI entry), default `ibkr` |
| `content_hash` | `TEXT` | Yes | `SHA256(exec_time\|symbol\|quantity\|price)[:32]` — non-unique dedup fingerprint shared with `ingest.py`; lets ingest merge a manual row instead of duplicating it |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp |

```sql
CREATE TABLE IF NOT EXISTS trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_id        TEXT UNIQUE NOT NULL,
  trade_date      DATE NOT NULL,
  exec_time       TIMESTAMPTZ NOT NULL,
  symbol          TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  quantity        NUMERIC NOT NULL,
  price           NUMERIC NOT NULL,
  proceeds        NUMERIC,
  commission      NUMERIC,
  realized_pnl    NUMERIC,
  currency        TEXT DEFAULT 'USD',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_exec_time ON trades(exec_time);
CREATE INDEX IF NOT EXISTS idx_trades_symbol    ON trades(symbol);
```

---

## Table: `cash_transactions`

Stores cash and FX execution rows from IBKR `CASH` rows.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | — | Internal PK |
| `transaction_id` | `TEXT` UNIQUE | Yes | Stable ID — `cash_` + IBKR `TradeID` or hash fallback |
| `transaction_date` | `DATE` | Yes | Date from timestamp |
| `exec_time` | `TIMESTAMPTZ` | Yes | Execution timestamp |
| `symbol` | `TEXT` | Yes | FX pair, e.g. `USD.ILS` |
| `description` | `TEXT` | No | IBKR description |
| `action` | `TEXT` | No | `BUY` / `SELL` when available |
| `currency` | `TEXT` | No | Primary currency |
| `quantity` | `NUMERIC` | Yes | Absolute quantity |
| `rate` | `NUMERIC` | No | FX rate from IBKR `TradePrice` |
| `net_cash` | `NUMERIC` | No | Net cash from IBKR |
| `commission` | `NUMERIC` | No | IBKR commission |
| `source` | `TEXT` | Yes | `ibkr` or `manual`, default `ibkr` |
| `content_hash` | `TEXT` | Yes | `SHA256(exec_time\|symbol\|quantity\|rate)[:32]` — non-unique dedup fingerprint shared with `ingest.py` |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp |

```sql
CREATE TABLE IF NOT EXISTS cash_transactions (
  id                BIGSERIAL PRIMARY KEY,
  transaction_id    TEXT UNIQUE NOT NULL,
  transaction_date  DATE NOT NULL,
  exec_time         TIMESTAMPTZ NOT NULL,
  symbol            TEXT NOT NULL,
  description       TEXT,
  action            TEXT,
  currency          TEXT,
  quantity          NUMERIC NOT NULL,
  rate              NUMERIC,
  net_cash          NUMERIC,
  commission        NUMERIC,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_transactions_exec_time ON cash_transactions(exec_time);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_symbol    ON cash_transactions(symbol);
```

---

## Table: `trade_journal`

Stores per-trade journal notes written from the UI. Each row maps to one grouped trade, identified by `(symbol, entry_time)` — the same key used by the trade grouping algorithm.

Migration: `scripts/migrations/001_trade_journal.sql` + `002_journal_risk_fields.sql`

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | — | Internal PK |
| `symbol` | `TEXT` | Yes | Stock symbol |
| `entry_time` | `TIMESTAMPTZ` | Yes | `exec_time` of first execution in the group |
| `setup` | `TEXT` | No | Setup label (e.g. "breakout", "pullback") |
| `psych_tags` | `TEXT[]` | No | Psychological tags array |
| `notes` | `TEXT` | No | Free-text notes |
| `planned_stop` | `NUMERIC` | No | Planned stop price (for R-multiple) |
| `planned_target` | `NUMERIC` | No | Planned target price |
| `risk_amount` | `NUMERIC` | No | Dollar risk — used to compute R-multiple |
| `updated_at` | `TIMESTAMPTZ` | No | Last write timestamp |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp |

Unique constraint: `(symbol, entry_time)` — upsert uses this as the conflict key.

```sql
-- See scripts/migrations/001_trade_journal.sql
-- See scripts/migrations/002_journal_risk_fields.sql
```

---

## Future Tables

### `ai_insights`

Purpose: store AI-generated observations per trade or period.

Suggested fields: `id`, `trade_group_id`, `type` (STRENGTH / WEAKNESS / PATTERN / WARNING), `title`, `summary`, `recommendation`, `confidence`, `evidence_trade_ids`, `status` (new / accepted / dismissed), `created_at`.

### `user_settings`

Purpose: per-user preferences.

Suggested fields: `user_id`, `base_currency`, `default_range`, `created_at`.
