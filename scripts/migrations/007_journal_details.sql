-- Migration 007: detailed journaling fields on trade_journal
-- Pre-entry checklist, planning conviction, execution reasons, review scores,
-- and AI-coaching storage. Existing columns are reused where they overlap:
--   setup          -> technical setup (VCP, Breakout, ...)
--   planned_stop   -> planned stop loss
--   planned_target -> planned take profit
--   psych_tags     -> emotions tags
--   notes          -> user notes
-- Safe to run on existing databases — columns are added only if they don't exist.

-- Pre-entry checklist
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS candle_pattern   TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS recent_trend     TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS volume_vs_trend  TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS ma_relation      TEXT[] DEFAULT '{}';
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS open_gaps        TEXT[] DEFAULT '{}';
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS support_res_fib  TEXT[] DEFAULT '{}';

-- Planning
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS conviction_level INTEGER
  CHECK (conviction_level BETWEEN 1 AND 10);

-- Execution & psychology
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS entry_reason     TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS exit_reason      TEXT;

-- Review
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS trade_score      INTEGER
  CHECK (trade_score BETWEEN 1 AND 10);
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS mistakes_tags    TEXT[] DEFAULT '{}';

-- AI coaching
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS ai_coaching_question TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS ai_conversation      JSONB;
