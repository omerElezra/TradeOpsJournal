-- Migration 004: account_transactions table
--
-- Stores the IBKR Flex CTRN section — account-level cash transactions that are
-- NOT trades or FX conversions: dividends, withholding tax, broker interest
-- (paid/received), and deposits/withdrawals.
--
-- Kept separate from cash_transactions (which is FX-conversion-centric). Each
-- row carries the raw IBKR `type` plus a normalized `category` slug so the UI
-- can summarize per category. Keyed on the IBKR TransactionID for clean dedup.
--
-- Safe to run on existing databases — additive only.

CREATE TABLE IF NOT EXISTS account_transactions (
  id               BIGSERIAL    PRIMARY KEY,
  transaction_id   TEXT         NOT NULL UNIQUE,   -- "ctrn_<IBKR TransactionID>"
  account_id       TEXT,
  currency         TEXT,
  symbol           TEXT,                           -- nullable (deposits/interest have none)
  description      TEXT,
  transaction_date DATE,
  datetime         TIMESTAMPTZ,
  amount           NUMERIC,                         -- signed: +income / -outflow
  type             TEXT,                            -- raw IBKR Type
  category         TEXT,                            -- normalized slug (dividend, interest_paid, ...)
  source           TEXT         NOT NULL DEFAULT 'ibkr',
  content_hash     TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_txns_category ON account_transactions(category);
CREATE INDEX IF NOT EXISTS idx_account_txns_datetime ON account_transactions(datetime);
CREATE INDEX IF NOT EXISTS idx_account_txns_currency ON account_transactions(currency);
