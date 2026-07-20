-- Migration 009: trade_context_enrichment table
-- Stores the CALCULATED context enrichment of a completed trade, separate from
-- the raw broker data in `trades`. Linked to grouped trades by (symbol, entry_time)
-- like trade_journal — no FK to trades. Recomputing a trade upserts the row.

CREATE TABLE IF NOT EXISTS trade_context_enrichment (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT        NOT NULL,
  entry_time      TIMESTAMPTZ NOT NULL,
  group_id        TEXT,
  schema_version  INTEGER     NOT NULL DEFAULT 1,
  -- Full TradeContextEnrichment object (basicResult, riskReward, stockContext,
  -- marketContext, tradeJourney, dataQuality) as camelCase JSON.
  enrichment      JSONB       NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT uq_trade_context_enrichment_trade UNIQUE (symbol, entry_time)
);

CREATE INDEX IF NOT EXISTS idx_trade_ctx_enrich_symbol     ON trade_context_enrichment(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_ctx_enrich_entry_time ON trade_context_enrichment(entry_time);
CREATE INDEX IF NOT EXISTS idx_trade_ctx_enrich_group_id   ON trade_context_enrichment(group_id);
