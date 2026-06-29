-- Migration 005: interest_accruals table
--
-- Stores the IBKR Flex IACC section (BASE_SUMMARY): one row per day holding the
-- interest accrued that day plus any FX translation. This is a daily *snapshot*
-- of accrued (not-yet-posted) interest — a different grain from both
-- account_transactions (discrete posted cash events) and cash_transactions
-- (FX conversions), so it lives in its own table to avoid polluting their
-- per-category/-movement summaries and double-counting against the posted
-- "Broker Interest" CTRN rows.
--
-- Keyed on (account_id, to_date) via accrual_id so re-ingesting a report that
-- overlaps previous days is idempotent.
--
-- Safe to run on existing databases — additive only.

CREATE TABLE IF NOT EXISTS interest_accruals (
  id               BIGSERIAL    PRIMARY KEY,
  accrual_id       TEXT         NOT NULL UNIQUE,   -- "iacc_<account>_<to_date>"
  account_id       TEXT,
  scope            TEXT,                            -- "BASE_SUMMARY"
  from_date        DATE,
  to_date          DATE,
  interest_accrued NUMERIC,                         -- signed: accrued interest for the day
  fx_translation   NUMERIC,
  source           TEXT         NOT NULL DEFAULT 'ibkr',
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interest_accruals_to_date ON interest_accruals(to_date);
CREATE INDEX IF NOT EXISTS idx_interest_accruals_account ON interest_accruals(account_id);
