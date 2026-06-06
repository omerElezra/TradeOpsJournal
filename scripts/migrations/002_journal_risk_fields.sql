-- Migration 002: Add risk/reward fields to trade_journal
-- Safe to run on existing databases — columns are added only if they don't exist.

ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS planned_stop   NUMERIC;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS planned_target NUMERIC;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS risk_amount    NUMERIC;
