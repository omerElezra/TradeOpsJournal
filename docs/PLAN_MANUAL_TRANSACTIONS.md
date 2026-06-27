# Manual Transactions — Implementation Plan

Add the ability to create and delete transactions directly from the UI for both **trades** and **cash transactions**, with full deduplication against the daily IBKR CSV ingest workflow.

---

## Problem

The daily GitHub Actions workflow ingests trades and cash transactions from IBKR Activity Flex CSV emails and upserts them to Supabase using `trade_id` / `transaction_id` as the unique key. These IDs are either the IBKR TradeID (when present) or a SHA256 fallback hash.

A manually entered row has no IBKR TradeID, so it uses the fallback hash. When the same row later arrives via IBKR CSV, it carries the real IBKR TradeID — a different value — and the upsert creates a **duplicate row**.

---

## Solution: `content_hash` as a Secondary Unique Key

Add a `content_hash` column to both tables, computed identically by both the UI and `ingest.py`:

| Table | Formula |
|---|---|
| `trades` | `SHA256(exec_time_utc \| symbol \| quantity \| price)[:32]` |
| `cash_transactions` | `SHA256(exec_time_utc \| symbol \| quantity \| rate)[:32]` |

`content_hash` becomes the stable dedup fingerprint. The existing primary IDs (`trade_id`, `transaction_id`) keep working as before.

When `ingest.py` encounters a `content_hash` that already exists with `source='manual'`, it **merges** — updating the primary ID to the real IBKR value and flipping `source` to `'ibkr'` — instead of inserting a duplicate.

---

## Features

1. **Bulk add** — open a sheet with a table of rows; add/remove rows inline; submit all at once. Available for both trades and cash transactions.
2. **Delete** — trash icon on each row; hard delete from DB; warn if the row is IBKR-sourced (it will re-appear on next sync). Available for both tables.

---

## Build Order

```
1. Migration 003              — schema changes for both tables
2. ingest.py                  — hash + merge logic for both tables
3. POST /api/v1/trades/manual — bulk trade insert
4. DELETE /api/v1/trades/[id] — delete trade
5. POST /api/v1/cash/manual   — bulk cash insert
6. DELETE /api/v1/cash/[id]   — delete cash transaction
7. UI — bulk add trades sheet
8. UI — delete trades + confirm
9. UI — bulk add cash sheet
10. UI — delete cash + confirm
```

---

## Step 1 — DB Migration `003_manual_trades.sql`

File: `scripts/migrations/003_manual_trades.sql`

```sql
-- ── trades ─────────────────────────────────────────────────────────────────
ALTER TABLE trades ADD COLUMN source TEXT NOT NULL DEFAULT 'ibkr';
ALTER TABLE trades ADD COLUMN content_hash TEXT;

UPDATE trades
SET content_hash = encode(
  sha256(
    (exec_time::text || '|' || symbol || '|' || quantity::text || '|' || price::text)::bytea
  ),
  'hex'
)
WHERE content_hash IS NULL;

ALTER TABLE trades ALTER COLUMN content_hash SET NOT NULL;
-- NOT unique: same-instant partial fills can share identical economics but have
-- distinct IBKR TradeIDs. Index is a lookup for the merge step only.
CREATE INDEX idx_trades_content_hash ON trades(content_hash);


-- ── cash_transactions ───────────────────────────────────────────────────────
ALTER TABLE cash_transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'ibkr';
ALTER TABLE cash_transactions ADD COLUMN content_hash TEXT;

-- rate may be NULL for older rows; fall back to quantity-only hash in that case
UPDATE cash_transactions
SET content_hash = encode(
  sha256(
    (exec_time::text || '|' || symbol || '|' || quantity::text || '|' || COALESCE(rate::text, '0'))::bytea
  ),
  'hex'
)
WHERE content_hash IS NULL;

ALTER TABLE cash_transactions ALTER COLUMN content_hash SET NOT NULL;
CREATE INDEX idx_cash_transactions_content_hash ON cash_transactions(content_hash);
```

Run via: `python scripts/run_migration.py`

---

## Step 2 — `ingest.py` Changes

### 2a. Trades: compute `content_hash` + `source` for every row

In `transform_trades` (after `exec_time` is parsed):

```python
def make_trade_content_hash(row):
    key = f"{row['exec_time']}|{row['symbol']}|{row['quantity']}|{row['price']}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]

df["content_hash"] = df.apply(make_trade_content_hash, axis=1)
df["source"] = "ibkr"
```

### 2b. Trades: merge-or-insert logic

Replace `upsert_to_supabase` with:

```python
def merge_manual_trades(client, records):
    """
    For any incoming record whose content_hash already exists with source='manual',
    update that row with the IBKR trade_id and flip source to 'ibkr'.
    Return only records that need a fresh insert.
    """
    hashes = [r["content_hash"] for r in records]
    res = (
        client.table("trades")
        .select("trade_id, content_hash")
        .in_("content_hash", hashes)
        .eq("source", "manual")
        .execute()
    )
    manual_hashes = {row["content_hash"] for row in res.data}

    to_merge, to_insert = [], []
    for r in records:
        (to_merge if r["content_hash"] in manual_hashes else to_insert).append(r)

    for r in to_merge:
        client.table("trades").update({
            "trade_id":     r["trade_id"],
            "source":       "ibkr",
            "commission":   r.get("commission"),
            "realized_pnl": r.get("realized_pnl"),
            "proceeds":     r.get("proceeds"),
        }).eq("content_hash", r["content_hash"]).execute()

    return to_insert


def upsert_to_supabase(client, records):
    new_records = merge_manual_trades(client, records)
    if new_records:
        client.table("trades").upsert(sanitize_records(new_records), on_conflict="trade_id").execute()
```

### 2c. Cash: compute `content_hash` + `source` for every row

In `transform_cash` (after `exec_time` is parsed):

```python
def make_cash_content_hash(row):
    rate = row.get("rate") or 0
    key = f"{row['exec_time']}|{row['symbol']}|{row['quantity']}|{rate}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]

df["content_hash"] = df.apply(make_cash_content_hash, axis=1)
df["source"] = "ibkr"
```

### 2d. Cash: merge-or-insert logic

```python
def merge_manual_cash(client, records):
    hashes = [r["content_hash"] for r in records]
    res = (
        client.table("cash_transactions")
        .select("transaction_id, content_hash")
        .in_("content_hash", hashes)
        .eq("source", "manual")
        .execute()
    )
    manual_hashes = {row["content_hash"] for row in res.data}

    to_merge, to_insert = [], []
    for r in records:
        (to_merge if r["content_hash"] in manual_hashes else to_insert).append(r)

    for r in to_merge:
        client.table("cash_transactions").update({
            "transaction_id": r["transaction_id"],
            "source":         "ibkr",
            "commission":     r.get("commission"),
            "net_cash":       r.get("net_cash"),
            "rate":           r.get("rate"),
            "description":    r.get("description"),
        }).eq("content_hash", r["content_hash"]).execute()

    return to_insert


def upsert_cash_to_supabase(client, records):
    new_records = merge_manual_cash(client, records)
    if new_records:
        client.table("cash_transactions").upsert(sanitize_records(new_records), on_conflict="transaction_id").execute()
```

---

## Step 3 — `POST /api/v1/trades/manual`

File: `frontend/app/api/v1/trades/manual/route.ts`

**Request body:** array of trade objects

```ts
type ManualTradeInput = {
  exec_time:   string          // ISO8601 UTC — "2026-06-26T14:30:00Z"
  symbol:      string
  action:      "BUY" | "SELL"
  quantity:    number
  price:       number
  commission?: number
  currency?:   string          // default "USD"
}
```

**Logic:**
1. Validate all rows (required fields, action enum, positive numbers).
2. Per row: compute `content_hash = SHA256(exec_time|symbol|quantity|price)[:32]`.
3. Set `trade_id = content_hash`, `source = 'manual'`, `trade_date = date(exec_time)`.
4. Pre-check existing `content_hash` values and skip those already present (app-layer idempotency); insert the rest.
5. Return `{ inserted: number, skipped: number }`.

---

## Step 4 — `DELETE /api/v1/trades/[id]`

File: `frontend/app/api/v1/trades/[id]/route.ts`

**Logic:**
1. Fetch the row — read `source`.
2. Hard delete by `trade_id`.
3. Return `{ deleted: true, source: "ibkr" | "manual" }`.

Frontend uses `source` to decide whether to show the re-import warning.

---

## Step 5 — `POST /api/v1/cash/manual`

File: `frontend/app/api/v1/cash/manual/route.ts`

**Request body:** array of cash transaction objects

```ts
type ManualCashInput = {
  exec_time:    string         // ISO8601 UTC
  symbol:       string         // FX pair, e.g. "USD.ILS"
  quantity:     number
  rate?:        number         // FX rate; 0 if unknown
  net_cash?:    number
  action?:      "BUY" | "SELL"
  description?: string
  commission?:  number
  currency?:    string         // default "USD"
}
```

**Logic:**
1. Validate all rows (required: `exec_time`, `symbol`, `quantity`).
2. Per row: compute `content_hash = SHA256(exec_time|symbol|quantity|rate??0)[:32]`.
3. Set `transaction_id = "cash_" + content_hash`, `source = 'manual'`, `transaction_date = date(exec_time)`.
4. Pre-check existing `content_hash` values and skip those already present (app-layer idempotency); insert the rest.
5. Return `{ inserted: number, skipped: number }`.

---

## Step 6 — `DELETE /api/v1/cash/[id]`

File: `frontend/app/api/v1/cash/[id]/route.ts`

**Logic:**
1. Fetch the row — read `source`.
2. Hard delete by `transaction_id`.
3. Return `{ deleted: true, source: "ibkr" | "manual" }`.

---

## Step 7 — UI: Bulk Add Trades Sheet

Component: `frontend/components/trades/AddTradesSheet.tsx`

- Trigger: "Add trades" button on the Executions page.
- Side sheet with an editable row table.
- Columns: `exec_time` (datetime-local, with UTC conversion hint), `symbol`, `action` (BUY/SELL select), `quantity`, `price`, `commission` (optional).
- "Add row" appends a blank row. "✕" removes that row.
- "Save N trades" calls `POST /api/v1/trades/manual`.
- On success: toast showing `{ inserted, skipped }`, refresh executions table.
- **UTC note:** Accept local datetime, convert to UTC before submit. Show computed UTC timestamp inline so the user can cross-check against IBKR.

---

## Step 8 — UI: Delete Trades + Confirm

Changes to: executions table component

- Trash icon on each row (hover-visible).
- `source === 'manual'` → delete immediately, success toast.
- `source === 'ibkr'` → show confirm dialog first:

  > **IBKR-sourced trade**
  > This trade was imported from IBKR and will re-appear on the next daily sync. Delete anyway?
  > [Cancel] [Delete anyway]

- After delete: optimistic row removal or full refetch.

---

## Step 9 — UI: Bulk Add Cash Sheet

Component: `frontend/components/cash/AddCashSheet.tsx`

- Trigger: "Add cash transaction" button on the Cash page.
- Side sheet with an editable row table.
- Columns: `exec_time`, `symbol` (FX pair), `quantity`, `rate` (optional), `net_cash` (optional), `action` (optional), `description` (optional), `commission` (optional).
- Same "Add row" / "✕" / "Save N transactions" pattern as trades.
- Calls `POST /api/v1/cash/manual`.
- On success: toast + refresh cash table.

---

## Step 10 — UI: Delete Cash + Confirm

Changes to: cash transactions table component

- Same pattern as trades delete (steps 8).
- Confirm dialog copy:

  > **IBKR-sourced cash transaction**
  > This entry was imported from IBKR and will re-appear on the next daily sync. Delete anyway?
  > [Cancel] [Delete anyway]

---

## Schema Changes Summary

### `trades`

| Column | Type | Default | Notes |
|---|---|---|---|
| `source` | `TEXT NOT NULL` | `'ibkr'` | `'ibkr'` or `'manual'` |
| `content_hash` | `TEXT NOT NULL` (non-unique index) | — | `SHA256(exec_time\|symbol\|qty\|price)[:32]`; idempotency enforced at app layer (pre-check) |

### `cash_transactions`

| Column | Type | Default | Notes |
|---|---|---|---|
| `source` | `TEXT NOT NULL` | `'ibkr'` | `'ibkr'` or `'manual'` |
| `content_hash` | `TEXT NOT NULL` (non-unique index) | — | `SHA256(exec_time\|symbol\|qty\|rate??0)[:32]`; idempotency enforced at app layer (pre-check) |

---

## Dedup Guarantee

### Trades

| Scenario | Result |
|---|---|
| Manual entry, no CSV yet | Inserted with `source='manual'` |
| IBKR CSV arrives for same trade | `content_hash` match → MERGE: `trade_id` updated, `source='ibkr'` |
| IBKR CSV for a trade never manually entered | Normal insert, `source='ibkr'` |
| Manual entry submitted twice | Pre-check finds existing `content_hash` → skipped (idempotent) |
| IBKR CSV processed twice | `trade_id` conflict → existing upsert logic handles it |

### Cash Transactions

| Scenario | Result |
|---|---|
| Manual entry, no CSV yet | Inserted with `source='manual'` |
| IBKR CSV arrives for same cash row | `content_hash` match → MERGE: `transaction_id` updated, `source='ibkr'` |
| IBKR CSV for a cash row never manually entered | Normal insert, `source='ibkr'` |
| Manual entry submitted twice | Pre-check finds existing `content_hash` → skipped (idempotent) |
| IBKR CSV processed twice | `transaction_id` conflict → existing upsert logic handles it |

---

## Out of Scope (this phase)

- Editing an existing transaction
- Bulk delete
- Permanent suppression of IBKR rows (a "do not re-import" flag)
