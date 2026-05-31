-- Migration 001: trade_journal table
-- Links to grouped trades by (symbol, entry_time) — no FK to trades table.
-- Safe to apply on an existing database with no impact on ingestion.

CREATE TABLE IF NOT EXISTS trade_journal (
  id          BIGSERIAL PRIMARY KEY,
  symbol      TEXT        NOT NULL,
  entry_time  TIMESTAMPTZ NOT NULL,
  setup       TEXT,
  psych_tags  TEXT[]      DEFAULT '{}',
  notes       TEXT        DEFAULT '',
  planned_stop   NUMERIC,
  planned_target NUMERIC,
  risk_amount    NUMERIC,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_trade_journal_trade UNIQUE (symbol, entry_time)
);

CREATE INDEX IF NOT EXISTS idx_trade_journal_symbol     ON trade_journal(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_journal_entry_time ON trade_journal(entry_time);
