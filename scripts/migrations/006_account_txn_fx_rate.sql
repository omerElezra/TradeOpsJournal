-- Migration 006: account_transactions.fx_rate_to_base
--
-- The Interactive Flex CTRN section includes FXRateToBase — the rate to convert
-- the row's amount into the account base currency (USD). Storing it lets the UI
-- show a USD-equivalent for non-USD rows (e.g. ILS deposits) and normalize the
-- per-category summary across currencies.
--
-- Nullable: the older Flex template omits this field, so historical rows stay
-- NULL. Safe to run on existing databases — additive only.

ALTER TABLE account_transactions
  ADD COLUMN IF NOT EXISTS fx_rate_to_base NUMERIC;
