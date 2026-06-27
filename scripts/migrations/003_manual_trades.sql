-- Migration 003: Manual transactions + cross-path deduplication
--
-- Adds a `source` column ('ibkr' | 'manual') and a `content_hash` fingerprint
-- to both trades and cash_transactions. content_hash lets the IBKR ingest
-- pipeline detect a row that was already entered manually (same trade arriving
-- later from the CSV) and merge into it instead of creating a duplicate.
--
-- Safe to run on existing databases — additive only.

-- ── trades ───────────────────────────────────────────────────────────────────
ALTER TABLE trades ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'ibkr';
ALTER TABLE trades ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Backfill existing rows. This hash only needs to be internally unique for
-- legacy rows; going forward both ingest.py and the manual API compute it from
-- the same canonical formula.
UPDATE trades
SET content_hash = substring(
  encode(
    sha256(
      (exec_time::text || '|' || symbol || '|' || quantity::text || '|' || price::text)::bytea
    ),
    'hex'
  ) for 32
)
WHERE content_hash IS NULL;

ALTER TABLE trades ALTER COLUMN content_hash SET NOT NULL;
-- NOT unique: legitimate same-instant partial fills can share an identical
-- (exec_time, symbol, quantity, price) while having distinct IBKR TradeIDs.
-- This index is only a fast lookup for the merge step in ingest.py.
CREATE INDEX IF NOT EXISTS idx_trades_content_hash ON trades(content_hash);

-- ── cash_transactions ─────────────────────────────────────────────────────────
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS source       TEXT NOT NULL DEFAULT 'ibkr';
ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS content_hash TEXT;

UPDATE cash_transactions
SET content_hash = substring(
  encode(
    sha256(
      (exec_time::text || '|' || symbol || '|' || quantity::text || '|' || COALESCE(rate::text, '0'))::bytea
    ),
    'hex'
  ) for 32
)
WHERE content_hash IS NULL;

ALTER TABLE cash_transactions ALTER COLUMN content_hash SET NOT NULL;
-- NOT unique, same rationale as trades above.
CREATE INDEX IF NOT EXISTS idx_cash_transactions_content_hash ON cash_transactions(content_hash);
