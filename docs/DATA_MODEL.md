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

Stores per-trade journal input written from the UI. Each row maps to one grouped
(round-trip) trade, identified by `(symbol, entry_time)` — the same key the
trade grouping algorithm (`lib/domain/grouping.ts`) produces from raw
executions. All journal fields live at the **trade level** — there is no
per-execution journaling. This was an explicit design decision: the trader
prioritizes zero-friction journaling for the common single-entry/single-exit
trade over capturing granular per-fill psychology.

Migrations: `001_trade_journal.sql`, `002_journal_risk_fields.sql`,
`007_journal_details.sql`, `008_journal_group_snapshot.sql`.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `BIGSERIAL` | — | Internal PK |
| `symbol` | `TEXT` | Yes | Stock symbol |
| `entry_time` | `TIMESTAMPTZ` | Yes | `exec_time` of first execution in the group |
| `group_id` | `TEXT` | No | Snapshot of the computed round-trip group id (see [Linking a journal to its trades](#linking-a-journal-to-its-trades)) |
| `execution_ids` | `TEXT[]` | No | Snapshot of `trades.trade_id` for every fill in the group |
| **Pre-entry checklist** | | | |
| `candle_pattern` | `TEXT` | No | e.g. Hammer, Doji, Bullish/Bearish Engulfing — free text, "Other…" supported in UI |
| `recent_trend` | `TEXT` | No | Up / Down / Consolidating |
| `volume_vs_trend` | `TEXT` | No | Volume supports trend / dropping / climax |
| `ma_relation` | `TEXT[]` | No | Multi-select MA conditions (Above MA20, Reclaiming MA20, …) |
| `open_gaps` | `TEXT[]` | No | Multi-select gap conditions |
| `support_res_fib` | `TEXT[]` | No | Multi-select S/R/Fibonacci conditions |
| **Planning & setup** | | | |
| `setup` | `TEXT` | No | Setup label (VCP, Breakout, Pullback, …) |
| `planned_stop` | `NUMERIC` | No | Planned stop price (used for R-multiple) |
| `planned_target` | `NUMERIC` | No | Planned target price |
| `risk_amount` | `NUMERIC` | No | Dollar risk — used to compute R-multiple |
| `conviction_level` | `INTEGER` | No | 1–10 confidence at entry (`CHECK` constrained) |
| **Execution & psychology** | | | |
| `entry_reason` | `TEXT` | No | Why the trade was entered |
| `exit_reason` | `TEXT` | No | Why the trade was exited |
| `psych_tags` | `TEXT[]` | No | Emotions during the trade (Calm, FOMO, Anxiety, …) |
| **Review** | | | |
| `trade_score` | `INTEGER` | No | 1–10 execution discipline (`CHECK` constrained) |
| `mistakes_tags` | `TEXT[]` | No | Mistake tags (Chasing market, Overtrading, …) |
| `notes` | `TEXT` | No | Free-text notes / trade story |
| **AI coaching (reserved)** | | | |
| `ai_coaching_question` | `TEXT` | No | Open question from the AI coach, awaiting a user answer |
| `ai_conversation` | `JSONB` | No | Full AI coaching exchange for this trade |
| `updated_at` | `TIMESTAMPTZ` | No | Last write timestamp — refreshed on every save |
| `created_at` | `TIMESTAMPTZ` | No | Insert timestamp |

Unique constraint: `(symbol, entry_time)` — upsert uses this as the conflict key.

```sql
-- See scripts/migrations/001_trade_journal.sql
-- See scripts/migrations/002_journal_risk_fields.sql
-- See scripts/migrations/007_journal_details.sql
-- See scripts/migrations/008_journal_group_snapshot.sql
```

### Linking a journal to its trades

`trades` rows are individual execution fills; a "trade" the user journals is a
computed round-trip (one or more fills that net a position to zero), produced
at request time by `groupExecutions()`. There is no persisted trade-group
table — grouping is pure, deterministic math over `trades`, so materializing
it would mean keeping a derived table in sync on every ingest run for no
benefit in a single-user app.

Instead, `POST /api/v1/journal` recomputes the group for `(symbol, entry_time)`
on every save and stores a **snapshot**:

- `group_id` — the same id `GET /api/v1/trades/:id` uses, letting a journal
  row be correlated with the API's trade detail without recomputation.
- `execution_ids` — the `trade_id`s of every fill currently in that group.

This makes `trade_journal` self-sufficient for direct SQL analysis (e.g. for
the AI coach, or ad-hoc queries) without re-running the grouping algorithm:

```sql
SELECT j.*, t.*
FROM trade_journal j
JOIN trades t ON t.trade_id = ANY(j.execution_ids)
WHERE j.symbol = 'NVDA'
ORDER BY t.exec_time;
```

The snapshot is refreshed on every save, so it can lag if new fills join an
already-journaled trade before the next save (e.g. scaling into an open
position). The derived grouping in `lib/domain/grouping.ts` remains the
source of truth for trade numbers; the snapshot is a convenience join key.

---

## Future Tables

### `ai_insights`

Purpose: store AI-generated observations per trade or period.

Suggested fields: `id`, `trade_group_id`, `type` (STRENGTH / WEAKNESS / PATTERN / WARNING), `title`, `summary`, `recommendation`, `confidence`, `evidence_trade_ids`, `status` (new / accepted / dismissed), `created_at`.

### `user_settings`

Purpose: per-user preferences.

Suggested fields: `user_id`, `base_currency`, `default_range`, `created_at`.
