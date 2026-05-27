# Data Model

## Overview

The current application expects two Supabase tables:

- `trades` — stock execution records.
- `cash_transactions` — cash and FX execution records.

The current `README.md` setup SQL only covers part of the expected `trades` schema. The schema below is inferred from the current code and should be used to align the database.

## Table: `trades`

### Purpose

Stores individual stock executions parsed from IBKR `STK` rows.

### Expected Columns

| Column | Type | Required | Source / Meaning |
|---|---:|---:|---|
| `id` | `BIGSERIAL` | No | Internal primary key. |
| `trade_id` | `TEXT` | Yes | Unique stable execution ID. Uses IBKR `TradeID` when available, hash fallback otherwise. |
| `trade_date` | `DATE` | Yes | Date derived from IBKR execution timestamp. |
| `exec_time` | `TIMESTAMPTZ` | Yes | Execution timestamp. Required by Streamlit sorting and grouping. |
| `symbol` | `TEXT` | Yes | Stock symbol. |
| `action` | `TEXT` | Yes | `BUY` or `SELL`. |
| `quantity` | `NUMERIC` | Yes | Absolute execution quantity. |
| `price` | `NUMERIC` | Yes | Execution price. |
| `proceeds` | `NUMERIC` | No | Net cash / proceeds from IBKR. |
| `commission` | `NUMERIC` | No | IBKR commission. |
| `realized_pnl` | `NUMERIC` | No | FIFO realized P&L from IBKR. |
| `currency` | `TEXT` | No | Primary currency, usually `USD`. |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp. |

### Recommended SQL

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

CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_exec_time ON trades(exec_time);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
```

## Table: `cash_transactions`

### Purpose

Stores cash and FX executions parsed from IBKR `CASH` rows.

### Expected Columns

| Column | Type | Required | Source / Meaning |
|---|---:|---:|---|
| `id` | `BIGSERIAL` | No | Internal primary key. |
| `transaction_id` | `TEXT` | Yes | Unique stable cash transaction ID. Uses `cash_` + IBKR `TradeID` when available, hash fallback otherwise. |
| `transaction_date` | `DATE` | Yes | Date derived from execution timestamp or order timestamp. |
| `exec_time` | `TIMESTAMPTZ` | Yes | Execution timestamp used by the dashboard. |
| `symbol` | `TEXT` | Yes | FX pair or cash symbol, for example `USD.ILS` or `ILS.USD`. |
| `description` | `TEXT` | No | IBKR description. |
| `action` | `TEXT` | No | `BUY` or `SELL` when available. |
| `currency` | `TEXT` | No | Primary currency. |
| `quantity` | `NUMERIC` | Yes | Absolute quantity. |
| `rate` | `NUMERIC` | No | FX rate from IBKR `TradePrice`. |
| `net_cash` | `NUMERIC` | No | Net cash from IBKR. |
| `commission` | `NUMERIC` | No | IBKR commission. |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp. |

### Recommended SQL

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

CREATE INDEX IF NOT EXISTS idx_cash_transactions_date ON cash_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_exec_time ON cash_transactions(exec_time);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_symbol ON cash_transactions(symbol);
```

## Future Tables

The AI coaching product will need more structured user input than execution rows.

### `journal_entries`

Purpose: capture user intent, context, and review notes.

Suggested fields:

- `id`
- `trade_group_id`
- `user_id`
- `entry_type` — plan, pre-trade, in-trade, post-trade, weekly review.
- `content`
- `emotion`
- `confidence`
- `created_at`

### `trade_reviews`

Purpose: structured post-trade evaluation.

Suggested fields:

- `id`
- `trade_group_id`
- `followed_plan`
- `mistake_tags`
- `setup_tags`
- `lesson_learned`
- `what_to_repeat`
- `what_to_stop`
- `created_at`

### `ai_coach_insights`

Purpose: store AI-generated observations and recommendations.

Suggested fields:

- `id`
- `user_id`
- `trade_group_id`
- `insight_type`
- `summary`
- `evidence`
- `recommendation`
- `confidence`
- `status` — new, accepted, dismissed, completed.
- `created_at`

### `ai_coach_questions`

Purpose: store AI questions asked to the trader and the answers.

Suggested fields:

- `id`
- `user_id`
- `trade_group_id`
- `question`
- `reason_for_question`
- `answer`
- `status` — open, answered, skipped.
- `created_at`
- `answered_at`

## Data Quality Rules

- Every imported execution must have a stable unique ID.
- Ingestion must be idempotent.
- Timestamps should be stored in a consistent timezone.
- Raw imported CSV files or normalized raw rows should eventually be archived for auditability.
- AI-generated analysis should keep evidence links back to source trades or journal entries.
